# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### Added

#### 学习页面融入专辑

- **专辑详情页混排**：进入某专辑后，该专辑下的学习页面与音频/视频媒体按更新时间统一排序混排展示（`Home.tsx` 专辑模式 `Promise.all` 并行拉取 `mediaApi.list` 与 `noteApi.list(album)`，合并为 `FeedItem` 联合类型按时间戳降序）。
- **学习页面卡片预览图**：卡片封面使用学习页面的第一张图片（`noteApi.imageUrl`），无图片时显示橙色渐变背景 + `ReadOutlined` 图标占位；左上角 `gold` 色「学习页」Tag 与媒体的 magenta/green 类型 Tag 区分。
- **首页「最近学习页面」区块**：首页（无专辑筛选时）顶部新增最近学习页面区块（最多 6 个），右侧「查看全部」链接到 `/notes` 列表页；与媒体加载解耦的独立 `useEffect`。
- **专辑详情页新建入口**：仅在 `albumFilter` 存在时显示「新建学习页面」按钮，弹窗仅输入标题（专辑固定为当前专辑），创建成功后直接跳转编辑器。
- **NoteEditor 独立路由**：新增 `/notes/:id` 路由，编辑器从 `StudyNotes.tsx` 内部组件提取为独立页面 `NoteEditor.tsx`，通过 URL id 加载笔记，支持直接 URL 访问与浏览器后退；返回按钮 `navigate(-1)`，无历史栈时兜底回首页。

### Changed

- **移除左侧导航栏「学习页面」入口**：学习页面不再作为独立导航项，改为通过专辑详情页混排和首页「最近学习页面」区块进入（`/notes` 列表页路由保留，作为「查看全部」入口）。
- **首页媒体卡片精简**：卡片信息精简为「文件名 + 专辑/子专辑 Tag + 紫色标签」，移除时长、播放进度条、相对时间、标签管理按钮（标签管理功能保留在播放页/标签页）。
- **统一卡片网格断点**：`Home.tsx`、`Albums.tsx`、`StudyNotes.tsx` 的 `<Col>` 断点统一为 `xs={24} sm={12} md={8} lg={6} xl={6} xxl={4}`（桌面每行 4 个、超宽屏 6 个），避免大屏过密。
- **移除页面宽度限制**：删除 `index.css` 中 `#root` 的 `width:1126px` / `margin:0 auto` / `text-align:center` / `border-inline` 等 Vite 模板残留，内容铺满浏览器宽度。

### Fixed

#### TTS 朗读不再念 Markdown 符号

- 新增 `frontend/src/utils/index.ts` 的 `markdownToPlainText(md)` 工具函数，按「块级→行内」顺序处理：代码块整体移除、HTML 标签移除、图片保留 alt、链接保留文本、水平线/标题/引用/列表前缀移除、表格分隔符处理、行内代码去反引号、粗体斜体去标记、HTML 实体还原、空白折叠。
- `NoteEditor.tsx` 的 TTS `handleTTS` 由直接朗读 `content` 原文改为 `markdownToPlainText(content).trim()`，避免念出 `#`、`-`、`>`、`**`、`` ` `` 等符号。

## [v0.2.0] - 2026-07-02

### Added

#### Sub-albums (nested folder support)

- **Backend**: `MediaFile.SubAlbum` field derived from the second path segment under the media root (e.g. `media_root/English/Unit1.mp3` -> album=`English`, sub_album=`Unit1`). `scanner.upsertMedia` populates the field; `ListMedia` accepts a `sub_album` query filter; `ListAlbums` now returns each album with a `sub_albums: [{sub_album, count}]` array.
- **Frontend**: `Home.tsx` shows a sub-album filter dropdown (visible only when the selected album has sub-albums) and a `cyan` sub-album tag on media cards. `Albums.tsx` renders sub-album tags inside each album card; clicking a sub-album navigates to `/?album=...&sub_album=...`. Types `MediaFile.sub_album` and `Album.sub_albums` added.

#### Sentence favorites (focus listening)

- **Backend**: `SentenceProgress.Favorited` boolean field; `POST /records/:mediaId/sentences/:idx/favorite` toggles it; `GetSubtitle` returns `favorited` per sentence.
- **Frontend**: `MediaPlayer.tsx` renders a star toggle on every subtitle row (calls `recordApi.toggleFavorite`, optimistic update with rollback on error). Subtitle area is now a `Tabs` with "全部字幕" (all) and "收藏句子" (favorites) panes; the favorites pane lists only favorited sentences with a count badge and click-to-jump playback.

#### Study notes (custom learning pages)

- **Backend**: new `StudyNote` model (`id, user_id, album, title, content:text, images:text(JSON), timestamps, soft-delete`). Full CRUD under `/notes`: `GET /notes?album=`, `POST /notes`, `GET/PUT/DELETE /notes/:id`. Image endpoints: `POST /notes/:id/images` (multipart multi-file, dedup by name), `DELETE /notes/:id/images/:filename`, `GET /notes/:id/images/:filename` (auth-gated, `?token=` supported). Images stored under `data/note-images/<note_id>/`.
- **Frontend**: new `StudyNotes.tsx` page (route `/notes`, menu entry "学习页面"). Album-scoped list with create modal; editor view with inline title editing, Markdown preview/edit toggle (default preview via `react-markdown` + `remark-gfm`, edit shows raw textarea), multi-image gallery (prev/next buttons, thumbnail strip, click-to-fullscreen via antd `Image` preview, per-image delete), and a TTS read-aloud button that calls the VoiceCraft API (`https://tts.wangwangit.com/v1/audio/speech`, voice `en-US-JennyNeural`) and plays the returned audio blob.
- **Dependencies**: `react-markdown@10.1.0`, `remark-gfm@4.0.1`.

#### Playback UX refinements

- **Default loop count** raised from 1 to 3 (`store/settings.ts` `DEFAULTS.loop_count` and `MediaPlayer` fallback).
- **Play count display**: `MediaPlayer` accepts a `playCount` prop and shows a "已听 N 遍" tag in the control bar; each subtitle row shows a "听 N 遍" tag when `repeat_count > 0`.
- **Fine-grained playback speed**: replaced the fixed `Select` with `+`/`-` circle buttons in 0.1 steps over the 0.5-2.0 range, with floating-point rounding to avoid drift; current rate shown as `N.Nx`.
- **Player header**: back button moved to the right of the title row (icon-only, no "返回" text); the "name · duration" subtitle line below the title was removed to save vertical space.

#### Wide-screen layout

- `Home.tsx` and `Albums.tsx` card grid breakpoints extended with `xl={4} xxl={3}` so wide desktops show more columns per row with less side whitespace; filter row columns also widened (`lg`/`xl` spans).

### Changed

- `frontend/src/types/index.ts`: `Sentence` gains `favorited: boolean`; `MediaFile` gains `sub_album: string | null`; new `SubAlbum` interface and `StudyNote` interface.
- `frontend/src/api/index.ts`: `recordApi.toggleFavorite` added; `mediaApi.list` accepts `sub_album`; new `noteApi` module (list/create/get/update/delete/uploadImages/deleteImage/imageUrl).
- `backend/internal/router/router.go`: registered the favorite toggle route and the full `/notes` route group.

## [v0.1.0] - 2026-07-02

### 新增

#### 后端 (Go 1.26 + Gin + GORM + SQLite)

- **项目骨架**: `backend/` 模块，导入路径为 `github.com/yaole/EchoSub/backend`，分层结构为 `cmd/server`、`internal/{config,database,handlers,middleware,models,router,scanner,utils}` 和 `pkg/subtitle`。
- **配置加载器** (`internal/config/config.go`): 优先从环境变量读取，其次从 `config.yaml` 读取，具有合理的默认值（端口 `8080`、数据库 `data/echosub.db`、JWT 密钥、媒体目录 `/media`）。支持的媒体扩展名：视频 `.mp4/.mkv/.mov/.webm/.avi`，音频 `.mp3/.m4a/.aac/.wav/.flac/.ogg`，字幕 `.srt/.vtt`。
- **GORM 模型** (`internal/models/models.go`): `User`、`MediaFile`（与 `Tags` 多对多关联）、`Tag`（用户作用域）、`PlayRecord`、`SentenceProgress`、`Setting`。`MediaFile.Album` 可为空，用于表示独立资源。
- **数据库启动** (`internal/database/database.go`): 通过 `glebarez/sqlite`（纯 Go，无 CGO）使用 SQLite，WAL 模式，`busy_timeout=5000`，单写连接，为所有模型执行 `AutoMigrate`。
- **JWT 中间件** (`internal/middleware/auth.go`): 使用 `golang-jwt/jwt/v5` 实现 `GenerateToken` / `ParseToken` / `AuthRequired`；`GetUserID` 从 `gin.Context` 提取用户 ID。密码使用 bcrypt 哈希。
- **媒体扫描器** (`internal/scanner/scanner.go`): `ScanFull` 全量扫描加上基于 `fsnotify` 的 `StartWatcher` 增量监听 `Create/Write/Rename` 事件；`upsertMedia` 以绝对路径为键；`findSubtitle` 在同一目录中查找同名 `.srt/.vtt`；专辑名称从媒体根目录下的第一个路径段派生。
- **字幕解析器** (`pkg/subtitle/subtitle.go`): `ParseFile` / `ParseSRT` / `ParseVTT` 返回统一的 `Sentence{Index,Start,End,Text}`。时间范围正则覆盖 `HH:MM:SS,mmm`、`MM:SS,mmm` 和 `SS,mmm`，支持 `,` 或 `.` 分隔符。
- **认证 API** (`internal/handlers/auth.go`): `POST /api/v1/auth/register`、`POST /api/v1/auth/login`、`GET /api/v1/auth/me`。
- **媒体 API** (`internal/handlers/media.go`): `GET /media`（分页，可按 `album/type/keyword/tag_id` 筛选，可排序）、`GET /media/:id`、`GET /media/:id/stream`（支持 HTTP Range，在 `c.File` 前设置 `Content-Type`）、`GET /media/:id/subtitle`（解析的字句及每用户进度）、`GET /albums`。
- **标签 API** (`internal/handlers/tag.go`): CRUD 及 `POST /media/:id/tags` 覆盖式分配。
- **记录 API** (`internal/handlers/record.go`): `PUT /records/:mediaId`、`GET /records`、`GET /records/:mediaId`、`PUT /records/:mediaId/sentences/:idx`、`GET /progress`（按专辑/标签聚合）。
- **扫描 API** (`internal/handlers/scan.go`): `POST /scan/trigger`、`GET /scan/status`。
- **设置 API** (`internal/handlers/settings.go`): `GET /settings`、`PUT /settings`（每用户键值对）。
- **路由** (`internal/router/router.go`): 公开 `/auth/register`、`/auth/login`、`/health`；JWT 保护 `/media`、`/albums`、`/tags`、`/records`、`/progress`、`/settings`、`/scan`。
- **入口** (`cmd/server/main.go`): 启动配置、数据库、扫描器监听、路由；从 `frontend/dist` 提供前端 SPA 并支持 SPA 回退。
- **示例配置** (`backend/config.example.yaml`)。

#### 前端 (React 19 + TypeScript 6 + Vite 8 + Ant Design 6)

- **工具链**: Vite 配置，`@` → `./src` 别名，`/api` 代理到 `localhost:8080`；`tsconfig.app.json` 使用 `paths` 而不使用已弃用的 `baseUrl`（兼容 TS 6.0）。
- **类型** (`src/types/index.ts`): 完整的 TypeScript 定义，与后端 DTO 对应。
- **API 客户端** (`src/api/`): axios 实例，附带 JWT 和 401 重定向拦截器；`authApi`/`mediaApi`/`tagApi`/`recordApi`/`settingsApi`/`scanApi`。
- **状态** (`src/store/`): `zustand` 存储，用于 `auth`（localStorage 持久化的令牌/用户）和 `settings`。
- **路由** (`src/router/index.tsx`): `ProtectedRoute` 包装器，支持懒加载页面。
- **布局** (`src/layouts/MainLayout.tsx`): Ant Design 侧边栏 + 头部外壳。
- **页面**:
  - `Login.tsx`: 登录/注册标签页，带表单验证。
  - `Home.tsx`: 媒体卡片网格，支持关键词搜索、类型筛选、排序、专辑/标签下钻、播放进度预览。
  - `Albums.tsx`: 专辑网格，显示数量。
  - `Tags.tsx`: 标签 CRUD，显示使用次数。
  - `Records.tsx`: 学习统计、表格和进度条。
  - `Settings.tsx`: 学习偏好表单（重复次数、暂停秒数、循环次数）。
  - `Player.tsx`: 媒体 + 字幕加载器。
- **MediaPlayer 组件** (`src/components/MediaPlayer.tsx`): 核心播放器，支持逐句重复（M 次）、句间暂停（K 秒）、整体循环（N 次）、节流进度保存（5 秒）、可点击字幕列表，带当前句高亮和完成标记。使用 refs（`handlingEndRef`、`sentenceRepeatRef`、`overallLoopRef`、`pauseTimerRef`、`modeRef`）避免事件回调中的闭包过期问题。

#### 移动端、PWA 与会话

- **响应式布局**: `MainLayout` 在屏幕小于 `lg` 断点时切换为滑入式 `Drawer` 菜单（头部有汉堡按钮），移动端内边距更紧凑。`Home.tsx` 筛选行在 `xs` 时重排为单列堆叠，`sm` 时为两列。`Login.tsx` 卡片为流式布局（`maxWidth: 400`，`width: 100%`），外 padding 响应式。
- **PWA 支持**: 集成 `vite-plugin-pwa` (1.3.0)，`autoUpdate` 注册，`devOptions.enabled` 用于本地测试，Web App Manifest（`name=EchoSub`、`theme_color=#1677ff`、`display=standalone`、`lang=zh-CN`）。在 `frontend/public/` 下生成 `pwa-192.png` 和 `pwa-512.png` 图标（含 maskable 变体）。`index.html` 添加 `theme-color`、`apple-touch-icon`、`apple-mobile-web-app-capable` 和 `viewport-fit=cover` 视口。`main.tsx` 通过 `virtual:pwa-register` 注册 service worker。
- **Workbox 运行时缓存**: 媒体流请求（`/api/v1/media/:id/stream`）使用 `NetworkOnly` 以保留 Range/令牌语义；其他 `/api/*` 调用使用 `NetworkFirst`，5 秒超时，短期缓存。
- **记住密码**: `Login.tsx` 添加"记住密码"复选框（仅登录标签页）。勾选后，凭据存储在 `localStorage` 的 `echosub_remember` 中，下次访问时预填充。取消勾选则清除该条目。
- **刷新时的会话持久化**: `useAuthStore.getState().hydrate()` 现已在模块加载时调用（`store/auth.ts`），因此 JWT 在 `ProtectedRoute` 渲染前同步恢复——刷新受保护页面不再跳转到 `/login`。

#### 媒体封面与类型徽章

- **后端封面扫描** (`internal/scanner/scanner.go`): 添加 `findCover()`，仿照 `findSubtitle()` 在媒体目录中查找同名图片（`.jpg/.jpeg/.png/.webp`）。`upsertMedia` 现填充 `MediaFile.CoverPath`（该字段在模型中已存在但之前未填充）。`MediaConfig` 新增 `SupportedImages`
