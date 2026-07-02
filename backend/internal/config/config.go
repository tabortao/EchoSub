package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Config 全局配置
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Media    MediaConfig
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
	Secret    string
	ExpireHours int
}

// MediaConfig 媒体目录配置
type MediaConfig struct {
	Dir         string
	SupportedVideo []string
	SupportedAudio []string
	SupportedSubs  []string
	SupportedImages []string
}

// Default 返回默认配置
func Default() *Config {
	return &Config{
		Server: ServerConfig{
			Port: getEnv("ECHOSUB_PORT", "8080"),
		},
		Database: DatabaseConfig{
			Path: getEnv("ECHOSUB_DB_PATH", filepath.Join("data", "echosub.db")),
		},
		JWT: JWTConfig{
			Secret:      getEnv("ECHOSUB_JWT_SECRET", "change-me-in-production"),
			ExpireHours: 72,
		},
		Media: MediaConfig{
			Dir: getEnv("ECHOSUB_MEDIA_DIR", "/media"),
			SupportedVideo: []string{".mp4", ".mkv", ".mov", ".webm", ".avi"},
			SupportedAudio: []string{".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg"},
			SupportedSubs:  []string{".srt", ".vtt"},
			SupportedImages: []string{".jpg", ".jpeg", ".png", ".webp"},
		},
	}
}

// Load 加载配置（环境变量优先）
func Load() (*Config, error) {
	cfg := Default()
	// 确保数据目录存在
	dbDir := filepath.Dir(cfg.Database.Path)
	if dbDir != "" && dbDir != "." {
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			return nil, fmt.Errorf("创建数据库目录失败: %w", err)
		}
	}
	// 确保媒体目录存在（仅检查，不强制创建）
	if _, err := os.Stat(cfg.Media.Dir); os.IsNotExist(err) {
		// 媒体目录不存在时尝试创建（本地开发场景）
		_ = os.MkdirAll(cfg.Media.Dir, 0755)
	}
	// JWT secret 校验
	if cfg.JWT.Secret == "change-me-in-production" {
		fmt.Println("[WARN] 使用默认 JWT secret，生产环境请通过 ECHOSUB_JWT_SECRET 环境变量修改")
	}
	return cfg, nil
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
