package handlers

import (
	"strings"
	"testing"
)

// 字典条目 JSON 解析（parseDictionaryEntry）的容错测试
// 关键：剥离 Markdown 围栏、缺失字段回退空值、数组始终非 nil

func TestParseDictionaryEntry_RawJSON(t *testing.T) {
	raw := `{
		"headword": "apple",
		"pronunciation": {"uk": "/ˈæp.əl/", "us": "/ˈæp.əl/"},
		"meanings": [
			{
				"part_of_speech": "n.",
				"translation": ["苹果", "苹果公司"],
				"definition": "a round fruit with red or green skin",
				"examples": [{"sentence": "An apple a day keeps the doctor away.", "translation": "一天一苹果，医生远离我。"}]
			}
		],
		"word_family": [
			{"word": "applesauce", "part_of_speech": "n.", "meaning": "苹果酱"}
		],
		"etymology": "from Old English 'æppel'",
		"learner_tips": ["注意 a/an 选择：an apple"]
	}`
	entry, err := parseDictionaryEntry(raw, "fallback")
	if err != nil {
		t.Fatalf("parseDictionaryEntry failed: %v", err)
	}
	if entry.Headword != "apple" {
		t.Errorf("Headword: got %q, want %q", entry.Headword, "apple")
	}
	if entry.Pronunciation.UK != "/ˈæp.əl/" {
		t.Errorf("UK: got %q, want %q", entry.Pronunciation.UK, "/ˈæp.əl/")
	}
	if len(entry.Meanings) != 1 {
		t.Fatalf("Meanings: got %d, want 1", len(entry.Meanings))
	}
	if entry.Meanings[0].PartOfSpeech != "n." {
		t.Errorf("PartOfSpeech: got %q", entry.Meanings[0].PartOfSpeech)
	}
	if len(entry.Meanings[0].Translation) != 2 {
		t.Errorf("Translation len: got %d", len(entry.Meanings[0].Translation))
	}
	if entry.Meanings[0].Examples[0].Sentence == "" {
		t.Error("example sentence empty")
	}
	if len(entry.WordFamily) != 1 {
		t.Errorf("WordFamily: got %d", len(entry.WordFamily))
	}
	if entry.Etymology == "" {
		t.Error("Etymology empty")
	}
	if len(entry.LearnerTips) != 1 {
		t.Errorf("LearnerTips: got %d", len(entry.LearnerTips))
	}
}

func TestParseDictionaryEntry_MarkdownFence(t *testing.T) {
	raw := "```json\n{\"headword\": \"test\", \"meanings\": []}\n```"
	entry, err := parseDictionaryEntry(raw, "test")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if entry.Headword != "test" {
		t.Errorf("Headword: got %q", entry.Headword)
	}
	// 数组必须为非 nil
	if entry.Meanings == nil {
		t.Error("Meanings should be non-nil empty slice")
	}
	if entry.WordFamily == nil {
		t.Error("WordFamily should be non-nil empty slice")
	}
}

func TestParseDictionaryEntry_MissingFields(t *testing.T) {
	raw := `{"headword": "x"}`
	entry, err := parseDictionaryEntry(raw, "x")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if entry.Meanings == nil {
		t.Error("Meanings nil")
	}
	if entry.WordFamily == nil {
		t.Error("WordFamily nil")
	}
	if entry.Pronunciation.UK != "" {
		t.Error("UK should default to empty")
	}
}

func TestParseDictionaryEntry_FallbackHeadword(t *testing.T) {
	raw := `{}`
	entry, err := parseDictionaryEntry(raw, "fallback-word")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if entry.Headword != "fallback-word" {
		t.Errorf("Headword fallback: got %q, want %q", entry.Headword, "fallback-word")
	}
}

func TestParseDictionaryEntry_InvalidJSON(t *testing.T) {
	_, err := parseDictionaryEntry("not json at all", "x")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
	if !strings.Contains(err.Error(), "JSON") {
		t.Errorf("error msg should mention JSON, got: %v", err)
	}
}

// 句子解释解析（parseSentenceExplain）的容错测试

func TestParseSentenceExplain_AllFields(t *testing.T) {
	raw := `{
		"original": "I have been studying English for three years.",
		"translation": "我学英语已经三年了。",
		"words": [
			{"word": "studying", "lemma": "study", "pos": "v.", "meaning": "学习", "note": "现在分词"}
		],
		"grammar": {
			"pattern": "主谓宾 + 现在完成进行时",
			"description": "现在完成进行时表示从过去持续到现在的动作",
			"key_phrases": ["for three years"]
		},
		"notes": "现在完成进行时强调动作的持续性"
	}`
	resp, err := parseSentenceExplain(raw, "fallback")
	if err != nil {
		t.Fatalf("parseSentenceExplain failed: %v", err)
	}
	if resp.Original != "I have been studying English for three years." {
		t.Errorf("Original: got %q", resp.Original)
	}
	if resp.Translation != "我学英语已经三年了。" {
		t.Errorf("Translation: got %q", resp.Translation)
	}
	if len(resp.Words) != 1 {
		t.Errorf("Words len: got %d", len(resp.Words))
	}
	if resp.Grammar == nil {
		t.Fatal("Grammar nil")
	}
	if resp.Grammar.Pattern != "主谓宾 + 现在完成进行时" {
		t.Errorf("Pattern: got %q", resp.Grammar.Pattern)
	}
	if len(resp.Grammar.KeyPhrases) != 1 {
		t.Errorf("KeyPhrases len: got %d", len(resp.Grammar.KeyPhrases))
	}
	if resp.Notes == "" {
		t.Error("Notes empty")
	}
}

func TestParseSentenceExplain_FenceAndEmpty(t *testing.T) {
	raw := "```\n{\"original\": \"hi\"}\n```"
	resp, err := parseSentenceExplain(raw, "fallback")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if resp.Original != "hi" {
		t.Errorf("Original: got %q", resp.Original)
	}
	if resp.Words == nil {
		t.Error("Words should be non-nil empty slice")
	}
}

func TestParseSentenceExplain_InvalidJSON(t *testing.T) {
	_, err := parseSentenceExplain("garbage", "x")
	if err == nil {
		t.Error("expected error")
	}
}

func TestStrVal(t *testing.T) {
	if strVal("hello", "fb") != "hello" {
		t.Error("string passthrough failed")
	}
	if strVal(123, "fb") != "fb" {
		t.Error("non-string fallback failed")
	}
	if strVal(nil, "fb") != "fb" {
		t.Error("nil fallback failed")
	}
}
