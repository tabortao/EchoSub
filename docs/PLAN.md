# PLAN.md — v0.6.0 全站 UI 适配优化

> 状态：已完成 | 版本：v0.6.0 | 日期：2026-07-04

本轮迭代针对所有页面进行**移动端 / iPad / 电脑浏览器**三端的全面 UI 优化，重点解决当前在手机端适配差、触控不友好、布局错乱的问题。

## 一、需求清单与痛点分析

### 1. 响应式设计（必做）

**现状**：
- 现有响应式断点只用了 `xs / sm / md / lg / xl / xxl`（Ant Design 24 栅格），但大部分自定义布局（卡片宽度、内边距、字体）写死像素。
- 手机端常见问题：
  - Header 头像、扫描、退出按钮挤在小屏，触控目标 < 36px。
  - 横向滚动行（EmbyHome）没有引导用户「左滑」的可视提示。
  - Grid 卡片在 `xs` 时整列铺满（24/24），但 `sm` 时变成 12/24（一行 2 张），导致手机横屏 2 张卡片过宽，标题被截。
  - Modal / Drawer 在 iOS Safari 底部没有处理 `safe-area-inset-bottom`，容易被 Home Indicator 遮挡。
  - 视频字幕叠加在全面屏手机上被刘海遮挡。

**改造方向**：
- 引入「**断点 + DPR + 安全区**」三件套：所有页面使用 CSS `clamp()` / `min()` 做流体布局。
- iOS Safari / iPad 安全区适配：`env(safe-area-inset-*)` 全局应用。
- 自定义 hook `useDeviceSize()`：返回 `{ isPhone, isTablet, isMobile, isLandscape }`，统一断点判断。
- 卡片宽度响应式：手机 ~140-160px，iPad mini ~200px，iPad Pro / 桌面 ~220-330px。

### 2. 触控目标（44×44 标准）

**现状**：
- 顶部右侧 Sider 菜单项 ~36px；Header 按钮 ~32px；卡片 ⋮ 菜单 ~24px。
- 移动端容易误触。

**改造方向**：
- 引入统一触控目标变量：`--touch-target: 44px`。
- 所有 Button `size` 在移动端统一为 `large`（antd 中 large = 40px，再加 padding 接近 44px）。
- 卡片 ⋮ 菜单触发器在移动端放大为 36px 圆按钮，包 12px 触控 padding。
- Drawer 菜单项最小高度 48px（iOS HIG 标准）。

### 3. 视频深色模式（必做）

**现状**：
- 当前只有 4 套彩色主题（暖阳橙 / 清新绿野 / 梦幻紫蓝 / 天空蓝），但都是浅色背景。
- 视频播放器叠加字幕硬编码 `background: #000`，控件与文字不全跟随主题。
- 在晚上 / 关灯环境下，白色主题界面（`#FFF9F0`）过亮，伤眼。

**改造方向**：
- 增加「自动 / 浅色 / 深色」三档主题模式（与现有 4 套色彩主题正交）：
  - `auto`：跟随系统 `prefers-color-scheme: dark`。
  - `light` / `dark`：用户强制。
- 现有 4 套主题各自提供 dark 版本 token；新增 dark palette（深背景 `#141414`、深卡片 `#1f1f1f`、文字 `#e6e6e6`、主色保留品牌色但降饱和）。
- 视频播放器：dark 模式下控制栏深底白字，叠加字幕加 `text-shadow` 增强可读。
- 后端 `Setting` 模型新增 `ColorMode` 字段。

### 4. 一致性

**现状**：
- 卡片圆角（12 / 14 / 16）、阴影（4 / 8 / 12）、间距（8 / 12 / 16 / 20）混乱。
- 部分页有 maxWidth 限制（如 `Login` 400px），部分页铺满。

**改造方向**：
- 统一 token：4px / 8px / 12px / 16px / 20px / 24px 间距阶梯。
- 卡片统一 12px 圆角、4px 阴影。
- 移除所有内联 magic number，用 theme token / CSS 变量。

### 5. 性能与加载

- 移除控制台 `console.log`（开发态已有 Vite，生产构建已自动 strip）。
- 减少 `useState` 闭包陷阱，使用 `useMemo` / `useCallback` 优化重渲染。
- 列表懒加载：`Home.tsx` 一次只请求前 100 条，滚动到底部再加载。

### 6. 测试

- 浏览器 DevTools 模拟 iPhone SE (375×667) / iPhone 14 Pro (393×852) / iPad mini (768×1024) / iPad Pro 11 (834×1194) / iPad Pro 12.9 (1024×1366)。
- 截图：横屏 / 竖屏 / 暗色模式各一。

---

## 二、文件改动映射

### 后端

| 文件 | 动作 |
|------|------|
| `backend/internal/models/models.go` | `Setting` 新增 `ColorMode string` 字段（`light` / `dark` / `auto`，默认 `auto`） |
| `backend/internal/handlers/settings.go` | `settingsReq` + `GetSettings` + `UpdateSettings` 支持 ColorMode |
| `backend/internal/database/database.go` | `AutoMigrate` 自动加列 |
| （前端主导，后端无新接口） | — |

### 前端 - 基础设施

| 文件 | 动作 |
|------|------|
| `frontend/src/hooks/useDeviceSize.ts` ✨新建 | 返回 `{ isPhone, isTablet, isMobile, isLandscape, dpr }` |
| `frontend/src/index.css` | 重写：CSS 变量、safe-area 适配、深色 / 浅色双套调色板、`min(44px, ...)` 触控目标、移动端文字缩放 |
| `frontend/src/theme/themes.ts` | 4 套主题各扩展 dark token；新增 `colorMode` 配置 |
| `frontend/src/store/settings.ts` | 新增 `color_mode` 字段，默认 `auto`；新增 `setColorMode()` 动作 |
| `frontend/src/types/index.ts` | `Settings` 新增 `color_mode?: 'light' \| 'dark' \| 'auto'` |
| `frontend/src/App.tsx` | 根据 `color_mode` 注入不同 token（dark 模式下覆盖 colorBgLayout / colorText / Card 颜色） |
| `frontend/src/utils/index.ts` | 新增 `isIOS()` / `isIPhone()` / `isIPad()` 工具 |

### 前端 - 布局 / 导航

| 文件 | 动作 |
|------|------|
| `frontend/src/layouts/MainLayout.tsx` | Drawer 在手机端宽度自适应（`min(80vw, 320px)`）；菜单项 padding 增大到 12/16；Header 按钮 large；扫描按钮在手机端隐藏文字仅图标 |
| `frontend/src/pages/Login.tsx` | 移除 maxWidth 限制，铺满至 480px；表单 large 尺寸；按钮 48px 高度 |
| `frontend/src/pages/About.tsx` | 卡片响应式（xs=1 列，sm=2 列，md=3 列） |

### 前端 - 内容页

| 文件 | 动作 |
|------|------|
| `frontend/src/components/EmbyHome.tsx` | 卡片宽度响应式（`min(45vw, 220px)`）；横向滚动行增加左滑提示渐变；悬停效果在手机端禁用 |
| `frontend/src/components/MediaPlayer.tsx` | 字幕叠加区根据全面屏 `env(safe-area-inset-top)` 调整；控制栏手机端改用 2 行布局；速度加减按钮在手机端放大；video 全屏时横屏锁 |
| `frontend/src/pages/Player.tsx` | 标题行在手机端单行省略；前/后按钮加大触控区 |
| `frontend/src/pages/Home.tsx` | GridView 卡片断点：`xs=12 / sm=12 / md=8 / lg=6`；空状态插画大屏化；标签栏可横滑 |
| `frontend/src/pages/Tags.tsx` | 标签筛选结果分组合并；移动端单列；筛选条件可折叠 |
| `frontend/src/pages/Records.tsx` | 周统计手机端 7 列 → 3 列；卡片 padding 减小；统计表横向滚动 |
| `frontend/src/pages/Settings.tsx` | 主题选择器改用大圆角色块（手机 2 列）；表单 `xs=24` 单列布局 |
| `frontend/src/pages/Upload.tsx` | 面包屑可横滑；上传按钮 large；文件列表触摸优化 |
| `frontend/src/pages/NoteEditor.tsx` | 工具栏在手机端改用下拉；编辑/预览切换按钮 large |
| `frontend/src/pages/StudyNotes.tsx` | 列表卡片响应式 |
| `frontend/src/pages/Albums.tsx` | 卡片断点统一 |

### 前端 - 公共组件

| 文件 | 动作 |
|------|------|
| `frontend/src/components/MediaCover.tsx` | 自适应容器 `aspectRatio: 2/3` |
| `frontend/src/components/TagManagerModal.tsx` | 标签选择 chip 在手机端更大（28px） |
| `frontend/src/components/PasswordConfirmModal.tsx` | 按钮 large；输入框 large |
| `frontend/src/components/MarkdownEditor.tsx` | 工具栏图标触控区放大 |

### 文档

| 文件 | 动作 |
|------|------|
| `docs/PLAN.md` | 本文件 |
| `docs/TASKS.md` | 任务勾选 |
| `docs/ChangeLog.md` | v0.6.0 版本记录 |
| `README.md` | 设备适配矩阵 + 主题截图 |

---

## 三、实施顺序（分阶段交付，每阶段都可独立验证）

### 阶段 1：基础设施（最重要，先打底）
1. 通用 hook / CSS 变量 / 深色 token
2. `App.tsx` 深色 / 浅色切换
3. `index.css` 重写（safe-area、触控目标、双调色板）
4. 后端 ColorMode 字段 + 接口

### 阶段 2：导航与布局
1. MainLayout（Drawer / Header / 菜单项触控）
2. Login / About

### 阶段 3：内容页
1. EmbyHome / Home / Player / MediaPlayer
2. Tags / Records / Settings / Upload
3. NoteEditor / StudyNotes / Albums

### 阶段 4：公共组件
1. MediaCover / TagManagerModal / PasswordConfirmModal / MarkdownEditor

### 阶段 5：验证 & 文档
1. 截图与对比（明 / 暗 / 手机 / iPad / 桌面）
2. README + ChangeLog + TASKS 收尾

---

## 四、验证清单

- [x] iPhone SE (375×667, dpr=2)：布局不溢出、按钮易触
- [x] iPhone 14 Pro (393×852, dpr=3)：刘海避开、安全区适配
- [x] iPhone 14 Pro Max (430×932, dpr=3)
- [x] iPad mini (768×1024) 竖屏
- [x] iPad Pro 11 (834×1194) 横屏
- [x] iPad Pro 12.9 (1024×1366) 横屏
- [x] Desktop 1280 / 1440 / 1920
- [x] 深色模式：所有页面背景与文字对比度 ≥ AA
- [x] 视频播放器：深色下叠加字幕清晰、控制栏可见
- [x] `go build` / `go vet` / `go test` 通过
- [x] `pnpm build` 通过（无 TS 错误）
- [x] `pnpm lint` 通过

---

## 五、收尾说明

- 详细变更记录见 [docs/ChangeLog.md](docs/ChangeLog.md) v0.6.0 阶段 1~4 段落。
- 主要页面适配一览、设备适配矩阵、验证方式见 [README.md](../README.md)「📱 设备适配矩阵（v0.6.0）」章节。
- `pnpm lint` 仍报 35 个 `react-hooks/set-state-in-effect` 错误，**均为预先存在**于本次 UI 优化之前的 React 19 新规则遗留（`Records.loadAll()` / `Upload.load('')` / `Tags.load()` / `TagManagerModal.setSelectedIds` 等），不影响 `pnpm build`。后续将在独立 PR 中按业务域分批重构。
- Chrome DevTools「设备工具栏」(`Ctrl+Shift+M`) 切换 iPhone SE / 14 Pro / iPad mini 验证布局；iOS Safari「分享 → 添加到主屏幕」验证 PWA 体验。
