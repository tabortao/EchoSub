package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

type updateRecordReq struct {
	LastPosition  float64 `json:"last_position"`
	IncrementPlay bool    `json:"increment_play"`
}

// UpdateRecord 更新播放记录（位置/次数）
// 路由: PUT /records/:mediaId
func UpdateRecord() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mediaID := atou(c.Param("mediaId"))
		if mediaID == 0 {
			utils.Fail(c, http.StatusBadRequest, "无效的 mediaId")
			return
		}
		var req updateRecordReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var rec models.PlayRecord
		result := database.DB.Where("user_id = ? AND media_id = ?", uid, mediaID).First(&rec)
		if result.Error != nil {
			rec = models.PlayRecord{UserID: uid, MediaID: mediaID, LastPosition: req.LastPosition}
		}
		rec.LastPosition = req.LastPosition
		rec.LastPlayedAt = time.Now()
		if req.IncrementPlay {
			rec.PlayCount++
		}
		if result.Error != nil {
			database.DB.Create(&rec)
		} else {
			database.DB.Save(&rec)
		}
		utils.OK(c, rec)
	}
}

// ListRecords 列出当前用户的播放记录
// 已软删除的媒体会被 Preload 置为零值 MediaFile（ID == 0），这里统一剔除，
// 避免前端 Table 渲染时访问 undefined.name 崩溃。
func ListRecords() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var records []models.PlayRecord
		database.DB.Where("user_id = ?", uid).Preload("Media").Order("last_played_at DESC").Find(&records)
		// 过滤掉关联媒体已被软删除的记录（Preload 失败时 Media.ID == 0）
		valid := records[:0]
		for i := range records {
			if records[i].Media.ID != 0 {
				valid = append(valid, records[i])
			}
		}
		utils.OK(c, gin.H{"records": valid})
	}
}

// ListRecent 列出当前用户每个媒体最近一条播放记录（按 media_id 去重），
// 并按最后播放时间倒序。已软删除的媒体会被剔除。
// 路由：GET /records/recent?limit=20
func ListRecent() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if limit < 1 || limit > 100 {
			limit = 20
		}

		// 子查询：每个媒体最近一次播放时间
		latestSub := database.DB.Model(&models.PlayRecord{}).
			Select("media_id, MAX(last_played_at) AS max_ts").
			Where("user_id = ?", uid).
			Group("media_id")

		var records []models.PlayRecord
		err := database.DB.
			Joins("JOIN (?) latest ON latest.media_id = play_records.media_id AND latest.max_ts = play_records.last_played_at", latestSub).
			Joins("JOIN media_files mf ON mf.id = play_records.media_id AND mf.deleted_at IS NULL").
			Where("play_records.user_id = ?", uid).
			Preload("Media").
			Order("play_records.last_played_at DESC").
			Limit(limit).
			Find(&records).Error

		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询最近播放失败: "+err.Error())
			return
		}

		// 理论上	Preload 只会命中未删除的媒体（有 JOIN mf 过滤），再做一次兜底
		valid := records[:0]
		for i := range records {
			if records[i].Media.ID != 0 {
				valid = append(valid, records[i])
			}
		}
		utils.OK(c, gin.H{"records": valid})
	}
}

// GetRecord 获取某媒体的播放记录与句子进度
func GetRecord() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mediaID := c.Param("mediaId")
		var rec models.PlayRecord
		database.DB.Where("user_id = ? AND media_id = ?", uid, mediaID).First(&rec)
		var progress []models.SentenceProgress
		database.DB.Where("user_id = ? AND media_id = ?", uid, mediaID).Find(&progress)
		utils.OK(c, gin.H{"record": rec, "progress": progress})
	}
}

type sentenceProgressReq struct {
	Completed   bool `json:"completed"`
	RepeatCount int  `json:"repeat_count"`
}

// UpdateSentenceProgress 更新句子背诵进度
func UpdateSentenceProgress() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mediaID := c.Param("mediaId")
		idx := c.Param("idx")
		var req sentenceProgressReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var sp models.SentenceProgress
		result := database.DB.Where("user_id = ? AND media_id = ? AND sentence_index = ?", uid, mediaID, idx).First(&sp)
		if result.Error != nil {
			sp = models.SentenceProgress{
				UserID:        uid,
				MediaID:       atou(mediaID),
				SentenceIndex: int(atou(idx)),
			}
		}
		sp.Completed = req.Completed
		if req.RepeatCount > 0 {
			sp.RepeatCount = req.RepeatCount
		}
		sp.UpdatedAt = time.Now()
		if result.Error != nil {
			database.DB.Create(&sp)
		} else {
			database.DB.Save(&sp)
		}
		utils.OK(c, sp)
	}
}

// GetProgress 按专辑/标签汇总学习进度
func GetProgress() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		// 按专辑汇总
		type albumProgress struct {
			Album       string `json:"album"`
			Total       int64  `json:"total"`
			Played      int64  `json:"played"`
			TotalPlayed int64  `json:"total_played"`
		}
		var albums []albumProgress
		database.DB.Raw(`
			SELECT m.album as album, COUNT(DISTINCT m.id) as total,
			       COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN m.id END) as played,
			       COALESCE(SUM(r.play_count), 0) as total_played
			FROM media_files m
			LEFT JOIN play_records r ON r.media_id = m.id AND r.user_id = ?
			WHERE m.deleted_at IS NULL AND m.album IS NOT NULL AND m.album <> ''
			GROUP BY m.album
			ORDER BY m.album ASC
		`, uid).Scan(&albums)

		// 标签维度
		type tagProgress struct {
			TagID   uint   `json:"tag_id"`
			TagName string `json:"tag_name"`
			Total   int64  `json:"total"`
			Played  int64  `json:"played"`
		}
		var tags []tagProgress
		database.DB.Raw(`
			SELECT t.id as tag_id, t.name as tag_name, COUNT(DISTINCT m.id) as total,
			       COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN m.id END) as played
			FROM tags t
			LEFT JOIN media_tags mt ON mt.tag_id = t.id
			LEFT JOIN media_files m ON m.id = mt.media_file_id AND m.deleted_at IS NULL
			LEFT JOIN play_records r ON r.media_id = m.id AND r.user_id = ?
			WHERE t.user_id = ? AND t.deleted_at IS NULL
			GROUP BY t.id, t.name
			ORDER BY t.name ASC
		`, uid, uid).Scan(&tags)

		// 句子背诵完成统计
		var completedSentences int64
		database.DB.Model(&models.SentenceProgress{}).Where("user_id = ? AND completed = ?", uid, true).Count(&completedSentences)

		utils.OK(c, gin.H{
			"albums":              albums,
			"tags":                tags,
			"completed_sentences": completedSentences,
		})
	}
}

func atou(s string) uint {
	var n uint
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + uint(c-'0')
	}
	return n
}

// ToggleFavorite 切换句子收藏状态（重难点句子）
// 路由: POST /records/:mediaId/sentences/:idx/favorite
func ToggleFavorite() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mediaID := c.Param("mediaId")
		idx := c.Param("idx")
		var sp models.SentenceProgress
		result := database.DB.Where("user_id = ? AND media_id = ? AND sentence_index = ?", uid, mediaID, idx).First(&sp)
		if result.Error != nil {
			sp = models.SentenceProgress{
				UserID:        uid,
				MediaID:       atou(mediaID),
				SentenceIndex: int(atou(idx)),
				Favorited:     true,
			}
			database.DB.Create(&sp)
		} else {
			sp.Favorited = !sp.Favorited
			database.DB.Save(&sp)
		}
		utils.OK(c, gin.H{"favorited": sp.Favorited})
	}
}

// IncrementSentenceRepeat 句子播放遍数 +1。
// 每当媒体播放越过某句的结尾（自然推进，非跳转）时由前端调用，
// 用于记录每句实际听过的次数。
// 路由: POST /records/:mediaId/sentences/:idx/repeat
func IncrementSentenceRepeat() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		mediaID := c.Param("mediaId")
		idx := c.Param("idx")
		var sp models.SentenceProgress
		result := database.DB.Where("user_id = ? AND media_id = ? AND sentence_index = ?", uid, mediaID, idx).First(&sp)
		if result.Error != nil {
			sp = models.SentenceProgress{
				UserID:        uid,
				MediaID:       atou(mediaID),
				SentenceIndex: int(atou(idx)),
				RepeatCount:   1,
			}
			database.DB.Create(&sp)
		} else {
			sp.RepeatCount++
			sp.UpdatedAt = time.Now()
			database.DB.Save(&sp)
		}
		utils.OK(c, gin.H{"repeat_count": sp.RepeatCount})
	}
}
