# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### Changed

#### 小学生审美整体美化

- **`App.tsx`**：antd 主题从蓝色 `#1677ff` 改为温暖橙 `#FF7A45`，`borderRadius` 12，`fontSize` 15；Menu/Card/Button 组件级 token 定制（选中态橙色背景、卡片大圆角 16、按钮圆角 10）。
- **`index.css`**：全局背景从纯白改为暖白 `#FFF9F0`；清理 Vite 模板残留（过大 h1、dark mode、紫色 accent 变量）；新增卡片 hover 上浮动画（`translateY(-4px)` + 橙色阴影）、滚动条橙色美化、按钮 active 微缩放触觉反馈。
- **`MainLayout.tsx`**：重写侧边栏为自定义彩色菜单（每项不同颜色图标——首页橙/专辑蓝/标签绿/上传紫/记录粉/设置青），选中态彩色背景块；Logo 改为橙色渐变圆角图标 + 渐变文字；Header 显示当前页 emoji+名称、用户首字母渐变 Avatar。

#### 编辑/删除收进 ⋯ 菜单

- **`Albums.tsx` / `Home.tsx`**：卡片标题区的编辑 ✎ 和删除 🗑 图标收进 `Dropdown` 下拉菜单（⋯ 触发），避免误触。菜单项带 emoji 图标（✏️ 重命名 / 🗑️ 删除），删除项 `danger` 红色高亮。

### Fixed

#### 句末停顿修复

- **前端 `MediaPlayer.tsx`**：修复逐句复读模式下「句末停顿 n 秒」不生效的 bug。原逻辑在重复同一句时直接 `el.currentTime = cur.start` 无停顿，仅切换下一句时才停顿。重构后：句末触发时先 `el.pause()` + `setPlaying(false)`，再用 `setTimeout(pauseSeconds * 1000)` 统一处理停顿，停顿结束后根据情况选择「重复当前句」/「跳下一句」/「整体循环重置」/「全部结束」。现在每读完一遍都会停顿 n 秒。

#### 删除接口 404 修正

- **后端 `handlers/delete.go`**：`DeleteAlbum` 在 `os.RemoveAll` 前先 `os.Stat` 检查目录是否存在，不存在时返回 404（原逻辑因 `os.RemoveAll` 对不存在路径返回 nil 而误报成功 200）。

### Added

#### 媒体与专辑删除

- **后端 `handlers/delete.go`**（新建）：
  - `DELETE /media/:id`：删除单个媒体文件 + 同目录同 basename 的字幕(.srt/.vtt) + 封面图(.jpg/.png/.webp/.gif)，DB 软删除 MediaFile。
  - `DELETE /albums`：请求体 `{album}`，递归删除磁盘目录（含所有媒体/字幕/封面/子目录），DB 批量软删除该专辑下所有 MediaFile，同步删除 StudyNote 及其图片目录。
  - 防路径穿越（`filepath.Base(filepath.Clean(album))`）。
- **前端 `Albums.tsx`**：专辑卡片标题区新增 🗑 删除按钮，二次确认后调用 `mediaApi.deleteAlbum`。
- **前端 `Home.tsx`**：媒体卡片标题区新增 🗑 删除按钮，二次确认后调用 `mediaApi.remove`。
- **前端 `api/index.ts`**：新增 `mediaApi.remove(id)` 和 `mediaApi.deleteAlbum(album)`。

#### 用户数据迁移

- 将 `dev.db` 中的 5 个用户（testuser/demo/demo2/demo3/test）连同密码 hash 迁移到当前正在使用的 `echosub.db`，testuser/testuser123456 恢复正常登录。

### 端到端测试验证

通过自动测试脚本验证：
- ✅ 登录 testuser/testuser123456 成功
- ✅ 列出 4 个专辑 / 8 个媒体
- ✅ 删除不存在专辑返回 404（接口校验正确）
- ✅ 句子听遍数 +1 接口正常
- ✅ **真实删除媒体**：test.mp3 + test.srt + test.jpg 三个文件全部从磁盘删除
- ✅ **真实删除专辑**：整个目录递归删除，files_deleted 计数正确

### Added

#### 媒体与专辑重命名

- **后端 `handlers/rename.go`**：
  - `PUT /media/:id/rename`：重命名单个媒体文件（请求体 `{name}` 不含扩展名，保留原扩展名）。同步重命名同目录下同 basename 的字幕（.srt/.vtt）与封面图（.jpg/.png/.webp/.gif），并更新 DB 的 `path/name/subtitle_path/cover_path`。目标已存在时返回 409。
  - `PUT /albums/rename`：重命名专辑（请求体 `{album, new_name}`）。先 `os.Rename` 磁盘目录，再批量更新该专辑下所有 `MediaFile` 的 `path/album/subtitle_path/cover_path`（前缀替换），同步更新 `StudyNote.album` 归属。防路径穿越。
- **后端 `record.go`**：新增 `POST /records/:mediaId/sentences/:idx/repeat` 端点，`SentenceProgress.RepeatCount++`，用于句子播放遍数自动累加。
- **前端 `Albums.tsx`**：专辑卡片标题区新增 ✎ 重命名按钮，弹 Modal 输入新名（重命名后刷新专辑列表）。
- **前端 `Home.tsx`**：专辑模式下媒体卡片标题区新增 ✎ 重命名按钮，弹 Modal 提示扩展名保留、字幕/封面同步重命名。

#### 句子播放遍数自动累加

- **前端 `MediaPlayer.tsx`**：新增本地 `localSentences` state（与 prop 同步，用于乐观更新 UI），新增 `incrementSentenceRepeat(idx)` 调用后端 increment API 并乐观更新本地 `repeat_count`。
- `onTimeUpdate` 在两种模式下触发 +1：
  - **普通模式**：检测句子索引自然前进（`si > oldIdx`）或播放到末尾（`si === -1`）时，对上一句调用 increment；
  - **复读模式**：每播放到句末（`t >= cur.end`）时调用 increment（与现有 `sentenceRepeatRef++` 并列）。
- `markSentenceCompleted` 改为只设置 `completed=true`，不再用目标值覆盖 `repeat_count`，避免与 increment 累加冲突。
- 字幕行的「听 N 遍」Tag 实时反映最新计数（乐观更新）。

### Changed

#### 专辑封面优先取视频

- **前端 `Albums.tsx`**：加载专辑封面预览时先按 `type=video` 取第一个视频作为封面（MediaCover 会渲染视频首帧），无视频再回退到音频。这样合辑中有视频时封面就是视频画面。

#### 音频专辑按文件夹着色

- **前端 `MediaCover.tsx`**：新增 `colorKey` prop（默认 `media.id`）。传入专辑名时同一专辑内所有音频卡片背景颜色一致，不同专辑颜色不同（基于 key 哈希的浅色 HSL）。
- **前端 `Albums.tsx`**：专辑卡片传入 `colorKey={a.album}`，使专辑内所有音频封面按专辑统一着色。

#### Player 返回按钮移到标题左侧

- **前端 `Player.tsx`**：顶部布局从「标题 + 右侧返回按钮」改为「返回按钮 + 标题」同行排列，返回按钮在标题左侧（如 `←  00. Alphabet Song.mp3`），标题 `marginRight: auto` 占满剩余空间。

#### 媒体文件/目录删除自动清理

- **后端 scanner.go**：
  - `handleEvent` 的 `Remove` 分支区分文件 vs 目录删除——文件按 `path` 精确软删除；目录（路径无媒体扩展名）按 `path LIKE 'dir/%'` 前缀批量软删除该目录下所有 `MediaFile`，解决 fsnotify 删整目录时不触发文件级 Remove 事件导致孤儿记录的问题。
  - `ScanFull` 启动时收集磁盘上所有媒体路径，扫描后调用新增的 `pruneOrphans(diskPaths)` 软删除「数据库有记录但磁盘已不存在」的孤儿媒体，覆盖服务停机期间删除文件/目录的场景。

### Changed

#### 封面随机浅色背景

- **MediaCover.tsx**：无封面（音频兜底 / 视频加载失败）时，背景从固定浅灰 `#f0f2f5` 改为基于 `media.id` 哈希生成的浅色 HSL（亮度 80~92%、饱和度 45~65%），同一媒体始终得到同一种颜色。兜底图标颜色从灰色 `#999` 改为主题蓝 `#1677ff` 更醒目。
- **Albums.tsx**：专辑无媒体时的兜底背景从蓝色渐变改为基于专辑名生成的同款浅色 HSL；专辑卡片封面右上角新增专辑名 Tag。

#### 专题名移到封面右上角

- **Home.tsx**：媒体卡片的专辑名/子专辑名 Tag 从 `Card.Meta.description` 区域移到 `cover` 区域右上角（与左上角类型 Tag 对称，半透明白色背景增强可读性），下方 description 仅保留自定义紫色标签。`NoteCard` 同样把 `album` Tag 移到封面右上角。
- **Albums.tsx**：专辑卡片封面右上角新增专辑名 Tag。

#### 字幕 Tab 改名 + 显示每句听遍数

- **MediaPlayer.tsx**：第一个 Tab 文案从「全部字幕」改为「全文」；每句字幕始终显示「听 N 遍」Tag（原逻辑仅 `repeat_count > 0` 时显示，0 遍不显示），未听过用灰色 default Tag、听过用橙色 orange Tag。收藏句子 Tab 同步改为始终显示听遍数。

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
