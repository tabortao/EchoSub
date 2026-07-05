# TASKS.md — v0.6.0 全站 UI 适配优化任务跟踪

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## 阶段 1：基础设施

- [x] **T1** `backend/internal/models/models.go` `Setting` 新增 `ColorMode string` 字段（`size:16;default:'auto'`）
- [x] **T2** `backend/internal/handlers/settings.go` `settingsReq` 加 `ColorMode` + 校验（`light`/`dark`/`auto`），GET 兜底
- [x] **T3** `backend/internal/database/database.go` AutoMigrate 自动加列（无需新代码，确认日志）
- [x] **T4** `frontend/src/hooks/useDeviceSize.ts` ✨新建：返回 `{ isPhone, isTablet, isMobile, isLandscape, dpr }`
- [x] **T5** `frontend/src/utils/index.ts` 新增 `isIOS() / isIPhone() / isIPad() / isAndroid()`
- [x] **T6** `frontend/src/types/index.ts` `Settings` 新增 `color_mode?: 'light' | 'dark' | 'auto'`
- [x] **T7** `frontend/src/store/settings.ts` DEFAULTS 加 `color_mode: 'auto'` + `setColorMode()` 动作
- [x] **T8** `frontend/src/theme/themes.ts` 每套主题增加 dark token 版本（`colorBgLayout: #141414`，`colorText: #e6e6e6`）
- [x] **T9** `frontend/src/index.css` 重写：CSS 变量、safe-area-inset、touch-target 变量、双调色板 `data-theme="dark"`
- [x] **T10** `frontend/src/App.tsx` 监听 `color_mode` + 系统主题；按需给 `documentElement` 切换 `data-theme`

## 阶段 2：导航与布局

- [x] **T11** `frontend/src/layouts/MainLayout.tsx`
  - 手机端 Drawer 宽度 `min(80vw, 320px)`；菜单项 padding 12/16
  - Header 按钮 size=large（移动端）；头像 + 扫描 + 退出布局调整
  - 引入 useDeviceSize 决定抽屉 vs sider
- [x] **T12** `frontend/src/pages/Login.tsx` 移除 maxWidth 限制；输入框 / 按钮 large
- [x] **T13** `frontend/src/pages/About.tsx` 卡片响应式（xs=1, sm=2, md=3）

## 阶段 3：内容页

- [x] **T14** `frontend/src/components/EmbyHome.tsx`
  - CARD_WIDTH / ALBUM_CARD_WIDTH 改用响应式 `min(45vw, 220px)`
  - 横向滚动行增加左滑渐变提示（`mask-image`）
  - 触摸设备禁用 hover translateY
- [x] **T15** `frontend/src/components/MediaPlayer.tsx`
  - 视频叠加字幕 safe-area 适配
  - 控制栏手机端改 2 行（播放 / 进度条 / 设置）
  - 速度按钮放大 + 触摸友好
  - 横屏时锁定旋转（可选）
- [x] **T16** `frontend/src/pages/Player.tsx` 标题行单行省略；上/下首按钮触控 44px
- [x] **T17** `frontend/src/pages/Home.tsx` GridView 断点统一；标签栏可横滑；空状态适配
- [x] **T18** `frontend/src/pages/Tags.tsx` 移动端单列；筛选条件可折叠
- [x] **T19** `frontend/src/pages/Records.tsx` 周统计手机 7→3 列；统计表横向滚动
- [x] **T20** `frontend/src/pages/Settings.tsx` 主题选择器大圆角色块；表单单列
- [x] **T21** `frontend/src/pages/Upload.tsx` 面包屑可横滑；按钮 large
- [x] **T22** `frontend/src/pages/NoteEditor.tsx` 工具栏下拉化；按钮 large
- [x] **T23** `frontend/src/pages/StudyNotes.tsx` 列表卡片响应式
- [x] **T24** `frontend/src/pages/Albums.tsx` 卡片断点统一

## 阶段 4：公共组件

- [x] **T25** `frontend/src/components/MediaCover.tsx` 容器 `aspectRatio: 2/3`
- [x] **T26** `frontend/src/components/TagManagerModal.tsx` 标签 chip 放大；按钮 large
- [x] **T27** `frontend/src/components/PasswordConfirmModal.tsx` 按钮 / 输入 large
- [x] **T28** `frontend/src/components/MarkdownEditor.tsx` 工具栏触控 44px

## 阶段 5：验证 & 文档

- [x] **T29** `go build ./...` 通过
- [x] **T30** `go vet ./...` 通过
- [x] **T31** `go test ./... -v` 通过（字幕 8 用例）
- [x] **T32** `pnpm build` 通过（含 tsc -b 严格类型检查）
- [x] **T33** `pnpm lint` 通过（遗留 35 个 `react-hooks/set-state-in-effect` 已记录在 ChangeLog）
- [ ] **T34** 截图：iPhone SE / 14 Pro / iPad mini / 桌面（浅 + 深）（在 Chrome DevTools 中已模拟验证，**实际设备截图待补充**）
- [x] **T35** `README.md` 新增「📱 设备适配矩阵」章节
- [x] **T36** `docs/ChangeLog.md` 新增 v0.6.0 条目（按 Keep a Changelog 英文）
- [x] **T37** `docs/PLAN.md` 顶部状态改为「已完成」

## 验证总清单

- [x] iPhone SE (375×667) 布局不溢出
- [x] iPhone 14 Pro (393×852) 刘海避开
- [x] iPad mini 竖屏 (768×1024) 正常
- [x] iPad Pro 11 横屏 (1194×834) 正常
- [x] 桌面 1280 / 1920 正常
- [x] 深色模式：所有页面背景与文字对比度 ≥ AA
- [x] 视频播放器：深色下叠加字幕清晰
- [x] 所有可点击元素触控目标 ≥ 44×44
