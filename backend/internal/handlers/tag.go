package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// ListTags 列出当前用户的所有标签
func ListTags() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var tags []models.Tag
		database.DB.Where("user_id = ?", uid).Order("name ASC").Find(&tags)
		utils.OK(c, gin.H{"tags": tags})
	}
}

type tagReq struct {
	Name string `json:"name" binding:"required,max=64"`
}

// CreateTag 创建标签
func CreateTag() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var req tagReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		tag := models.Tag{Name: req.Name, UserID: uid}
		if err := database.DB.Create(&tag).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建失败: "+err.Error())
			return
		}
		utils.OK(c, tag)
	}
}

// UpdateTag 更新标签
func UpdateTag() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		var req tagReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var tag models.Tag
		if err := database.DB.Where("id = ? AND user_id = ?", id, uid).First(&tag).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "标签不存在")
			return
		}
		tag.Name = req.Name
		if err := database.DB.Save(&tag).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "更新失败")
			return
		}
		utils.OK(c, tag)
	}
}

// DeleteTag 删除标签
func DeleteTag() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		id := c.Param("id")
		if err := database.DB.Where("id = ? AND user_id = ?", id, uid).Delete(&models.Tag{}).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "删除失败")
			return
		}
		utils.OK(c, gin.H{"deleted": id})
	}
}

type assignTagsReq struct {
	TagIDs []uint `json:"tag_ids" binding:"required"`
}

// AssignTags 为媒体设置标签（覆盖式）
func AssignTags() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mediaID := c.Param("id")
		var req assignTagsReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var media models.MediaFile
		if err := database.DB.First(&media, mediaID).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		// 查找属于该用户的标签
		var tags []models.Tag
		database.DB.Where("user_id = ? AND id IN ?", uid, req.TagIDs).Find(&tags)
		if err := database.DB.Model(&media).Association("Tags").Replace(tags); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "关联失败: "+err.Error())
			return
		}
		utils.OK(c, gin.H{"tags": tags})
	}
}
