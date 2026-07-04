package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// noteImagesDir 返回学习页面图片存储目录
func noteImagesDir(cfg *config.Config) string {
	return filepath.Join(filepath.Dir(cfg.Database.Path), "note-images")
}

// noteToJSON 将 StudyNote 转换为带解析 images 的 JSON 响应
func noteToJSON(n models.StudyNote) gin.H {
	var imgs []string
	if n.Images != "" {
		_ = json.Unmarshal([]byte(n.Images), &imgs)
	}
	if imgs == nil {
		imgs = []string{}
	}
	return gin.H{
		"id":         n.ID,
		"album":      n.Album,
		"title":      n.Title,
		"content":    n.Content,
		"images":     imgs,
		"pinned":     n.Pinned,
		"created_at": n.CreatedAt,
		"updated_at": n.UpdatedAt,
	}
}

// ListNotes 列出指定专辑下的学习页面，按置顶优先 + 更新时间倒序
// 路由: GET /notes?album=xxx
func ListNotes(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		album := c.Query("album")
		q := database.DB.Where("user_id = ?", uid)
		if album != "" {
			q = q.Where("album = ?", album)
		}
		var notes []models.StudyNote
		q.Order("pinned DESC, updated_at DESC").Find(&notes)
		result := make([]gin.H, 0, len(notes))
		for _, n := range notes {
			result = append(result, noteToJSON(n))
		}
		utils.OK(c, gin.H{"notes": result})
	}
}

type createNoteReq struct {
	Album   string `json:"album" binding:"required"`
	Title   string `json:"title" binding:"required"`
	Content string `json:"content"`
}

// CreateNote 创建学习页面
// 路由: POST /notes
func CreateNote(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var req createNoteReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		note := models.StudyNote{
			UserID:  uid,
			Album:   req.Album,
			Title:   req.Title,
			Content: req.Content,
		}
		if err := database.DB.Create(&note).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建失败: "+err.Error())
			return
		}
		utils.OK(c, noteToJSON(note))
	}
}

// GetNote 获取单个学习页面
// 路由: GET /notes/:id
func GetNote(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var note models.StudyNote
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&note).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "学习页面不存在")
			return
		}
		utils.OK(c, noteToJSON(note))
	}
}

type updateNoteReq struct {
	Title   *string `json:"title"`
	Content *string `json:"content"`
	Pinned  *bool   `json:"pinned"`
}

// UpdateNote 更新学习页面内容
// 路由: PUT /notes/:id
func UpdateNote(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var note models.StudyNote
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&note).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "学习页面不存在")
			return
		}
		var req updateNoteReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		if req.Title != nil {
			note.Title = *req.Title
		}
		if req.Content != nil {
			note.Content = *req.Content
		}
		if req.Pinned != nil {
			note.Pinned = *req.Pinned
		}
		database.DB.Save(&note)
		utils.OK(c, noteToJSON(note))
	}
}

// ToggleNotePin 切换学习页面置顶状态
// 路由: POST /notes/:id/pin
func ToggleNotePin() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var note models.StudyNote
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&note).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "学习页面不存在")
			return
		}
		note.Pinned = !note.Pinned
		database.DB.Save(&note)
		utils.OK(c, gin.H{"pinned": note.Pinned})
	}
}

// DeleteNote 删除学习页面（同时删除关联图片）。需 X-Delete-Password 头校验当前用户密码。
// 路由: DELETE /notes/:id
func DeleteNote(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var note models.StudyNote
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&note).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "学习页面不存在")
			return
		}
		if !verifyUserPassword(c) {
			utils.Fail(c, http.StatusUnauthorized, "密码错误")
			return
		}
		dir := filepath.Join(noteImagesDir(cfg), strconv.FormatUint(uint64(note.ID), 10))
		os.RemoveAll(dir)
		database.DB.Delete(&note)
		utils.OK(c, gin.H{"deleted": true})
	}
}

// UploadNoteImage 上传学习页面图片（支持多张）
// 路由: POST /notes/:id/images
func UploadNoteImage(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var note models.StudyNote
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&note).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "学习页面不存在")
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
		dir := filepath.Join(noteImagesDir(cfg), strconv.FormatUint(uint64(note.ID), 10))
		if err := os.MkdirAll(dir, 0755); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建目录失败")
			return
		}
		var imgs []string
		if note.Images != "" {
			_ = json.Unmarshal([]byte(note.Images), &imgs)
		}
		for _, f := range files {
			name := filepath.Base(f.Filename)
			exists := false
			for _, im := range imgs {
				if im == name {
					exists = true
					break
				}
			}
			if exists {
				continue
			}
			dst := filepath.Join(dir, name)
			if err := c.SaveUploadedFile(f, dst); err != nil {
				utils.Fail(c, http.StatusInternalServerError, "保存失败 "+name)
				return
			}
			imgs = append(imgs, name)
		}
		imgJSON, _ := json.Marshal(imgs)
		note.Images = string(imgJSON)
		database.DB.Save(&note)
		utils.OK(c, gin.H{"images": imgs})
	}
}

// DeleteNoteImage 删除学习页面的某张图片
// 路由: DELETE /notes/:id/images/:filename
func DeleteNoteImage(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		filename := filepath.Base(c.Param("filename"))
		var note models.StudyNote
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&note).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "学习页面不存在")
			return
		}
		var imgs []string
		if note.Images != "" {
			_ = json.Unmarshal([]byte(note.Images), &imgs)
		}
		var newImgs []string
		for _, im := range imgs {
			if im != filename {
				newImgs = append(newImgs, im)
			}
		}
		dir := filepath.Join(noteImagesDir(cfg), strconv.FormatUint(uint64(note.ID), 10))
		os.Remove(filepath.Join(dir, filename))
		imgJSON, _ := json.Marshal(newImgs)
		note.Images = string(imgJSON)
		database.DB.Save(&note)
		utils.OK(c, gin.H{"images": newImgs})
	}
}

// ServeNoteImage 提供学习页面图片访问（需鉴权，支持 ?token=）
// 路由: GET /notes/:id/images/:filename
func ServeNoteImage(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		filename := filepath.Base(c.Param("filename"))
		dir := filepath.Join(noteImagesDir(cfg), id)
		fullPath := filepath.Join(dir, filename)
		if _, err := os.Stat(fullPath); err != nil {
			utils.Fail(c, http.StatusNotFound, "图片不存在")
			return
		}
		c.File(fullPath)
	}
}
