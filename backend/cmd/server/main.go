package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/router"
	"github.com/yaole/EchoSub/backend/internal/scanner"
)

func main() {
	// 加载配置
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	// 初始化数据库
	if err := database.Init(cfg); err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}

	// 媒体扫描器
	sc := scanner.New(cfg)
	if err := sc.ScanFull(); err != nil {
		log.Printf("[WARN] 初始扫描失败: %v", err)
	}
	if err := sc.StartWatcher(); err != nil {
		log.Printf("[WARN] 启动目录监控失败: %v", err)
	}
	defer sc.Stop()

	// 启动 HTTP 服务
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.Default()
	router.Setup(cfg, r, sc)

	// 托管前端静态资源（生产环境构建后存在 frontend/dist）
	distDir := "frontend/dist"
	if _, err := os.Stat(distDir); err == nil {
		r.Static("/assets", filepath.Join(distDir, "assets"))
		r.StaticFile("/favicon.ico", filepath.Join(distDir, "favicon.ico"))
		// SPA 回退：非 API 路由返回 index.html
		r.NoRoute(func(c *gin.Context) {
			c.File(filepath.Join(distDir, "index.html"))
		})
		log.Println("[INFO] 已托管前端静态资源")
	}

	addr := ":" + cfg.Server.Port
	fmt.Printf("EchoSub 服务启动: http://localhost%s\n", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
