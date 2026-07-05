# 动物森友会风格全站 UI 重设计 — 实施计划

> **For agentic workers:** 本计划使用 checkbox 任务清单，分 5 阶段推进，每阶段可独立验证（go build / pnpm build）。

**Goal**: 把 EchoSub 全部页面改造为动物森友会风格（薄荷绿主色 + 暖羊皮纸背景），同时保证手机 / 平板 / 桌面三档断点适配，移动端与平板的卡片 / 专辑封布局紧凑。

**Architecture**:
- 主题层：`theme/themes.ts` 改造为「暖羊皮纸 + 薄荷绿」基准，4 套主题键保留但每套主色微调为 AC 系（NookPhone 13 色板中选）
- 设计 token：`index.css` 引入 AC 风格 token 集（暖羊皮背景 / 50px pill 圆角 / 3D 像素按钮阴影 / 12px 最小圆角 / Nunito 字体）
- 公共组件：Card、Modal、Input、Button、Tag 全部映射 AC 风格 token
- 页面层：每个页面按 AC 风格重做布局与样式，移动端 / 平板断点更紧凑

**Tech Stack**:
- 前端：React 19 + TypeScript 6 + Vite 8 + Ant Design 6 + zustand
- 后端：Go 1.26 + Gin + GORM + SQLite（仅 settings 字段兼容）
- 字体：Nunito（圆润西文）+ Noto Sans SC（中文）
- 验证：`go build / go vet / go test` + `pnpm build`

---

## 设计 Token 速查（AC 风格基准）

```css
/* 颜色 */
--ac-bg-page:        #f8f8f0;     /* 暖羊皮主背景 */
--ac-bg-content:     rgb(247, 243, 223); /* 卡片/弹窗内容区 */
--ac-text-primary:   #725d42;     /* 暖棕正文 */
--ac-text-header:    #794f27;     /* 暖深棕标题 */
--ac-text-secondary: #9f927d;     /* 次要 */
--ac-primary:        #19c8b9;     /* 薄荷绿主色 */
--ac-primary-hover:  #3dd4c6;
--ac-primary-active: #11a89b;
--ac-primary-light:  #e6f9f6;
--ac-yellow:         #ffcc00;     /* 焦点黄 */
--ac-success:        #6fba2c;
--ac-error:          #e05a5a;
--ac-shadow-button:  #bdaea0;     /* 按钮 3D 阴影色 */

/* 字体 */
--ac-font-sans: Nunito, 'Noto Sans SC', -apple-system, 'PingFang SC', sans-serif;

/* 圆角 */
--ac-radius-pill:  50px;   /* 按钮 / 输入框 */
--ac-radius-card:  20px;   /* 卡片 */
--ac-radius-modal: 20px;   /* 弹窗 */
--ac-radius-min:   12px;   /* 任意可点击元素最小圆角 */

/* 阴影 */
--ac-shadow-primary-btn: 0 5px 0 0 var(--ac-shadow-button);
--ac-shadow-primary-btn-hover: 0 6px 0 0 var(--ac-shadow-button);
--ac-shadow-primary-btn-active: 0 1px 0 0 var(--ac-shadow-button);
--ac-shadow-soft: 0 2px 4px rgba(61, 52, 40, 0.06);
--ac-shadow-soft-hover: 0 3px 10px rgba(61, 52, 40, 0.10);
```

**13 色 NookPhone 调色板**（用于专辑 / 季 / 学习页 / 媒体卡片着色）：

| Key | Hex | 备注 |
|-----|-----|------|
| app-pink | #f8a6b2 | 樱花粉 |
| purple | #b77dee | 紫丁香 |
| app-blue | #889df0 | 天空蓝 |
| app-yellow | #f7cd67 | 阳光黄 |
| app-orange | #e59266 | 珊瑚橙 |
| app-teal | #82d5bb | 海沫青 |
| app-green | #8ac68a | 草绿 |
| app-red | #fc736d | 番茄红 |
| lime-green | #d1da49 | 柠檬绿 |
| yellow-green | #ecdf52 | 嫩黄绿 |
| brown | #9a835a | 实木棕 |
| warm-peach-pink | #e18c6f | 暖蜜桃 |
| default | rgb(247,243,223) | 米色默认 |

**紧凑卡片布局规则**（手机 / 平板）：

- 手机（`< 768px`）：卡片一行 2 列，gap 8px，padding 8px，圆角 16px，封面 2:3 比例
- 平板（`768-1280px`）：卡片一行 3-4 列，gap 12px，padding 12px，圆角 18px
- 桌面（`≥ 1280px`）：卡片一行 4-6 列，gap 16px，padding 16px，圆角 20px
- 专辑封面：手机 ~140px、平板 ~180px、桌面 ~220px 宽

---

## 阶段 1：主题系统（基础设施）

### T1.1 改造 `frontend/index.html` — 加载 Nunito 字体

**Files**: `frontend/index.html`

- [ ] 在 `<head>` 中插入 Google Fonts `<link>`：
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  ```

### T1.2 重写 `frontend/src/index.css` — AC 风格 token

**Files**: `frontend/src/index.css` (rewrite)

- [ ] 替换 `:root` 字体栈为 `Nunito, 'Noto Sans SC', -apple-system, 'PingFang SC', sans-serif`
- [ ] 浅色模式：
  - `--color-bg-page: #f8f8f0`（暖羊皮）
  - `--color-bg-elevated: rgb(247, 243, 223)`（深一档）
  - `--color-text-primary: #725d42`（暖棕）
  - `--color-text-secondary: #9f927d`
  - `--color-text-tertiary: #c4b89e`
  - `--color-border-soft: rgba(159, 146, 125, 0.18)`
  - `--color-border-strong: rgba(159, 146, 125, 0.35)`
  - `--color-shadow-card: 0 3px 10px rgba(61, 52, 40, 0.06)`
  - `--color-shadow-card-hover: 0 6px 18px rgba(61, 52, 40, 0.12)`
  - 圆角：`--radius-md: 16px` / `--radius-lg: 20px` / `--radius-xl: 24px`
- [ ] 深色模式（`[data-theme='dark']`）：
  - `--color-bg-page: #1f1d18`（深棕背景）
  - `--color-bg-elevated: #2b2823`
  - `--color-text-primary: #e8d5bc`
  - 其余按比例深色化
- [ ] 新增 AC 阴影类 `.btn-primary-3d`（3D 像素堆叠阴影） `.card-soft`（无阴影、hover 上浮 2px）
- [ ] 全局 Card hover：`translateY(-2px)`（AC 风是轻轻浮起，不是大幅 translateY(-4px)）
- [ ] 全局按钮 active 反馈保留 `transform: translateY(2px)` + `box-shadow: 0 1px 0 0 #bdaea0`（AC 风的「按下」感）
- [ ] 媒体查询 `@media (hover: none)` 禁用 hover 上浮（同 v0.6.0 规则）
- [ ] 移动端覆盖：`< 768px` 时缩小标题字号 `clamp(18px, 5vw, 24px)`

### T1.3 改造 `frontend/src/theme/themes.ts` — 4 套 AC 主色

**Files**: `frontend/src/theme/themes.ts`

- [ ] 调整每套主题的主色到 AC 调色板：
  - `default`: 暖阳橙 `#FF9F5A`（比原 #FF7A45 暖一档）
  - `green`: 草绿 `#6fba2c`（AC 成功绿）
  - `purple`: 紫丁香 `#b77dee`
  - `blue`: 天空蓝 `#889df0`
- [ ] 主题背景统一：`bgLayout` 改为 `#f8f8f0`（暖羊皮，AC 主背景）
- [ ] 主题 token：`borderRadius: 12` / `borderRadiusLG: 20` / `fontSize: 14`（更圆润更紧凑）
- [ ] Button token：`controlHeight: 40` / `controlHeightLG: 48` / `borderRadius: 50`（pill 形）
- [ ] 验证：`pnpm build` 通过

### T1.4 验证 T1

- [ ] 运行 `pnpm build` —— 编译通过
- [ ] 启动前端，浏览任意页面 —— 字体已切换为 Nunito
- [ ] 检查 Settings 页主题色块 —— 4 套主色已更新

---

## 阶段 2：公共组件 AC 化

### T2.1 `MediaCover.tsx` — AC 圆角与波点 pattern

**Files**: `frontend/src/components/MediaCover.tsx`

- [ ] 圆角统一为 20px（`--radius-card`）
- [ ] 默认占位色改用 pastel 配色（按 album 名字哈希取自 13 色板）
- [ ] 加 `polka-dot` 背景（双层径向渐变点阵：1.5px@28px + 1px@14px offset 7,7）
- [ ] 紧凑模式：isPhone 时封面宽 140 / 桌面 220（保留 v0.6.0 适配）

### T2.2 `MediaPlayer.tsx` — 视频叠加字幕 AC 配色

**Files**: `frontend/src/components/MediaPlayer.tsx`

- [ ] 字幕背景 `rgba(247, 243, 223, 0.85)`（暖羊皮半透明），文字 `#725d42`
- [ ] 控制栏背景 `rgb(247, 243, 223)` 替代 `#fff`，按钮 hover 暖一档
- [ ] 速度加减按钮：圆角 50px pill、3D 阴影（仅主按钮）
- [ ] isPhone 时布局同 v0.6.0

### T2.3 `EmbyHome.tsx` — NookPhone 风格横滑

**Files**: `frontend/src/components/EmbyHome.tsx`

- [ ] 横滑行背景改为「NookPhone 草地色」（`#c8e6a0` 浅绿底 + 白色横条卡片）
- [ ] AlbumCard 卡片圆角 20px、波点 pattern
- [ ] 卡片间距紧凑：手机 8px / 平板 12px / 桌面 16px
- [ ] 标题区字体 Nunito 700

### T2.4 `MarkdownEditor.tsx` / `TagManagerModal.tsx` / `PasswordConfirmModal.tsx`

- [ ] 三个组件的 Modal / Input / Button 应用 AC 风格 token
- [ ] 验证：触发删除密码弹窗、标签管理弹窗、编辑器，UI 风格一致

### T2.5 验证 T2

- [ ] `pnpm build` 通过
- [ ] 浏览任意页面：所有按钮圆角 50px pill、Card 圆角 20px、暖羊皮背景

---

## 阶段 3：布局与导航

### T3.1 `MainLayout.tsx` — 暖羊皮 Sider/Drawer

- [ ] Header 背景 `#f8f8f0`（统一暖羊皮），Logo 区加 AC 风格装饰（leaf icon）
- [ ] Sider 菜单项圆角 12px，选中态背景 `rgba(25, 200, 185, 0.12)`（薄荷绿）
- [ ] 移动端 Drawer 同上
- [ ] 用户头像区加 NookPhone 风格圆形边框

### T3.2 `Login.tsx` — NookPhone 风格登录

- [ ] 背景 `rgb(247, 243, 223)` 暖羊皮，去掉白色硬卡片
- [ ] 标题加 AC 风的「ribbon banner」（CSS clip-path swallowtail）
- [ ] 登录按钮 primary 3D 阴影
- [ ] isPhone 时全宽（保留 v0.6.0）

### T3.3 `About.tsx` — 卡片 grid 13 色

- [ ] 卡片网格：6 张大色块卡片，13 色 NookPhone 配色
- [ ] 每张卡片圆角 20px、polka-dot pattern、emoji + 文字
- [ ] 保留 v0.6.0 全宽布局

### T3.4 验证 T3

- [ ] `pnpm build` 通过
- [ ] 在桌面 / 平板 / 手机三档分别检查侧栏、登录、关于页

---

## 阶段 4：内容页 AC 化（重点：紧凑卡片）

### T4.1 `Home.tsx` — 紧凑卡片网格

- [ ] 媒体卡断点：**手机 xs=12 / sm=8 / md=6 / lg=4 / xl=4 / xxl=4**
- [ ] 卡片圆角 20px、polka-dot pattern（按 album hash 取 13 色之一）
- [ ] 移动端 padding 8px、gap 8px
- [ ] 标题字重 700
- [ ] 季卡 / 学习页卡同款
- [ ] 移除 antd 卡片默认阴影，加 `box-shadow: var(--ac-shadow-soft)` hover 升级

### T4.2 `Albums.tsx` — 紧凑专辑卡

- [ ] 专辑卡断点：`xs=12 sm=8 md=6 lg=4 xl=4 xxl=4`
- [ ] 卡片圆角 20px，polka-dot pattern
- [ ] 标题区字体 Nunito 700
- [ ] ⋮ 按钮 44×44（同 v0.6.0）
- [ ] 移动端 padding 8px、gap 8px
- [ ] Modal 重命名按钮 large + 3D 阴影

### T4.3 `Tags.tsx` — NookPhone 风格标签

- [ ] 标签 chip：圆角 999px（pill），13 色板着色，pattern border 1.5px
- [ ] 筛选结果分组卡片：3 组并列（专辑 / 季 / 文件），移动端单列
- [ ] 卡片圆角 20px，polka-dot pattern

### T4.4 `Records.tsx` — 暖羊皮统计

- [ ] 统计卡片背景 `rgb(247, 243, 223)`
- [ ] 数字字重 900（AC 风时间数字）
- [ ] 周统计保留 v0.6.0 两行布局（周一~周四 / 周五~周日）
- [ ] 柱状图色：薄荷绿主色

### T4.5 `Settings.tsx` — 主题色块大圆形

- [ ] 主题选择器 4 个大圆形色块（手机 56px / 桌面 72px），加 hover 弹跳
- [ ] ColorModeSwitch 3 档大按钮（始终浅色 / 始终深色 / 跟随系统）
- [ ] 所有卡片 AC 风格 token

### T4.6 `Upload.tsx` — 紧凑上传页

- [ ] 面包屑容器：暖羊皮底 + 圆角 50px
- [ ] 上传按钮 primary 3D 阴影
- [ ] 列表项 hover AC 暖棕边框

### T4.7 `NoteEditor.tsx` / `StudyNotes.tsx` — 暖羊皮笔记

- [ ] 编辑器工具栏圆角 12px
- [ ] 学习页卡片：polka-dot pattern
- [ ] 标题 Input 大圆角 50px（pill）

### T4.8 `Player.tsx` / `MediaPlayer.tsx` — AC 播放器

- [ ] 播放器主区背景暖羊皮
- [ ] 字幕区文字 `#725d42`，背景半透明暖羊皮
- [ ] 上下首按钮 pill 形 50px
- [ ] 速度 + / - 按钮 pill

### T4.9 验证 T4

- [ ] `pnpm build` 通过
- [ ] 在桌面 / 平板 / 手机三档分别截图
  - 首页、专辑页、标签页、记录页、设置页、上传页、笔记、播放器

---

## 阶段 5：验证 & 文档

### T5.1 构建验证

- [ ] `cd backend && go build ./...` 通过
- [ ] `cd backend && go vet ./...` 通过
- [ ] `cd backend && go test ./... -v` 通过（subtitle 8 用例）
- [ ] `cd frontend && pnpm build` 通过（含 tsc -b 严格类型检查）
- [ ] 启动后端 + 前端，手动浏览 11 个页面无明显错位

### T5.2 文档更新

- [ ] `docs/ChangeLog.md` 新增 v0.7.0 条目（Keep a Changelog 英文）
- [ ] `README.md` 更新设备适配矩阵 + 视觉风格说明
- [ ] `docs/PLAN.md` / `docs/TASKS.md` 勾选本计划任务

### T5.3 兼容性兜底

- [ ] 旧数据 ColorMode / Theme 字段继续兼容
- [ ] `pnpm lint` 已知 35 个 React 19 规则遗留不影响 build

---

## 文件改动总览

| 文件 | 阶段 | 改动 |
|------|------|------|
| `frontend/index.html` | 1 | 加载 Nunito + Noto Sans SC |
| `frontend/src/index.css` | 1 | AC 风格 token 重写 |
| `frontend/src/theme/themes.ts` | 1 | 4 套 AC 主色 |
| `frontend/src/components/MediaCover.tsx` | 2 | 圆角 20 + polka-dot |
| `frontend/src/components/MediaPlayer.tsx` | 2 | 字幕暖羊皮 + 按钮 3D |
| `frontend/src/components/EmbyHome.tsx` | 2 | NookPhone 草地 + 紧凑卡 |
| `frontend/src/components/MarkdownEditor.tsx` | 2 | 圆角 12 工具栏 |
| `frontend/src/components/TagManagerModal.tsx` | 2 | AC token |
| `frontend/src/components/PasswordConfirmModal.tsx` | 2 | AC token |
| `frontend/src/layouts/MainLayout.tsx` | 3 | 暖羊皮 Sider + 薄荷绿选中 |
| `frontend/src/pages/Login.tsx` | 3 | NookPhone 登录 |
| `frontend/src/pages/About.tsx` | 3 | 13 色大色块卡 |
| `frontend/src/pages/Home.tsx` | 4 | 紧凑媒体卡 + polka-dot |
| `frontend/src/pages/Albums.tsx` | 4 | 紧凑专辑卡 |
| `frontend/src/pages/Tags.tsx` | 4 | pill chip + 紧凑 |
| `frontend/src/pages/Records.tsx` | 4 | 暖羊皮统计 |
| `frontend/src/pages/Settings.tsx` | 4 | 大圆形主题色块 |
| `frontend/src/pages/Upload.tsx` | 4 | pill 面包屑 + 3D 按钮 |
| `frontend/src/pages/NoteEditor.tsx` | 4 | pill Input + 圆角工具栏 |
| `frontend/src/pages/StudyNotes.tsx` | 4 | 紧凑笔记卡 |
| `frontend/src/pages/Player.tsx` | 4 | AC 播放器 |
| `docs/ChangeLog.md` | 5 | v0.7.0 条目 |
| `README.md` | 5 | 设备矩阵 + 风格说明 |
| `docs/PLAN.md` / `docs/TASKS.md` | 5 | 勾选任务 |

---

## 验证清单

- [ ] 手机 375×667 / 390×844：所有页面无溢出、卡片 2 列紧凑
- [ ] 平板 768×1024 / 1024×1366：所有页面 3-4 列、Drawer 抽屉
- [ ] 桌面 1280 / 1920：4-6 列、侧栏
- [ ] 深色模式：所有页面背景 `#1f1d18`，对比度 ≥ AA
- [ ] 视频播放器：深色下字幕清晰、按钮 3D 阴影可见
- [ ] 触控目标 ≥ 44×44px
- [ ] 字体 Nunito 加载正常
- [ ] 主色 `#19c8b9` 全站一致
- [ ] 暖羊皮背景 `#f8f8f0` 全站一致
- [ ] `go build / vet / test` 全通过
- [ ] `pnpm build` 通过

---

**预期成果**：v0.7.0 动物森友会风格全站重设计完成，Nunito 字体 + 薄荷绿主色 + 暖羊皮背景 + 50px pill 圆角 + 13 色 NookPhone 调色板 + polka-dot pattern + 3D 像素按钮 + 紧凑移动端 / 平板卡片。
