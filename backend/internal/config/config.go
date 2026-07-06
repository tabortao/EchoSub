package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"

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
}

// WebDictConfig 网页词典抓取配置（v1.3.1 起）
//
// 用于让 7 个网页词典（Cambridge / Oxford / Longman / Wiktionary / 有道 等）
// 在国内网络环境下也能稳定抓取。关键点：
//   - 很多站点在中国大陆访问慢 / 超时 → 需要代理
//   - 有道 / 朗文 等对抓取敏感 → 增加超时 + 单次重试 + 内存缓存（短期）
//
// 代理优先级：
//   1) ECHOSUB_WEBDICT_PROXY 环境变量
//   2) HTTPS_PROXY/HTTP_PROXY/no_proxy 环境变量（http.ProxyFromEnvironment）
//   3) 不使用代理（直连）
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
	// 启用判定：必须 BaseURL + APIKey 都有值才启用
	cfg.AI.Enabled = cfg.AI.BaseURL != "" && cfg.AI.APIKey != ""
	if cfg.AI.Enabled {
		fmt.Printf("[INFO] AI 翻译已启用：%s / %s\n", cfg.AI.BaseURL, cfg.AI.Model)
		if cfg.AI.Proxy != "" {
			fmt.Printf("[INFO]   AI 代理：%s\n", cfg.AI.Proxy)
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
	if cfg.WebDict.Proxy != "" {
		fmt.Printf("[INFO] 网页词典代理：%s（超时 %ds, 重试 %d 次, 缓存 %d 分钟）\n",
			cfg.WebDict.Proxy, cfg.WebDict.TimeoutSec, cfg.WebDict.Retries, cfg.WebDict.CacheMinutes)
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
