# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

**版本约定**：每一天的修改归为一个版本，版本号顺序递增。

## [v0.5.0] - 2026-07-04

### Added

#### 多态标签系统：专辑 / 季 / 学习页 / 媒体文件均支持打标签 + 按标签筛选

- **后端 `models/models.go`**：新增 `EntityTag` 多态标签关联表，复合唯一索引 `(user_id, tag_id, entity_type, entity_id)`。新增 `EntityType` 枚举：`media` / `album` / `season` / `note`，支持标签与四种实体的多对多关联。
- **后端 `handlers/entity_tag.go`（新文件）**：实现通用多态标签接口：
  - `POST /tags/:id/attach` — 给任意实体附加单个标签（幂等）
  - `POST /tags/:id/detach` — 从任意实体摘除单个标签
  - `PUT /tags/entity` — 覆盖式设置某实体的全部标签（管理弹窗一次性保存）
  - `GET /tags/entity?type=&id=` — 获取某实体当前已绑定的标签列表
  - `GET /tags/:id/entities` — 按标签筛选实体，结果分四组：专辑 / 季 / 文件（媒体 + 学习页）
  - `LoadTagsForEntities(userID, entityType, entityIDs)` — 批量加载函数，供业务侧按实体填充 `tags` 字段；媒体文件兼容旧 GORM `media_tags` 表，确保 v0.3.x 时代的标签数据仍可见
- **后端 `handlers/media.go` (`ListAlbums`)**：专辑列表返回 `tags` + `meta_id`；季列表每个子项返回 `tags` + `meta_id`（季的 `AlbumMeta.ID`），作为 `entity_tags` 的 `entity_id`。
- **后端 `handlers/note.go` (`noteToJSON`)**：学习页 JSON 响应新增 `tags` 字段。
- **后端 `database/database.go`**：`AutoMigrate` 注册 `EntityTag` 表。
- **前端 `types/index.ts`**：新增 `TagEntityType` 类型别名（`'media' | 'album' | 'season' | 'note'`）、`TagFilterResult` / `TagFilterAlbum` / `TagFilterSeason` 接口；`Album` / `SubAlbum` / `StudyNote` 扩展 `tags` + `meta_id` 字段。
- **前端 `api/index.ts` (`tagApi`)**：新增 `attach` / `detach` / `setForEntity` / `getForEntity` / `entities` 五个方法对应后端多态接口。
- **前端 `components/TagManagerModal.tsx（重构为通用）`**：原媒体专用弹窗升级为支持任意实体类型的通用弹窗。接受 `entityType` + `entityId` + `currentTagIds` props，复用同一套 UI 逻辑：标签下拉多选 + 新标签创建，覆盖式保存。
- **前端 `pages/Tags.tsx（重构）**：原 CRUD 列表升级为「标签管理 + 标签筛选器」：
  - 顶部：标签 CRUD
  - 中部：标签卡片显示该标签下三类实体的数量徽标（📂 专辑 / 📁 季 / 📄 文件）
  - 下部：选中标签后展开三组结果（专辑 / 季 / 文件），文件组合并展示媒体（🎬/🎵）与学习页（📝），分别可点击进入专辑页 / 季页 / 播放器 / 笔记编辑器。
- **前端 `components/EmbyHome.tsx` (`AlbumCard`)**：右下角 ⋮ 菜单新增「🏷️ 管理标签」项（无 `meta_id` 时禁用），点击打开 `TagManagerModal`。
- **前端 `components/NoteCardMenu.tsx`**：学习页 ⋮ 菜单新增「🏷️ 管理标签」项，点击打开 `TagManagerModal`。
- **前端 `components/SeasonCardMenu.tsx`**：季 ⋮ 菜单新增「🏷️ 管理标签」项（无 `meta_id` 时禁用），点击打开 `TagManagerModal`；新增 `metaId` / `tags` props。
- **前端 `pages/Home.tsx` (`GridView`)**：
  - 专辑标题区新增「🏷️ 标签」按钮，点击打开 `TagManagerModal`；同时在标题下方展示当前专辑已绑定的所有标签 chip
  - 媒体卡片 ⋮ 菜单新增「🏷️ 管理标签」项，点击打开 `TagManagerModal`
  - 季网格右下角 `SeasonCardMenu` 自动透传 `metaId` + `tags`，确保季标签可被管理
- **前端 `pages/NoteEditor.tsx`**：标题区紧贴显示当前学习页所有标签 chip；操作区新增「🏷️ 标签」按钮，点击打开 `TagManagerModal`，保存后自动重新加载笔记以更新 chip 列表。

### Notes

- 「未读蒙版」逻辑（v0.4.9）继续生效：未学习的媒体 / 季仍显示半透明灰色蒙版 + 锁图标 + 「未开始」提示；开始学习（`play_count > 0` 或 `last_position > 0`）后蒙版自动消失。
- 标签筛选结果中，「文件」组合并展示媒体 + 学习页两类：媒体用 🎬/🎵 + 文件名；学习页用 📝 + 标题。
- 媒体文件标签兼容 v0.3.x 的 `media_tags` 表（通过 GORM many2many 自动管理），与新 `entity_tags` 表的 `media` 类型合并去重，确保历史数据可见。
- 验证方式：`go build` / `go vet` / `go test`（subtitle 8 用例）全部通过；`pnpm build`（含 `tsc -b` 严格类型检查）通过；按 changelog 模板同步更新至 v0.5.0。

### Fixed

- **修复 `Tags` 页面崩溃：`Cannot read properties of null (reading 'length')`**
  - 根因：后端 `GET /tags/:id/entities` 在「该标签下没有媒体 / 学习页」时，Go 的 `var notes []models.StudyNote` / `var medias []models.MediaFile` 是 nil slice，序列化为 JSON `null`，导致前端 `r.medias.length` / `r.notes.length` 崩溃
  - 修复（后端 `handlers/entity_tag.go`）：将 `notes` / `medias` 显式初始化为 `make([]T, 0)`，确保空结果序列化为 `[]` 而非 `null`
  - 修复（前端 `pages/Tags.tsx`）：即使后端遗漏字段，前端也通过 `r.albums ?? []` / `r.seasons ?? []` / `r.medias ?? []` / `r.notes ?? []` 兜底；`tag` 字段统一为 `Tag | null`，渲染时使用 `filterResult?.tag?.name ?? ''`
  - 验证方式：标签页正常打开，新建空标签、点击空标签均无崩溃
- **README.md 全面更新以反映 v0.4.x ~ v0.5.0 新增能力**
  - 功能特性按「媒体与播放 / 学习与笔记 / 标签管理 / 专辑季编辑 / 账户认证 / 部署」6 个子章节组织
  - 新增 Emby 风格专辑扫描、季、配对媒体、未读蒙版、继续观看、TTS、学习页、媒体备注、多态标签等特性的描述
  - 目录结构按当前实际文件清单刷新（含 `note.go` / `remark.go` / `entity_tag.go` / `album_meta.go` / `album_pin.go` / `delete.go` / `NoteCardMenu` / `SeasonCardMenu` / `TagManagerModal` / `NoteEditor` 等）
  - API 概览从 24 条扩到 50+ 条，按 账户 / 媒体 / 专辑季 / 学习页 / 标签 / 播放记录 / 文件扫描设置 6 个子表格分组
  - 新增「标签管理（v0.5.0 多态）」专章，描述 UI 流程
  - 新增「版本管理」章节说明 Keep a Changelog 1.0.0 规范与当前活跃版本 v0.5.0
  - 顶部新增 [AI 协作指南](CLAUDE.md) 链接
- **README.md 顶部添加徽标 + shields.io 徽章栏（参考 LynxOCR 风格）**
  - 顶部居中显示 🎬🎧 大标题 + 中文副标题 + 5 项关键特性关键词
  - 语言 / 文档 / 日志 / 协作指南 5 个导航链接居中排列
  - 9 个 shields.io 徽章：Release / License / Platform / Changelog / Backend (Go) / Frontend (React) / Database (SQLite) / Deploy (Docker) / CI (GitHub Actions)
  - 新增「📑 目录」快速跳转锚点
  - 全文章节标题加 emoji 前缀（✨ 概述 / 🚀 功能特性 / 🧰 技术栈 / 📁 目录结构 / ✅ 前置要求 / 🏃 快速开始 / ⚙️ 配置说明 / 🧪 测试方法 / 🏗️ 生产构建 / 📚 API 概览 / 📊 学习记录 / 🏷️ 标签管理 / 🐳 Docker 部署 / 🗂️ 版本管理 / 📄 许可证）
  - 子节加 emoji 前缀（1️⃣ / 2️⃣ / 🔐 / 🎬 / 🗂️ / 📝 / 🏷️ / 📊 / ⚙️ / 🇨🇳 / ⚠️）
  - 底部添加「用 ❤️ 打造 · 欢迎 Star ⭐️ 与 Issue 反馈」+ 回到顶部链接
  - 仓库归属修正：徽章 / 镜像引用从 `yaole/EchoSub` 修正为 `tabortao/EchoSub`，与 `docker-compose.yml` 中 `ghcr.io/tabortao/echosub:latest` 保持一致
- **README.md「NAS 媒体目录映射」章节与 `docker-compose.yml` 对齐**
  - 之前示例 volumes 块（`/mnt/nas/EchoSub:/media` 等）与仓库实际 `./Media:/media` 不符，重写为**开箱即用**模式：直接展示 `docker-compose.yml` 中的相对路径卷挂载
  - 新增「🔀 NAS 路径映射示例」子节：列出 4 种常见 NAS 挂载方式（群晖 / 通用 NFS / Windows SMB / Windows 映射盘），仅需替换 `volumes` 中 `- ./Media:/media` 的左侧路径
  - 新增 `mkdir Media Data` + `ln -s` / `New-Item Junction` 软链示例，避免拷贝大量媒体文件
  - 修正挂载模式说明：上传 / 专辑重命名 / 封面写入功能需**读写**挂载；只读播放可加 `:ro`
- **CLAUDE.md 改写为完整汉语版（v0.5.0）**
  - 10 条核心原则扩为 11 章结构（核心原则 / 项目概述 / 常用命令 / 开发环境 / 架构 / 关键约定 / 代码风格 / 测试清单 / 变更日志 / 调试指引 / 项目记忆）
  - 关键约定从 9 条扩为 13 条，新增：跨平台路径验证（v0.4.7 教训）、媒体配对（v0.4.3）、多态标签系统（v0.5.0）、Emby 元数据识别优先级
  - 目录结构按当前实际文件清单刷新（含 `entity_tag.go` / `note.go` / `remark.go` / `album_meta.go` / `album_pin.go` / `delete.go` / `TagManagerModal` / `NoteCardMenu` / `SeasonCardMenu` 等）
  - 测试清单补 2 条：新增 / 修改 API 需同步 README；新增 / 修改功能需同步 PLAN / TASKS
  - 调试指引新增「前端 `.length` 崩溃」与「专辑封面未显示」两条
  - 项目记忆章节指向 `~/.trae-cn/memory/` 沉淀路径，便于 AI 跨会话复用历史经验
- **README.md 新增「📸 应用预览」章节**
  - 在徽章栏与目录之间插入独立「应用预览」章节，居中展示 `docs/images/UI-01.png`（首页 Emby 风格预览）与 `docs/images/UI-02.png`（播放器 / 学习页预览）
  - 每张图下方加 `<em>` 简短说明（首屏 / 播放器 + 学习页）
  - 图片宽度统一 `90%`，大屏可清晰查看细节
  - 目录新增「📸 应用预览」锚点链接，便于快速跳转

## [v0.4.9] - 2026-07-04

### Added

#### 未读媒体灰色蒙版 + 季封面缩放 + 横幅改用 <img> 渲染

- **前端 `components/EmbyHome.tsx` (`MediaCard`)**：新增「未读」灰色蒙版。当媒体的 `play_count === 0` 且 `last_position === 0`（用户从未播放 / 学习）时，封面图覆盖半透明灰色蒙版 (`rgba(128,128,128,0.55)`) + 锁图标 + 「未开始」文字提示，鼠标仍可点击进入播放器；学习后（`play_count > 0` 或 `last_position > 0`）蒙版自动消失。
- **前端 `pages/Home.tsx` (网格视图 MediaCard)**：与 EmbyHome 同步实现「未读蒙版」逻辑，专辑 / 标签筛选下所有未学习的媒体卡片都被半透明灰色蒙版覆盖。
- **前端 `pages/Home.tsx` (`SeasonGrid`)**：季封面容器由固定 `height: 220` 改为 `aspectRatio: '2 / 3'`（竖版海报比例，与 Emby 一致），`objectFit` 由 `'cover'` 改为 `'contain'`。避免竖版 `seasonXX-poster.jpg` / `Season N/folder.jpg` 被裁剪，让季图标完整可见；容器背景由 `#f0f0f0` 调整为 `#f5f5f5` 衬托图片。「📁 季」徽标位置 / 样式与右下方 `SeasonCardMenu` 保持原状。

### Changed

- **前端 `pages/Home.tsx` (`AlbumBanner`)**：横幅渲染方式由 CSS `background-image: url(...) center/cover` 改为 `<img>` + `objectFit: cover` + 独立暗色叠加层。原因：背景图加载失败时浏览器反馈不直观（图片不可见但容器尺寸正常），用 `<img>` 可显式 `onError` 兜底隐藏并回退到纯渐变背景，确保 `小猪佩奇(2004)/banner.jpg` 等 16:5 横幅在专辑详情页一定能正常显示。

### Notes

- 「未读蒙版」使用 `pointerEvents: 'none'` 避免吞掉卡片的点击事件（仍可点击进入播放器开始学习）。
- 季封面比例锁定 2:3 是 Emby / Plex 的标准海报比例；`objectFit: 'contain'` 保证 `seasonXX-poster.jpg` 这类竖版图不被裁剪、季图标完整可见。
- 验证方式：在 `test-media\小猪佩奇(2004)` 目录下，确认 `banner.jpg` 通过 `GET /api/v1/albums/.../banner` 返回图片（之前 v0.4.7 已修复 Windows 路径 bug 并将 `banner_path` 正确入库）；`season02-poster.jpg` ~ `season08-poster.jpg` 通过 `seasonXX-poster` 映射到对应 `Season N`（v0.4.7 已实现），`Season 1/folder.jpg` 优先于 `season01-poster.jpg`（季根 `folder.jpg` 优先规则）。
- 本次不涉及后端变更，扫描器与元数据识别沿用 v0.4.7 修复结果。

## [v0.4.8] - 2026-07-04

### Added

#### 首页「继续观看」只显示未完成的媒体 + Player 支持 ?position= 覆盖

- **后端 `handlers/record.go` (`ListRecent`)**：新增 `unfinished=true` 查询参数，过滤出「已开始但未完成」的播放记录：`(last_position > 0) AND (duration = 0 OR last_position < duration * 0.95)`。`duration = 0` 兜底（媒体元数据未就绪时只看 last_position > 0），0.95 阈值容忍用户提前一两句结束的情况。
- **前端 `api/index.ts` (`recordApi.recent`)**：签名扩展为 `recent(limit, opts?: { unfinished?: boolean })`。
- **前端 `components/EmbyHome.tsx`**：「继续学习」行改名为「▶️ 继续观看」，调用 `recordApi.recent(20, { unfinished: true })`，确保该行只显示未完成的媒体，已看完的不再占位。媒体卡片点击进入时仍走 `/play/:id`，由 Player 自动从 API 加载 `last_position` 续播。
- **前端 `pages/Player.tsx`**：支持 URL `?position=X` 参数强制从指定秒数开始播放，覆盖数据库中的 `last_position`。典型用法：`/play/123?position=0` 强制重看、分享带进度的链接。`?position=0` 是合法的「重看」信号；负数 / NaN 会被规范化为 0。

### Changed

- **前端 `components/EmbyHome.tsx`**：「继续学习」→「继续观看」标题与注释同步更新，更准确反映该行内容（最近未完成的媒体 + 最近更新的学习页面）。

## [v0.4.7] - 2026-07-04

### Fixed

#### 修复 `scanAlbumMeta` 在 Windows 上完全失效 + 专辑/季元数据按 Emby 标准重整

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨核心修复：改用 `filepath.Rel` 校验目录归属，**取代** `strings.HasPrefix(absDir, root)`。旧实现在 Windows 上当 `Media.Dir` 来自 yaml（用 `/` 分隔符）而 `absDir` 来自 `filepath.Abs`（用 `\`）时永远返回 `false`，导致函数**所有 Emby 元数据识别都早期 return**。这一 bug 自 v0.4.5 引入 Emby 风格专辑元数据以来一直存在。修复后 `小猪佩奇(2004)/folder.jpg`、`banner.jpg`、`tvshow.nfo`、`seasonXX-poster.jpg`、`Season 1/folder.jpg`、`<video>.nfo` 等元数据全部能被正确识别入库。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨封面/横幅识别改为「候选收集 + 优先级选择」模式：循环中记录 `stem → 文件名` 候选 map，循环结束后按 `albumCoverNames`（`folder` > `poster` > `cover` > `albumart` > `albumartwork`）和 `albumBannerNames`（`banner` > `backdrop` > `fanart`）的优先级挑出最终值。`os.ReadDir` 顺序不保证按字母序返回，旧实现「先到先得」会导致 `backdrop.jpg` 抢先于 `banner.jpg` 被识别。`pickByPriority` 为新增辅助函数。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨横幅不再在季目录识别：Emby 风格是「所有季共用专辑根的 `banner.jpg`」，季的 `AlbumMeta.banner_path` 保持 `nil`，由 `ServeAlbumBanner` 兜底到专辑横幅。季内即使有冗余的 `backdrop.jpg` / `banner.jpg` / `fanart.jpg` 也不会被错误地当作季横幅。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨季描述 nfo 改为「内容优先」策略：新增 `pickNFOPathByContent`，若 `season.nfo`（Emby 标准）解析出非空 `<plot>` 则用它，否则回退到 `tvshow.nfo`（兼容 Emby 部分刮削后的冗余文件）。旧实现在季目录下用「先到先得」，导致 `season.nfo` 的空 `<plot />` 覆盖了 `tvshow.nfo` 的实际季描述。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** AlbumMeta upsert 改用 `Select("cover_path", "banner_path", "nfo_path", "description")` 显式指定更新字段：这样当 Emby 文件被用户删除、对应字段变为 `nil` 时，**旧值会被清空**而不是被 GORM 默默跳过 `nil` 值。

- **后端 `scanner/scanner.go` (`upsertSeasonCover`)** 季封面回填改为「只在季自身没有封面时设置」：季根的 `folder.jpg` 优先于专辑根的 `seasonXX-poster.jpg`（Emby 标准），避免占位季封面把季根封面覆盖掉。

- **后端 `scanner/scanner.go` (`parseNFOPlot`)** 自动去除 `<![CDATA[ ... ]]>` 包装：Emby 风格常把 `<plot>` 内容写成 CDATA，旧实现保留包装字符让前端展示 `<![CDATA[...]]>`。修复后单集描述（来自 `<video>.nfo`）和专辑/季描述（来自 `tvshow.nfo` / `season.nfo`）都能拿到干净的纯文本。

### Notes

- 验证脚本 `scripts/verify-emby.ps1` 已可通过：注册用户 → 触发扫描 → 拉取 `/api/v1/albums` + `/api/v1/media` 打印元数据。`小猪佩奇(2004)` 专辑的输出现在完全符合 Emby 标准：
  - 专辑 `cover_path` = `folder.jpg`
  - 专辑 `banner_path` = `banner.jpg`
  - 专辑 `description` = `tvshow.nfo` 的 `<plot>`（去 CDATA）
  - `Season 1` `cover` = `Season 1/folder.jpg`、`banner` 继承专辑 `banner.jpg`、`description` = `tvshow.nfo` 的内容（`season.nfo` 的 plot 为空，自动回退）
  - `Season 2..8`（无目录）`cover` = 专辑根的 `seasonXX-poster.jpg`、`banner` 继承专辑 `banner.jpg`
  - 单集 description 全部为干净的纯文本（无 CDATA 包装）
- 调试工具 `backend/cmd/check-meta`：打印指定 DB 的 `AlbumMeta` + `MediaFile` 表内容，便于排查元数据问题。

## [v0.4.6] - 2026-07-04

### Added

#### 季卡片 ⋮ 菜单 + 专辑根目录元数据二次扫描 + 横幅描述展示

- **后端 `scanner/scanner.go` (`upsertMedia`)**：季内媒体入库完成后，同步扫描专辑根目录的 Emby 元数据（`banner.jpg` / `folder.jpg` / `tvshow.nfo`），避免只识别到 `Season 1/folder.jpg` 而忽略专辑根的横幅 / 封面 / 描述。`Season 1` 内的媒体入库时同样会触发专辑根的扫描，让「小猪佩奇(2004)」等目录的 `banner.jpg` 横幅能被正确入库。
- **后端 `handlers/delete.go`** ✨新增 `DeleteSeason`：`DELETE /albums/:name/sub/:sub`（X-Delete-Password 校验）递归删除季目录、批量软删除该季下所有 MediaFile，并清理 AlbumMeta 中对应季的元数据记录。防路径穿越 + 容忍期望季目录尚未创建的边界情况。
- **后端 `router/router.go`**：注册 `DELETE /albums/:name/sub/:sub` 路由。
- **前端 `components/SeasonCardMenu.tsx`** ✨新增：季卡片 ⋮ 菜单共享组件，菜单项为「🖼️ 上传季封面（自动以 `folder.<ext>` 命名写入季目录）/ 🗑️ 删除该季（密码确认）」。触发器位置、z-index 可定制，与 `NoteCardMenu` 风格保持一致。
- **前端 `api/index.ts`**：`mediaApi.deleteSeason` 新增（带 `X-Delete-Password` 头）。
- **前端 `pages/Home.tsx`**：
  - `SeasonGrid` 集成 `SeasonCardMenu`：季卡片右下角显示 ⋮ 按钮，点击可上传季封面或删除该季（密码确认），操作完成后通过 `onChanged` 回调刷新专辑数据。GridView 父组件传入 `load` 作为回调。
  - `AlbumBanner` 增强：横幅高度由 180 → 220 px、宽度铺满 Card 容器；底部叠加专辑 / 季名 + 副标题（"· 专辑名"）+ 描述（最多 2 行，溢出省略），让 Emby 风格专辑页更接近原生 Emby 视觉。

### Notes

- 季删除是危险操作（递归删除季目录及全部媒体 / 字幕 / 封面 / nfo），前端通过 `PasswordConfirmModal` 要求用户输入登录密码二次确认；密码错误返回 401 不关闭弹窗，便于重试。
- 「期望季」（仅有 `season02-poster.jpg` 资源但 `Season 2` 目录尚未创建的情况）当前仍由 `buildSubs` 自动建占位卡（`count=0`）；如需在 v0.4.6 之后删除该占位季，可通过「新建媒体」让扫描自动建立季目录，或直接删除对应的 `seasonXX-poster.jpg`。

## [v0.4.5] - 2026-07-04

### Added

#### 学习页面 ⋮ 菜单 + 专辑置顶 + 部分 Emby 刮削兼容

- **后端 `models/models.go`**：
  - `StudyNote` 新增 `Pinned bool` 字段（带索引），用于学习页面级别的用户置顶。
  - ✨新增 `AlbumPin` 模型：专辑置顶（每个用户可置顶多个专辑，按 `sort` 升序展示在首页最前）。联合唯一索引 `(user_id, album)`。
- **后端 `database/database.go`**：`AutoMigrate` 加入 `StudyNote.Pinned` 与 `AlbumPin`。
- **后端 `scanner/scanner.go`**：在已有 Emby 元数据识别基础上增强对「部分刮削」专辑的兼容：
  - `findCover` 继续支持 `<basename>-thumb.jpg` 缩略图优先。
  - `scanAlbumMeta` 在专辑根目录识别 `seasonXX-poster.<ext>` 作为对应季的封面（季目录名 `Season XX` / `seasonXX` / `SeasonXX`），并支持 `seasonXX-banner.<ext>` 作为季横幅，让「小猪佩奇(2004)」等只有部分 Emby 资源的目录也能正常显示封面、季封面、横幅与描述。
- **后端 `handlers/note.go`**：
  - `updateNoteReq` 新增 `pinned` 字段，`UpdateNote` 支持置顶切换。
  - ✨新增 `ToggleNotePin`：`POST /notes/:id/pin` 切换学习页面置顶状态，返回 `{pinned: bool}`。
  - `DeleteNote` 增强：要求 `X-Delete-Password` 请求头（bcrypt 校验当前用户密码），与「删除专辑 / 删除文件 / 删除目录」二次确认保持一致。
- **后端 `handlers/album_pin.go`** ✨新增：`POST /albums/:name/pin` 切换专辑置顶状态（按用户隔离，已置顶则取消，否则按 `MAX(sort)+1` 追加）。
- **后端 `handlers/media.go`**：`ListAlbums` 拉取当前用户的 `AlbumPin` 列表，先按 `sort` 升序拼接置顶项，再拼接未置顶项；`Album` 返回新增 `pinned` / `pin_order` 字段。
- **后端 `router/router.go`**：注册 `POST /albums/:name/pin`、`POST /notes/:id/pin` 两条新路由。
- **前端 `types/index.ts`**：`Album` 新增 `pinned? / pin_order?` 字段；`StudyNote` 新增 `pinned?` 字段。
- **前端 `api/index.ts`**：`mediaApi.togglePinAlbum` 切换专辑置顶；`noteApi.pin` 切换学习页置顶；`noteApi.delete` 接受可选 `password` 并附带 `X-Delete-Password` 头。
- **前端 `components/NoteCardMenu.tsx`** ✨新增：学习页面卡片 ⋮ 菜单共享组件，统一实现「置顶 / 取消置顶 → 重命名 → 上传封面 → 删除（密码确认）」四项操作，触发器与 z-index 可定制，首页 / 网格视图共用同一份逻辑。
- **前端 `components/EmbyHome.tsx`**：
  - `AlbumCard` ⋮ 菜单移至卡片右下角，菜单项最上方为「置顶 / 取消置顶」，依次为「重命名专辑 / 上传封面图 / 删除专辑（密码确认）」，置顶卡片在顶部叠加 📌 徽标。
  - `NoteCard` 集成 `NoteCardMenu`：右下角 ⋮ 菜单 + 置顶徽标 + 标题展示逻辑保持原样。
- **前端 `pages/Home.tsx`**：网格视图的 `NoteCard` 同步集成 `NoteCardMenu`（z-index 调整为 3 以避免被 Card 浮层遮挡），将原右上角的「专辑名」标签替换为「📌 置顶」徽标。

### Notes

- 学习页面「上传封面」通过 `noteApi.uploadImages` 上传图片，新图片会追加到 `images` 数组的首位（首图用于卡片展示）。
- 专辑 / 学习页删除时如不传登录密码将返回 401，便于前端控制「必须二次确认」的 UX 流程（当前统一通过 `PasswordConfirmModal` 引导用户输入）。
- 部分 Emby 刮削的目录（缺少 `season.nfo` 但有 `seasonXX-poster.jpg`）现在也能正确显示季封面；`scanAlbumMeta` 对每张图分别记录候选，支持后续增补资源后自动升级。

## [v0.4.4] - 2026-07-04

### Added

#### Emby 风格专辑元数据识别 + 季视图

- **后端 `models/models.go`** ✨新增 `AlbumMeta` 模型：专辑 / 季级别的元数据（封面 / 横幅 / 描述 / nfo 路径）。联合唯一索引 `(album, sub_album)`：sub_album 为空字符串表示专辑本身，非空表示该专辑下某季（子目录）。
- **后端 `database/database.go`**：`AutoMigrate` 加入 `AlbumMeta`。
- **后端 `scanner/scanner.go`**：
  - `findCover` 新增 Emby 风格 `<basename>-thumb.jpg` 缩略图识别——剥离 `-thumb` 后缀匹配视频同基名（最优先），再回退到 Kodi 同名图、兜底首帧 / 颜色块。
  - 新增 `scanAlbumMeta(dir, album, subAlbum)`：扫描指定目录识别 `folder.jpg/poster.jpg/cover.jpg`（封面）、`banner.jpg/backdrop.jpg/fanart.jpg`（横幅）、`season.nfo/tvshow.nfo/album.nfo`（描述），写入 / 更新 `AlbumMeta` 表。`upsertMedia` 完成后调用，将专辑与季的 Emby 元数据持久化。
- **后端 `handlers/album_meta.go`** ✨新增：专辑 / 季元数据 API。
  - `POST /albums/:name/cover?sub=xxx`：上传封面（multipart `file` 字段，限制 jpg/png/webp/gif ≤ 10MB），写入对应目录并统一命名为 `folder.<ext>`（同时清理旧的 `folder/poster/cover.*` 候选），更新 `AlbumMeta.cover_path`。
  - `GET /albums/:name/cover?sub=xxx`：返回封面图片（Content-Type 按扩展名设置）。
  - `GET /albums/:name/banner?sub=xxx`：返回横幅图片。
  - 路径安全：`albumDir` 拒绝 `..` 与分隔符，并校验结果必须在 media root 内。
- **后端 `handlers/media.go`**：`ListAlbums` 新增 `cover_path / banner_path / description / has_seasons` 字段。一次查询拉取所有 `AlbumMeta`，专辑本体 / 每个季分别关联对应元数据。
- **后端 `router/router.go`**：注册 3 条新路由（cover 上传 + cover / banner 获取）。
- **前端 `types/index.ts`**：`Album` / `SubAlbum` 新增 `cover_path? / banner_path? / description?` 字段；`Album` 新增 `has_seasons?` 标志。
- **前端 `api/index.ts`**：`mediaApi` 新增 `uploadAlbumCover / albumCoverUrl / albumBannerUrl`，支持 `subAlbum` 参数。
- **前端 `components/EmbyHome.tsx`**：
  - `AlbumCard` 新增「⋮」菜单：重命名专辑（调用 `renameAlbum`） / 上传专辑封面（自动以 `folder.<ext>` 命名写入专辑目录）。
  - 「我的专辑」卡片优先使用 `album.cover_path`（来自 Emby 扫描或用户上传），无则回退到自动挑选的代表媒体封面。
- **前端 `pages/Home.tsx`**：
  - 进入专辑页时若专辑有季（`has_seasons` 或 `sub_albums.length > 0`），默认进入「季选择视图」——以季卡片网格展示，仅显示季名、季封面（来自 `cover_path / banner_path`）、季描述与「已看 X/Y」徽标，点击季卡片进入对应季。整体风格类似 Emby「Seasons」行。
  - 专辑详情页头部新增 `AlbumBanner` 组件：16:5 横向横幅，优先 `banner_path`，回退到 `cover_path`；底部叠加专辑 / 季名 + 描述。
  - 季 Tabs 与子专辑 Tags 同步显示「已看 X/Y」。
  - 修复 `SubAlbum` 类型与 `FolderOutlined` 图标缺失的 TypeScript 错误。

### Notes

- Emby 元数据优先级：`<basename>-thumb.jpg`（视频） > `folder.jpg/poster.jpg/cover.jpg`（专辑 / 季封面） > `banner.jpg/backdrop.jpg/fanart.jpg`（横幅） > `season.nfo/tvshow.nfo/album.nfo`（描述）。
- 季视图触发条件：专辑下存在任何 `sub_album`（子目录）时自动启用；单层专辑（无季）保持原网格视图不受影响。
- 用户上传封面会自动清理同目录已有的 `folder/poster/cover.*` 候选图，避免同名堆积；上传后首页与专辑页会即时刷新。

## [v0.4.3] - 2026-07-04

### Added

#### 同名媒体配对（视频 ↔ 音频 tab 切换）

- **后端 `models/models.go`**：`MediaFile` 新增 `PairedMediaID *uint` 字段（带索引）。约定：仅在 video 上指向同目录同基名（仅扩展名不同）的 audio；audio 端保持 NULL，便于列表 SQL 直接过滤被配对项。
- **后端 `scanner/scanner.go`**：`upsertMedia` 完成后调用新增的 `linkPairedMedia`，按"同目录 + 去扩展名同基名 + 类型互补"规则建立配对；`handleEvent` 删除事件中先清理被删文件的 `paired_media_id` 引用，避免死链。
- **后端 `handlers/filemanager.go` / `handlers/delete.go`**：手动删除（按 id / 路径 / 目录）路径同步清理 `paired_media_id`，被删 audio 不会留下野 video 配对。
- **后端 `handlers/media.go`**：
  - `ListMedia` SQL 层 `WHERE NOT (type='audio' AND id IN (SELECT paired_media_id ...))` 排除被配对的 audio。
  - `ListAlbums` count/played 统计同样排除被配对 audio，避免同一内容计两次。
  - `GetMedia` 返回 `paired_media` 字段（id/name/type/path），供播放器渲染 video/audio 切换 tab。
- **后端 `handlers/record.go`**：`ListRecent` 同步排除被配对 audio，首页最近播放行不重复展示。
- **前端 `types/index.ts`**：`MediaFile` 新增 `paired_media_id?`；新增 `PairedMedia` 与 `MediaDetailResponse` 类型。
- **前端 `pages/Player.tsx`**：从 `GetMedia` 读取 `paired_media` 并下传给 `MediaPlayer`。
- **前端 `components/MediaPlayer.tsx`**：新增 video/audio 切换区（`Tag.CheckableTag`，仅在存在配对时显示）。切换时记录原 currentTime 写入 `pendingSeekRef`，新 `onLoadedMetadata` 用该值回放（视频/音频时长不同，按当前媒体 duration 自动收敛）。媒体 id、字幕、播放进度与历史记录仍以主媒体为准，切换不影响学习统计。

### Notes

- 仅"同目录 + 同基名 + 类型互补"才会配对；`a.mp3` 与 `a.mp4` 在不同目录时各自独立展示。
- 配对 audio 仍保留自己的 `SentenceProgress / PlayRecord`（历史学习数据），不级联删除；列表与最近播放行只展示主媒体（视频优先）。
- 切换 tab 仅换流 URL 与 `<video>/<audio>` 元素；字幕、收藏、句末停顿、循环次数等状态保持。

## [v0.4.2] - 2026-07-03

### Added

#### 上传页文件管理

- **后端 `handlers/filemanager.go`** ✨新增：5 个文件管理 API：
  - `POST /media/mkdir`：新建目录（含路径穿越防护）
  - `DELETE /media/dir?path=...`：递归删除目录（磁盘 + DB 批量软删除）
  - `DELETE /media/file?path=...`：删除单个文件（磁盘 + DB 记录 + 关联字幕/封面）
  - `PUT /media/path/rename`：重命名文件/目录（磁盘 + DB 路径更新 + album/sub_album 重算）
  - `PUT /media/path/move`：移动文件/目录（磁盘 + DB 路径更新 + album/sub_album 重算）
- **后端 `router/router.go`**：注册 5 条新路由。
- **前端 `api/index.ts`**：`mediaApi` 新增 `mkdir / deleteDir / deleteFile / renamePath / movePath` 方法。
- **前端 `pages/Upload.tsx`**：全面改造：
  - 每个文件/目录右侧 `⋮` 下拉菜单：重命名、移动到、删除
  - 目录浏览卡片顶部「新建目录」按钮 + Modal
  - 重命名 Modal、移动 Modal（输入目标路径）
  - 删除确认 Modal（区分文件/目录提示）

#### 关于页面

- **前端 `pages/About.tsx`** ✨新增：Hero 区 + 6 张功能卡片 + 5 步使用指南 + 技术栈标签 + 作者信息（tabortao）。
- **前端 `layouts/MainLayout.tsx`**：侧边栏增加「💡 关于」菜单项。
- **前端 `router/index.tsx`**：注册 `/about` 路由。

### Fixed

#### 主题切换真正生效

- **前端 `App.tsx`**：移除 `key={theme}` 方案（antd v5 CSS 变量在 key 变化时不会自动更新），改用 `useEffect` + `document.documentElement.style.setProperty('--ant-color-primary', ...)` 直接操作 CSS 变量。

#### 页面标题重复与宽度

- **`backend/config.yaml`**：数据库路径改为绝对路径（防止从不同目录启动时路径解析错误）。
- **前端 `pages/Settings.tsx`**：移除 `maxWidth: 960` 和重复标题，与其他页面保持一致。
- **前端 `pages/Records.tsx`** / **`pages/Upload.tsx`**：移除重复标题，由 MainLayout Header 统一显示。

#### Header 用户交互

- **前端 `layouts/MainLayout.tsx`**：头像点击直接跳转 `/settings`；退出登录改为独立 `LogoutOutlined` 图标按钮。

#### 专辑文件默认排序

- **前端 `pages/Home.tsx`**：GridView 默认 `sort = 'name'`，按名称时 `order: 'asc'`。
- **后端 `handlers/media.go`**：`ListMedia` 默认排序改为 `name ASC`。

## [v0.4.2] - 2026-07-03

### Fixed

#### 主题切换整体配色同步

- **前端 `theme/themes.ts`**：每套主题均开启 `cssVar: { key: 'ant' }`，让 antd v5 自动将 token（colorPrimary、colorBgLayout、borderRadius 等）写入 `:root` 级 CSS 变量（如 `--ant-color-primary`）。
- **前端 `App.tsx`**：移除 `useEffect` 手动 setProperty 的代码，完全依赖 antd 的 cssVar 机制，确保所有 antd 组件跟随主题切换。
- **前端 `index.css`**：将卡片 hover 阴影、滚动条颜色从硬编码 `rgba(255,122,69,...)` 改为 `color-mix(in srgb, var(--ant-color-primary) xx%, transparent)`，跟随主题变化。
- **前端 `layouts/MainLayout.tsx`**：Logo 渐变、Header 边框/阴影、头像渐变背景均改用 `var(--ant-color-primary)` + `color-mix` 替代硬编码橙色。
- **前端 `components/EmbyHome.tsx`**：专辑卡片进度条、封面占位渐变、hover 阴影跟随主题。
- **前端 `pages/Records.tsx`**：所有 12 处硬编码 `rgba(255,122,69,...)` / `#FF7A45` / `#FFB37A` 替换为 CSS 变量。
- **前端 `pages/Settings.tsx` / `pages/Upload.tsx` / `pages/Home.tsx` / `pages/About.tsx`**：剩余硬编码橙色替换为 `var(--ant-color-primary)`。

#### 专辑文件可点击排序

- **前端 `pages/Home.tsx`**：GridView 顶部新增排序工具栏（标签 + 升序/降序切换按钮），点击即可在名称升序/降序间切换，即时刷新列表。

#### 专辑文件名称排序

- **后端 `handlers/media.go`**：`ListMedia` 默认排序保持 `name ASC`（已是正确值），修改已在 v0.4.2 完成。**注：需重启后端让修改生效。**

#### 专辑升降序排序不生效

- **前端 `pages/Home.tsx`**：修复点击「升序/降序」按钮不刷新列表的问题。两处根因：
  1. `Home` 的 `order` 状态缺少 setter（`const [order] = useState(...)`），且 `GridView` 内的 `gridOrder` 状态变化未加入 `load` 的依赖数组，导致切换排序方向既无法回到升序、也不会触发重新拉取。改为将 `order`/`setOrder` 提升至 `Home` 并下传，移除冗余的 `gridOrder` 状态与同步 `useEffect`，按钮直接切换 `order` 并即时刷新。
  2. 修复后仍不生效：进入专辑页时 `GridView` 在 `if (albumFilter)` 分支里把媒体和学习页合并后，**无条件**用 `updated_at` 倒序重排，把后端按名称/时长返回的顺序覆盖掉了。改为根据 `sort` 取统一排序键（`name` → 名称/标题；`file_modified_at` → 更新时间；`duration` → 时长，笔记排末尾），并按 `order` 升降序。

#### 学习统计年度翻页失效

- **后端 `handlers/stats.go`**：`getYearStats` 此前忽略 `base` 参数、始终以 `time.Now().Year()` 为终点，导致前端「年度」Tab 的上/下翻页按钮毫无效果。改为以 `base.Year()` 作为 5 年范围的终点，`IsCurrent` 仍以真实当前年份为准。

#### 学习统计周日界偏移

- **后端 `handlers/stats.go`**：`getWeekStats` 未将 `base` 归一到本地 0 点。`time.Parse("2006-01-02")` 返回 UTC 0 点、`time.Now()` 带当前时分秒，两者都会让每日统计窗口偏移，使某天的播放/背诵记录错算到相邻天。新增 `time.Date(base.Year(), base.Month(), base.Day(), 0,0,0,0, time.Local)` 归一化，确保按本地时区自然日切分。

#### 关于页面宽度

- **前端 `pages/About.tsx`**：移除顶层 `maxWidth: 960` 限制，与首页/设置页等页面保持同一全宽布局。

#### 删除二次密码确认

- **后端 `handlers/filemanager.go`** / **`handlers/delete.go`**：所有删除端点（`DeleteMedia` / `DeleteDir` / `DeleteFile` / `DeleteAlbum`）统一接入 `verifyUserPassword` 校验。从 `X-Delete-Password` header（兼容 `?password=` query）读取登录密码，bcrypt 校验当前用户密码，失败返回 401。
- **前端 `components/PasswordConfirmModal.tsx`** ✨新增：通用二次确认 Modal，含密码输入、错误提示、loading 态、密码错误不关闭。
- **前端 `api/client.ts`**：响应拦截器对带 `X-Confirm-Purpose: delete` 标记的 401 不清 token、不跳登录页（区分 token 失效 vs 密码错误）。
- **前端 `api/index.ts`**：`mediaApi.remove / deleteDir / deleteFile / deleteAlbum` 接受可选 `password` 参数，自动附带 `X-Delete-Password` 与 `X-Confirm-Purpose` 头。
- **前端 `pages/Home.tsx` / `pages/Upload.tsx` / `pages/Albums.tsx`**：删除操作改为先弹密码确认框，正确密码才真正调用删除 API；密码错误保留弹窗以便重试。

### Added

#### 文件备注 Tab

- **后端 `models/models.go`**：新增 `MediaRemark` 模型（`user_id` + `media_id` 复合唯一索引），一个文件一条备注。
- **后端 `database/database.go`**：`AutoMigrate` 加入 `MediaRemark`。
- **后端 `handlers/remark.go`** ✨新增：`GET/PUT/DELETE /media/:id/remark` 三个端点，支持 upsert（一个文件一条）。
- **后端 `router/router.go`**：注册 3 条新路由。
- **前端 `types/index.ts`**：新增 `MediaRemark` 类型。
- **前端 `api/index.ts`**：`mediaApi` 新增 `getRemark / upsertRemark / deleteRemark`。
- **前端 `components/MarkdownEditor.tsx`** ✨新增：通用 Markdown 编辑器（预览/编辑切换 + TTS 朗读 + 失焦保存回调），从 NoteEditor 提取，便于备注与学习页面共用。
- **前端 `components/MediaPlayer.tsx`**：在「全文 / 收藏句子」之后新增「备注」Tab。默认预览态，点击「编辑原文」进入编辑；失焦自动保存。无字幕时自动定位到备注 Tab，字幕 Tab 仍可点击。

#### favicon + PWA 图标更新

- 将 `docs/Reference/favicon/` 下的 7 个图标文件复制到 `frontend/public/`：
  - `favicon.ico`、`favicon-16x16.png`、`favicon-32x32.png`
  - `apple-touch-icon.png`（180×180，iOS Safari）
  - `android-chrome-192x192.png`、`android-chrome-512x512.png`
  - `site.webmanifest`（更新 name/short_name/theme_color）
- **前端 `index.html`**：增加 `<link rel="icon">`（ico + 16/32 png）、`<link rel="apple-touch-icon" sizes="180x180">`、`<link rel="manifest" href="/site.webmanifest">`。
- **前端 `vite.config.ts`**：VitePWA manifest icons 指向 android-chrome-192/512；theme_color 改为 `#FF7A45`。

#### 关于页 GitHub 链接

- **前端 `pages/About.tsx`**：GitHub 链接改为 `https://github.com/tabortao/EchoSub`，颜色跟随主题。

## [v0.4.1] - 2026-07-03

### Fixed

#### 主题切换真正生效

- **前端 `App.tsx`**：移除 `key={theme}` 方案（antd v5 CSS 变量在 `key` 变化时不会自动更新），改为通过 `useEffect` 在 `document.documentElement.style` 上直接 setProperty 写入 `--ant-color-primary` 等 CSS 变量。切换主题时即时生效。

#### 页面标题重复与宽度不一致

- **`backend/config.yaml`**：数据库路径从相对路径 `data/echosub.db` 改为绝对路径 `D:/Code/Go/EchoSub/backend/data/echosub.db`，避免从不同目录启动时路径解析错误。
- **前端 `pages/Settings.tsx`**：移除页面内部 `maxWidth: 960` 和重复标题「⚙️ 设置」，与其他页面保持一致的宽度和 MainLayout 标题显示。
- **前端 `pages/Records.tsx`**：移除重复标题「📊 学习记录」，由 MainLayout Header 统一显示。
- **前端 `pages/Upload.tsx`**：移除重复标题「⬆️ 上传文件」，由 MainLayout Header 统一显示。

#### Header 用户交互优化

- **前端 `layouts/MainLayout.tsx`**：用户头像改为点击直接跳转 `/settings`；退出登录改为独立的 `LogoutOutlined` 图标按钮（在头像右侧），不再需要下拉菜单。移除 Dropdown 依赖。

### Added

#### 关于页面

- **前端 `pages/About.tsx`** ✨新增：关于页面，包含：
  - Hero 区（项目名、版本号、简介、标签）
  - 核心功能 6 张彩色卡片（逐句复读、TTS 朗读、专辑管理、标签系统、拖拽上传、学习记录）
  - 使用方法 5 步指南
  - 技术栈标签云
  - 作者信息（tabortao）
- **前端 `layouts/MainLayout.tsx`**：侧边栏菜单增加「💡 关于」入口，路由 `/about`。
- **前端 `router/index.tsx`**：注册 `GET /about` 路由。

#### 设置页面美化与响应式设计

- **前端 `pages/Settings.tsx`**：全面美化：
  - 外观主题卡片：更大尺寸、悬停上浮动画、选中态晕影
  - 学习偏好表单：双列响应式栅格（`xs={24} md={12}`），手机单列、桌面双列
  - 账户管理：头像区卡片化、密码表单双列布局
  - 说明区：6 个功能标签三列栅格（`xs={24} sm={12} lg={8}`）
  - 双列响应式栅格（`Col xs={24} md={12}`），手机端单列、桌面端双列

#### 专辑文件默认排序

- **前端 `pages/Home.tsx`**：GridView 默认 `sort = 'name'`；按名称排序时 `order: 'asc'`（其他排序保持 `desc`）。
- **后端 `handlers/media.go`**：`ListMedia` 默认排序从 `file_modified_at DESC` 改为 `name ASC`。

## [v0.4.0] - 2026-07-03

### Added

#### 界面主题切换（小学生审美 4 套主题）

- **后端 `models/models.go`**：`Setting` 模型新增 `Theme string` 字段（`size:32;default:'default'`）。
- **后端 `handlers/settings.go`**：`settingsReq` 新增 `Theme`；`validThemes` 白名单（`default/green/purple/blue`）；GET 返回与 PUT 写入均做兜底校验。
- **前端 `theme/themes.ts`** ✨新增：4 套主题定义——暖阳橙（默认）/ 清新绿野 / 梦幻紫蓝 / 天空蓝，每套含完整 antd token 覆写。
- **前端 `App.tsx`**：移除硬编码主题，改为读取 `useSettingsStore.theme` 动态应用 `getThemeConfig(theme)`。
- **前端 `store/settings.ts`**：`DEFAULTS` 新增 `theme: 'default'`。
- **前端 `types/index.ts`**：`Settings` 接口新增可选 `theme?: string`。
- **前端 `pages/Settings.tsx`**：新增「🎨 外观主题」卡片——4 个主题色块（含 emoji、名称、主色条），点击切换并持久化，当前主题显示勾选标记。

#### 收藏句子顺序播放

- **前端 `components/MediaPlayer.tsx`**：新增 `favoritePlayMode` 状态与 `favoritePlayModeRef/favoriteSetRef`；「收藏句子」Tab 增加「▶ 播放收藏」按钮，点击后自动切到 repeat 模式并跳到第一句收藏句；repeat 决策逻辑中，收藏播放模式下「下一句」目标从 `favoriteSet` 按索引升序取下一句收藏句，无更多收藏句时整体循环回第一句或结束播放。

#### 媒体封面播放次数徽标

- **前端 `pages/Home.tsx`**：GridView 媒体卡片封面右上角新增 `▶ {play_count}` 橙色 Tag（`play_count > 0` 时显示）。

#### 学习记录页面美化

- **前端 `pages/Records.tsx`**：
  - 汇总统计卡片：改为渐变背景 cover 样式（绿/橙/黄三色），含大字号数字、emoji 装饰、鼓励文字。
  - 周/月/年统计卡片：渐变背景 + 当前日阴影高亮 + 柱状图投影。
  - 汇总行（周/月/年共用）：改为独立渐变小卡片（播放/媒体/句子三色）。
  - 按专辑进度：卡片化布局 + 渐变进度条（`from/to`）+ 百分比显示。
  - 播放记录表：空状态自定义插画 + 表格斑马纹（通过 `rowClassName` + CSS 变量）+ 行悬停高亮。
- **前端 `index.css`**：新增 `.row-even` / `.row-odd` 斑马纹样式。

### Fixed

- **前端 `components/MediaPlayer.tsx`**：修复最后一句字幕 `repeat_count` 不增加的问题。
  - Normal 模式 `onEnded` 事件中，在循环/停止前补调 `incrementSentenceRepeat(lastIdx)`，解决媒体 `ended` 先于 `timeupdate(t>=end)` 触发导致的漏计数。
  - Repeat 模式 `allDone` 分支补调 `incrementSentenceRepeat(curIdx)`，确保最后一遍重复也被计数。

## [v0.3.1] - 2026-07-03

### Added

#### Header 全局扫描按钮

- **前端 `store/scan.ts`**：新建 `useScanStore`，保存 `scanning` 状态、`lastTriggeredAt` 时间戳与 `trigger()` 动作。`trigger()` 调用 `scanApi.trigger()`，成功后更新时间戳并每秒轮询 `/scan/status` 直到扫描结束。
- **前端 `layouts/MainLayout.tsx`**：Header 用户头像左侧插入扫描按钮（`<ReloadOutlined spin />` + `<Spin>` 包裹），点击触发 `useScanStore.trigger()`；扫描中按钮禁用并 spinner 动画；成功后 `message.success('媒体文件夹扫描已启动')`。
- **前端 `components/EmbyHome.tsx`**：使用 `useAuthStore` 同时也订阅 `useScanStore.lastTriggeredAt`；该值变化即重新获取专辑、最近播放、学习笔记等数据，实现扫描后首页及时刷新。

#### Emby 风格专辑详情（季 Tabs + 智能封面 + 观看进度）

- **后端 `handlers/media.go`**：`ListAlbums()` 增加 `played` 维度——album 层与每个 sub_album 层都返回「当前用户有过播放记录的媒体数」。WHERE 增加 `deleted_at IS NULL` 过滤。
- **前端 `types/index.ts`**：`Album` 与 `SubAlbum` 接口均新增可选 `played?: number` 字段。
- **前端 `components/EmbyHome.tsx`**：`AlbumEntry` 新加 `played` 字段；`AlbumCard` 移除冗余「最近播放」文字，改为「已看 X/Y」徽标 + 底部微进度条；专辑卡片按 `lastPlayedAt` 倒序排列。
- **前端 `pages/Home.tsx`**：专辑详情页的子专辑筛选从 Select 下下拉改为 Ant Design `<Tabs>` 横滑标签——「全部」+ 每个子专辑（带「已看/总数」小 Tag）。

#### 最近播放接口按媒体_id 去重

- **后端 `handlers/record.go`**：新增 `ListRecent()` Handler——子查询按 `media_id, MAX(last_played_at)` 分组取最近一条，JOIN 过滤 `media_files.deleted_at IS NULL`，限制 `?limit`（默认 20，最大 100）。
- **后端 `router/router.go`**：注册 `GET /records/recent?limit=N`。
- **前端 `api/index.ts`**：`recordApi` 新增 `recent(limit?)` 方法。
- **前端 `components/EmbyHome.tsx`**：`useEffect` 中 `recordApi.list()` 替换为 `recordApi.recent(20)`；继续学习列表数据更准确（每个媒体一条最近记录）。

### Changed

- **后端 `handlers/record.go`**：`ListRecords()` 在 Preload 后剔除 `Media.ID == 0` 的幽灵记录（关联媒体已被软删除时 GORM Preload 会返回零值结构），避免前端渲染访问 `undefined.name`。
- **后端 `handlers/stats.go`**：`getWeekStats / getMonthStats / getYearStats` 三个函数内所有 `PlayRecord / SentenceProgress` 聚合查询都增加 `JOIN media_files ... AND media_files.deleted_at IS NULL`，已删媒体的学习记录不再进入统计。

### Fixed

- **前端 `pages/Records.tsx`**：
  - 初始加载失败（后端 500 / 网络错误）不再静默 `catch {} ignore`，改为 `Alert` 错误提示 + 重试按钮。
  - 捕捉 `p.data != null` 的边界，`message.error` 输岀可读错误。
  - Table「媒体名称」列的 `dataIndex: ['media','name']` 改为 render 函数：关联媒体存在时显示可点击链接、缺失时显示灰色「（已删除媒体 #id）占位。
  - 「专辑」列改用 `mediaAlbum()` 辅助函数安全访问。

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
