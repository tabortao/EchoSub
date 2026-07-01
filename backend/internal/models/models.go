package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户
type User struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Username     string         `gorm:"uniqueIndex;size:64;not null" json:"username"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// MediaFile 媒体文件
type MediaFile struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	Path           string         `gorm:"size:1024;not null;uniqueIndex" json:"path"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	Type           string         `gorm:"size:16;not null" json:"type"` // video / audio
	Album          *string        `gorm:"size:255;index" json:"album"`
	Duration       float64        `json:"duration"` // 秒
	FileSize       int64          `json:"file_size"`
	FileModifiedAt time.Time      `json:"file_modified_at"`
	SubtitlePath   *string        `gorm:"size:1024" json:"subtitle_path"`
	CoverPath      *string        `gorm:"size:1024" json:"cover_path"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	Tags           []Tag          `gorm:"many2many:media_tags;" json:"tags"`
}

// Tag 标签
type Tag struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:64;not null" json:"name"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// PlayRecord 播放记录
type PlayRecord struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"index;not null" json:"user_id"`
	MediaID       uint      `gorm:"index;not null" json:"media_id"`
	PlayCount     int       `json:"play_count"`
	LastPosition  float64   `json:"last_position"` // 秒
	LastPlayedAt  time.Time `json:"last_played_at"`
	Media         MediaFile `gorm:"foreignKey:MediaID" json:"media,omitempty"`
}

// SentenceProgress 句子背诵进度
type SentenceProgress struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	MediaID      uint      `gorm:"index;not null" json:"media_id"`
	SentenceIndex int      `gorm:"not null" json:"sentence_index"`
	Completed    bool      `json:"completed"`
	RepeatCount  int       `json:"repeat_count"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Setting 用户学习偏好
type Setting struct {
	ID             uint  `gorm:"primaryKey" json:"id"`
	UserID         uint  `gorm:"uniqueIndex;not null" json:"user_id"`
	LoopCount      int   `json:"loop_count"`       // 整体循环次数
	SentenceRepeat int   `json:"sentence_repeat"`  // 逐句重复次数
	PauseSeconds   float64 `json:"pause_seconds"`  // 句末停顿秒数
}

// TableName 显式指定表名（避免复数问题）
func (Tag) TableName() string { return "tags" }
