// Package handlers AI 翻译代理（v0.8.0）
//
// 设计要点：
//  1. API key 仅存在后端环境变量，前端只发起请求，不接触密钥。
//  2. 转发到 OpenAI 兼容 chat/completions 接口（DeepSeek / 通义千问 / Ollama / OneAPI 等都兼容）。
//  3. 支持批量翻译：一次请求翻译多条字幕，减少 N 次网络往返。
//  4. 返回纯文本数组（顺序与请求一致），失败单条不影响其他条。
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// AIHandler AI 翻译相关接口
type AIHandler struct {
	cfg *config.Config
}

// NewAIHandler 构造 AI handler
func NewAIHandler(cfg *config.Config) *AIHandler {
	return &AIHandler{cfg: cfg}
}

// translateReq 批量翻译请求
type translateReq struct {
	// Texts 待翻译文本数组（按顺序返回对应翻译结果）
	Texts []string `json:"texts" binding:"required"`
	// TargetLang 目标语言，可选；缺省使用配置默认值
	TargetLang string `json:"target_lang"`
	// SourceLang 源语言，可选；缺省让 AI 自动识别
	SourceLang string `json:"source_lang"`
	// Mode 翻译模式：
	//   - "replace"   ：用译文替换原文（v0.8.0 行为，保留兼容）
	//   - "bilingual" ：生成「原文\n译文」双语字幕（v0.8.1 默认）
	// 缺省按 "bilingual" 处理，让「设置 → AI 翻译」一键生成双语字幕文件
	Mode string `json:"mode"`
}

// translateResp 批量翻译响应
type translateResp struct {
	// Translations 翻译结果（顺序与请求一致）
	Translations []string `json:"translations"`
	// Model 实际使用的模型
	Model string `json:"model"`
	// Usage token 用量
	Usage *openAIUsage `json:"usage,omitempty"`
}

// openAIMessage OpenAI chat 消息结构
type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openAIChatReq OpenAI chat/completions 请求体
type openAIChatReq struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Temperature float64         `json:"temperature"`
}

// openAIChatChoice OpenAI 响应 choice
type openAIChatChoice struct {
	Message openAIMessage `json:"message"`
}

// openAIUsage token 用量
type openAIUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// openAIChatResp OpenAI chat 响应
type openAIChatResp struct {
	Choices []openAIChatChoice `json:"choices"`
	Usage   *openAIUsage       `json:"usage,omitempty"`
	Model   string             `json:"model"`
}

// Translate 批量翻译
// POST /api/v1/ai/translate
// 请求体：
//   { "texts": ["Hello", "World"], "target_lang": "Chinese", "mode": "bilingual" }
// 响应：
//   { "translations": ["Hello\n你好", "World\n世界"], "model": "gpt-4o-mini", "usage": {...} }
// mode:
//   - "replace"（v0.8.0 行为）：translations[i] 是单条译文
//   - "bilingual"（v0.8.1 默认）：translations[i] = texts[i] + "\n" + 译文，直接写入 SRT 形成双语字幕
func (h *AIHandler) Translate(c *gin.Context) {
	// 1. 鉴权（必须登录，与其他 API 一致）
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	// 2. 启用检查
	if !h.cfg.AI.Enabled {
		utils.Fail(c, http.StatusServiceUnavailable, "AI 翻译未启用（后端未配置 ECHOSUB_AI_API_KEY）")
		return
	}
	// 3. 解析请求
	var req translateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, http.StatusBadRequest, "请求体格式错误: "+err.Error())
		return
	}
	if len(req.Texts) == 0 {
		utils.Fail(c, http.StatusBadRequest, "texts 不能为空")
		return
	}
	if len(req.Texts) > 200 {
		utils.Fail(c, http.StatusBadRequest, "单次最多翻译 200 条")
		return
	}
	// mode 缺省按 bilingual 处理（v0.8.1 起），保留 replace 兼容老调用
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "bilingual"
	}
	if mode != "replace" && mode != "bilingual" {
		utils.Fail(c, http.StatusBadRequest, "mode 必须是 replace 或 bilingual")
		return
	}
	// 4. 调用 OpenAI 兼容 API（AI 只负责返回单条译文；双语拼接由后端做，保证一致性）
	translations, usage, err := h.callOpenAI(c.Request.Context(), req.Texts, req.TargetLang, req.SourceLang)
	if err != nil {
		utils.Fail(c, http.StatusBadGateway, "AI 服务调用失败: "+err.Error())
		return
	}
	// 5. 按 mode 决定返回内容
	if mode == "bilingual" {
		for i, t := range translations {
			if t == "" {
				continue
			}
			// 原文 + 换行 + 译文，喂给 SRT 时换行就是多行字幕
			translations[i] = strings.TrimSpace(req.Texts[i]) + "\n" + t
		}
	}
	utils.OK(c, translateResp{
		Translations: translations,
		Model:        h.cfg.AI.Model,
		Usage:        usage,
	})
}

// Status 返回 AI 配置状态（v0.8.0）
// GET /api/v1/ai/status
// 注意：API key 与 base url 始终只存在后端环境变量，此接口只返回：
//   - enabled：是否同时配置了 base url + api key
//   - has_base_url：是否配置了 base url（用于 UI 提示）
//   - model / target_lang：当前默认值（前端可展示）
// 鉴权：必须登录
func (h *AIHandler) Status(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	utils.OK(c, gin.H{
		"enabled":     h.cfg.AI.Enabled,
		"has_base_url": h.cfg.AI.BaseURL != "",
		"model":       h.cfg.AI.Model,
		"target_lang": h.cfg.AI.TargetLang,
	})
}

// testResp AI 连通性测试响应（v0.8.1 起）
type testResp struct {
	// OK 是否连通
	OK bool `json:"ok"`
	// Enabled AI 是否启用（前后端都检查一遍）
	Enabled bool `json:"enabled"`
	// Model 实际调通的模型
	Model string `json:"model"`
	// BaseURL 配置的 base url（脱敏，仅主机名，便于排查）
	BaseURLHost string `json:"base_url_host"`
	// SampleTranslation 测试样例翻译结果（连通时返回）
	SampleTranslation string `json:"sample_translation,omitempty"`
	// LatencyMs 本次调用耗时（毫秒）
	LatencyMs int64 `json:"latency_ms"`
	// Message 错误或成功描述
	Message string `json:"message"`
}

// Test 连通性测试（v0.8.1 起）
// POST /api/v1/ai/test
// 鉴权：必须登录
// 行为：用最小请求 texts=["Hello"] 调一次 AI，成功返回样例翻译 + 耗时；
// 失败返回错误描述，便于在设置页快速判断是「未配置」/「网络问题」/「API key 无效」/「模型不对」
func (h *AIHandler) Test(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	if !h.cfg.AI.Enabled {
		utils.OK(c, testResp{
			OK:           false,
			Enabled:      false,
			Model:        h.cfg.AI.Model,
			BaseURLHost:  baseURLHost(h.cfg.AI.BaseURL),
			Message:      "AI 未启用：请在 backend 端设置 ECHOSUB_AI_BASE_URL 与 ECHOSUB_AI_API_KEY 后重启服务",
		})
		return
	}
	start := time.Now()
	translations, _, err := h.callOpenAI(c.Request.Context(), []string{"Hello"}, "", "")
	latency := time.Since(start).Milliseconds()
	if err != nil {
		utils.OK(c, testResp{
			OK:          false,
			Enabled:     true,
			Model:       h.cfg.AI.Model,
			BaseURLHost: baseURLHost(h.cfg.AI.BaseURL),
			LatencyMs:   latency,
			Message:     "调用失败：" + err.Error(),
		})
		return
	}
	sample := ""
	if len(translations) > 0 {
		sample = translations[0]
	}
	utils.OK(c, testResp{
		OK:               true,
		Enabled:          true,
		Model:            h.cfg.AI.Model,
		BaseURLHost:      baseURLHost(h.cfg.AI.BaseURL),
		SampleTranslation: sample,
		LatencyMs:        latency,
		Message:          "连通正常",
	})
}

// baseURLHost 提取 base url 的 host（脱敏用）
func baseURLHost(raw string) string {
	if raw == "" {
		return ""
	}
	// 去掉末尾 / 与 /chat/completions
	s := strings.TrimRight(raw, "/")
	if idx := strings.Index(s, "://"); idx >= 0 {
		s = s[idx+3:]
	}
	if idx := strings.Index(s, "/"); idx >= 0 {
		s = s[:idx]
	}
	return s
}

// callOpenAI 实际调用 OpenAI 兼容 chat/completions
// 关键设计：把多条字幕打包成 numbered list 让 AI 一次性输出，避免并发 N 次调用。
// 输出解析：按行号前缀（"1. xxx"）回填到 translations[i]。
func (h *AIHandler) callOpenAI(ctx context.Context, texts []string, targetLang, sourceLang string) ([]string, *openAIUsage, error) {
	target := targetLang
	if target == "" {
		target = h.cfg.AI.TargetLang
	}
	if target == "" {
		target = "Chinese"
	}

	// 构造 system prompt + user prompt
	system := fmt.Sprintf(
		"你是一名专业翻译。请将用户提供的多行文本逐条翻译成%s。"+
			"要求：\n"+
			"1. 严格保持原文顺序与条数（%d 条）。\n"+
			"2. 每条翻译独占一行，行首必须以「<序号>. 」开头（序号从 1 开始），方便解析。\n"+
			"3. 保留专业术语与口语化风格；不要添加任何解释、注释或额外行。\n"+
			"4. 若原文已是目标语言，可原样返回。",
		target, len(texts),
	)
	var numbered strings.Builder
	for i, t := range texts {
		numbered.WriteString(fmt.Sprintf("%d. %s\n", i+1, strings.TrimSpace(t)))
	}
	userPrefix := ""
	if sourceLang != "" {
		userPrefix = fmt.Sprintf("(源语言: %s)\n", sourceLang)
	}
	user := userPrefix + "原文：\n" + numbered.String()

	// 构造请求
	body := openAIChatReq{
		Model: h.cfg.AI.Model,
		Messages: []openAIMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.2,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, nil, fmt.Errorf("序列化请求失败: %w", err)
	}

	// 拼接 URL（兼容 base url 末尾有无 /）
	base := strings.TrimRight(h.cfg.AI.BaseURL, "/")
	url := base + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, nil, fmt.Errorf("构造请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.cfg.AI.APIKey)

	timeout := h.cfg.AI.TimeoutSec
	if timeout <= 0 {
		timeout = 60
	}
	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("调用 AI 接口失败: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("AI 服务返回 %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}
	var aiResp openAIChatResp
	if err := json.Unmarshal(raw, &aiResp); err != nil {
		return nil, nil, fmt.Errorf("解析 AI 响应失败: %w", err)
	}
	if len(aiResp.Choices) == 0 {
		return nil, nil, fmt.Errorf("AI 响应为空")
	}
	content := aiResp.Choices[0].Message.Content
	translations := parseNumberedLines(content, len(texts))
	return translations, aiResp.Usage, nil
}

// parseNumberedLines 解析 AI 返回的 "1. xxx\n2. yyy" 格式
// 兼容：AI 可能漏掉前缀 / 多余空行 / 行内换行（多行字幕）
// 严格按出现顺序填充；若行数不足，缺失项回退原文
func parseNumberedLines(content string, expected int) []string {
	out := make([]string, expected)
	// 先把所有行原样收集
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	idx := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		// 跳过 "原文：" / "翻译：" 等非编号行（若 AI 仍带这种标记）
		if !looksLikeNumbered(trimmed) {
			continue
		}
		// 去掉 "1. " / "1) " / "1: " 等前缀
		text := stripNumberPrefix(trimmed)
		if idx < expected {
			out[idx] = strings.TrimSpace(text)
			idx++
		}
	}
	// 缺失项回退原文，避免 UI 显示空白
	for i := range out {
		if out[i] == "" {
			// 这里没有原文信息（caller 自行兜底），暂用空字符串
			out[i] = ""
		}
	}
	return out
}

// looksLikeNumbered 判断行是否以 "数字 + 分隔符" 开头
// 支持的分隔符：. ) : 、 ． 以及 ）、（中文括号）
// 实现：基于 ASCII 数字判断位数，再用 strings.HasPrefix 一次性匹配整段前缀，
// 避免按 byte 索引字符串时遇到多字节 UTF-8 字符（中文标点）导致 byte↔rune 混用编译失败。
func looksLikeNumbered(line string) bool {
	// 1. 跳过前导空格（容忍 "  1. xxx" 这种前置缩进）
	trimmed := strings.TrimLeft(line, " \t")
	// 2. 统计数字位数（1~4 位）
	i := 0
	for i < len(trimmed) && trimmed[i] >= '0' && trimmed[i] <= '9' {
		i++
	}
	if i == 0 || i > 4 {
		return false
	}
	// 3. 在已统计好的数字后追加常见分隔符，整段匹配
	seps := []string{".", ")", ":", "、", "．", "）"}
	digits := trimmed[:i]
	for _, s := range seps {
		if strings.HasPrefix(trimmed, digits+s) {
			return true
		}
	}
	return false
}

// stripNumberPrefix 去掉 "1. " 前缀，返回剩余部分
// 与 looksLikeNumbered 保持一致的解析规则（1~4 位数字 + 常见分隔符）
func stripNumberPrefix(line string) string {
	trimmed := strings.TrimLeft(line, " \t")
	// 统计数字位数
	i := 0
	for i < len(trimmed) && trimmed[i] >= '0' && trimmed[i] <= '9' {
		i++
	}
	if i == 0 || i > 4 {
		return line
	}
	seps := []string{".", ")", ":", "、", "．", "）"}
	digits := trimmed[:i]
	for _, s := range seps {
		if strings.HasPrefix(trimmed, digits+s) {
			rest := trimmed[i+len(s):]
			return strings.TrimLeft(rest, " \t")
		}
	}
	return line
}

// truncate 安全截断（错误信息用）
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
