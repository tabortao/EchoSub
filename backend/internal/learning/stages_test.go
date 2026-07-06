package learning

import (
	"testing"
	"time"
)

// TestPlanFor 验证每个阶段的子步骤顺序
func TestPlanFor(t *testing.T) {
	cases := []struct {
		stage string
		want  []string
	}{
		{StageFirstLearn, []string{
			SubStageIntensiveListen, SubStageShadowing,
			SubStageBlindListen, SubStageRetell,
		}},
		{StageReview1, []string{SubStageReviewDifficult, SubStageReviewBlind}},
		{StageReview2, []string{SubStageReviewDifficult, SubStageReviewBlind}},
		{StageReview3, []string{SubStageReviewDifficult, SubStageReviewBlind}},
		{StageReview7, []string{SubStageReviewDifficult, SubStageReviewBlind}},
		{StageCompleted, []string{}},
	}
	for _, c := range cases {
		got := PlanFor(c.stage)
		if len(got) != len(c.want) {
			t.Errorf("PlanFor(%s) len: got %d, want %d", c.stage, len(got), len(c.want))
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("PlanFor(%s)[%d]: got %q, want %q", c.stage, i, got[i], c.want[i])
			}
		}
	}
}

// TestIntervalFor 验证阶段复习间隔
func TestIntervalFor(t *testing.T) {
	cases := []struct {
		stage string
		wantH int
	}{
		{StageFirstLearn, 0},
		{StageReview1, 6},
		{StageReview2, 24},
		{StageReview3, 48},
		{StageReview4, 96},
		{StageReview5, 168},
		{StageReview6, 336},
		{StageReview7, 672},
		{StageCompleted, 0},
	}
	for _, c := range cases {
		got := int(IntervalFor(c.stage).Hours())
		if got != c.wantH {
			t.Errorf("IntervalFor(%s): got %d h, want %d h", c.stage, got, c.wantH)
		}
	}
}

// TestIsValidStage 校验阶段合法性
func TestIsValidStage(t *testing.T) {
	for _, s := range []string{
		StageFirstLearn, StageReview1, StageReview7, StageCompleted,
	} {
		if !IsValidStage(s) {
			t.Errorf("IsValidStage(%s): got false, want true", s)
		}
	}
	if IsValidStage("unknown") {
		t.Error("IsValidStage(unknown): got true, want false")
	}
	if IsValidStage("") {
		t.Error("IsValidStage(empty): got true, want false")
	}
}

// TestIsValidSubStage 校验子步骤合法性
func TestIsValidSubStage(t *testing.T) {
	for _, s := range []string{
		SubStageIntensiveListen, SubStageShadowing, SubStageBlindListen,
		SubStageRetell, SubStageReviewDifficult, SubStageReviewBlind,
	} {
		if !IsValidSubStage(s) {
			t.Errorf("IsValidSubStage(%s): got false, want true", s)
		}
	}
	if IsValidSubStage("unknown") {
		t.Error("IsValidSubStage(unknown): got true, want false")
	}
}

// TestNextSubStage 验证同阶段内的子步骤推进
func TestNextSubStage(t *testing.T) {
	// first_learn / intensive_listen → shadowing (同阶段)
	got, stage, isNextInStage := NextSubStage(StageFirstLearn, SubStageIntensiveListen)
	if !isNextInStage {
		t.Error("firstLearn/intensive: should be in-stage")
	}
	if got != SubStageShadowing {
		t.Errorf("firstLearn/intensive: got %s, want shadowing", got)
	}
	if stage != "" {
		t.Errorf("firstLearn/intensive: stage should be empty, got %s", stage)
	}

	// first_learn / retell（末尾）→ 跨阶段到 review_1
	got, stage, isNextInStage = NextSubStage(StageFirstLearn, SubStageRetell)
	if isNextInStage {
		t.Error("firstLearn/retell: should be stage-advanced")
	}
	if stage != StageReview1 {
		t.Errorf("firstLearn/retell: got stage %s, want review_1", stage)
	}

	// review_1 / review_difficult → review_blind (同阶段)
	got, stage, isNextInStage = NextSubStage(StageReview1, SubStageReviewDifficult)
	if !isNextInStage {
		t.Error("review_1/difficult: should be in-stage")
	}
	if got != SubStageReviewBlind {
		t.Errorf("review_1/difficult: got %s, want review_blind", got)
	}

	// review_7 / review_blind（末尾）→ 跨阶段到 completed
	got, stage, isNextInStage = NextSubStage(StageReview7, SubStageReviewBlind)
	if isNextInStage {
		t.Error("review_7/blind: should be stage-advanced")
	}
	if stage != StageCompleted {
		t.Errorf("review_7/blind: got stage %s, want completed", stage)
	}
}

// TestIsEntrySubStage 验证入口子步骤判定
func TestIsEntrySubStage(t *testing.T) {
	if !IsEntrySubStage(StageFirstLearn, SubStageIntensiveListen) {
		t.Error("firstLearn/intensive should be entry (not skippable)")
	}
	if IsEntrySubStage(StageFirstLearn, SubStageRetell) {
		t.Error("firstLearn/retell should NOT be entry (skippable)")
	}
	if IsEntrySubStage(StageReview1, SubStageReviewDifficult) {
		t.Error("review_1/difficult is not entry (复习阶段允许跳过)")
	}
}

// TestIsReviewStage 验证复习阶段判定
func TestIsReviewStage(t *testing.T) {
	for _, s := range []string{
		StageReview1, StageReview2, StageReview3,
		StageReview4, StageReview5, StageReview6, StageReview7,
	} {
		if !IsReviewStage(s) {
			t.Errorf("IsReviewStage(%s): got false, want true", s)
		}
	}
	if IsReviewStage(StageFirstLearn) {
		t.Error("IsReviewStage(firstLearn): got true, want false")
	}
	if IsReviewStage(StageCompleted) {
		t.Error("IsReviewStage(completed): got true, want false")
	}
}

// TestNextReviewAt 验证阶段解锁时间
func TestNextReviewAt(t *testing.T) {
	base := time.Date(2026, 7, 6, 10, 0, 0, 0, time.UTC)
	cases := []struct {
		stage string
		wantH int
	}{
		{StageReview1, 6},
		{StageReview2, 24},
		{StageReview3, 48},
		{StageReview4, 96},
		{StageReview5, 168},
		{StageReview6, 336},
		{StageReview7, 672},
	}
	for _, c := range cases {
		got := NextReviewAt(c.stage, base)
		if got.IsZero() {
			t.Errorf("NextReviewAt(%s): got zero", c.stage)
			continue
		}
		wantAt := base.Add(time.Duration(c.wantH) * time.Hour)
		if !got.Equal(wantAt) {
			t.Errorf("NextReviewAt(%s): got %s, want %s", c.stage, got, wantAt)
		}
	}

	// first_learn 返回零值
	if !NextReviewAt(StageFirstLearn, base).IsZero() {
		t.Error("NextReviewAt(firstLearn) should be zero")
	}
	// 零 baseAt 返回零值
	if !NextReviewAt(StageReview1, time.Time{}).IsZero() {
		t.Error("NextReviewAt(zero base) should be zero")
	}
}

// TestNextStage 验证阶段推进
func TestNextStage(t *testing.T) {
	cases := []struct {
		stage string
		want  string
	}{
		{StageFirstLearn, StageReview1},
		{StageReview1, StageReview2},
		{StageReview7, StageCompleted},
		{StageCompleted, StageCompleted}, // 终态
		{"unknown", "unknown"},
	}
	for _, c := range cases {
		if got := NextStage(c.stage); got != c.want {
			t.Errorf("NextStage(%s): got %s, want %s", c.stage, got, c.want)
		}
	}
}

// TestLabelFor 验证中英文标签非空
func TestLabelFor(t *testing.T) {
	if LabelFor(StageFirstLearn) == "" {
		t.Error("LabelFor(firstLearn) should be non-empty")
	}
	if LabelFor("unknown") != "unknown" {
		t.Error("LabelFor(unknown) should fallback to input")
	}
	if SubStageLabelFor(SubStageIntensiveListen) == "" {
		t.Error("SubStageLabelFor should be non-empty")
	}
}
