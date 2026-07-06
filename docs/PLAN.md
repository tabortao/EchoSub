# PLAN.md — EchoSub 开发计划

> 状态：v0.9.1 本地词典 已完成 | 日期：2026-07-06

## 活跃里程碑：v0.9.1 本地词典（2026-07-06 完成）

继 v0.9.0 引入 AI 词典后，本轮补全「本地词典」数据源，让用户上传自己的 CSV 词库即可离线查词（零 token 消耗）。设计上仍遵循 v0.9.0 参考的 Echo Loop `DictionarySource` 抽象，前端 store 早就预留了 `id='local'`，本次让后端真正落地。

详见 [ChangeLog v0.9.1](ChangeLog.md#v091---2026-07-06) 与 [TASKS.md v0.9.1 段](TASKS.md)。

### 交付内容
- **数据模型** — `LocalDictionary`（词典元数据：name/description/file_name/size_bytes/entry_count/source_lang/target_lang/软删除）与 `DictEntry`（dict_id/word/phonetic/translation + 联合索引 `(dict_id, word)`）两张表，AutoMigrate + 软删除
- **CSV 解析器** ([pkg/dictcsv/dictcsv.go](backend/pkg/dictcsv/dictcsv.go))：兼容多种表头列名（word/term/lemma/headword + phonetic/ipa/pronunciation + translation/definition/meaning/gloss），空行 / 引号容错，同 word 去重；`Lemmas(word)` 简单词形 fallback（剥离 ing/ed/s/es/er/est/ly 等后缀）
- **后端接口**（[handlers/local_dict.go](backend/internal/handlers/local_dict.go)）
  - `GET /api/v1/dictionary/local` — 列出已上传词典
  - `POST /api/v1/dictionary/local/upload` — multipart 上传 CSV → 事务写库（每 1000 条一批），单本最大 50 MiB
  - `DELETE /api/v1/dictionary/local/:id` — 软删除词典
  - `POST /api/v1/dictionary/local/lookup` — 精确匹配 + 词形 fallback，返回 `matched_by: "exact" | "lemma:<原形>"`
  - `GET /api/v1/dictionary/local/status` — 词典系统总状态
- **路由注册**（[router/router.go](backend/internal/router/router.go)）：authed 组下新增 `/dictionary` 子路由
- **CSV 解析单测** — 5 个测试用例（基础 / 表头列名 / 空行非法 / 真实 10 行 / 词形 fallback），全部 PASS
- **前端 API + Store** — `localDictApi.{list,status,upload,remove,lookup}` 五个方法；`useDictionaryStore` 扩展 `localDicts` / `preferLocalHit`（持久化偏好，默认 true）
- **前端词典设置页** — 新增「本地词典」管理卡：Dragger 上传 / 列表 / 统计 / 删除二次确认 / 进度条 / 刷新按钮；新增「默认词典源」单选卡
- **句子详情页查词逻辑** — 单词点击优先查本地词典（命中且 `preferLocalHit=true` 直接返回；命中且 false 时本地为主 + AI 增强；未命中时 AI 兜底），弹窗按来源分两组展示
- **Bug 修复** — 本地词典级联删除失效（软删除不触发触发器）→ 查词时 `JOIN local_dictionaries ld WHERE ld.deleted_at IS NULL` 显式过滤；GORM 链式条件累积 bug → 工厂函数 `makeBase()` 每次新建查询条件

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + handlers 9 ≈ 22 个测试）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过，27 PWA precache）
- [x] 集成测试 `test-api.ps1`：v0.9.1 新增 5 段（#19 ~ #23）全 PASS，本地词典 8 项断言全绿
- [x] ChangeLog.md / PLAN.md / TASKS.md / README.md 同步更新

---

# 旧版：v0.9.0 AI 字典 + 句子解释（2026-07-06 完成）

参考 `docs/Reference/Echo-Loop` 的 `DictionarySource` 可插拔数据源设计，给 EchoSub 增加「词典」体系，并实现「点击单句进入详情页」的学习闭环。

详见 [ChangeLog v0.9.0](ChangeLog.md#v090---2026-07-06) 与 [TASKS.md v0.9.0 段](TASKS.md)。

### 交付内容
- **AI 字典** — 后端 `POST /api/v1/ai/dictionary`（请求 `{word, sentence?, target_lang?}`，响应 `headword / pronunciation(uk,us) / meanings[] / word_family[] / etymology / learner_tips[]`）；JSON 容错解析（剥离围栏、缺失字段回退空值、数组始终非 nil）；上下文消歧
- **句子解释** — 后端 `POST /api/v1/ai/sentence-explain`（请求 `{sentence, target_lang?, source_lang?, features?}`，响应 `original / translation / words[] / grammar / notes`）；`features.word/grammar/translation` 可按需关闭，prompt 模板按 features 动态拼装
- **字典设置页** — `frontend/src/pages/DictionarySettings.tsx`，AI 词典卡片含「⚡ 测试连通性」按钮（复用 v0.8.1 `aiApi.test`）；zustand + localStorage 持久化默认源 / 禁用源
- **句子详情页** — `frontend/src/pages/SentenceDetail.tsx`，响应式布局（手机单列 / 桌面 2 列 + 逐词拆解占整行）；单词卡片可点击触发 AI 查词弹窗
- **播放器入口** — `MediaPlayer` 每条字幕右侧新增 📖 按钮（`stopPropagation` 避免冲突），点击 `navigate('/play/:id/sentence/:idx')` 跳转
- **设置页入口** — `Settings.tsx`「高级 / 个性化」分组新增 📖 词典入口
- **单测** — 新增 9 个 AI 字典 / 句子解释 JSON 解析测试（v0.8.x = 14 + v0.9.0 新增 9 = 23/23 PASS）
- **集成测试** — `test-api.ps1` 新增 3 段（#16 dictionary / #17 sentence-explain / #18 缺参校验），全部 PASS

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./pkg/subtitle/... ./internal/handlers/...` 23/23 测试通过（14 subtitle + 9 dictionary/sentence）
- [x] `pnpm build` exit code 0（1543 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] 集成测试 `test-api.ps1` 19/22 PASS（v0.9.0 新增 3 段：16. /ai/dictionary + 17. /ai/sentence-explain + 18. 缺参校验，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] ChangeLog.md / PLAN.md / TASKS.md / README.md 同步更新

---

# 旧版：v0.8.1 AI 双语字幕 + 连通性测试（2026-07-06 完成）

> 状态：已完成 | 版本：v0.8.1 | 日期：2026-07-06

详见 [ChangeLog v0.8.1](ChangeLog.md#v081---2026-07-06) 与 [TASKS.md v0.8.1 段](TASKS.md)。

### 交付内容
- **AI 翻译改为「双语字幕」** — 后端 `translateReq` 加 `mode` 字段（`bilingual` 默认 / `replace` 可选），bilingual 模式下后端拼「原文\n译文」返回；前端 SubtitleEditor 工具栏新增「🌐 双语字幕 / ✍️ 替换原文」下拉，默认双语
- **AI 连通性测试** — 后端 `POST /api/v1/ai/test` 用 `texts=["Hello"]` 调一次 AI，返回连通状态 / 模型 / 耗时 / 样例翻译；前端设置页「⚡ 测试连通性」按钮一键验证
- **构建验证** — `go build ./...` / `go vet ./...` / `go test ./pkg/subtitle/...` 14/14 / `pnpm build` 1531 modules / 集成测试 13/16 PASS（v0.8.1 新增 2 段全 PASS）

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./pkg/subtitle/...` 14/14 测试通过
- [x] `pnpm build` exit code 0（1531 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] 集成测试 `test-api.ps1` 13/16 PASS（v0.8.1 新增 2 段：14. /ai/test + 15. bilingual 模式，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] ChangeLog.md / PLAN.md / TASKS.md / README.md 同步更新

---

# 旧版：v0.8.0 字幕逐句编辑 + AI 翻译

---

# 旧版：v0.7.0 动物森友会风格全站 UI 重设计

> 状态：已完成 | 版本：v0.7.0 | 日期：2026-07-05

本轮迭代参考 `docs/Reference/animal-island-ui` 设计稿，将项目整体风格重塑为动森风：暖羊皮纸主背景、薄荷绿主色、圆润 pill 圆角、3D 像素按钮阴影、polka-dot 点阵图案。所有页面与组件统一应用此风格，重点解决移动端/平板端卡片与专辑封面布局紧凑度问题。

## 一、需求清单与痛点分析

### 1. 视觉风格（必做）

**现状**：
- 现有 UI 风格偏向简洁商务风（白底 + 蓝色 + 圆角 12px），缺乏童趣与亲和力。
- 移动端/平板端卡片布局较为松散，没有充分利用屏幕空间。

**改造方向**：
- 暖羊皮纸主背景 `#f8f8f0` + 卡片背景 `rgb(247, 243, 223)`。
- 薄荷绿主色 `#19c8b9`（Nook Inc. 招牌色）。
- 13 色 NookPhone 调色板（pink/purple/blue/green/yellow/orange/red/cyan/brown/beige/mint/lavender/peach）。
- 圆润 pill 圆角（按钮 50px、卡片 20px、chip 12px）。
- 3D 像素按钮阴影：`0 5px 0 0 var(--ac-shadow-button)`，hover 浮起 2px。
- polka-dot 双层径向渐变点阵图案（色块密度 14-28px）。
- 主字体：Nunito + Noto Sans SC。

### 2. 移动端/平板端紧凑卡片布局（必做）

**现状**：
- 媒体卡片宽度在所有断点都使用同一基准（220px），移动端/平板端显得过于松散。
- 横向滚动行 `gap: 16` 偏大，未充分利用屏幕。

**改造方向**：
- 媒体卡 / 专辑卡宽度按视口动态计算：桌面 180px / 平板 160px / 手机 130-150px（`EmbyHome.computeCardWidth`）。
- 横向滚动行 `gap: 12`，padding 8。
- 专辑封面统一 2/3 比例 + `var(--radius-lg)` 圆角。
- 缩略图缩放 96-160px，自适应视口。

### 3. 一致性

**改造方向**：
- 统一 token：
  - 圆角：`--radius-pill: 50px` / `--radius-lg: 20px` / `--radius-md: 12px`
  - 阴影：3D 按钮 `0 5px 0 0 var(--ac-shadow-button)`，卡片 `0 8px 24px rgba(25, 200, 185, 0.12)`
  - 文字色：`--ac-text-header: #794f27` / `--ac-text-secondary: #9f927d`
- 13 色 polka-dot pattern 全部以 `radial-gradient` 双层叠加生成，无外部图片依赖。

### 4. 性能与加载

- 沿用 v0.6.0 已有的 `useMemo` / `useCallback` 优化。
- 13 色 polka-dot 背景全部通过 `radial-gradient` 实时生成，不增加额外资源。

### 5. 测试

- 浏览器 DevTools 模拟 iPhone SE / iPhone 14 Pro / iPad mini / iPad Pro 三档断点。
- 截图：浅色 / 深色 / 手机 / iPad / 桌面各一。

---

## 二、文件改动映射

### 前端 - 主题与基础

| 文件 | 动作 |
|------|------|
| `frontend/index.html` | 引入 Google Fonts（Nunito + Noto Sans SC）；theme-color / msapplication-TileColor 改为薄荷绿 |
| `frontend/src/index.css` ✨大幅扩展 | 新增 AC 风 CSS 变量：13 色 NookPhone 调色板、polka-dot pattern、3D 按钮阴影、`.ac-chip` 样式 |
| `frontend/src/theme/themes.ts` | 四套主题主色调整为动森风（暖阳橙/草绿/紫丁香/天空蓝），各扩展 light/dark |

### 前端 - 公共组件

| 文件 | 动作 |
|------|------|
| `frontend/src/components/MediaCover.tsx` | 新增 `pattern` + `radius` props；默认 `var(--radius-lg)` + 2/3 比例；polka-dot 背景 |
| `frontend/src/components/MediaPlayer.tsx` | 字幕背景 `rgba(247, 243, 223, 0.94)` 暖羊皮纸 + `var(--radius-pill)` + 3D 按钮阴影 |
| `frontend/src/components/EmbyHome.tsx` | 卡片宽度按视口动态计算；横向滚动行 `gap: 12` + 紧凑 padding；polka-dot 专辑封面 |

### 前端 - 布局

| 文件 | 动作 |
|------|------|
| `frontend/src/layouts/MainLayout.tsx` | 侧边栏 NookPhone 调色板色条 + emoji 图标；顶栏品牌区 🌿 EchoSub logo 3D 阴影 |

### 前端 - 内容页

| 文件 | 动作 |
|------|------|
| `frontend/src/pages/Home.tsx` | 媒体网格卡紧凑布局；标签 chip AC 风 |
| `frontend/src/pages/Albums.tsx` | 专辑封面 2/3 + 薄荷绿边框 + 紧凑卡片；标题色 `var(--ac-text-header)` + 800 字重 |
| `frontend/src/pages/Tags.tsx` | 标签卡片 AC 风；标签 chip 圆角 12 + 700 字重 |
| `frontend/src/pages/Records.tsx` | 页面标题 AC 风 + 📊 emoji |
| `frontend/src/pages/Settings.tsx` | 页面标题 AC 风 + ⚙️ emoji |
| `frontend/src/pages/Login.tsx` ✨AC 风 | 暖羊皮背景 + 圆角 24 + 3px 薄荷绿描边 + 🌿 logo 3D 阴影 |
| `frontend/src/pages/About.tsx` ✨AC 风 | Hero 区暖羊皮渐变；版本号 v0.7.0；新增「🏝️ 动森风格」标签 |
| `frontend/src/pages/NoteEditor.tsx` | 标题 AC 风；图片画廊暖羊皮背景 + 3px 薄荷绿描边 |
| `frontend/src/pages/Upload.tsx`、`StudyNotes.tsx`、`Player.tsx` | 沿用 v0.6.0 移动端紧凑布局 + AC 风 token |

### 文档

| 文件 | 动作 |
|------|------|
| `docs/PLAN.md` | 本文件 |
| `docs/TASKS.md` | 任务勾选 |
| `docs/ChangeLog.md` | v0.7.0 版本记录 |
| `README.md` | 动森风格说明 + 紧凑卡片布局说明 |

---

## 三、实施顺序

### 阶段 1：主题系统
1. themes.ts / index.css / index.html AC 风改造
2. 13 色 NookPhone 调色板 + polka-dot pattern

### 阶段 2：公共组件
1. MediaCover — polka-dot 背景 + 圆角
2. MediaPlayer — AC 风字幕 + 3D 阴影
3. EmbyHome — 紧凑卡片栅格
4. MarkdownEditor / TagManagerModal / PasswordConfirmModal — 沿用 v0.6.0 触控目标

### 阶段 3：布局与导航
1. MainLayout — NookPhone 调色板色条
2. Login / About — AC 风独立设计

### 阶段 4：内容页
1. Home / Albums / Tags / Records / Settings
2. Upload / NoteEditor / StudyNotes / Player

### 阶段 5：验证 & 文档
1. go build / pnpm build + 修复
2. ChangeLog v0.7.0 + PLAN.md + TASKS.md + README

---

## 四、验证清单

- [x] `go build ./...` 通过
- [x] `go vet ./...` 通过
- [x] `go test ./... -v` 通过（subtitle 8 用例 cached）
- [x] `pnpm build` 通过（tsc -b 严格类型检查 + Vite 打包，1513 modules，27 PWA precache）
- [x] iPhone SE / 14 Pro 移动端：媒体卡 / 专辑卡紧凑（130-150px）
- [x] iPad mini / iPad Pro 平板端：紧凑布局（160px）
- [x] Desktop 1280+ 桌面端：标准布局（180px+）
- [x] 浅色 / 深色模式：13 色 NookPhone 调色板自动适配

---

## 五、收尾说明

- 详细变更记录见 [docs/ChangeLog.md](docs/ChangeLog.md) v0.7.0 段落。
- 设计 Token 速查、紧凑卡片布局规则、13 色 polka-dot 用途详见 ChangeLog v0.7.0 Notes。
- `pnpm lint` 仍报 35 个 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次 UI 优化之前的 React 19 新规则遗留），不影响 `pnpm build`。后续将在独立 PR 中按业务域分批重构。
- 真实设备（iOS / Android）截图待用户在 T34 任务中手动补充。
- Chrome DevTools「设备工具栏」(`Ctrl+Shift+M`) 切换 iPhone SE / 14 Pro / iPad mini 验证紧凑卡片布局。

---

> 上一轮 v0.6.0 PLAN 见 [docs/PLAN.md](docs/PLAN.md) 旧版本（Git 历史），核心是「全站 UI 适配移动设备 + 深色模式」。本轮 v0.7.0 在 v0.6.0 基础上叠加动森风格设计语言。
