package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/handlers"
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

	// 内置词典 ECDICT（v1.1.0）：启动时异步导入（CSV 存在 + 表为空时）
	handlers.EnsureImported()

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
		// 静态资源目录（Vite 打包后的 JS / CSS / 图片等，文件名带 hash）
		r.Static("/assets", filepath.Join(distDir, "assets"))

		// PWA / 浏览器图标与 manifest —— 必须显式挂载，否则会落到 NoRoute
		// 返回 index.html，iOS Safari 拿到 HTML 文本就无法作为图标识别。
		// 任何一个缺失都会导致「添加到主屏幕」后桌面无图标（iOS 只看 <link rel="apple-touch-icon">）。
		pwaFiles := []string{
			"favicon.ico",
			"favicon-16x16.png",
			"favicon-32x32.png",
			"favicon.svg",
			// iOS / Android 触摸图标
			"apple-touch-icon.png",
			"apple-touch-icon-120x120.png",
			"apple-touch-icon-152x152.png",
			"apple-touch-icon-167x167.png",
			"apple-touch-icon-180x180.png",
			"android-chrome-192x192.png",
			"android-chrome-512x512.png",
			// iOS 启动画面（首次从主屏幕启动时按设备尺寸选择）
			"apple-touch-startup-iphone-x.png",
			"apple-touch-startup-iphone-xr.png",
			"apple-touch-startup-iphone-xsmax.png",
			"apple-touch-startup-iphone-12.png",
			"apple-touch-startup-iphone-12-mini.png",
			"apple-touch-startup-iphone-12-max.png",
			"apple-touch-startup-iphone-14-pro.png",
			"apple-touch-startup-iphone-14-promax.png",
			"apple-touch-startup-ipad.png",
			"apple-touch-startup-ipad-pro-11.png",
			"apple-touch-startup-ipad-pro-129.png",
			// PWA manifest 由下方 r.GET 单独注册（需自定义 MIME），不在此处挂载
			// Windows 磁贴配置
			"browserconfig.xml",
		}
		for _, name := range pwaFiles {
			r.StaticFile("/"+name, filepath.Join(distDir, name))
		}
		// 显式声明 manifest 的 Content-Type —— Gin 默认按扩展名可能推断为 octet-stream，
		// Chrome / Edge 在安装 PWA 前会校验 manifest MIME，必须是 application/manifest+json。
		// iOS 不读 manifest，但 Android / 桌面浏览器必须正确才能「安装应用」。
		// 重新注册以覆盖 StaticFile 的默认 MIME：
		// 1) site.webmanifest 是 public 静态的（VitePWA 兼容）
		// 2) manifest.webmanifest 是 VitePWA 自动生成的（项目实际链接）
		// 两个内容相同，统一从 dist/manifest.webmanifest 读（VitePWA 是单一事实源）
		for _, m := range []string{"/site.webmanifest", "/manifest.webmanifest"} {
			r.GET(m, func(c *gin.Context) {
				c.Header("Content-Type", "application/manifest+json; charset=utf-8")
				c.File(filepath.Join(distDir, "manifest.webmanifest"))
			})
		}

		// SPA 回退：非 API 路由返回 index.html
		r.NoRoute(func(c *gin.Context) {
			c.File(filepath.Join(distDir, "index.html"))
		})
		log.Println("[INFO] 已托管前端静态资源（含 PWA 图标与 manifest）")
	}

	addr := ":" + cfg.Server.Port
	fmt.Printf("EchoSub 服务启动: http://localhost%s\n", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
