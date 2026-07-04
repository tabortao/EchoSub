package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// ToggleAlbumPin 切换专辑置顶状态（按用户隔离）。
// 路由: POST /albums/:name/pin
func ToggleAlbumPin() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		album := c.Param("name")
		if album == "" {
			utils.Fail(c, http.StatusBadRequest, "缺少专辑名")
			return
		}
		var pin models.AlbumPin
		err := database.DB.Where("user_id = ? AND album = ?", uid, album).First(&pin).Error
		if err == nil {
			// 已置顶 → 取消
			database.DB.Delete(&pin)
			utils.OK(c, gin.H{"pinned": false})
			return
		}
		// 未置顶 → 新增
		// 同一用户所有置顶记录 sort 递增
		var maxSort int
		database.DB.Model(&models.AlbumPin{}).Where("user_id = ?", uid).
			Select("COALESCE(MAX(sort), -1)").Scan(&maxSort)
		database.DB.Create(&models.AlbumPin{
			UserID:    uid,
			Album:     album,
			Sort:      maxSort + 1,
			CreatedAt: time.Now(),
		})
		utils.OK(c, gin.H{"pinned": true})
	}
}

// listUserPins 拉取当前用户所有置顶专辑（按 sort 升序）→ map[album]=true
func listUserPins(uid uint) map[string]bool {
	var pins []models.AlbumPin
	database.DB.Where("user_id = ?", uid).Order("sort ASC").Find(&pins)
	m := make(map[string]bool, len(pins))
	for _, p := range pins {
		m[p.Album] = true
	}
	return m
}
