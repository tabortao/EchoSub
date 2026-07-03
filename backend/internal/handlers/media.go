package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
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
		if subAlbum := c.Query("sub_album"); subAlbum != "" {
			q = q.Where("sub_album = ?", subAlbum)
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

		// 排序：默认按名称正序（便于按文件名浏览）
		sort := c.DefaultQuery("sort", "name")
		order := c.DefaultQuery("order", "asc")
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

// GetCover 返回媒体封面图片
// 优先返回同目录同名图片；若无则对视频重定向到 stream 端点（前端可用 <video> 显示首帧）；
// 音频无封面时返回 404，前端用图标占位。
func GetCover() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var m models.MediaFile
		if err := database.DB.First(&m, id).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		// 有同名封面图片，直接返回图片
		if m.CoverPath != nil && *m.CoverPath != "" {
			if _, err := os.Stat(*m.CoverPath); err == nil {
				c.Header("Content-Type", coverContentType(*m.CoverPath))
				c.File(*m.CoverPath)
				return
			}
		}
		// 视频无封面图：重定向到流式端点，前端可用 <video preload="metadata"> 显示首帧
		if m.Type == "video" {
			token := c.Query("token")
			loc := "/api/v1/media/" + id + "/stream"
			if token != "" {
				loc += "?token=" + token
			}
			c.Redirect(http.StatusFound, loc)
			return
		}
		// 音频无封面
		utils.Fail(c, http.StatusNotFound, "无封面")
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
			Favorited   bool `json:"favorited"`
		}
		out := make([]sentenceWithProgress, 0, len(sentences))
		for _, s := range sentences {
			p, ok := progressMap[s.Index]
			out = append(out, sentenceWithProgress{
				Sentence:    s,
				Completed:   ok && p.Completed,
				RepeatCount: p.RepeatCount,
				Favorited:   ok && p.Favorited,
			})
		}
		utils.OK(c, gin.H{"sentences": out})
	}
}

// ListAlbums 列出所有专辑（含子专辑），带已看进度。
// played 字段表示该专辑下，当前用户有过播放记录的媒体数量。
func ListAlbums() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)

		type albumRow struct {
			Album  string `json:"album"`
			Count  int64  `json:"count"`
			Played int64  `json:"played"`
		}
		var rows []albumRow
		database.DB.Model(&models.MediaFile{}).
			Select("album, count(*) as count, "+
				"count(case when exists (select 1 from play_records pr where pr.media_id = media_files.id and pr.user_id = ?) then 1 end) as played", uid).
			Where("album IS NOT NULL AND album <> '' AND deleted_at IS NULL").
			Group("album").
			Order("album ASC").
			Scan(&rows)

		type subAlbumRow struct {
			SubAlbum string `json:"sub_album"`
			Count    int64  `json:"count"`
			Played   int64  `json:"played"`
		}
		type albumWithSubs struct {
			Album     string        `json:"album"`
			Count     int64         `json:"count"`
			Played    int64         `json:"played"`
			SubAlbums []subAlbumRow `json:"sub_albums"`
		}
		result := make([]albumWithSubs, 0, len(rows))
		for _, r := range rows {
			var subs []subAlbumRow
			database.DB.Model(&models.MediaFile{}).
				Select("sub_album, count(*) as count, "+
					"count(case when exists (select 1 from play_records pr where pr.media_id = media_files.id and pr.user_id = ?) then 1 end) as played", uid).
				Where("album = ? AND sub_album IS NOT NULL AND sub_album <> '' AND deleted_at IS NULL", r.Album).
				Group("sub_album").
				Order("sub_album ASC").
				Scan(&subs)
			result = append(result, albumWithSubs{Album: r.Album, Count: r.Count, Played: r.Played, SubAlbums: subs})
		}
		utils.OK(c, gin.H{"albums": result})
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

// coverContentType 根据封面文件扩展名返回 Content-Type
func coverContentType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return "application/octet-stream"
	}
}

// browseEntry 目录浏览条目
type browseEntry struct {
	Name  string `json:"name"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

// BrowseMedia 列出媒体根目录下指定子路径的目录和文件
// 用于上传页面展示已有目录结构与文件，避免暴露绝对路径。
// path 参数统一使用 / 作为分隔符（前端友好），后端内部转换为 OS 路径。
func BrowseMedia(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		root := filepath.Clean(cfg.Media.Dir)
		sub := c.DefaultQuery("path", "")
		// 将前端传入的 / 分隔路径转为 OS 路径再 Clean，防止路径穿越
		osSub := filepath.Clean(filepath.FromSlash(sub))
		full := filepath.Join(root, osSub)
		// 安全校验：必须位于 root 之下（或等于 root）
		if !strings.HasPrefix(full+string(filepath.Separator), root+string(filepath.Separator)) && full != root {
			utils.Fail(c, http.StatusBadRequest, "非法路径")
			return
		}
		entries, err := os.ReadDir(full)
		if err != nil {
			utils.Fail(c, http.StatusNotFound, "目录不存在")
			return
		}
		dirs := make([]browseEntry, 0)
		files := make([]browseEntry, 0)
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), ".") {
				continue // 跳过隐藏文件
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			en := browseEntry{
				Name:  e.Name(),
				IsDir: e.IsDir(),
				Size:  info.Size(),
			}
			if e.IsDir() {
				dirs = append(dirs, en)
			} else {
				files = append(files, en)
			}
		}
		// 返回的 path 统一用 / 分隔（前端按 / 分割做面包屑）
		returnPath := filepath.ToSlash(osSub)
		if returnPath == "." {
			returnPath = ""
		}
		utils.OK(c, gin.H{"dirs": dirs, "files": files, "path": returnPath})
	}
}

// UploadMedia 接收 multipart 上传，保存到媒体目录的指定子路径。
// 表单字段：path（目标相对目录，可空=根目录）、files（多文件）。
// 保存后 fsnotify watcher 会自动入库，无需手动触发扫描。
func UploadMedia(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		root := filepath.Clean(cfg.Media.Dir)
		sub := c.PostForm("path")
		// 前端传入的 path 用 / 分隔，转为 OS 路径再 Clean
		targetDir := filepath.Join(root, filepath.Clean(filepath.FromSlash(sub)))
		if !strings.HasPrefix(targetDir+string(filepath.Separator), root+string(filepath.Separator)) && targetDir != root {
			utils.Fail(c, http.StatusBadRequest, "非法目标路径")
			return
		}
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建目录失败: "+err.Error())
			return
		}
		form, err := c.MultipartForm()
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "上传表单错误: "+err.Error())
			return
		}
		files := form.File["files"]
		if len(files) == 0 {
			utils.Fail(c, http.StatusBadRequest, "未选择文件")
			return
		}
		saved := make([]string, 0, len(files))
		skipped := make([]string, 0)
		for _, f := range files {
			name := filepath.Base(f.Filename) // 防止路径穿越
			if name == "." || name == "" {
				continue
			}
			dst := filepath.Join(targetDir, name)
			if _, err := os.Stat(dst); err == nil {
				skipped = append(skipped, name+" (已存在，跳过)")
				continue
			}
			if err := c.SaveUploadedFile(f, dst); err != nil {
				utils.Fail(c, http.StatusInternalServerError, "保存失败 "+name+": "+err.Error())
				return
			}
			saved = append(saved, name)
		}
		utils.OK(c, gin.H{"saved": saved, "skipped": skipped, "count": len(saved), "path": filepath.ToSlash(sub)})
	}
}
