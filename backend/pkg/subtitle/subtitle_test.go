package subtitle

import (
	"testing"
)

func TestParseSRT(t *testing.T) {
	content := `1
00:00:01,000 --> 00:00:03,000
Hello World

2
00:00:04,500 --> 00:00:06,000
This is a test
second line

3
00:01:02,000 --> 00:01:05,250
Final sentence`
	sentences, err := ParseSRT(content)
	if err != nil {
		t.Fatalf("ParseSRT failed: %v", err)
	}
	if len(sentences) != 3 {
		t.Fatalf("expected 3 sentences, got %d", len(sentences))
	}
	// 第一句
	if sentences[0].Start != 1.0 || sentences[0].End != 3.0 {
		t.Errorf("sentence 0 time wrong: start=%v end=%v", sentences[0].Start, sentences[0].End)
	}
	if sentences[0].Text != "Hello World" {
		t.Errorf("sentence 0 text wrong: %q", sentences[0].Text)
	}
	if sentences[0].Index != 0 {
		t.Errorf("sentence 0 index wrong: %d", sentences[0].Index)
	}
	// 第二句多行文本
	if sentences[1].Text != "This is a test\nsecond line" {
		t.Errorf("sentence 1 text wrong: %q", sentences[1].Text)
	}
	if sentences[1].Start != 4.5 || sentences[1].End != 6.0 {
		t.Errorf("sentence 1 time wrong: start=%v end=%v", sentences[1].Start, sentences[1].End)
	}
	// 第三句
	if sentences[2].Start != 62.0 || sentences[2].End != 65.25 {
		t.Errorf("sentence 2 time wrong: start=%v end=%v", sentences[2].Start, sentences[2].End)
	}
}

func TestParseSRT_CRLF(t *testing.T) {
	content := "1\r\n00:00:01,000 --> 00:00:02,000\r\nLine\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nAnother"
	sentences, err := ParseSRT(content)
	if err != nil {
		t.Fatalf("ParseSRT failed: %v", err)
	}
	if len(sentences) != 2 {
		t.Fatalf("expected 2 sentences, got %d", len(sentences))
	}
	if sentences[0].Text != "Line" || sentences[1].Text != "Another" {
		t.Errorf("CRLF parsing wrong: %q %q", sentences[0].Text, sentences[1].Text)
	}
}

func TestParseSRT_BOM(t *testing.T) {
	// 文件带 UTF-8 BOM 时，首句序号被污染会导致第一句丢失
	content := "\ufeff1\n00:00:00,500 --> 00:00:02,800\nHello, welcome to the lesson.\n\n2\n00:00:03,000 --> 00:00:05,500\nToday we will learn English."
	sentences, err := ParseSRT(content)
	if err != nil {
		t.Fatalf("ParseSRT failed: %v", err)
	}
	if len(sentences) != 2 {
		t.Fatalf("expected 2 sentences, got %d", len(sentences))
	}
	if sentences[0].Start != 0.5 || sentences[0].End != 2.8 {
		t.Errorf("BOM sentence 0 time wrong: start=%v end=%v", sentences[0].Start, sentences[0].End)
	}
	if sentences[0].Text != "Hello, welcome to the lesson." {
		t.Errorf("BOM sentence 0 text wrong: %q", sentences[0].Text)
	}
}

func TestParseVTT(t *testing.T) {
	content := `WEBVTT

NOTE This is a comment

00:00:01.000 --> 00:00:03.000
First cue

00:00:04.500 --> 00:00:06.000
Second cue
multiline

00:01:02.000 --> 00:01:05.250
Third cue`
	sentences, err := ParseVTT(content)
	if err != nil {
		t.Fatalf("ParseVTT failed: %v", err)
	}
	if len(sentences) != 3 {
		t.Fatalf("expected 3 sentences, got %d", len(sentences))
	}
	if sentences[0].Start != 1.0 || sentences[0].End != 3.0 {
		t.Errorf("cue 0 time wrong: start=%v end=%v", sentences[0].Start, sentences[0].End)
	}
	if sentences[0].Text != "First cue" {
		t.Errorf("cue 0 text wrong: %q", sentences[0].Text)
	}
	if sentences[1].Text != "Second cue\nmultiline" {
		t.Errorf("cue 1 text wrong: %q", sentences[1].Text)
	}
	if sentences[2].Start != 62.0 || sentences[2].End != 65.25 {
		t.Errorf("cue 2 time wrong: start=%v end=%v", sentences[2].Start, sentences[2].End)
	}
}

func TestParseVTT_MMSS(t *testing.T) {
	// 测试 MM:SS.mmm 格式（无小时）
	content := `WEBVTT

00:05.000 --> 00:10.500
Short format`
	sentences, err := ParseVTT(content)
	if err != nil {
		t.Fatalf("ParseVTT failed: %v", err)
	}
	if len(sentences) != 1 {
		t.Fatalf("expected 1 sentence, got %d", len(sentences))
	}
	if sentences[0].Start != 5.0 || sentences[0].End != 10.5 {
		t.Errorf("time wrong: start=%v end=%v", sentences[0].Start, sentences[0].End)
	}
}

func TestParseTimestamp(t *testing.T) {
	cases := []struct {
		in   string
		want float64
	}{
		{"00:00:01,000", 1.0},
		{"00:00:01.500", 1.5},
		{"01:02:03,250", 3723.25},
		{"00:05.000", 5.0},
		{"12.345", 12.345},
	}
	for _, c := range cases {
		got := parseTimestamp(c.in)
		if got != c.want {
			t.Errorf("parseTimestamp(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestParseSRT_Empty(t *testing.T) {
	sentences, err := ParseSRT("")
	if err != nil {
		t.Fatalf("ParseSRT failed: %v", err)
	}
	if len(sentences) != 0 {
		t.Fatalf("expected 0 sentences, got %d", len(sentences))
	}
}

func TestFormatDuration(t *testing.T) {
	cases := []struct {
		sec  float64
		want string
	}{
		{0, "00:00:00"},
		{65.5, "00:01:05"},
		{3723.25, "01:02:03"},
	}
	for _, c := range cases {
		got := FormatDuration(c.sec)
		if got != c.want {
			t.Errorf("FormatDuration(%v) = %q, want %q", c.sec, got, c.want)
		}
	}
}
