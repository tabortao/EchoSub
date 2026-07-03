# PLAN.md — 首页扫描 / 最近播放 / Emby 专辑 / 记录容错

> 状态：实施中　|　版本：v0.3.1　|　日期：2026-07-03

## 1. 背景与目标

用户从 NAS 手动修改/增删媒体文件夹后，当前系统存在四个体验缺陷：

| # | 问题 | 用户确认方案 |
|---|------|-------------|
| 1 | 首页无「重新扫描」入口，用户新放入文件后无法及时刷新 | Header 全局扫描图标（点击触发 + 自动刷新首页） |
| 2 | 首页「继续学习」展示的内容与实际最近播放不一致 | 后端最近播放接口：按 media_id 去重取最近一条，前端对齐 |
| 3 | 专辑视图扁平一级，缺少 Emby「剧集→季→集」的层次 | 专辑卡片显示子季 Tabs、封面智能选取、含播放进度统计 |
| 4 | 外部删除/移动文件后学习记录页崩溃（白屏） | **双保险**：后端过滤已删媒体 + 前端容错加固（含错误提示） |

本次迭代产出四组改动，外加 `docs/ChangeLog.md`（v0.3.1）和版本号更新。

## 2. 总体设计原则

- **最小改动**：每项功能仅修改必要文件，不顺手重构。
- **用户已确认**的方向直接落地（见 [docs/TASKS.md](TASKS.md)）。
- **软删除保留历史**：PlayRecord、SentenceProgress 在媒体被删后不级联抹除，仅在查询时过滤已软删除的媒体。
- **错误不透出**：try/catch 上要给用户友好的 `message.error` 提示，不再静默 ignore。

## 3. 需求 1：Header 全局扫描图标

### 3.1 范围

| 文件 | 动作 |
|------|------|
| `frontend/src/layouts/MainLayout.tsx` | Header 用户头像左侧插入扫描图标按钮（带 Tooltip、点击触发 loading/spinning） |
| `frontend/src/store/scan.ts` | 新建 `useScanStore`：包含 `scanning` 状态、`trigger()` action、`lastTriggeredAt` 时间戳 |
| `frontend/src/components/EmbyHome.tsx` | 订阅 `lastTriggeredAt`：每次变化即 `load()` 重新拉取 |

### 3.2 设计要点

- 用 Ant Design `<Spin>` 包裹图标，扫描中显示 spinner、完成后恢复。扫描失败后给 `message.error`。
- `useScanStore.trigger()` 在主布局里调用 `scanApi.trigger()`，成功则更新 `lastTriggeredAt = Date.now()` 并设 `scanning = true`；轮询 `scanApi.status()` 直到 `scanning=false` 后停止 spin。
- 扫描按钮 `<Button type="text" icon>` 仅出现在已登录用户页面（因 MainLayout 本身已在路由守卫后，无需二次判断）。
- 图标用 `@ant-design/icons` 的 `ReloadOutlined`（通用「刷新/扫描」语义）。

### 3.3 数据流

```
Header 按钮点击
   → useScanStore.trigger()
       → POST /scan/trigger
       → 成功：setLastTriggeredAt(Date.now()) + 开始轮询
       → 失败：message.error
   → EmbyHome useEffect 监听 lastTriggeredAt
       → 变化即重新 Promise.all([...]) 拉取最新数据
   → 轮询 GET /scan/status 直到 scanning=false
       → store.setScanning(false)
```

## 4. 需求 2：最近播放接口按 media_id 去重

### 4.1 范围

| 文件 | 动作 |
|------|------|
| `backend/internal/handlers/record.go` | 新增 `ListRecent()` Handler：按 media_id 去重取最近一条，含软删除过滤 |
| `backend/internal/router/router.go` | 注册 `GET /records/recent?limit=N` |
| `frontend/src/api/index.ts` | 新增 `recordApi.recent(limit?)` |
| `frontend/src/components/EmbyHome.tsx` | 将 `recordApi.list()` 替换为 `recordApi.recent(20)`；逻辑不变，仍按 media_id 去重（前端去重只用做安全防护） |

### 4.2 后端查询设计（ListRecent）

```sql
SELECT pr.*
FROM play_records pr
INNER JOIN (
    SELECT media_id, MAX(last_played_at) AS max_ts
    FROM play_records
    WHERE user_id = ?
    GROUP BY media_id
) latest ON latest.media_id = pr.media_id AND latest.max_ts = pr.last_played_at
WHERE pr.user_id = ?
  AND pr.media_id IN (SELECT id FROM media_files WHERE deleted_at IS NULL)
ORDER BY pr.last_played_at DESC
LIMIT ?
```

GORM 实现：用 `db.Joins("JOIN (?) latest", subQuery)` 形式，并对子查询内 media 表加软删除过滤。
前端去掉的逻辑：合并后继续保留 `media_id` 二次去重 + 上限 12。

### 4.3 保留现有接口

- `/records` 完整播放记录接口保持不变，仅在学习记录页调用。
- `EmbyHome` 里仅替换掉「继续学习」的数据源路径。

## 5. 需求 3：Emby 风格专辑详情（季 Tabs + 智能封面 + 进度统计）

### 5.1 用户已选

- ✅ 专辑详情页增加「季 (SubAlbum)」标签横滑  
- ✅ 专辑封面从子项智能选取（Emby 逻辑升级）  
- ✅ 专辑入口卡片显示「已看 X / 总数 Y」

### 5.2 范围

| 文件 | 动作 |
|------|------|
| `backend/internal/handlers/media.go` | `ListAlbums()` 增加 `played` 字段（已看媒体数） |
| `frontend/src/types/index.ts` | `Album` 增加可选 `played?: number` |
| `frontend/src/components/EmbyHome.tsx` | `pickAlbumCover()` 支持按 `SubAlbum` 分组、专辑卡片渲染「已看 X/Y」进度徽标 |
| `frontend/src/pages/Home.tsx` | `GridView` 列表顶部增加「全部季」切换 Tabs（Ant Design `<Tabs>`），选中一个子专辑则带 `sub_album` 过滤 |
| `frontend/src/api/index.ts` | `mediaApi.albums()` 承载 played 字段透传 |

### 5.3 后端改动

`ListAlbums()` 增加已看统计（用户维度）：

```sql
SELECT m.album AS album, COUNT(*) AS count,
       COUNT(CASE WHEN r.id IS NOT NULL THEN 1 END) AS played
FROM media_files m
LEFT JOIN play_records r ON r.media_id = m.id AND r.user_id = ?
WHERE m.album IS NOT NULL AND m.album <> '' AND m.deleted_at IS NULL
GROUP BY m.album
ORDER BY m.album ASC
```

返回结构：
```json
{
  "albums": [
    { "album": "English", "count": 30, "played": 12,
      "sub_albums": [{ "sub_album": "Unit1", "count": 10, "played": 3 }, ...] }
  ]
}
```

sub_albums 维度同理加 played。

### 5.4 前端 EmbyHome 改动

- `AlbumEntry` 增加 `played` 字段。
- `AlbumCard` 底部标题区已显示「最近播放」→ 增加 `12/30 已看` 徽标（百分比进度条或 `X/Y` 文字）。
- 现有 `pickAlbumCover` 已经是"最近播放视频优先" → 微调权重：最近视频 > 已看视频 > 第一个视频 > 第一个任意。

### 5.5 前端 GridView 改动

- `albumFilter` 存在时，在工具栏 `<Select>` 旁改为 `<Tabs>` 横滑标签（可左右滑动换季）。
- 「全部」季 + 每个真实 `SubAlbum`。
- 选中 Tab 时设置 `sub_album` searchParam。

## 6. 需求 4：学习记录页面容错（双保险）

### 6.1 后端过滤（源头治理）

| 文件 | 改动点 |
|------|--------|
| `backend/internal/handlers/record.go` | `ListRecords`：对 `Preload("Media")` 找不到的记录过滤掉（找不到则跳过）；`GetProgress` 子查询 `WHERE m.deleted_at IS NULL` 已存在，增加 `LEFT JOIN play_records` 的 `NOT IN (SELECT media_id FROM已删)` 兜底 |
| `backend/internal/handlers/stats.go` | `getWeekStats/getMonthStats/getYearStats`：`PlayCount/MediaCount` 的查询加 `JOIN media_files mf ON ... AND mf.deleted_at IS NULL`，SentenceCount 同理 |

### 6.2 前端容错（不白屏）

| 文件 | 改动点 |
|------|--------|
| `frontend/src/pages/Records.tsx` | 1. 初始加载失败时显示错误提示 + 重试按钮，不再 `catch {} ignore`；2. Table 列渲染 `record.media?.name ?? '（已删除媒体）'` 兜底文字；3. `progress?.albums?.length ?? 0` 已经安全，再统一检查 `progress` null 场景 |
| `frontend/src/components/EmbyHome.tsx` | `r.media?.album` 访问已有安全链；保留不改但确认 |

### 6.3 容错测试矩阵

| 场景 | 预期行为 |
|------|----------|
| 某媒体被软删后查看学习记录 | Table 行显示「（已删除媒体）」，进度/时间正常显示 |
| 用户进入学习记录页时后端 500 | 显示 message.error + 页面「重试」按钮 |
| 单曲句子进度对应的媒体被删 | 统计逻辑不报错、不在统计里计入 |
| 播放整集然后手动移走文件再回去 | 播放进度仍保留，Table 显示「已删除媒体」占位 |

## 7. 实施顺序

按依赖关系与风险排序：

1. **后端过滤**（需求 4 后端部分）— 先稳根基
2. **ListRecent 接口**（需求 2 后端） — 被 EmbyHome 依赖
3. **ListAlbums 加 played**（需求 3 后端）— 独立
4. **前端容错**（需求 4 前端）— 立竿见影减少白屏
5. **Scan Store + 扫描图标**（需求 1） — 独立
6. **EmbyHome 升级 + View 季 Tabs + 进度徽标**（需求 3 前端）— 消费 2/3 后端
7. **EmbyHome 改用 recent**（需求 2 前端） — 消费 2 后端
8. **ChangeLog + 版本号** — 收尾

## 8. 完成验证清单

- [ ] `go build ./...` 通过
- [ ] `go vet ./...` 通过
- [ ] `go test ./... -v` 通过
- [ ] `pnpm build` 通过
- [ ] curl 验证 `GET /records/recent?limit=20` 返回去重结果
- [ ] curl 验证 `GET /albums` 返回 `played` 字段
- [ ] 删除一个媒体文件后刷新学习记录页：不乱跳、不白屏
- [ ] 首页 Header 点击扫描图标：触发后首页数据刷新
- [ ] 专辑详情 Tab 切换季：URL 与数据同步
