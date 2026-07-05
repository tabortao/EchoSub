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
