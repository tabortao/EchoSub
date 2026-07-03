package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// settingsReq 学习偏好 + TTS 设置
type settingsReq struct {
	LoopCount      int     `json:"loop_count"`
	SentenceRepeat int     `json:"sentence_repeat"`
	PauseSeconds   float64 `json:"pause_seconds"`
	TTSVoice       string  `json:"tts_voice"`
	TTSSpeed       float64 `json:"tts_speed"`
}

// 默认 TTS 语音
const defaultTTSVoice = "en-US-JennyNeural"
const defaultTTSSpeed = 1.0

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
				"tts_voice":       defaultTTSVoice,
				"tts_speed":       defaultTTSSpeed,
			})
			return
		}
		// 兜底：旧数据可能没有 TTS 字段
		if s.TTSVoice == "" {
			s.TTSVoice = defaultTTSVoice
		}
		if s.TTSSpeed == 0 {
			s.TTSSpeed = defaultTTSSpeed
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
		// TTS 兜底
		if req.TTSVoice == "" {
			req.TTSVoice = defaultTTSVoice
		}
		if req.TTSSpeed < 0.5 || req.TTSSpeed > 2.0 {
			req.TTSSpeed = defaultTTSSpeed
		}
		var s models.Setting
		result := database.DB.Where("user_id = ?", uid).First(&s)
		if result.Error != nil {
			s = models.Setting{
				UserID:         uid,
				LoopCount:      req.LoopCount,
				SentenceRepeat: req.SentenceRepeat,
				PauseSeconds:   req.PauseSeconds,
				TTSVoice:       req.TTSVoice,
				TTSSpeed:       req.TTSSpeed,
			}
			database.DB.Create(&s)
		} else {
			s.LoopCount = req.LoopCount
			s.SentenceRepeat = req.SentenceRepeat
			s.PauseSeconds = req.PauseSeconds
			s.TTSVoice = req.TTSVoice
			s.TTSSpeed = req.TTSSpeed
			database.DB.Save(&s)
		}
		utils.OK(c, s)
	}
}
