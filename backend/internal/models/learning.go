package models

import (
	"time"

	"gorm.io/gorm"
)

// ============================================================================
// v1.0.0 多阶段学习复习体系
//
// 参考 docs/Reference/Echo-Loop 的「首次学习 + 7 轮复习」模型。
// 一个用户对一个媒体有一条 LearningProgress；每个完成的子步骤写一条
// SubStageCompletion；难句标记走 DifficultSentence。
// ============================================================================

// LearningProgress 多阶段学习进度（每用户每媒体一条）。
//
// CurrentStage 取值见 learning 包的 Stage 常量：
//   - first_learn / review_1 ~ review_7 / completed
// CurrentSubStage 取值见 learning 包的 SubStage 常量。
type LearningProgress struct {
	ID     uint           `gorm:"primaryKey" json:"id"`
	UserID uint           `gorm:"uniqueIndex:idx_lp_user_media;not null" json:"user_id"`
	MediaID uint          `gorm:"uniqueIndex:idx_lp_user_media;not null" json:"media_id"`

	// 当前阶段 / 子步骤
	CurrentStage    string `gorm:"size:32;not null;default:'first_learn'" json:"current_stage"`
	CurrentSubStage string `gorm:"size:32;not null;default:'intensive_listen'" json:"current_sub_stage"`

	// 阶段时间戳
	FirstLearnCompletedAt *time.Time `json:"first_learn_completed_at"`
	LastStageCompletedAt  *time.Time `json:"last_stage_completed_at"`
	CurrentStageStartedAt *time.Time `json:"current_stage_started_at"`

	// 累计学习时长（毫秒）
	TotalStudyDurationMs int64 `gorm:"default:0" json:"total_study_duration_ms"`

	// 阶段完成次数统计
	BlindListenPassCount     int `gorm:"default:0" json:"blind_listen_pass_count"`
	IntensiveListenPassCount int `gorm:"default:0" json:"intensive_listen_pass_count"`
	ShadowingPassCount       int `gorm:"default:0" json:"shadowing_pass_count"`
	RetellPassCount          int `gorm:"default:0" json:"retell_pass_count"`

	// 是否暂停（true 时不参与复习调度，进度数据完整保留）
	IsPaused bool `gorm:"default:false" json:"is_paused"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 显式指定表名
func (LearningProgress) TableName() string { return "learning_progress" }

// SubStageCompletion 子步骤完成记录（每个完成写一条，用于统计与历史）。
//
// 联合唯一索引 (user_id, media_id, stage, sub_stage) 防止同一子步骤被重复记录。
// 同一 stage 同一 sub_stage 只保留最新一条（写入时 UPSERT）。
type SubStageCompletion struct {
	ID      uint      `gorm:"primaryKey" json:"id"`
	UserID  uint      `gorm:"uniqueIndex:idx_sc_uniq;not null" json:"user_id"`
	MediaID uint      `gorm:"uniqueIndex:idx_sc_uniq;not null" json:"media_id"`
	Stage   string    `gorm:"size:32;uniqueIndex:idx_sc_uniq;not null" json:"stage"`
	SubStage string   `gorm:"size:32;uniqueIndex:idx_sc_uniq;not null" json:"sub_stage"`
	// 本次学习耗时（毫秒），由前端估算后上报
	StudyDurationMs int       `gorm:"default:0" json:"study_duration_ms"`
	CompletedAt     time.Time `gorm:"index" json:"completed_at"`
}

// TableName 显式指定表名
func (SubStageCompletion) TableName() string { return "sub_stage_completions" }

// DifficultSentence 难句标记（每用户每媒体每句一条）。
//
// 联合唯一索引 (user_id, media_id, sentence_index) 保证一个句子只能标记一次。
// 难句标记用于「跟读」/「复习-难句补练」子步骤中筛选播放列表。
type DifficultSentence struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"uniqueIndex:idx_ds_uniq;not null" json:"user_id"`
	MediaID       uint      `gorm:"uniqueIndex:idx_ds_uniq;not null" json:"media_id"`
	SentenceIndex int       `gorm:"uniqueIndex:idx_ds_uniq;not null" json:"sentence_index"`
	MarkedAt      time.Time `json:"marked_at"`
}

// TableName 显式指定表名
func (DifficultSentence) TableName() string { return "difficult_sentences" }
