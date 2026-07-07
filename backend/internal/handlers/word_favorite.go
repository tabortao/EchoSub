// 单词收藏（v1.3.0 起，v1.3.2 增强词义持久化）
//
// 路由：
//   GET    /api/v1/word-favorites        列出当前用户收藏的单词（支持模糊搜索 + 分页）
//   POST   /api/v1/word-favorites        收藏一个单词（按 word 去重，幂等）
//   DELETE /api/v1/word-favorites/:id    删除一条收藏
//   GET    /api/v1/word-favorites/check  批量检查一组单词是否被收藏（用于 UI 高亮）
//
// 设计要点：
//   - 同一用户同一单词只允许一条记录；重复 POST 视为「重新收藏」并把 hit_count++
//   - Source 字段保留首次来源，再次 POST 不更新（避免覆盖）
//   - Note 字段用户可在「收藏页」编辑
//   - 列表默认按 updated_at DESC 倒序，最新收藏在前
//
// v1.3.2 新增：
//   - QueryResult 字段：收藏时把查词结果原样存为 JSON
//     下次查同词时直接返回，不再访问网络（彻底解决网页词典 403 / 代理失败问题）
//   - 内置 /database/query-result 接口（前端在收藏时调用），把当前查词结果 POST 进来
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// MaxWordFavoriteWordLen 单词最大长度（防异常输入 + 与 model size 对齐）
const MaxWordFavoriteWordLen = 128

// wordFavoriteItem 列表项 / 详情统一响应
type wordFavoriteItem struct {
	ID          uint      `json:"id"`
	Word        string    `json:"word"`
	Source      string    `json:"source"`
	Note        string    `json:"note"`
	HitCount    int       `json:"hit_count"`
	QueryResult string    `json:"query_result,omitempty"` // v1.3.2 起新增
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func toWordFavoriteItem(w *models.WordFavorite) wordFavoriteItem {
	return wordFavoriteItem{
		ID:          w.ID,
		Word:        w.Word,
		Source:      w.Source,
		Note:        w.Note,
		HitCount:    w.HitCount,
		QueryResult: w.QueryResult,
		CreatedAt:   w.CreatedAt,
		UpdatedAt:   w.UpdatedAt,
	}
}

// loadWordFavoriteCache 读取某用户某词的收藏快照（v1.3.2 起新增）
// 返回 (queryResultMap, ok)：
//   - ok=true 且 map 非空 → 该词已被收藏且 query_result 非空
//   - ok=true 且 map 为空 → 收藏过但 query_result 为空（罕见，可能是老数据）
//   - ok=false            → 没收藏过
//
// 用途：在 web_dict.go 的 LookupWebDict 中先查这个，
//      命中就直接返回，零网络请求。
func loadWordFavoriteCache(uid uint, source, word string) (gin.H, bool) {
	if uid == 0 {
		return nil, false
	}
	w := strings.ToLower(strings.TrimSpace(word))
	if w == "" {
		return nil, false
	}
	var fav models.WordFavorite
	err := database.DB.
		Where("user_id = ? AND word = ?", uid, w).
		First(&fav).Error
	if err != nil {
		// 包括 gorm.ErrRecordNotFound；任何错误都当作没收藏过
		return nil, false
	}
	if strings.TrimSpace(fav.QueryResult) == "" {
		// 收藏过但没存词义（老数据 / 用户主动清空）
		return gin.H{
			"favorite_id":     fav.ID,
			"favorite_source": fav.Source,
			"favorite_note":   fav.Note,
			"favorite_only":   true, // 标记：仅收藏记录，没有词义快照
		}, true
	}
	// 解析 query_result JSON
	var cached map[string]interface{}
	if err := json.Unmarshal([]byte(fav.QueryResult), &cached); err != nil {
		// JSON 损坏：当作仅收藏
		return gin.H{
			"favorite_id":     fav.ID,
			"favorite_source": fav.Source,
			"favorite_note":   fav.Note,
			"favorite_only":   true,
		}, true
	}
	// 把 source 覆盖成请求的 source（用户可能在不同源之间切换）
	cached["favorite_id"] = fav.ID
	cached["favorite_source"] = fav.Source
	cached["favorite_note"] = fav.Note
	if _, ok := cached["source"]; !ok {
		cached["source"] = source
	}
	return cached, true
}

// ListWordFavorites 列出当前用户收藏的单词
// GET /api/v1/word-favorites?q=hel&page=1&size=50
//
// 行为：
//   - q 非空：word LIKE '%q%'（不区分大小写）
//   - 不传 page/size：默认 page=1, size=50
//   - 返回 items（当前页）+ total（总数）
func ListWordFavorites() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		if uid == 0 {
			utils.Fail(c, http.StatusUnauthorized, "未登录")
			return
		}
		q := strings.TrimSpace(c.Query("q"))
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		if page < 1 {
			page = 1
		}
		size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
		if size < 1 || size > 200 {
			size = 50
		}

		tx := database.DB.Model(&models.WordFavorite{}).Where("user_id = ?", uid)
		if q != "" {
			tx = tx.Where("LOWER(word) LIKE ?", "%"+strings.ToLower(q)+"%")
		}

		var total int64
		if err := tx.Count(&total).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
			return
		}

		var rows []models.WordFavorite
		if err := tx.Order("updated_at DESC").
			Offset((page - 1) * size).
			Limit(size).
			Find(&rows).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
			return
		}

		items := make([]wordFavoriteItem, 0, len(rows))
		for i := range rows {
			items = append(items, toWordFavoriteItem(&rows[i]))
		}
		utils.OK(c, gin.H{
			"items": items,
			"total": total,
			"page":  page,
			"size":  size,
		})
	}
}

// createWordFavoriteReq 收藏请求（v1.3.2 起新增 query_result 字段）
type createWordFavoriteReq struct {
	Word        string `json:"word" binding:"required"`
	Source      string `json:"source"`
	Note        string `json:"note"`
	// QueryResult 词义快照（v1.3.2 起新增）
	// 客户端把查词弹窗当前展示的内容（任意 JSON 对象）原样传过来；
	// 后端序列化后存数据库，下次查同词时直接返回，零网络请求。
	// 留空 = 只收藏单词，不缓存词义。
	QueryResult map[string]interface{} `json:"query_result"`
}

// CreateWordFavorite 收藏一个单词
// POST /api/v1/word-favorites
// 幂等：同 user 重复收藏同 word 视为「再次收藏」（hit_count++），不报错
//
// v1.3.2 起：可同时携带 query_result，把查词快照存下来
func CreateWordFavorite() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		if uid == 0 {
			utils.Fail(c, http.StatusUnauthorized, "未登录")
			return
		}
		var req createWordFavoriteReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		word := strings.ToLower(strings.TrimSpace(req.Word))
		if word == "" {
			utils.Fail(c, http.StatusBadRequest, "word 不能为空")
			return
		}
		if len(word) > MaxWordFavoriteWordLen {
			utils.Fail(c, http.StatusBadRequest, "word 过长")
			return
		}
		source := strings.TrimSpace(req.Source)
		if len(source) > 32 {
			source = source[:32]
		}

		// v1.3.2：序列化 query_result JSON
		var queryResultJSON string
		if req.QueryResult != nil && len(req.QueryResult) > 0 {
			b, err := json.Marshal(req.QueryResult)
			if err != nil {
				utils.Fail(c, http.StatusBadRequest, "query_result 序列化失败: "+err.Error())
				return
			}
			// 限制大小（防止异常输入把数据库塞满）
			if len(b) > 256*1024 {
				utils.Fail(c, http.StatusBadRequest, "query_result 过大（> 256 KB）")
				return
			}
			queryResultJSON = string(b)
		}

		var w models.WordFavorite
		err := database.DB.Transaction(func(tx *gorm.DB) error {
			res := tx.Where("user_id = ? AND word = ?", uid, word).First(&w)
			if res.Error == nil {
				// 已存在：更新 note / hit_count / query_result，保留首次 source
				w.Note = req.Note
				w.HitCount++
				w.UpdatedAt = time.Now()
				// v1.3.2：query_result 若传了非空值就更新（允许重新收藏时刷新快照）
				if queryResultJSON != "" {
					w.QueryResult = queryResultJSON
				}
				return tx.Save(&w).Error
			}
			// 新建
			w = models.WordFavorite{
				UserID:      uid,
				Word:        word,
				Source:      source,
				Note:        req.Note,
				HitCount:    1,
				QueryResult: queryResultJSON,
				UpdatedAt:   time.Now(),
			}
			return tx.Create(&w).Error
		})
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "收藏失败: "+err.Error())
			return
		}
		utils.OK(c, toWordFavoriteItem(&w))
	}
}

// DeleteWordFavorite 删除一条收藏
// DELETE /api/v1/word-favorites/:id
func DeleteWordFavorite() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		if uid == 0 {
			utils.Fail(c, http.StatusUnauthorized, "未登录")
			return
		}
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "id 不合法")
			return
		}
		res := database.DB.Where("user_id = ? AND id = ?", uid, id).Delete(&models.WordFavorite{})
		if res.Error != nil {
			utils.Fail(c, http.StatusInternalServerError, "删除失败: "+res.Error.Error())
			return
		}
		if res.RowsAffected == 0 {
			utils.Fail(c, http.StatusNotFound, "收藏不存在")
			return
		}
		utils.OK(c, gin.H{"id": id, "deleted": true})
	}
}

// CheckWordFavorites 批量检查一组单词是否被收藏
// GET /api/v1/word-favorites/check?words=hello,world,foo
//
// 响应：{ "favorited": { "hello": <id 或 0>, "world": <id 或 0> } }
// 值为 0 = 未收藏；非 0 = 已收藏，返回该收藏的 id
//
// 用途：句子详情页一次性判断该句所有单词中哪些已收藏，弹窗内给「已收藏」星标。
func CheckWordFavorites() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		if uid == 0 {
			utils.Fail(c, http.StatusUnauthorized, "未登录")
			return
		}
		raw := strings.TrimSpace(c.Query("words"))
		if raw == "" {
			utils.OK(c, gin.H{"favorited": map[string]uint{}})
			return
		}
		parts := strings.Split(raw, ",")
		seen := make(map[string]struct{}, len(parts))
		norm := make([]string, 0, len(parts))
		for _, p := range parts {
			w := strings.ToLower(strings.TrimSpace(p))
			if w == "" || len(w) > MaxWordFavoriteWordLen {
				continue
			}
			if _, ok := seen[w]; ok {
				continue
			}
			seen[w] = struct{}{}
			norm = append(norm, w)
		}
		if len(norm) == 0 {
			utils.OK(c, gin.H{"favorited": map[string]uint{}})
			return
		}
		var rows []models.WordFavorite
		if err := database.DB.
			Where("user_id = ? AND word IN ?", uid, norm).
			Find(&rows).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
			return
		}
		fav := make(map[string]uint, len(rows))
		for _, w := range rows {
			fav[w.Word] = w.ID
		}
		utils.OK(c, gin.H{"favorited": fav})
	}
}

// updateWordFavoriteNoteReq 更新笔记请求
type updateWordFavoriteNoteReq struct {
	Note string `json:"note"`
}

// UpdateWordFavoriteNote 更新某条收藏的笔记
// PATCH /api/v1/word-favorites/:id
func UpdateWordFavoriteNote() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		if uid == 0 {
			utils.Fail(c, http.StatusUnauthorized, "未登录")
			return
		}
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "id 不合法")
			return
		}
		var req updateWordFavoriteNoteReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var w models.WordFavorite
		if err := database.DB.Where("user_id = ? AND id = ?", uid, id).First(&w).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "收藏不存在")
			return
		}
		w.Note = req.Note
		w.UpdatedAt = time.Now()
		if err := database.DB.Save(&w).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "更新失败: "+err.Error())
			return
		}
		utils.OK(c, toWordFavoriteItem(&w))
	}
}
