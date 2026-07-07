// Package utils HTTP 客户端工具（v1.3.1 起）
//
// 设计目标：
//   - 网页词典抓取 / AI 翻译 共用一个 HTTP 客户端工厂
//   - 统一支持代理：自定义 > 环境变量 HTTPS_PROXY/HTTP_PROXY > 直连
//   - 合理超时 + 连接池 + 失败重试 + 浏览器风格请求头
//
// 关键点：
//   - Go 的 http.DefaultTransport 已经内置 ProxyFromEnvironment
//   - 如果用 &http.Client{Timeout: 6s} 但不指定 Transport，会用零值 transport
//     零值 transport 不会读取 HTTPS_PROXY/HTTP_PROXY，所以「配置了代理但没生效」是常见坑
//   - 正确做法是：构造一个 *http.Transport 并显式设置 Proxy 字段
//
// v1.3.2 起：增加按域名分流（SkipProxyHosts / OnlyProxyHosts）
//   - 中文站点（youdao / baidu / google）开代理反而被风控 → 显式不走代理
//   - 英文站点（cambridge / oxford / longman）开代理才能稳定 → 走代理
//   - 用法：在 ProxyConfig 中配置 SkipProxyHosts / OnlyProxyHosts
package utils

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ProxyConfig 代理配置（v1.3.1 起，v1.3.2 扩展按域名分流）
//
// CustomProxy 不为空：使用该 URL 作为代理（http:// / https:// / socks5://）
// CustomProxy 为空：回退到 http.ProxyFromEnvironment（读 HTTPS_PROXY / HTTP_PROXY / NO_PROXY）
type ProxyConfig struct {
	// CustomProxy 自定义代理 URL，如 "http://127.0.0.1:7890" / "socks5://127.0.0.1:1080"
	// 空字符串 = 走环境变量
	CustomProxy string
	// SkipProxyHosts 跳过代理的域名列表（v1.3.2 起新增）
	// 匹配规则：host 或其任一 parent domain 后缀命中
	// 用途：中文站点（有道 / 百度）从国内 IP 访问最稳，走境外代理反而被风控
	// 注意：仅当 CustomProxy 非空时生效；空时直接走环境变量（环境变量里 NO_PROXY 也支持）
	SkipProxyHosts []string
	// OnlyProxyHosts 只对列表中的域名使用代理（v1.3.2 起新增）
	// 留空 = 不限制；非空时除列表内域名外全部直连
	// 用途：精细控制——只让英文词典站点走代理，其余保持国内直连
	// 注意：仅当 CustomProxy 非空时生效
	OnlyProxyHosts []string
}

// shouldProxy 判断某个 host 是否应该走代理
// 返回值：
//   - true  → 走代理
//   - false → 直连
//
// 决策顺序（v1.3.2 起）：
//   1) OnlyProxyHosts 非空 → 必须 host 在列表内才走代理；否则直连
//   2) SkipProxyHosts 非空 → host 在列表内则直连
//   3) 默认 → 走代理（CustomProxy 非空的前提下）
//
// host 大小写不敏感
func (p ProxyConfig) shouldProxy(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return true
	}
	// OnlyProxyHosts 白名单模式
	if len(p.OnlyProxyHosts) > 0 {
		return hostMatchesAny(host, p.OnlyProxyHosts)
	}
	// SkipProxyHosts 黑名单模式
	if len(p.SkipProxyHosts) > 0 && hostMatchesAny(host, p.SkipProxyHosts) {
		return false
	}
	return true
}

// hostMatchesAny 检查 host 是否匹配 patterns 中任一后缀
// 匹配规则：完全相等 OR host 以 ".pattern" 结尾（即 pattern 是 host 的 parent domain）
// 例：host="dict.youdao.com" matches "youdao.com"  →  true
//     host="youdao.com"     matches "youdao.com"  →  true
//     host="evil.com"       matches "youdao.com"  →  false（不能反向匹配）
func hostMatchesAny(host string, patterns []string) bool {
	for _, p := range patterns {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		if host == p {
			return true
		}
		if strings.HasSuffix(host, "."+p) {
			return true
		}
	}
	return false
}

// ProxyFunc 根据 ProxyConfig 返回 http.RoundTripper 使用的代理函数
// 内部会捕获 CustomProxy / http.ProxyFromEnvironment 两种模式
//
// v1.3.2 起：代理函数内集成 per-host 决策（SkipProxyHosts / OnlyProxyHosts）
func (p ProxyConfig) ProxyFunc() func(*http.Request) (*url.URL, error) {
	if p.CustomProxy == "" {
		// 空字符串：使用环境变量（HTTPS_PROXY/HTTP_PROXY/NO_PROXY）
		return http.ProxyFromEnvironment
	}
	proxyURL, err := url.Parse(p.CustomProxy)
	if err != nil {
		// 解析失败：降级到环境变量
		return http.ProxyFromEnvironment
	}
	// 包装一层：每个请求前先判断 host 是否要走代理
	return func(req *http.Request) (*url.URL, error) {
		if !p.shouldProxy(req.URL.Host) {
			return nil, nil // 直连
		}
		return proxyURL, nil
	}
}

// NewHTTPClient 构造一个统一的 HTTP 客户端（v1.3.1 起，v1.3.2 增强）
//
// 参数：
//   - timeout：单次请求总超时（含连接、读取），0 = 使用默认 30 秒
//   - proxy：代理配置，nil = 不使用代理（直连）
//
// 返回的 client 适合：
//   - 网页词典抓取（短超时 + 浏览器风格头）
//   - AI 翻译（长超时 + 标准 JSON 头）
//   - 其他出站 HTTP 调用
func NewHTTPClient(timeout time.Duration, proxy *ProxyConfig) *http.Client {
	tr := &http.Transport{
		Proxy: func(req *http.Request) (*url.URL, error) {
			if proxy == nil {
				return nil, nil // 直连
			}
			return proxy.ProxyFunc()(req)
		},
		// 连接池调优（与 http.DefaultTransport 一致）
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		// 启用 HTTP/2
		ForceAttemptHTTP2: true,
		// TLS 握手超时（防止慢代理拖死）
		TLSHandshakeTimeout: 10 * time.Second,
		// 期待响应头超时（防止服务端建立连接后不返回头）
		ExpectContinueTimeout: 1 * time.Second,
		// 拨号超时（防止 DNS / TCP 卡死）
		DialContext: (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
	}

	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: tr,
		// 跟随 5 次重定向
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
}
