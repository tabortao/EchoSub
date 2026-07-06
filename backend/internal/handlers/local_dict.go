// 本地词典管理（v0.9.1 起）
//
// 设计要点：
//   - 用户上传 CSV → 后端解析 → 批量写入 dict_entries 表
//   - 查词走 SQL（LOWER 归一化 + 索引 + 简单词形 fallback）
//   - 删除词典时由 SQLite 触发器级联删除其下词条
//   - 数据格式：`word,phonetic,translation`（CSV），表头列名兼容
//     `word/term/lemma/headword` + `phonetic/ipa/pronunciation` + `translation/definition/meaning/gloss`
//
// 路由：
//   GET    /api/v1/dictionary/local           列出已导入的本地词典
//   POST   /api/v1/dictionary/local/upload    上传并导入 CSV
//   DELETE /api/v1/dictionary/local/:id       删除词典（级联删词条）
//   POST   /api/v1/dictionary/local/lookup    查词
//   GET    /api/v1/dictionary/local/status    词典系统总状态
package handlers

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
	"github.com/yaole/EchoSub/backend/pkg/dictcsv"
)

// MaxDictUploadBytes 单本词典最大体积（v0.9.1 默认 50 MiB）
// 设为 50 MiB 足够容纳 ECDICT 等 30MB+ 词库 + 留余量
const MaxDictUploadBytes = 50 * 1024 * 1024

// MaxDictNameLen 词典名最大长度（防 OOM 渲染）
const MaxDictNameLen = 64

// dictUploadForm 上传词典的表单字段
const (
	dictFormFieldFile        = "file"
	dictFormFieldName        = "name"
	dictFormFieldDescription = "description"
	dictFormFieldSourceLang  = "source_lang"
	dictFormFieldTargetLang  = "target_lang"
)

// LocalDictHandler 暴露本地词典相关接口
type LocalDictHandler struct {
	cfg *config.Config
}

// NewLocalDictHandler 构造 handler
func NewLocalDictHandler(cfg *config.Config) *LocalDictHandler {
	return &LocalDictHandler{cfg: cfg}
}

// dictListItem 列表项
type dictListItem struct {
	ID          uint      `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	FileName    string    `json:"file_name"`
	SizeBytes   int64     `json:"size_bytes"`
	EntryCount  int       `json:"entry_count"`
	SourceLang  string    `json:"source_lang"`
	TargetLang  string    `json:"target_lang"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ListLocalDicts 列出所有本地词典
// GET /api/v1/dictionary/local
func (h *LocalDictHandler) ListLocalDicts(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	var list []models.LocalDictionary
	if err := database.DB.Order("created_at DESC").Find(&list).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	items := make([]dictListItem, 0, len(list))
	for _, d := range list {
		items = append(items, dictListItem{
			ID:          d.ID,
			Name:        d.Name,
			Description: d.Description,
			FileName:    d.FileName,
			SizeBytes:   d.SizeBytes,
			EntryCount:  d.EntryCount,
			SourceLang:  d.SourceLang,
			TargetLang:  d.TargetLang,
			CreatedAt:   d.CreatedAt,
			UpdatedAt:   d.UpdatedAt,
		})
	}
	utils.OK(c, gin.H{"dictionaries": items})
}

// UploadLocalDict 上传并导入 CSV 词典
// POST /api/v1/dictionary/local/upload
// form: file (required) / name (required) / description / source_lang / target_lang
func (h *LocalDictHandler) UploadLocalDict(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}

	// 1. 接收文件
	fh, err := c.FormFile(dictFormFieldFile)
	if err != nil {
		utils.Fail(c, http.StatusBadRequest, "请提供 CSV 文件 (字段: "+dictFormFieldFile+")")
		return
	}
	if fh.Size > MaxDictUploadBytes {
		utils.Fail(c, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("文件超过最大限制 %d MB", MaxDictUploadBytes/1024/1024))
		return
	}
	// 扩展名校验（粗粒度）
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if ext != ".csv" && ext != ".tsv" && ext != ".txt" {
		utils.Fail(c, http.StatusBadRequest, "仅支持 .csv / .tsv / .txt 文件")
		return
	}

	// 2. 名称与描述
	name := strings.TrimSpace(c.PostForm(dictFormFieldName))
	if name == "" {
		// 缺省用文件名（去掉扩展名）
		name = strings.TrimSuffix(fh.Filename, ext)
	}
	if len(name) > MaxDictNameLen {
		utils.Fail(c, http.StatusBadRequest,
			fmt.Sprintf("名称超过 %d 字符", MaxDictNameLen))
		return
	}
	description := strings.TrimSpace(c.PostForm(dictFormFieldDescription))
	sourceLang := normalizeLangCode(c.PostForm(dictFormFieldSourceLang), "en")
	targetLang := normalizeLangCode(c.PostForm(dictFormFieldTargetLang), "zh")

	// 3. 打开上传文件（multipart 的 FileHeader 需要 Open）
	src, err := fh.Open()
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "读取上传文件失败: "+err.Error())
		return
	}
	defer src.Close()

	// 4. 解析 CSV
	result, err := dictcsv.ParseReader(src)
	if err != nil {
		utils.Fail(c, http.StatusBadRequest, "解析 CSV 失败: "+err.Error())
		return
	}
	if len(result.Entries) == 0 {
		utils.Fail(c, http.StatusBadRequest,
			fmt.Sprintf("未解析到任何词条（总行 %d，跳过 %d）", result.TotalLines, result.Skipped))
		return
	}

	// 5. 写库：先建词典，再批量插词条（事务）
	dict := models.LocalDictionary{
		Name:        name,
		Description: description,
		FileName:    filepath.Base(fh.Filename),
		SizeBytes:   fh.Size,
		EntryCount:  len(result.Entries),
		SourceLang:  sourceLang,
		TargetLang:  targetLang,
	}
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&dict).Error; err != nil {
			return err
		}
		// 批量插入：每批 1000 条
		const batchSize = 1000
		for i := 0; i < len(result.Entries); i += batchSize {
			end := i + batchSize
			if end > len(result.Entries) {
				end = len(result.Entries)
			}
			batch := result.Entries[i:end]
			rows := make([]models.DictEntry, 0, len(batch))
			for _, e := range batch {
				rows = append(rows, models.DictEntry{
					DictID:      dict.ID,
					Word:        e.Word,
					Phonetic:    e.Phonetic,
					Translation: e.Translation,
				})
			}
			if err := tx.CreateInBatches(rows, batchSize).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "写入失败: "+err.Error())
		return
	}

	utils.OK(c, gin.H{
		"id":          dict.ID,
		"name":        dict.Name,
		"entry_count": dict.EntryCount,
		"skipped":     result.Skipped,
		"total_lines": result.TotalLines,
		"header":      result.Header,
	})
}

// DeleteLocalDict 删除本地词典（级联删除词条）
// DELETE /api/v1/dictionary/local/:id
func (h *LocalDictHandler) DeleteLocalDict(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.Fail(c, http.StatusBadRequest, "id 不合法")
		return
	}
	res := database.DB.Delete(&models.LocalDictionary{}, id)
	if res.Error != nil {
		utils.Fail(c, http.StatusInternalServerError, "删除失败: "+res.Error.Error())
		return
	}
	if res.RowsAffected == 0 {
		utils.Fail(c, http.StatusNotFound, "词典不存在")
		return
	}
	utils.OK(c, gin.H{"id": id, "deleted": true})
}

// dictLookupReq 查词请求
type dictLookupReq struct {
	Word     string `json:"word" binding:"required"`
	Sentence string `json:"sentence"`
	DictID   uint   `json:"dict_id"` // 0 = 全部词典
}

// dictLookupEntry 单条命中
type dictLookupEntry struct {
	DictID      uint   `json:"dict_id"`
	DictName    string `json:"dict_name"`
	Word        string `json:"word"`        // 实际命中的词形（可能是 fallback 后的原形）
	Original    string `json:"original"`    // 用户传入的原词
	Phonetic    string `json:"phonetic"`
	Translation string `json:"translation"`
	MatchedBy   string `json:"matched_by"` // "exact" / "lemma"
}

// LookupLocalDict 查词
// POST /api/v1/dictionary/local/lookup
//
// 流程：归一化（小写 + trim）→ 精确匹配 → 简单词形 fallback
// 返回所有命中（按词典 ID 升序排列，便于前端批量渲染）
func (h *LocalDictHandler) LookupLocalDict(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	var req dictLookupReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Fail(c, http.StatusBadRequest, "请求体格式错误: "+err.Error())
		return
	}
	word := strings.ToLower(strings.TrimSpace(req.Word))
	if word == "" {
		utils.Fail(c, http.StatusBadRequest, "word 不能为空")
		return
	}

	// 0 = 全部词典
	// 注意：必须 JOIN 过滤掉已软删除的 LocalDictionary（GORM 软删除只设 deleted_at，不会触发级联触发器）
	// 注意：fallback 循环内多次使用 base，每次必须用 Session() 复制链式条件，
	//       否则 GORM 会把多次 Where(...) 累积成 AND word=? AND word=? AND word=...，永远空集。
	makeBase := func() *gorm.DB {
		b := database.DB.Model(&models.DictEntry{}).
			Joins("JOIN local_dictionaries ld ON ld.id = dict_entries.dict_id").
			Where("ld.deleted_at IS NULL")
		if req.DictID > 0 {
			b = b.Where("dict_entries.dict_id = ?", req.DictID)
		}
		return b
	}

	// 1. 精确匹配
	var exact []models.DictEntry
	if err := makeBase().Where("dict_entries.word = ?", word).Order("dict_entries.dict_id ASC, dict_entries.id ASC").Find(&exact).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	// 收集这些条目所在词典的 name（一次 join）
	entries := make([]dictLookupEntry, 0)
	dictNames := map[uint]string{}
	if len(exact) > 0 {
		fillDictNames(dictNames, collectDictIDs(exact))
		for _, e := range exact {
			entries = append(entries, dictLookupEntry{
				DictID:      e.DictID,
				DictName:    dictNames[e.DictID],
				Word:        e.Word,
				Original:    word,
				Phonetic:    e.Phonetic,
				Translation: e.Translation,
				MatchedBy:   "exact",
			})
		}
	} else {
		// 2. 词形 fallback
		lemmas := dictcsv.Lemmas(word)
		for _, lemma := range lemmas {
			if lemma == word {
				continue // 已在精确匹配阶段查过
			}
			var fallback []models.DictEntry
			if err := makeBase().Where("dict_entries.word = ?", lemma).Order("dict_entries.dict_id ASC, dict_entries.id ASC").Find(&fallback).Error; err != nil {
				utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
				return
			}
			if len(fallback) > 0 {
				if len(dictNames) == 0 {
					fillDictNames(dictNames, collectDictIDs(fallback))
				} else {
					fillDictNames(dictNames, collectDictIDs(fallback))
				}
				for _, e := range fallback {
					entries = append(entries, dictLookupEntry{
						DictID:      e.DictID,
						DictName:    dictNames[e.DictID],
						Word:        e.Word,
						Original:    word,
						Phonetic:    e.Phonetic,
						Translation: e.Translation,
						MatchedBy:   "lemma:" + lemma,
					})
				}
				break // 只取第一组成功 fallback 的结果
			}
		}
	}

	utils.OK(c, gin.H{
		"word":    word,
		"found":   len(entries) > 0,
		"entries": entries,
	})
}

// LocalDictStatus 词典系统总状态
// GET /api/v1/dictionary/local/status
func (h *LocalDictHandler) LocalDictStatus(c *gin.Context) {
	uid := middleware.GetUserID(c)
	if uid == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	var dictCount int64
	var entryCount int64
	database.DB.Model(&models.LocalDictionary{}).Count(&dictCount)
	database.DB.Model(&models.DictEntry{}).Count(&entryCount)
	utils.OK(c, gin.H{
		"available":    dictCount > 0,
		"dict_count":   dictCount,
		"entry_count":  entryCount,
		"max_bytes":    MaxDictUploadBytes,
		"max_name_len": MaxDictNameLen,
	})
}

// fillDictNames 批量获取词典名（一次 in 查询）
func fillDictNames(names map[uint]string, ids []uint) {
	if len(ids) == 0 {
		return
	}
	var dicts []models.LocalDictionary
	database.DB.Where("id IN ?", ids).Find(&dicts)
	for _, d := range dicts {
		names[d.ID] = d.Name
	}
}

func collectDictIDs(entries []models.DictEntry) []uint {
	seen := map[uint]struct{}{}
	out := make([]uint, 0, len(entries))
	for _, e := range entries {
		if _, ok := seen[e.DictID]; ok {
			continue
		}
		seen[e.DictID] = struct{}{}
		out = append(out, e.DictID)
	}
	return out
}

func normalizeLangCode(s, fallback string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return fallback
	}
	// 仅保留前 8 字符（en / zh / en-us / zh-cn 等）
	if len(s) > 8 {
		s = s[:8]
	}
	return s
}
