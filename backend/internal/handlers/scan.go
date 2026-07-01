package handlers

import (
	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/scanner"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// ScanHandlers 扫描相关接口
type ScanHandlers struct {
	scanner *scanner.Scanner
}

// NewScanHandlers 创建扫描处理器
func NewScanHandlers(s *scanner.Scanner) *ScanHandlers {
	return &ScanHandlers{scanner: s}
}

// Trigger 触发一次全量扫描
func (h *ScanHandlers) Trigger() gin.HandlerFunc {
	return func(c *gin.Context) {
		go func() {
			_ = h.scanner.ScanFull()
		}()
		utils.OK(c, gin.H{"message": "扫描已触发"})
	}
}

// Status 扫描状态
func (h *ScanHandlers) Status() gin.HandlerFunc {
	return func(c *gin.Context) {
		utils.OK(c, gin.H{"scanning": h.scanner.IsScanning()})
	}
}
