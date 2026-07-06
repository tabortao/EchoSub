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
package utils

import (
	"net"
	"net/http"
	"net/url"
	"time"
)

// ProxyConfig 代理配置（v1.3.1 起）
//
// CustomProxy 不为空：使用该 URL 作为代理（http:// / https:// / socks5://）
// CustomProxy 为空：回退到 http.ProxyFromEnvironment（读 HTTPS_PROXY / HTTP_PROXY / NO_PROXY）
type ProxyConfig struct {
	// CustomProxy 自定义代理 URL，如 "http://127.0.0.1:7890" / "socks5://127.0.0.1:1080"
	// 空字符串 = 走环境变量
	CustomProxy string
}

// ProxyFunc 根据 ProxyConfig 返回 http.RoundTripper 使用的代理函数
// 内部会捕获 CustomProxy / http.ProxyFromEnvironment 两种模式
func (p ProxyConfig) ProxyFunc() func(*http.Request) (*url.URL, error) {
	if p.CustomProxy != "" {
		proxyURL, err := url.Parse(p.CustomProxy)
		if err != nil {
			// 解析失败：降级到环境变量
			return http.ProxyFromEnvironment
		}
		return http.ProxyURL(proxyURL)
	}
	// 空字符串：使用环境变量（HTTPS_PROXY/HTTP_PROXY/NO_PROXY）
	return http.ProxyFromEnvironment
}

// NewHTTPClient 构造一个统一的 HTTP 客户端（v1.3.1 起）
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
