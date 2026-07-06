// 多阶段学习复习体系 handlers（v1.0.0 起）
//
// 设计要点：
//   - 每个 (user_id, media_id) 在 GET /api/v1/media/:id/learning-progress 时
//     自动 upsert 一条 LearningProgress（默认 first_learn / intensive_listen）
//   - 完成/跳过当前子步骤时：
//     1) 写一条 SubStageCompletion（UPSERT）
//     2) 推进 CurrentSubStage；末尾子步骤则推进到下一阶段 + 写入 last_stage_completed_at
//   - 难句标记走 DifficultSentence 表（每用户每媒体每句一条）
//   - 复习队列 = 当前 stage 为 review_N 且 last_stage_completed_at + intervalHours <= now
//
// 路由：
//   GET    /api/v1/media/:id/learning-progress        获取或自动创建学习进度
//   POST   /api/v1/media/:id/learning-progress/advance 完成当前子步骤并推进
//   POST   /api/v1/media/:id/learning-progress/skip    跳过当前子步骤（非入口）
//   POST   /api/v1/media/:id/learning-progress/pause   暂停学习
//   POST   /api/v1/media/:id/learning-progress/resume  恢复学习
//   GET    /api/v1/media/:id/difficult-sentences       列出已标记的难句
//   POST   /api/v1/media/:id/difficult-sentences       标记/取消标记难句
//   GET    /api/v1/learning/review-queue               待复习列表
//   GET    /api/v1/learning/stats                      学习统计
package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/learning"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// LearningHandler 多阶段学习复习体系 handler
type LearningHandler struct {
	db *gorm.DB
}

// NewLearningHandler 构造 handler
func NewLearningHandler() *LearningHandler {
	return &LearningHandler{db: database.DB}
}

// ============================================================================
// 通用辅助
// ============================================================================

// mediaIDParam 解析 URL 中的 :id
func mediaIDParam(c *gin.Context) (uint, bool) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		utils.Fail(c, http.StatusBadRequest, "无效的媒体 ID")
		return 0, false
	}
	return uint(id), true
}

// mediaExists 校验媒体是否存在
func (h *LearningHandler) mediaExists(mediaID uint) bool {
	var n int64
	h.db.Model(&models.MediaFile{}).Where("id = ?", mediaID).Count(&n)
	return n > 0
}

// getOrCreateProgress 拉取或自动创建学习进度。
//
// 已存在则返回；不存在则按 (first_learn, intensive_listen) 创建。
func (h *LearningHandler) getOrCreateProgress(userID, mediaID uint) (*models.LearningProgress, error) {
	var p models.LearningProgress
	err := h.db.Where("user_id = ? AND media_id = ?", userID, mediaID).First(&p).Error
	if err == nil {
		return &p, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	// 自动创建
	now := time.Now()
	p = models.LearningProgress{
		UserID:               userID,
		MediaID:              mediaID,
		CurrentStage:         learning.StageFirstLearn,
		CurrentSubStage:      learning.SubStageIntensiveListen,
		CurrentStageStartedAt: &now,
	}
	if err := h.db.Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

// progressResponse 序列化学习进度响应
type progressResponse struct {
	models.LearningProgress
	// 派生字段
	StageLabel       string `json:"stage_label"`
	StageEmoji       string `json:"stage_emoji"`
	SubStageLabel    string `json:"sub_stage_label"`
	StagePlan        []string `json:"stage_plan"`
	StageIndex       int    `json:"stage_index"`
	StageSubIndex    int    `json:"stage_sub_index"`
	IsEntrySubStage  bool   `json:"is_entry_sub_stage"`
	NextReviewAt     *time.Time `json:"next_review_at,omitempty"`
	IntervalHours    int    `json:"interval_hours"`
	IsReviewReady    bool   `json:"is_review_ready"`
	IsCompleted      bool   `json:"is_completed"`
	TotalSubStages   int    `json:"total_sub_stages"`
	CompletedSubStages int  `json:"completed_sub_stages"`
}

// buildProgressResponse 由 LearningProgress 派生响应
func (h *LearningHandler) buildProgressResponse(p *models.LearningProgress) (progressResponse, error) {
	plan := learning.PlanFor(p.CurrentStage)
	subIdx := -1
	for i, s := range plan {
		if s == p.CurrentSubStage {
			subIdx = i
			break
		}
	}
	if subIdx < 0 && len(plan) > 0 {
		subIdx = 0
	}

	// 已完成的子步骤数（来自 SubStageCompletion）
	var done int64
	if err := h.db.Model(&models.SubStageCompletion{}).
		Where("user_id = ? AND media_id = ? AND stage = ?", p.UserID, p.MediaID, p.CurrentStage).
		Count(&done).Error; err != nil {
		return progressResponse{}, err
	}

	var nextReviewAt *time.Time
	var intervalHours int
	isReady := true
	if learning.IsReviewStage(p.CurrentStage) && p.LastStageCompletedAt != nil {
		at := learning.NextReviewAt(p.CurrentStage, *p.LastStageCompletedAt)
		nextReviewAt = &at
		intervalHours = int(learning.IntervalFor(p.CurrentStage).Hours())
		isReady = !at.IsZero() && !time.Now().Before(at)
	}

	return progressResponse{
		LearningProgress:  *p,
		StageLabel:        learning.LabelFor(p.CurrentStage),
		StageEmoji:        learning.EmojiFor(p.CurrentStage),
		SubStageLabel:     learning.SubStageLabelFor(p.CurrentSubStage),
		StagePlan:         plan,
		StageIndex:        stageIndex(p.CurrentStage),
		StageSubIndex:     subIdx,
		IsEntrySubStage:   learning.IsEntrySubStage(p.CurrentStage, p.CurrentSubStage),
		NextReviewAt:      nextReviewAt,
		IntervalHours:     intervalHours,
		IsReviewReady:     isReady,
		IsCompleted:       p.CurrentStage == learning.StageCompleted,
		TotalSubStages:    len(plan),
		CompletedSubStages: int(done),
	}, nil
}

// stageIndex 返回阶段在 stageOrder 中的索引（0-based）；未知阶段返回 0
func stageIndex(stage string) int {
	for i, s := range []string{
		learning.StageFirstLearn, learning.StageReview1, learning.StageReview2,
		learning.StageReview3, learning.StageReview4, learning.StageReview5,
		learning.StageReview6, learning.StageReview7, learning.StageCompleted,
	} {
		if s == stage {
			return i
		}
	}
	return 0
}

// ============================================================================
// 1) GET /api/v1/media/:id/learning-progress
// ============================================================================

// GetLearningProgress 获取（或自动创建）当前学习进度
func (h *LearningHandler) GetLearningProgress(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}
	if !h.mediaExists(mediaID) {
		utils.Fail(c, http.StatusNotFound, "媒体不存在")
		return
	}
	p, err := h.getOrCreateProgress(uid, mediaID)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载学习进度失败")
		return
	}
	resp, err := h.buildProgressResponse(p)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "构造响应失败")
		return
	}
	utils.OK(c, resp)
}

// ============================================================================
// 2) POST /api/v1/media/:id/learning-progress/advance
// ============================================================================

// AdvanceLearningProgress 完成当前子步骤并推进
func (h *LearningHandler) AdvanceLearningProgress(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}

	// 解析可选 body（前端可上报学习时长）
	var body struct {
		StudyDurationMs int `json:"study_duration_ms"`
	}
	_ = c.ShouldBindJSON(&body)

	if !h.mediaExists(mediaID) {
		utils.Fail(c, http.StatusNotFound, "媒体不存在")
		return
	}
	p, err := h.getOrCreateProgress(uid, mediaID)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载学习进度失败")
		return
	}

	// 已暂停 / 已完成：拒绝推进
	if p.IsPaused {
		utils.Fail(c, http.StatusBadRequest, "学习已暂停，请先恢复")
		return
	}
	if p.CurrentStage == learning.StageCompleted {
		utils.Fail(c, http.StatusBadRequest, "已完成全部学习")
		return
	}

	now := time.Now()

	// 1) UPSERT SubStageCompletion
	completion := models.SubStageCompletion{
		UserID:          uid,
		MediaID:         mediaID,
		Stage:           p.CurrentStage,
		SubStage:        p.CurrentSubStage,
		StudyDurationMs: body.StudyDurationMs,
		CompletedAt:     now,
	}
	// 复合唯一 (user_id, media_id, stage, sub_stage) → ON CONFLICT 替换
	if err := h.db.Where(
		"user_id = ? AND media_id = ? AND stage = ? AND sub_stage = ?",
		uid, mediaID, p.CurrentStage, p.CurrentSubStage,
	).Assign(map[string]any{
		"study_duration_ms": body.StudyDurationMs,
		"completed_at":      now,
	}).FirstOrCreate(&completion).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "写入子步骤完成记录失败")
		return
	}

	// 2) 推进 sub_stage / stage
	nextSub, nextStage, isNextInStage := learning.NextSubStage(p.CurrentStage, p.CurrentSubStage)

	if isNextInStage {
		// 同一阶段的下一子步骤
		p.CurrentSubStage = nextSub
	} else if nextStage != "" && nextStage != p.CurrentStage {
		// 跨阶段推进
		p.LastStageCompletedAt = &now
		p.CurrentStage = nextStage
		// 下一阶段的第一子步骤
		plan := learning.PlanFor(nextStage)
		if len(plan) > 0 {
			p.CurrentSubStage = plan[0]
		}
		p.CurrentStageStartedAt = &now
		// 阶段完成次数
		switch p.CurrentSubStage {
		case learning.SubStageIntensiveListen:
			p.IntensiveListenPassCount++
		case learning.SubStageShadowing:
			p.ShadowingPassCount++
		case learning.SubStageBlindListen, learning.SubStageReviewBlind:
			p.BlindListenPassCount++
		case learning.SubStageRetell:
			p.RetellPassCount++
		}
		// 首次学习完成时打 first_learn_completed_at
		if p.CurrentStage != learning.StageFirstLearn && p.FirstLearnCompletedAt == nil {
			p.FirstLearnCompletedAt = &now
		}
	} else {
		// 已是 plan 末尾（终态）
		p.LastStageCompletedAt = &now
		p.CurrentStage = learning.StageCompleted
		p.CurrentSubStage = ""
	}

	// 3) 累计学习时长
	p.TotalStudyDurationMs += int64(body.StudyDurationMs)
	if body.StudyDurationMs > 0 {
		// 阶段完成次数统计（按 sub-stage 累加，方便后续分析）
		switch p.CurrentSubStage {
		case learning.SubStageIntensiveListen:
			if !isNextInStage && nextStage == "" {
				p.IntensiveListenPassCount++
			}
		case learning.SubStageShadowing:
			if !isNextInStage && nextStage == "" {
				p.ShadowingPassCount++
			}
		case learning.SubStageBlindListen, learning.SubStageReviewBlind:
			if !isNextInStage && nextStage == "" {
				p.BlindListenPassCount++
			}
		case learning.SubStageRetell:
			if !isNextInStage && nextStage == "" {
				p.RetellPassCount++
			}
		}
	}

	// 阶段内推进也累加 pass_count
	if isNextInStage {
		switch p.CurrentSubStage {
		case learning.SubStageIntensiveListen:
			p.IntensiveListenPassCount++
		case learning.SubStageShadowing:
			p.ShadowingPassCount++
		case learning.SubStageBlindListen, learning.SubStageReviewBlind:
			p.BlindListenPassCount++
		case learning.SubStageRetell:
			p.RetellPassCount++
		}
	}

	if err := h.db.Save(p).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "保存学习进度失败")
		return
	}

	resp, _ := h.buildProgressResponse(p)
	utils.OK(c, gin.H{
		"progress":    resp,
		"stage_advanced": !isNextInStage,
	})
}

// ============================================================================
// 3) POST /api/v1/media/:id/learning-progress/skip
// ============================================================================

// SkipLearningProgress 跳过当前子步骤（非入口）
func (h *LearningHandler) SkipLearningProgress(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}
	if !h.mediaExists(mediaID) {
		utils.Fail(c, http.StatusNotFound, "媒体不存在")
		return
	}
	p, err := h.getOrCreateProgress(uid, mediaID)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载学习进度失败")
		return
	}
	if p.IsPaused {
		utils.Fail(c, http.StatusBadRequest, "学习已暂停")
		return
	}
	if learning.IsEntrySubStage(p.CurrentStage, p.CurrentSubStage) {
		utils.Fail(c, http.StatusBadRequest, "入口子步骤不可跳过")
		return
	}

	// skip 行为与 advance 相同（不写 SubStageCompletion，因为没真做）
	nextSub, nextStage, isNextInStage := learning.NextSubStage(p.CurrentStage, p.CurrentSubStage)
	now := time.Now()
	if isNextInStage {
		p.CurrentSubStage = nextSub
	} else if nextStage != "" && nextStage != p.CurrentStage {
		p.LastStageCompletedAt = &now
		p.CurrentStage = nextStage
		plan := learning.PlanFor(nextStage)
		if len(plan) > 0 {
			p.CurrentSubStage = plan[0]
		}
		p.CurrentStageStartedAt = &now
		if p.CurrentStage != learning.StageFirstLearn && p.FirstLearnCompletedAt == nil {
			p.FirstLearnCompletedAt = &now
		}
	} else {
		p.LastStageCompletedAt = &now
		p.CurrentStage = learning.StageCompleted
		p.CurrentSubStage = ""
	}

	if err := h.db.Save(p).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "保存学习进度失败")
		return
	}
	resp, _ := h.buildProgressResponse(p)
	utils.OK(c, gin.H{
		"progress":       resp,
		"stage_advanced": !isNextInStage,
	})
}

// ============================================================================
// 4) POST /api/v1/media/:id/learning-progress/pause
// ============================================================================

// PauseLearningProgress 暂停学习
func (h *LearningHandler) PauseLearningProgress(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}
	p, err := h.getOrCreateProgress(uid, mediaID)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载学习进度失败")
		return
	}
	p.IsPaused = true
	if err := h.db.Save(p).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "暂停失败")
		return
	}
	resp, _ := h.buildProgressResponse(p)
	utils.OK(c, gin.H{"progress": resp})
}

// ============================================================================
// 5) POST /api/v1/media/:id/learning-progress/resume
// ============================================================================

// ResumeLearningProgress 恢复学习
func (h *LearningHandler) ResumeLearningProgress(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}
	p, err := h.getOrCreateProgress(uid, mediaID)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载学习进度失败")
		return
	}
	p.IsPaused = false
	if err := h.db.Save(p).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "恢复失败")
		return
	}
	resp, _ := h.buildProgressResponse(p)
	utils.OK(c, gin.H{"progress": resp})
}

// ============================================================================
// 6) GET /api/v1/media/:id/difficult-sentences
// ============================================================================

// ListDifficultSentences 列出当前媒体已标记的难句
func (h *LearningHandler) ListDifficultSentences(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}
	var items []models.DifficultSentence
	if err := h.db.Where("user_id = ? AND media_id = ?", uid, mediaID).
		Order("sentence_index ASC").Find(&items).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载难句失败")
		return
	}
	if items == nil {
		items = []models.DifficultSentence{}
	}
	utils.OK(c, gin.H{"items": items, "count": len(items)})
}

// ============================================================================
// 7) POST /api/v1/media/:id/difficult-sentences
// ============================================================================

// markDifficultReq 标记/取消标记难句请求体
//
// 关键：SentenceIndex 允许 0（如「第一句」），不能用 binding:"required"（Gin 对 int
// 的 required 校验是 != 0，会误拒 0）。改用 pointer + 手动 nil 检查。
type markDifficultReq struct {
	SentenceIndex *int `json:"sentence_index"`
	Marked        bool `json:"marked"`
}

// MarkDifficultSentence 标记或取消标记难句
func (h *LearningHandler) MarkDifficultSentence(c *gin.Context) {
	uid := middleware.GetUserID(c)
	mediaID, ok := mediaIDParam(c)
	if !ok {
		return
	}
	var req markDifficultReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, http.StatusBadRequest, "请求参数无效")
		return
	}
	if req.SentenceIndex == nil {
		utils.Fail(c, http.StatusBadRequest, "sentence_index 不能为空")
		return
	}
	idx := *req.SentenceIndex
	if idx < 0 {
		utils.Fail(c, http.StatusBadRequest, "sentence_index 必须 ≥ 0")
		return
	}
	if !h.mediaExists(mediaID) {
		utils.Fail(c, http.StatusNotFound, "媒体不存在")
		return
	}

	if req.Marked {
		// UPSERT
		rec := models.DifficultSentence{
			UserID:        uid,
			MediaID:       mediaID,
			SentenceIndex: idx,
			MarkedAt:      time.Now(),
		}
		if err := h.db.Where(
			"user_id = ? AND media_id = ? AND sentence_index = ?",
			uid, mediaID, idx,
		).Assign(map[string]any{"marked_at": time.Now()}).
			FirstOrCreate(&rec).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "标记失败")
			return
		}
		utils.OK(c, gin.H{"marked": true, "sentence_index": idx})
		return
	}

	// 取消标记：删除
	if err := h.db.Where(
		"user_id = ? AND media_id = ? AND sentence_index = ?",
		uid, mediaID, idx,
	).Delete(&models.DifficultSentence{}).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "取消标记失败")
		return
	}
	utils.OK(c, gin.H{"marked": false, "sentence_index": idx})
}

// ============================================================================
// 8) GET /api/v1/learning/review-queue
// ============================================================================

// reviewQueueItem 复习队列项
type reviewQueueItem struct {
	MediaID         uint       `json:"media_id"`
	MediaName       string     `json:"media_name"`
	MediaType       string     `json:"media_type"`
	MediaAlbum      *string    `json:"media_album"`
	MediaSubAlbum   *string    `json:"media_sub_album"`
	MediaCoverPath  *string    `json:"media_cover_path"`
	CurrentStage    string     `json:"current_stage"`
	StageLabel      string     `json:"stage_label"`
	StageEmoji      string     `json:"stage_emoji"`
	CurrentSubStage string     `json:"current_sub_stage"`
	SubStageLabel   string     `json:"sub_stage_label"`
	LastCompletedAt *time.Time `json:"last_completed_at"`
	NextReviewAt    time.Time  `json:"next_review_at"`
	IsOverdue       bool       `json:"is_overdue"`
	IsReady         bool       `json:"is_ready"`
	HoursUntilReady int        `json:"hours_until_ready"`
}

// ListReviewQueue 待复习列表（按 NextReviewAt 升序）
func (h *LearningHandler) ListReviewQueue(c *gin.Context) {
	uid := middleware.GetUserID(c)

	var progresses []models.LearningProgress
	if err := h.db.Where(
		"user_id = ? AND current_stage != ? AND current_stage != ? AND is_paused = ?",
		uid, learning.StageFirstLearn, learning.StageCompleted, false,
	).Find(&progresses).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载复习队列失败")
		return
	}
	if len(progresses) == 0 {
		utils.OK(c, gin.H{"items": []reviewQueueItem{}, "count": 0})
		return
	}

	// 批量拉取媒体信息
	mediaIDs := make([]uint, 0, len(progresses))
	for _, p := range progresses {
		mediaIDs = append(mediaIDs, p.MediaID)
	}
	var medias []models.MediaFile
	if err := h.db.Where("id IN ?", mediaIDs).Find(&medias).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载媒体元数据失败")
		return
	}
	mediaMap := make(map[uint]models.MediaFile, len(medias))
	for _, m := range medias {
		mediaMap[m.ID] = m
	}

	now := time.Now()
	items := make([]reviewQueueItem, 0, len(progresses))
	for _, p := range progresses {
		if p.LastStageCompletedAt == nil {
			continue
		}
		at := learning.NextReviewAt(p.CurrentStage, *p.LastStageCompletedAt)
		if at.IsZero() {
			continue
		}
		var hoursUntil int
		if at.After(now) {
			hoursUntil = int(at.Sub(now).Hours() + 0.5)
		} else {
			hoursUntil = 0
		}
		m, ok := mediaMap[p.MediaID]
		if !ok {
			continue
		}
		items = append(items, reviewQueueItem{
			MediaID:         p.MediaID,
			MediaName:       m.Name,
			MediaType:       m.Type,
			MediaAlbum:      m.Album,
			MediaSubAlbum:   m.SubAlbum,
			MediaCoverPath:  m.CoverPath,
			CurrentStage:    p.CurrentStage,
			StageLabel:      learning.LabelFor(p.CurrentStage),
			StageEmoji:      learning.EmojiFor(p.CurrentStage),
			CurrentSubStage: p.CurrentSubStage,
			SubStageLabel:   learning.SubStageLabelFor(p.CurrentSubStage),
			LastCompletedAt: p.LastStageCompletedAt,
			NextReviewAt:    at,
			IsOverdue:       now.After(at),
			IsReady:         !now.Before(at),
			HoursUntilReady: hoursUntil,
		})
	}

	// 按 nextReviewAt 升序
	sort.Slice(items, func(i, j int) bool {
		return items[i].NextReviewAt.Before(items[j].NextReviewAt)
	})

	utils.OK(c, gin.H{"items": items, "count": len(items)})
}

// ============================================================================
// 9) GET /api/v1/learning/stats
// ============================================================================

// learningStatsResponse 学习统计
type learningStatsResponse struct {
	FirstLearning  int            `json:"first_learning"`   // 首次学习中的媒体数
	ReviewingByStage map[string]int `json:"reviewing_by_stage"` // review_1..review_7 → 媒体数
	TotalReviewing int            `json:"total_reviewing"`
	Completed      int            `json:"completed"`
	Paused         int            `json:"paused"`
	Total          int            `json:"total"`
}

// GetLearningStats 学习统计
func (h *LearningHandler) GetLearningStats(c *gin.Context) {
	uid := middleware.GetUserID(c)
	var rows []models.LearningProgress
	if err := h.db.Where("user_id = ?", uid).Find(&rows).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "加载统计失败")
		return
	}
	stats := learningStatsResponse{
		ReviewingByStage: map[string]int{
			learning.StageReview1: 0, learning.StageReview2: 0, learning.StageReview3: 0,
			learning.StageReview4: 0, learning.StageReview5: 0, learning.StageReview6: 0,
			learning.StageReview7: 0,
		},
	}
	for _, p := range rows {
		stats.Total++
		if p.IsPaused {
			stats.Paused++
			continue
		}
		switch p.CurrentStage {
		case learning.StageFirstLearn:
			stats.FirstLearning++
		case learning.StageCompleted:
			stats.Completed++
		default:
			if c, ok := stats.ReviewingByStage[p.CurrentStage]; ok {
				stats.ReviewingByStage[p.CurrentStage] = c + 1
			}
		}
	}
	stats.TotalReviewing = stats.FirstLearning
	for _, v := range stats.ReviewingByStage {
		stats.TotalReviewing += v
	}
	utils.OK(c, stats)
}
