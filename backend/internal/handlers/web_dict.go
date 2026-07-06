// 网页词典抓取（v1.3.0 起，v1.3.1 重构）
//
// 目的：让 Cambridge / Oxford / Longman / Wiktionary / 有道 等 7 个网页词典
// 也能在弹窗中渲染结果，而不是 window.open 跳新标签页。
//
// 路由：
//   GET /api/v1/dictionary/web/lookup?source=youdao&word=hello
//
// v1.3.1 重大改进：
//   - 支持代理（v1.3.0 在国内网络下大量 timeout / 403，本版本修复）
//   - 抓取走 utils.NewHTTPClient：自定义 > 环境变量 HTTPS_PROXY/HTTP_PROXY > 直连
//   - 超时可配（默认 15s，从 6s 提升）
//   - 失败时 1 次重试（仅对 timeout / 网络错误）
//   - 内存缓存 60 分钟（同一 source+word 不重复抓取）
//   - 失败时 blocked=true 让前端展示「在新窗口打开」链接，不让用户卡住
//
// 行为：
//   - 后端用 net/http 抓目标 URL 的 HTML
//   - 移除明显噪音节点：<script> / <style> / <noscript> / <iframe> / <svg>
//   - 保留主要释义容器：<article> / <main> / <section> / <div class="...">
//   - 用 bluemonday 清洗 XSS（allow 常见释义标签 + 链接 + 图片）
//   - 重写所有相对 URL 为绝对（基于原始 host）
//   - 重写 <a> 链接为 target=_blank，避免嵌套在弹窗里跳走
//
// 注意：
//   - 不同网站页面结构差异大，本实现只做「通用去噪 + 原文渲染」
//   - 对 Cambridge / Oxford / Wiktionary 等允许抓取的网站效果较好
//   - 有道 / 朗文等对爬虫有限制，可能拿到 403 或简版页面，弹窗内显示「页面受限，请在新窗口打开」提示
//   - 强烈建议国内网络环境配置 ECHOSUB_WEBDICT_PROXY=socks5://host:1080 或 http://127.0.0.1:7890
package handlers

import (
	"bytes"
	"context"
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

// 网页词典 URL 模板（与前端 kWebDictConfigs 对齐；保持一份本地配置便于后端独立部署）
type webDictSource struct {
	ID          string
	DisplayName string
	BuildURL    func(word string) string
}

func youdaoURL(w string) string {
	return "https://m.youdao.com/dict?le=eng&q=" + w
}
func cambridgeURL(w string) string {
	return "https://dictionary.cambridge.org/dictionary/english-chinese-simplified/" + w
}
func oxfordURL(w string) string {
	return "https://www.oxfordlearnersdictionaries.com/definition/english/" + w
}
func longmanURL(w string) string {
	return "https://www.ldoceonline.com/dictionary/" + w
}
func merriamWebsterURL(w string) string {
	return "https://www.merriam-webster.com/dictionary/" + w
}
func collinsURL(w string) string {
	return "https://www.collinsdictionary.com/dictionary/english/" + w
}
func wiktionaryURL(w string) string {
	return "https://en.m.wiktionary.org/wiki/" + w
}

var kWebDictSources = map[string]webDictSource{
	"youdao":         {ID: "youdao", DisplayName: "有道词典", BuildURL: youdaoURL},
	"cambridge":      {ID: "cambridge", DisplayName: "Cambridge", BuildURL: cambridgeURL},
	"oxford":         {ID: "oxford", DisplayName: "Oxford", BuildURL: oxfordURL},
	"longman":        {ID: "longman", DisplayName: "Longman", BuildURL: longmanURL},
	"merriamWebster": {ID: "merriamWebster", DisplayName: "Merriam-Webster", BuildURL: merriamWebsterURL},
	"collins":        {ID: "collins", DisplayName: "Collins", BuildURL: collinsURL},
	"wiktionary":     {ID: "wiktionary", DisplayName: "Wiktionary", BuildURL: wiktionaryURL},
}

// LookupWebDict 抓取并清洗网页词典释义
// GET /api/v1/dictionary/web/lookup?source=youdao&word=hello
//
// v1.3.1 起支持代理（ECHOSUB_WEBDICT_PROXY）+ 重试 + 内存缓存。
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

		// 词条长度限制 + URL 编码
		if len(word) > 128 {
			utils.Fail(c, http.StatusBadRequest, "word 过长")
			return
		}
		targetURL := src.BuildURL(url.QueryEscape(word))

		// v1.3.1：先查缓存
		cfg := getWebDictCfg(c)
		cacheKey := source + "|" + strings.ToLower(word)
		if cached, ok := webDictCacheGet(cacheKey); ok {
			cached["url"] = targetURL
			cached["cached"] = true
			utils.OK(c, cached)
			return
		}

		// HTTP 抓取（含重试）
		htmlRaw, finalURL, err := fetchWebDictHTML(cfg, targetURL)
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
			// v1.3.1：失败结果也缓存 5 分钟，避免一个词重复触发 timeout
			webDictCachePut(cacheKey, result, 5*time.Minute)
			utils.OK(c, result)
			return
		}

		// 清洗（去噪音 + XSS 防护 + 链接绝对化 + a 标签 target=_blank）
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
		// v1.3.1：成功结果按配置缓存（默认 60 分钟）
		ttl := time.Duration(cfg.WebDict.CacheMinutes) * time.Minute
		if ttl > 0 {
			webDictCachePut(cacheKey, result, ttl)
		}
		utils.OK(c, result)
	}
}

// getWebDictCfg 从 gin context 取 *config.Config
// router 启动时通过 handlers.SetGlobalConfig 注入；缺省时退到 Default()（仅用于单元测试）
func getWebDictCfg(c *gin.Context) *config.Config {
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
	if retries < 0 {
		retries = 0
	}
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
