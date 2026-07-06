package models

import (
	"time"

	"gorm.io/gorm"
)

// LocalDictionary 用户上传的本地词典（v0.9.1 起）
//
// 一份 CSV 导入 = 一本 LocalDictionary 记录，其下挂载若干 DictEntry。
// 词条统一存在 dict_entries 表（不分表），通过 dict_id 关联回词典。
// 删除词典时级联删除其下所有词条（GORM 外键约束）。
type LocalDictionary struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:128;not null" json:"name"`        // 用户起的名字
	Description string         `gorm:"size:512" json:"description"`            // 词典简介（可选）
	FileName    string         `gorm:"size:255;not null" json:"file_name"`     // 原始上传文件名
	SizeBytes   int64          `json:"size_bytes"`                              // CSV 字节数
	EntryCount  int            `json:"entry_count"`                             // 成功导入的词条数
	SourceLang  string         `gorm:"size:16;default:'en'" json:"source_lang"` // 词头语言（默认英文）
	TargetLang  string         `gorm:"size:16;default:'zh'" json:"target_lang"` // 释义语言（默认中文）
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 显式指定表名
func (LocalDictionary) TableName() string { return "local_dictionaries" }

// DictEntry 词典词条（v0.9.1 起）
//
// 字段说明：
//   - Word 统一 lowercase + trim，索引按归一化形式存储
//   - Phonetic 音标（IPA 格式，可空）
//   - Translation 释义（自由文本，多义用 `;` 或 `；` 分隔）
//
// 联合索引 (dict_id, word) 让按词典的查词走索引扫描。
// 单独 word 上的索引支撑跨词典的全量查词（fallback 查原形）。
type DictEntry struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DictID      uint      `gorm:"index:idx_dict_word,priority:1;not null" json:"dict_id"`
	Word        string    `gorm:"size:128;index:idx_dict_word,priority:2;not null" json:"word"`
	Phonetic    string    `gorm:"size:128" json:"phonetic"`
	Translation string    `gorm:"type:text" json:"translation"`
	CreatedAt   time.Time `json:"created_at"`
}

// TableName 显式指定表名
func (DictEntry) TableName() string { return "dict_entries" }
