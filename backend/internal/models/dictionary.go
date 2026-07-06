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

// BuiltinDict 内置词典词条（v1.1.0 起，集成 ECDICT 词库）
//
// 与 LocalDict 的区别：
//   - 数据来源：后端首次启动时从 backend/data/dict/ecdict.csv 自动导入
//   - 数据归属：单实例共享（不像 LocalDict 那样按用户隔离），整库一份
//   - 字段：贴合 ECDICT CSV 格式（word, phonetic, pos, definition, translation, exchange）
//     - pos 词性（n./v./adj. ...）
//     - definition 英文释义
//     - translation 中文翻译（ECDICT 已合并 translation 字段）
//     - exchange 词形变化（过去式/复数/比较级 JSON，可选）
//
// 索引策略：
//   - (word) 唯一约束保证导入去重
//   - (pos, word) 复合索引让"按词性筛选"也走索引
type BuiltinDict struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Word        string    `gorm:"size:128;uniqueIndex:idx_builtin_word;not null" json:"word"`
	Phonetic    string    `gorm:"size:128" json:"phonetic"`
	Pos         string    `gorm:"size:32;index:idx_builtin_pos" json:"pos"`
	Definition  string    `gorm:"type:text" json:"definition"`
	Translation string    `gorm:"type:text" json:"translation"`
	Exchange    string    `gorm:"type:text" json:"exchange"`
	CreatedAt   time.Time `json:"created_at"`
}

// TableName 显式指定表名
func (BuiltinDict) TableName() string { return "built_in_dict" }
