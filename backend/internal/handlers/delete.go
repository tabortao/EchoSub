package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// 关联文件扩展名（删除媒体时一并清理同目录同 basename 的这些文件）
var deleteAssociatedExts = map[string]bool{
	".srt": true, ".vtt": true,
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true,
}

// DeleteMedia 删除单个媒体文件及其关联字幕/封面，并软删除数据库记录。
// 路由: DELETE /media/:id
func DeleteMedia(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !verifyUserPassword(c) {
			return
		}
		id := c.Param("id")
		var m models.MediaFile
		if err := database.DB.First(&m, id).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}

		dir := filepath.Dir(m.Path)
		ext := filepath.Ext(m.Name)
		oldBase := strings.TrimSuffix(m.Name, ext)

		// 1. 删除媒体文件本身（容忍不存在）
		_ = os.Remove(m.Path)

		// 2. 删除同目录同 basename 的字幕/封面文件
		entries, err := os.ReadDir(dir)
		if err == nil {
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				eName := e.Name()
				eExt := strings.ToLower(filepath.Ext(eName))
				if !deleteAssociatedExts[eExt] {
					continue
				}
				eBase := strings.TrimSuffix(eName, filepath.Ext(eName))
				if strings.EqualFold(eBase, oldBase) {
					_ = os.Remove(filepath.Join(dir, eName))
				}
			}
		}

		// 3. 软删除数据库记录（GORM Delete 设置 deleted_at）
		// 关联的 SentenceProgress / PlayRecord 保留（历史记录），不级联删除
		if err := database.DB.Delete(&m).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "删除数据库记录失败: "+err.Error())
			return
		}
		// 4. 清理配对关系：若被删的是 audio，引用它的 video 需清空 paired_media_id 让其独立展示
		database.DB.Model(&models.MediaFile{}).
			Where("paired_media_id = ?", m.ID).
			Update("paired_media_id", nil)
		utils.OK(c, gin.H{"deleted": true, "id": m.ID})
	}
}

type deleteAlbumReq struct {
	Album string `json:"album" binding:"required"`
}

// DeleteAlbum 删除整个专辑：磁盘目录递归删除（含所有文件），数据库批量软删除该专辑下所有 MediaFile。
// 路由: DELETE /albums
// 请求体: { "album": "AlbumName" }
func DeleteAlbum(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !verifyUserPassword(c) {
			return
		}
		var req deleteAlbumReq
		if err := c.ShouldBindJSON(&req); err != nil {
			// 兼容 query 参数
			if a := strings.TrimSpace(c.Query("album")); a != "" {
				req.Album = a
			} else {
				utils.Fail(c, http.StatusBadRequest, "缺少 album 参数")
				return
			}
		}
		album := strings.TrimSpace(req.Album)
		if album == "" {
			utils.Fail(c, http.StatusBadRequest, "album 不能为空")
			return
		}
		// 防路径穿越
		album = filepath.Base(filepath.Clean(album))
		root := filepath.Clean(cfg.Media.Dir)
		dir := filepath.Join(root, album)

		// 先检查专辑目录是否存在，不存在直接返回 404
		// （os.RemoveAll 对不存在的路径返回 nil，不检查会误报成功）
		if _, err := os.Stat(dir); err != nil {
			utils.Fail(c, http.StatusNotFound, "专辑目录不存在: "+album)
			return
		}

		// 1. 递归删除磁盘目录（包含所有媒体/字幕/封面/子目录）
		if err := os.RemoveAll(dir); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "删除目录失败: "+err.Error())
			return
		}

		// 2. 批量软删除该专辑下所有 MediaFile（按 album 字段匹配）
		res := database.DB.Where("album = ?", album).Delete(&models.MediaFile{})
		deleted := res.RowsAffected

		// 3. 同步删除该专辑下的 StudyNote（含图片目录）
		var notes []models.StudyNote
		database.DB.Where("album = ?", album).Find(&notes)
		noteImagesBase := filepath.Join(filepath.Dir(cfg.Database.Path), "note-images")
		for _, n := range notes {
			imgDir := filepath.Join(noteImagesBase, strconv.FormatUint(uint64(n.ID), 10))
			_ = os.RemoveAll(imgDir)
		}
		if len(notes) > 0 {
			database.DB.Where("album = ?", album).Delete(&models.StudyNote{})
		}

		utils.OK(c, gin.H{
			"deleted":        true,
			"album":          album,
			"files_deleted":  deleted,
			"notes_deleted":  int64(len(notes)),
		})
	}
}

// DeleteSeason 删除专辑下的某个季（子目录）：磁盘目录递归删除（含季内所有媒体/字幕/封面），
// 数据库批量软删除该季下所有 MediaFile，并清理 AlbumMeta 中对应季的元数据记录。
// 路由: DELETE /albums/:name/sub/:sub
// Header: X-Delete-Password（必填，二次确认）
func DeleteSeason(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !verifyUserPassword(c) {
			return
		}
		album := strings.TrimSpace(c.Param("name"))
		sub := strings.TrimSpace(c.Param("sub"))
		if album == "" || sub == "" {
			utils.Fail(c, http.StatusBadRequest, "缺少专辑名或季名")
			return
		}
		// 防路径穿越（与 RenameAlbum 保持一致）
		album = filepath.Base(filepath.Clean(album))
		sub = filepath.Base(filepath.Clean(sub))
		if sub == "." || sub == "/" {
			utils.Fail(c, http.StatusBadRequest, "非法的季名")
			return
		}

		root := filepath.Clean(cfg.Media.Dir)
		dir := filepath.Join(root, album, sub)

		// 1. 磁盘目录存在时递归删除（容忍不存在，期望季可能尚未创建）
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			if err := os.RemoveAll(dir); err != nil {
				utils.Fail(c, http.StatusInternalServerError, "删除季目录失败: "+err.Error())
				return
			}
		}

		// 2. 批量软删除该季下所有 MediaFile
		res := database.DB.Where("album = ? AND sub_album = ?", album, sub).Delete(&models.MediaFile{})
		deleted := res.RowsAffected

		// 3. 删除 AlbumMeta 中该季的元数据（封面、横幅、nfo 等）
		database.DB.Where("album = ? AND sub_album = ?", album, sub).Delete(&models.AlbumMeta{})

		utils.OK(c, gin.H{
			"deleted":       true,
			"album":         album,
			"sub_album":     sub,
			"files_deleted": deleted,
		})
	}
}
