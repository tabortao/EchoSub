package dictcsv

import (
	"strings"
	"testing"
)

func TestParseString_Header(t *testing.T) {
	csv := "word,phonetic,translation\nhello,/həˈloʊ/,你好\nworld,/wɜːrld/,世界\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello" || r.Entries[0].Phonetic != "/həˈloʊ/" || r.Entries[0].Translation != "你好" {
		t.Errorf("entry 0 mismatch: %+v", r.Entries[0])
	}
	if r.Entries[1].Word != "world" {
		t.Errorf("entry 1 word mismatch: %+v", r.Entries[1])
	}
	if r.Skipped != 0 {
		t.Errorf("expected 0 skipped, got %d", r.Skipped)
	}
}

func TestParseString_BOM(t *testing.T) {
	csv := "\ufeffword,phonetic,translation\nhello,/h/,你好\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello" {
		t.Errorf("BOM not stripped, got word=%q", r.Entries[0].Word)
	}
}

func TestParseString_NoPhoneticColumn(t *testing.T) {
	csv := "word,translation\nhello,你好\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Phonetic != "" {
		t.Errorf("phonetic should be empty, got %q", r.Entries[0].Phonetic)
	}
	if r.Entries[0].Translation != "你好" {
		t.Errorf("translation mismatch: %q", r.Entries[0].Translation)
	}
}

func TestParseString_NoHeader(t *testing.T) {
	// 首行直接是数据（不含 "word" 等表头关键词）
	csv := "hello,/h/,你好\nworld,/w/,世界\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello" {
		t.Errorf("entry 0 mismatch: %+v", r.Entries[0])
	}
}

func TestParseString_Duplicates(t *testing.T) {
	csv := "word,phonetic,translation\nhello,/h/,你好\nhello,/h/,您好（重复）\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 unique entry, got %d", len(r.Entries))
	}
	if r.Skipped != 1 {
		t.Errorf("expected 1 skipped, got %d", r.Skipped)
	}
}

func TestParseString_EmptyAndInvalid(t *testing.T) {
	csv := "word,phonetic,translation\n\n   ,/,空行\nhello,/h/,你好\n,/,空词\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 期望：hello 一条；其余多行被跳过
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello" {
		t.Errorf("entry should be hello, got %q", r.Entries[0].Word)
	}
	if r.Skipped < 2 {
		t.Errorf("expected at least 2 skipped, got %d", r.Skipped)
	}
}

func TestParseString_QuotedField(t *testing.T) {
	// 含逗号 / 双引号转义
	csv := `word,phonetic,translation
"hello, hi",/h/,"你好；打招呼"
` + "\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello, hi" {
		t.Errorf("quoted word mismatch: %q", r.Entries[0].Word)
	}
	if r.Entries[0].Translation != "你好；打招呼" {
		t.Errorf("quoted translation mismatch: %q", r.Entries[0].Translation)
	}
}

func TestParseString_TranslationFallback(t *testing.T) {
	// 表头只有 word，其余列应当被识别为 translation（拼接）
	csv := "word\nhello,你好,招呼\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Translation != "你好; 招呼" {
		t.Errorf("expected joined translation, got %q", r.Entries[0].Translation)
	}
}

func TestParseString_AlternateHeader(t *testing.T) {
	csv := "term,ipa,gloss\nhello,/h/,你好\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello" || r.Entries[0].Phonetic != "/h/" {
		t.Errorf("alt header not detected: %+v", r.Entries[0])
	}
}

func TestLemmas_Plural(t *testing.T) {
	got := Lemmas("dogs")
	if !contains(got, "dog") {
		t.Errorf("expected dog in lemmas of dogs, got %v", got)
	}
	if !contains(got, "dogs") {
		t.Errorf("expected original dogs, got %v", got)
	}
}

func TestLemmas_Studying(t *testing.T) {
	got := Lemmas("studying")
	// studying -> stud + y (strip "ing") 也可能
	found := false
	for _, l := range got {
		if l == "study" || l == "studi" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected study/studi in lemmas, got %v", got)
	}
}

func TestLemmas_Empty(t *testing.T) {
	if Lemmas("") != nil {
		t.Error("empty input should return nil")
	}
	if len(Lemmas("a")) < 1 {
		t.Error("single char should at least return itself")
	}
}

func TestLookup_Exact(t *testing.T) {
	entries := []Entry{
		{Word: "hello", Translation: "你好"},
		{Word: "world", Translation: "世界"},
	}
	e, ok := Lookup(entries, "Hello") // 大小写不敏感
	if !ok {
		t.Fatal("expected to find hello")
	}
	if e.Word != "hello" {
		t.Errorf("expected hello, got %q", e.Word)
	}
}

func TestLookup_FallbackToLemma(t *testing.T) {
	entries := []Entry{
		{Word: "study", Translation: "学习"},
		{Word: "world", Translation: "世界"},
	}
	// "studying" 应回退到 "study"
	e, ok := Lookup(entries, "studying")
	if !ok {
		t.Fatal("expected to fall back to study")
	}
	if e.Word != "study" {
		t.Errorf("expected study, got %q", e.Word)
	}
}

func TestLookup_NotFound(t *testing.T) {
	entries := []Entry{{Word: "hello"}}
	_, ok := Lookup(entries, "goodbye")
	if ok {
		t.Error("expected not found")
	}
}

func TestLookup_Empty(t *testing.T) {
	_, ok := Lookup(nil, "hello")
	if ok {
		t.Error("expected not found on empty entries")
	}
	_, ok = Lookup([]Entry{}, "")
	if ok {
		t.Error("expected not found on empty word")
	}
}

func TestParseString_Realistic(t *testing.T) {
	// 真实场景：UTF-8 中文释义 + 多种表头列名
	csv := "word,phonetic,translation\napple,/ˈæpl/,苹果\nbanana,/bəˈnænə/,香蕉\ncherry fruit,/ˈtʃeri/,樱桃\n"
	r, err := ParseString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 3 {
		t.Errorf("expected 3 entries, got %d (skipped=%d, total=%d)", len(r.Entries), r.Skipped, r.TotalLines)
	}
}

func TestNormalizeWord(t *testing.T) {
	cases := []struct{ in, want string }{
		{"  Hello  ", "hello"},
		{"WORLD", "world"},
		{"  ", ""},
		{"foo,", "foo"},
		{"bar.", "bar"},
	}
	for _, c := range cases {
		if got := normalizeWord(c.in); got != c.want {
			t.Errorf("normalizeWord(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func contains(arr []string, s string) bool {
	for _, a := range arr {
		if a == s {
			return true
		}
	}
	return false
}

// 防止 linter 警告 strings 导入未用
var _ = strings.TrimSpace
