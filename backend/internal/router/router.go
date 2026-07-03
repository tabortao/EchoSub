package router

import (
	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/handlers"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/scanner"
)

// Setup 注册所有路由
func Setup(cfg *config.Config, r *gin.Engine, sc *scanner.Scanner) {
	r.Use(middleware.CORS())

	api := r.Group("/api/v1")

	// 公开路由
	auth := api.Group("/auth")
	{
		auth.POST("/register", handlers.Register(cfg))
		auth.POST("/login", handlers.Login(cfg))
	}

	// 健康检查
	api.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 需鉴权的路由
	authed := api.Group("")
	authed.Use(middleware.AuthRequired(cfg))
	{
		authed.GET("/auth/me", handlers.Me())
		authed.PUT("/auth/password", handlers.ChangePassword())
		authed.PUT("/auth/profile", handlers.UpdateProfile())
		authed.POST("/auth/avatar", handlers.UploadAvatar(cfg))
		authed.GET("/auth/avatar", handlers.ServeAvatar(cfg))

		// 媒体
		media := authed.Group("/media")
		{
			media.GET("", handlers.ListMedia())
			media.GET("/browse", handlers.BrowseMedia(cfg))
			media.POST("/upload", handlers.UploadMedia(cfg))
			media.GET("/:id", handlers.GetMedia())
			media.GET("/:id/stream", handlers.StreamMedia())
			media.GET("/:id/cover", handlers.GetCover())
			media.GET("/:id/subtitle", handlers.GetSubtitle())
			media.POST("/:id/tags", handlers.AssignTags())
			media.PUT("/:id/rename", handlers.RenameMedia(cfg))
			media.DELETE("/:id", handlers.DeleteMedia(cfg))
		}
		authed.GET("/albums", handlers.ListAlbums())
		authed.PUT("/albums/rename", handlers.RenameAlbum(cfg))
		authed.DELETE("/albums", handlers.DeleteAlbum(cfg))

		// 标签
		tags := authed.Group("/tags")
		{
			tags.GET("", handlers.ListTags())
			tags.POST("", handlers.CreateTag())
			tags.PUT("/:id", handlers.UpdateTag())
			tags.DELETE("/:id", handlers.DeleteTag())
		}

		// 学习记录
		records := authed.Group("/records")
		{
			records.GET("", handlers.ListRecords())
			records.GET("/stats", handlers.GetStudyStats())
			records.PUT("/:mediaId", handlers.UpdateRecord())
			records.GET("/:mediaId", handlers.GetRecord())
			records.PUT("/:mediaId/sentences/:idx", handlers.UpdateSentenceProgress())
			// 句子收藏（重难点句子）
			records.POST("/:mediaId/sentences/:idx/favorite", handlers.ToggleFavorite())
			// 句子播放遍数 +1（自然推进时由前端调用）
			records.POST("/:mediaId/sentences/:idx/repeat", handlers.IncrementSentenceRepeat())
		}
		authed.GET("/progress", handlers.GetProgress())

		// 学习页面（专辑内自定义笔记 + 多图 + markdown）
		notes := authed.Group("/notes")
		{
			notes.GET("", handlers.ListNotes(cfg))
			notes.POST("", handlers.CreateNote(cfg))
			notes.GET("/:id", handlers.GetNote(cfg))
			notes.PUT("/:id", handlers.UpdateNote(cfg))
			notes.DELETE("/:id", handlers.DeleteNote(cfg))
			notes.POST("/:id/images", handlers.UploadNoteImage(cfg))
			notes.DELETE("/:id/images/:filename", handlers.DeleteNoteImage(cfg))
			notes.GET("/:id/images/:filename", handlers.ServeNoteImage(cfg))
		}

		// 设置
		settings := authed.Group("/settings")
		{
			settings.GET("", handlers.GetSettings())
			settings.PUT("", handlers.UpdateSettings())
		}

		// 扫描
		scanH := handlers.NewScanHandlers(sc)
		scan := authed.Group("/scan")
		{
			scan.POST("/trigger", scanH.Trigger())
			scan.GET("/status", scanH.Status())
		}
	}
}
