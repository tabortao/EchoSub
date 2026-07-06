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

	// v1.3.1：把 config 注入到 handlers 全局，供 LookupWebDict / AI 等无 cfg 参数的 handler 使用
	handlers.SetGlobalConfig(cfg)

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
			media.POST("/mkdir", handlers.MkdirMedia(cfg))
			media.DELETE("/dir", handlers.DeleteDir(cfg))
			media.DELETE("/file", handlers.DeleteFile(cfg))
			media.PUT("/path/rename", handlers.RenamePath(cfg))
			media.PUT("/path/move", handlers.MovePath(cfg))
			media.GET("/:id", handlers.GetMedia())
			media.GET("/:id/stream", handlers.StreamMedia())
			media.GET("/:id/cover", handlers.GetCover())
			media.GET("/:id/subtitle", handlers.GetSubtitle())
			// 字幕编辑写回：客户端传完整句子数组，原子写回原 SRT/VTT 文件（v0.8.0）
			media.PUT("/:id/subtitle", handlers.UpdateSubtitle())
			media.POST("/:id/tags", handlers.AssignTags())
			media.PUT("/:id/rename", handlers.RenameMedia(cfg))
			media.DELETE("/:id", handlers.DeleteMedia(cfg))
			// 文件备注（用户对单个媒体的 markdown 笔记）
			media.GET("/:id/remark", handlers.GetRemark())
			media.PUT("/:id/remark", handlers.UpsertRemark())
			media.DELETE("/:id/remark", handlers.DeleteRemark())
		}
		authed.GET("/albums", handlers.ListAlbums())
		authed.PUT("/albums/rename", handlers.RenameAlbum(cfg))
		authed.DELETE("/albums", handlers.DeleteAlbum(cfg))
		authed.POST("/albums/:name/pin", handlers.ToggleAlbumPin())
		// 专辑 / 季 封面 + 横幅（Emby 风格：folder.jpg / banner.jpg）
		authed.POST("/albums/:name/cover", handlers.UploadAlbumCover(cfg))
		authed.GET("/albums/:name/cover", handlers.ServeAlbumCover(cfg))
		authed.GET("/albums/:name/banner", handlers.ServeAlbumBanner(cfg))
		// 季删除：DELETE /albums/:name/sub/:sub（X-Delete-Password 校验）
		authed.DELETE("/albums/:name/sub/:sub", handlers.DeleteSeason(cfg))

		// 标签
		tags := authed.Group("/tags")
		{
			tags.GET("", handlers.ListTags())
			tags.POST("", handlers.CreateTag())
			tags.PUT("/:id", handlers.UpdateTag())
			tags.DELETE("/:id", handlers.DeleteTag())
			// 多态标签关联（专辑 / 季 / 学习页 / 媒体）
			tags.POST("/:id/attach", handlers.AttachEntityTag())
			tags.POST("/:id/detach", handlers.DetachEntityTag())
			tags.GET("/:id/entities", handlers.ListEntitiesByTag())
			tags.GET("/entity", handlers.GetEntityTags())
			tags.PUT("/entity", handlers.SetEntityTags())
		}

		// 学习记录
		records := authed.Group("/records")
		{
			records.GET("", handlers.ListRecords())
			records.GET("/recent", handlers.ListRecent())
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
			notes.POST("/:id/pin", handlers.ToggleNotePin())
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

		// AI 翻译（v0.8.0）+ 连通性测试（v0.8.1）+ 字典与句子解释（v0.9.0）
		aiH := handlers.NewAIHandler(cfg)
		ai := authed.Group("/ai")
		{
			ai.POST("/translate", aiH.Translate)
			ai.GET("/status", aiH.Status)
			ai.POST("/test", aiH.Test)
			// 字典与句子解释（v0.9.0）
			ai.POST("/dictionary", aiH.Dictionary)
			ai.POST("/sentence-explain", aiH.ExplainSentence)
		}

		// 本地词典（v0.9.1）：用户上传 CSV → 查词
		dictH := handlers.NewLocalDictHandler(cfg)
		dict := authed.Group("/dictionary")
		{
			dict.GET("/local", dictH.ListLocalDicts)
			dict.GET("/local/status", dictH.LocalDictStatus)
			dict.POST("/local/upload", dictH.UploadLocalDict)
			dict.POST("/local/lookup", dictH.LookupLocalDict)
			dict.DELETE("/local/:id", dictH.DeleteLocalDict)

			// 内置词典 ECDICT（v1.1.0）：后端启动时从 CSV 自动导入
			builtinH := handlers.NewBuiltinDictHandler(cfg)
			dict.GET("/builtin/status", builtinH.Status)
			dict.GET("/builtin/lookup", builtinH.Lookup)
			dict.POST("/builtin/reload", builtinH.Reload)

			// 网页词典抓取（v1.3.0）：后端 fetch + 清洗 HTML，让前端在弹窗中渲染
			dict.GET("/web/lookup", handlers.LookupWebDict())
		}

		// 单词收藏（v1.3.0）：用户在查词弹窗中可收藏单词；侧边栏「收藏」页统一展示
		authed.POST("/word-favorites", handlers.CreateWordFavorite())
		authed.GET("/word-favorites", handlers.ListWordFavorites())
		authed.GET("/word-favorites/check", handlers.CheckWordFavorites())
		authed.PATCH("/word-favorites/:id", handlers.UpdateWordFavoriteNote())
		authed.DELETE("/word-favorites/:id", handlers.DeleteWordFavorite())

		// 多阶段学习复习体系（v1.0.0）
		//
		// 路由说明：
		//   /media/:id/learning-progress/*   单个媒体的学习进度
		//   /media/:id/difficult-sentences   单个媒体的难句标记
		//   /learning/review-queue           待复习列表
		//   /learning/stats                  学习统计
		learningH := handlers.NewLearningHandler()
		authed.GET("/media/:id/learning-progress", learningH.GetLearningProgress)
		authed.POST("/media/:id/learning-progress/advance", learningH.AdvanceLearningProgress)
		authed.POST("/media/:id/learning-progress/skip", learningH.SkipLearningProgress)
		authed.POST("/media/:id/learning-progress/pause", learningH.PauseLearningProgress)
		authed.POST("/media/:id/learning-progress/resume", learningH.ResumeLearningProgress)
		authed.GET("/media/:id/difficult-sentences", learningH.ListDifficultSentences)
		authed.POST("/media/:id/difficult-sentences", learningH.MarkDifficultSentence)
		authed.GET("/learning/review-queue", learningH.ListReviewQueue)
		authed.GET("/learning/stats", learningH.GetLearningStats)
	}
}
