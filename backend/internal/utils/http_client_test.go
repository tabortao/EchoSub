package utils

import (
	"net/http"
	"net/url"
	"testing"
	"time"
)

// TestNewHTTPClient_BasicClient 验证 NewHTTPClient 基础参数
func TestNewHTTPClient_BasicClient(t *testing.T) {
	client := NewHTTPClient(5*time.Second, nil)
	if client.Timeout != 5*time.Second {
		t.Errorf("Timeout = %v, want 5s", client.Timeout)
	}
	if client.Transport == nil {
		t.Error("Transport should not be nil")
	}
	if client.CheckRedirect == nil {
		t.Error("CheckRedirect should not be nil")
	}
}

// TestNewHTTPClient_DefaultTimeout 0 超时使用默认 30s
func TestNewHTTPClient_DefaultTimeout(t *testing.T) {
	client := NewHTTPClient(0, nil)
	if client.Timeout != 30*time.Second {
		t.Errorf("Timeout = %v, want 30s default", client.Timeout)
	}
}

// TestProxyConfig_CustomProxy 验证自定义代理解析
func TestProxyConfig_CustomProxy(t *testing.T) {
	cfg := ProxyConfig{CustomProxy: "http://127.0.0.1:7890"}
	proxyFn := cfg.ProxyFunc()
	if proxyFn == nil {
		t.Fatal("ProxyFunc should not return nil")
	}
	// 构造一个虚拟请求测试代理函数返回正确的 URL
	req, _ := http.NewRequest("GET", "https://www.google.com", nil)
	proxyURL, err := proxyFn(req)
	if err != nil {
		t.Fatalf("proxyFn error: %v", err)
	}
	if proxyURL == nil {
		t.Fatal("proxyURL should not be nil for CustomProxy set")
	}
	if proxyURL.String() != "http://127.0.0.1:7890" {
		t.Errorf("proxyURL = %s, want http://127.0.0.1:7890", proxyURL.String())
	}
}

// TestProxyConfig_Socks5Proxy 验证 SOCKS5 代理
func TestProxyConfig_Socks5Proxy(t *testing.T) {
	cfg := ProxyConfig{CustomProxy: "socks5://127.0.0.1:1080"}
	proxyFn := cfg.ProxyFunc()
	req, _ := http.NewRequest("GET", "https://www.google.com", nil)
	proxyURL, err := proxyFn(req)
	if err != nil {
		t.Fatalf("proxyFn error: %v", err)
	}
	if proxyURL == nil || proxyURL.Scheme != "socks5" {
		t.Errorf("proxyURL scheme = %v, want socks5", proxyURL)
	}
}

// TestProxyConfig_EmptyFallback 验证空字符串 fallback 到 ProxyFromEnvironment
func TestProxyConfig_EmptyFallback(t *testing.T) {
	cfg := ProxyConfig{CustomProxy: ""}
	proxyFn := cfg.ProxyFunc()
	req, _ := http.NewRequest("GET", "https://www.google.com", nil)
	// 不设置任何环境变量时应该返回 nil, nil
	t.Setenv("HTTPS_PROXY", "")
	t.Setenv("HTTP_PROXY", "")
	proxyURL, err := proxyFn(req)
	if err != nil {
		t.Fatalf("proxyFn error: %v", err)
	}
	if proxyURL != nil {
		t.Errorf("proxyURL = %v, want nil when no env vars set", proxyURL)
	}
}

// TestProxyConfig_InvalidFallback 验证无效 URL fallback 到环境变量
func TestProxyConfig_InvalidFallback(t *testing.T) {
	// "::::" 包含 ":" 但无 scheme，url.Parse 会报错
	cfg := ProxyConfig{CustomProxy: "::::"}
	proxyFn := cfg.ProxyFunc()
	req, _ := http.NewRequest("GET", "https://www.google.com", nil)
	t.Setenv("HTTPS_PROXY", "")
	t.Setenv("HTTP_PROXY", "")
	proxyURL, err := proxyFn(req)
	if err != nil {
		t.Fatalf("proxyFn error: %v", err)
	}
	// 解析失败时降级到 ProxyFromEnvironment，无 env 时返回 nil
	if proxyURL != nil {
		t.Errorf("proxyURL = %v, want nil when CustomProxy invalid and no env", proxyURL)
	}
}

// TestProxyConfig_ParseURL 验证自定义代理 URL 解析正常
func TestProxyConfig_ParseURL(t *testing.T) {
	cfg := ProxyConfig{CustomProxy: "http://user:pass@127.0.0.1:7890"}
	proxyFn := cfg.ProxyFunc()
	req, _ := http.NewRequest("GET", "https://www.google.com", nil)
	proxyURL, err := proxyFn(req)
	if err != nil {
		t.Fatalf("proxyFn error: %v", err)
	}
	if proxyURL == nil {
		t.Fatal("proxyURL should not be nil")
	}
	u, err := url.Parse("http://user:pass@127.0.0.1:7890")
	if err != nil {
		t.Fatalf("url parse error: %v", err)
	}
	if proxyURL.String() != u.String() {
		t.Errorf("proxyURL = %s, want %s", proxyURL.String(), u.String())
	}
}
