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

// entityTypeReq 标签 attach/detach 通用请求体
type entityTypeReq struct {
	EntityType string `json:"entity_type" binding:"required,oneof=album season note media"`
	EntityID   uint   `json:"entity_id" binding:"required"`
}

// AttachEntityTag 给某个实体附加一个标签（幂等：已存在则不重复插入）。
// 路由: POST /tags/:id/attach
func AttachEntityTag() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		tagID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "标签 id 无效")
			return
		}
		var req entityTypeReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		// 校验标签属于当前用户
		var tag models.Tag
		if err := database.DB.Where("id = ? AND user_id = ?", tagID, uid).First(&tag).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "标签不存在")
			return
		}
		// 校验实体存在 + 权限（album/season/note 必须属于当前用户）
		if err := verifyEntityOwnership(uid, req.EntityType, req.EntityID); err != nil {
			utils.Fail(c, http.StatusNotFound, err.Error())
			return
		}
		et := models.EntityTag{
			UserID:     uid,
			TagID:      uint(tagID),
			EntityType: req.EntityType,
			EntityID:   req.EntityID,
		}
		// 复合唯一索引 (user_id, tag_id, entity_type, entity_id) 兜底重复插入
		database.DB.Where(et).FirstOrCreate(&et)
		utils.OK(c, gin.H{
			"tag":         tag,
			"entity_type": req.EntityType,
			"entity_id":   req.EntityID,
		})
	}
}

// DetachEntityTag 从某个实体上摘除一个标签。
// 路由: POST /tags/:id/detach
func DetachEntityTag() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		tagID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "标签 id 无效")
			return
		}
		var req entityTypeReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		database.DB.Where(
			"user_id = ? AND tag_id = ? AND entity_type = ? AND entity_id = ?",
			uid, tagID, req.EntityType, req.EntityID,
		).Delete(&models.EntityTag{})
		utils.OK(c, gin.H{"detached": true})
	}
}

// SetEntityTags 覆盖式设置某个实体的全部标签（用于管理弹窗一次性保存）。
// 路由: PUT /tags/entity?type=xxx&id=xxx
type setEntityTagsReq struct {
	EntityType string   `json:"entity_type" binding:"required,oneof=album season note media"`
	EntityID   uint     `json:"entity_id"   binding:"required"`
	TagIDs     []uint   `json:"tag_ids"     binding:"required"`
}

// SetEntityTags 覆盖式设置实体标签
func SetEntityTags() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var req setEntityTagsReq
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		if err := verifyEntityOwnership(uid, req.EntityType, req.EntityID); err != nil {
			utils.Fail(c, http.StatusNotFound, err.Error())
			return
		}
		// 校验所有标签属于当前用户
		var validTags []models.Tag
		if len(req.TagIDs) > 0 {
			if err := database.DB.Where("user_id = ? AND id IN ?", uid, req.TagIDs).Find(&validTags).Error; err != nil {
				utils.Fail(c, http.StatusInternalServerError, "查询标签失败: "+err.Error())
				return
			}
		}
		// 事务：先删除旧关联，再批量插入新关联
		err := database.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where(
				"user_id = ? AND entity_type = ? AND entity_id = ?",
				uid, req.EntityType, req.EntityID,
			).Delete(&models.EntityTag{}).Error; err != nil {
				return err
			}
			for _, t := range validTags {
				et := models.EntityTag{
					UserID:     uid,
					TagID:      t.ID,
					EntityType: req.EntityType,
					EntityID:   req.EntityID,
				}
				if err := tx.Where(et).FirstOrCreate(&et).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
		utils.OK(c, gin.H{"tags": validTags})
	}
}

// GetEntityTags 列出某个实体的全部标签（用于详情页加载时填充）。
// 路由: GET /tags/entity?type=xxx&id=xxx
func GetEntityTags() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		entityType := c.Query("type")
		entityID, _ := strconv.Atoi(c.Query("id"))
		if entityType == "" || entityID == 0 {
			utils.Fail(c, http.StatusBadRequest, "缺少 type 或 id 参数")
			return
		}
		var rows []models.EntityTag
		database.DB.Where(
			"user_id = ? AND entity_type = ? AND entity_id = ?",
			uid, entityType, entityID,
		).Find(&rows)
		if len(rows) == 0 {
			utils.OK(c, gin.H{"tags": []models.Tag{}})
			return
		}
		tagIDs := make([]uint, 0, len(rows))
		for _, r := range rows {
			tagIDs = append(tagIDs, r.TagID)
		}
		var tags []models.Tag
		database.DB.Where("user_id = ? AND id IN ?", uid, tagIDs).Order("name ASC").Find(&tags)
		utils.OK(c, gin.H{"tags": tags})
	}
}

// ListEntitiesByTag 按标签列出该用户所有携带此标签的实体，按类型分组（专辑 / 季 / 文件）。
// "文件" 包含两类：media (媒体文件) + note (学习页面)，前端展示时分别标为 媒体 / 笔记。
// 路由: GET /tags/:id/entities
func ListEntitiesByTag() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		tagID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "标签 id 无效")
			return
		}
		// 校验标签
		var tag models.Tag
		if err := database.DB.Where("id = ? AND user_id = ?", tagID, uid).First(&tag).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "标签不存在")
			return
		}

		// 1. 专辑 / 季：从 entity_tags 关联 AlbumMeta
		type AlbumEntry struct {
			Album      string  `json:"album"`
			SubAlbum   string  `json:"sub_album"`
			Name       string  `json:"name"`
			CoverPath  *string `json:"cover_path"`
			MetaID     uint    `json:"meta_id"`
		}
		var albumRows []struct {
			MetaID     uint
			Album      string
			SubAlbum   string
			CoverPath  *string
			EntityType string
		}
		database.DB.Table("entity_tags et").
			Select("am.id as meta_id, am.album as album, am.sub_album as sub_album, am.cover_path as cover_path, et.entity_type as entity_type").
			Joins("JOIN album_meta am ON am.id = et.entity_id").
			Where("et.user_id = ? AND et.tag_id = ? AND et.entity_type IN ?", uid, tagID, []string{models.EntityTypeAlbum, models.EntityTypeSeason}).
			Scan(&albumRows)

		// 2. 学习页面（note）
		var noteIDs []uint
		database.DB.Model(&models.EntityTag{}).
			Where("user_id = ? AND tag_id = ? AND entity_type = ?", uid, tagID, models.EntityTypeNote).
			Pluck("entity_id", &noteIDs)
		// 显式初始化为空切片，避免 nil 序列化为 null 导致前端 .length 报错
		notes := make([]models.StudyNote, 0)
		if len(noteIDs) > 0 {
			database.DB.Where("user_id = ? AND id IN ?", uid, noteIDs).Order("updated_at DESC").Find(&notes)
		}

		// 3. 媒体文件（media）：先查 entity_tags 关联的 media，再补充 media_tags 关联的（GORM many2many）
		var mediaIDs []uint
		database.DB.Model(&models.EntityTag{}).
			Where("user_id = ? AND tag_id = ? AND entity_type = ?", uid, tagID, models.EntityTypeMedia).
			Pluck("entity_id", &mediaIDs)
		// media_tags 是 GORM 自动管理的表，无 user_id；通过 tag_id 反查 + 验证 tag 属于当前用户
		var legacyMediaIDs []uint
		database.DB.Table("media_tags mt").
			Select("mt.media_file_id").
			Joins("JOIN tags t ON t.id = mt.tag_id").
			Where("t.user_id = ? AND mt.tag_id = ?", uid, tagID).
			Pluck("mt.media_file_id", &legacyMediaIDs)
		// 合并去重
		mediaIDSet := make(map[uint]struct{})
		for _, id := range mediaIDs {
			mediaIDSet[id] = struct{}{}
		}
		for _, id := range legacyMediaIDs {
			mediaIDSet[id] = struct{}{}
		}
		var allMediaIDs []uint
		for id := range mediaIDSet {
			allMediaIDs = append(allMediaIDs, id)
		}
		// 显式初始化为空切片，避免 nil 序列化为 null 导致前端 .length 报错
		medias := make([]models.MediaFile, 0)
		if len(allMediaIDs) > 0 {
			database.DB.Where("id IN ?", allMediaIDs).Order("file_modified_at DESC").Find(&medias)
		}

		// 分组
		albums := make([]AlbumEntry, 0)
		seasons := make([]AlbumEntry, 0)
		for _, r := range albumRows {
			entry := AlbumEntry{
				Album:     r.Album,
				SubAlbum:  r.SubAlbum,
				MetaID:    r.MetaID,
				CoverPath: r.CoverPath,
				Name:      r.Album,
			}
			if r.SubAlbum != "" {
				entry.Name = r.Album + " / " + r.SubAlbum
				seasons = append(seasons, entry)
			} else {
				albums = append(albums, entry)
			}
		}

		utils.OK(c, gin.H{
			"tag":     tag,
			"albums":  albums,
			"seasons": seasons,
			"notes":   notes,
			"medias":  medias,
		})
	}
}

// verifyEntityOwnership 校验实体属于当前用户，返回 nil 表示通过。
// 媒体文件无 user 归属（共享），仅校验存在且未删除。
func verifyEntityOwnership(uid uint, entityType string, entityID uint) error {
	switch entityType {
	case models.EntityTypeAlbum, models.EntityTypeSeason:
		var m models.AlbumMeta
		if err := database.DB.First(&m, entityID).Error; err != nil {
			return errNotFound("专辑/季")
		}
		return nil
	case models.EntityTypeNote:
		var n models.StudyNote
		if err := database.DB.Where("id = ? AND user_id = ?", entityID, uid).First(&n).Error; err != nil {
			return errNotFound("学习页面")
		}
		return nil
	case models.EntityTypeMedia:
		var m models.MediaFile
		if err := database.DB.First(&m, entityID).Error; err != nil {
			return errNotFound("媒体")
		}
		return nil
	default:
		return errNotFound("实体")
	}
}

// errNotFound 简化错误返回
type simpleErr struct{ msg string }

func (e *simpleErr) Error() string { return e.msg }
func errNotFound(kind string) error {
	return &simpleErr{msg: kind + " 不存在或无权限"}
}

// LoadTagsForEntities 批量加载某类型 / 某组 entity_id 对应的标签。
// 返回 map[entity_id][]Tag，方便业务侧按实体填充 tags 字段。
// userID 用于过滤，确保只返回当前用户的标签。
func LoadTagsForEntities(userID uint, entityType string, entityIDs []uint) map[uint][]models.Tag {
	result := make(map[uint][]models.Tag, len(entityIDs))
	if len(entityIDs) == 0 {
		return result
	}
	// 1) 查 entity_tags 关联
	var rows []models.EntityTag
	database.DB.Where(
		"user_id = ? AND entity_type = ? AND entity_id IN ?",
		userID, entityType, entityIDs,
	).Find(&rows)
	tagIDs := make(map[uint]struct{}, len(rows))
	for _, r := range rows {
		tagIDs[r.TagID] = struct{}{}
	}
	// 2) 媒体文件额外兼容 GORM media_tags（旧数据）
	if entityType == models.EntityTypeMedia {
		var legacyRows []struct{ TagID uint }
		database.DB.Table("media_tags mt").
			Select("mt.tag_id").
			Joins("JOIN tags t ON t.id = mt.tag_id").
			Where("t.user_id = ? AND mt.media_file_id IN ?", userID, entityIDs).
			Scan(&legacyRows)
		for _, r := range legacyRows {
			tagIDs[r.TagID] = struct{}{}
		}
	}
	if len(tagIDs) == 0 {
		return result
	}
	allTagIDs := make([]uint, 0, len(tagIDs))
	for id := range tagIDs {
		allTagIDs = append(allTagIDs, id)
	}
	var tags []models.Tag
	database.DB.Where("user_id = ? AND id IN ?", userID, allTagIDs).Order("name ASC").Find(&tags)
	tagByID := make(map[uint]models.Tag, len(tags))
	for _, t := range tags {
		tagByID[t.ID] = t
	}
	// 3) 把 tag 反向挂到 entity_id
	for _, r := range rows {
		if t, ok := tagByID[r.TagID]; ok {
			result[r.EntityID] = append(result[r.EntityID], t)
		}
	}
	if entityType == models.EntityTypeMedia {
		var legacyMap []struct {
			EntityID uint
			TagID    uint
		}
		database.DB.Table("media_tags mt").
			Select("mt.media_file_id as entity_id, mt.tag_id").
			Joins("JOIN tags t ON t.id = mt.tag_id").
			Where("t.user_id = ? AND mt.media_file_id IN ?", userID, entityIDs).
			Scan(&legacyMap)
		for _, r := range legacyMap {
			if t, ok := tagByID[r.TagID]; ok {
				result[r.EntityID] = append(result[r.EntityID], t)
			}
		}
	}
	return result
}
