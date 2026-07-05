# PLAN.md — v0.7.0 动物森友会风格全站 UI 重设计

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
