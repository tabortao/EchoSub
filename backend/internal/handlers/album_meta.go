package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// albumDir 安全地拼接专辑/季目录的绝对路径，并做防越界校验。
// subAlbum 为空表示专辑本身；非空表示季目录（专辑下的子目录）。
func albumDir(cfg *config.Config, album string, subAlbum string) (string, error) {
	if album == "" || strings.ContainsAny(album, "/\\") || strings.Contains(album, "..") {
		return "", fmt.Errorf("非法的专辑名")
	}
	if strings.ContainsAny(subAlbum, "/\\") || strings.Contains(subAlbum, "..") {
		return "", fmt.Errorf("非法的季名")
	}
	dir := filepath.Join(cfg.Media.Dir, album)
	if subAlbum != "" {
		dir = filepath.Join(dir, subAlbum)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	rootAbs, _ := filepath.Abs(cfg.Media.Dir)
	if !strings.HasPrefix(strings.ToLower(abs), strings.ToLower(rootAbs)) {
		return "", fmt.Errorf("路径越界")
	}
	return abs, nil
}

// UploadAlbumCover 上传专辑或季的封面（统一命名为 folder.<ext> 写入对应目录）。
// POST /albums/:name/cover?sub=xxx   (multipart field name: file)
func UploadAlbumCover(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		album := c.Param("name")
		sub, _ := url.QueryUnescape(c.Query("sub"))

		dir, err := albumDir(cfg, album, sub)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			utils.Fail(c, http.StatusNotFound, "专辑目录不存在")
			return
		}

		file, header, err := c.Request.FormFile("file")
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "未找到上传文件: "+err.Error())
			return
		}
		defer file.Close()

		// 校验后缀
		ext := strings.ToLower(filepath.Ext(header.Filename))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
		if !allowed[ext] {
			utils.Fail(c, http.StatusBadRequest, "仅支持 jpg/png/webp/gif 格式")
			return
		}
		// 限制大小（<= 10MB）
		if header.Size > 10*1024*1024 {
			utils.Fail(c, http.StatusBadRequest, "封面图不能超过 10MB")
			return
		}

		// 删除已有的同名候选封面图（folder/poster/cover），避免堆积
		for _, old := range []string{
			"folder.jpg", "folder.png", "folder.jpeg", "folder.webp", "folder.gif",
			"poster.jpg", "poster.png", "poster.jpeg", "poster.webp",
			"cover.jpg", "cover.png", "cover.jpeg", "cover.webp",
		} {
			_ = os.Remove(filepath.Join(dir, old))
		}
		// 写入新文件，统一命名为 folder.<ext>
		coverName := "folder" + ext
		dst, err := os.Create(filepath.Join(dir, coverName))
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建封面文件失败: "+err.Error())
			return
		}
		defer dst.Close()
		if _, err := file.Seek(0, 0); err != nil {
			utils.Fail(c, http.StatusInternalServerError, err.Error())
			return
		}
		if _, err := dst.ReadFrom(file); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "写入封面文件失败: "+err.Error())
			return
		}

		// 更新 AlbumMeta
		coverPath := filepath.Join(dir, coverName)
		upsertAlbumMeta(album, sub, &coverPath, nil, nil, "")

		utils.OK(c, gin.H{
			"album":      album,
			"sub_album":  sub,
			"cover_path": coverPath,
		})
	}
}

// upsertAlbumMeta upsert AlbumMeta 记录（album+sub_album 唯一）。
func upsertAlbumMeta(album, subAlbum string, cover, banner, nfo *string, description string) {
	var meta models.AlbumMeta
	tx := database.DB.Where("album = ? AND sub_album = ?", album, subAlbum).First(&meta)
	if tx.Error == nil {
		updates := map[string]interface{}{}
		if cover != nil {
			updates["cover_path"] = cover
		}
		if banner != nil {
			updates["banner_path"] = banner
		}
		if nfo != nil {
			updates["nfo_path"] = nfo
		}
		if description != "" {
			updates["description"] = description
		}
		if len(updates) > 0 {
			database.DB.Model(&meta).Updates(updates)
		}
	} else {
		database.DB.Create(&models.AlbumMeta{
			Album:       album,
			SubAlbum:    subAlbum,
			CoverPath:   cover,
			BannerPath:  banner,
			NFOPath:     nfo,
			Description: description,
		})
	}
}

// ServeAlbumCover 提供专辑或季的封面图片。
// GET /albums/:name/cover?sub=xxx
func ServeAlbumCover(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		album := c.Param("name")
		sub, _ := url.QueryUnescape(c.Query("sub"))
		if album == "" {
			utils.Fail(c, http.StatusBadRequest, "缺少专辑名")
			return
		}
		// 优先 AlbumMeta.cover_path（来自 Emby 扫描）
		var meta models.AlbumMeta
		if err := database.DB.Where("album = ? AND sub_album = ?", album, sub).First(&meta).Error; err == nil {
			if meta.CoverPath != nil {
				serveImage(c, *meta.CoverPath)
				return
			}
		}
		// 兜底：直接在专辑目录找 folder/poster/cover 图片
		dir, err := albumDir(cfg, album, sub)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		for _, name := range []string{"folder", "poster", "cover"} {
			for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp", ".gif"} {
				p := filepath.Join(dir, name+ext)
				if _, err := os.Stat(p); err == nil {
					serveImage(c, p)
					return
				}
			}
		}
		utils.Fail(c, http.StatusNotFound, "该专辑暂无封面")
	}
}

// ServeAlbumBanner 提供专辑或季的横幅图。
// GET /albums/:name/banner?sub=xxx
// 季自身无横幅时，回退到专辑根目录的 banner.jpg / backdrop.jpg / fanart.jpg，
// 保证 Emby 风格「所有季共用专辑横幅」的效果。
func ServeAlbumBanner(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		album := c.Param("name")
		sub, _ := url.QueryUnescape(c.Query("sub"))
		if album == "" {
			utils.Fail(c, http.StatusBadRequest, "缺少专辑名")
			return
		}
		// 1. 优先返回季 / 专辑自身的 banner_path
		var meta models.AlbumMeta
		if err := database.DB.Where("album = ? AND sub_album = ?", album, sub).First(&meta).Error; err == nil {
			if meta.BannerPath != nil {
				serveImage(c, *meta.BannerPath)
				return
			}
		}
		// 2. 季无 banner：尝试直接读季目录的 banner / backdrop / fanart
		dir, err := albumDir(cfg, album, sub)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		for _, name := range []string{"banner", "backdrop", "fanart"} {
			for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp"} {
				p := filepath.Join(dir, name+ext)
				if _, err := os.Stat(p); err == nil {
					serveImage(c, p)
					return
				}
			}
		}
		// 3. 季完全无 banner：回退到专辑根目录的横幅（Emby 风格所有季共用专辑横幅）
		if sub != "" {
			rootDir, err := albumDir(cfg, album, "")
			if err == nil {
				for _, name := range []string{"banner", "backdrop", "fanart"} {
					for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp"} {
						p := filepath.Join(rootDir, name+ext)
						if _, err := os.Stat(p); err == nil {
							serveImage(c, p)
							return
						}
					}
				}
			}
		}
		utils.Fail(c, http.StatusNotFound, "该专辑暂无横幅")
	}
}

// serveImage 设置 Content-Type 并返回图片文件。
func serveImage(c *gin.Context, path string) {
	ext := strings.ToLower(filepath.Ext(path))
	contentType := "image/jpeg"
	switch ext {
	case ".png":
		contentType = "image/png"
	case ".webp":
		contentType = "image/webp"
	case ".gif":
		contentType = "image/gif"
	}
	c.Header("Content-Type", contentType)
	c.File(path)
}
