package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
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

// ListMedia 列出媒体，支持 album/tag/keyword 过滤与排序。
// 同目录同名（仅扩展名不同）的 video + audio 自动配对，配对的 audio 在列表中隐藏，
// 由 video 的 paired_media_id 指向它，播放器内可在 video/audio tab 间切换。
func ListMedia() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		q := database.DB.Model(&models.MediaFile{}).Preload("Tags", "user_id = ?", uid).
			Where("NOT (type = ? AND id IN (SELECT paired_media_id FROM media_files WHERE paired_media_id IS NOT NULL AND deleted_at IS NULL))", "audio")

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

// GetMedia 获取单个媒体详情。
// 若当前媒体被配对为 video（含 paired_media_id）或自身为 audio 且存在引用它的 video，
// 返回 paired_media 字段（媒体基础信息），供播放器展示 video/audio 切换 tab。
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

		// 查找配对的另一种类型媒体：当前是 video 找其 paired_media_id；当前是 audio 找引用它的 video
		var paired *models.MediaFile
		if m.Type == "video" && m.PairedMediaID != nil {
			database.DB.First(&paired, *m.PairedMediaID)
		} else if m.Type == "audio" {
			database.DB.Where("paired_media_id = ? AND deleted_at IS NULL", m.ID).First(&paired)
		}

		resp := gin.H{
			"media":          m,
			"play_count":     rec.PlayCount,
			"last_position":  rec.LastPosition,
			"last_played_at": rec.LastPlayedAt,
		}
		if paired != nil {
			resp["paired_media"] = gin.H{
				"id":   paired.ID,
				"name": paired.Name,
				"type": paired.Type,
				"path": paired.Path,
			}
		}
		utils.OK(c, resp)
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

// ListAlbums 列出所有专辑（含子专辑），带已看进度、封面、横幅与描述。
// played 字段表示该专辑下，当前用户有过播放记录的媒体数量。
// 同目录同名 video+audio 视为配对，列表计数时只算 video 一份，避免重复。
// 封面 / 横幅来自 AlbumMeta 表（folder.jpg / banner.jpg / season.nfo 等 Emby 风格元数据）。
func ListAlbums() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)

		// 排除被配对的 audio（id 出现在其他 video 的 paired_media_id 字段中）
		excludePaired := "AND id NOT IN (SELECT paired_media_id FROM media_files WHERE paired_media_id IS NOT NULL AND deleted_at IS NULL AND type = 'video')"

		type albumRow struct {
			Album  string `json:"album"`
			Count  int64  `json:"count"`
			Played int64  `json:"played"`
		}
		var rows []albumRow
		database.DB.Model(&models.MediaFile{}).
			Select("album, count(*) as count, "+
				"count(case when exists (select 1 from play_records pr where pr.media_id = media_files.id and pr.user_id = ?) then 1 end) as played", uid).
			Where("album IS NOT NULL AND album <> '' AND deleted_at IS NULL "+excludePaired).
			Group("album").
			Order("album ASC").
			Scan(&rows)

		// 拉取当前用户置顶的专辑（按 sort 升序）——置顶专辑排在最前
		var pinList []models.AlbumPin
		database.DB.Where("user_id = ?", uid).Order("sort ASC").Find(&pinList)
		pinnedSet := make(map[string]bool, len(pinList))
		for _, p := range pinList {
			pinnedSet[p.Album] = true
		}

		// 一次性拉取所有 AlbumMeta（按 album 名映射到子专辑数组）
		allMeta := make(map[string][]models.AlbumMeta)
		var metas []models.AlbumMeta
		database.DB.Find(&metas)
		for _, m := range metas {
			allMeta[m.Album] = append(allMeta[m.Album], m)
		}

		type subAlbumRow struct {
			SubAlbum    string        `json:"sub_album"`
			Count       int64         `json:"count"`
			Played      int64         `json:"played"`
			CoverPath   *string       `json:"cover_path"`
			BannerPath  *string       `json:"banner_path"`
			Description string        `json:"description"`
			Tags        []models.Tag  `json:"tags"`
			MetaID      uint          `json:"meta_id"` // AlbumMeta.ID，用于标签 attach/detach
		}
		type albumWithSubs struct {
			Album       string        `json:"album"`
			Count       int64         `json:"count"`
			Played      int64         `json:"played"`
			HasSeasons  bool          `json:"has_seasons"` // true 当专辑下存在 sub_album
			CoverPath   *string       `json:"cover_path"`   // 专辑本身封面（来自 AlbumMeta）
			BannerPath  *string       `json:"banner_path"`
			Description string        `json:"description"`
			Pinned      bool          `json:"pinned"` // 用户是否置顶
			PinOrder    int           `json:"pin_order"` // 置顶顺序（值越小越靠前；未置顶 = -1）
			Tags        []models.Tag  `json:"tags"`
			MetaID      uint          `json:"meta_id"` // 专辑对应的 AlbumMeta.ID（sub_album=""）
			SubAlbums   []subAlbumRow `json:"sub_albums"`
		}
		// buildSubs 构造某专辑的子专辑列表：
		// 1. 先用 MediaFile 聚合（count/played）
		// 2. 再合并 AlbumMeta 中只有封面/横幅但无媒体的「期望季」（Emby 部分刮削常见）
		// 这样即使磁盘上 Season 2 目录还不存在，只要 season02-poster.jpg 存在，
		// 前端也能看到「Season 2」占位卡片，方便用户后续补资源。
		// 3. 季自身无 banner 时继承专辑根的 banner（Emby 风格：所有季共用专辑横幅）
		buildSubs := func(albumName string, albumBanner *string) []subAlbumRow {
			var subs []subAlbumRow
			database.DB.Model(&models.MediaFile{}).
				Select("sub_album, count(*) as count, "+
					"count(case when exists (select 1 from play_records pr where pr.media_id = media_files.id and pr.user_id = ?) then 1 end) as played", uid).
				Where("album = ? AND sub_album IS NOT NULL AND sub_album <> '' AND deleted_at IS NULL "+excludePaired, albumName).
				Group("sub_album").
				Order("sub_album ASC").
				Scan(&subs)
			existing := make(map[string]bool, len(subs))
			for _, s := range subs {
				existing[s.SubAlbum] = true
			}
			for _, m := range allMeta[albumName] {
				if m.SubAlbum == "" || existing[m.SubAlbum] {
					continue
				}
				subs = append(subs, subAlbumRow{
					SubAlbum:    m.SubAlbum,
					Count:       0,
					Played:      0,
					CoverPath:   m.CoverPath,
					// 期望季自身无 banner 时继承专辑横幅
					BannerPath:  pickBanner(m.BannerPath, albumBanner),
					Description: m.Description,
					MetaID:      m.ID,
				})
				existing[m.SubAlbum] = true
			}
			// 关联 AlbumMeta 元数据（cover/banner/description/meta_id）
			for i := range subs {
				for _, m := range allMeta[albumName] {
					if m.SubAlbum == subs[i].SubAlbum {
						if m.CoverPath != nil {
							subs[i].CoverPath = m.CoverPath
						}
						// 季自身 banner 优先；缺失时回退到专辑横幅
						if m.BannerPath != nil {
							subs[i].BannerPath = m.BannerPath
						} else if subs[i].BannerPath == nil {
							subs[i].BannerPath = albumBanner
						}
						if m.Description != "" {
							subs[i].Description = m.Description
						}
						// 取 AlbumMeta.ID 用于标签关联（每个季是独立的实体）
						if m.ID != 0 {
							subs[i].MetaID = m.ID
						}
						break
					}
				}
				// 兜底：季仍无 banner（如「Season 1」内无 banner，磁盘上只有 album 根的 banner.jpg），
				// 直接继承专辑横幅，保证专辑页与季页都能展示统一的横幅。
				if subs[i].BannerPath == nil {
					subs[i].BannerPath = albumBanner
				}
			}
			// 排序：按自然季号升序（"Season 1" 在 "Season 2" 前，"Season 10" 在 "Season 2" 后）
			sort.SliceStable(subs, func(i, j int) bool {
				return seasonLess(subs[i].SubAlbum, subs[j].SubAlbum)
			})
			return subs
		}
		// 行 → 完整结构（按置顶优先 + 名字）
		rowMap := make(map[string]albumRow, len(rows))
		for _, r := range rows {
			rowMap[r.Album] = r
		}
		result := make([]albumWithSubs, 0, len(rows))
		// 先把置顶项按 sort 顺序加入
		pinOrderIdx := make(map[string]int, len(pinList))
		for i, p := range pinList {
			pinOrderIdx[p.Album] = i
		}
		added := make(map[string]bool)
		for _, p := range pinList {
			r, ok := rowMap[p.Album]
			if !ok {
				continue
			}
			added[p.Album] = true
			// 专辑本体的封面 / 横幅
			var albumCover, albumBanner *string
			var albumDesc string
			var albumMetaID uint
			for _, m := range allMeta[r.Album] {
				if m.SubAlbum == "" {
					albumCover = m.CoverPath
					albumBanner = m.BannerPath
					albumDesc = m.Description
					albumMetaID = m.ID
					break
				}
			}
			subs := buildSubs(r.Album, albumBanner)
			result = append(result, albumWithSubs{
				Album: r.Album, Count: r.Count, Played: r.Played,
				HasSeasons: len(subs) > 0,
				CoverPath:  albumCover, BannerPath: albumBanner, Description: albumDesc,
				Pinned:   true,
				PinOrder: pinOrderIdx[r.Album],
				MetaID:   albumMetaID,
				SubAlbums: subs,
			})
		}
		// 再把未置顶项按名字加入
		for _, r := range rows {
			if added[r.Album] {
				continue
			}
			// 专辑本体的封面 / 横幅
			var albumCover, albumBanner *string
			var albumDesc string
			var albumMetaID uint
			for _, m := range allMeta[r.Album] {
				if m.SubAlbum == "" {
					albumCover = m.CoverPath
					albumBanner = m.BannerPath
					albumDesc = m.Description
					albumMetaID = m.ID
					break
				}
			}
			subs := buildSubs(r.Album, albumBanner)
			result = append(result, albumWithSubs{
				Album: r.Album, Count: r.Count, Played: r.Played,
				HasSeasons: len(subs) > 0,
				CoverPath:  albumCover, BannerPath: albumBanner, Description: albumDesc,
				Pinned:    false,
				PinOrder:  -1,
				MetaID:    albumMetaID,
				SubAlbums: subs,
			})
		}

		// 一次性加载所有专辑和季的标签，避免 N+1 查询
		albumMetaIDs := make([]uint, 0)
		seasonMetaIDs := make([]uint, 0)
		for _, a := range result {
			if a.MetaID != 0 {
				albumMetaIDs = append(albumMetaIDs, a.MetaID)
			}
			for _, s := range a.SubAlbums {
				if s.MetaID != 0 {
					seasonMetaIDs = append(seasonMetaIDs, s.MetaID)
				}
			}
		}
		albumTagMap := LoadTagsForEntities(uid, models.EntityTypeAlbum, albumMetaIDs)
		seasonTagMap := LoadTagsForEntities(uid, models.EntityTypeSeason, seasonMetaIDs)
		for i := range result {
			result[i].Tags = albumTagMap[result[i].MetaID]
			if result[i].Tags == nil {
				result[i].Tags = []models.Tag{}
			}
			for j := range result[i].SubAlbums {
				result[i].SubAlbums[j].Tags = seasonTagMap[result[i].SubAlbums[j].MetaID]
				if result[i].SubAlbums[j].Tags == nil {
					result[i].SubAlbums[j].Tags = []models.Tag{}
				}
			}
		}

		utils.OK(c, gin.H{"albums": result})
	}
}

// pickBanner 优先返回 first（季自身 banner），否则返回 fallback（专辑横幅）。
func pickBanner(first, fallback *string) *string {
	if first != nil {
		return first
	}
	return fallback
}

// seasonLess 比较两个子专辑名，按自然季号升序：
//   "Season 1" < "Season 2" < "Season 10"；同名子专辑维持原顺序。
// 非 "Season N" 形式的子专辑退化为字典序排在末尾。
func seasonLess(a, b string) bool {
	na, oka := seasonNumber(a)
	nb, okb := seasonNumber(b)
	if oka && okb {
		return na < nb
	}
	if oka != okb {
		// 不都是 Season N：有编号的排前面
		return oka
	}
	return a < b
}

// seasonNumber 解析 "Season 1" / "season01" / "S02" 等为整数。
// 解析失败返回 0, false。
func seasonNumber(name string) (int, bool) {
	lower := strings.ToLower(strings.TrimSpace(name))
	for _, prefix := range []string{"season ", "season"} {
		if strings.HasPrefix(lower, prefix) {
			num := strings.TrimSpace(strings.TrimPrefix(lower, prefix))
			num = strings.TrimLeft(num, "0")
			if num == "" {
				return 0, true
			}
			n, err := strconv.Atoi(num)
			if err == nil {
				return n, true
			}
		}
	}
	if lower != "" && (lower[0] == 's') {
		num := strings.TrimLeft(lower[1:], "0")
		if num == "" {
			return 0, true
		}
		n, err := strconv.Atoi(num)
		if err == nil {
			return n, true
		}
	}
	return 0, false
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
