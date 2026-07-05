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
	AvatarPath   *string        `gorm:"size:1024" json:"avatar_path"` // 用户头像文件相对路径
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
	SubAlbum       *string        `gorm:"size:255;index" json:"sub_album"` // 子专辑（路径第二级）
	Duration       float64        `json:"duration"` // 秒
	FileSize       int64          `json:"file_size"`
	FileModifiedAt time.Time      `json:"file_modified_at"`
	SubtitlePath   *string        `gorm:"size:1024" json:"subtitle_path"`
	CoverPath      *string        `gorm:"size:1024" json:"cover_path"`
	// NfoPath 指向同目录同名 .nfo 文件（Emby 风格 <basename>.nfo，存单集 plot 描述）
	NfoPath        *string        `gorm:"size:1024" json:"nfo_path"`
	// Description 单集描述（来自 <basename>.nfo 的 <plot> 段）
	Description    string         `gorm:"type:text" json:"description"`
	// PairedMediaID 指向同目录同基名（仅扩展名不同）的另一种类型媒体。
	// 仅当一组中同时存在 video 与 audio 时，video.paired_media_id 指向 audio，
	// audio.paired_media_id 保持 NULL；这样列表查询时可直接 WHERE 排除被配对的 audio。
	PairedMediaID  *uint          `gorm:"index" json:"paired_media_id"`
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
	UserID        uint      `gorm:"index;not null" json:"user_id"`
	MediaID      uint      `gorm:"index;not null" json:"media_id"`
	SentenceIndex int      `gorm:"not null" json:"sentence_index"`
	Completed    bool      `json:"completed"`
	RepeatCount  int       `json:"repeat_count"`
	Favorited    bool      `json:"favorited"` // 收藏的重难点句子
	UpdatedAt    time.Time `json:"updated_at"`
}

// StudyNote 学习页面（用户在专辑内创建的自定义学习内容）
type StudyNote struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	Album     string         `gorm:"size:255;index;not null" json:"album"` // 所属专辑
	Title     string         `gorm:"size:255;not null" json:"title"`
	Content   string         `gorm:"type:text" json:"content"`  // markdown 原文
	Images    string         `gorm:"type:text" json:"images"`   // JSON array of image filenames
	Pinned    bool           `gorm:"default:false;index" json:"pinned"` // 用户置顶
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// MediaRemark 文件备注（用户对单个媒体文件的私有 markdown 笔记）。
// 复合唯一索引 (user_id, media_id) 保证一个文件只有一条备注。
type MediaRemark struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"uniqueIndex:idx_user_media;not null" json:"user_id"`
	MediaID   uint           `gorm:"uniqueIndex:idx_user_media;not null" json:"media_id"`
	Content   string         `gorm:"type:text" json:"content"` // markdown 原文
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// AlbumMeta 专辑/季级别的元数据（封面、横幅、描述、nfo 路径）。
// 联合唯一索引 (album, sub_album)：
//   - sub_album 为空字符串 = 专辑本身
//   - sub_album 非空 = 某个季（专辑下的子目录）
// 用于适配 Emby / Jellyfin 风格的目录元数据刮削（folder.jpg / banner.jpg / season.nfo 等）。
type AlbumMeta struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Album       string         `gorm:"size:255;uniqueIndex:idx_album_sub;not null" json:"album"`
	SubAlbum    string         `gorm:"size:255;uniqueIndex:idx_album_sub;default:'';not null" json:"sub_album"`
	CoverPath   *string        `gorm:"size:1024" json:"cover_path"`  // 专辑/季封面图绝对路径（folder.jpg 优先）
	BannerPath  *string        `gorm:"size:1024" json:"banner_path"` // 横幅图绝对路径
	NFOPath     *string        `gorm:"size:1024" json:"nfo_path"`    // 描述性 nfo 文件路径
	Description string         `gorm:"type:text" json:"description"` // 来自 nfo 的 <plot> 描述
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// AlbumPin 专辑置顶（每个用户可置顶多个专辑，置顶项展示在最前）。
type AlbumPin struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;uniqueIndex:idx_user_album_pin;not null" json:"user_id"`
	Album     string    `gorm:"size:255;uniqueIndex:idx_user_album_pin;not null" json:"album"`
	Sort      int       `gorm:"default:0" json:"sort"` // 置顶顺序（值越小越靠前）
	CreatedAt time.Time `json:"created_at"`
}

// Setting 用户学习偏好
type Setting struct {
	ID             uint    `gorm:"primaryKey" json:"id"`
	UserID         uint    `gorm:"uniqueIndex;not null" json:"user_id"`
	LoopCount      int     `json:"loop_count"`       // 整体循环次数
	SentenceRepeat int     `json:"sentence_repeat"`  // 逐句重复次数
	PauseSeconds   float64 `json:"pause_seconds"`    // 句末停顿秒数
	TTSVoice       string  `gorm:"size:64" json:"tts_voice"`     // TTS 默认语音
	TTSSpeed       float64 `json:"tts_speed"`        // TTS 默认语速（0.5-2.0）
	Theme          string  `gorm:"size:32;default:'default'" json:"theme"` // 界面色彩主题标识
	// ColorMode 浅色 / 深色模式：light / dark / auto（v0.6.0 起）
	// - light：始终浅色
	// - dark：始终深色
	// - auto：跟随系统 prefers-color-scheme: dark
	ColorMode      string  `gorm:"size:16;default:'auto'" json:"color_mode"`
}

// TableName 显式指定表名（避免复数问题）
func (Tag) TableName() string { return "tags" }

// EntityType 枚举：标签可关联的实体类型
const (
	EntityTypeMedia = "media" // 媒体文件（沿用 GORM media_tags，但元数据走 entity_tags）
	EntityTypeAlbum = "album" // 专辑（AlbumMeta 中 sub_album='' 的记录）
	EntityTypeSeason = "season" // 季（AlbumMeta 中 sub_album!='' 的记录）
	EntityTypeNote  = "note"  // 学习页面
)

// EntityTag 多态标签关联表。
// 一条记录 = 一个用户的一个标签关联到一个实体（album/season/note/media）。
// 联合唯一索引 (user_id, tag_id, entity_type, entity_id) 防止重复关联。
// 媒体文件原本走 GORM many2many media_tags；为统一查询体验，album/season/note 走此表。
// Tags 页面的「按标签筛选 + 三组（专辑/季/文件）」接口使用本表 + media_tags 联合查询。
type EntityTag struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"uniqueIndex:idx_et_uniq;not null" json:"user_id"`
	TagID      uint      `gorm:"uniqueIndex:idx_et_uniq;not null" json:"tag_id"`
	EntityType string    `gorm:"size:32;uniqueIndex:idx_et_uniq;not null" json:"entity_type"`
	EntityID   uint      `gorm:"uniqueIndex:idx_et_uniq;not null" json:"entity_id"`
	CreatedAt  time.Time `json:"created_at"`
}

// TableName 显式指定表名
func (EntityTag) TableName() string { return "entity_tags" }
