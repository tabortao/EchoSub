package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config 全局配置
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Media    MediaConfig
	AI       AIConfig
	WebDict  WebDictConfig
}

// AIConfig AI 翻译配置（v0.8.0）
// 所有字段都来自环境变量（用户选择：环境变量全局配置），
// 不通过 config.yaml / 数据库存储。原因：API key 敏感，避免明文落盘。
type AIConfig struct {
	Enabled    bool   // 是否启用 AI 翻译（BaseURL + APIKey 都存在时为 true）
	BaseURL    string // OpenAI 兼容接口 base url，如 https://api.openai.com/v1
	APIKey     string // API 密钥
	Model      string // 模型名，如 gpt-4o-mini / deepseek-chat / qwen-plus
	TargetLang string // 默认翻译目标语言，如 Chinese
	TimeoutSec int    // 单次请求超时（秒）
	// Proxy v1.3.1 起新增：AI 请求专用代理，可选。优先级：
	//   1) ECHOSUB_AI_PROXY 环境变量
	//   2) HTTPS_PROXY/HTTP_PROXY/no_proxy 环境变量（http.ProxyFromEnvironment）
	//   3) 不使用代理（直连）
	// 用途：OpenAI / Anthropic 等海外 API 在国内访问常需代理；本地 Ollama 不需要
	Proxy string
	// SkipProxyHosts 跳过代理的域名列表（v1.3.2 起新增）
	// 用途：DeepSeek / 通义千问 / Ollama 等国内 AI 直连最快，不要被代理拖累
	// 多值用半角逗号分隔：ECHOSUB_AI_SKIP_PROXY="api.deepseek.com,dashscope.aliyuncs.com"
	SkipProxyHosts []string
	// OnlyProxyHosts 只对列表中域名走代理（v1.3.2 起新增，与 SkipProxyHosts 互斥，留空 = 不限制）
	OnlyProxyHosts []string
}

// WebDictConfig 网页词典抓取配置（v1.3.1 起，v1.3.2 增强按域名分流）
//
// 用于让 9 个网页词典（Cambridge / Oxford / Longman / Wiktionary / 有道 / 百度 / 谷歌 等）
// 在国内网络环境下也能稳定抓取。关键点：
//   - 很多站点在中国大陆访问慢 / 超时 → 需要代理
//   - 中文站点（有道 / 百度）从境外 IP 访问反而被风控 → 需要跳过代理
//   - 解决：SkipProxyHosts（黑名单 = 这些域名不走代理）
//
// 代理优先级：
//   1) ECHOSUB_WEBDICT_PROXY 环境变量
//   2) HTTPS_PROXY/HTTP_PROXY/no_proxy 环境变量（http.ProxyFromEnvironment）
//   3) 不使用代理（直连）
//
// v1.3.2 起新增按域名分流字段：
//   - SkipProxyHosts 中文站点列表（默认含 youdao / baidu / googleapis）→ 直连
//   - OnlyProxyHosts 英文站点白名单（留空 = 全部走代理；非空 = 仅列表内走代理）
type WebDictConfig struct {
	// TimeoutSec 单次抓取超时（秒），默认 15 秒
	// 站点响应慢时可调大到 30
	TimeoutSec int
	// MaxBytes 单次响应大小上限（字节），默认 1 MiB
	MaxBytes int64
	// Retries 失败时重试次数（默认 1 = 共请求 2 次），仅对 timeout/网络错误重试
	Retries int
	// CacheMinutes 抓取结果在内存中的缓存时长（分钟），默认 60
	// 设置为 0 禁用缓存
	CacheMinutes int
	// Proxy v1.3.1 起新增：抓取请求专用代理，可选
	Proxy string
	// SkipProxyHosts 跳过代理的域名列表（v1.3.2 起新增，默认 ["youdao.com", "baidu.com", "googleapis.com", "gstatic.com", "translate.google.com"]）
	// 解决：开代理后中文站（有道）反而拿不到内容的问题
	SkipProxyHosts []string
	// OnlyProxyHosts 只对列表中的英文词典域名走代理（v1.3.2 起新增，留空 = 不限制）
	// 推荐配置：["dictionary.cambridge.org", "www.oxfordlearnersdictionaries.com", "www.ldoceonline.com", "www.merriam-webster.com", "www.collinsdictionary.com", "en.wiktionary.org"]
	OnlyProxyHosts []string
}

// ServerConfig HTTP 服务配置
type ServerConfig struct {
	Port string
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Path string
}

// JWTConfig JWT 配置
type JWTConfig struct {
	Secret      string
	ExpireHours int
}

// MediaConfig 媒体目录配置
type MediaConfig struct {
	Dir             string
	SupportedVideo  []string
	SupportedAudio  []string
	SupportedSubs   []string
	SupportedImages []string
}

// Default 返回默认配置
func Default() *Config {
	return &Config{
		Server: ServerConfig{
			Port: "8080",
		},
		Database: DatabaseConfig{
			Path: filepath.Join("data", "echosub.db"),
		},
		JWT: JWTConfig{
			Secret:      "change-me-in-production",
			ExpireHours: 72,
		},
		Media: MediaConfig{
			Dir:             "/media",
			SupportedVideo:  []string{".mp4", ".mkv", ".mov", ".webm", ".avi"},
			SupportedAudio:  []string{".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg"},
			SupportedSubs:   []string{".srt", ".vtt"},
			SupportedImages: []string{".jpg", ".jpeg", ".png", ".webp"},
		},
		AI: AIConfig{
			BaseURL:    "https://api.openai.com/v1",
			Model:      "gpt-4o-mini",
			TargetLang: "Chinese",
			TimeoutSec: 60,
		},
		WebDict: WebDictConfig{
			TimeoutSec:   15,
			MaxBytes:     1 * 1024 * 1024,
			Retries:      1,
			CacheMinutes: 60,
			// v1.3.2 起默认跳过代理的国内站点（解决开代理后有道不工作的问题）
			// 这些域名走境外代理反而被风控或返回简版页面
			SkipProxyHosts: []string{
				// v1.3.5：移除 youdao.com。理由：v1.3.2 时为「中文站开代理反而被风控」加进黑名单，
				//   但用户实测有道在国内偶发 TLS handshake timeout（直连被墙/限速），
				//   走代理反而更稳。默认黑名单改为「国内/Google 系 AI 端点」。
				//   用户没配 ECHOSUB_WEBDICT_PROXY 时仍走默认（无代理），不影响普通用户。
				"baidu.com",
				"baidupc.com",
				"translate.google.com",
				"translate.googleapis.com",
				"gstatic.com",
				"ggpht.com",
				"googleapis.com",
			},
		},
	}
}

// Load 加载配置，优先级：环境变量 > config.yaml > 默认值
// config.yaml 查找顺序：当前工作目录 → 可执行文件所在目录 → backend/
func Load() (*Config, error) {
	cfg := Default()

	// 1. 尝试读取 config.yaml（按优先顺序查找）
	yamlPath := findConfigFile("config.yaml")
	if yamlPath != "" {
		data, err := os.ReadFile(yamlPath)
		if err == nil {
			// yaml 结构使用 snake_case 字段名
			var ycfg struct {
				Server struct {
					Port string `yaml:"port"`
				} `yaml:"server"`
				Database struct {
					Path string `yaml:"path"`
				} `yaml:"database"`
				JWT struct {
					Secret      string `yaml:"secret"`
					ExpireHours int    `yaml:"expire_hours"`
				} `yaml:"jwt"`
				Media struct {
					Dir             string   `yaml:"dir"`
					SupportedVideo  []string `yaml:"supported_video"`
					SupportedAudio  []string `yaml:"supported_audio"`
					SupportedSubs   []string `yaml:"supported_subs"`
					SupportedImages []string `yaml:"supported_images"`
				} `yaml:"media"`
				// v1.3.1 起：AI 配置可写入 config.yaml（环境变量仍是最高优先级）
				// 注意：API key 仍建议用环境变量 ECHOSUB_AI_API_KEY，避免明文落盘
				AI struct {
					BaseURL        string   `yaml:"base_url"`
					APIKey         string   `yaml:"api_key"`
					Model          string   `yaml:"model"`
					TargetLang     string   `yaml:"target_lang"`
					TimeoutSec     int      `yaml:"timeout_sec"`
					Proxy          string   `yaml:"proxy"`
					SkipProxyHosts []string `yaml:"skip_proxy_hosts"` // v1.3.2 起
					OnlyProxyHosts []string `yaml:"only_proxy_hosts"` // v1.3.2 起
				} `yaml:"ai"`
				// v1.3.1 起：网页词典抓取配置
				WebDict struct {
					TimeoutSec     int      `yaml:"timeout_sec"`
					MaxBytes       int64    `yaml:"max_bytes"`
					Retries        int      `yaml:"retries"`
					CacheMinutes   int      `yaml:"cache_minutes"`
					Proxy          string   `yaml:"proxy"`
					SkipProxyHosts []string `yaml:"skip_proxy_hosts"` // v1.3.2 起
					OnlyProxyHosts []string `yaml:"only_proxy_hosts"` // v1.3.2 起
				} `yaml:"web_dict"`
			}
			if err := yaml.Unmarshal(data, &ycfg); err == nil {
				// 覆盖默认值（仅当 yaml 中有值时）
				if ycfg.Server.Port != "" {
					cfg.Server.Port = ycfg.Server.Port
				}
				if ycfg.Database.Path != "" {
					cfg.Database.Path = ycfg.Database.Path
				}
				if ycfg.JWT.Secret != "" {
					cfg.JWT.Secret = ycfg.JWT.Secret
				}
				if ycfg.JWT.ExpireHours > 0 {
					cfg.JWT.ExpireHours = ycfg.JWT.ExpireHours
				}
				if ycfg.Media.Dir != "" {
					cfg.Media.Dir = ycfg.Media.Dir
				}
				if len(ycfg.Media.SupportedVideo) > 0 {
					cfg.Media.SupportedVideo = ycfg.Media.SupportedVideo
				}
				if len(ycfg.Media.SupportedAudio) > 0 {
					cfg.Media.SupportedAudio = ycfg.Media.SupportedAudio
				}
				if len(ycfg.Media.SupportedSubs) > 0 {
					cfg.Media.SupportedSubs = ycfg.Media.SupportedSubs
				}
				if len(ycfg.Media.SupportedImages) > 0 {
					cfg.Media.SupportedImages = ycfg.Media.SupportedImages
				}
				// AI（v1.3.1 起支持 yaml）
				if ycfg.AI.BaseURL != "" {
					cfg.AI.BaseURL = ycfg.AI.BaseURL
				}
				if ycfg.AI.APIKey != "" {
					cfg.AI.APIKey = ycfg.AI.APIKey
				}
				if ycfg.AI.Model != "" {
					cfg.AI.Model = ycfg.AI.Model
				}
				if ycfg.AI.TargetLang != "" {
					cfg.AI.TargetLang = ycfg.AI.TargetLang
				}
				if ycfg.AI.TimeoutSec > 0 {
					cfg.AI.TimeoutSec = ycfg.AI.TimeoutSec
				}
				if ycfg.AI.Proxy != "" {
					cfg.AI.Proxy = ycfg.AI.Proxy
				}
				if len(ycfg.AI.SkipProxyHosts) > 0 {
					cfg.AI.SkipProxyHosts = ycfg.AI.SkipProxyHosts
				}
				if len(ycfg.AI.OnlyProxyHosts) > 0 {
					cfg.AI.OnlyProxyHosts = ycfg.AI.OnlyProxyHosts
				}
				// 网页词典（v1.3.1 起支持 yaml）
				if ycfg.WebDict.TimeoutSec > 0 {
					cfg.WebDict.TimeoutSec = ycfg.WebDict.TimeoutSec
				}
				if ycfg.WebDict.MaxBytes > 0 {
					cfg.WebDict.MaxBytes = ycfg.WebDict.MaxBytes
				}
				if ycfg.WebDict.Retries > 0 || ycfg.WebDict.Retries == 0 && yamlHasField(data, "web_dict", "retries") {
					// 显式写 0 也允许（极端场景禁用重试）；用辅助函数判断键存在
					cfg.WebDict.Retries = ycfg.WebDict.Retries
				}
				if ycfg.WebDict.CacheMinutes > 0 {
					cfg.WebDict.CacheMinutes = ycfg.WebDict.CacheMinutes
				}
				if ycfg.WebDict.Proxy != "" {
					cfg.WebDict.Proxy = ycfg.WebDict.Proxy
				}
				if len(ycfg.WebDict.SkipProxyHosts) > 0 {
					cfg.WebDict.SkipProxyHosts = ycfg.WebDict.SkipProxyHosts
				}
				if len(ycfg.WebDict.OnlyProxyHosts) > 0 {
					cfg.WebDict.OnlyProxyHosts = ycfg.WebDict.OnlyProxyHosts
				}
				fmt.Printf("[INFO] 已加载配置文件: %s\n", yamlPath)
			}
		}
	}

	// 2. 环境变量覆盖（最高优先级）
	if v := os.Getenv("ECHOSUB_PORT"); v != "" {
		cfg.Server.Port = v
	}
	if v := os.Getenv("ECHOSUB_DB_PATH"); v != "" {
		cfg.Database.Path = v
	}
	if v := os.Getenv("ECHOSUB_JWT_SECRET"); v != "" {
		cfg.JWT.Secret = v
	}
	if v := os.Getenv("ECHOSUB_MEDIA_DIR"); v != "" {
		cfg.Media.Dir = v
	}
	// AI 配置（v0.8.0）：仅通过环境变量注入，API key 避免明文落盘
	if v := os.Getenv("ECHOSUB_AI_BASE_URL"); v != "" {
		cfg.AI.BaseURL = v
	}
	if v := os.Getenv("ECHOSUB_AI_API_KEY"); v != "" {
		cfg.AI.APIKey = v
	}
	if v := os.Getenv("ECHOSUB_AI_MODEL"); v != "" {
		cfg.AI.Model = v
	}
	if v := os.Getenv("ECHOSUB_AI_TARGET_LANG"); v != "" {
		cfg.AI.TargetLang = v
	}
	if v := os.Getenv("ECHOSUB_AI_TIMEOUT"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 {
			cfg.AI.TimeoutSec = i
		}
	}
	// v1.3.1 起新增：AI 代理。空字符串 = 走环境变量 HTTPS_PROXY/HTTP_PROXY（如果有）
	if v := os.Getenv("ECHOSUB_AI_PROXY"); v != "" {
		cfg.AI.Proxy = v
	}
	// v1.3.2 起新增：AI 代理按域名分流（多值用半角逗号分隔）
	if v := os.Getenv("ECHOSUB_AI_SKIP_PROXY"); v != "" {
		cfg.AI.SkipProxyHosts = parseCSV(v)
	}
	if v := os.Getenv("ECHOSUB_AI_ONLY_PROXY"); v != "" {
		cfg.AI.OnlyProxyHosts = parseCSV(v)
	}
	// 启用判定：必须 BaseURL + APIKey 都有值才启用
	cfg.AI.Enabled = cfg.AI.BaseURL != "" && cfg.AI.APIKey != ""
	if cfg.AI.Enabled {
		fmt.Printf("[INFO] AI 翻译已启用：%s / %s\n", cfg.AI.BaseURL, cfg.AI.Model)
		if cfg.AI.Proxy != "" {
			fmt.Printf("[INFO]   AI 代理：%s", cfg.AI.Proxy)
			if len(cfg.AI.SkipProxyHosts) > 0 {
				fmt.Printf("（跳过 %d 个域名）", len(cfg.AI.SkipProxyHosts))
			}
			fmt.Println()
		}
	} else {
		fmt.Println("[INFO] AI 翻译未启用（未配置 ECHOSUB_AI_API_KEY）")
	}

	// v1.3.1 起新增：网页词典抓取配置
	if v := os.Getenv("ECHOSUB_WEBDICT_TIMEOUT"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 {
			cfg.WebDict.TimeoutSec = i
		}
	}
	if v := os.Getenv("ECHOSUB_WEBDICT_RETRIES"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i >= 0 {
			cfg.WebDict.Retries = i
		}
	}
	if v := os.Getenv("ECHOSUB_WEBDICT_CACHE_MINUTES"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i >= 0 {
			cfg.WebDict.CacheMinutes = i
		}
	}
	if v := os.Getenv("ECHOSUB_WEBDICT_PROXY"); v != "" {
		cfg.WebDict.Proxy = v
	}
	// v1.3.2 起新增：网页词典代理按域名分流
	// ECHOSUB_WEBDICT_SKIP_PROXY 留空 = 走默认值（youdao/baidu/google 等中文/谷歌站点）
	if v := os.Getenv("ECHOSUB_WEBDICT_SKIP_PROXY"); v != "" {
		// 显式提供时完全覆盖默认（含「,」也覆盖；只写 "none" 留空）
		if v == "none" {
			cfg.WebDict.SkipProxyHosts = nil
		} else {
			cfg.WebDict.SkipProxyHosts = parseCSV(v)
		}
	}
	if v := os.Getenv("ECHOSUB_WEBDICT_ONLY_PROXY"); v != "" {
		if v == "none" {
			cfg.WebDict.OnlyProxyHosts = nil
		} else {
			cfg.WebDict.OnlyProxyHosts = parseCSV(v)
		}
	}
	if cfg.WebDict.Proxy != "" {
		fmt.Printf("[INFO] 网页词典代理：%s（超时 %ds, 重试 %d 次, 缓存 %d 分钟",
			cfg.WebDict.Proxy, cfg.WebDict.TimeoutSec, cfg.WebDict.Retries, cfg.WebDict.CacheMinutes)
		if len(cfg.WebDict.SkipProxyHosts) > 0 {
			fmt.Printf(", 跳过 %d 个域名", len(cfg.WebDict.SkipProxyHosts))
		}
		fmt.Println("）")
	} else {
		fmt.Printf("[INFO] 网页词典抓取：超时 %ds, 重试 %d 次, 缓存 %d 分钟（未配置代理）\n",
			cfg.WebDict.TimeoutSec, cfg.WebDict.Retries, cfg.WebDict.CacheMinutes)
	}

	// 3. 确保数据目录存在
	dbDir := filepath.Dir(cfg.Database.Path)
	if dbDir != "" && dbDir != "." {
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			return nil, fmt.Errorf("创建数据库目录失败: %w", err)
		}
	}
	// 4. 确保媒体目录存在（仅检查，不强制创建）
	if _, err := os.Stat(cfg.Media.Dir); os.IsNotExist(err) {
		_ = os.MkdirAll(cfg.Media.Dir, 0755)
	}
	// 5. JWT secret 校验
	if cfg.JWT.Secret == "change-me-in-production" {
		fmt.Println("[WARN] 使用默认 JWT secret，生产环境请通过 ECHOSUB_JWT_SECRET 环境变量或 config.yaml 修改")
	}

	fmt.Printf("[INFO] 媒体目录: %s\n", cfg.Media.Dir)
	return cfg, nil
}

// findConfigFile 按优先顺序查找配置文件
func findConfigFile(name string) string {
	// 1. 当前工作目录
	if _, err := os.Stat(name); err == nil {
		abs, _ := filepath.Abs(name)
		return abs
	}
	// 2. 可执行文件所在目录
	if exe, err := os.Executable(); err == nil {
		p := filepath.Join(filepath.Dir(exe), name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	// 3. backend/ 子目录（从项目根运行时）
	p := filepath.Join("backend", name)
	if _, err := os.Stat(p); err == nil {
		abs, _ := filepath.Abs(p)
		return abs
	}
	return ""
}

// yamlHasField 检查 yaml 文本中指定 section 下是否显式包含某个 key
// 用于区分「用户没写」和「用户写了 0 / 空字符串」两种情况
// 实现：粗略的字符串匹配（不依赖完整的 yaml AST 解析）
func yamlHasField(yamlData []byte, section, key string) bool {
	lines := strings.Split(string(yamlData), "\n")
	inSection := false
	sectionIndent := -1
	keyIndent := -1
	for _, line := range lines {
		// 跳过空行与注释
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		// 计算缩进（空格数）
		indent := 0
		for _, c := range line {
			if c == ' ' {
				indent++
			} else {
				break
			}
		}
		// 检测 section 起始（顶层 key + 冒号）
		if indent == 0 && strings.HasSuffix(trimmed, ":") {
			inSection = strings.TrimSuffix(trimmed, ":") == section
			sectionIndent = indent
			continue
		}
		if !inSection {
			continue
		}
		// section 内缩进必须 > section 缩进
		if indent <= sectionIndent {
			inSection = false
			continue
		}
		// 找到 key（形如 "key:" 或 "key: value"）
		keyIndent = indent
		colonIdx := strings.Index(trimmed, ":")
		if colonIdx > 0 {
			k := strings.TrimSpace(trimmed[:colonIdx])
			if k == key {
				return true
			}
		}
		_ = keyIndent
	}
	return false
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

// parseCSV 把半角逗号分隔的字符串拆成非空切片
// 用法：parseCSV("a,b, c,,d") → ["a", "b", "c", "d"]
// v1.3.2 起新增：用于 ECHOSUB_WEBDICT_SKIP_PROXY 等多值环境变量
func parseCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
