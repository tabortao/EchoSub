# TASKS.md — v0.3.1 任务跟踪

同 [PLAN.md](PLAN.md) 配合使用，勾选已完成的任务并记录时间。

## 需求 1：Header 全局扫描图标

- [x] ~T1~ `frontend/src/store/scan.ts` 新建 `useScanStore` — 含 `scanning`、`lastTriggeredAt`、`trigger()` 轮询逻辑（2026-07-03 15:20）
- [x] ~T2~ `frontend/src/layouts/MainLayout.tsx` Header 插入扫描按钮（Button + Spin + ReloadOutlined） (2026-07-03 15:24)
- [x] ~T3~ `frontend/src/components/EmbyHome.tsx` 订阅 `lastTriggeredAt` 变化触发 reload (2026-07-03 15:26)

## 需求 2：最近播放接口按 media_id 去重

- [x] ~T4~ `backend/internal/handlers/record.go` 新增 `ListRecent()` Handler，JOIN 子查询分组取最近一条 (2026-07-03 15:30)
- [x] ~T5~ `backend/internal/router/router.go` 注册 `GET /records/recent?limit=N` (2026-07-03 15:30)
- [x] ~T6~ `frontend/src/api/index.ts` 新增 `recordApi.recent(limit?)` (2026-07-03 15:40)
- [x] ~T7~ EmbyHome 改用 `recordApi.recent(20)` 替换 `list()` (2026-07-03 15:26)

## 需求 3：Emby 风格专辑详情

- [x] ~T8~ `backend/internal/handlers/media.go` `ListAlbums()` 增加 `played` 字段 + `deleted_at IS NULL` 过滤 (2026-07-03 15:33)
- [x] ~T9~ `frontend/src/types/index.ts` `Album`、`SubAlbum` 加可选 `played?` 字段 (2026-07-03 15:45)
- [x] ~T10~ EmbyHome `AlbumEntry` 接 `played`、`AlbumCard` 显示「已看 X/Y」徽标 + 进度条微条，按 `lastPlayedAt` 排序 (2026-07-03 15:45)
- [x] ~T11~ `frontend/src/pages/Home.tsx` 子专辑 Select 换为 Tabs 横滑标签 (2026-07-03 15:50)

## 需求 4：学习记录页面容错（双保险）

- [x] ~T12~ `backend/internal/handlers/record.go` `ListRecords()` 剔除 `Media.ID == 0` Preload 幽灵记录 (2026-07-03 15:20)
- [x] ~T13~ `backend/internal/handlers/stats.go` 三个统计函数加 `JOIN media_files AND deleted_at IS NULL` 过滤 (2026-07-03 15:22)
- [x] ~T14~ `frontend/src/pages/Records.tsx` 加载失败给 Alert 错误 + 重试按钮；Table 列安全访问 `media?.name` 并占位「已删除媒体」(2026-07-03 15:38)

## 收尾

- [x] ~T15~ `docs/ChangeLog.md` 新增 `[v0.3.1] - 2026-07-03`，按 Keep a Changelog 英文记录四类改动 (2026-07-03 15:55)

## 验证清单

- [x] `go build ./...` 通过
- [x] `go vet ./...` 通过
- [x] `go test ./... -v` 通过 (8 个字幕测试 + 0 failures)
- [x] `tsc --noEmit -p tsconfig.app.json` 通过
