# CLAUDE.md

Guidance for AI assistants (Claude Code, etc.) working on the EchoSub codebase.

## Project Overview

EchoSub is a self-hosted web app for language learning and text recitation. Users drop video/audio + subtitle files into a watched folder; the app auto-discovers them, groups them into albums, and provides a sentence-repeat player with configurable pause/loop and per-sentence progress tracking.

- **Backend**: Go 1.26 · Gin · GORM · SQLite (`glebarez/sqlite`, CGO-free) · JWT · fsnotify
- **Frontend**: React 19 · TypeScript 6 · Vite 8 · Ant Design 6 · zustand · axios · react-router-dom 7
- **Infra**: Docker multi-stage build · docker-compose · GitHub Actions (GHCR multi-arch)

See [README.md](README.md) for user-facing usage and [docs/需求文档.md](docs/需求文档.md) for full requirements.

## Common Commands

### Backend (run from `backend/`)

```powershell
# Refresh PATH (Go installed at D:\Code-E\Go\bin, not always in session PATH)
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$env:GOPROXY = "https://goproxy.cn,direct"   # China network

go run ./cmd/server          # Run dev server (default :8080)
go build ./...               # Compile check
go vet ./...                 # Lint
go test ./... -v             # Unit tests (subtitle parser)
```

### Frontend (run from `frontend/`)

```powershell
pnpm install
pnpm dev                     # Vite dev server (:5173, proxies /api → :8080)
pnpm build                   # tsc -b && vite build → frontend/dist
pnpm lint
```

### Integration test (run from repo root)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-api.ps1
```

Boots backend on :18080 against `test-media/`, runs 11 end-to-end API checks, then cleans up. Pure ASCII script (Windows PowerShell 5.1 cannot decode UTF-8 CJK without BOM).

## Dev Environment Notes

- **Go path**: installed at `D:\Code-E\Go\bin`. New terminals may not pick it up — refresh PATH from registry as shown above.
- **Shell**: Windows PowerShell 5.1. Avoid CJK in `.ps1` scripts (GBK decode mismatch). Use PowerShell 7+ or keep scripts ASCII-only.
- **Module proxy**: `GOPROXY=https://goproxy.cn,direct` for China network speed.
- **Two-process dev**: backend on :8080, frontend on :5173. Vite proxies `/api` → `:8080`. `go run` does NOT hot-reload — restart after backend changes.

## Architecture

### Backend layout (`backend/`)

```
cmd/server/main.go          # Entrypoint: config → DB → scanner → router → SPA fallback
internal/
  config/                   # Env (ECHOSUB_*) > config.yaml > defaults
  database/                 # GORM + SQLite (WAL, single-writer conn)
  models/                   # User, MediaFile, Tag, PlayRecord, SentenceProgress, Setting
  middleware/               # AuthRequired (JWT), CORS
  handlers/                 # auth, media, tag, record, scan, settings
  router/                   # Route registration under /api/v1
  scanner/                  # Full sweep + fsnotify watcher
  utils/                    # Response helpers (OK/Fail)
pkg/subtitle/               # SRT/VTT parser (public, reusable)
```

### Frontend layout (`frontend/src/`)

```
api/        # axios client (JWT interceptor) + API modules
components/ # MediaPlayer (core player logic)
layouts/    # MainLayout (Ant Design sider)
pages/      # Home, Albums, Tags, Records, Settings, Player, Login
router/     # ProtectedRoute
store/      # zustand: auth (localStorage-persisted), settings
types/      # TS definitions mirroring backend DTOs
utils/      # formatDuration, formatRelative
```

### API contract

All under `/api/v1`. Public: `POST /auth/register`, `POST /auth/login`, `GET /health`. Others require JWT via `Authorization: Bearer <token>` header OR `?token=<jwt>` query param (for media elements that cannot set headers).

See [README.md](README.md#api-overview) for the full endpoint table.

## Critical Conventions & Gotchas

### 1. Media stream auth — query token fallback

`<video src>` / `<audio src>` cannot set the `Authorization` header. The `AuthRequired` middleware accepts JWT from **either** the header **or** `?token=` query param. Frontend `mediaApi.streamUrl(id, token)` must append the token:

```ts
streamUrl: (id: number, token: string) => `/api/v1/media/${id}/stream?token=${encodeURIComponent(token)}`
```

MediaPlayer pulls `token` from `useAuthStore` and passes it through. **Do not** revert to a header-only auth check — media playback will break.

### 2. Subtitle BOM stripping

SRT/VTT files may ship with a UTF-8 BOM (`\ufeff`). `ParseFile` and `ParseSRT` both call `strings.TrimPrefix(content, "\ufeff")` before parsing. Without this, the first index line becomes `\ufeff1`, `strconv.Atoi` fails, and the first sentence is dropped. There is a `TestParseSRT_BOM` regression test — keep it green.

### 3. Field naming — `sentence_repeat` vs `repeat_count`

- `Settings.sentence_repeat` / `pause_seconds` / `loop_count` — learning preferences (user-level).
- `SentenceProgress.repeat_count` — how many times a specific sentence has been repeated.

These are **different** fields. Do not mix them. Both backend (`settingsReq`, `sentenceProgressReq`) and frontend (`Settings`, `SentenceProgress` types) use these exact JSON keys.

### 4. `UpdateRecord` RESTful contract

`PUT /records/:mediaId` — mediaId comes from the URL (`c.Param("mediaId")`), NOT the body. Body only carries `{last_position, increment_play}`. The old design read `media_id` from the body with `binding:"required"`, which clashed with the URL param and broke the RESTful contract. Keep the URL as the source of truth.

### 5. `StreamMedia` Content-Type ordering

`c.Header("Content-Type", ...)` must be called **before** `c.File(path)`. Gin's `c.File` calls `http.ServeFile` which will not override an already-set header. Setting it after has no effect.

### 6. TypeScript 6 — no `baseUrl`

`tsconfig.app.json` uses `paths` without `baseUrl` (TS 6.0 deprecated `baseUrl`, build fails with TS5101). The `@/*` → `./src/*` alias works standalone. Do not re-add `baseUrl`.

### 7. Scanner album derivation

Album name = first path segment under the media root. A file directly in the media root has `album = NULL` (standalone resource). Files in `media_root/English/Unit1.mp3` get `album = "English"`.

### 8. SQLite single-writer

`database.go` sets `SetMaxOpenConns(1)` to avoid SQLite "database is locked" under concurrent writes. WAL mode + `busy_timeout=5000` helps. Do not raise the connection count — SQLite serializes writes regardless.

### 9. SPA fallback

`cmd/server/main.go` serves `frontend/dist` if present (production single-binary mode). `r.NoRoute` returns `index.html` for non-API routes. In dev, the Vite dev server handles the frontend instead.

## Code Style

- **Go**: standard `gofmt` / `go vet`. Handler functions return `gin.HandlerFunc`. Keep `utils.OK(c, ...)` / `utils.Fail(c, status, msg)` for uniform responses `{code, message, data}`.
- **TypeScript**: strict mode, `noUnusedLocals`, `noUnusedParameters`. Use `@/` alias for `src/` imports. Functional components with hooks.
- **Comments**: Chinese is acceptable in domain logic comments (matches the requirements doc); keep public API/docstrings English where possible.
- **Error handling**: handlers return descriptive Chinese error messages to the frontend; wrap with context where useful. Do not leak stack traces.

## Testing Checklist

Before declaring a task complete:

1. `go build ./...` passes
2. `go vet ./...` passes
3. `go test ./... -v` passes (subtitle parser suite, 8 cases)
4. `pnpm build` passes (frontend type-check + bundle)
5. `.\scripts\test-api.ps1` passes (11 end-to-end checks)
6. Update [docs/ChangeLog.md](docs/ChangeLog.md) under `[Unreleased]` — English, [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) format.

## Changelog Discipline

- One version per day, all daily changes under a single version.
- English only, follows [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/).
- Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## When Stuck

- Backend won't start: check `ECHOSUB_*` env vars, DB path writable, media dir exists.
- Media won't play: verify `?token=` is appended to the stream URL and the user is logged in.
- Subtitle missing first sentence: check for BOM, ensure `TrimPrefix` is intact.
- 401 on protected routes: token expired (default 72h) or missing `Authorization` header.
- `go: command not found`: refresh PATH from registry (see Common Commands).
