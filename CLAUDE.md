# CLAUDE.md — EchoSub AI 协作指南（汉语版）

> 本文件是给 AI 助手（Claude Code、Trae、Cursor 等）在 EchoSub 仓库内协助完成开发任务的工作准则。
>
> 详细历史变更参见 [docs/ChangeLog.md](docs/ChangeLog.md)，用户面向文档参见 [README.md](README.md)，需求文档参见 [docs/需求文档.md](docs/需求文档.md)。

## 一、核心原则

你是 AI 编程助手，在本仓库内协助完成开发任务。首要目标是**按计划稳定推进、保持改动可验证**。

1. **文件驱动** — 决策写进 [docs/PLAN.md](docs/PLAN.md) / [docs/TASKS.md](docs/TASKS.md)，不依赖聊天记忆。
2. **单任务聚焦** — 一次只做一件事，做完再下一件；不在一次会话中跨任务合并改动。
3. **测试先行** — 先写测试定义预期，再写实现代码，保证结果的正确性。
4. **功能解耦** — 每个模块独立可测，不耦合无关逻辑；单文件 ≤ 500 行，单函数 ≤ 50 行。
5. **逐步验证** — 每次改动立即可运行、可检查，不攒大变更。
6. **注释完善** — 文件、函数、核心逻辑必须有中文文档注释，符合 Go / TypeScript 注释规范。
7. **文档同步** — 代码改完，立刻更新 [docs/TASKS.md](docs/TASKS.md)（勾选任务、记录完成时间）和 [docs/PLAN.md](docs/PLAN.md)（里程碑进度）。
8. **最小改动** — 只改当前任务相关的文件和代码，不做额外重构。
9. **类型安全** — 优先使用类型安全写法，避免 `any`、避免类型断言。
10. **版本号** — 每次完成修改后，更新 [docs/ChangeLog.md](docs/ChangeLog.md) 的版本号（格式 `v0.1.0`），每天递增一次。

## 二、项目概述（Project Overview）

EchoSub 是一款**自托管的 Web 应用**，用于语言学习与文本背诵。用户将视频 / 音频 + 字幕文件放入被监听的文件夹，EchoSub 会自动发现、按专辑（Emby 风格，支持季 / 海报 / 横幅）分组，并提供**逐句复读播放器**（可配置暂停 / 循环 + 逐句进度跟踪）。

- **后端**：Go 1.26 · Gin · GORM · SQLite (`glebarez/sqlite`，CGO-free) · JWT · fsnotify
- **前端**：React 19 · TypeScript 6 · Vite 8 · Ant Design 6 · zustand · axios · react-router-dom 7
- **基础设施**：Docker 多阶段构建 · docker-compose · GitHub Actions (GHCR 多架构)

## 三、常用命令（Common Commands）

### 后端（在 `backend/` 目录执行）

```powershell
# 刷新 PATH（Go 安装在 D:\Code-E\Go\bin，新会话可能未加载）
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$env:GOPROXY = "https://goproxy.cn,direct"   # 中国大陆网络

go run ./cmd/server          # 启动开发服务器（默认 :8080）
go build ./...               # 编译检查
go vet ./...                 # 静态检查
go test ./... -v             # 单元测试（字幕解析器）
```

### 前端（在 `frontend/` 目录执行）

```powershell
pnpm install
pnpm dev                     # Vite 开发服务器（:5173，/api 代理到 :8080）
pnpm build                   # tsc -b && vite build → frontend/dist
pnpm lint
```

### 集成测试（在仓库根目录执行）

**首选：Python 脚本（v1.1.0 起）**。解决 PowerShell 5.1 + 输出重定向 + Start-Job 组合下 Ok/Bad 静默丢失、try/foreach 嵌套解析失败等长期遗留问题。

```powershell
python scripts/test-api.py
```

依赖：Python 3.8+、requests 库、Go（已在 PATH）。脚本会在 `:18080` 端口启动后端（使用 `test-media/` 目录 + 临时 SQLite DB），跑完 **45 项** 端到端 API 检查后清理。

**首次运行**会触发内置 ECDICT 词库导入（约 77 万词条 / ~70s），启动超时设 120s；已存在数据时秒过。

> 旧 PowerShell 脚本 [scripts/test-api.ps1](scripts/test-api.ps1) 已停止维护，仅作参考。

## 四、开发环境注意事项（Dev Environment Notes）

- **Go 路径**：安装位置 `D:\Code-E\Go\bin`，新终端可能未加载，需按上面命令从注册表刷新 PATH。
- **Shell**：Windows PowerShell 5.1 默认 GBK 解码不支持 UTF-8 CJK，`.ps1` 脚本须保持纯 ASCII，或使用 PowerShell 7+。
- **模块代理**：`GOPROXY=https://goproxy.cn,direct` 加速中国大陆网络下载。
- **双进程开发**：后端 `:8080`、前端 `:5173`。Vite 通过 `/api` 代理到 `:8080`。`go run` **不**支持热重载，后端修改后需手动重启。
- **后端热重启替代方案**：`go run` 配合 `air` / `wgo` / `reflex` 等文件监听工具；当前仓库未集成，按需自取。

## 五、架构（Architecture）

### 后端目录结构（`backend/`）

```
backend/
├── cmd/server/main.go          # 入口：config → DB → scanner → router → SPA fallback
├── internal/
│   ├── config/                 # Env (ECHOSUB_*) > config.yaml > defaults
│   ├── database/               # GORM + SQLite (WAL, single-writer conn)
│   ├── models/                 # User, MediaFile, Tag, PlayRecord, SentenceProgress,
│   │                           # Setting, StudyNote, MediaRemark, AlbumMeta,
│   │                           # AlbumPin, EntityTag
│   ├── middleware/             # AuthRequired (JWT), CORS
│   ├── handlers/               # auth, media, tag, entity_tag, note, remark, record,
│   │                           # scan, settings, album_meta, album_pin,
│   │                           # filemanager, delete
│   ├── router/                 # 路由注册（/api/v1）
│   ├── scanner/                # 全量扫描 + fsnotify 监听 + Emby 元数据识别
│   └── utils/                  # 响应辅助（OK/Fail）
└── pkg/subtitle/               # SRT/VTT 解析器（公共，可复用）
```

### 前端目录结构（`frontend/src/`）

```
frontend/src/
├── api/                        # axios 客户端（JWT 拦截器）+ API 模块
├── components/                 # MediaPlayer, MediaCover, EmbyHome, NoteCardMenu,
│                               # SeasonCardMenu, TagManagerModal, PasswordConfirmModal,
│                               # AlbumBanner, NoteEditor (in pages/)
├── layouts/                    # MainLayout (Ant Design sider)
├── pages/                      # Home, Albums, Tags, Records, Settings,
│                               # Player, NoteEditor, Upload, About, Login
├── router/                     # ProtectedRoute
├── store/                      # zustand: auth (localStorage 持久化), settings, scan
├── types/                      # TS 类型定义（与后端 DTO 对齐）
└── utils/                      # formatDuration, formatRelative 等
```

### API 契约

所有接口位于 `/api/v1` 下。公开接口：`POST /auth/register`、`POST /auth/login`、`GET /health`。
其他接口需要 JWT，方式二选一：
- `Authorization: Bearer <token>` 请求头
- `?token=<jwt>` 查询参数（用于 HTML5 `<video>` / `<audio>` 等无法设置请求头的元素）

完整接口表见 [README.md#api-概览](README.md#-api-概览)。

## 六、关键约定与坑点（Critical Conventions & Gotchas）

### 1. 媒体流认证 — 查询参数 token 兜底

`<video src>` / `<audio src>` 无法设置 `Authorization` 请求头。
`AuthRequired` 中间件同时支持**请求头**与 `?token=` 查询参数。
前端 `mediaApi.streamUrl(id, token)` 必须附加 token：

```ts
streamUrl: (id: number, token: string) => `/api/v1/media/${id}/stream?token=${encodeURIComponent(token)}`
```

`MediaPlayer` 从 `useAuthStore` 取出 `token` 并传入。
**绝对不要**回退到「仅请求头」鉴权，媒体播放会 401。

### 2. 字幕 BOM 剥离

SRT/VTT 文件可能带 UTF-8 BOM (`\ufeff`)。`ParseFile` 与 `ParseSRT` 都会先调用 `strings.TrimPrefix(content, "\ufeff")`。
不做此处理时，第一条索引行变成 `\ufeff1`，`strconv.Atoi` 失败，第一句会被丢弃。
有 `TestParseSRT_BOM` 回归测试，必须保持绿色。

### 3. 字段命名 — `sentence_repeat` 与 `repeat_count` 是不同字段

- `Settings.sentence_repeat` / `pause_seconds` / `loop_count` — 用户级别的学习偏好。
- `SentenceProgress.repeat_count` — 单个句子已被重复的次数。

两者是**不同字段**，不要混淆。后端（`settingsReq`、`sentenceProgressReq`）与前端（`Settings`、`SentenceProgress` 类型）都使用这些精确的 JSON key。

### 4. `UpdateRecord` 的 RESTful 契约

`PUT /records/:mediaId` — `mediaId` **来自 URL** (`c.Param("mediaId")`)，不来自 body。
body 只携带 `{last_position, increment_play}`。
旧版本从 body 读 `media_id` 并 `binding:"required"`，与 URL 参数冲突，破坏 RESTful 契约。
**URL 是唯一真相源**。

### 5. `StreamMedia` 的 Content-Type 顺序

`c.Header("Content-Type", ...)` 必须在 `c.File(path)` **之前**调用。
Gin 的 `c.File` 内部调用 `http.ServeFile`，**不会覆盖已设置的 header**。
之后设置无效。

### 6. TypeScript 6 — 没有 `baseUrl`

`tsconfig.app.json` 使用 `paths` 但**不**带 `baseUrl`（TS 6.0 已弃用 `baseUrl`，带它会触发 TS5101 编译失败）。
`@/*` → `./src/*` 的别名可独立工作。**不要**重新添加 `baseUrl`。

### 7. 扫描器的专辑来源

专辑名 = 媒体根目录下文件路径的**第一个段**。
媒体根目录下的直接文件 `album = NULL`（独立资源）。
`media_root/English/Unit1.mp3` → `album = "English"`。

### 8. SQLite 单写

`database.go` 设置 `SetMaxOpenConns(1)` 避免并发写时「database is locked」错误。
WAL 模式 + `busy_timeout=5000` 缓解问题。
**不要**调高连接数 — SQLite 写操作无论如何都是串行化的。

### 9. SPA Fallback

`cmd/server/main.go` 在 `frontend/dist` 存在时托管其作为静态资源（生产单二进制模式）。
`r.NoRoute` 对非 API 路径返回 `index.html`。
开发模式下，由 Vite 开发服务器处理前端。

### 10. 跨平台路径验证

Windows 下 `strings.HasPrefix` 路径检查**不可靠**（路径分隔符混合 `/` 与 `\`）。
目录归属判断必须使用 `filepath.Rel` 进行跨平台相对路径计算。
（v0.4.7 修复 Emby 扫描时的根因）

### 11. 媒体配对（video + audio）

同目录同基名（仅扩展名不同）的 video 与 audio 自动配对：
列表只显示 video，`paired_media_id` 指向 audio。
播放器内可在 🎬 视频 / 🎵 音频 tab 之间切换。
跨目录文件保持独立。
配对逻辑在 `scanner.linkPairedMedia`。

### 12. 多态标签系统（v0.5.0）

- 单个标签可附加到「专辑 / 季 / 学习页 / 媒体文件」四种实体类型。
- 通用 `TagManagerModal` 组件统一 UI。
- 历史媒体标签（v0.3.x 的 `media_tags` many2many 表）与新 `entity_tags` 表合并去重。
- 后端 `GET /tags/:id/entities` 返回结构：
  ```json
  {
    "tag": {"id":1,"name":"..."},
    "albums": [...],
    "seasons": [...],
    "medias": [...],
    "notes": [...]
  }
  ```
  每个数组都保证是 `[]` 而非 `null`（即使是空集）。

### 13. Emby 元数据识别

扫描器在每个专辑 / 季目录识别以下元数据（按优先级选择）：
- 封面：`folder.jpg` > `poster.jpg` > `cover.jpg`
- 横幅：`banner.jpg` > `backdrop.jpg` > `fanart.jpg`
- 描述：`tvshow.nfo` / `album.nfo`（专辑级）、`season.nfo`（季级）
- 季继承专辑级 `banner.jpg`（缺省时回退）

## 七、代码风格（Code Style）

- **Go**：`gofmt` / `go vet` 标准。Handler 函数返回 `gin.HandlerFunc`。
  统一使用 `utils.OK(c, ...)` / `utils.Fail(c, status, msg)` 响应 `{code, message, data}` 结构。
- **TypeScript**：严格模式，`noUnusedLocals`、`noUnusedParameters`。
  使用 `@/*` 别名导入 `src/*`。函数式组件 + Hooks。
- **注释**：业务域逻辑注释可用中文（与需求文档风格一致）；公共 API / 导出类型建议英文。
- **错误处理**：handler 返回描述性的中文错误信息给前端；需要时 wrap 上下文。
  **不要**泄露堆栈跟踪。
- **目录职责**：单一职责原则，避免「巨型 handler 文件」；按业务域拆分。

## 八、测试清单（Testing Checklist）

每次声明任务完成前，**全部**满足：

1. `go build ./...` 通过
2. `go vet ./...` 通过
3. `go test ./... -v` 通过（字幕解析器 8 个用例）
4. `pnpm build` 通过（前端类型检查 + 打包）
5. `.\scripts\test-api.ps1` 通过（11 项端到端检查）
6. 更新 [docs/ChangeLog.md](docs/ChangeLog.md) — 使用 [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) 规范
7. 若新增 / 修改 API，同步更新 [README.md#api-概览](README.md#-api-概览)
8. 若新增 / 修改功能，同步更新 [docs/PLAN.md](docs/PLAN.md) / [docs/TASKS.md](docs/TASKS.md)

## 九、变更日志规范（Changelog Discipline）

- **每天一个版本号**，当日所有变更合并在同一个版本下。
- 语言：**英文**（按 [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) 规范）。
- 类别仅使用：`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`。
- `CLAUDE.md` / `README.md` / 项目注释使用**中文**。
- 版本号格式：`v0.MINOR.PATCH`（如 `v0.5.0`），每次修改版本号递增 1。

## 十、调试指引（When Stuck）

- **后端启动失败**：检查 `ECHOSUB_*` 环境变量、DB 路径可写、媒体目录存在。
- **媒体无法播放**：检查流式 URL 是否带 `?token=`，且用户已登录。
- **字幕首句缺失**：检查 BOM，确保 `TrimPrefix` 未被删除。
- **401 错误**：token 过期（默认 72 小时）或缺失 `Authorization` 请求头。
- **`go: command not found`**：从注册表刷新 PATH（见常用命令章节）。
- **前端 `.length` 崩溃**（`Cannot read properties of null`）：后端该字段序列化为 `null`，需初始化为空切片 `make([]T, 0)`。
- **专辑封面 / 横幅未显示**：检查 `folder.jpg` / `banner.jpg` 命名是否正确（大小写敏感）；检查 NFO 是否为合法 XML（CDATA 已自动剥离）。

## 十一、项目记忆（Project Memory）

跨会话的项目级经验已沉淀在：
- 用户档案：`~/.trae-cn/memory/user_profile.md`
- 项目档案：`~/.trae-cn/memory/projects/-d-Code-Go-EchoSub/project_memory.md`
- 会话主题：`~/.trae-cn/memory/projects/-d-Code-Go-EchoSub/{date}/topics.md`

新需求接入时，AI 应主动 grep 这些文件以了解历史决策、避免重复踩坑。

---

**最后更新**：v0.5.0（多态标签系统 + 季未读蒙版 + README 重构）
