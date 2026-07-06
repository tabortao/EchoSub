package dictcsv

import "testing"

func TestParseECDictString_Header(t *testing.T) {
	csv := "word,phonetic,pos,exchange,definition,translation\n" +
		"hello,/həˈloʊ/,interj.,{},\n" +
		"world,/wɜːrld/,n.,{},world 世界,世界\n" +
		"study,/ˈstʌdi/,v.,{p:studied;d:studied;i:studying},to learn,学习；研究\n"
	r, err := ParseECDictString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "hello" {
		t.Errorf("entry 0 word mismatch: %+v", r.Entries[0])
	}
	if r.Entries[1].Translation != "世界" {
		t.Errorf("entry 1 translation mismatch: %q", r.Entries[1].Translation)
	}
	if r.Entries[2].Exchange != "{p:studied;d:studied;i:studying}" {
		t.Errorf("entry 2 exchange mismatch: %q", r.Entries[2].Exchange)
	}
}

func TestParseECDictString_BOM(t *testing.T) {
	csv := "\ufeffword,phonetic,pos,exchange,definition,translation\nhello,/h/,n.,{},greet,你好\n"
	r, err := ParseECDictString(csv)
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

func TestParseECDictString_NoHeader(t *testing.T) {
	// 首行不是标准表头：按列序兜底（word,phonetic,pos,exchange,definition,translation）
	csv := "hello,/h/,interj.,{},greet,你好\nworld,/w/,n.,{},earth,世界\n"
	r, err := ParseECDictString(csv)
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

func TestParseECDictString_MultiPOS(t *testing.T) {
	// 同一 word 多个 pos —— 全部保留
	csv := "word,phonetic,pos,exchange,definition,translation\n" +
		"study,/s/,v.,{},to learn,学习\n" +
		"study,/s/,n.,{},the activity,研究\n"
	r, err := ParseECDictString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 2 {
		t.Fatalf("expected 2 entries (multi-pos), got %d", len(r.Entries))
	}
	if r.Entries[0].Pos != "v." || r.Entries[1].Pos != "n." {
		t.Errorf("pos mismatch: %+v / %+v", r.Entries[0], r.Entries[1])
	}
}

func TestParseECDictString_DuplicateSamePOS(t *testing.T) {
	// 同一 word+pos 重复 —— 只保留第一条
	csv := "word,phonetic,pos,exchange,definition,translation\n" +
		"study,/s/,v.,{},to learn,学习\n" +
		"study,/s/,v.,{},to learn deeply,学习（重复）\n"
	r, err := ParseECDictString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry (dedup), got %d", len(r.Entries))
	}
	if r.Skipped != 1 {
		t.Errorf("expected 1 skipped, got %d", r.Skipped)
	}
}

func TestParseECDictString_EmptyPOS(t *testing.T) {
	// 有些 ECDICT 行 pos 为空
	csv := "word,phonetic,pos,exchange,definition,translation\nhello,/h/,,{},greet,你好\n"
	r, err := ParseECDictString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Pos != "" {
		t.Errorf("pos should be empty, got %q", r.Entries[0].Pos)
	}
}

func TestParseECDictString_EmptyWordSkipped(t *testing.T) {
	csv := "word,phonetic,pos,exchange,definition,translation\n" +
		",/h/,n.,{},empty,空\n" +
		"valid,/v/,n.,{},ok,好\n"
	r, err := ParseECDictString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(r.Entries))
	}
	if r.Entries[0].Word != "valid" {
		t.Errorf("entry should be valid, got %q", r.Entries[0].Word)
	}
}

func TestParseECDictString_Realistic(t *testing.T) {
	// 真实 ECDICT 节选
	csv := `word,phonetic,pos,exchange,definition,translation
apple,/ˈæpl/,n.,{p:apples},a fruit,苹果
banana,/bəˈnænə/,n.,{p:bananas},a yellow fruit,香蕉
cherry,/ˈtʃeri/,n.,{p:cherries},a small red fruit,樱桃
run,/rʌn/,v.,{p:ran;d:run;i:running},to move fast,跑；运行
run,/rʌn/,n.,{},an act of running,跑步；运行
`
	r, err := ParseECDictString(csv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Entries) != 5 {
		t.Fatalf("expected 5 entries, got %d (skipped=%d)", len(r.Entries), r.Skipped)
	}
}

func TestNormalizeECDictWord(t *testing.T) {
	cases := []struct{ in, want string }{
		{"  Hello  ", "hello"},
		{"WORLD", "world"},
		{"  ", ""},
		{"foo,", "foo"},
		{"  bar.  ", "bar"},
		{"don't", "don't"}, // 撇号不算首尾标点
	}
	for _, c := range cases {
		if got := normalizeECDictWord(c.in); got != c.want {
			t.Errorf("normalizeECDictWord(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
