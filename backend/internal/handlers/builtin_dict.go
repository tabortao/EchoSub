// 内置词典管理（v1.1.0 起，集成 ECDICT 词库）
//
// 设计要点：
//   - 数据源：backend/data/dict/ecdict.csv（首次启动时自动导入到 built_in_dict 表）
//   - 词库大小：约 77 万词条（GPLv3 协议，详见 LICENSE）
//   - 与 LocalDict 完全独立（不需用户上传，单实例共享一份）
//   - 查词走 SQL：精确匹配 → 词形 fallback（剥离常见后缀）
//
// 路由：
//   GET  /api/v1/dictionary/builtin/status   词典状态（条数、CSV 路径、是否可用）
//   GET  /api/v1/dictionary/builtin/lookup   查词（GET ?word=xxx）
//   POST /api/v1/dictionary/builtin/reload   重新导入（清空后从 CSV 重建）
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

// BuiltinDictHandler 暴露内置词典相关接口
type BuiltinDictHandler struct {
	cfg     *config.Config
	csvPath string
	mu      sync.Mutex // 防止 reload 与 status 并发
}

// NewBuiltinDictHandler 构造 handler
//
// csvPath 默认指向 backend/data/dict/ecdict.csv；如不存在则状态接口返回 available=false。
func NewBuiltinDictHandler(cfg *config.Config) *BuiltinDictHandler {
	return &BuiltinDictHandler{
		cfg:     cfg,
		csvPath: resolveBuiltinDictCSVPath(),
	}
}

// resolveBuiltinDictCSVPath 解析内置词典 CSV 路径
//
// 查找顺序：
//  1. 环境变量 ECHOSUB_BUILTIN_DICT_CSV 显式指定
//  2. backend/data/dict/ecdict.csv（与可执行文件 / 工作目录联合解析）
//  3. backend/data/dict/ecdict.sample.csv（开发/测试占位，git 随仓库发布）
//  4. data/dict/ecdict.csv
func resolveBuiltinDictCSVPath() string {
	if env := os.Getenv("ECHOSUB_BUILTIN_DICT_CSV"); env != "" {
		return env
	}
	candidates := []string{
		"backend/data/dict/ecdict.csv",
		"backend/data/dict/ecdict.sample.csv",
		"data/dict/ecdict.csv",
		"data/dict/ecdict.sample.csv",
		filepath.Join("data", "dict", "ecdict.csv"),
		filepath.Join("data", "dict", "ecdict.sample.csv"),
	}
	// 优先 cwd；找不到再尝试基于可执行文件目录
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	if exe, err := os.Executable(); err == nil {
		for _, sub := range []string{"data/dict/ecdict.csv", "data/dict/ecdict.sample.csv"} {
			p := filepath.Join(filepath.Dir(exe), sub)
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	// 找不到时返回第一个候选（用于状态显示「CSV 缺失」）
	abs, _ := filepath.Abs(candidates[0])
	return abs
}

// EnsureImported 启动时确保已导入（由 main.go 在初始化时调用）
//
// 行为：
//   - CSV 不存在：跳过（不报错）
//   - 表已存在数据：跳过（幂等）
//   - 表为空 + CSV 存在：执行全量导入
//
// 导入在后台 goroutine 跑（大文件可能耗时数十秒），不阻塞启动。
func EnsureImported() {
	go func() {
		csvPath := resolveBuiltinDictCSVPath()
		if _, err := os.Stat(csvPath); err != nil {
			log.Printf("[INFO] 内置词典 CSV 未找到: %s（跳过首次导入）", csvPath)
			return
		}
		var count int64
		if err := database.DB.Model(&models.BuiltinDict{}).Count(&count).Error; err != nil {
			log.Printf("[WARN] 查询内置词典条数失败: %v", err)
			return
		}
		if count > 0 {
			log.Printf("[INFO] 内置词典已存在 %d 条，跳过导入", count)
			return
		}
		log.Printf("[INFO] 开始导入内置词典: %s ...", csvPath)
		start := time.Now()
		n, err := ImportBuiltinDict(csvPath)
		if err != nil {
			log.Printf("[ERROR] 导入内置词典失败: %v", err)
			return
		}
		log.Printf("[INFO] 内置词典导入完成: %d 条 (%.1fs)", n, time.Since(start).Seconds())
	}()
}

// ImportBuiltinDict 全量导入内置词典
//
// 流程：清空表 → 解析 CSV → 批量插入（事务）
// 返回成功导入的条数。
func ImportBuiltinDict(csvPath string) (int, error) {
	f, err := os.Open(csvPath)
	if err != nil {
		return 0, fmt.Errorf("打开 CSV 失败: %w", err)
	}
	defer f.Close()

	result, err := dictcsv.ParseECDictReader(f)
	if err != nil {
		return 0, fmt.Errorf("解析 CSV 失败: %w", err)
	}
	if len(result.Entries) == 0 {
		return 0, fmt.Errorf("CSV 未解析到任何词条（总行 %d，跳过 %d）", result.TotalLines, result.Skipped)
	}

	const batchSize = 2000
	imported := 0
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&models.BuiltinDict{}).Error; err != nil {
			return fmt.Errorf("清空表失败: %w", err)
		}
		for i := 0; i < len(result.Entries); i += batchSize {
			end := i + batchSize
			if end > len(result.Entries) {
				end = len(result.Entries)
			}
			batch := result.Entries[i:end]
			rows := make([]models.BuiltinDict, 0, len(batch))
			for _, e := range batch {
				rows = append(rows, models.BuiltinDict{
					Word:        e.Word,
					Phonetic:    e.Phonetic,
					Pos:         e.Pos,
					Definition:  e.Definition,
					Translation: e.Translation,
					Exchange:    e.Exchange,
				})
			}
			if err := tx.CreateInBatches(rows, batchSize).Error; err != nil {
				return fmt.Errorf("批量插入失败: %w", err)
			}
			imported += len(batch)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return imported, nil
}

// builtinLookupEntry 单条命中
type builtinLookupEntry struct {
	Word        string `json:"word"`
	Phonetic    string `json:"phonetic"`
	Pos         string `json:"pos"`
	Definition  string `json:"definition"`
	Translation string `json:"translation"`
	MatchedBy   string `json:"matched_by"` // "exact" | "lemma:<原形>"
}

// builtinLookupResponse 查词响应
type builtinLookupResponse struct {
	Word    string                `json:"word"`
	Found   bool                  `json:"found"`
	Entries []builtinLookupEntry  `json:"entries"`
}

// Status 内置词典状态
// GET /api/v1/dictionary/builtin/status
func (h *BuiltinDictHandler) Status(c *gin.Context) {
	if middleware.GetUserID(c) == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	var count int64
	database.DB.Model(&models.BuiltinDict{}).Count(&count)

	csvExists := false
	if _, err := os.Stat(h.csvPath); err == nil {
		csvExists = true
	}

	source := "ECDICT"
	// 尝试从文件名提取版本/时间信息
	if csvExists {
		base := filepath.Base(h.csvPath)
		source = "ECDICT (" + base + ")"
	}

	utils.OK(c, gin.H{
		"available":  count > 0,
		"entry_count": count,
		"csv_path":   h.csvPath,
		"csv_exists": csvExists,
		"source":     source,
	})
}

// Lookup 查词
// GET /api/v1/dictionary/builtin/lookup?word=xxx
func (h *BuiltinDictHandler) Lookup(c *gin.Context) {
	if middleware.GetUserID(c) == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	word := strings.ToLower(strings.TrimSpace(c.Query("word")))
	if word == "" {
		utils.Fail(c, http.StatusBadRequest, "word 不能为空")
		return
	}

	// 先确认表内是否有数据
	var count int64
	database.DB.Model(&models.BuiltinDict{}).Count(&count)
	if count == 0 {
		utils.Fail(c, http.StatusNotFound, "内置词典尚未导入，请确认 backend/data/dict/ecdict.csv 存在后重启服务")
		return
	}

	entries := make([]builtinLookupEntry, 0)

	// 1. 精确匹配
	var exact []models.BuiltinDict
	if err := database.DB.
		Where("word = ?", word).
		Order("pos ASC, id ASC").
		Limit(50).
		Find(&exact).Error; err != nil {
		utils.Fail(c, http.StatusInternalServerError, "查询失败: "+err.Error())
		return
	}
	for _, e := range exact {
		entries = append(entries, builtinLookupEntry{
			Word:        e.Word,
			Phonetic:    e.Phonetic,
			Pos:         e.Pos,
			Definition:  e.Definition,
			Translation: e.Translation,
			MatchedBy:   "exact",
		})
	}

	// 2. 词形 fallback（仅当精确匹配无结果时）
	if len(entries) == 0 {
		lemmas := dictcsv.Lemmas(word)
		for _, lemma := range lemmas {
			if lemma == word {
				continue
			}
			var fallback []models.BuiltinDict
			if err := database.DB.
				Where("word = ?", lemma).
				Order("pos ASC, id ASC").
				Limit(20).
				Find(&fallback).Error; err != nil {
				continue
			}
			if len(fallback) > 0 {
				for _, e := range fallback {
					entries = append(entries, builtinLookupEntry{
						Word:        e.Word,
						Phonetic:    e.Phonetic,
						Pos:         e.Pos,
						Definition:  e.Definition,
						Translation: e.Translation,
						MatchedBy:   "lemma:" + lemma,
					})
				}
				break // 只取第一组成功 fallback 的结果
			}
		}
	}

	utils.OK(c, builtinLookupResponse{
		Word:    word,
		Found:   len(entries) > 0,
		Entries: entries,
	})
}

// Reload 重新导入内置词典
// POST /api/v1/dictionary/builtin/reload
//
// 用于版本升级后刷新词库；耗时长，导入期间查词可能短暂不可用。
func (h *BuiltinDictHandler) Reload(c *gin.Context) {
	if middleware.GetUserID(c) == 0 {
		utils.Fail(c, http.StatusUnauthorized, "未登录")
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, err := os.Stat(h.csvPath); err != nil {
		utils.Fail(c, http.StatusNotFound, "CSV 文件不存在: "+h.csvPath)
		return
	}

	log.Printf("[INFO] 用户触发内置词典重导: %s", h.csvPath)
	start := time.Now()
	n, err := ImportBuiltinDict(h.csvPath)
	if err != nil {
		utils.Fail(c, http.StatusInternalServerError, "导入失败: "+err.Error())
		return
	}
	log.Printf("[INFO] 内置词典重导完成: %d 条 (%.1fs)", n, time.Since(start).Seconds())

	utils.OK(c, gin.H{
		"available":   true,
		"entry_count": n,
		"csv_path":    h.csvPath,
		"source":      "ECDICT",
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
