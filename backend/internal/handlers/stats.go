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

// studyStat 单个统计单元（一天/一月/一年）
type studyStat struct {
	Date          string `json:"date"`
	Label         string `json:"label"`
	PlayCount     int64  `json:"play_count"`
	MediaCount    int64  `json:"media_count"`
	SentenceCount int64  `json:"sentence_count"`
	IsCurrent     bool   `json:"is_current"`
}

// GetStudyStats 按天/月/年维度统计学习情况
// 路由: GET /records/stats?granularity=week|month|year&date=2026-07-02
// - week: 返回 date 所在周（周一~周日）的 7 天每日统计
// - month: 返回 date 所在年的 12 个月每月统计
// - year: 返回最近 5 年每年统计
func GetStudyStats() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		granularity := c.DefaultQuery("granularity", "week")
		dateStr := c.DefaultQuery("date", "")

		baseDate := time.Now()
		if dateStr != "" {
			if t, err := time.Parse("2006-01-02", dateStr); err == nil {
				baseDate = t
			}
		}

		var stats []studyStat
		switch granularity {
		case "week":
			stats = getWeekStats(uid, baseDate)
		case "month":
			stats = getMonthStats(uid, baseDate)
		case "year":
			stats = getYearStats(uid, baseDate)
		default:
			utils.Fail(c, http.StatusBadRequest, "granularity 参数错误，可选 week/month/year")
			return
		}

		var totalPlay, totalMedia, totalSentence int64
		for _, s := range stats {
			totalPlay += s.PlayCount
			totalMedia += s.MediaCount
			totalSentence += s.SentenceCount
		}

		utils.OK(c, gin.H{
			"granularity":    granularity,
			"stats":          stats,
			"total_play":     totalPlay,
			"total_media":    totalMedia,
			"total_sentence": totalSentence,
		})
	}
}

// getWeekStats 获取某一周（周一~周日）的每日统计
func getWeekStats(uid uint, base time.Time) []studyStat {
	weekday := int(base.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	monday := base.AddDate(0, 0, -(weekday - 1))
	today := time.Now().Format("2006-01-02")
	weekdays := []string{"周一", "周二", "周三", "周四", "周五", "周六", "周日"}

	stats := make([]studyStat, 0, 7)
	for i := 0; i < 7; i++ {
		day := monday.AddDate(0, 0, i)
		nextDay := day.AddDate(0, 0, 1)
		dayStr := day.Format("2006-01-02")

		var mediaCount int64
		database.DB.Model(&models.PlayRecord{}).
			Where("user_id = ? AND last_played_at >= ? AND last_played_at < ?", uid, day, nextDay).
			Count(&mediaCount)

		var sentenceCount int64
		database.DB.Model(&models.SentenceProgress{}).
			Where("user_id = ? AND updated_at >= ? AND updated_at < ? AND completed = ?", uid, day, nextDay, true).
			Count(&sentenceCount)

		var totalPlayed int64
		database.DB.Model(&models.PlayRecord{}).
			Where("user_id = ? AND last_played_at >= ? AND last_played_at < ?", uid, day, nextDay).
			Select("COALESCE(SUM(play_count), 0)").Scan(&totalPlayed)

		stats = append(stats, studyStat{
			Date:          dayStr,
			Label:         weekdays[i],
			PlayCount:     totalPlayed,
			MediaCount:    mediaCount,
			SentenceCount: sentenceCount,
			IsCurrent:     dayStr == today,
		})
	}
	return stats
}

// getMonthStats 获取某年 12 个月的统计
func getMonthStats(uid uint, base time.Time) []studyStat {
	year := base.Year()
	currentMonth := int(time.Now().Month())
	currentYear := time.Now().Year()
	months := []string{"1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"}

	stats := make([]studyStat, 0, 12)
	for m := 1; m <= 12; m++ {
		start := time.Date(year, time.Month(m), 1, 0, 0, 0, 0, time.Local)
		end := start.AddDate(0, 1, 0)

		var mediaCount int64
		database.DB.Model(&models.PlayRecord{}).
			Where("user_id = ? AND last_played_at >= ? AND last_played_at < ?", uid, start, end).
			Count(&mediaCount)

		var sentenceCount int64
		database.DB.Model(&models.SentenceProgress{}).
			Where("user_id = ? AND updated_at >= ? AND updated_at < ? AND completed = ?", uid, start, end, true).
			Count(&sentenceCount)

		var totalPlayed int64
		database.DB.Model(&models.PlayRecord{}).
			Where("user_id = ? AND last_played_at >= ? AND last_played_at < ?", uid, start, end).
			Select("COALESCE(SUM(play_count), 0)").Scan(&totalPlayed)

		stats = append(stats, studyStat{
			Date:          strconv.Itoa(year) + "-" + fmt2d(m),
			Label:         months[m-1],
			PlayCount:     totalPlayed,
			MediaCount:    mediaCount,
			SentenceCount: sentenceCount,
			IsCurrent:     year == currentYear && m == currentMonth,
		})
	}
	return stats
}

// getYearStats 获取最近 5 年的统计
func getYearStats(uid uint, base time.Time) []studyStat {
	currentYear := time.Now().Year()
	stats := make([]studyStat, 0, 5)

	for y := currentYear - 4; y <= currentYear; y++ {
		start := time.Date(y, 1, 1, 0, 0, 0, 0, time.Local)
		end := start.AddDate(1, 0, 0)

		var mediaCount int64
		database.DB.Model(&models.PlayRecord{}).
			Where("user_id = ? AND last_played_at >= ? AND last_played_at < ?", uid, start, end).
			Count(&mediaCount)

		var sentenceCount int64
		database.DB.Model(&models.SentenceProgress{}).
			Where("user_id = ? AND updated_at >= ? AND updated_at < ? AND completed = ?", uid, start, end, true).
			Count(&sentenceCount)

		var totalPlayed int64
		database.DB.Model(&models.PlayRecord{}).
			Where("user_id = ? AND last_played_at >= ? AND last_played_at < ?", uid, start, end).
			Select("COALESCE(SUM(play_count), 0)").Scan(&totalPlayed)

		stats = append(stats, studyStat{
			Date:          strconv.Itoa(y),
			Label:         strconv.Itoa(y) + "年",
			PlayCount:     totalPlayed,
			MediaCount:    mediaCount,
			SentenceCount: sentenceCount,
			IsCurrent:     y == currentYear,
		})
	}
	return stats
}

func fmt2d(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}
