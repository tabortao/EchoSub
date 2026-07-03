# EchoSub

一个用于语言学习和文本背诵的自托管 Web 应用。将你的视频/音频 + 字幕文件放入被监听的文件夹（例如 NAS 上），EchoSub 会自动发现它们、按专辑分组，并提供一个支持可配置暂停、循环和逐句进度跟踪的逐句复读播放器。

[中文功能需求](docs/需求文档.md) | [更新日志](docs/ChangeLog.md)

## 功能特性

- **自动扫描与监听**：启动时全量扫描 + `fsnotify` 实时监听器进行增量更新。
- **专辑分组**：媒体根目录下的第一层路径段作为专辑名。
- **字幕解析**：支持 SRT / WebVTT，统一为 `Sentence{Index, Start, End, Text}` 结构。处理 UTF-8 BOM、CRLF、`HH:MM:SS,mmm` / `MM:SS,mmm` / `SS,mmm` 时间戳格式。
- **逐句复读播放器**：每句重复 M 次 → 暂停 K 秒 → 下一句；整体循环 N 次。
- **逐句进度跟踪**：标记句子完成状态、跟踪重复次数、按专辑/标签聚合统计。
- **标签管理**：用户级别的增删改查，可附加到媒体（覆盖语义）。
- **JWT 认证**：bcrypt 密码哈希，使用 `golang-jwt/jwt/v5`。
- **流式播放**：媒体文件支持 HTTP Range 请求。
- **单二进制部署**：后端直接托管已构建的 SPA，单端口运行（默认 `8080`）。

## 技术栈

| 层级     | 技术栈 |
|----------|-------|
| 后端     | Go 1.26 · Gin · GORM · SQLite (`glebarez/sqlite`, CGO-free) · JWT · fsnotify |
| 前端     | React 19 · TypeScript 6 · Vite 8 · Ant Design 6 · zustand · axios · react-router-dom 7 |
| 基础设施 | Docker 多阶段构建 · docker-compose · GitHub Actions (GHCR 多架构) |

## 目录结构

```
EchoSub/
├── backend/                # Go 后端
│   ├── cmd/server/         # 入口程序 (main.go)
│   ├── internal/
│   │   ├── config/         # 配置加载器 (env > yaml > 默认值)
│   │   ├── database/       # GORM + SQLite 初始化
│   │   ├── handlers/       # HTTP 处理器 (auth/media/tag/record/scan/settings)
│   │   ├── middleware/     # JWT 认证 + CORS
│   │   ├── models/         # GORM 数据模型
│   │   ├── router/         # 路由注册
│   │   ├── scanner/        # 媒体扫描器 + fsnotify 监听器
│   │   └── utils/          # 响应辅助工具
│   ├── pkg/subtitle/       # SRT/VTT 解析器 (含测试)
│   ├── config.example.yaml
│   └── go.mod
├── frontend/               # React 单页应用
│   ├── src/
│   │   ├── api/            # axios 客户端 + API 模块
│   │   ├── components/     # MediaPlayer 媒体播放器
│   │   ├── layouts/        # MainLayout 主布局
│   │   ├── pages/          # Home/Albums/Tags/Records/Settings/Player/Login
│   │   ├── router/         # ProtectedRoute 路由守卫
│   │   ├── store/          # zustand 状态管理 (auth/settings)
│   │   ├── types/          # TS 类型定义
│   │   └── utils/          # 格式化辅助工具
│   └── vite.config.ts      # @ 别名 + /api 代理 → :8080
├── test-media/             # 本地测试用示例媒体
├── docs/                   # 需求文档 + 更新日志
├── Dockerfile              # 3 阶段构建
├── docker-compose.yml      # NAS 部署配置
└── .github/workflows/      # CI 持续集成
```

## 前置要求

- **Go** ≥ 1.26（无需 CGO）
- **Node.js** ≥ 20 + **pnpm**（或 npm/yarn）
- **PowerShell** 或任意 Shell
- *（可选）* **Docker** 用于容器化部署

> 中国大陆网络环境：设置 `GOPROXY=https://goproxy.cn,direct` 可加速 Go 模块下载。

## 快速开始（开发模式）

### 1. 后端

```powershell
cd backend
copy config.example.yaml config.yaml   # 然后按需修改 media.dir
go mod download
go run ./cmd/server
```

服务器监听 `http://localhost:8080`。

通过环境变量覆盖任意配置（前缀 `ECHOSUB_`）：

```powershell
$env:ECHOSUB_MEDIA_DIR = "D:\Code\Go\EchoSub\test-media"
$env:ECHOSUB_JWT_SECRET = "dev-secret"
go run ./cmd/server
```

### 2. 前端（带 HMR 热更新的开发服务器）

```powershell
cd frontend
pnpm install
pnpm dev
```

Vite 开发服务器运行在 `http://localhost:5173`，并将 `/api` 代理到 `http://localhost:8080`。

打开 `http://localhost:5173`，注册新账号即可开始使用。

## 配置说明

| 环境变量               | yaml 路径             | 默认值                       | 描述                       |
|------------------------|------------------------|------------------------------|----------------------------|
| `ECHOSUB_PORT`         | `server.port`          | `8080`                       | HTTP 端口                  |
| `ECHOSUB_DB_PATH`      | `database.path`        | `data/echosub.db`            | SQLite 文件路径            |
| `ECHOSUB_JWT_SECRET`   | `jwt.secret`           | `change-me-in-production`    | JWT 签名密钥               |
| `ECHOSUB_MEDIA_DIR`    | `media.dir`            | `/media`                     | 媒体根目录                 |

支持的文件扩展名：视频 `.mp4/.mkv/.mov/.webm/.avi`，音频 `.mp3/.m4a/.aac/.wav/.flac/.ogg`，字幕 `.srt/.vtt`。

## 测试方法

### 单元测试（Go）

```powershell
cd backend
go test ./... -v
```

覆盖字幕解析器（SRT 基础/CRLF/BOM/空文件、VTT 基础/短格式、时间戳解析、时长格式化）。

### API 集成测试（端到端）

一个自包含的 PowerShell 脚本，会启动后端（使用内存测试数据库）并完整走通 认证 → 扫描 → 媒体 → 字幕 → 记录 → 进度 流程。

```powershell
# 在仓库根目录执行
.\scripts\test-api.ps1
```

也可以手动逐步执行 —— 详见 [scripts/test-api.ps1](scripts/test-api.ps1)。

### 前端构建验证

```powershell
cd frontend
pnpm build      # tsc -b && vite build
```

干净的构建可证明整个 SPA 的类型安全性。

## 生产构建

### 单二进制（同一端口同时提供 SPA + API 服务）

```powershell
# 构建前端
cd frontend
pnpm install
pnpm build           # 输出到 frontend/dist

# 构建后端（运行时会自动加载 frontend/dist）
cd ../backend
go build -o echosub.exe ./cmd/server
```

请从**仓库根目录**运行，以便找到 `frontend/dist`：

```powershell
cd ..   # 仓库根目录
$env:ECHOSUB_MEDIA_DIR = "D:\path\to\media"
.\backend\echosub.exe
```

打开 `http://localhost:8080`。

### Docker

```powershell
docker build -t echosub .
docker run -p 8080:8080 `
  -e ECHOSUB_JWT_SECRET=please-change-this-secret `
  -v D:\path\to\media:/media:ro `
  -v echosub-data:/app/data `
  echosub
```

### 通过 docker-compose 部署到 NAS

编辑 `docker-compose.yml`，将 `/path/to/your/media` 指向你的 NAS 共享路径，然后：

```powershell
docker compose up -d
```

GitHub Actions 会在每次打 tag 时构建多架构镜像（`linux/amd64`、`linux/arm64`）并推送到 `ghcr.io/yaole/echosub:latest`。

## API 概览

所有接口均位于 `/api/v1` 下。公开接口：`POST /auth/register`、`POST /auth/login`、`GET /health`。其他接口需要 `Authorization: Bearer <jwt>` 请求头。

| Method | Path                              | 描述                                  |
|--------|-----------------------------------|--------------------------------------|
| POST   | `/auth/register`                  | 注册，返回 JWT                        |
| POST   | `/auth/login`                     | 登录，返回 JWT                        |
| GET    | `/auth/me`                        | 获取当前用户信息                      |
| GET    | `/media`                          | 列表（支持 album/type/keyword/tag/sort 筛选） |
| GET    | `/media/:id`                      | 媒体详情 + 播放记录                   |
| GET    | `/media/:id/stream`               | 流式播放（支持 HTTP Range）           |
| GET    | `/media/:id/subtitle`             | 已解析句子 + 进度                     |
| GET    | `/albums`                         | 专辑列表（含数量统计）                |
| POST   | `/scan/trigger`                   | 触发全量重新扫描                      |
| GET    | `/scan/status`                    | 扫描器状态                            |
| GET    | `/tags`                           | 标签列表                              |
| POST   | `/tags`                           | 创建标签                              |
| PUT    | `/tags/:id`                       | 更新标签                              |
| DELETE | `/tags/:id`                       | 删除标签                              |
| POST   | `/media/:id/tags`                 | 分配标签（覆盖式）                    |
| PUT    | `/records/:mediaId`               | 新增或更新播放记录                    |
| GET    | `/records`                        | 播放记录列表                          |
| GET    | `/records/:mediaId`               | 获取单条播放记录                      |
| PUT    | `/records/:mediaId/sentences/:idx`| 新增或更新句子进度                    |
| GET    | `/progress`                       | 聚合进度（按专辑/标签）               |
| GET    | `/settings`                       | 获取用户设置                          |
| PUT    | `/settings`                       | 更新用户设置                          |

## 默认测试账号

集成测试会注册 `testuser` / `test123456`。在你自己的运行环境中，可通过 UI 或 `POST /api/v1/auth/register` 注册任意账号。

## 学习记录页面（Study Records）

「学习记录」页面（路由 `/records`）提供学习数据的统计与回溯能力，与项目「语言学习 + 文本背诵」的特性一致，包含以下模块：

### 顶部汇总卡片

- **已背诵句子数**（绿色）：来自 `SentenceProgress.completed` 的全局聚合
- **播放记录数**（橙色）：当前用户的 `PlayRecord` 总数
- **专辑数**（黄色）：有播放记录的专辑数量

### 周 / 月 / 年统计（Tabs 切换）

数据来自后端 `GET /records/stats?granularity=week|month|year&date=YYYY-MM-DD`，统计源为 `PlayRecord.last_played_at` 与 `SentenceProgress.updated_at`。

- **📅 本周视图**（紧凑单行布局）
  - 周一 ~ 周日 **单行 7 列**显示，每列上方为「星期 + 日期号」，下方依次为当日柱状图与「播放次数 / 媒体数 / 背诵句子数」
  - 当日列以橙色边框 + 浅橙背景高亮
  - 顶部汇总一行展示：总播放次数 / 学习媒体数 / 背诵句子数
  - 支持左右翻页（±7 天），「回到本周」按钮一键回到当前周
- **🗓️ 本月视图**：12 个月统计卡片网格，按年翻页
- **📆 年度视图**：最近 5 年统计卡片网格，按 5 年翻页

### 按专辑进度

列出每个专辑的「已学/总数」媒体数与「共听 N 次」，配橙色进度条。

### 播放记录表

按时间倒序列出所有播放记录（媒体名、专辑、播放次数、上次进度、上次播放时间），点击媒体名可跳转播放页。

## Docker / NAS 部署说明

### 镜像构建

- `Dockerfile` 使用 3 阶段构建：`golang:1.26-alpine`（后端）→ `node:22-alpine`（前端）→ `alpine:3.20`（运行时，含 ffmpeg）。
- GitHub Actions（`.github/workflows/docker.yml`）在 push tag `v*` 时构建 `linux/amd64` + `linux/arm64` 多架构镜像并推送至 `ghcr.io/yaole/echosub:latest`；push `main` 分支构建 `dev` tag。
- **后端配置文件无需修改**：容器内媒体目录固定为 `/media`（由 `ECHOSUB_MEDIA_DIR=/media` 指定），只需在 `docker-compose.yml` 的 `volumes` 中把宿主机的 NAS 路径挂载到 `/media` 即可。

### NAS 媒体目录映射（docker-compose.yml）

```yaml
volumes:
  # ★ 把左侧改为你的 NAS 媒体路径 ★
  - /mnt/nas/EchoSub:/media      # Linux NFS 挂载点示例
  # - //192.168.1.10/media/EchoSub:/media   # Windows SMB 示例
  # - Z:/EchoSub:/media                      # Windows 映射盘示例
  - echosub-data:/app/data       # SQLite 数据库 + 笔记图片（建议留本地）
```

> 媒体目录默认读写挂载（上传功能需要写入）；如仅做播放不上传，可追加 `:ro` 只读。
> 数据库（`/app/data`）建议保留在宿主机本地卷，不要放 NAS，避免 SQLite WAL 在网络文件系统上出现锁问题。

## License

私有项目。详见仓库设置。
