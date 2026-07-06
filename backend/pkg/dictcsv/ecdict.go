// Package dictcsv 的内置词典解析（v1.1.0 起）
//
// 数据来源：ECDICT（English-Chinese Dictionary）
// - 项目地址：https://github.com/skywind3000/ECDICT
// - 协议：GPLv3
// - CSV 列：word,phonetic,pos,exchange,definition,translation
//
// 本包在 `dictcsv.ParseReader` 的基础上做了 ECDICT 专用适配：
//   - 显式指定列名（即使 CSV 无表头也能识别）
//   - definition / translation 字段允许含换行（用 `\\n` 转义）
//   - exchange 字段保留原样（JSON 格式，{p:..., d:..., i:...}）
//
// 入口：
//   - ParseECDictReader / ParseECDictString
//   - ECDictEntry 结构体对齐 backend/internal/models.BuiltinDict
package dictcsv

import (
	"bufio"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"unicode"
)

// ECDictEntry ECDICT 单条词条
//
// 字段对齐 models.BuiltinDict：
//   - Word 已归一化（小写 + 去首尾空白 + 跳过纯标点）
//   - Phonetic 音标（IPA）
//   - Pos 词性（n./v./adj. 等，多个用 / 分隔）
//   - Definition 英文释义（含 \\n 表示换行）
//   - Translation 中文翻译（含 \\n 表示换行）
//   - Exchange 词形变化（JSON 字符串：{"p":"past", "d":"pp", "i":"ing"}）
type ECDictEntry struct {
	Word        string
	Phonetic    string
	Pos         string
	Definition  string
	Translation string
	Exchange    string
}

// ECDictResult 解析结果汇总
type ECDictResult struct {
	Entries    []ECDictEntry
	Skipped    int
	TotalLines int
	Header     []string
}

// ECDict 列名常量（与 CSV 表头严格一致）
const (
	ECDictColWord        = "word"
	ECDictColPhonetic    = "phonetic"
	ECDictColPos         = "pos"
	ECDictColExchange    = "exchange"
	ECDictColDefinition  = "definition"
	ECDictColTranslation = "translation"
)

// ParseECDictReader 从 io.Reader 解析 ECDICT CSV
//
// 行为：
//   - 支持表头缺失（按固定列序读取）
//   - definition / translation 字段内的换行符（\\n）原样保留
//   - 同 word 多条记录全部保留（不同 pos / 不同义项）
//   - 同一 word 同 pos 重复只保留第一条
func ParseECDictReader(r io.Reader) (*ECDictResult, error) {
	// 用 bufio 读取以便跳过 BOM
	br := bufio.NewReader(r)
	if b, err := br.Peek(3); err == nil && len(b) >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF {
		_, _ = br.Discard(3)
	}

	reader := csv.NewReader(br)
	reader.FieldsPerRecord = -1 // 允许列数不一致
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	res := &ECDictResult{
		Entries: make([]ECDictEntry, 0, 100000),
	}
	// 用于去重 (word|pos)
	seen := make(map[string]struct{}, 100000)

	// 尝试读表头
	header, err := reader.Read()
	if err == io.EOF {
		return res, nil
	}
	if err != nil {
		return nil, fmt.Errorf("读取表头失败: %w", err)
	}
	res.TotalLines++

	// 推断列索引
	wordIdx, phoneticIdx, posIdx, defIdx, transIdx, exchIdx, hasHeader := detectECDictColumns(header)

	// 没识别出表头（首列不是 "word"）时，把这一行当作数据
	// ECDICT 标准 CSV 一定带表头；但为防文件损坏，按列序兜底
	if !hasHeader {
		wordIdx, phoneticIdx, posIdx, defIdx, transIdx, exchIdx = 0, 1, 2, 4, 5, 3
		// 把首行作为数据处理
		e, ok := buildECDictEntry(header, wordIdx, phoneticIdx, posIdx, defIdx, transIdx, exchIdx)
		if ok {
			k := e.Word + "|" + e.Pos
			if _, dup := seen[k]; !dup {
				seen[k] = struct{}{}
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
			res.Skipped++
			res.TotalLines++
			continue
		}
		res.TotalLines++
		if len(row) == 0 || isAllEmpty(row) {
			res.Skipped++
			continue
		}
		e, ok := buildECDictEntry(row, wordIdx, phoneticIdx, posIdx, defIdx, transIdx, exchIdx)
		if !ok {
			res.Skipped++
			continue
		}
		k := e.Word + "|" + e.Pos
		if _, dup := seen[k]; dup {
			res.Skipped++
			continue
		}
		seen[k] = struct{}{}
		res.Entries = append(res.Entries, e)
	}
	return res, nil
}

// ParseECDictString 从字符串解析
func ParseECDictString(s string) (*ECDictResult, error) {
	s = strings.TrimPrefix(s, "\ufeff")
	return ParseECDictReader(strings.NewReader(s))
}

// detectECDictColumns 从首行推断列索引
func detectECDictColumns(header []string) (int, int, int, int, int, int, bool) {
	wordIdx, phoneticIdx, posIdx, exchIdx, defIdx, transIdx := -1, -1, -1, -1, -1, -1
	for i, col := range header {
		c := strings.ToLower(strings.TrimSpace(col))
		switch c {
		case "word", "words":
			wordIdx = i
		case "phonetic":
			phoneticIdx = i
		case "pos":
			posIdx = i
		case "exchange":
			exchIdx = i
		case "definition", "def":
			defIdx = i
		case "translation", "trans", "cn":
			transIdx = i
		}
	}
	hasHeader := wordIdx >= 0
	return wordIdx, phoneticIdx, posIdx, defIdx, transIdx, exchIdx, hasHeader
}

// buildECDictEntry 从一行构建 ECDictEntry
func buildECDictEntry(row []string, wordIdx, phoneticIdx, posIdx, defIdx, transIdx, exchIdx int) (ECDictEntry, bool) {
	if wordIdx < 0 || wordIdx >= len(row) {
		return ECDictEntry{}, false
	}
	w := normalizeECDictWord(row[wordIdx])
	if w == "" {
		return ECDictEntry{}, false
	}
	e := ECDictEntry{Word: w}
	if phoneticIdx >= 0 && phoneticIdx < len(row) {
		e.Phonetic = strings.TrimSpace(row[phoneticIdx])
	}
	if posIdx >= 0 && posIdx < len(row) {
		e.Pos = strings.TrimSpace(row[posIdx])
	}
	if defIdx >= 0 && defIdx < len(row) {
		e.Definition = strings.TrimSpace(row[defIdx])
	}
	if transIdx >= 0 && transIdx < len(row) {
		e.Translation = strings.TrimSpace(row[transIdx])
	}
	if exchIdx >= 0 && exchIdx < len(row) {
		e.Exchange = strings.TrimSpace(row[exchIdx])
	}
	return e, true
}

// normalizeECDictWord 归一化 ECDict 词头
func normalizeECDictWord(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ToLower(s)
	s = strings.TrimFunc(s, func(r rune) bool {
		return unicode.IsPunct(r) || unicode.IsSpace(r)
	})
	return s
}
