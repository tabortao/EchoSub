package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// remarkToJSON 将 MediaRemark 转为 JSON 响应
func remarkToJSON(r models.MediaRemark) gin.H {
	return gin.H{
		"id":         r.ID,
		"media_id":   r.MediaID,
		"content":    r.Content,
		"created_at": r.CreatedAt,
		"updated_at": r.UpdatedAt,
	}
}

// GetRemark 获取指定媒体文件的备注
// 路由: GET /media/:id/remark
func GetRemark() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mid, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "无效的媒体 id")
			return
		}
		var r models.MediaRemark
		err = database.DB.Where("user_id = ? AND media_id = ?", uid, mid).First(&r).Error
		if err == gorm.ErrRecordNotFound {
			// 无备注返回空内容（前端默认预览占位），HTTP 200
			utils.OK(c, gin.H{"media_id": mid, "content": "", "exists": false})
			return
		}
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
			return
		}
		utils.OK(c, gin.H{
			"media_id":   r.MediaID,
			"content":    r.Content,
			"exists":     true,
			"created_at": r.CreatedAt,
			"updated_at": r.UpdatedAt,
		})
	}
}

type upsertRemarkReq struct {
	Content string `json:"content"`
}

// UpsertRemark 新增或更新文件备注（一个文件一条，复用唯一索引）
// 路由: PUT /media/:id/remark
func UpsertRemark() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mid, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "无效的媒体 id")
			return
		}
		var req upsertRemarkReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		// 校验媒体存在
		var m models.MediaFile
		if err := database.DB.First(&m, mid).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "媒体不存在")
			return
		}
		var r models.MediaRemark
		err = database.DB.Where("user_id = ? AND media_id = ?", uid, mid).First(&r).Error
		if err == gorm.ErrRecordNotFound {
			r = models.MediaRemark{UserID: uid, MediaID: uint(mid), Content: req.Content}
			if err := database.DB.Create(&r).Error; err != nil {
				utils.Fail(c, http.StatusInternalServerError, "创建备注失败: "+err.Error())
				return
			}
		} else if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
			return
		} else {
			r.Content = req.Content
			if err := database.DB.Save(&r).Error; err != nil {
				utils.Fail(c, http.StatusInternalServerError, "更新备注失败: "+err.Error())
				return
			}
		}
		utils.OK(c, remarkToJSON(r))
	}
}

// DeleteRemark 删除文件备注
// 路由: DELETE /media/:id/remark
func DeleteRemark() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mid, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "无效的媒体 id")
			return
		}
		if err := database.DB.Where("user_id = ? AND media_id = ?", uid, mid).Delete(&models.MediaRemark{}).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
			return
		}
		utils.OK(c, gin.H{"deleted": true})
	}
}
