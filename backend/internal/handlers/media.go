package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
	"github.com/yaole/EchoSub/backend/pkg/subtitle"
)

// ListMedia 列出媒体，支持 album/tag/keyword 过滤与排序
func ListMedia() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		q := database.DB.Model(&models.MediaFile{}).Preload("Tags", "user_id = ?", uid)

		if album := c.Query("album"); album != "" {
			q = q.Where("album = ?", album)
		}
		if typ := c.Query("type"); typ != "" {
			q = q.Where("type = ?", typ)
		}
		if kw := c.Query("keyword"); kw != "" {
			q = q.Where("name LIKE ?", "%"+kw+"%")
		}
		if tagID := c.Query("tag_id"); tagID != "" {
			q = q.Joins("JOIN media_tags ON media_tags.media_file_id = media_files.id").
				Where("media_tags.tag_id = ?", tagID)
		}

		// 排序：默认按 file_modified_at 倒序（存入时间）
		sort := c.DefaultQuery("sort", "file_modified_at")
		order := c.DefaultQuery("order", "desc")
		if !isValidOrder(order) {
			order = "desc"
		}
		q = q.Order(fmt.Sprintf("%s %s", sort, order))

		// 分页
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
		if page < 1 {
			page = 1
		}
		if size < 1 || size > 200 {
			size = 50
		}
		var total int64
		q.Count(&total)
		var list []models.MediaFile
		if err := q.Offset((page - 1) * size).Limit(size).Find(&list).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
			return
		}

		// 附加当前用户的播放进度
		result := make([]gin.H, 0, len(list))
		for _, m := range list {
			var rec models.PlayRecord
			database.DB.Where("user_id = ? AND media_id = ?", uid, m.ID).First(&rec)
			result = append(result, gin.H{
				"media":         m,
				"play_count":    rec.PlayCount,
				"last_position": rec.LastPosition,
				"last_played_at": rec.LastPlayedAt,
			})
		}
		utils.OK(c, gin.H{"list": result, "total": total, "page": page, "size": size})
	}
}

// GetMedia 获取单个媒体详情
func GetMedia() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var m models.MediaFile
		if err := database.DB.Preload("Tags", "user_id = ?", uid).First(&m, id).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		var rec models.PlayRecord
		database.DB.Where("user_id = ? AND media_id = ?", uid, m.ID).First(&rec)
		utils.OK(c, gin.H{
			"media":          m,
			"play_count":     rec.PlayCount,
			"last_position":  rec.LastPosition,
			"last_played_at": rec.LastPlayedAt,
		})
	}
}

// StreamMedia 流式输出媒体文件，支持 HTTP Range
func StreamMedia() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var m models.MediaFile
		if err := database.DB.First(&m, id).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		if _, err := os.Stat(m.Path); err != nil {
			utils.Fail(c, http.StatusNotFound, "文件不存在于磁盘")
			return
		}
		// 在 c.File 之前设置 Content-Type（http.ServeFile 不会覆盖已设置的值）
		c.Header("Content-Type", contentTypeFor(m))
		c.File(m.Path)
	}
}

// GetSubtitle 获取媒体对应字幕（解析后句子数组）
func GetSubtitle() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var m models.MediaFile
		if err := database.DB.First(&m, id).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		if m.SubtitlePath == nil || *m.SubtitlePath == "" {
			utils.Fail(c, http.StatusNotFound, "无字幕文件")
			return
		}
		sentences, err := subtitle.ParseFile(*m.SubtitlePath)
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "解析字幕失败: "+err.Error())
			return
		}
		// 附加用户句子进度
		uid := middleware.GetUserID(c)
		var progress []models.SentenceProgress
		database.DB.Where("user_id = ? AND media_id = ?", uid, m.ID).Find(&progress)
		progressMap := map[int]models.SentenceProgress{}
		for _, p := range progress {
			progressMap[p.SentenceIndex] = p
		}
		type sentenceWithProgress struct {
			subtitle.Sentence
			Completed   bool `json:"completed"`
			RepeatCount int  `json:"repeat_count"`
		}
		out := make([]sentenceWithProgress, 0, len(sentences))
		for _, s := range sentences {
			p, ok := progressMap[s.Index]
			out = append(out, sentenceWithProgress{
				Sentence:    s,
				Completed:   ok && p.Completed,
				RepeatCount: p.RepeatCount,
			})
		}
		utils.OK(c, gin.H{"sentences": out})
	}
}

// ListAlbums 列出所有专辑
func ListAlbums() gin.HandlerFunc {
	return func(c *gin.Context) {
		type albumRow struct {
			Album    string `json:"album"`
			Count    int64  `json:"count"`
		}
		var rows []albumRow
		database.DB.Model(&models.MediaFile{}).
			Select("album, count(*) as count").
			Where("album IS NOT NULL AND album <> ''").
			Group("album").
			Order("album ASC").
			Scan(&rows)
		utils.OK(c, gin.H{"albums": rows})
	}
}

func isValidOrder(o string) bool {
	return o == "asc" || o == "desc"
}

func contentTypeFor(m models.MediaFile) string {
	ext := strings.ToLower(filepath.Ext(m.Name))
	switch ext {
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mkv":
		return "video/x-matroska"
	case ".mov":
		return "video/quicktime"
	case ".avi":
		return "video/x-msvideo"
	case ".mp3":
		return "audio/mpeg"
	case ".m4a":
		return "audio/mp4"
	case ".aac":
		return "audio/aac"
	case ".wav":
		return "audio/wav"
	case ".flac":
		return "audio/flac"
	case ".ogg":
		return "audio/ogg"
	default:
		return "application/octet-stream"
	}
}
