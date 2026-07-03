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

// 受保护的关键路径，禁止操作（防止误删整个媒体根目录）
func isProtectedPath(path string) bool {
	p := strings.ToLower(filepath.ToSlash(path))
	return p == "" || p == "/" || p == "."
}

// resolvePath 解析并校验相对路径为绝对路径，确保位于媒体根目录之下。
// 如果 unsafe 则返回空串 + false。
func resolvePath(cfg *config.Config, rel string) (string, bool) {
	rel = strings.TrimSpace(rel)
	if isProtectedPath(rel) {
		return "", false
	}
	// 统一 / → OS 分隔符，再 Clean 防止穿越
	osRel := filepath.Clean(filepath.FromSlash(rel))
	full := filepath.Join(filepath.Clean(cfg.Media.Dir), osRel)
	// 校验必须在 media root 之下
	root := filepath.Clean(cfg.Media.Dir)
	if full != root && !strings.HasPrefix(full+string(filepath.Separator), root+string(filepath.Separator)) {
		return "", false
	}
	return full, true
}

// pathToRel 将绝对路径转换回相对路径（用于返回给前端）
func pathToRel(cfg *config.Config, abs string) string {
	rel, _ := filepath.Rel(filepath.Clean(cfg.Media.Dir), filepath.Clean(abs))
	rel = filepath.ToSlash(rel)
	if rel == "." {
		rel = ""
	}
	return rel
}

// ────────────────────────────────────────────
// 新建目录
// POST /media/mkdir
// body: { "path": "相对路径/子目录名" }
// ────────────────────────────────────────────
type mkdirReq struct {
	Path string `json:"path" binding:"required"`
}

func MkdirMedia(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req mkdirReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "缺少 path 参数")
			return
		}
		full, ok := resolvePath(cfg, req.Path)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法路径")
			return
		}
		if err := os.MkdirAll(full, 0755); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建目录失败: "+err.Error())
			return
		}
		utils.OK(c, gin.H{
			"path": pathToRel(cfg, full),
		})
	}
}

// ────────────────────────────────────────────
// 删除目录（递归删除磁盘，并软删除该目录下所有文件的数据库记录）
// DELETE /media/path?path=相对路径
// ────────────────────────────────────────────
func DeleteDir(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		rel := c.Query("path")
		full, ok := resolvePath(cfg, rel)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法路径")
			return
		}
		info, err := os.Stat(full)
		if err != nil || !info.IsDir() {
			utils.Fail(c, http.StatusNotFound, "目录不存在")
			return
		}
		root := filepath.Clean(cfg.Media.Dir)
		if full == root {
			utils.Fail(c, http.StatusForbidden, "不能删除媒体根目录")
			return
		}
		// 递归删除磁盘
		if err := os.RemoveAll(full); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "删除目录失败: "+err.Error())
			return
		}
		// 软删除该目录下所有 MediaFile 记录（按 path 前缀匹配）
		pathPrefix := filepath.ToSlash(filepath.Join(full, ""))
		database.DB.Where("path LIKE ?", pathPrefix+"%").Delete(&models.MediaFile{})
		fs, _ := filepath.Rel(root, full)
		utils.OK(c, gin.H{"deleted": true, "path": filepath.ToSlash(fs)})
	}
}

// ────────────────────────────────────────────
// 删除单个文件（仅删除磁盘与对应数据库记录，不级联历史学习记录）
// DELETE /media/file?path=相对路径
// ────────────────────────────────────────────
func DeleteFile(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		rel := c.Query("path")
		full, ok := resolvePath(cfg, rel)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法路径")
			return
		}
		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			utils.Fail(c, http.StatusNotFound, "文件不存在")
			return
		}
		// 删除磁盘文件
		_ = os.Remove(full)
		// 删除 DB 中对应的记录（按精确路径匹配）
		database.DB.Where("path = ?", full).Delete(&models.MediaFile{})
		// 关联媒体一并删除同 basename 的字幕/封面文件
		dir := filepath.Dir(full)
		base := strings.TrimSuffix(filepath.Base(full), filepath.Ext(full))
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			eName := e.Name()
			eExt := strings.ToLower(filepath.Ext(eName))
			if deleteAssociatedExts[eExt] {
				eBase := strings.TrimSuffix(eName, filepath.Ext(eName))
				if strings.EqualFold(eBase, base) {
					_ = os.Remove(filepath.Join(dir, eName))
				}
			}
		}
		utils.OK(c, gin.H{"deleted": true, "path": rel})
	}
}

// ────────────────────────────────────────────
// 重命名文件/目录（磁盘重命名 + DB 路径更新）
// PUT /media/path/rename
// body: { "old_path": "相对路径/旧名", "new_path": "相对路径/新名" }
// ────────────────────────────────────────────
type renamePathReq struct {
	OldPath string `json:"old_path" binding:"required"`
	NewPath string `json:"new_path" binding:"required"`
}

func RenamePath(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req renamePathReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		oldFull, ok := resolvePath(cfg, req.OldPath)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法的旧路径")
			return
		}
		newFull, ok := resolvePath(cfg, req.NewPath)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法的新路径")
			return
		}
		// 旧路径必须存在
		if _, err := os.Stat(oldFull); err != nil {
			utils.Fail(c, http.StatusNotFound, "源路径不存在")
			return
		}
		// 新路径不能已存在
		if _, err := os.Stat(newFull); err == nil {
			utils.Fail(c, http.StatusConflict, "目标路径已存在")
			return
		}
		// 创建目标父目录（如需要）
		if err := os.MkdirAll(filepath.Dir(newFull), 0755); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建目标父目录失败: "+err.Error())
			return
		}
		if err := os.Rename(oldFull, newFull); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "重命名失败: "+err.Error())
			return
		}
		isDir := infoIsDir(newFull)
		// 更新数据库中的路径（包括所有子路径）
		relOld := pathToRel(cfg, oldFull)
		relNew := pathToRel(cfg, newFull)
		if isDir {
			// 目录下所有文件的 path 都要更新
			oldPrefix := filepath.ToSlash(filepath.Join(oldFull, ""))
			newPrefix := filepath.ToSlash(filepath.Join(newFull, ""))
			var files []models.MediaFile
			database.DB.Where("path LIKE ? OR path = ?", oldPrefix+"%", oldFull).Find(&files)
			for _, f := range files {
				newFPath := newPrefix + strings.TrimPrefix(filepath.ToSlash(f.Path), oldPrefix)
				database.DB.Model(&f).Update("path", newFPath)
			}
			// 重新计算 album/sub_album（基于新路径）
			recalcMediaAttrs(cfg, newPrefix)
		} else {
			database.DB.Model(&models.MediaFile{}).Where("path = ?", oldFull).Update("path", newFull)
			// 如果是媒体文件，同步更新 name 字段
			if isMediaExt(filepath.Ext(newFull)) {
				newName := filepath.Base(newFull)
				database.DB.Model(&models.MediaFile{}).Where("path = ?", newFull).Update("name", newName)
			}
		}
		utils.OK(c, gin.H{
			"old_path": relOld,
			"new_path": relNew,
		})
	}
}

// ────────────────────────────────────────────
// 移动文件/目录（磁盘移动 + DB 路径更新）
// PUT /media/path/move
// body: { "old_path": "...", "new_path": "目标目录/..." }
// ────────────────────────────────────────────
func MovePath(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req renamePathReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		oldFull, ok := resolvePath(cfg, req.OldPath)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法的源路径")
			return
		}
		newFull, ok := resolvePath(cfg, req.NewPath)
		if !ok {
			utils.Fail(c, http.StatusBadRequest, "非法的目标路径")
			return
		}
		if _, err := os.Stat(oldFull); err != nil {
			utils.Fail(c, http.StatusNotFound, "源路径不存在")
			return
		}
		if _, err := os.Stat(newFull); err == nil {
			utils.Fail(c, http.StatusConflict, "目标路径已存在")
			return
		}
		if err := os.MkdirAll(filepath.Dir(newFull), 0755); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建目标父目录失败: "+err.Error())
			return
		}
		if err := os.Rename(oldFull, newFull); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "移动失败: "+err.Error())
			return
		}
		isDir := infoIsDir(newFull)
		relOld := pathToRel(cfg, oldFull)
		relNew := pathToRel(cfg, newFull)
		if isDir {
			oldPrefix := filepath.ToSlash(filepath.Join(oldFull, ""))
			newPrefix := filepath.ToSlash(filepath.Join(newFull, ""))
			var files []models.MediaFile
			database.DB.Where("path LIKE ? OR path = ?", oldPrefix+"%", oldFull).Find(&files)
			for _, f := range files {
				newFPath := newPrefix + strings.TrimPrefix(filepath.ToSlash(f.Path), oldPrefix)
				database.DB.Model(&f).Update("path", newFPath)
			}
			recalcMediaAttrs(cfg, newPrefix)
		} else {
			database.DB.Model(&models.MediaFile{}).Where("path = ?", oldFull).Update("path", newFull)
			if isMediaExt(filepath.Ext(newFull)) {
				newName := filepath.Base(newFull)
				database.DB.Model(&models.MediaFile{}).Where("path = ?", newFull).Update("name", newName)
			}
		}
		utils.OK(c, gin.H{"old_path": relOld, "new_path": relNew})
	}
}

// 工具函数

func infoIsDir(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

var mediaExts = map[string]bool{
	".mp4": true, ".mkv": true, ".mov": true, ".webm": true, ".avi": true,
	".mp3": true, ".m4a": true, ".aac": true, ".wav": true, ".flac": true, ".ogg": true,
}

func isMediaExt(ext string) bool {
	return mediaExts[strings.ToLower(ext)]
}

// recalcMediaAttrs 重新计算指定路径下所有 MediaFile 的 album 和 sub_album 字段
func recalcMediaAttrs(cfg *config.Config, newPrefix string) {
	var files []models.MediaFile
	database.DB.Where("path LIKE ?", newPrefix+"%").Find(&files)
	root := filepath.Clean(cfg.Media.Dir)
	for _, f := range files {
		rel, _ := filepath.Rel(root, f.Path)
		dir := filepath.Dir(rel)
		var album, subAlbum *string
		if dir != "." && dir != "" {
			parts := strings.SplitN(filepath.ToSlash(dir), "/", 2)
			a := parts[0]
			album = &a
			if len(parts) > 1 && parts[1] != "" {
				sa := parts[1]
				subAlbum = &sa
			}
		}
		database.DB.Model(&f).Updates(map[string]interface{}{
			"album":     album,
			"sub_album": subAlbum,
		})
	}
}
