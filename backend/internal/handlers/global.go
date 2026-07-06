package handlers

import (
	"compress/flate"
	"compress/gzip"
	"io"

	"github.com/andybalholm/brotli"

	"github.com/yaole/EchoSub/backend/internal/config"
)

// 全局配置：v1.3.1 起注入；用于无需依赖参数注入的 handler（如 LookupWebDict）
var globalConfig *config.Config

// SetGlobalConfig 注入全局配置（router 启动时调用一次）
func SetGlobalConfig(cfg *config.Config) {
	globalConfig = cfg
}

// GetGlobalConfig 获取全局配置；缺省返回 nil（调用方需自行 fallback）
func GetGlobalConfig() *config.Config {
	return globalConfig
}

// newGzipReader 构造 gzip.Reader，自动关闭底层流
func newGzipReader(r io.Reader) (io.Reader, error) {
	gr, err := gzip.NewReader(r)
	if err != nil {
		return nil, err
	}
	return gr, nil
}

// newDeflateReader 构造 flate reader（处理 zlib / raw deflate）
func newDeflateReader(r io.Reader) (io.Reader, error) {
	// 直接使用 flate（接受 raw deflate / zlib 自动协商）
	return flate.NewReader(r), nil
}

// newBrotliReader 构造 brotli reader
func newBrotliReader(r io.Reader) (io.Reader, error) {
	return brotli.NewReader(r), nil
}
