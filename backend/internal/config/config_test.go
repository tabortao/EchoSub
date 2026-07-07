// Package config 单元测试（v1.3.1 起新增 AI / 网页词典 yaml 加载测试）
package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestYAMLHasField 测试 yamlHasField 辅助函数
// 用途：区分「用户没写」和「用户写了 0 / 空字符串」两种情况
func TestYAMLHasField(t *testing.T) {
	yamlData := []byte(`
server:
  port: "8080"

web_dict:
  timeout_sec: 20
  retries: 0
  cache_minutes: 0
  proxy: ""

ai:
  base_url: "https://api.openai.com/v1"
  api_key: "sk-test"
`)

	cases := []struct {
		section, key string
		want         bool
	}{
		{"web_dict", "timeout_sec", true},
		{"web_dict", "retries", true},
		{"web_dict", "cache_minutes", true},
		{"web_dict", "proxy", true},
		{"web_dict", "not_exist", false},
		{"ai", "base_url", true},
		{"ai", "api_key", true},
		{"ai", "model", false}, // 没写
		{"server", "port", true},
		{"server", "not_exist", false},
		{"not_exist", "field", false},
	}
	for _, c := range cases {
		got := yamlHasField(yamlData, c.section, c.key)
		if got != c.want {
			t.Errorf("yamlHasField(%q, %q) = %v, want %v", c.section, c.key, got, c.want)
		}
	}
}

// TestLoadFromYAML 测试 config.yaml 加载 AI / WebDict 配置（v1.3.1 新增）
func TestLoadFromYAML(t *testing.T) {
	// 写临时 yaml
	tmpDir := t.TempDir()
	yamlPath := filepath.Join(tmpDir, "config.yaml")
	yamlContent := `
server:
  port: "9090"

database:
  path: "/tmp/test.db"

jwt:
  secret: "test-secret"
  expire_hours: 24

media:
  dir: "/tmp/media"

ai:
  base_url: "https://api.deepseek.com/v1"
  api_key: "sk-yaml"
  model: "deepseek-chat"
  target_lang: "English"
  timeout_sec: 90
  proxy: "http://127.0.0.1:7890"

web_dict:
  timeout_sec: 30
  max_bytes: 2097152
  retries: 0
  cache_minutes: 120
  proxy: "socks5://127.0.0.1:1080"
`
	if err := os.WriteFile(yamlPath, []byte(yamlContent), 0644); err != nil {
		t.Fatal(err)
	}

	// 切换工作目录到 tmpDir 让 findConfigFile 找到
	oldCwd, _ := os.Getwd()
	defer os.Chdir(oldCwd)
	os.Chdir(tmpDir)

	// 清空可能的环境变量（确保 yaml 路径生效）
	for _, k := range []string{
		"ECHOSUB_PORT", "ECHOSUB_DB_PATH", "ECHOSUB_JWT_SECRET",
		"ECHOSUB_AI_BASE_URL", "ECHOSUB_AI_API_KEY", "ECHOSUB_AI_MODEL",
		"ECHOSUB_AI_PROXY", "ECHOSUB_AI_TARGET_LANG", "ECHOSUB_AI_TIMEOUT",
		"ECHOSUB_WEBDICT_TIMEOUT", "ECHOSUB_WEBDICT_RETRIES",
		"ECHOSUB_WEBDICT_CACHE_MINUTES", "ECHOSUB_WEBDICT_PROXY",
	} {
		os.Unsetenv(k)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// 基础字段
	if cfg.Server.Port != "9090" {
		t.Errorf("Server.Port = %q, want 9090", cfg.Server.Port)
	}
	if cfg.JWT.Secret != "test-secret" {
		t.Errorf("JWT.Secret = %q, want test-secret", cfg.JWT.Secret)
	}

	// AI 字段
	if cfg.AI.BaseURL != "https://api.deepseek.com/v1" {
		t.Errorf("AI.BaseURL = %q", cfg.AI.BaseURL)
	}
	if cfg.AI.APIKey != "sk-yaml" {
		t.Errorf("AI.APIKey = %q", cfg.AI.APIKey)
	}
	if cfg.AI.Model != "deepseek-chat" {
		t.Errorf("AI.Model = %q", cfg.AI.Model)
	}
	if cfg.AI.Proxy != "http://127.0.0.1:7890" {
		t.Errorf("AI.Proxy = %q", cfg.AI.Proxy)
	}
	if cfg.AI.TimeoutSec != 90 {
		t.Errorf("AI.TimeoutSec = %d, want 90", cfg.AI.TimeoutSec)
	}
	if !cfg.AI.Enabled {
		t.Error("AI.Enabled = false, want true（base_url + api_key 都有）")
	}

	// WebDict 字段
	if cfg.WebDict.TimeoutSec != 30 {
		t.Errorf("WebDict.TimeoutSec = %d, want 30", cfg.WebDict.TimeoutSec)
	}
	if cfg.WebDict.MaxBytes != 2097152 {
		t.Errorf("WebDict.MaxBytes = %d, want 2097152", cfg.WebDict.MaxBytes)
	}
	// 关键：显式写 retries: 0 应该生效（不被默认值 1 覆盖）
	if cfg.WebDict.Retries != 0 {
		t.Errorf("WebDict.Retries = %d, want 0（用户显式写 0）", cfg.WebDict.Retries)
	}
	if cfg.WebDict.CacheMinutes != 120 {
		t.Errorf("WebDict.CacheMinutes = %d, want 120", cfg.WebDict.CacheMinutes)
	}
	if cfg.WebDict.Proxy != "socks5://127.0.0.1:1080" {
		t.Errorf("WebDict.Proxy = %q", cfg.WebDict.Proxy)
	}
}

// TestEnvOverridesYAML 测试环境变量覆盖 yaml 配置
func TestEnvOverridesYAML(t *testing.T) {
	tmpDir := t.TempDir()
	yamlPath := filepath.Join(tmpDir, "config.yaml")
	yamlContent := `
server:
  port: "9090"
ai:
  base_url: "https://api.deepseek.com/v1"
  api_key: "sk-yaml"
  model: "deepseek-chat"
web_dict:
  timeout_sec: 30
  proxy: "socks5://yaml:1080"
`
	if err := os.WriteFile(yamlPath, []byte(yamlContent), 0644); err != nil {
		t.Fatal(err)
	}

	oldCwd, _ := os.Getwd()
	defer os.Chdir(oldCwd)
	os.Chdir(tmpDir)

	// 环境变量覆盖
	os.Setenv("ECHOSUB_PORT", "7070")
	os.Setenv("ECHOSUB_AI_PROXY", "http://env:7890")
	os.Setenv("ECHOSUB_WEBDICT_PROXY", "http://env:7890")
	defer func() {
		os.Unsetenv("ECHOSUB_PORT")
		os.Unsetenv("ECHOSUB_AI_PROXY")
		os.Unsetenv("ECHOSUB_WEBDICT_PROXY")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// env 覆盖 yaml
	if cfg.Server.Port != "7070" {
		t.Errorf("Server.Port = %q, want 7070 (env override)", cfg.Server.Port)
	}
	if cfg.AI.Proxy != "http://env:7890" {
		t.Errorf("AI.Proxy = %q, want http://env:7890 (env override)", cfg.AI.Proxy)
	}
	if cfg.WebDict.Proxy != "http://env:7890" {
		t.Errorf("WebDict.Proxy = %q, want http://env:7890 (env override)", cfg.WebDict.Proxy)
	}
	// yaml 没被覆盖的字段保留
	if cfg.AI.BaseURL != "https://api.deepseek.com/v1" {
		t.Errorf("AI.BaseURL = %q, want yaml value", cfg.AI.BaseURL)
	}
}
