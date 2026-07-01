package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

type settingsReq struct {
	LoopCount      int     `json:"loop_count"`
	SentenceRepeat int     `json:"sentence_repeat"`
	PauseSeconds   float64 `json:"pause_seconds"`
}

// GetSettings 获取当前用户的学习偏好
func GetSettings() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var s models.Setting
		if err := database.DB.Where("user_id = ?", uid).First(&s).Error; err != nil {
			// 返回默认值
			utils.OK(c, gin.H{
				"loop_count":      1,
				"sentence_repeat": 3,
				"pause_seconds":   1.5,
			})
			return
		}
		utils.OK(c, s)
	}
}

// UpdateSettings 更新学习偏好
func UpdateSettings() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var req settingsReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var s models.Setting
		result := database.DB.Where("user_id = ?", uid).First(&s)
		if result.Error != nil {
			s = models.Setting{
				UserID:         uid,
				LoopCount:      req.LoopCount,
				SentenceRepeat: req.SentenceRepeat,
				PauseSeconds:   req.PauseSeconds,
			}
			database.DB.Create(&s)
		} else {
			s.LoopCount = req.LoopCount
			s.SentenceRepeat = req.SentenceRepeat
			s.PauseSeconds = req.PauseSeconds
			database.DB.Save(&s)
		}
		utils.OK(c, s)
	}
}
