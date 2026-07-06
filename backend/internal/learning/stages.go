// Package learning 实现 v1.0.0 多阶段学习复习体系的常量与计划派生。
//
// 阶段流程：
//   first_learn → review_1(6h) → review_2(1d) → review_3(2d) → review_4(4d)
//              → review_5(7d) → review_6(14d) → review_7(28d) → completed
//
// 每个阶段包含若干子步骤（sub-stage），由 [PlanFor] 派生。
// 入口子步骤（first_learn / intensive_listen）不可跳过。
package learning

import "time"

// ============================================================================
// 阶段常量
// ============================================================================

// 学习大阶段（与数据库 LearningProgress.CurrentStage 字段一致）
const (
	StageFirstLearn = "first_learn"
	StageReview1    = "review_1"
	StageReview2    = "review_2"
	StageReview3    = "review_3"
	StageReview4    = "review_4"
	StageReview5    = "review_5"
	StageReview6    = "review_6"
	StageReview7    = "review_7"
	StageCompleted  = "completed"
)

// 学习子步骤（与数据库 LearningProgress.CurrentSubStage 字段一致）
const (
	SubStageIntensiveListen  = "intensive_listen"   // 逐句精听（首次学习入口）
	SubStageShadowing        = "shadowing"          // 难句跟读
	SubStageBlindListen      = "blind_listen"       // 全文盲听
	SubStageRetell           = "retell"             // 段落复述
	SubStageReviewDifficult  = "review_difficult"   // 难句补练
	SubStageReviewBlind      = "review_blind"       // 复习盲听
)

// 全部阶段顺序（用于推进计算）
var stageOrder = []string{
	StageFirstLearn,
	StageReview1,
	StageReview2,
	StageReview3,
	StageReview4,
	StageReview5,
	StageReview6,
	StageReview7,
	StageCompleted,
}

// 阶段复习间隔（小时，距上一阶段完成时间）
//   review_1 = 6h, review_2 = 1d, review_3 = 2d, review_4 = 4d,
//   review_5 = 7d, review_6 = 14d, review_7 = 28d
var stageIntervals = map[string]time.Duration{
	StageFirstLearn: 0,
	StageReview1:    6 * time.Hour,
	StageReview2:    24 * time.Hour,
	StageReview3:    2 * 24 * time.Hour,
	StageReview4:    4 * 24 * time.Hour,
	StageReview5:    7 * 24 * time.Hour,
	StageReview6:    14 * 24 * time.Hour,
	StageReview7:    28 * 24 * time.Hour,
	StageCompleted:  0,
}

// 阶段中文标签（前端展示）
var stageLabels = map[string]string{
	StageFirstLearn: "首次学习",
	StageReview1:    "首轮复习",
	StageReview2:    "第二轮复习",
	StageReview3:    "第三轮复习",
	StageReview4:    "第四轮复习",
	StageReview5:    "第五轮复习",
	StageReview6:    "第六轮复习",
	StageReview7:    "第七轮复习",
	StageCompleted:  "已完成",
}

// 子步骤中文标签
var subStageLabels = map[string]string{
	SubStageIntensiveListen: "逐句精听",
	SubStageShadowing:       "难句跟读",
	SubStageBlindListen:     "全文盲听",
	SubStageRetell:          "段落复述",
	SubStageReviewDifficult: "难句补练",
	SubStageReviewBlind:     "全文盲听",
}

// 阶段 emoji 图标
var stageEmojis = map[string]string{
	StageFirstLearn: "🌱",
	StageReview1:    "🔁",
	StageReview2:    "🔁",
	StageReview3:    "🔁",
	StageReview4:    "🔁",
	StageReview5:    "🔁",
	StageReview6:    "🔁",
	StageReview7:    "🔁",
	StageCompleted:  "✅",
}

// PlanFor 返回指定阶段的子步骤顺序。
//
// 当前为固定计划（参考 Echo Loop 的 dense baseline）：
//   - first_learn: [intensive_listen, shadowing, blind_listen, retell]
//   - review_1..review_7: [review_difficult, review_blind]
//   - completed: []
func PlanFor(stage string) []string {
	switch stage {
	case StageFirstLearn:
		return []string{
			SubStageIntensiveListen,
			SubStageShadowing,
			SubStageBlindListen,
			SubStageRetell,
		}
	case StageReview1, StageReview2, StageReview3,
		StageReview4, StageReview5, StageReview6, StageReview7:
		return []string{
			SubStageReviewDifficult,
			SubStageReviewBlind,
		}
	case StageCompleted:
		return []string{}
	default:
		return []string{SubStageIntensiveListen}
	}
}

// IntervalFor 返回阶段相对上一阶段完成时间的复习间隔。
func IntervalFor(stage string) time.Duration {
	if d, ok := stageIntervals[stage]; ok {
		return d
	}
	return 0
}

// LabelFor 返回阶段的中文标签。
func LabelFor(stage string) string {
	if s, ok := stageLabels[stage]; ok {
		return s
	}
	return stage
}

// SubStageLabelFor 返回子步骤的中文标签。
func SubStageLabelFor(sub string) string {
	if s, ok := subStageLabels[sub]; ok {
		return s
	}
	return sub
}

// EmojiFor 返回阶段的 emoji 图标。
func EmojiFor(stage string) string {
	if e, ok := stageEmojis[stage]; ok {
		return e
	}
	return "📚"
}

// IsValidStage 判断是否为合法的阶段值。
func IsValidStage(stage string) bool {
	for _, s := range stageOrder {
		if s == stage {
			return true
		}
	}
	return false
}

// IsValidSubStage 判断是否为合法的子步骤值。
func IsValidSubStage(sub string) bool {
	switch sub {
	case SubStageIntensiveListen, SubStageShadowing,
		SubStageBlindListen, SubStageRetell,
		SubStageReviewDifficult, SubStageReviewBlind:
		return true
	}
	return false
}

// NextSubStage 返回当前阶段内下一子步骤；若已是末尾则返回 (nextStage, firstSub, true)。
//
// 返回 (sub, isNextInStage)：
//   - isNextInStage=true：同一阶段的下一子步骤
//   - isNextInStage=false：已到本阶段末尾，应推进到 nextStage 的第一个子步骤
func NextSubStage(stage, currentSub string) (string, string, bool) {
	plan := PlanFor(stage)
	if len(plan) == 0 {
		// 终态阶段
		return "", "", false
	}
	for i, s := range plan {
		if s == currentSub {
			if i+1 < len(plan) {
				return plan[i+1], "", true
			}
			// 已是本阶段末尾
			nextStage := NextStage(stage)
			if nextStage == stage {
				return "", "", false
			}
			return "", nextStage, false
		}
	}
	// currentSub 不在 plan 内（数据异常）→ 返回本阶段第一个
	return plan[0], "", true
}

// NextStage 返回下一阶段；已是终态则返回自身。
func NextStage(stage string) string {
	for i, s := range stageOrder {
		if s == stage {
			if i+1 < len(stageOrder) {
				return stageOrder[i+1]
			}
			return stage
		}
	}
	return stage
}

// IsEntrySubStage 判断是否为该阶段的入口子步骤（不可跳过）。
//
// 当前所有阶段的入口都是第一个子步骤；first_learn 的入口不可跳过，
// 复习阶段暂允许跳过（Echo Loop 中复习入口也不强制）。
func IsEntrySubStage(stage, sub string) bool {
	plan := PlanFor(stage)
	if len(plan) == 0 {
		return false
	}
	return plan[0] == sub && stage == StageFirstLearn
}

// IsReviewStage 判断是否为复习阶段。
func IsReviewStage(stage string) bool {
	switch stage {
	case StageReview1, StageReview2, StageReview3,
		StageReview4, StageReview5, StageReview6, StageReview7:
		return true
	}
	return false
}

// NextReviewAt 计算指定阶段的解锁时间（基于上一阶段完成时间）。
//
// first_learn / completed 返回零值；其余复习阶段返回 baseAt + interval。
func NextReviewAt(stage string, baseAt time.Time) time.Time {
	if baseAt.IsZero() {
		return time.Time{}
	}
	d := IntervalFor(stage)
	if d <= 0 {
		return time.Time{}
	}
	return baseAt.Add(d)
}
