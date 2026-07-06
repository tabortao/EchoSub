// Package subtitle 解析 SRT/VTT 字幕文件，输出统一的句子结构。
package subtitle

import (
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Sentence 一条字幕句子
type Sentence struct {
	Index int     `json:"index"`
	Start float64 `json:"start"` // 秒
	End   float64 `json:"end"`   // 秒
	Text  string  `json:"text"`
}

// ParseFile 根据扩展名自动选择解析器
func ParseFile(path string) ([]Sentence, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取字幕文件失败: %w", err)
	}
	// 统一去除 UTF-8 BOM，避免首行序号被污染导致 SRT 首句丢失
	content := strings.TrimPrefix(string(data), "\ufeff")
	switch {
	case strings.HasSuffix(strings.ToLower(path), ".srt"):
		return ParseSRT(content)
	case strings.HasSuffix(strings.ToLower(path), ".vtt"):
		return ParseVTT(content)
	default:
		return nil, fmt.Errorf("不支持的字幕格式: %s", path)
	}
}

// ParseSRT 解析 SRT 内容
// 格式：
// 1
// 00:00:01,000 --> 00:00:03,000
// 字幕文本
func ParseSRT(content string) ([]Sentence, error) {
	content = strings.TrimPrefix(content, "\ufeff")
	content = strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	blocks := strings.Split(strings.TrimSpace(content), "\n\n")
	result := make([]Sentence, 0, len(blocks))
	for _, block := range blocks {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}
		lines := strings.Split(block, "\n")
		if len(lines) < 2 {
			continue
		}
		// 跳过序号行（如果有），定位时间行
		timeLineIdx := 0
		if _, err := strconv.Atoi(strings.TrimSpace(lines[0])); err == nil {
			timeLineIdx = 1
		}
		if timeLineIdx >= len(lines) {
			continue
		}
		start, end, ok := parseTimeRange(lines[timeLineIdx], ",")
		if !ok {
			continue
		}
		text := strings.Join(lines[timeLineIdx+1:], "\n")
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		result = append(result, Sentence{
			Index: len(result),
			Start: start,
			End:   end,
			Text:  text,
		})
	}
	return result, nil
}

// ParseVTT 解析 WebVTT 内容
func ParseVTT(content string) ([]Sentence, error) {
	content = strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	// 移除 BOM 与 WEBVTT 头部
	content = strings.TrimPrefix(content, "\ufeff")
	lines := strings.Split(content, "\n")
	result := make([]Sentence, 0)
	var (
		curStart, curEnd float64
		curText          []string
		haveTime         bool
	)
	flush := func() {
		if haveTime && len(curText) > 0 {
			text := strings.TrimSpace(strings.Join(curText, "\n"))
			if text != "" {
				result = append(result, Sentence{
					Index: len(result),
					Start: curStart,
					End:   curEnd,
					Text:  text,
				})
			}
		}
		curText = nil
		haveTime = false
	}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			flush()
			continue
		}
		if strings.HasPrefix(trimmed, "WEBVTT") || strings.HasPrefix(trimmed, "NOTE") || strings.HasPrefix(trimmed, "STYLE") || strings.HasPrefix(trimmed, "REGION") {
			continue
		}
		if start, end, ok := parseTimeRange(trimmed, "."); ok {
			flush()
			curStart, curEnd = start, end
			haveTime = true
			continue
		}
		if haveTime {
			curText = append(curText, trimmed)
		}
	}
	flush()
	return result, nil
}

var timeRangeRe = regexp.MustCompile(`(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3}|\d{1,2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3}|\d{1,2}[.,]\d{3})`)

// parseTimeRange 解析 "00:00:01,000 --> 00:00:03,000" 这类时间区间
func parseTimeRange(line, _ string) (start, end float64, ok bool) {
	m := timeRangeRe.FindStringSubmatch(line)
	if m == nil {
		return 0, 0, false
	}
	start = parseTimestamp(m[1])
	end = parseTimestamp(m[2])
	return start, end, true
}

// parseTimestamp 解析时间戳为秒（支持 HH:MM:SS,mmm / MM:SS,mmm / SS,mmm，分隔符为 , 或 .）
func parseTimestamp(s string) float64 {
	s = strings.Replace(s, ",", ".", 1)
	parts := strings.Split(s, ":")
	var hours, minutes float64
	var seconds float64
	switch len(parts) {
	case 3:
		hours, _ = strconv.ParseFloat(parts[0], 64)
		minutes, _ = strconv.ParseFloat(parts[1], 64)
		seconds, _ = strconv.ParseFloat(parts[2], 64)
	case 2:
		minutes, _ = strconv.ParseFloat(parts[0], 64)
		seconds, _ = strconv.ParseFloat(parts[1], 64)
	case 1:
		seconds, _ = strconv.ParseFloat(parts[0], 64)
	}
	return hours*3600 + minutes*60 + seconds
}

// FormatDuration 将秒格式化为 HH:MM:SS
func FormatDuration(sec float64) string {
	d := time.Duration(sec * float64(time.Second))
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

// FormatSRTTime 将秒格式化为 SRT 时间戳 HH:MM:SS,mmm
func FormatSRTTime(sec float64) string {
	d := time.Duration(sec * float64(time.Second))
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	ms := int(d.Milliseconds()) % 1000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", h, m, s, ms)
}

// FormatVTTTime 将秒格式化为 VTT 时间戳 HH:MM:SS.mmm
func FormatVTTTime(sec float64) string {
	d := time.Duration(sec * float64(time.Second))
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	ms := int(d.Milliseconds()) % 1000
	return fmt.Sprintf("%02d:%02d:%02d.%03d", h, m, s, ms)
}

// WriteFile 把句子数组写回字幕文件（按扩展名分发）。
// 句子的 Index 字段将被忽略，重新从 1 开始编号。
// 句子的 Start/End/Text 用于重建文件；Text 包含换行会原样保留。
func WriteFile(path string, sentences []Sentence) error {
	switch {
	case strings.HasSuffix(strings.ToLower(path), ".srt"):
		return WriteSRT(path, sentences)
	case strings.HasSuffix(strings.ToLower(path), ".vtt"):
		return WriteVTT(path, sentences)
	default:
		return fmt.Errorf("不支持的字幕格式: %s", path)
	}
}

// WriteSRT 把句子数组写为 SRT 格式
// 格式：序号行 / 时间行（HH:MM:SS,mmm --> HH:MM:SS,mmm） / 文本行 / 空行
func WriteSRT(path string, sentences []Sentence) error {
	var sb strings.Builder
	for i, s := range sentences {
		sb.WriteString(fmt.Sprintf("%d\n", i+1))
		sb.WriteString(fmt.Sprintf("%s --> %s\n", FormatSRTTime(s.Start), FormatSRTTime(s.End)))
		// 保留多行文本（按 \n 拆分）
		sb.WriteString(strings.TrimSpace(s.Text))
		sb.WriteString("\n\n")
	}
	return atomicWrite(path, []byte(sb.String()))
}

// WriteVTT 把句子数组写为 WebVTT 格式
// 开头固定 WEBVTT 头，然后每条：时间行 + 文本 + 空行
func WriteVTT(path string, sentences []Sentence) error {
	var sb strings.Builder
	sb.WriteString("WEBVTT\n\n")
	for i, s := range sentences {
		// VTT 序号非必需但加上便于阅读
		sb.WriteString(fmt.Sprintf("%d\n", i+1))
		sb.WriteString(fmt.Sprintf("%s --> %s\n", FormatVTTTime(s.Start), FormatVTTTime(s.End)))
		sb.WriteString(strings.TrimSpace(s.Text))
		sb.WriteString("\n\n")
	}
	return atomicWrite(path, []byte(sb.String()))
}

// atomicWrite 原子写文件：先写 .tmp 再 rename，避免编辑过程中崩溃导致源文件损坏。
func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("写临时文件失败: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("重命名临时文件失败: %w", err)
	}
	return nil
}


