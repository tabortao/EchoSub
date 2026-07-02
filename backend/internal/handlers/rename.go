package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// 限制单次重命名时扫描同目录关联文件的扩展名集合，用于同步重命名字幕/封面图。
var associatedExts = map[string]bool{
	".srt": true, ".vtt": true,
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true,
}

type renameMediaReq struct {
	Name string `json:"name"` // 新文件名（不含扩展名，保留原扩展名）
}

// RenameMedia 重命名单个媒体文件，同时同步重命名同目录下同名的字幕/封面文件。
// 路由: PUT /media/:id/rename
// 请求体: { "name": "newname" } （不含扩展名）
func RenameMedia(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var m models.MediaFile
		if err := database.DB.First(&m, id).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		var req renameMediaReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		newBase := strings.TrimSpace(req.Name)
		if newBase == "" {
			utils.Fail(c, http.StatusBadRequest, "名称不能为空")
			return
		}
		// 防止路径穿越：去掉任何路径分隔符
		newBase = filepath.Base(newBase)
		// 保留原扩展名
		ext := filepath.Ext(m.Name)
		newName := newBase + ext
		if newName == m.Name {
			utils.OK(c, gin.H{"media": m, "renamed": []string{}})
			return
		}

		dir := filepath.Dir(m.Path)
		newPath := filepath.Join(dir, newName)
		if _, err := os.Stat(newPath); err == nil {
			utils.Fail(c, http.StatusConflict, "目标文件已存在: "+newName)
			return
		}

		renamed := []string{}

		// 1. 重命名媒体文件本身
		if err := os.Rename(m.Path, newPath); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "重命名媒体文件失败: "+err.Error())
			return
		}
		renamed = append(renamed, newName)

		oldBase := strings.TrimSuffix(m.Name, ext)

		// 2. 同步重命名同目录下同 basename 的字幕/封面文件
		entries, err := os.ReadDir(dir)
		if err == nil {
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				eName := e.Name()
				eExt := strings.ToLower(filepath.Ext(eName))
				if !associatedExts[eExt] {
					continue
				}
				eBase := strings.TrimSuffix(eName, filepath.Ext(eName))
				if !strings.EqualFold(eBase, oldBase) {
					continue
				}
				// 找到关联文件，重命名
				newAssocName := newBase + filepath.Ext(eName)
				newAssocPath := filepath.Join(dir, newAssocName)
				if _, err := os.Stat(newAssocPath); err == nil {
					continue // 目标已存在，跳过
				}
				if err := os.Rename(filepath.Join(dir, eName), newAssocPath); err == nil {
					renamed = append(renamed, newAssocName)
				}
			}
		}

		// 3. 更新数据库记录（path/name/subtitle_path/cover_path）
		updates := map[string]interface{}{
			"path": newPath,
			"name": newName,
		}
		if m.SubtitlePath != nil && *m.SubtitlePath != "" {
			oldSub := *m.SubtitlePath
			oldSubName := filepath.Base(oldSub)
			oldSubBase := strings.TrimSuffix(oldSubName, filepath.Ext(oldSubName))
			if strings.EqualFold(oldSubBase, oldBase) {
				newSubPath := filepath.Join(filepath.Dir(oldSub), newBase+filepath.Ext(oldSubName))
				if _, err := os.Stat(newSubPath); err == nil {
					updates["subtitle_path"] = newSubPath
				}
			}
		}
		if m.CoverPath != nil && *m.CoverPath != "" {
			oldCov := *m.CoverPath
			oldCovName := filepath.Base(oldCov)
			oldCovBase := strings.TrimSuffix(oldCovName, filepath.Ext(oldCovName))
			if strings.EqualFold(oldCovBase, oldBase) {
				newCovPath := filepath.Join(filepath.Dir(oldCov), newBase+filepath.Ext(oldCovName))
				if _, err := os.Stat(newCovPath); err == nil {
					updates["cover_path"] = newCovPath
				}
			}
		}
		if err := database.DB.Model(&models.MediaFile{}).Where("id = ?", m.ID).Updates(updates).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "更新数据库失败: "+err.Error())
			return
		}

		// 重新查询返回最新记录
		var updated models.MediaFile
		database.DB.First(&updated, m.ID)
		utils.OK(c, gin.H{"media": updated, "renamed": renamed})
	}
}

type renameAlbumReq struct {
	Album   string `json:"album"`
	NewName string `json:"new_name"`
}

// RenameAlbum 重命名专辑（即重命名 media_root 下的专辑目录）。
// 同步更新该专辑下所有 MediaFile 的 path / album / sub_album / subtitle_path / cover_path，
// 以及 StudyNote 表中该专辑的笔记归属。
// 路由: PUT /albums/rename
// 请求体: { "album": "OldName", "new_name": "NewName" }
func RenameAlbum(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req renameAlbumReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		oldAlbum := strings.TrimSpace(req.Album)
		newAlbum := strings.TrimSpace(req.NewName)
		if oldAlbum == "" {
			utils.Fail(c, http.StatusBadRequest, "缺少 album 参数")
			return
		}
		if newAlbum == "" {
			utils.Fail(c, http.StatusBadRequest, "缺少 new_name 参数")
			return
		}
		if oldAlbum == newAlbum {
			utils.OK(c, gin.H{"renamed": false, "message": "新旧名称相同"})
			return
		}
		// 防止路径穿越
		oldAlbum = filepath.Base(filepath.Clean(oldAlbum))
		newAlbum = filepath.Base(filepath.Clean(newAlbum))

		root := filepath.Clean(cfg.Media.Dir)
		oldDir := filepath.Join(root, oldAlbum)
		newDir := filepath.Join(root, newAlbum)

		if _, err := os.Stat(oldDir); err != nil {
			utils.Fail(c, http.StatusNotFound, "专辑目录不存在: "+oldAlbum)
			return
		}
		if _, err := os.Stat(newDir); err == nil {
			utils.Fail(c, http.StatusConflict, "目标目录已存在: "+newAlbum)
			return
		}

		// 1. 重命名磁盘目录
		if err := os.Rename(oldDir, newDir); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "重命名目录失败: "+err.Error())
			return
		}

		// 2. 批量更新该专辑下所有 MediaFile
		var files []models.MediaFile
		if err := database.DB.Where("album = ?", oldAlbum).Find(&files).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询专辑文件失败: "+err.Error())
			return
		}

		oldPrefix := oldDir + string(os.PathSeparator)
		newPrefix := newDir + string(os.PathSeparator)
		updated := 0
		for _, f := range files {
			updates := map[string]interface{}{
				"album": newAlbum,
			}
			// path: 替换前缀
			if strings.HasPrefix(f.Path, oldPrefix) {
				updates["path"] = newPrefix + strings.TrimPrefix(f.Path, oldPrefix)
			} else if f.Path == oldDir {
				updates["path"] = newDir
			}
			// subtitle_path
			if f.SubtitlePath != nil && *f.SubtitlePath != "" {
				if strings.HasPrefix(*f.SubtitlePath, oldPrefix) {
					s := newPrefix + strings.TrimPrefix(*f.SubtitlePath, oldPrefix)
					updates["subtitle_path"] = s
				}
			}
			// cover_path
			if f.CoverPath != nil && *f.CoverPath != "" {
				if strings.HasPrefix(*f.CoverPath, oldPrefix) {
					s := newPrefix + strings.TrimPrefix(*f.CoverPath, oldPrefix)
					updates["cover_path"] = s
				}
			}
			if err := database.DB.Model(&models.MediaFile{}).Where("id = ?", f.ID).Updates(updates).Error; err == nil {
				updated++
			}
		}

		// 3. 同步更新 StudyNote 表中该专辑的笔记归属
		database.DB.Model(&models.StudyNote{}).Where("album = ?", oldAlbum).Update("album", newAlbum)

		utils.OK(c, gin.H{
			"renamed":       true,
			"old_album":     oldAlbum,
			"new_album":     newAlbum,
			"files_updated": updated,
		})
	}
}
