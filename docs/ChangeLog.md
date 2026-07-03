# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

**版本约定**：每一天的修改归为一个版本，版本号顺序递增。

## [v0.3.0] - 2026-07-03

### Added

#### 用户账户管理（修改密码 / 修改用户名 / 上传头像）

- **后端 `handlers/auth.go`**：
  - 新增 `validateUsername` / `validatePassword` 校验函数：用户名 `^[a-zA-Z0-9_]{3,64}$`，密码 8-64 字符且须同时包含字母和数字。**仅注册与修改时强制校验，不影响已注册用户登录**。
  - `PUT /auth/password`：修改密码，需验证旧密码，新密码不能与旧密码相同，须满足强度要求。
  - `PUT /auth/profile`：修改用户名，校验格式与唯一性（排除自身），返回新用户信息与旧用户名。
  - `POST /auth/avatar`：上传头像（jpg/png/webp/gif，≤2MB），存储到 `data/avatars/<uid>/avatar.<ext>`，覆盖旧头像，更新 `User.AvatarPath`。
  - `GET /auth/avatar`：返回当前登录用户头像文件（支持 `?token=` 查询鉴权，与媒体流一致）。
  - `userToJSON` 统一返回 `{id, username, avatar_path, created_at}`。
- **后端 `models/models.go`**：`User` 新增 `AvatarPath *string` 字段（AutoMigrate 自动加列）。
- **后端 `router/router.go`**：注册 `PUT /auth/password`、`PUT /auth/profile`、`POST /auth/avatar`、`GET /auth/avatar` 路由。
- **前端 `api/index.ts`**：`authApi` 新增 `changePassword` / `updateProfile` / `uploadAvatar` / `avatarUrl` 方法。
- **前端 `store/auth.ts`**：新增 `updateUser(user)` 方法，修改用户名/头像后同步更新 localStorage 与 state，保留现有 token。
- **前端 `pages/Settings.tsx`**：新增「账户管理」卡片——头像预览 + Upload 更换按钮（96px 圆形头像，有图片显示图片，无则首字母渐变占位）、用户名修改表单（带格式校验与 extra 提示）、密码修改表单（旧密码 + 新密码 + 确认密码，含字母+数字强度校验与两次一致性校验）。
- **前端 `pages/Login.tsx`**：注册表单加强校验——用户名 pattern `^[a-zA-Z0-9_]+$` + extra「3-64 字符，仅字母/数字/下划线」；密码 min 8 + 自定义字母数字校验 + extra「8-64 字符，需同时包含字母和数字」。登录表单保持简单 required 校验。
- **前端 `layouts/MainLayout.tsx`**：Header 头像支持图片显示——`user.avatar_path` 存在时渲染 `<Avatar src={authApi.avatarUrl(token)} />`，否则渲染首字母渐变头像。

#### TTS 默认设置

- **后端 `handlers/settings.go`**：`settingsReq` 新增 `TTSVoice` / `TTSSpeed` 字段；`GetSettings` 返回 TTS 默认值（`en-US-JennyNeural` / `1.0`），旧数据兜底补全；`UpdateSettings` 校验 `TTSSpeed` 范围 0.5-2.0。
- **后端 `models/models.go`**：`Setting` 新增 `TTSVoice string` / `TTSSpeed float64` 字段。
- **前端 `store/settings.ts`**：DEFAULTS 新增 `tts_voice: 'en-US-JennyNeural'` / `tts_speed: 1.0`。
- **前端 `types/index.ts`**：`Settings` 接口新增 `tts_voice: string` / `tts_speed: number`。
- **前端 `pages/Settings.tsx`**：学习偏好卡片新增「TTS 朗读默认设置」分区——语音下拉选择（9 种 Edge TTS 音色：美式/英式/澳式/中文男女声）+ 语速 Slider（0.5-2.0，0.1 步进，带刻度标记与实时倍数显示）。
- **前端 `pages/NoteEditor.tsx`**：TTS 朗读不再使用硬编码 `TTS_VOICE` 常量，改为从 `useSettingsStore` 读取 `tts_voice` / `tts_speed`，未加载时兜底 `en-US-JennyNeural` / `1.0`。

#### Emby 风格首页布局

- **前端 `components/EmbyHome.tsx`（新建）**：Emby 风格横向滚动首页组件。
  - **「继续学习」行**：并行拉取 `recordApi.list()`（最近播放记录，按 `last_played_at DESC`）与 `noteApi.list()`（最近学习页面），去重合并后按时间倒序取前 15 条，媒体与学习页面混排。媒体卡片底部显示橙色进度条（`last_position / duration`）。
  - **「我的专辑」行**：学习 Emby「My Media」设计，每个专辑仅显示**一个封面入口卡片**（不再在首页平铺全部内容）。封面选择优先级：① 最近播放的视频 → ② 专辑内第一个视频 → ③ 最近播放的任意媒体 → ④ 第一个媒体。点击封面进入专辑详情页（网格视图）查看全部内容。卡片为 220×330 竖向海报，底部黑色渐变叠层显示专辑名 + 项数 + 「🎬 含视频」+ 最近播放时间，悬停时上浮放大 + 淡入「进入专辑」播放图标提示。
  - **「独立资源」行**：未归入专辑的散落文件仍以媒体卡片形式横向滚动展示。
  - **媒体海报卡片**：180px 宽竖向卡片，封面 240px 高（复用 MediaCover），类型角标（🎬视频/🎵音频）+ 播放次数角标 + 悬停播放图标 + 标题 + 相对时间/专辑名。
- **前端 `pages/Home.tsx`**：重构为视图切换——无筛选条件时渲染 `<EmbyHome>`（emby 横向滚动布局），有筛选条件（album/sub_album/tag_id/keyword/type）时渲染 `<GridView>`（专辑详情网格视图，含搜索栏、子专辑筛选、重命名/删除/**新建学习页面**按钮）。点击专辑封面通过 `setSearchParams({album})` 切换到网格视图。
- **前端 `layouts/MainLayout.tsx`**：侧边栏移除「专辑」菜单项（`/albums` 路由保留，专辑改为首页封面入口展示）。

#### 播放器上一个/下一个切换

- **前端 `pages/Player.tsx`**：加载媒体后并行拉取同专辑（含子专辑）媒体列表（`mediaApi.list({album, sub_album, sort:'file_modified_at', order:'asc'})`），计算当前媒体的前后相邻 ID。标题右侧新增 ⏮ / ⏭ 按钮（`StepBackwardOutlined` / `StepForwardOutlined`），disabled 态 + Tooltip 提示「已是第一个/最后一个」，点击 `navigate(/play/:id, {replace:true})` 切换。

### Changed

- **`README.md`**：全文翻译为中文版，保留 Markdown 结构、代码命令与技术术语不变。
- **前端 `pages/Settings.tsx`**：页面标题从「学习偏好设置」改为「设置」；说明卡片新增 TTS 与账户安全条目。

## [v0.2.0] - 2026-07-03

### Added

#### 学习记录按周/月/年统计

- **后端 `handlers/stats.go`**（新建）：`GET /records/stats?granularity=week|month|year&date=2026-07-02`
  - week：返回 date 所在周（周一~周日）的 7 天每日统计（播放次数/媒体数/背诵句子数）
  - month：返回 date 所在年的 12 个月每月统计
  - year：返回最近 5 年每年统计
  - 统计数据源：PlayRecord.last_played_at + SentenceProgress.updated_at
- **前端 `Records.tsx`** 重写：Tabs 切换周/月/年视图
  - 汇总卡片：总播放次数/媒体数/背诵句子数（紧凑一行）
  - 保留原有专辑进度条 + 播放记录表

#### 媒体与专辑删除

- **后端 `handlers/delete.go`**（新建）：
  - `DELETE /media/:id`：删除单个媒体文件 + 同目录同 basename 的字幕(.srt/.vtt) + 封面图(.jpg/.png/.webp/.gif)，DB 软删除 MediaFile。
  - `DELETE /albums`：请求体 `{album}`，递归删除磁盘目录（含所有媒体/字幕/封面/子目录），DB 批量软删除该专辑下所有 MediaFile，同步删除 StudyNote 及其图片目录。
  - 防路径穿越（`filepath.Base(filepath.Clean(album))`）。
- **前端 `Albums.tsx`**：专辑卡片标题区新增 🗑 删除按钮，二次确认后调用 `mediaApi.deleteAlbum`。
- **前端 `Home.tsx`**：媒体卡片标题区新增 🗑 删除按钮，二次确认后调用 `mediaApi.remove`。
- **前端 `api/index.ts`**：新增 `mediaApi.remove(id)` 和 `mediaApi.deleteAlbum(album)`。

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

#### 学习页面融入专辑

- **专辑详情页混排**：进入某专辑后，该专辑下的学习页面与音频/视频媒体按更新时间统一排序混排展示（`Home.tsx` 专辑模式 `Promise.all` 并行拉取 `mediaApi.list` 与 `noteApi.list(album)`，合并为 `FeedItem` 联合类型按时间戳降序）。
- **学习页面卡片预览图**：卡片封面使用学习页面的第一张图片（`noteApi.imageUrl`），无图片时显示橙色渐变背景 + `ReadOutlined` 图标占位；左上角 `gold` 色「学习页」Tag 与媒体的 magenta/green 类型 Tag 区分。
- **首页「最近学习页面」区块**：首页（无专辑筛选时）顶部新增最近学习页面区块（最多 6 个），右侧「查看全部」链接到 `/notes` 列表页；与媒体加载解耦的独立 `useEffect`。
- **专辑详情页新建入口**：仅在 `albumFilter` 存在时显示「新建学习页面」按钮，弹窗仅输入标题（专辑固定为当前专辑），创建成功后直接跳转编辑器。
- **NoteEditor 独立路由**：新增 `/notes/:id` 路由，编辑器从 `StudyNotes.tsx` 内部组件提取为独立页面 `NoteEditor.tsx`，通过 URL id 加载笔记，支持直接 URL 访问与浏览器后退；返回按钮 `navigate(-1)`，无历史栈时兜底回首页。

#### 用户数据迁移

- 将 `dev.db` 中的 5 个用户（testuser/demo/demo2/demo3/test）连同密码 hash 迁移到当前正在使用的 `echosub.db`，testuser/testuser123456 恢复正常登录。

### Changed

#### 学习记录周视图紧凑化（本次新增）

- **前端 `Records.tsx`**：本周统计由「4 列卡片网格」改为「单行 7 列」紧凑布局——周一~周日一行排开，每列上方为「星期 + 日期号」，下方为当日柱状图与「播放次数/媒体数/背诵句子数」；当日列橙色高亮。月/年视图同步收紧为 `lg={4} xl={3}` 网格，柱状图高度从 120 降至 80，整体更紧凑。汇总卡片改为一行三等分。

#### Dockerfile 修正 Go 版本（本次新增）

- **`Dockerfile`**：后端构建镜像从 `golang:1.23-alpine` 改回 `golang:1.26-alpine`，匹配 `go.mod` 声明（`go 1.25.0` + `toolchain go1.26.4`）；新增 `ENV GOTOOLCHAIN=local` 关闭运行时 toolchain 自动下载，避免多架构构建时联网拉取工具链导致的不稳定。（此前注释称「1.26 镜像不存在于 Docker Hub」系历史误判，现 1.26 镜像已正式发布。）

#### docker-compose.yml 映射 NAS 路径（本次新增）

- **`docker-compose.yml`**：媒体目录挂载示例改为 NAS 路径 `/mnt/nas/EchoSub:/media`，并补充群晖 DSM、Linux NFS、Windows SMB、Windows 映射盘四种 NAS 路径写法示例；新增注释明确「后端 config.go / config.yaml 无需修改，只需在 volumes 中把宿主机 NAS 路径挂载到容器 `/media`」；建议 SQLite 数据库卷保留在宿主机本地，不要放 NAS 以免 WAL 锁问题。

#### README 新增学习记录页面中文说明（本次新增）

- **`README.md`**：新增「学习记录页面（Study Records）」中文章节，描述顶部汇总卡片、周/月/年统计（含本周单行 7 列布局）、按专辑进度、播放记录表等模块；新增「Docker / NAS 部署说明」章节，明确镜像构建链路与 NAS 媒体目录映射方式。

#### 小学生审美整体美化

- **`App.tsx`**：antd 主题从蓝色 `#1677ff` 改为温暖橙 `#FF7A45`，`borderRadius` 12，`fontSize` 15；Menu/Card/Button 组件级 token 定制（选中态橙色背景、卡片大圆角 16、按钮圆角 10）。
- **`index.css`**：全局背景从纯白改为暖白 `#FFF9F0`；清理 Vite 模板残留（过大 h1、dark mode、紫色 accent 变量）；新增卡片 hover 上浮动画（`translateY(-4px)` + 橙色阴影）、滚动条橙色美化、按钮 active 微缩放触觉反馈。
- **`MainLayout.tsx`**：重写侧边栏为自定义彩色菜单（每项不同颜色图标——首页橙/专辑蓝/标签绿/上传紫/记录粉/设置青），选中态彩色背景块；Logo 改为橙色渐变圆角图标 + 渐变文字；Header 显示当前页 emoji+名称、用户首字母渐变 Avatar。

#### 编辑/删除收进 ⋯ 菜单

- **`Albums.tsx` / `Home.tsx`**：卡片标题区的编辑 ✎ 和删除 🗑 图标收进 `Dropdown` 下拉菜单（⋯ 触发），避免误触。菜单项带 emoji 图标（✏️ 重命名 / 🗑️ 删除），删除项 `danger` 红色高亮。

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

#### 封面随机浅色背景 / 专题名移到封面右上角 / 字幕 Tab 改名

- **MediaCover.tsx**：无封面（音频兜底 / 视频加载失败）时，背景从固定浅灰 `#f0f2f5` 改为基于 `media.id` 哈希生成的浅色 HSL（亮度 80~92%、饱和度 45~65%），同一媒体始终得到同一种颜色。兜底图标颜色从灰色 `#999` 改为主题蓝 `#1677ff` 更醒目。
- **Albums.tsx**：专辑无媒体时的兜底背景从蓝色渐变改为基于专辑名生成的同款浅色 HSL；专辑卡片封面右上角新增专辑名 Tag。
- **Home.tsx**：媒体卡片的专辑名/子专辑名 Tag 从 `Card.Meta.description` 区域移到 `cover` 区域右上角（与左上角类型 Tag 对称，半透明白色背景增强可读性），下方 description 仅保留自定义紫色标签。`NoteCard` 同样把 `album` Tag 移到封面右上角。
- **MediaPlayer.tsx**：第一个 Tab 文案从「全部字幕」改为「全文」；每句字幕始终显示「听 N 遍」Tag（原逻辑仅 `repeat_count > 0` 时显示，0 遍不显示），未听过用灰色 default Tag、听过用橙色 orange Tag。收藏句子 Tab 同步改为始终显示听遍数。

#### 首页媒体卡片精简 / 统一卡片网格断点 / 移除页面宽度限制

- **移除左侧导航栏「学习页面」入口**：学习页面不再作为独立导航项，改为通过专辑详情页混排和首页「最近学习页面」区块进入（`/notes` 列表页路由保留，作为「查看全部」入口）。
- **首页媒体卡片精简**：卡片信息精简为「文件名 + 专辑/子专辑 Tag + 紫色标签」，移除时长、播放进度条、相对时间、标签管理按钮（标签管理功能保留在播放页/标签页）。
- **统一卡片网格断点**：`Home.tsx`、`Albums.tsx`、`StudyNotes.tsx` 的 `<Col>` 断点统一为 `xs={24} sm={12} md={8} lg={6} xl={6} xxl={4}`（桌面每行 4 个、超宽屏 6 个），避免大屏过密。
- **移除页面宽度限制**：删除 `index.css` 中 `#root` 的 `width:1126px` / `margin:0 auto` / `text-align:center` / `border-inline` 等 Vite 模板残留，内容铺满浏览器宽度。

#### Docker 构建配置优化

- **`docker-compose.yml`**：媒体目录挂载从 `:ro`（只读）改为读写模式（上传功能需要写入）；添加详细注释说明数据卷映射。

#### 上传页面目录浏览修复

- **后端 `handlers/media.go`**：`BrowseMedia` 和 `UploadMedia` 的 path 参数处理修复——前端传入的 `/` 分隔路径用 `filepath.FromSlash` 转为 OS 路径再 `Clean`，返回的 path 统一用 `filepath.ToSlash` 归一化为 `/` 分隔。修复 Windows 下面包屑分割失效问题。
- **前端 `Upload.tsx`**：Breadcrumb 改用 antd v5 的 `items` prop（替代已废弃的 `Breadcrumb.Item` 子组件）；UI 美化为橙色主题风格。

### Fixed

#### 句末停顿修复

- **前端 `MediaPlayer.tsx`**：修复逐句复读模式下「句末停顿 n 秒」不生效的 bug。原逻辑在重复同一句时直接 `el.currentTime = cur.start` 无停顿，仅切换下一句时才停顿。重构后：句末触发时先 `el.pause()` + `setPlaying(false)`，再用 `setTimeout(pauseSeconds * 1000)` 统一处理停顿，停顿结束后根据情况选择「重复当前句」/「跳下一句」/「整体循环重置」/「全部结束」。现在每读完一遍都会停顿 n 秒。

#### 删除接口 404 修正

- **后端 `handlers/delete.go`**：`DeleteAlbum` 在 `os.RemoveAll` 前先 `os.Stat` 检查目录是否存在，不存在时返回 404（原逻辑因 `os.RemoveAll` 对不存在路径返回 nil 而误报成功 200）。

#### TTS 朗读不再念 Markdown 符号

- 新增 `frontend/src/utils/index.ts` 的 `markdownToPlainText(md)` 工具函数，按「块级→行内」顺序处理：代码块整体移除、HTML 标签移除、图片保留 alt、链接保留文本、水平线/标题/引用/列表前缀移除、表格分隔符处理、行内代码去反引号、粗体斜体去标记、HTML 实体还原、空白折叠。
- `NoteEditor.tsx` 的 TTS `handleTTS` 由直接朗读 `content` 原文改为 `markdownToPlainText(content).trim()`，避免念出 `#`、`-`、`>`、`**`、`` ` `` 等符号。

### 端到端测试验证

通过自动测试脚本验证：
- ✅ 登录 testuser/testuser123456 成功
- ✅ 列出 4 个专辑 / 8 个媒体
- ✅ 删除不存在专辑返回 404（接口校验正确）
- ✅ 句子听遍数 +1 接口正常
- ✅ **真实删除媒体**：test.mp3 + test.srt + test.jpg 三个文件全部从磁盘删除
- ✅ **真实删除专辑**：整个目录递归删除，files_deleted 计数正确

## [v0.1.0] - 2026-07-02

### Added

#### 后端 (Go 1.26 + Gin + GORM + SQLite)

- **项目骨架**: `backend/` 模块，导入路径为 `github.com/yaole/EchoSub/backend`，分层结构为 `cmd/server`、`internal/{config,database,handlers,middleware,models,router,scanner,utils}` 和 `pkg/subtitle`。
- **配置加载器** (`internal/config/config.go`): 优先从环境变量读取，其次从 `config.yaml` 读取，具有合理的默认值（端口 `8080`、数据库 `data/echosub.db`、JWT 密钥、媒体目录 `/media`）。支持的媒体扩展名：视频 `.mp4/.mkv/.mov/.webm/.avi`，音频 `.mp3/.m4a/.aac/.wav/.flac/.ogg`，字幕 `.srt/.vtt`。
- **GORM 模型** (`internal/models/models.go`): `User`、`MediaFile`（与 `Tags` 多对多关联）、`Tag`（用户作用域）、`PlayRecord`、`SentenceProgress`、`Setting`。`MediaFile.Album` 可为空，用于表示独立资源。
- **数据库启动** (`internal/database/database.go`): 通过 `glebarez/sqlite`（纯 Go，无 CGO）使用 SQLite，WAL 模式，`busy_timeout=5000`，单写连接，为所有模型执行 `AutoMigrate`。
- **JWT 中间件** (`internal/middleware/auth.go`): 使用 `golang-jwt/jwt/v5` 实现 `GenerateToken` / `ParseToken` / `AuthRequired`；`GetUserID` 从 `gin.Context` 提取用户 ID。密码使用 bcrypt 哈希。**支持 `Authorization` 头与 `?token=` 查询参数两种鉴权方式**（HTML5 媒体元素无法设置请求头，必须用查询参数）。
- **媒体扫描器** (`internal/scanner/scanner.go`): `ScanFull` 全量扫描加上基于 `fsnotify` 的 `StartWatcher` 增量监听 `Create/Write/Rename` 事件；`upsertMedia` 以绝对路径为键；`findSubtitle` 在同一目录中查找同名 `.srt/.vtt`；`findCover` 查找同名图片作为封面；专辑名称从媒体根目录下的第一个路径段派生。
- **字幕解析器** (`pkg/subtitle/subtitle.go`): `ParseFile` / `ParseSRT` / `ParseVTT` 返回统一的 `Sentence{Index,Start,End,Text}`。时间范围正则覆盖 `HH:MM:SS,mmm`、`MM:SS,mmm` 和 `SS,mmm`，支持 `,` 或 `.` 分隔符。**解析前 `strings.TrimPrefix(content, "\ufeff")` 去除 UTF-8 BOM**，避免首句丢失。
- **认证 API** (`internal/handlers/auth.go`): `POST /api/v1/auth/register`、`POST /api/v1/auth/login`、`GET /api/v1/auth/me`。
- **媒体 API** (`internal/handlers/media.go`): `GET /media`（分页，可按 `album/type/keyword/tag_id` 筛选，可排序）、`GET /media/:id`、`GET /media/:id/stream`（支持 HTTP Range，在 `c.File` 前设置 `Content-Type`）、`GET /media/:id/subtitle`（解析的字句及每用户进度）、`GET /media/:id/cover`（封面，优先同名图片，回退视频流，音频无封面返回 404）、`GET /albums`。
- **标签 API** (`internal/handlers/tag.go`): CRUD 及 `POST /media/:id/tags` 覆盖式分配。
- **记录 API** (`internal/handlers/record.go`): `PUT /records/:mediaId`（mediaId 来自 URL，非 body）、`GET /records`、`GET /records/:mediaId`、`PUT /records/:mediaId/sentences/:idx`、`GET /progress`（按专辑/标签聚合）。
- **扫描 API** (`internal/handlers/scan.go`): `POST /scan/trigger`、`GET /scan/status`。
- **设置 API** (`internal/handlers/settings.go`): `GET /settings`、`PUT /settings`（每用户键值对）。
- **路由** (`internal/router/router.go`): 公开 `/auth/register`、`/auth/login`、`/health`；JWT 保护 `/media`、`/albums`、`/tags`、`/records`、`/progress`、`/settings`、`/scan`。
- **入口** (`cmd/server/main.go`): 启动配置、数据库、扫描器监听、路由；从 `frontend/dist` 提供前端 SPA 并支持 SPA 回退。
- **示例配置** (`backend/config.example.yaml`)。

#### 前端 (React 19 + TypeScript 6 + Vite 8 + Ant Design 6)

- **工具链**: Vite 配置，`@` → `./src` 别名，`/api` 代理到 `localhost:8080`；`tsconfig.app.json` 使用 `paths` 而不使用已弃用的 `baseUrl`（兼容 TS 6.0）。
- **类型** (`src/types/index.ts`): 完整的 TypeScript 定义，与后端 DTO 对应。
- **API 客户端** (`src/api/`): axios 实例，附带 JWT 和 401 重定向拦截器；`authApi`/`mediaApi`/`tagApi`/`recordApi`/`settingsApi`/`scanApi`/`noteApi`。
- **状态** (`src/store/`): `zustand` 存储，用于 `auth`（localStorage 持久化的令牌/用户，模块加载时同步 `hydrate()` 恢复 JWT）和 `settings`。
- **路由** (`src/router/index.tsx`): `ProtectedRoute` 包装器，支持懒加载页面。
- **布局** (`src/layouts/MainLayout.tsx`): Ant Design 侧边栏 + 头部外壳。
- **页面**:
  - `Login.tsx`: 登录/注册标签页，带表单验证，「记住密码」复选框（localStorage 存储凭据）。
  - `Home.tsx`: 媒体卡片网格，支持关键词搜索、类型筛选、排序、专辑/标签下钻、播放进度预览。
  - `Albums.tsx`: 专辑网格，显示数量。
  - `Tags.tsx`: 标签 CRUD，显示使用次数。
  - `Records.tsx`: 学习统计、表格和进度条。
  - `Settings.tsx`: 学习偏好表单（重复次数、暂停秒数、循环次数）。
  - `Player.tsx`: 媒体 + 字幕加载器，返回按钮在标题左侧。
  - `StudyNotes.tsx` / `NoteEditor.tsx`: 学习页面列表与编辑器（独立路由 `/notes/:id`）。
  - `Upload.tsx`: 媒体上传与目录浏览。
- **MediaPlayer 组件** (`src/components/MediaPlayer.tsx`): 核心播放器，支持逐句重复（M 次）、句间暂停（K 秒）、整体循环（N 次，默认 3 次）、节流进度保存（5 秒）、可点击字幕列表，带当前句高亮和完成标记。播放速度 +/- 按钮微调（0.1 步进，0.5-2.0 范围）。字幕区分「全文」与「收藏句子」两个 Tab。使用 refs（`handlingEndRef`、`sentenceRepeatRef`、`overallLoopRef`、`pauseTimerRef`、`modeRef`）避免事件回调中的闭包过期问题。
- **MediaCover 组件** (`src/components/MediaCover.tsx`): 处理视频/音频/图片封面，音频无封面时按 `colorKey` 哈希生成浅色 HSL 背景。

#### 移动端、PWA 与会话

- **响应式布局**: `MainLayout` 在屏幕小于 `lg` 断点时切换为滑入式 `Drawer` 菜单（头部有汉堡按钮），移动端内边距更紧凑。`Home.tsx` 筛选行在 `xs` 时重排为单列堆叠，`sm` 时为两列。`Login.tsx` 卡片为流式布局（`maxWidth: 400`，`width: 100%`），外 padding 响应式。
- **PWA 支持**: 集成 `vite-plugin-pwa` (1.3.0)，`autoUpdate` 注册，`devOptions.enabled` 用于本地测试，Web App Manifest（`name=EchoSub`、`theme_color=#FF7A45`、`display=standalone`、`lang=zh-CN`）。在 `frontend/public/` 下生成 `pwa-192.png` 和 `pwa-512.png` 图标（含 maskable 变体）。`index.html` 添加 `theme-color`、`apple-touch-icon`、`apple-mobile-web-app-capable` 和 `viewport-fit=cover` 视口。`main.tsx` 通过 `virtual:pwa-register` 注册 service worker。
- **Workbox 运行时缓存**: 媒体流请求（`/api/v1/media/:id/stream`）使用 `NetworkOnly` 以保留 Range/令牌语义；其他 `/api/*` 调用使用 `NetworkFirst`，5 秒超时，短期缓存。
- **记住密码**: `Login.tsx` 添加"记住密码"复选框（仅登录标签页）。勾选后，凭据存储在 `localStorage` 的 `echosub_remember` 中，下次访问时预填充。取消勾选则清除该条目。
- **刷新时的会话持久化**: `useAuthStore.getState().hydrate()` 现已在模块加载时调用（`store/auth.ts`），因此 JWT 在 `ProtectedRoute` 渲染前同步恢复——刷新受保护页面不再跳转到 `/login`。

#### 媒体封面与类型徽章

- **后端封面扫描** (`internal/scanner/scanner.go`): 添加 `findCover()`，仿照 `findSubtitle()` 在媒体目录中查找同名图片（`.jpg/.jpeg/.png/.webp`）。`upsertMedia` 现填充 `MediaFile.CoverPath`。`MediaConfig` 新增 `SupportedImages`。
- **前端 `MediaCover.tsx`**: 视频用 `<video>` 首帧作封面，音频用同名图片，无则渐变占位；封面左上角类型 Tag（magenta 视频 / green 音频）。
- **前端 `Home.tsx` / `Albums.tsx`**: 卡片封面右上角专辑名 Tag。

#### 子专辑（嵌套文件夹支持）

- **后端**: `MediaFile.SubAlbum` 字段从媒体根目录下第二段路径派生（如 `media_root/English/Unit1.mp3` -> album=`English`, sub_album=`Unit1`）。`scanner.upsertMedia` 填充该字段；`ListMedia` 接受 `sub_album` 查询过滤；`ListAlbums` 返回每个专辑的 `sub_albums: [{sub_album, count}]` 数组。
- **前端**: `Home.tsx` 显示子专辑筛选下拉框（仅当所选专辑有子专辑时显示）与 `cyan` 子专辑 Tag；`Albums.tsx` 在专辑卡片内渲染子专辑 Tag，点击跳转 `/?album=...&sub_album=...`。新增类型 `MediaFile.sub_album` 与 `Album.sub_albums`。

#### 句子收藏（精听模式）

- **后端**: `SentenceProgress.Favorited` 布尔字段；`POST /records/:mediaId/sentences/:idx/favorite` 切换收藏；`GetSubtitle` 返回每句的 `favorited`。
- **前端**: `MediaPlayer.tsx` 在每行字幕渲染星标切换（调用 `recordApi.toggleFavorite`，乐观更新带错误回滚）。字幕区改为 `Tabs`：「全文」与「收藏句子」两个面板；收藏面板仅列出已收藏句子，带数量徽章，点击跳转播放。

#### 学习页面（自定义学习笔记）

- **后端**: 新建 `StudyNote` 模型（`id, user_id, album, title, content:text, images:text(JSON), timestamps, soft-delete`）。`/notes` 下完整 CRUD：`GET /notes?album=`、`POST /notes`、`GET/PUT/DELETE /notes/:id`。图片端点：`POST /notes/:id/images`（multipart 多文件，按名去重）、`DELETE /notes/:id/images/:filename`、`GET /notes/:id/images/:filename`（鉴权，支持 `?token=`）。图片存储在 `data/note-images/<note_id>/`。
- **前端**: 新建 `StudyNotes.tsx` 页面（路由 `/notes`）。专辑作用域列表 + 创建弹窗；编辑器内联标题编辑、Markdown 预览/编辑切换（默认预览，`react-markdown` + `remark-gfm`，编辑显示原始 textarea）、多图画廊（上/下一张按钮、缩略图条、点击全屏 via antd `Image` 预览、单图删除）、TTS 朗读按钮调用 VoiceCraft API（`https://tts.wangwangit.com/v1/audio/speech`，voice `en-US-JennyNeural`）播放返回的音频 blob。
- **依赖**: `react-markdown@10.1.0`、`remark-gfm@4.0.1`。

#### 播放体验优化

- **默认循环次数** 从 1 提升到 3（`store/settings.ts` `DEFAULTS.loop_count` 与 `MediaPlayer` 兜底）。
- **播放次数显示**: `MediaPlayer` 接受 `playCount` prop，在控制栏显示「已听 N 遍」Tag；每行字幕在 `repeat_count > 0` 时显示「听 N 遍」Tag。
- **精细播放速度**: 用 `+`/`-` 圆形按钮替代固定 `Select`，0.1 步进，0.5-2.0 范围，浮点取整避免漂移；当前速率显示为 `N.Nx`。
- **播放器头部**: 返回按钮移到标题行右侧（仅图标，无「返回」文字）；标题下方的「文件名 · 时长」副标题行已移除以节省垂直空间。

#### 宽屏布局

- `Home.tsx` 与 `Albums.tsx` 卡片网格断点扩展 `xl`/`xxl`，宽屏桌面每行显示更多列，减少两侧空白；筛选行列宽同步加宽。

### Changed

- `frontend/src/types/index.ts`: `Sentence` 增加 `favorited: boolean`；`MediaFile` 增加 `sub_album: string | null`；新增 `SubAlbum` 接口与 `StudyNote` 接口。
- `frontend/src/api/index.ts`: 新增 `recordApi.toggleFavorite`；`mediaApi.list` 接受 `sub_album`；新增 `noteApi` 模块（list/create/get/update/delete/uploadImages/deleteImage/imageUrl）。
- `backend/internal/router/router.go`: 注册收藏切换路由与完整 `/notes` 路由组。
