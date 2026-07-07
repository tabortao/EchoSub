// 网页词典抓取（v1.3.0 起，v1.3.1 重构，v1.3.2 增强按域名分流 + 翻译型源，v1.3.3 移除 Cambridge/Merriam-Webster，v1.3.4 移除 Collins/百度/谷歌 + 新增微软翻译）
//
// 目的：让 youdao / Oxford / Longman / Wiktionary 4 个网页词典 + 微软翻译 Edge API
// 也能在弹窗中渲染结果，而不是 window.open 跳新标签页。
//
// 路由：
//
//	GET /api/v1/dictionary/web/lookup?source=youdao&word=hello
//
// 源类型（v1.3.2 起）：
//   - kind="html"     抓取目标 URL 的 HTML → 通用清洗（去噪+XSS）→ 弹窗内渲染
//     youdao / oxford / longman / wiktionary 走这条路径
//   - kind="translate"  调用公开翻译 API（无 key）→ 返回结构化 JSON
//     microsoft 走 Edge 翻译 API（无需 key，国内需代理）
//
// v1.3.1 重大改进：
//   - 支持代理（v1.3.0 在国内网络下大量 timeout / 403，本版本修复）
//   - 抓取走 utils.NewHTTPClient：自定义 > 环境变量 HTTPS_PROXY/HTTP_PROXY > 直连
//   - 超时可配（默认 15s，从 6s 提升）
//   - 失败时 1 次重试（仅对 timeout / 网络错误）
//   - 内存缓存 60 分钟（同一 source+word 不重复抓取）
//   - 失败时 blocked=true 让前端展示「在新窗口打开」链接，不让用户卡住
//
// v1.3.2 重大改进：
//   - 按域名分流代理（SkipProxyHosts / OnlyProxyHosts）
//   - 新增「翻译型」源：百度翻译 / 谷歌翻译（公开 API，无需 key）
//   - 每个源独立配置 User-Agent / Referer / Accept-Language
//
// v1.3.3 调整：
//   - 移除 Cambridge、Merriam-Webster（长期被反爬）
//
// v1.3.4 调整（重大）：
//   - 移除 Collins（v1.3.4）/ 百度翻译（dict.baidu.com/suggest 也被风控）/ 谷歌翻译（i/o timeout）
//   - 新增「微软翻译」：Edge 翻译 API（edge.microsoft.com/translate/auth 拿 token + api-edge.cognitive.microsofttranslator.com）
//   - 源标记 ForceProxy=true 国内必须走代理
//   - 参考实现：docs/Reference/STranslate.Plugin.Translate.GoogleWebsite（看 Main.cs）
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// 源类型常量
const (
	kindHTML      = "html"      // 抓取 HTML 清洗后渲染
	kindTranslate = "translate" // 调用翻译 API 返回结构化结果
)

// translatePayload 翻译型源响应（v1.3.2 起）
type translatePayload struct {
	Word        string `json:"word"`
	Translation string `json:"translation"`
	SourceLang  string `json:"source_lang,omitempty"`
	TargetLang  string `json:"target_lang,omitempty"`
	Phonetic    string `json:"phonetic,omitempty"`
	ExtraHTML   string `json:"extra_html,omitempty"`
}

// 网页词典源（统一注册表）
// 字段说明：
//   - ID / DisplayName：前端展示用
//   - Kind：html / translate 决定走哪条抓取路径
//   - UserAgent / Referer / AcceptLanguage：抓取时模拟浏览器
//   - SkipProxy：源级强制不走代理（即便全局要求走代理）
//   - ForceProxy：源级强制走代理（即便默认 SkipProxyHosts 命中该 host，v1.3.4 新增）
//   - BuildURL：kind=html 用，构造目标 URL
//   - FetchTranslate：kind=translate 用，调用公开翻译 API
type webDictSource struct {
	ID             string
	DisplayName    string
	Kind           string
	UserAgent      string
	Referer        string
	AcceptLanguage string
	SkipProxy      bool
	ForceProxy     bool
	BuildURL       func(word string) string
	FetchTranslate func(ctx context.Context, client *http.Client, word string) (*translatePayload, error)
}

func youdaoURL(w string) string {
	return "https://m.youdao.com/dict?le=eng&q=" + w
}

// v1.3.3 移除 cambridgeURL / v1.3.4 移除 merriamWebsterURL / collinsURL
func oxfordURL(w string) string {
	return "https://www.oxfordlearnersdictionaries.com/definition/english/" + w
}
func longmanURL(w string) string {
	return "https://www.ldoceonline.com/dictionary/" + w
}
func wiktionaryURL(w string) string {
	return "https://en.m.wiktionary.org/wiki/" + w
}

// ---------------- 公共常量（User-Agent / Referer） ----------------

const (
	uaDesktopChrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	uaYoudaoMobile  = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
	uaEdgeBrowser   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
)

// ---------------- 源注册表 ----------------
//
// v1.3.4 最终保留 5 个源：youdao / oxford / longman / wiktionary / microsoft

var kWebDictSources = map[string]webDictSource{
	"youdao": {
		ID: "youdao", DisplayName: "有道词典", Kind: kindHTML,
		UserAgent: uaYoudaoMobile, AcceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
		// v1.3.5：移除 SkipProxy=true。
		//   v1.3.2 时为了「中文站开代理反而被风控」加了硬编码直连，
		//   但用户实测有道在国内偶发 TLS handshake timeout（直连被墙/限速），
		//   走代理反而更稳。改为「默认按域名分流」：用户配了 ECHOSUB_WEBDICT_PROXY
		//   就走代理，没配仍走默认（youdao.com 已从默认 SkipProxyHosts 移除）。
		SkipProxy: false,
		BuildURL:  youdaoURL,
	},
	"oxford": {
		ID: "oxford", DisplayName: "Oxford", Kind: kindHTML,
		UserAgent: uaDesktopChrome, Referer: "https://www.google.com/",
		AcceptLanguage: "en-US,en;q=0.9",
		BuildURL:       oxfordURL,
	},
	"longman": {
		ID: "longman", DisplayName: "Longman", Kind: kindHTML,
		UserAgent: uaDesktopChrome, Referer: "https://www.google.com/",
		AcceptLanguage: "en-US,en;q=0.9",
		BuildURL:       longmanURL,
	},
	"wiktionary": {
		ID: "wiktionary", DisplayName: "Wiktionary", Kind: kindHTML,
		UserAgent: uaDesktopChrome, AcceptLanguage: "en-US,en;q=0.9",
		BuildURL: wiktionaryURL,
	},
	"microsoft": {
		ID: "microsoft", DisplayName: "微软翻译", Kind: kindTranslate,
		// v1.3.4：Edge 翻译 API 国内必须走代理
		ForceProxy: true,
		BuildURL: func(w string) string {
			// v1.3.5 修正：from=auto 改为 from=en（Edge Translator 不支持 auto）
			return "https://www.bing.com/translator/?text=" + w + "&from=en&to=zh-Hans"
		},
		FetchTranslate: fetchMicrosoftTranslate,
	},
}

// LookupWebDict 抓取并清洗网页词典释义
// GET /api/v1/dictionary/web/lookup?source=youdao&word=hello
//
// v1.3.1 起支持代理（ECHOSUB_WEBDICT_PROXY）+ 重试 + 内存缓存。
// v1.3.2 起分两路径：kind=html 走 HTML 抓取，kind=translate 走公开翻译 API。
// v1.3.4 起翻译型源（microsoft）走 Edge 翻译 API，国内需代理。
func LookupWebDict() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		if uid == 0 {
			utils.Fail(c, http.StatusUnauthorized, "未登录")
			return
		}
		source := strings.ToLower(strings.TrimSpace(c.Query("source")))
		word := strings.TrimSpace(c.Query("word"))
		if source == "" || word == "" {
			utils.Fail(c, http.StatusBadRequest, "source / word 不能为空")
			return
		}
		src, ok := kWebDictSources[source]
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "未支持的网页词典: "+source)
			return
		}

		// 词条长度限制
		if len(word) > 128 {
			utils.Fail(c, http.StatusBadRequest, "word 过长")
			return
		}

		cfg := getWebDictCfg(c)
		cacheKey := source + "|" + strings.ToLower(word)

		// v1.3.2：分两路径
		if src.Kind == kindTranslate {
			handleTranslate(c, cfg, src, word, cacheKey)
			return
		}
		handleHTMLScrape(c, cfg, src, word, cacheKey)
	}
}

// handleHTMLScrape 处理 kind=html 源（v1.3.2 起）
func handleHTMLScrape(c *gin.Context, cfg *config.Config, src webDictSource, word, cacheKey string) {
	targetURL := src.BuildURL(url.QueryEscape(word))

	// 查缓存
	if cached, ok := webDictCacheGet(cacheKey); ok {
		cached["url"] = targetURL
		cached["cached"] = true
		utils.OK(c, cached)
		return
	}

	// HTTP 抓取（含重试）
	htmlRaw, finalURL, err := fetchWebDictHTML(cfg, targetURL)

	// v1.3.5 修复：Oxford Learner 词典对复数形式（如 eggs）直接 404（站点本身只收录单数/原形）。
	//   抓取后若拿到 HTTP 404 且单词以 s 结尾，剥 s 重试 1 次。
	if err != nil && src.ID == "oxford" && isHTTPNotFound(err) && strings.HasSuffix(strings.ToLower(word), "s") && len(word) > 1 {
		singular := word[:len(word)-1]
		retryURL := src.BuildURL(url.QueryEscape(singular))
		htmlRaw, finalURL, err = fetchWebDictHTML(cfg, retryURL)
		if err == nil {
			// 命中单数形式，url 改为单数版以便前端「在新窗口打开」也是单数
			targetURL = retryURL
		}
	}

	if err != nil {
		result := gin.H{
			"source":      src.ID,
			"source_name": src.DisplayName,
			"word":        word,
			"url":         targetURL,
			"final_url":   finalURL,
			"html":        "",
			"blocked":     true,
			"cached":      false,
			"error":       err.Error(),
		}
		webDictCachePut(cacheKey, result, 5*time.Minute)
		utils.OK(c, result)
		return
	}

	// 清洗
	cleanHTML, cleanErr := sanitizeWebDictHTML(htmlRaw, finalURL)
	result := gin.H{
		"source":      src.ID,
		"source_name": src.DisplayName,
		"word":        word,
		"url":         targetURL,
		"final_url":   finalURL,
		"html":        cleanHTML,
		"blocked":     false,
		"cached":      false,
		"error":       cleanErr,
	}
	ttl := time.Duration(cfg.WebDict.CacheMinutes) * time.Minute
	if ttl > 0 {
		webDictCachePut(cacheKey, result, ttl)
	}
	utils.OK(c, result)
}

// isHTTPNotFound 判断 error 是否是 HTTP 404（v1.3.5 新增）
func isHTTPNotFound(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "HTTP 404")
}

// handleTranslate 处理 kind=translate 源（v1.3.2 起，v1.3.4 改用微软 Edge API）
func handleTranslate(c *gin.Context, cfg *config.Config, src webDictSource, word, cacheKey string) {
	targetURL := src.BuildURL(url.QueryEscape(word))

	// 查缓存（翻译型 5 分钟，因为 token 会变）
	if cached, ok := webDictCacheGet(cacheKey); ok {
		cached["url"] = targetURL
		cached["cached"] = true
		utils.OK(c, cached)
		return
	}

	// 按域名分流：构造 http.Client
	proxyCfg := makeProxyForSource(cfg, src)
	client := utils.NewHTTPClient(time.Duration(cfg.WebDict.TimeoutSec)*time.Second, proxyCfg)
	if src.UserAgent != "" {
		// 源级 UserAgent 由 FetchTranslate 函数自己设（通常要复用 client 内的 transport）
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(),
		time.Duration(cfg.WebDict.TimeoutSec)*time.Second)
	defer cancel()

	payload, err := src.FetchTranslate(ctx, client, word)
	if err != nil {
		result := gin.H{
			"source":      src.ID,
			"source_name": src.DisplayName,
			"word":        word,
			"url":         targetURL,
			"kind":        kindTranslate,
			"translation": "",
			"blocked":     true,
			"cached":      false,
			"error":       err.Error(),
		}
		// 翻译型源失败缓存 2 分钟（避免重复触发）
		webDictCachePut(cacheKey, result, 2*time.Minute)
		utils.OK(c, result)
		return
	}

	result := gin.H{
		"source":      src.ID,
		"source_name": src.DisplayName,
		"word":        word,
		"url":         targetURL,
		"kind":        kindTranslate,
		"translation": payload.Translation,
		"source_lang": payload.SourceLang,
		"target_lang": payload.TargetLang,
		"phonetic":    payload.Phonetic,
		"html":        payload.ExtraHTML,
		"blocked":     false,
		"cached":      false,
		"error":       "",
	}
	// 翻译型源缓存 5 分钟
	webDictCachePut(cacheKey, result, 5*time.Minute)
	utils.OK(c, result)
}

// makeProxyForSource 为某个源构造合适的 ProxyConfig
//   - SkipProxy=true → 返回 nil（直连）
//   - ForceProxy=true → 只读 cfg.WebDict.CustomProxy，忽略 SkipProxyHosts / OnlyProxyHosts
//   - 默认 → 合并 cfg.WebDict.SkipProxyHosts / OnlyProxyHosts
func makeProxyForSource(cfg *config.Config, src webDictSource) *utils.ProxyConfig {
	if src.SkipProxy {
		return nil
	}
	p := &utils.ProxyConfig{
		CustomProxy: cfg.WebDict.Proxy,
	}
	if !src.ForceProxy {
		p.SkipProxyHosts = cfg.WebDict.SkipProxyHosts
		p.OnlyProxyHosts = cfg.WebDict.OnlyProxyHosts
	}
	return p
}

// htmlEscape 最小的 HTML 转义（避免 bluemonday 全量处理开销）
func htmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
	)
	return r.Replace(s)
}

// getWebDictCfg 从 gin context 取 *config.Config
// router 启动时通过 handlers.SetGlobalConfig 注入；缺省时退到 Default()（仅用于单元测试）
//
// v1.3.6：参数 c 当前未使用（保留 gin handler 助手函数签名一致性）；
// 改名 _ 让 IDE 静态分析满意。
func getWebDictCfg(_ *gin.Context) *config.Config {
	if cfg := GetGlobalConfig(); cfg != nil {
		return cfg
	}
	return config.Default()
}

// ====================== v1.3.1 内存缓存 ======================
//
// 缓存粒度：source + word（不区分大小写）
// 大小上限：512 条（LRU 简化：超过直接清空一半）
// 失败结果单独 ttl（5 分钟），避免一个 timeout 把整个弹窗卡住
type webDictCacheEntry struct {
	data     gin.H
	expireAt time.Time
}

var (
	webDictCacheMu  sync.RWMutex
	webDictCache    = make(map[string]webDictCacheEntry)
	webDictCacheMax = 512
)

// webDictCacheGet 读取缓存（命中且未过期）
func webDictCacheGet(key string) (gin.H, bool) {
	webDictCacheMu.RLock()
	defer webDictCacheMu.RUnlock()
	e, ok := webDictCache[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(e.expireAt) {
		return nil, false
	}
	return e.data, true
}

// webDictCachePut 写入缓存（带 ttl）+ LRU 简化版（超容清半）
func webDictCachePut(key string, data gin.H, ttl time.Duration) {
	webDictCacheMu.Lock()
	defer webDictCacheMu.Unlock()
	webDictCache[key] = webDictCacheEntry{
		data:     data,
		expireAt: time.Now().Add(ttl),
	}
	// 超容清理：直接清空缓存（词典站点 7 个 × 数十词 = 几百条，超过再清）
	if len(webDictCache) > webDictCacheMax {
		// 简单策略：清空一半
		count := 0
		for k := range webDictCache {
			if count > webDictCacheMax/2 {
				break
			}
			delete(webDictCache, k)
			count++
		}
	}
}

// ====================== v1.3.1 HTTP 抓取（含代理 + 重试）======================

// fetchWebDictHTML 用 net/http 抓取目标 URL 的 HTML
//
// v1.3.1 起：
//   - 走 utils.NewHTTPClient：自定义代理 > HTTPS_PROXY/HTTP_PROXY > 直连
//   - 超时按 cfg.WebDict.TimeoutSec（默认 15s）
//   - 失败时按 cfg.WebDict.Retries（默认 1 次）重试，仅对 timeout / 网络错误重试
//
// 返回 (rawHTML, finalURL, error)：
//   - 4xx/5xx → 错误（弹窗提示「页面受限」）
//   - 重定向最终落地 URL 用于后续相对路径解析
//   - 响应体按 cfg.WebDict.MaxBytes（默认 1 MiB）截断
func fetchWebDictHTML(cfg *config.Config, targetURL string) (string, string, error) {
	timeout := time.Duration(cfg.WebDict.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	maxBytes := cfg.WebDict.MaxBytes
	if maxBytes <= 0 {
		maxBytes = 1 * 1024 * 1024
	}
	retries := cfg.WebDict.Retries
	// v1.3.6：使用 Go 1.21+ 内置 max 简化
	retries = max(retries, 0)
	proxy := &utils.ProxyConfig{CustomProxy: cfg.WebDict.Proxy}
	client := utils.NewHTTPClient(timeout, proxy)

	var lastErr error
	for attempt := 0; attempt <= retries; attempt++ {
		if attempt > 0 {
			// 失败重试前 sleep 一小段时间（指数退避：0.5s / 1s / 2s ...）
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}
		rawHTML, finalURL, err := doFetch(client, targetURL, maxBytes)
		if err == nil {
			return rawHTML, finalURL, nil
		}
		lastErr = err
		// 仅对可重试错误重试（timeout / 网络错误）
		if !isRetryableError(err) {
			break
		}
	}
	return "", targetURL, lastErr
}

// doFetch 单次抓取（不重试）
func doFetch(client *http.Client, targetURL string, maxBytes int64) (string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), client.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return "", targetURL, fmt.Errorf("构造请求失败: %w", err)
	}
	// 模拟真实浏览器请求头
	// （v1.3.0 仅 UA + Accept + Accept-Language；v1.3.1 补充 Sec-Fetch-* 系列，
	//   进一步减少被反爬识别的概率）
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "+
		"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	resp, err := client.Do(req)
	if err != nil {
		return "", targetURL, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", resp.Request.URL.String(),
			fmt.Errorf("HTTP %d：%s（部分词典对抓取有限制，可点击下方「在新窗口打开」手动查看）",
				resp.StatusCode, http.StatusText(resp.StatusCode))
	}

	// 处理 gzip/deflate/br 压缩
	body, err := decodeResponseBody(resp)
	if err != nil {
		return "", resp.Request.URL.String(), fmt.Errorf("解压响应失败: %w", err)
	}
	limited := io.LimitReader(body, maxBytes)
	buf := &bytes.Buffer{}
	if _, err := io.Copy(buf, limited); err != nil {
		return "", resp.Request.URL.String(), fmt.Errorf("读取响应失败: %w", err)
	}
	return buf.String(), resp.Request.URL.String(), nil
}

// isRetryableError 是否值得重试
// v1.3.1 起：timeout / EOF / connection reset / DNS / 「no route to host」 重试
// 4xx/5xx 不重试（重试也没用）
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	// context deadline exceeded（超时）
	if strings.Contains(msg, "context deadline exceeded") ||
		strings.Contains(msg, "Client.Timeout") {
		return true
	}
	// EOF / connection reset / broken pipe
	if strings.Contains(msg, "EOF") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "network is unreachable") {
		return true
	}
	// net.OpError（如拨号错误）
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	// 我们的 fetchWebDictHTML 包装的 4xx 错误包含「HTTP 4xx」「HTTP 5xx」字样
	if strings.Contains(msg, "HTTP 4") || strings.Contains(msg, "HTTP 5") {
		return false
	}
	return false
}

// decodeResponseBody 处理 Content-Encoding（v1.3.1 起新增）
// 仅支持 gzip/deflate/br，复杂场景退回到原始 body
func decodeResponseBody(resp *http.Response) (io.Reader, error) {
	switch strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Encoding"))) {
	case "gzip":
		return newGzipReader(resp.Body)
	case "deflate":
		return newDeflateReader(resp.Body)
	case "br":
		return newBrotliReader(resp.Body)
	default:
		return resp.Body, nil
	}
}

// 常见噪音 token：导航 / 版权 / 广告 / 反馈按钮 等类名/ID 命中则删除子树
//
// 实际部署时各网站选择器差异大，本实现做「弱过滤」——只删全站通用的元素（nav/header/footer/aside），
// 其余依赖 bluemonday 通用白名单。
var noiseTagSet = map[atom.Atom]bool{
	atom.Script:   true,
	atom.Style:    true,
	atom.Noscript: true,
	atom.Iframe:   true,
	atom.Svg:      true,
	atom.Header:   true,
	atom.Nav:      true,
	atom.Footer:   true,
	atom.Aside:    true,
	atom.Form:     true,
	atom.Button:   true,
	atom.Input:    true,
}

// 典型「非内容区」类名 / id 模式（命中即删除子树）
var noiseAttrPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(nav|menu|sidebar|footer|header|ad-|ads|advert|banner|cookie|consent|popup|modal|toolbar|breadcrumb|promo|share|social|comment|related|recommend|survey)\b`),
}

// sanitizeWebDictHTML 清洗 HTML：去噪音 + 链接绝对化 + 链接开新窗口
func sanitizeWebDictHTML(rawHTML, finalURL string) (string, error) {
	base, err := url.Parse(finalURL)
	if err != nil {
		return "", fmt.Errorf("解析 base URL 失败: %w", err)
	}
	doc, err := html.Parse(strings.NewReader(rawHTML))
	if err != nil {
		return "", fmt.Errorf("解析 HTML 失败: %w", err)
	}

	// 1) 找到 <html>，只清洗其子树
	var htmlNode *html.Node
	var findHTML func(*html.Node)
	findHTML = func(n *html.Node) {
		if n == nil {
			return
		}
		if n.Type == html.ElementNode && n.DataAtom == atom.Html {
			htmlNode = n
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			findHTML(c)
		}
	}
	findHTML(doc)
	root := htmlNode
	if root == nil {
		root = doc
	}

	// 2) 遍历清洗
	cleanNode(root, base)

	// 3) 提取 <html> 内所有 body 内容（保留 body/html 之外的其他元素也行）
	//    这里把 <head> 整段去掉（避免重复 meta / 重复 title）
	var bodyBuf bytes.Buffer
	for c := root.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.DataAtom == atom.Head {
			continue
		}
		html.Render(&bodyBuf, c)
	}

	// 4) bluemonday 二次清洗（白名单常见释义标签 + 链接 + 图片）
	p := bluemonday.NewPolicy()
	p.AllowElements(
		"div", "section", "article", "main", "aside", "nav", "header", "footer",
		"p", "span", "b", "i", "em", "strong", "small", "sub", "sup", "br", "hr",
		"ul", "ol", "li", "dl", "dt", "dd",
		"h1", "h2", "h3", "h4", "h5", "h6",
		"table", "thead", "tbody", "tr", "th", "td", "caption",
		"a", "img", "figure", "figcaption", "audio", "video", "source",
		"abbr", "mark", "code", "pre", "blockquote",
	)
	p.AllowAttrs("href").OnElements("a")
	p.AllowAttrs("src").OnElements("img")
	p.AllowAttrs("alt", "title").OnElements("a", "img")
	p.AllowAttrs("class").Globally()
	p.AllowAttrs("id").Globally()
	p.AllowAttrs("style").OnElements("span", "div", "p", "a")
	p.AllowURLSchemes("http", "https", "mailto")
	// 强制所有 a target=_blank
	p.AllowAttrs("target").OnElements("a")

	cleaned := p.SanitizeBytes(bodyBuf.Bytes())
	return string(cleaned), nil
}

// cleanNode 递归清洗节点：删噪音标签 / 删匹配 noiseAttrPatterns 的元素 / 改写 URL
func cleanNode(n *html.Node, base *url.URL) {
	// 后序遍历：先处理子节点再处理自身（删除子树时不需要再下钻）
	for c := n.FirstChild; c != nil; {
		next := c.NextSibling
		if shouldRemove(c) {
			n.RemoveChild(c)
			c = next
			continue
		}
		cleanNode(c, base)
		c = next
	}

	// 处理当前节点属性
	if n.Type != html.ElementNode {
		return
	}
	// 强制 a target=_blank rel=noopener
	if n.DataAtom == atom.A {
		setAttr(n, "target", "_blank")
		setAttr(n, "rel", "noopener noreferrer")
	}
	// 链接 / 图片 src 改写为绝对
	for i, a := range n.Attr {
		if a.Key != "href" && a.Key != "src" {
			continue
		}
		if a.Val == "" || strings.HasPrefix(a.Val, "#") || strings.HasPrefix(a.Val, "javascript:") {
			if a.Key == "href" && strings.HasPrefix(a.Val, "javascript:") {
				n.Attr[i].Val = "#"
			}
			continue
		}
		ref, err := url.Parse(a.Val)
		if err != nil {
			continue
		}
		if ref.IsAbs() {
			continue
		}
		abs := base.ResolveReference(ref)
		n.Attr[i].Val = abs.String()
	}
}

// shouldRemove 是否应该删除该节点（子树 + 自身）
func shouldRemove(n *html.Node) bool {
	if n.Type == html.ElementNode && noiseTagSet[n.DataAtom] {
		return true
	}
	if n.Type == html.CommentNode {
		return true
	}
	if n.Type == html.ElementNode {
		for _, a := range n.Attr {
			if a.Key != "class" && a.Key != "id" {
				continue
			}
			for _, p := range noiseAttrPatterns {
				if p.MatchString(a.Val) {
					return true
				}
			}
		}
	}
	return false
}

func setAttr(n *html.Node, key, val string) {
	for i, a := range n.Attr {
		if a.Key == key {
			n.Attr[i].Val = val
			return
		}
	}
	n.Attr = append(n.Attr, html.Attribute{Key: key, Val: val})
}

// ====================== v1.3.4 翻译型源：微软 Edge ======================

// fetchMicrosoftTranslate 调用微软 Edge 翻译 API（v1.3.4 新增）
//
// 实现原理：Edge 浏览器的翻译后端，无需 API key
//  1. GET https://edge.microsoft.com/translate/auth  → 拿到短期 JWT token
//  2. POST https://api-edge.cognitive.microsofttranslator.com/translate
//     带 Authorization: Bearer {token}
//     Body: [{"Text": "hello"}]
//     响应: [{"translations":[{"text":"你好","to":"zh-Hans"}],"detectedLanguage":{"language":"en","score":1.0}}]
//
// token 默认有效期 ~10 分钟；这里缓存 8 分钟（提前 2 分钟续期，避免边界超时）
//
// 国内访问：edge.microsoft.com / api-edge.cognitive.microsofttranslator.com 必须走代理
//
//	→ 源标记 ForceProxy=true（忽略默认 SkipProxyHosts）
//
// 端点选择依据：参考 docs/Reference/STranslate.Plugin.Translate.GoogleWebsite 风格
//
//	（该插件用于谷歌翻译），但用户实测后选择更稳的 Edge API
func fetchMicrosoftTranslate(ctx context.Context, client *http.Client, word string) (*translatePayload, error) {
	// 1) 拿 token
	token, err := fetchMicrosoftAuthToken(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("微软翻译获取 token 失败: %w", err)
	}

	// 2) 调翻译 API
	// v1.3.5 修正：Edge Translator API 的 from 不支持 "auto"（会 HTTP 400 / code 400035）
	//   → 改为具体语言码 "en"（本应用主要查英文单词 → 中文）
	//   → 若将来支持「中→英」场景，可让前端传 from 参数或前端检测单词字符集
	apiURL := "https://api-edge.cognitive.microsofttranslator.com/translate" +
		"?from=en&to=zh-Hans&api-version=3.0&includeSentenceLength=true"
	reqBody, _ := json.Marshal([]map[string]string{{"Text": word}})

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("构造请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", uaEdgeBrowser)
	req.Header.Set("Accept", "application/json,text/plain,*/*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		// token 过期，强制下次重取
		invalidateMicrosoftAuthToken()
		return nil, fmt.Errorf("HTTP 401：token 已过期，请重试")
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("HTTP %d：%s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var raw []struct {
		DetectedLanguage struct {
			Language string  `json:"language"`
			Score    float64 `json:"score"`
		} `json:"detectedLanguage"`
		Translations []struct {
			Text string `json:"text"`
			To   string `json:"to"`
		} `json:"translations"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}
	if len(raw) == 0 || len(raw[0].Translations) == 0 {
		return nil, fmt.Errorf("响应为空")
	}
	translation := raw[0].Translations[0].Text
	if translation == "" {
		return nil, fmt.Errorf("未取到翻译")
	}

	sourceLang := raw[0].DetectedLanguage.Language
	if sourceLang == "" {
		sourceLang = "auto"
	}

	html := fmt.Sprintf(
		`<div class="ms-translation"><p class="ms-result">%s</p><p class="ms-meta">%s → zh-Hans</p></div>`,
		htmlEscape(translation), htmlEscape(sourceLang))

	return &translatePayload{
		Word:        word,
		Translation: translation,
		SourceLang:  sourceLang,
		TargetLang:  "zh-Hans",
		ExtraHTML:   html,
	}, nil
}

// ---------------- 微软翻译 Auth Token 缓存（v1.3.4） ----------------

var (
	msAuthTokenMu sync.RWMutex
	msAuthToken   string
	msAuthTokenAt time.Time
)

const msAuthTokenTTL = 8 * time.Minute // Edge token 实际 ~10 分钟，提前 2 分钟续期

// fetchMicrosoftAuthToken 拿 Edge 翻译的 JWT（带缓存）
func fetchMicrosoftAuthToken(ctx context.Context, client *http.Client) (string, error) {
	msAuthTokenMu.RLock()
	if msAuthToken != "" && time.Since(msAuthTokenAt) < msAuthTokenTTL {
		tok := msAuthToken
		msAuthTokenMu.RUnlock()
		return tok, nil
	}
	msAuthTokenMu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, "GET", "https://edge.microsoft.com/translate/auth", nil)
	if err != nil {
		return "", fmt.Errorf("构造 auth 请求失败: %w", err)
	}
	req.Header.Set("User-Agent", uaEdgeBrowser)
	req.Header.Set("Accept", "application/json,text/plain,*/*")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("auth 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("auth HTTP %d：%s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 16*1024))
	if err != nil {
		return "", fmt.Errorf("读取 auth 响应失败: %w", err)
	}

	tok := strings.TrimSpace(string(body))
	tok = strings.Trim(tok, `"`)
	if tok == "" {
		return "", fmt.Errorf("auth 响应为空")
	}

	msAuthTokenMu.Lock()
	msAuthToken = tok
	msAuthTokenAt = time.Now()
	msAuthTokenMu.Unlock()
	return tok, nil
}

// invalidateMicrosoftAuthToken token 失效（401 时调用）
func invalidateMicrosoftAuthToken() {
	msAuthTokenMu.Lock()
	msAuthToken = ""
	msAuthTokenAt = time.Time{}
	msAuthTokenMu.Unlock()
}
