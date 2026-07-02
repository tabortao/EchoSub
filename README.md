# EchoSub

A self-hosted web app for language learning and text recitation. Drop your video/audio + subtitle files into a watched folder (e.g. on a NAS), and EchoSub auto-discovers them, groups them into albums, and provides a sentence-repeat player with configurable pause, loop, and per-sentence progress tracking.

[中文功能需求](docs/需求文档.md) | [Changelog](docs/ChangeLog.md)

## Features

- **Auto scan & watch**: Full sweep on boot + `fsnotify` live watcher for incremental updates.
- **Album grouping**: First path segment under the media root becomes the album name.
- **Subtitle parsing**: SRT / WebVTT, unified `Sentence{Index, Start, End, Text}`. Handles UTF-8 BOM, CRLF, `HH:MM:SS,mmm` / `MM:SS,mmm` / `SS,mmm` timestamps.
- **Sentence-repeat player**: Repeat each sentence M times → pause K seconds → next sentence; overall loop N times.
- **Per-sentence progress**: Mark sentences completed, track repeat counts, aggregate by album/tag.
- **Tags**: User-scoped CRUD, attach to media (overwrite semantics).
- **JWT auth**: bcrypt password hashing, `golang-jwt/jwt/v5`.
- **Streaming**: HTTP Range support for media files.
- **Single binary**: Backend serves the built SPA, one port (default `8080`).

## Tech Stack

| Layer    | Stack |
|----------|-------|
| Backend  | Go 1.26 · Gin · GORM · SQLite (`glebarez/sqlite`, CGO-free) · JWT · fsnotify |
| Frontend | React 19 · TypeScript 6 · Vite 8 · Ant Design 6 · zustand · axios · react-router-dom 7 |
| Infra    | Docker multi-stage build · docker-compose · GitHub Actions (GHCR multi-arch) |

## Directory Layout

```
EchoSub/
├── backend/                # Go backend
│   ├── cmd/server/         # Entrypoint (main.go)
│   ├── internal/
│   │   ├── config/         # Config loader (env > yaml > defaults)
│   │   ├── database/       # GORM + SQLite bootstrap
│   │   ├── handlers/       # HTTP handlers (auth/media/tag/record/scan/settings)
│   │   ├── middleware/     # JWT auth + CORS
│   │   ├── models/         # GORM models
│   │   ├── router/         # Route registration
│   │   ├── scanner/        # Media scanner + fsnotify watcher
│   │   └── utils/          # Response helpers
│   ├── pkg/subtitle/       # SRT/VTT parser (+ tests)
│   ├── config.example.yaml
│   └── go.mod
├── frontend/               # React SPA
│   ├── src/
│   │   ├── api/            # axios client + API modules
│   │   ├── components/     # MediaPlayer
│   │   ├── layouts/        # MainLayout
│   │   ├── pages/          # Home/Albums/Tags/Records/Settings/Player/Login
│   │   ├── router/         # ProtectedRoute
│   │   ├── store/          # zustand (auth/settings)
│   │   ├── types/          # TS definitions
│   │   └── utils/          # format helpers
│   └── vite.config.ts      # @ alias + /api proxy → :8080
├── test-media/             # Sample media for local testing
├── docs/                   # Requirements + Changelog
├── Dockerfile              # 3-stage build
├── docker-compose.yml      # NAS deployment
└── .github/workflows/      # CI
```

## Prerequisites

- **Go** ≥ 1.26 (CGO not required)
- **Node.js** ≥ 20 + **pnpm** (or npm/yarn)
- **PowerShell** or any shell
- *(optional)* **Docker** for containerized deployment

> China network: set `GOPROXY=https://goproxy.cn,direct` for faster Go module downloads.

## Quick Start (Development)

### 1. Backend

```powershell
cd backend
copy config.example.yaml config.yaml   # then edit media.dir if needed
go mod download
go run ./cmd/server
```

The server listens on `http://localhost:8080`.

Override any setting via env vars (prefix `ECHOSUB_`):

```powershell
$env:ECHOSUB_MEDIA_DIR = "D:\Code\Go\EchoSub\test-media"
$env:ECHOSUB_JWT_SECRET = "dev-secret"
go run ./cmd/server
```

### 2. Frontend (dev server with HMR)

```powershell
cd frontend
pnpm install
pnpm dev。
```

Vite dev server runs on `http://localhost:5173` and proxies `/api` → `http://localhost:8080`.

Open `http://localhost:5173`, register a new account, and start using the app.

## Configuration

| Env var                | yaml path              | Default                      | Description                |
|------------------------|------------------------|------------------------------|----------------------------|
| `ECHOSUB_PORT`         | `server.port`          | `8080`                       | HTTP port                  |
| `ECHOSUB_DB_PATH`      | `database.path`        | `data/echosub.db`            | SQLite file path           |
| `ECHOSUB_JWT_SECRET`   | `jwt.secret`           | `change-me-in-production`    | JWT signing secret         |
| `ECHOSUB_MEDIA_DIR`    | `media.dir`            | `/media`                     | Media root directory       |

Supported extensions: video `.mp4/.mkv/.mov/.webm/.avi`, audio `.mp3/.m4a/.aac/.wav/.flac/.ogg`, subtitle `.srt/.vtt`.

## How to Test

### Unit Tests (Go)

```powershell
cd backend
go test ./... -v
```

Covers the subtitle parser (SRT basic/CRLF/BOM/empty, VTT basic/short-format, timestamp parsing, duration formatting).

### API Integration Test (end-to-end)

A self-contained PowerShell script that boots the backend against an in-memory test DB and exercises the full auth → scan → media → subtitle → record → progress flow.

```powershell
# From repo root
.\scripts\test-api.ps1
```

Run it manually step-by-step instead — see [scripts/test-api.ps1](scripts/test-api.ps1).

### Frontend Build Verification

```powershell
cd frontend
pnpm build      # tsc -b && vite build
```

A clean build proves type-safety across the SPA.

## Production Build

### Single binary (serves SPA + API on one port)

```powershell
# Build frontend
cd frontend
pnpm install
pnpm build           # outputs to frontend/dist

# Build backend (it will pick up frontend/dist at runtime)
cd ../backend
go build -o echosub.exe ./cmd/server
```

Run from the **repo root** so `frontend/dist` is discoverable:

```powershell
cd ..   # repo root
$env:ECHOSUB_MEDIA_DIR = "D:\path\to\media"
.\backend\echosub.exe
```

Open `http://localhost:8080`.

### Docker

```powershell
docker build -t echosub .
docker run -p 8080:8080 `
  -e ECHOSUB_JWT_SECRET=please-change-this-secret `
  -v D:\path\to\media:/media:ro `
  -v echosub-data:/app/data `
  echosub
```

### NAS deployment via docker-compose

Edit `docker-compose.yml` to point `/path/to/your/media` to your NAS share, then:

```powershell
docker compose up -d
```

Pre-built multi-arch images (`linux/amd64`, `linux/arm64`) are pushed to `ghcr.io/yaole/echosub:latest` on every tag via GitHub Actions.

## API Overview

All under `/api/v1`. Public: `POST /auth/register`, `POST /auth/login`, `GET /health`. Others require `Authorization: Bearer <jwt>`.

| Method | Path                              | Description                          |
|--------|-----------------------------------|--------------------------------------|
| POST   | `/auth/register`                  | Register, returns JWT                |
| POST   | `/auth/login`                     | Login, returns JWT                   |
| GET    | `/auth/me`                        | Current user                         |
| GET    | `/media`                          | List (album/type/keyword/tag/sort)   |
| GET    | `/media/:id`                      | Media detail + play record           |
| GET    | `/media/:id/stream`               | Stream (HTTP Range)                  |
| GET    | `/media/:id/subtitle`             | Parsed sentences + progress          |
| GET    | `/albums`                         | Album list with counts               |
| POST   | `/scan/trigger`                   | Trigger full rescan                  |
| GET    | `/scan/status`                    | Scanner status                       |
| GET    | `/tags`                           | List tags                            |
| POST   | `/tags`                           | Create tag                           |
| PUT    | `/tags/:id`                       | Update tag                           |
| DELETE | `/tags/:id`                       | Delete tag                           |
| POST   | `/media/:id/tags`                 | Assign tags (overwrite)              |
| PUT    | `/records/:mediaId`               | Upsert play record                   |
| GET    | `/records`                        | List play records                    |
| GET    | `/records/:mediaId`               | Get one play record                  |
| PUT    | `/records/:mediaId/sentences/:idx`| Upsert sentence progress             |
| GET    | `/progress`                       | Aggregated progress (album/tag)      |
| GET    | `/settings`                       | Get user settings                    |
| PUT    | `/settings`                       | Update user settings                 |

## Default Test Account

The integration test registers `testuser` / `test123456`. In your own runs, register any account via the UI or `POST /api/v1/auth/register`.

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

Private project. See repository settings.
