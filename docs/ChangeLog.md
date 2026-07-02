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

#### Mobile, PWA & Session

- **Responsive layout**: `MainLayout` now switches to a slide-in `Drawer` menu on screens below the `lg` breakpoint (hamburger button in the header), with tighter paddings on mobile. `Home.tsx` filter row reflows to stacked single-column on `xs` and two-up on `sm`. `Login.tsx` card is fluid (`maxWidth: 400`, `width: 100%`) with responsive outer padding.
- **PWA support**: integrated `vite-plugin-pwa` (1.3.0) with `autoUpdate` registration, `devOptions.enabled` for local testing, and a Web App Manifest (`name=EchoSub`, `theme_color=#1677ff`, `display=standalone`, `lang=zh-CN`). Generated `pwa-192.png` and `pwa-512.png` icons (maskable variant included) under `frontend/public/`. `index.html` gained `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-capable`, and a `viewport-fit=cover` viewport. `main.tsx` registers the service worker via `virtual:pwa-register`.
- **Workbox runtime caching**: media stream requests (`/api/v1/media/:id/stream`) use `NetworkOnly` to preserve Range/token semantics; other `/api/*` calls use `NetworkFirst` with a 5s timeout and short-lived cache.
- **Remember password**: `Login.tsx` adds a "记住密码" checkbox (login tab only). When checked, credentials are stored in `localStorage` under `echosub_remember` and pre-filled on next visit. Unchecking clears the entry.
- **Session persistence on refresh**: `useAuthStore.getState().hydrate()` is now invoked at module load time (`store/auth.ts`), so the JWT is restored synchronously before `ProtectedRoute` renders — refreshing a protected page no longer bounces to `/login`.

#### Media Cover & Type Badge

- **Backend cover scanning** (`internal/scanner/scanner.go`): added `findCover()` mirroring `findSubtitle()` to locate a same-name image (`.jpg/.jpeg/.png/.webp`) in the media's directory. `upsertMedia` now populates `MediaFile.CoverPath` (the field existed in the model but was never filled before). `MediaConfig` gained `SupportedImages` with sensible defaults.
- **Cover endpoint** (`GET /api/v1/media/:id/cover`): new handler `GetCover` in `internal/handlers/media.go`. Resolution order: (1) serve the same-name image directly with the correct `Content-Type`; (2) for a video without an image cover, issue `302 Found` redirect to `GET /media/:id/stream?token=<jwt>` so the client can use `<video preload="metadata">` to render the first frame; (3) for audio without a cover, return `404`. Route registered in `internal/router/router.go`.
- **Frontend `MediaCover` component** (`src/components/MediaCover.tsx`): reusable cover renderer with three branches — image cover via `coverUrl` API, video first-frame via `<video preload="metadata" src={streamUrl}>`, and an `AudioOutlined` icon fallback. Includes `onError` fallbacks that degrade gracefully (image error → try video first-frame; video error → icon).
- **`mediaApi.coverUrl(id, token)`**: new API helper appending the JWT as a query param, mirroring `streamUrl` for use in `<img src>`.
- **Home page cards** (`src/pages/Home.tsx`): replaced the static icon placeholder with `<MediaCover>`. Added a type badge (`Tag` — magenta "视频" for video, green "音频" for audio) overlaid on the cover top-left, and re-centered the play button overlay.
- **Albums page cards** (`src/pages/Albums.tsx`): each album card now fetches its first media item and renders `<MediaCover>` as the card cover, falling back to the gradient + `FolderOutlined` placeholder when the album is empty or still loading.

#### Tag Management, Upload, Player & Layout Enhancements

- **Media tag management UI** (`src/components/TagManagerModal.tsx`): reusable modal that loads all user tags via `tagApi.list()`, presents a multi-select `Select` for assigning tags to a media file, and includes a quick-create input for new tags. Calls `mediaApi.assignTags(id, tagIds)` (overwrite-style) on save. Integrated into `Home.tsx`: each card displays its current tags (purple `Tag` chips) and a "标签" link button that opens the modal; `e.stopPropagation()` prevents the card click from navigating to the player while managing tags.
- **Collapsible sidebar** (`src/layouts/MainLayout.tsx`): the desktop `Sider` is now `collapsible` with a `collapsed` state — click the collapse trigger at the sider bottom to toggle between full width (220px with labels) and icon-only mode. `Menu inlineCollapsed` drives the inline collapse. Mobile continues to use the slide-in `Drawer` (always expanded).
- **Sidebar upload entry**: added an "上传" menu item (`UploadOutlined`) between "标签" and "学习记录".
- **Subtitle mask mode** (`src/components/MediaPlayer.tsx`): added a "遮挡模式" `Switch` in the subtitle panel header. When enabled, all subtitle text is replaced with `*` (via `maskText`, which preserves whitespace) except the currently-playing sentence — enabling recall/recitation practice without previewing upcoming lines. The current sentence always shows its real text.
- **Video fullscreen** (`src/components/MediaPlayer.tsx`): added a fullscreen toggle button overlaid on the video element (top-right corner, semi-transparent). Calls `el.requestFullscreen()` / `document.exitFullscreen()` and tracks state via a `fullscreenchange` listener so the icon swaps between `FullscreenOutlined` and `FullscreenExitOutlined`. Audio players are unaffected.
- **Directory browse endpoint** (`GET /api/v1/media/browse`): new `BrowseMedia(cfg)` handler in `internal/handlers/media.go` lists the dirs and files under a given sub-path of the media root. Includes path-traversal protection (`filepath.Clean` + prefix check), skips hidden entries (dot-prefixed), and returns `path` as a forward-slash string for cross-platform consistency.
- **File upload endpoint** (`POST /api/v1/media/upload`): new `UploadMedia(cfg)` handler accepting `multipart/form-data` with fields `path` (target relative dir) and `files` (multiple). Creates the target dir if needed (`os.MkdirAll`), prevents path traversal (`filepath.Base` per file), skips already-existing files, and saves new files via `c.SaveUploadedFile`. The fsnotify watcher auto-ingests uploaded media — no manual scan trigger required.
- **Routes**: registered `media.GET("/browse", handlers.BrowseMedia(cfg))` and `media.POST("/upload", handlers.UploadMedia(cfg))` in `internal/router/router.go` (static routes placed before `/:id` to avoid param collision).
- **Upload page** (`src/pages/Upload.tsx`): new page with two cards — a directory browser (breadcrumb navigation + list of dirs/files, click to enter subdirs, "上级" and "刷新" controls) and an upload zone (`Upload.Dragger` in manual mode) that collects files, shows them in a list, and uploads to the current browsed directory with a live `Progress` bar via `mediaApi.upload(path, files, onProgress)`. Reports saved/skipped counts and refreshes the directory after upload.
- **API helpers** (`src/api/index.ts`): added `mediaApi.browse(path?)` and `mediaApi.upload(path, files, onProgress)` (with `onUploadProgress` for percent reporting). Added `BrowseEntry`, `BrowseResponse`, `UploadResult` types to `src/types/index.ts`.

#### Player & Layout Refinements

- **Subtitle mask mode (per-sentence recall)** (`src/components/MediaPlayer.tsx`): the mask mode now hides **all** sentences (including the current one) by default — enabling dictation/recitation practice. Click any sentence to toggle its reveal state individually (click still jumps playback to that sentence). Added "全部揭示" / "全部遮挡" quick-toggle buttons. Closing mask mode clears the reveal set.
- **Video overlay subtitle**: the current sentence text is now overlaid at the bottom of the video frame (semi-transparent black bar, white text, centered), so subtitles are visible directly on the video — not only in the list below. In mask mode the overlay respects the per-sentence reveal state. The overlay font enlarges during fullscreen for readability.
- **Fullscreen container**: `toggleFullscreen` now fullscreenes the video container `div` (not just the `<video>` element), so the overlay subtitle and the fullscreen button remain visible in fullscreen mode.
- **Auto-scrolling subtitle list**: the subtitle list now auto-scrolls to keep the current sentence vertically centered within the visible area (`scrollTo` with `behavior: 'smooth'`). List height grew to `calc(100vh - 420px)` (min 200px) to show more sentences at once.
- **Playback speed control**: added a `Select` next to the volume slider offering 0.5x / 0.75x / 1.0x / 1.25x / 1.5x / 2.0x, wired to `el.playbackRate`.
- **Full-width layout** (`src/layouts/MainLayout.tsx`): removed the outer `Content` margin and the inner card's `borderRadius`, reduced padding to 16px (8px on mobile), and set `minHeight: calc(100vh - 64px)` so the app fills the viewport without large side gutters.

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
