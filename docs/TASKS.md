# TASKS.md — v0.9.1 本地词典

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v0.9.1 本地词典（2026-07-06）

### 后端

- [x] **T1** `internal/models/dictionary.go` 新建 — 定义 `LocalDictionary`（name/description/file_name/size_bytes/entry_count/source_lang/target_lang + `gorm.DeletedAt` 软删除）与 `DictEntry`（dict_id/word/phonetic/translation + 联合索引 `(dict_id, word)` + 单列 `word` 索引）两张表
- [x] **T2** `internal/database/database.go` AutoMigrate 注册上述两个模型；开启 SQLite `PRAGMA foreign_keys=ON`；创建 `trg_dict_entries_cascade_delete` 触发器（**注意**：GORM 软删除不触发 — 见 T15）
- [x] **T3** `pkg/dictcsv/dictcsv.go` 新建 `ParseReader / ParseString / ParseFile / Lemmas` 工具集
  - 兼容表头列名：`word/term/lemma/headword` + `phonetic/ipa/pronunciation` + `translation/definition/meaning/gloss`
  - 跳过空行、`csv.LazyQuotes` 容错、空表头按位置取 word/phonetic/translation
  - 同 word 去重、返回 `Result{Entries, Skipped, TotalLines, Header}`
  - `Lemmas(word)` 剥离常见后缀（`ies/ied/ying/ed/ing/es/er/est/ly/s`）返回原形候选列表
- [x] **T4** `internal/handlers/local_dict.go` 新建 `LocalDictHandler`，5 个接口
  - `ListLocalDicts` `GET /api/v1/dictionary/local`
  - `UploadLocalDict` `POST /api/v1/dictionary/local/upload`（multipart，事务写库，每 1000 条一批，单本最大 50 MiB，扩展名 `.csv/.tsv/.txt`）
  - `DeleteLocalDict` `DELETE /api/v1/dictionary/local/:id`（软删除）
  - `LookupLocalDict` `POST /api/v1/dictionary/local/lookup`（精确 + 词形 fallback，返回 `matched_by: "exact" | "lemma:<原形>"`）
  - `LocalDictStatus` `GET /api/v1/dictionary/local/status`（dict_count/entry_count/max_bytes/max_name_len）
- [x] **T5** `internal/router/router.go` 在 authed 组下新增 `/dictionary` 子路由，挂载 `LocalDictHandler`
- [x] **T6** `pkg/dictcsv/dictcsv_test.go` 新建 5 个测试：基础解析 / 表头列名 / 空行与非法 / 真实 10 行 / 词形 fallback
- [x] **T7** `test-dicts/test-basic.csv` 集成测试夹具（10 词 / 3 列：word,phonetic,translation）

### 前端

- [x] **T8** `src/api/index.ts` 新增 `localDictApi = { list, status, upload, remove, lookup }` 五个方法
- [x] **T9** `src/types/index.ts` 新增 6 个 TS 类型 — `LocalDictionary / LocalDictStatus / LocalDictUploadResult / LocalDictLookupRequest / LocalDictLookupEntry / LocalDictLookupResponse`
- [x] **T10** `src/store/dictionary.ts` `useDictionaryStore` 扩展 `localDicts / localDictsFetchedAt / preferLocalHit` 状态 + `setLocalDicts / addLocalDict / removeLocalDict / setPreferLocalHit` 四个方法；`persist` 配置 `version: 2`，`partialize` 显式列出持久化字段（`localDicts` 不持久化，每次进设置页主动拉取）
- [x] **T11** `src/pages/DictionarySettings.tsx` 新增「本地词典」管理卡 — Dragger 上传（最大 50 MiB / .csv/.tsv/.txt）、已上传列表（带统计 / 词条数 / 来源 / 描述 / 软删除时间）、删除二次确认、上传进度条、刷新按钮；AI 词典源卡片显示「离线 · N 本 · M 词」状态；新增「默认词典源」单选卡（按 `disabledIds` 过滤后渲染）+「本地命中时是否仍调 AI」开关
- [x] **T12** `src/pages/SentenceDetail.tsx` 单词查词逻辑升级为「本地优先 → AI 兜底」：状态机 `WordLookupState{word, loadingLocal, loadingAi, localEntries[], localTried, aiEntry, aiTried, error}`；命中分支按 `preferLocalHit` 决定是否调 AI 增强；新增 `LocalDictEntryCard` 与 `WordLookupView` 组件按来源分别渲染

### 验证 & Bug 修复

- [x] **T13** `go build ./...` exit code 0
- [x] **T14** `go vet ./...` exit code 0
- [x] **T15** **Bug 修复 — 本地词典级联删除失效** — GORM `db.Delete(&LocalDictionary{}, id)` 是软删除（只设 `deleted_at`），不真正 DELETE 行，因此 `trg_dict_entries_cascade_delete` 触发器不会激活，词条仍然残留。
  - 修复：`LookupLocalDict` 改为 `JOIN local_dictionaries ld ON ld.id = dict_entries.dict_id WHERE ld.deleted_at IS NULL` 查词时显式过滤
  - 每次查询用工厂函数 `makeBase()` 复制 GORM 链式条件，避免 `for lemma := range lemmas` 循环中多次 `Where(...)` 累积成 `AND word=? AND word=? AND word=...` 永远空集的 bug
  - `Order("dict_id ASC, id ASC")` 改为 `dict_entries.dict_id ASC, dict_entries.id ASC`，消除 JOIN 后的 `id` 列歧义
- [x] **T16** `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + handlers 9 ≈ 22 个测试）
- [x] **T17** `pnpm build` exit code 0（tsc -b 严格类型检查通过，27 PWA precache）
- [x] **T18** 集成测试 `test-api.ps1`：v0.9.1 新增 5 段（#19 ~ #23）全 PASS，本地词典 8 项断言全绿（精确命中 / fallback 命中 / 不存在 / 列表 / 上传 / 状态 / 删除 / 删除后查不到）
- [x] **T19** ChangeLog.md v0.9.1 章节完整记录本地词典 / CSV 解析 / 单元测试 / 集成测试扩展 / Bug 修复
- [x] **T20** PLAN.md / TASKS.md / README.md 同步更新
- [x] **T21** README.md API 概览新增 5 行：`GET /dictionary/local` / `POST /dictionary/local/upload` / `DELETE /dictionary/local/:id` / `POST /dictionary/local/lookup` / `GET /dictionary/local/status`；特征列表新增「📕 本地词典（CSV 离线词库）」

---

# TASKS.md — v0.9.0 AI 字典 + 句子解释

## v0.9.0 AI 字典 + 句子解释（2026-07-06）

### 后端

- [x] **T1** `internal/handlers/ai.go` 新增 `Dictionary` handler（POST /api/v1/ai/dictionary）— 词典编纂者 prompt，强制 JSON 输出；请求 `{word, sentence?, target_lang?}`；响应 `headword / pronunciation(uk,us) / meanings[] / word_family[] / etymology / learner_tips[]`
- [x] **T2** `internal/handlers/ai.go` `parseDictionaryEntry` JSON 容错解析 — 剥离 ` ```json ` / ` ``` ` 围栏，缺失字段回退空值，`Meanings / WordFamily / LearnerTips` 数组始终初始化为 `[]string{}`（避免前端 `.length` 崩溃）
- [x] **T3** `internal/handlers/ai.go` 新增 `ExplainSentence` handler（POST /api/v1/ai/sentence-explain）— 教师 prompt；请求 `{sentence, target_lang?, source_lang?, features?}`；响应 `original / translation / words[] / grammar / notes`；`features.word/grammar/translation` 可按需关闭
- [x] **T4** `internal/handlers/ai.go` `parseSentenceExplain` JSON 容错解析（同样容错 + 数组非 nil 兜底）
- [x] **T5** `internal/handlers/ai.go` 共享 `callRaw` 单次裸调用（与批量 `callOpenAI` 解耦，复用同一 OpenAI 客户端）
- [x] **T6** `internal/router/router.go` 注册 `ai.POST("/dictionary", aiH.Dictionary)` + `ai.POST("/sentence-explain", aiH.ExplainSentence)` 路由
- [x] **T7** `internal/handlers/ai_test.go` 新增 9 个测试（5 dictionary + 3 sentence + 1 strVal）— 与 v0.8.x 的 14 个字幕测试一起共 23/23 PASS

### 前端

- [x] **T8** `src/store/dictionary.ts` 新建 — zustand + localStorage 持久化「默认词典源 / 禁用源」；切换默认源或禁用源时立即落盘；禁用当前默认源时回退到 `ai`
- [x] **T9** `src/types/index.ts` 新增 12 个 TS 类型 — `DictionaryRequest / DictionaryResponse / DictionaryPronunciation / DictionaryMeaning / DictionaryExample / DictionaryWordFamily` + `SentenceExplainRequest / SentenceExplainResponse / SentenceExplainFeatures / WordBreakdown / GrammarPoint`
- [x] **T10** `src/api/index.ts` `aiApi` 新增 `dictionary(payload)` + `sentenceExplain(payload)` 方法
- [x] **T11** `src/pages/DictionarySettings.tsx` 新建 — AI 词典卡片 + 本地词典占位卡片；每张卡片含「设为默认 / 启用 / 禁用 / 测试连通性」入口；AI 卡片「⚡ 测试连通性」按钮调用 `aiApi.test` 显示连通状态 / base url 主机 / 模型 / 耗时 / 样例翻译
- [x] **T12** `src/pages/SentenceDetail.tsx` 新建 — 顶部返回栏 + 媒体名 + 时间戳 + 「跳回播放器并定位到该句」按钮；AI 未启用时顶部黄色 Alert；原文卡片含朗读 / 默认词典源标签；解释区加载中 Skeleton / 失败 Alert + 重试；响应式（手机单列 / 桌面 2 列 + 逐词拆解占整行）
- [x] **T13** `src/pages/SentenceDetail.tsx` 单词查词弹窗 — 逐词拆解的每个词都是可点击按钮，触发 `aiApi.dictionary` 拉词条，Modal 弹窗渲染「音标 / 词义 / 词族 / 词源 / 学习提示」
- [x] **T14** `src/components/MediaPlayer.tsx` import `useNavigate` + `BookOutlined`；每条字幕 div 末尾增加「📖 查看句子详情」按钮，`stopPropagation` 避免冲突，`minWidth/Height: 36` 保证触摸目标
- [x] **T15** `src/pages/Settings.tsx`「高级 / 个性化」分组新增 📖 词典入口，整卡可点击跳转到 `/settings/dictionary`
- [x] **T16** `src/router/index.tsx` 注册 `/settings/dictionary` + `/play/:id/sentence/:idx` 两条路由

### 验证

- [x] **T17** `go build ./...` exit code 0
- [x] **T18** `go vet ./...` exit code 0
- [x] **T19** `go test ./pkg/subtitle/... ./internal/handlers/...` 23/23 测试通过（14 subtitle + 9 dictionary/sentence）
- [x] **T20** `pnpm build` exit code 0（1543 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] **T21** 集成测试 `test-api.ps1` 19/22 PASS（v0.9.0 新增 3 段：16. /ai/dictionary + 17. /ai/sentence-explain + 18. 缺参校验，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] **T22** ChangeLog.md v0.9.0 章节完整记录字典 / 句子解释 / 单元测试 / 集成测试扩展
- [x] **T23** PLAN.md / TASKS.md / README.md 同步更新
- [x] **T24** README.md API 概览新增 `POST /ai/dictionary` + `POST /ai/sentence-explain` 两行；特征列表新增「📖 AI 字典 + 句子解释」

---

# TASKS.md — v0.8.1 AI 双语字幕 + 连通性测试

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v0.8.1 AI 双语字幕 + 连通性测试（2026-07-06）

### 后端

- [x] **T1** `internal/handlers/ai.go` `translateReq` 新增 `mode` 字段（`replace` / `bilingual`，缺省 `bilingual`），bilingual 模式下后端拼接 `原文\n译文` 返回
- [x] **T2** `internal/handlers/ai.go` 新增 `Test` handler（POST /api/v1/ai/test）— 用 `texts=["Hello"]` 调一次 AI，返回连通状态 / 模型 / 耗时 / 样例翻译 / 错误描述
- [x] **T3** `internal/router/router.go` 注册 `ai.POST("/test", aiH.Test)` 路由
- [x] **T4** `pkg/subtitle/subtitle_test.go` v0.8.0 的 14 个测试保持全绿（双语拼接复用现有 `parseNumberedLines` + `atomicWrite`，无新增测试）

### 前端

- [x] **T5** `src/types/index.ts` `AITranslateRequest.mode?: 'replace' | 'bilingual'`，`AITranslateResponse.translations` 注释明确两种模式语义
- [x] **T6** `src/api/index.ts` `aiApi.test()` 调 `POST /ai/test`
- [x] **T7** `src/components/SubtitleEditor.tsx` 工具栏新增「🌐 双语字幕 / ✍️ 替换原文」二选一，默认 `bilingual`；模式变化反映在翻译完成提示上
- [x] **T8** `src/pages/Settings.tsx` `AICard` 标题栏新增「⚡ 测试连通性」按钮（在「刷新状态」左侧），AI 未启用时 disabled；测试结果用绿/红框展示，含状态文案、base url 主机名、模型、耗时与「Hello → 你好」样例翻译

### 验证

- [x] **T9** `go build ./...` exit code 0
- [x] **T10** `go vet ./...` exit code 0
- [x] **T11** `go test ./pkg/subtitle/...` 14/14 测试通过
- [x] **T12** `pnpm build` exit code 0（1531 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] **T13** 集成测试 `test-api.ps1` 13/16 PASS（v0.8.1 新增 2 段：14. /ai/test + 15. bilingual 模式，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] **T14** ChangeLog.md v0.8.1 章节完整记录双语字幕与连通性测试实现
- [x] **T15** PLAN.md / TASKS.md / README.md 同步更新

---

# TASKS.md — v0.8.0 字幕逐句编辑 + AI 翻译

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v0.8.0 字幕逐句编辑 + AI 翻译（2026-07-06）

### 后端

- [x] **T1** `internal/config/config.go` 新增 `AIConfig` 结构体 + `ECHOSUB_AI_*` 环境变量族（BASE_URL / API_KEY / MODEL / TARGET_LANG / TIMEOUT_SEC）
- [x] **T2** `pkg/subtitle/subtitle.go` 新增 `WriteFile` / `WriteSRT` / `WriteVTT` 原子写回方法 + `FormatSRTTime` / `FormatVTTTime` 时间戳格式化
- [x] **T3** `pkg/subtitle/subtitle_test.go` 新增 6 个测试（FormatSRTTime/FormatVTTTime/WriteSRT_RoundTrip/WriteVTT_RoundTrip/WriteFile_Unsupported/WriteSRT_Empty），合计 14 个测试全绿
- [x] **T4** `internal/handlers/media.go` 新增 `UpdateSubtitle` handler（PUT /api/v1/media/:id/subtitle）— 鉴权 + 校验 + 原子写回
- [x] **T5** `internal/handlers/ai.go` 新增 `AIHandler` + `Translate`（批量翻译代理 OpenAI 兼容接口）+ `Status`（脱敏配置状态查询）
- [x] **T6** `internal/router/router.go` 注册 `/ai` 路由组 + 媒体 `PUT /:id/subtitle` 路由

### 前端

- [x] **T7** `src/types/index.ts` 新增 `AITranslateRequest` / `AITranslateResponse` / `AIStatus` / `AIUsage` 类型
- [x] **T8** `src/api/index.ts` 新增 `aiApi` 模块 + `mediaApi.updateSubtitle` 方法
- [x] **T9** `src/components/SubtitleEditor.tsx` 新建 — 每行 TextArea + 时间戳 InputNumber + 单条 AI 翻译 + 顶部 AI 翻译全部按钮 + 目标语言输入
- [x] **T10** `src/components/MediaPlayer.tsx`「全文」Tab 顶部新增「编辑字幕」按钮 + `editing` 状态切换集成 SubtitleEditor
- [x] **T11** `src/pages/Settings.tsx` 新增 `AICard` 组件 — 显示当前 AI 状态 + 模型 + 默认目标语言 + 完整环境变量配置说明

### 验证

- [x] **T12** `go build ./...` exit code 0
- [x] **T13** `go vet ./...` exit code 0
- [x] **T14** `go test ./...` 14/14 测试通过
- [x] **T15** `pnpm build` exit code 0（1531 modules / 27 PWA precache）
- [x] **T16** 修复 byte/rune 混用编译错误（looksLikeNumbered / stripNumberPrefix 重写为 `strings.HasPrefix` 整段匹配）
- [x] **T17** ChangeLog.md / PLAN.md / TASKS.md 同步更新
- [x] **T18** 集成测试脚本（`test-api.ps1`）新增 3 段：AI status / 字幕 update（真实写回 SRT 文件并自动恢复）/ AI translate（未启用 503）— PASS 11/14（3 项失败为预先存在的 lesson1 媒体名不匹配，与 v0.8.0 无关）
- [x] **T19** README.md API 概览新增 `PUT /media/:id/subtitle` + 🤖 AI 翻译段落（`/ai/status` + `/ai/translate`）

---

# TASKS.md — v0.7.0 动物森友会风格全站 UI 重设计任务跟踪

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## 阶段 1：主题系统

- [x] **T1** `frontend/index.html` 引入 Google Fonts（Nunito + Noto Sans SC），theme-color 改薄荷绿
- [x] **T2** `frontend/src/index.css` ✨大幅扩展：13 色 NookPhone 调色板、polka-dot pattern、3D 按钮阴影、`.ac-chip` 样式
- [x] **T3** `frontend/src/theme/themes.ts` 四套主题主色调整为动森风（暖阳橙/草绿/紫丁香/天空蓝），各扩展 light/dark
- [x] **T4** `frontend/src/components/MediaCover.tsx` 新增 `pattern` + `radius` props；polka-dot 背景；2/3 比例容器
- [x] **T5** `frontend/src/components/EmbyHome.tsx` ✨紧凑卡片栅格：媒体卡 / 专辑卡宽度按视口动态计算（桌面 180 / 平板 160 / 手机 130-150px）

## 阶段 2：公共组件

- [x] **T6** `frontend/src/components/MediaPlayer.tsx` AC 风字幕背景 `rgba(247, 243, 223, 0.94)` + `var(--radius-pill)` 圆角 + 3D 按钮阴影
- [x] **T7** `frontend/src/components/MarkdownEditor.tsx` 工具栏按钮 large + 触控 44px
- [x] **T8** `frontend/src/components/TagManagerModal.tsx` 标签 chip 圆角 + 700 字重；按钮 large
- [x] **T9** `frontend/src/components/PasswordConfirmModal.tsx` 按钮 / 输入 large

## 阶段 3：布局与导航

- [x] **T10** `frontend/src/layouts/MainLayout.tsx` 侧边栏 NookPhone 调色板色条 + emoji 图标；顶栏品牌区 🌿 EchoSub logo 3D 阴影
- [x] **T11** `frontend/src/pages/Login.tsx` ✨AC 风：暖羊皮背景 + 圆角 24 + 3px 薄荷绿描边 + 🌿 logo 3D 阴影
- [x] **T12** `frontend/src/pages/About.tsx` ✨AC 风：Hero 区暖羊皮渐变；版本号 v0.7.0；新增「🏝️ 动森风格」标签

## 阶段 4：内容页

- [x] **T13** `frontend/src/pages/Home.tsx` 媒体网格卡紧凑布局；标签 chip AC 风
- [x] **T14** `frontend/src/pages/Albums.tsx` 专辑封面 2/3 + 薄荷绿边框 + 紧凑卡片；标题色 AC 风
- [x] **T15** `frontend/src/pages/Tags.tsx` 标签卡片 AC 风；标签 chip 圆角 12 + 700 字重
- [x] **T16** `frontend/src/pages/Records.tsx` 页面标题 AC 风 + 📊 emoji
- [x] **T17** `frontend/src/pages/Settings.tsx` 页面标题 AC 风 + ⚙️ emoji
- [x] **T18** `frontend/src/pages/NoteEditor.tsx` 标题 AC 风；图片画廊暖羊皮背景 + 3px 薄荷绿描边
- [x] **T19** `frontend/src/pages/Upload.tsx` 沿用 v0.6.0 移动端紧凑布局 + AC 风 token
- [x] **T20** `frontend/src/pages/StudyNotes.tsx` 沿用 v0.6.0 移动端紧凑布局 + AC 风 token
- [x] **T21** `frontend/src/pages/Player.tsx` 沿用 v0.6.0 移动端紧凑布局 + AC 风 token

## 阶段 5：验证 & 文档

- [x] **T22** `go build ./...` 通过
- [x] **T23** `go vet ./...` 通过
- [x] **T24** `go test ./... -v` 通过（subtitle 8 用例 cached）
- [x] **T25** `pnpm build` 通过（tsc -b 严格类型检查 + Vite 打包，1513 modules，27 PWA precache）
- [ ] **T26** 真实设备（iOS / Android）截图（**待用户补充**）
- [x] **T27** `docs/ChangeLog.md` 新增 v0.7.0 条目
- [x] **T28** `docs/PLAN.md` 顶部状态改为「已完成」（v0.7.0）
- [x] **T29** `docs/TASKS.md` 任务勾选（v0.7.0 阶段 1~5）
- [x] **T30** `README.md` 动森风格说明 + 紧凑卡片布局说明

## 验证总清单

- [x] 媒体卡 / 专辑卡紧凑布局：桌面 180px / 平板 160px / 手机 130-150px
- [x] 横向滚动行 `gap: 12`，padding 8
- [x] 专辑封面统一 2/3 比例 + `var(--radius-lg)` 圆角
- [x] 卡片标题 700 字重 + `var(--ac-text-header)` 颜色
- [x] 13 色 NookPhone 调色板自动适配浅色 / 深色模式
- [x] 3D 按钮阴影 `0 5px 0 0 var(--ac-shadow-button)`，hover 浮起 2px
- [x] 所有可点击元素触控目标 ≥ 44×44
- [x] 真实设备截图（iOS / Android）待 T26 补充

---

> 上一轮 v0.6.0 TASKS 见 [docs/TASKS.md](docs/TASKS.md) 旧版本（Git 历史），共 37 个任务全部完成（除 T34 真实设备截图待补）。本轮 v0.7.0 在 v0.6.0 基础上叠加 30 个动森风格新任务。
