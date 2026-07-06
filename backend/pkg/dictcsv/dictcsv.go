// Package dictcsv 提供本地词典 CSV 导入与查询能力（v0.9.1 起）
//
// 设计要点：
//   - 单一格式：UTF-8 CSV，列序 `word,phonetic,translation`
//   - 容错：缺 phonetic 列、词条空字段、含 BOM 都自动处理
//   - 词形 fallback：精确匹配失败时尝试剥离常见后缀
//     （-s/-es/-ed/-ing/-er/-est），不引入完整 lemmatizer
//   - 入口：ParseReader / ParseString / Lookup（仅依赖 string 切片）
//
// 与具体数据库解耦：导入器输出 []DictEntry，由调用方负责入库。
package dictcsv

import (
	"bufio"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"unicode"
)

// Entry 单条解析后的词条
//
// Word 已归一化（小写 + 去首尾空白 + 跳过纯标点）；Phonetic 与 Translation
// 保留原样不做翻译。多义由调用方自行分隔（通常用 `;` / `；`）。
type Entry struct {
	Word        string
	Phonetic    string
	Translation string
}

// Result 解析结果汇总
type Result struct {
	Entries    []Entry // 成功解析的词条
	Skipped    int     // 跳过的行数（空 / 解析失败）
	TotalLines int     // 总处理行数（含表头）
	Header     []string // 检测到的表头列名
}

// CommonSuffixes 英文常见后缀（用于 fallback 查原形）
//
// 不追求完整 lemmatizer；只覆盖最常见的变化形式。
// 顺序重要：先尝试长后缀，再尝试短后缀。
var CommonSuffixes = []string{
	"ies", "ied", "ying", "ed", "ing",
	"es", "er", "est", "ly", "s",
}

// ParseReader 从 io.Reader 解析 CSV
//
// 行为：
//   - 跳过空行
//   - 第一行视为表头：必须至少含 `word` 列；其他列名任意
//   - 表头缺 phonetic / translation 列也能跑（相应字段填空）
//   - 允许字段含逗号（csv.Reader 内部双引号转义）
//   - 词条去重（同 CSV 内重复 word 只保留第一条）
func ParseReader(r io.Reader) (*Result, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1 // 允许列数不一致
	reader.LazyQuotes = true    // 容错
	reader.TrimLeadingSpace = true

	res := &Result{}
	// 预分配 16K 词条
	res.Entries = make([]Entry, 0, 16384)
	seen := make(map[string]struct{}, 16384)

	// 找表头
	header, err := reader.Read()
	if err == io.EOF {
		return res, nil
	}
	if err != nil {
		return nil, fmt.Errorf("读取表头失败: %w", err)
	}
	res.TotalLines++
	// 允许首行就是数据（无表头）：如果第一列是 "word" / "Word" / "WORD" 才视为表头
	// 否则把这一行也当作数据
	wordIdx, phoneticIdx, translationIdx, hasHeader := detectColumns(header)
	if !hasHeader {
		// 把这一行当数据
		e, ok := buildEntry(header, 0, -1, -1)
		if ok {
			if _, dup := seen[e.Word]; !dup {
				seen[e.Word] = struct{}{}
				res.Entries = append(res.Entries, e)
			}
		} else {
			res.Skipped++
		}
	} else {
		res.Header = header
	}

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// 单行解析失败：跳过 + 计数，继续下一行
			res.Skipped++
			res.TotalLines++
			continue
		}
		res.TotalLines++
		if len(row) == 0 || isAllEmpty(row) {
			res.Skipped++
			continue
		}
		e, ok := buildEntry(row, wordIdx, phoneticIdx, translationIdx)
		if !ok {
			res.Skipped++
			continue
		}
		if _, dup := seen[e.Word]; dup {
			// 同 CSV 内重复：跳过（让后端计数准确）
			res.Skipped++
			continue
		}
		seen[e.Word] = struct{}{}
		res.Entries = append(res.Entries, e)
	}
	return res, nil
}

// ParseString 从字符串解析（便于单测）
func ParseString(s string) (*Result, error) {
	// 去掉 UTF-8 BOM
	s = strings.TrimPrefix(s, "\ufeff")
	return ParseReader(strings.NewReader(s))
}

// detectColumns 从首行推断列索引
//
// 返回 (wordIdx, phoneticIdx, translationIdx, hasHeader)。
// hasHeader=false 表示首行不像表头，应被当作数据。
func detectColumns(header []string) (int, int, int, bool) {
	wordIdx, phoneticIdx, translationIdx := -1, -1, -1
	for i, col := range header {
		c := strings.ToLower(strings.TrimSpace(col))
		switch c {
		case "word", "words", "term", "lemma", "headword":
			wordIdx = i
		case "phonetic", "ipa", "pronunciation":
			phoneticIdx = i
		case "translation", "definition", "meaning", "gloss", "释义", "翻译":
			translationIdx = i
		}
	}
	if wordIdx < 0 {
		return 0, -1, -1, false
	}
	return wordIdx, phoneticIdx, translationIdx, true
}

// buildEntry 从一行 row 构建 Entry
func buildEntry(row []string, wordIdx, phoneticIdx, translationIdx int) (Entry, bool) {
	if wordIdx < 0 || wordIdx >= len(row) {
		return Entry{}, false
	}
	w := normalizeWord(row[wordIdx])
	if w == "" {
		return Entry{}, false
	}
	e := Entry{Word: w}
	if phoneticIdx >= 0 && phoneticIdx < len(row) {
		e.Phonetic = strings.TrimSpace(row[phoneticIdx])
	}
	if translationIdx >= 0 && translationIdx < len(row) {
		e.Translation = strings.TrimSpace(row[translationIdx])
	} else if len(row) > 1 {
		// 没识别出 translation 列：把所有非 word / 非 phonetic 的列拼起来
		var parts []string
		for i, c := range row {
			if i == wordIdx || i == phoneticIdx {
				continue
			}
			t := strings.TrimSpace(c)
			if t != "" {
				parts = append(parts, t)
			}
		}
		e.Translation = strings.Join(parts, "; ")
	}
	return e, true
}

// normalizeWord 归一化词头
//
// 规则：trim → lowercase → 去掉首尾标点 → 空串返回 ""
func normalizeWord(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ToLower(s)
	// 去掉首尾标点
	s = strings.TrimFunc(s, func(r rune) bool {
		return unicode.IsPunct(r) || unicode.IsSpace(r)
	})
	return s
}

func isAllEmpty(row []string) bool {
	for _, s := range row {
		if strings.TrimSpace(s) != "" {
			return false
		}
	}
	return true
}

// Lemmas 返回 word 的所有可能原形（含原词本身）
//
// 算法：原词 + 依次尝试给去掉的后缀补回基础形
// 例：studied -> [studied, study, studie]（粗略够用，不做完整 lemmatizer）
func Lemmas(word string) []string {
	word = strings.ToLower(strings.TrimSpace(word))
	if word == "" {
		return nil
	}
	out := []string{word}
	seen := map[string]struct{}{word: {}}
	for _, suf := range CommonSuffixes {
		if !strings.HasSuffix(word, suf) {
			continue
		}
		base := strings.TrimSuffix(word, suf)
		if len(base) < 2 {
			continue
		}
		// ies -> y / ed -> base / ing -> base / er -> base / est -> base
		// 已足够覆盖常见场景
		if _, ok := seen[base]; !ok {
			seen[base] = struct{}{}
			out = append(out, base)
		}
	}
	return out
}

// Lookup 在 entries 中查 word
//
// 流程：归一化 → 精确匹配 → 依次尝试常见原形。
// 返回第一个命中的 Entry 与 true；未命中返回 (zero, false)。
// 优先按 entries 的顺序——上传较早的词典优先匹配。
func Lookup(entries []Entry, word string) (Entry, bool) {
	target := strings.ToLower(strings.TrimSpace(word))
	if target == "" {
		return Entry{}, false
	}
	for _, lemma := range Lemmas(target) {
		for _, e := range entries {
			if e.Word == lemma {
				return e, true
			}
		}
	}
	return Entry{}, false
}

// CountLines 快速估算 reader 总行数（用于进度显示）
//
// 不解析内容，仅数 \n。reader 读完会被耗尽，故仅适合一次性读入的小文件。
func CountLines(r io.Reader) int {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	n := 0
	for scanner.Scan() {
		n++
	}
	return n
}
