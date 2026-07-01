# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Backend (Go 1.26 + Gin + GORM + SQLite)

- **Project skeleton**: `backend/` module with `github.com/yaole/EchoSub/backend` import path, layered as `cmd/server`, `internal/{config,database,handlers,middleware,models,router,scanner,utils}`, and `pkg/subtitle`.
- **Configuration loader** (`internal/config/config.go`): reads from environment variables first, then `config.yaml`, with sane defaults (port `8080`, DB `data/echosub.db`, JWT secret, media dir `/media`). Recognized media extensions: video `.mp4/.mkv/.mov/.webm/.avi`, audio `.mp3/.m4a/.aac/.wav/.flac/.ogg`, subtitle `.srt/.vtt`.
- **GORM models** (`internal/models/models.go`): `User`, `MediaFile` (with `Tags` many-to-many), `Tag` (user-scoped), `PlayRecord`, `SentenceProgress`, `Setting`. `MediaFile.Album` is nullable to represent standalone resources.
- **Database bootstrap** (`internal/database/database.go`): SQLite via `glebarez/sqlite` (pure Go, CGO-free), WAL mode, `busy_timeout=5000`, single-writer connection, `AutoMigrate` for all models.
- **JWT middleware** (`internal/middleware/auth.go`): `GenerateToken` / `ParseToken` / `AuthRequired` using `golang-jwt/jwt/v5`; `GetUserID` extracts UID from `gin.Context`. Passwords hashed with bcrypt.
- **Media scanner** (`internal/scanner/scanner.go`): `ScanFull` full sweep plus `StartWatcher` based on `fsnotify` for incremental `Create/Write/Rename` events; `upsertMedia` keyed by absolute path; `findSubtitle` locates same-name `.srt/.vtt` in the same directory; album name derived from the first path segment under the media root.
- **Subtitle parser** (`pkg/subtitle/subtitle.go`): `ParseFile` / `ParseSRT` / `ParseVTT` returning a unified `Sentence{Index,Start,End,Text}`. Time-range regex covers `HH:MM:SS,mmm`, `MM:SS,mmm`, and `SS,mmm` with `,` or `.` separators.
- **Auth API** (`internal/handlers/auth.go`): `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`.
- **Media API** (`internal/handlers/media.go`): `GET /media` (paginated, filterable by `album/type/keyword/tag_id`, sortable), `GET /media/:id`, `GET /media/:id/stream` (HTTP Range support, sets `Content-Type` before `c.File`), `GET /media/:id/subtitle` (parsed sentences with per-user progress), `GET /albums`.
- **Tag API** (`internal/handlers/tag.go`): CRUD plus `POST /media/:id/tags` overwrite-style assignment.
- **Record API** (`internal/handlers/record.go`): `PUT /records/:mediaId`, `GET /records`, `GET /records/:mediaId`, `PUT /records/:mediaId/sentences/:idx`, `GET /progress` (aggregated by album/tag).
- **Scan API** (`internal/handlers/scan.go`): `POST /scan/trigger`, `GET /scan/status`.
- **Settings API** (`internal/handlers/settings.go`): `GET /settings`, `PUT /settings` (per-user key/value).
- **Router** (`internal/router/router.go`): public `/auth/register`, `/auth/login`, `/health`; JWT-protected `/media`, `/albums`, `/tags`, `/records`, `/progress`, `/settings`, `/scan`.
- **Entrypoint** (`cmd/server/main.go`): boots config, DB, scanner watcher, router; serves frontend SPA from `frontend/dist` with SPA fallback.
- **Sample config** (`backend/config.example.yaml`).

#### Frontend (React 19 + TypeScript 6 + Vite 8 + Ant Design 6)

- **Toolchain**: Vite config with `@` → `./src` alias and `/api` proxy to `localhost:8080`; `tsconfig.app.json` uses `paths` without deprecated `baseUrl` (TS 6.0 compatible).
- **Types** (`src/types/index.ts`): full TypeScript definitions mirroring backend DTOs.
- **API client** (`src/api/`): axios instance with JWT attach + 401 redirect interceptors; `authApi`/`mediaApi`/`tagApi`/`recordApi`/`settingsApi`/`scanApi`.
- **State** (`src/store/`): `zustand` stores for `auth` (localStorage-persisted token/user) and `settings`.
- **Routing** (`src/router/index.tsx`): `ProtectedRoute` wrapper, lazy-friendly pages.
- **Layout** (`src/layouts/MainLayout.tsx`): Ant Design sider + header shell.
- **Pages**:
  - `Login.tsx`: login/register tabs with form validation.
  - `Home.tsx`: media card grid with keyword search, type filter, sort, album/tag drill-down, play progress preview.
  - `Albums.tsx`: album grid with counts.
  - `Tags.tsx`: tag CRUD with usage counts.
  - `Records.tsx`: learning statistics, table, and progress bars.
  - `Settings.tsx`: learning preference form (repeat count, pause seconds, loop count).
  - `Player.tsx`: media + subtitle loader.
- **MediaPlayer component** (`src/components/MediaPlayer.tsx`): core player with per-sentence repeat (M times), pause (K seconds) between sentences, overall loop (N times), throttled progress save (5s), clickable subtitle list with current-sentence highlight and completed markers. Uses refs (`handlingEndRef`, `sentenceRepeatRef`, `overallLoopRef`, `pauseTimerRef`, `modeRef`) to avoid stale closures in event callbacks.

#### Infrastructure

- **Dockerfile**: three-stage build (`golang:1.26-alpine` → `node:22-alpine` → `alpine:3.20` + `ffmpeg`), single static binary serving the SPA.
- **docker-compose.yml**: NAS-oriented deployment with read-only media mount and persisted DB volume.
- **.dockerignore**: excludes `node_modules`, `dist`, `.git`, local DB files.
- **GitHub Actions** (`.github/workflows/docker.yml`): tag-triggered build pushing multi-platform (`linux/amd64` + `linux/arm64`) images to GHCR.

#### Tests

- **Subtitle unit tests** (`pkg/subtitle/subtitle_test.go`): 8 cases covering SRT (basic, CRLF, BOM, empty), VTT (basic, `MM:SS.mmm` short format), `parseTimestamp`, and `FormatDuration`.
- **API integration tests**: 8 end-to-end endpoints verified via live server — register, login, media list, albums, subtitle parse, record update, sentence completion, progress aggregation.

### Fixed

- **`PUT /records/:mediaId` route mismatch**: `router.go` registered `POST /records` (no path param) while the API contract documents `PUT /records/:mediaId`. The handler also read `media_id` from the request body (`binding:"required"`) instead of the URL. Re-aligned to a RESTful contract: route is now `PUT /records/:mediaId`, `UpdateRecord` derives `mediaID` from `c.Param("mediaId")`, and the body only carries `last_position` + `increment_play`. Frontend `recordApi.update` switched from `POST /records` to `PUT /records/:mediaId`. Integration test script updated accordingly.
- **Settings field name mismatch**: the integration test sent `repeat_count` but both backend (`settingsReq`) and frontend (`Settings` type) use `sentence_repeat` (`repeat_count` belongs to `SentenceProgress`). Test script corrected to `sentence_repeat`; backend response now round-trips the saved value.
- **PowerShell encoding**: `scripts/test-api.ps1` originally contained CJK strings that Windows PowerShell 5.1 mis-decoded as GBK (UTF-8 file without BOM), breaking parsing. Rewrote the script in pure ASCII.
- **Media playback 401 (auth blocked)**: `<video src>` / `<audio src>` cannot set the `Authorization` header, so all media stream requests failed with 401 Unauthorized. Extended `AuthRequired` middleware to fall back to a `?token=<jwt>` query parameter when the header is absent. `mediaApi.streamUrl` now appends the token (`streamUrl(id, token)`), and `MediaPlayer` pulls the token from `useAuthStore`. Verified end-to-end: stream returns `200` with correct `Content-Type` and full byte range.

- **Subtitle BOM bug**: `lesson1.srt` shipped with a UTF-8 BOM, which polluted the first index line (`\ufeff1`), caused `strconv.Atoi` to fail, and dropped the first sentence. Fixed by stripping `\ufeff` in both `ParseFile` and `ParseSRT`; added `TestParseSRT_BOM` regression case.
- **`media.go` StreamMedia**: `Content-Type` was set after `c.File`, which had no effect. Moved `c.Header("Content-Type", ...)` before `c.File`; removed `io.Discard` hack and unused imports.
- **`record.go` type mismatch**: `atou(idx)` returned `uint` but `SentenceIndex` is `int`; wrapped with `int(...)`.
- **`scan.go` unused imports**: removed `http`/`middleware` imports and the `var _ = ...` placeholder hacks.
- **`scanner.go` undefined `Rename`**: corrected to `fsnotify.Rename` in the event-op bitmask.
- **`database.go` missing `mkdirAllImpl`**: replaced over-abstracted indirection with a direct `os.MkdirAll` call.
- **`subtitle.go` dead code**: removed unused `readLines` helper and the `bufio`/`io` imports; switched `ParseFile` from `io.ReadAll` to `os.ReadFile`.
- **Frontend `api/index.ts`**: fixed `Album[]` import syntax (should be `Album`); dropped unused `MediaFile` import.
- **Frontend `store/settings.ts`**: removed unnecessary `_get` parameter hack for zustand.
- **Frontend `Login.tsx`**: corrected JSX closing tag (`</Form.Item>` → `</Form>`).
- **Frontend `tsconfig.app.json`**: removed deprecated `baseUrl` (TypeScript 6.0 TS5101), `paths` now stands alone.
- **Frontend `MediaPlayer.tsx`**: imported `Typography` and derived `Text` so `<Text>` no longer resolves to the global DOM `Text` type.
- **Frontend `Home.tsx`**: fixed unterminated style literal `style={{ color: '#666''>` → `style={{ color: '#666' }}>`; added missing `Space` import.

[Unreleased]: https://github.com/yaole/EchoSub/releases
