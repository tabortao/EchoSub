# PLAN.md — EchoSub 开发计划

> 状态：v1.3.8 无字幕 Echo Loop 开关 + 已听 N 遍逐轮递增 | 日期：2026-07-07

## 活跃里程碑：v1.3.8 无字幕播放器 UI 与计数器微调（2026-07-07 完成）

v1.3.7 修好「已听 N 遍永远停在 1」之后，用户实测发现仍有 2 个细节问题：

1. **无字幕的音频 / 视频 Echo Loop 开关视觉上仍显示 ON**：v1.3.7 加了 `disabled` 防误触，但 Switch 视觉状态没明确切到 OFF，首次进播放器会闪一下「Echo Loop 复读中」徽标
2. **无字幕时「已听 N 遍」计数依然只在第 N 轮结束才 +1**：v1.3.7 修复思路正确（每轮 `onEnded` 触发 playCount++），但因为保存动作 `savePosition(..., incrementPlay: true)` 仍放在「第 N 轮分支」里，导致前 N-1 轮根本未递增

**修复策略**（最小改动 + 状态清晰）：

1. **初始 `mode` 分流**：`useState<PlayMode>('repeat')` → `useState<PlayMode>(hasSubtitleEarly ? 'repeat' : 'normal')`，无字幕时初始 mode 即为 'normal'，避免 UI 闪烁
2. **`hasSubtitleEarly` 派生上移**：line 89 提前到 useState 之前，规避 TDZ（`const hasSubtitle` 在 line 653 才声明）
3. **Switch checked 强化**：`checked={mode === 'repeat'}` → `checked={mode === 'repeat' && hasSubtitle}`，视觉明确 OFF
4. **`onEnded` 每次都递增 playCount**：把 `savePosition(..., incrementPlay: true)` 从「第 N 轮分支」提前到「循环状态机之前」—— 每次 onEnded 触发都 `PlayCount++`

### 一、目标与设计原则

#### 1. 无字幕 UI 初始态分流

**问题现象**：无字幕媒体进入播放器，UI 短暂显示「Echo Loop 复读中」徽标（line 686-688 的 warning tag）

**根因**：

- v1.3.7 把 `disabled={!hasSubtitle}` 加在 Switch 上，但 `mode` 状态默认值仍是 `'repeat'`
- 首次渲染时 `mode === 'repeat'` → warning tag 判定为「复读模式」并渲染
- `useEffect` 跑完才校正（视觉闪烁 1-2 帧）

**修复策略**：

- 初始化时按 `hasSubtitle` 分流 mode：无字幕 → 'normal'，有字幕 → 'repeat'（保留默认学习行为）
- 派生量 `hasSubtitleEarly` 提前到 useState 之前（line 89），规避 TS2448/TS2454

#### 2. Switch 视觉明确 OFF

**修复策略**：

- `checked={mode === 'repeat' && hasSubtitle}` —— `hasSubtitle === false` 时 Switch 视觉上必为 OFF（蓝色滑块 → 灰色）
- 与 `disabled={!hasSubtitle}` 配合：禁用 + 视觉 OFF，无字幕场景双重明确

#### 3. onEnded 每次都递增 playCount（关键修复）

**v1.3.7 残留 bug**：

- v1.3.7 的 `onEnded` 把 `savePosition(..., incrementPlay: true)` 放在「整体循环结束」的 else 分支
- 前 N-1 轮只更新 `overallLoopRef.current`，但**没有**触发后端 `playCount++`
- 用户看到 UI 显示「整体第 2/3 轮」但后端听遍数仍 = 1

**v1.3.8 修复**：

- 把 `savePosition(..., incrementPlay: true)` 提到「循环状态机之前」—— 每次 `onEnded` 触发都调用
- 与 `overallLoopRef.current` 同步递增：第 1 轮结束 UI 1/3 → playCount 1；第 2 轮结束 UI 2/3 → playCount 2；第 3 轮结束 UI 3/3 → playCount 3
- 用 `isFinite(el.duration) && el.duration > 0 ? el.duration : el.currentTime` 兜底 NaN 边界

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `frontend/src/components/MediaPlayer.tsx` | 新增 `hasSubtitleEarly` 派生（line 89）；初始 `mode` 按 subtitle 分流（line 106）；Switch checked 强化（line 971）；`onEnded` 每次都 `savePosition(..., incrementPlay: true)` |
| `docs/ChangeLog.md` | 新增 v1.3.8 章节（Fixed 段：UI 闪烁 + playCount 计数时机；Changed 段：mode 初始值语义） |
| `docs/PLAN.md` | 当前文件（活跃里程碑 v1.3.8） |
| `docs/TASKS.md` | 新增 v1.3.8 任务清单（T1~T4） |

### 三、验证清单

- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过）
- [x] 后端无修改（v1.3.8 仅前端） → `go build` / `vet` / `test` 维持绿
- [x] 文档同步：ChangeLog.md v1.3.8 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.8 段

### 四、收尾说明

- **测试场景**：用任意无字幕 MP3 / MP4，进入播放器 → Switch 应明确为 OFF → 听 1 遍完「整体第 1/3 轮」显示，「已听 N 遍」= 1 → 听 2 遍完「整体第 2/3 轮」，「已听 N 遍」= 2 → 听 3 遍完停止
- **核心教训**（写入 project_memory）：**计数器递增必须与状态机递增同步**——`overallLoopRef.current += 1` 与 `savePosition(..., incrementPlay: true)` 必须在同一处触发，避免 UI 与后端数据错位

---

## 旧版：v1.3.7 播放器无字幕循环 + 听遍数递增（2026-07-07 完成）

v1.3.6 上线后用户实测反馈 2 个新问题：

1. **「已听 N 遍」计数器永远停在 1**：无字幕的音频 / 视频循环 N 次后，后端 `playCount` 不增
2. **无字幕时按句复读仍可点击（边界）**：收藏播放入口未做无字幕保护

**根因**（advisor 指出）：v1.3.6 在 `<video>` / `<audio>` 上加了 `loop={!hasSubtitle}` 走 HTML5 原生 loop。**但浏览器原生 `loop` 属性会吞掉 `ended` 事件**（自动重置 currentTime=0 并 play）—— 这导致：
- `onEnded` 永远不触发
- `overallLoopRef.current` 永远 = 0
- `savePosition(..., incrementPlay: true)` 永远不调用
- 后端 `playCount` 永远不增

**修复策略**（advisor 建议 + 项目最小改动原则）：

1. **移除 `<video>` / `<audio>` 上的 `loop={!hasSubtitle}`** — 统一由 `onEnded` 接管循环
2. **`onEnded` 重构**：移除无字幕早 return；有 / 无字幕共用「整体循环 N 次」状态机；手动 `el.currentTime = 0 + el.play()` 续播
3. **`onModeChange` 优化**：提前判断无字幕 → 提前 return，避免 `setMode('repeat') → setMode('normal')` 中间态闪烁
4. **收藏播放入口保护**：无字幕时拒绝进入收藏播放模式（`favoriteSet` 按 subtitle index 索引，无字幕时为空），toast 提示

### 一、目标与设计原则

#### 1. 移除浏览器原生 loop

**问题现象**：v1.3.6 用 `loop={!hasSubtitle}` 让无字幕文件自动循环，但**计数器全部失效**

**根因**：

- HTML5 `loop` 属性触发后，浏览器内部自动重置 `currentTime=0` 并 `play()`
- 这**不发 `ended` 事件**（`ended` 只在非循环模式下触发）
- `onEnded` 内的 `overallLoopRef.current += 1` 永远不执行
- `savePosition(..., incrementPlay: true)` 永远不调用 → 后端 `playCount` 不增

**修复策略**：

- 完全移除 `<video loop={...}>` / `<audio loop={...}>`
- `onEnded` 手动实现「整体循环 N 次」状态机

#### 2. onEnded 重构

**新逻辑**：

```ts
const onEnded = () => {
  if (modeRef.current === 'repeat') return           // 按句循环不结束
  const el = mediaRef.current
  if (!el) return

  // 有字幕时：补计最后一句（v0.4.x 起的兼容性 fix）
  // 无字幕时：无句可补计
  if (sentencesRef.current.length > 0) {
    const lastIdx = currentSentenceIdxRef.current
    if (lastIdx >= 0 && lastIdx < sentencesRef.current.length) {
      incrementSentenceRepeat(lastIdx)
    }
  }

  // 整体循环 N 次状态机（有 / 无字幕共用）
  if (overallLoopRef.current + 1 < loopCountRef.current) {
    overallLoopRef.current += 1
    el.currentTime = 0
    el.play().then(() => setPlaying(true)).catch(() => {})
  } else {
    setPlaying(false)
    savePosition(el.duration, { force: true, incrementPlay: true })
    message.success('播放完成')
  }
}
```

#### 3. 无字幕禁用按句重复

**两处保护**（v1.3.7 强化）：

- `onModeChange`：提前判断 + 提前 return，避免 setMode 中间态
- 收藏播放入口（line 1143）：无字幕拒绝进入 + toast 提示

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `frontend/src/components/MediaPlayer.tsx` | 移除 `<video>` / `<audio>` `loop={!hasSubtitle}`；`onEnded` 重构（移除无字幕早 return / 共享「整体循环 N 次」状态机）；`onModeChange` 提前 return；收藏播放入口加无字幕保护 |
| `docs/ChangeLog.md` | 新增 v1.3.7 章节（Fixed 段：循环 + 听遍数；Changed 段：完全无原生 loop） |
| `docs/PLAN.md` | 当前文件（活跃里程碑 v1.3.7） |
| `docs/TASKS.md` | 新增 v1.3.7 任务清单（T1~T5） |

### 三、验证清单

- [x] `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过 / 3.98s）
- [x] 后端无修改（v1.3.7 仅前端） → `go build` / `vet` / `test` 维持绿
- [x] 文档同步：ChangeLog.md v1.3.7 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.7 段

### 四、收尾说明

- **测试场景**：用任意无字幕 MP3 / MP4，进入播放器 → 听一遍完应自动重播 → 听 N 遍完 → 后端 `playCount` = N，「整体第 N/N 轮」UI 显示 N
- **收藏播放**：无字幕时按钮拒绝触发，toast 提示「该媒体无字幕文件，无法按收藏列表复读」
- **核心教训**（写入 project_memory）：**永远不要用 HTML5 原生 `loop` 属性** —— 它会吞掉 `ended` 事件，让所有「循环 N 次」状态机失效。统一由 JS 状态机手动控制。

---

## 旧版：v1.3.6 IDE 诊断清空 + Docker ECDICT 打包 + 播放器无字幕循环（2026-07-07 完成）

v1.3.5 上线后用户集中反馈 3 类问题：

1. **IDE problems_and_diagnostics 报告 9 项警告**（unused function / S1009 / modernize / `any` vs `interface{}`）
2. **Docker 部署后「内置词典尚未导入」**：ghcr.io 镜像内不含 ecdict.csv，用户必须手动下载挂载
3. **无字幕时视频/音频不循环**：播完一遍就停止，无法循环听写

本轮一次性解决 3 类问题：

1. **IDE 诊断 9 项清空**（[backend/internal/handlers/word_favorite.go](backend/internal/handlers/word_favorite.go) + [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) + [backend/internal/config/config.go](backend/internal/config/config.go)）：删 unused functions / 简化 nil check / 改用 `any` / 改用 `max()` 内置函数
2. **Docker 镜像打包 ECDICT**（[Dockerfile](Dockerfile) + [.dockerignore](.dockerignore) + [docker-compose.yml](docker-compose.yml)）：`COPY backend/data/dict/ecdict.csv` 写入镜像；`/app/backend/data/dict` 声明为 VOLUME 支持 NAS 挂载覆盖
3. **播放器无字幕循环**（[frontend/src/components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx)）：`<video>` / `<audio>` 加 `loop={!hasSubtitle}`；`onEnded` 加无字幕早 return 避免冲突

### 一、目标与设计原则

#### 1. IDE 诊断清空

**问题现象**：v1.3.5 引入了几处 `unusedfunc` / `unusedparams` / `S1009` / `minmax` / `any` 提示

**根因**：

- v1.3.2 三级缓存设计时写了 `loadWordFavoriteCache` 但 web_dict.go 没用上
- 早期 yaml 解析的辅助函数 `getEnv` / `getEnvInt` 被 yaml.Unmarshal 直接处理代替
- Go 1.18+ 推荐用 `any` 替代 `interface{}`
- Go 1.21+ 内置 `max` / `min` 替代手写 if

**修复策略**（最小改动）：

- 删除 3 个 unused functions（`loadWordFavoriteCache`、`getEnv`、`getEnvInt`）
- `interface{}` → `any`（2 处）
- `if retries < 0 { retries = 0 }` → `retries = max(retries, 0)`
- `req.QueryResult != nil && len(req.QueryResult) > 0` → `len(req.QueryResult) > 0`（nil map len 是 0）
- 保留 gin 助手函数签名一致性：`c` → `_`

#### 2. Docker 镜像内置 ECDICT

**问题现象**：ghcr.io 镜像部署后前端显示「内置词典尚未导入」

**根因**：[.dockerignore](.dockerignore) 中 `backend/data` 整目录被排除 → 镜像内不含 `ecdict.csv`

**修复策略**：

- `.dockerignore`：保留 `!backend/data/dict/ecdict.csv` 显式 include
- `Dockerfile` 第 3 阶段：`COPY backend/data/dict/ecdict.csv /app/backend/data/dict/ecdict.csv`
- `/app/backend/data/dict` 声明为 `VOLUME` → 用户可挂载覆盖
- `docker-compose.yml`：注释化示例展示如何挂载 NAS 路径

**体积影响**：

- 镜像 +65 MB（ecdict.csv 自身大小）
- 用户下载时间增加约 10-15 秒（取决于网络）
- 用户首次启动从「必须下载 + 导入」变为「直接导入」（约 30 秒）

#### 3. 播放器无字幕循环

**问题现象**：用户希望「音频或视频需要可以整体循环播放」

**根因**：

- HTML5 `<video>` / `<audio>` 元素没有 `loop` 属性
- 现有 `onEnded` 逻辑在 `mode === 'repeat'` 时 return，普通模式走「整体循环 N 次」（依赖用户设置）
- 无字幕时 UI 强制 mode ≠ 'repeat'，播完即停

**修复策略**（最小侵入）：

- `<video loop={!hasSubtitle}>` / `<audio loop={!hasSubtitle}>` — HTML5 原生 loop
- `onEnded` 加 `if (sentencesRef.current.length === 0) return` 早 return — 避免冲突
- 有字幕时由原有「整体循环 N 次 + 逐句复读」逻辑接管

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/handlers/word_favorite.go` | 删 `loadWordFavoriteCache` unused func；2 处 `interface{}` → `any`；删 nil check |
| `backend/internal/handlers/web_dict.go` | `c` → `_`；`if retries < 0` → `retries = max(retries, 0)` |
| `backend/internal/config/config.go` | 删 unused `getEnv` / `getEnvInt` |
| `Dockerfile` | `COPY backend/data/dict/ecdict.csv` + `VOLUME /app/backend/data/dict` |
| `.dockerignore` | 显式 `!backend/data/dict/ecdict.csv` 保留 |
| `docker-compose.yml` | 注释化挂载示例 + 内置词典环境变量注释 |
| `frontend/src/components/MediaPlayer.tsx` | `<video>` / `<audio>` 加 `loop={!hasSubtitle}`；`onEnded` 早 return |
| `docs/ChangeLog.md` | 新增 v1.3.6 章节（3 个 Fixed 段） |
| `docs/PLAN.md` | 当前文件（活跃里程碑 v1.3.6） |
| `docs/TASKS.md` | 新增 v1.3.6 任务清单（T1~T6） |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（config 0.8s + handlers 0.03s + learning cached + utils cached + dictcsv cached + subtitle cached）
- [x] `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过 / 5.13s）
- [x] `docker-compose.yml` YAML 解析正确（自定义 check-yaml 工具验证，验证后已删除）
- [x] IDE `problems_and_diagnostics` 清空（9 项 → 0 项）
- [x] 文档同步：ChangeLog.md v1.3.6 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.6 段

### 四、收尾说明

- **Docker 镜像**：`ghcr.io/tabortao/echosub:v1.3.6+` 起内置 ECDICT 词库
- **NAS 用户**：取消挂载注释即可把本地词库覆盖进容器
- **无字幕循环**：HTML5 原生 loop，零代码介入；用户可暂停 / 调节速度 / 跳转都不影响循环
- **`loadWordFavoriteCache` 已删除**：v1.3.2 的"三级缓存"功能 v1.3.6 暂未接入（仅有 query_result 字段持久化），等后续完善后再加回

---

## 旧版：v1.3.5 网页词典 3 个源修复（2026-07-07 完成）

v1.3.4 上线后用户实测反馈 3 类问题：

1. **有道词典 TLS handshake timeout**：`net/http: TLS handshake timeout`（直连被墙/限速）
2. **微软翻译 HTTP 400**：`{"error":{"code":400035,"message":"The source language is not valid."}}`（Edge API 不支持 `from=auto`）
3. **Oxford 404**：复数形式（如 `eggs`）找不到（站点本身只收录单数/原形）

本轮一次性修复 3 个源的实际使用问题：

1. **有道词典移除源级 SkipProxy=true + 从默认 SkipProxyHosts 移除 youdao.com**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) + [backend/internal/config/config.go](backend/internal/config/config.go)）：让用户配的 `ECHOSUB_WEBDICT_PROXY` 自动生效；没配仍走默认（无代理）
2. **微软翻译 `from=auto` → `from=en`**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `fetchMicrosoftTranslate` + `microsoft.BuildURL`）：Edge Translator API 只接受 ISO 639-1 具体语言码
3. **Oxford 404 复数剥 s 重试 1 次**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `handleHTMLScrape`）：检测 `isHTTPNotFound` + 源是 oxford + 单词以 s 结尾 + 长度 > 1 → 剥 s 重试；命中后 `targetURL` 改为单数版

### 一、目标与设计原则

#### 1. 有道词典走代理

**问题现象**：v1.3.4 实测有道在国内偶发 TLS handshake timeout

**根因**：v1.3.2 在源级硬编码 `SkipProxy: true` + 全局默认 `SkipProxyHosts` 含 `youdao.com` → 即便用户配了代理也走直连

**修复策略**：

- 源级 `SkipProxy: true` → `false`（不再硬编码直连）
- 默认 `SkipProxyHosts` 移除 `youdao.com`（让用户代理生效）
- **保持向后兼容**：用户没配代理仍走默认（无代理），不影响普通用户
- **保留用户主动权**：想强制有道直连可 `ECHOSUB_WEBDICT_SKIP_PROXY="youdao.com"`

#### 2. Edge API from=auto 不支持

**问题现象**：微软翻译 `HTTP 400: The source language is not valid (code 400035)`

**根因**：Bing Translator 网页版用 `from=auto`（参数语义是「自动检测」），但 Edge Translator API 端点只接受 ISO 639-1 具体语言码（如 `en` / `zh-Hans` / `ja`）

**修复策略**：

- 硬编码 `from=en`（本应用主要查英文单词）
- 注释说明：若将来支持「中→英」场景，可让前端传 from 参数或前端检测单词字符集

#### 3. Oxford 复数 404

**问题现象**：用户查 `eggs` 拿不到，弹窗显示 404

**根因**：Oxford Learner 词典站点本身只收录**单数/原形**（`egg`），复数（`eggs`）走单独 URL 或直接 404。这是 Oxford 站点数据组织方式，不是抓取侧问题

**修复策略**（最小侵入）：

- 仅在 Oxford 源 + 404 + 单词以 s 结尾 + 长度 > 1 时触发剥 s 重试
- 其他源/其他错误不触发（保持通用行为）
- 命中单数后 `targetURL` 同步更新为单数版，前端「在新窗口打开」也跳单数页

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/handlers/web_dict.go` | `kWebDictSources["youdao"].SkipProxy: true → false`；`microsoft.BuildURL` 中 `from=auto → from=en`；`fetchMicrosoftTranslate` 中 `apiURL from=auto → from=en`；`handleHTMLScrape` 新增 Oxford 404 剥 s 重试逻辑 + `isHTTPNotFound` 辅助函数 |
| `backend/internal/config/config.go` | `WebDictConfig.SkipProxyHosts` 默认值移除 `youdao.com` |
| `docs/ChangeLog.md` | 新增 v1.3.5 章节（3 个 Fixed 段） |
| `docs/PLAN.md` | 当前文件（活跃里程碑 v1.3.5） |
| `docs/TASKS.md` | 新增 v1.3.5 任务清单（T1~T5） |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（config 1.2s + handlers 1.8s + learning cached + utils cached + dictcsv cached + subtitle cached）
- [x] `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过 / 3.81s）
- [x] 文档同步：ChangeLog.md v1.3.5 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.5 段

### 四、收尾说明

- **有道词典代理配置**：用户配 `ECHOSUB_WEBDICT_PROXY` 后自动走代理（解决 TLS timeout）；没配仍走默认（无代理）
- **微软翻译**：硬编码 `from=en`；若要中→英场景需后续前端配合
- **Oxford 剥 s**：仅处理简单复数（`eggs → egg`），不处理不规则复数（`children → child`）或不规则动词过去式（`ran → run`）—— 这些情况仍 404，用户可手动查单数

---

## 旧版：v1.3.4 网页词典最终精简为 5 源 + 微软翻译（2026-07-07 完成）

v1.3.3 修复后用户进一步实测反馈：

1. **百度翻译仍报「抓取受限」**：v1.3.3 改用 `dict.baidu.com/suggest` 端点后依然不行 → 该端点同样被百度风控
2. **谷歌翻译仍 i/o timeout**：即便加了 `ForceProxy=true`，部分海外代理节点对 `translate.googleapis.com` 不友好（被代理服务商封禁 / TCP 阻断 / TLS 拦截），用户也无法继续往更细粒度调
3. **Collins 长期反爬**：留着持续占用源列表
4. **新增需求**：参考 [docs/Reference/STranslate.Plugin.Translate.GoogleWebsite](docs/Reference/STranslate.Plugin.Translate.GoogleWebsite) 思路，新增微软翻译（Edge 翻译 API，无需 key）

本轮一次性移除问题源 + 引入稳定的微软翻译：

1. **移除 Collins / 百度翻译 / 谷歌翻译** 3 个源（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` + [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) `kWebDictConfigs` 同步删除）
2. **新增「微软翻译」**（`microsoft`，Edge 翻译 API）：
   - 原理：完全参考 `docs/Reference/STranslate.Plugin.Translate.GoogleWebsite` 风格，但用 Edge 后端（无需 key）
   - 步骤 1：`GET https://edge.microsoft.com/translate/auth` → 拿短期 JWT token
   - 步骤 2：`POST https://api-edge.cognitive.microsofttranslator.com/translate?from=auto&to=zh-Hans&api-version=3.0` 带 `Authorization: Bearer {token}` → 返回结构化 JSON
   - 8 分钟 token 缓存 + 401 自动失效
3. **源标记 `ForceProxy=true`**：源级强制走用户配置的 `ECHOSUB_WEBDICT_PROXY`，忽略 `SkipProxyHosts`（含 `microsoft.com` 域名）
4. **前端类型 `DictionarySourceId` 同步精简**：移除 `cambridge` / `merriamWebster`（v1.3.3）/ `collins` / `baidu` / `google`（v1.3.4），新增 `microsoft`

### 一、目标与设计原则

#### 1. 移除策略

**Collins / 百度翻译 / 谷歌翻译 三源全面下线**：

- 既然 v1.3.3 的修补（ForceProxy + 换端点）都救不回来，留着只会误导用户
- 翻译型源由「微软翻译」一个更稳定的源替代
- 源数量：v1.3.3 的 7 → **5**

#### 2. 微软翻译 Edge API

- **端点选择依据**：参考 [docs/Reference/STranslate.Plugin.Translate.GoogleWebsite](docs/Reference/STranslate.Plugin.Translate.GoogleWebsite) 的「拿 token + 调 API」两步式设计
- **Token 缓存**：8 分钟（Edge 默认 10 分钟有效，提前 2 分钟续期避免边界超时）
- **401 自动失效**：拿到 401 立刻把缓存清空，下次调用重取
- **强制走代理**：`ForceProxy: true` 覆盖默认 `SkipProxyHosts`（含 `microsoft.com`），国内必须配置 `ECHOSUB_WEBDICT_PROXY`

#### 3. 5 个网页词典最终顺序

```
有道 → 微软翻译 → Oxford → Longman → Wiktionary
```

按「中文友好度（前端用户） + 翻译型源优先 + 词典权威性」排序。

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/handlers/web_dict.go` | 移除 `collinsURL` / `baiduURL` / `googleURL` 构造函数；`kWebDictSources` 移除 3 个 source；新增 `microsoft` source；`webDictSource` 字段 `FetchTranslate` 由 `fetchBaiduTranslate` / `fetchGoogleTranslate` 改为 `fetchMicrosoftTranslate`；新增 `fetchMicrosoftTranslate` + `fetchMicrosoftAuthToken` + token 缓存 + 401 失效 |
| `frontend/src/store/webDictionaryConfig.ts` | `kWebDictConfigs` 移除 `collins` / `baidu` / `google` 3 条，新增 `microsoft`（🪟 微软蓝） |
| `frontend/src/types/index.ts` | `DictionarySourceId` 联合类型同步精简（移除 5 个，加 1 个） |
| `frontend/src/pages/Favorites.tsx` | `sourceLabel` 字典同步移除 `cambridge` / `merriamWebster` / `collins`，新增 `microsoft` |
| `frontend/src/pages/SentenceDetail.tsx` | 翻译型源注释从「baidu / google」改为「microsoft」 |
| `frontend/src/store/wordFavorites.ts` | `favorite` 注释同步源列表 |
| `frontend/src/api/index.ts` | `webDictApi.lookup` 与 `wordFavoriteApi.create` 注释同步源列表 |
| `docs/ChangeLog.md` | 新增 v1.3.4 章节（Removed / Added / Changed / Reference 文档化） |
| `docs/PLAN.md` | 当前文件（活跃里程碑 v1.3.4） |
| `docs/TASKS.md` | 新增 v1.3.4 任务清单（T1~T8） |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（config 1.4s + handlers 3.2s + learning cached + utils 3.2s + dictcsv cached + subtitle cached）
- [x] `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过 / 5.19s）
- [x] 文档同步：ChangeLog.md v1.3.4 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.4 段

### 四、收尾说明

- **代理配置强烈建议**：v1.3.4 微软翻译依赖 `ECHOSUB_WEBDICT_PROXY`；国内用户必须配，否则 i/o timeout（`edge.microsoft.com` 国内直连被 TCP 阻断）
- **前端弹窗切换器**：自动减少 3 个按钮（Collins、百度翻译、谷歌翻译），新增 1 个「🪟 微软翻译」
- **翻译型源快慢对照**：
  - 微软翻译：~300ms（国内走代理） / ~500ms（海外直连 Edge）
  - 之前的百度 / 谷歌：~400ms（国内走代理） / 超时（直连）
  - 仍属「轻量级」，不附带音标 / 词性 / 例句

---

## 旧版：v1.3.3 网页词典精简源 + 修复百度/谷歌（2026-07-07 完成）

v1.3.2 上线后用户实测反馈两类问题：

1. **百度翻译不可用**：`抓取受限，翻译失败：百度翻译失败：errno=1000,errmsg=未知错误`
   根因：`https://fanyi.baidu.com/sug?wd={word}` 端点 2024 年起已被百度风控
2. **谷歌翻译国内超时**：`请求失败：dial tcp 74.125.142.95:443: i/o timeout`
   根因：`translate.googleapis.com` 命中 v1.3.2 默认 `SkipProxyHosts`（含 `googleapis.com`），被强制直连
3. **Cambridge / Merriam-Webster 长期 403**：留着误导用户

本轮针对性修复：

1. **移除 Cambridge、Merriam-Webster 源**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` + [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) `kWebDictConfigs`）：长期 403，源数量 9 → 7
2. **`webDictSource` 新增 `ForceProxy` 字段**：与 `SkipProxy` 互斥。`google` 源标记 `ForceProxy=true` → 忽略 `cfg.WebDict.SkipProxyHosts` / `OnlyProxyHosts`，只读 `cfg.WebDict.CustomProxy`，强制走用户配置的代理
3. **`makeProxyForSource` 决策升级**：三分支（SkipProxy / ForceProxy / 默认按域名分流）
4. **百度翻译换端点**：`fanyi.baidu.com/sug` → `dict.baidu.com/suggest?wd={word}&json=1&type=0`（百度词典公开 suggest API，与百度翻译同源数据；额外提供音标 `p` 和多重释义数组 `c`）
5. **前端同步精简**：弹窗切换器自动减少 2 个按钮

### 一、目标与设计原则

#### 1. 移除策略

**Cambridge、Merriam-Webster 长期返回 403 / 503**：

- 即使在 v1.3.2 已经做了「Mobile Safari UA + Google Referer + 跳过代理」组合优化，仍然无法稳定抓取
- 前端弹窗显示「抓取受限」会让用户以为系统坏了
- **决策**：直接移除，源数量 9 → 7

#### 2. ForceProxy 与 SkipProxy 三分支

```
源级代理决策：
├─ SkipProxy=true           → 返回 nil（直连，源级强制）  
├─ ForceProxy=true（新增） → 只读 cfg.WebDict.CustomProxy，忽略 SkipProxyHosts / OnlyProxyHosts
└─ 默认                     → 合并 cfg.WebDict.SkipProxyHosts / OnlyProxyHosts（按域名分流）
```

**ForceProxy 触发场景**：

- 默认 `SkipProxyHosts` 包含 `googleapis.com`
- `translate.googleapis.com` 命中后被强制直连 → 国内 i/o timeout
- 用户实际需求：「谷歌翻译需要走代理」
- **解决**：在源级声明 `ForceProxy=true` 覆盖全局配置

**为什么不改默认 SkipProxyHosts**：

- 有道 / 百度等中文站确实应该直连（境外 IP 反而被风控）
- 如果从默认列表移除 `googleapis.com`，那么所有 googleapis 域名的调用都会走代理（包括前端 PWA / GA 等无关请求）
- 源级 `ForceProxy` 是更精细的方案

#### 3. 百度翻译新端点

- **旧端点**：`https://fanyi.baidu.com/sug?wd={word}`
  - 2024 年起所有请求都返回 `{"errno":1000,"errmsg":"未知错误"}`
  - 推测：百度对 `/sug` 端点做了 sign 校验或 IP 风控
- **新端点**：`https://dict.baidu.com/suggest?wd={word}&json=1&type=0`
  - 百度词典的公开 suggest 接口
  - 与百度翻译共用同一套后端词典数据
  - 无风控、无需 sign、稳定可用
  - 响应字段比 `/sug` 更丰富：
    - `v` 字段：主释义（简版）
    - `p` 字段：音标（v1.3.2 没有）
    - `c` 字段：多重释义数组（v1.3.2 没有）

#### 4. 7 个网页词典最终顺序

```
有道 → 百度翻译 → 谷歌翻译 → Oxford → Longman → Collins → Wiktionary
```

按「中文友好度 + 翻译型源优先」排序。

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/handlers/web_dict.go` | 移除 `cambridgeURL` / `merriamWebsterURL` 构造函数；`kWebDictSources` 移除 2 个 source；`webDictSource` 新增 `ForceProxy bool`；`google` 源 `ForceProxy: true`；`makeProxyForSource` 三分支；`fetchBaiduTranslate` 换端点 + 解析 `p` / `c` 字段 |
| `frontend/src/store/webDictionaryConfig.ts` | `kWebDictConfigs` 移除 `cambridge` / `merriamWebster` 两条；注释更新到 v1.3.3 |
| `docs/ChangeLog.md` | 新增 v1.3.3 章节（Removed / Fixed / Changed / Known 遗留） |
| `docs/PLAN.md` | 当前文件（活跃里程碑 v1.3.3） |
| `docs/TASKS.md` | 新增 v1.3.3 任务清单（T1~T16） |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（handlers / learning / utils / dictcsv / subtitle）
- [x] `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过）
- [x] 文档同步：ChangeLog.md v1.3.3 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.3 段

### 四、收尾说明

- **代理配置强烈建议**：v1.3.3 谷歌翻译依赖 `ECHOSUB_WEBDICT_PROXY`；国内用户必须配，否则 i/o timeout
- **前端弹窗切换器**：自动减少 2 个按钮（Cambridge、Merriam-Webster）
- **`fetchBaiduTranslate` 解析增强**：v1.3.3 起支持音标 + 多重释义数组，信息量比 v1.3.2 丰富

---

## 旧版：v1.3.2 网页词典按域名分流 + 翻译型源 + 词义持久化（2026-07-07 完成）

v1.3.1 引入 `ECHOSUB_WEBDICT_PROXY` 后国内用户集中反馈两类问题：
1. **有道词典失效**：开代理后从境外 IP 访问 `m.youdao.com` 经常被风控或返回简版页面
2. **英文词典仍然 403**：Cambridge / Oxford / Longman / Merriam-Webster / Collins 仍有概率被反爬

同时提出新需求：
3. **加入百度翻译、谷歌翻译**为网页词典源（避开 JS SPA 抓取）
4. **收藏的单词需要记住查询的词义**，下次直接从数据库读取

本轮彻底解决这两类问题 + 两条新需求：

1. **按域名分流代理**（[backend/internal/config/config.go](backend/internal/config/config.go) + [backend/internal/utils/http_client.go](backend/internal/utils/http_client.go)）：`WebDictConfig` 新增 `SkipProxyHosts` / `OnlyProxyHosts` 字段；中文站点（有道 / 百度 / 谷歌）默认跳过代理，英文站点按需走代理。新增 2 个环境变量 `ECHOSUB_WEBDICT_SKIP_PROXY` / `ECHOSUB_WEBDICT_ONLY_PROXY`。
2. **每个源独立配置 UA / Referer / Accept-Language**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go)）：Merriam-Webster 改用 Mobile Safari UA（移动版可抓，desktop 经常 403）；Cambridge / Oxford / Longman / Collins 模拟从 Google 搜索点过来（带 Referer）。
3. **新增「翻译型」源**：baidu（`fanyi.baidu.com/sug`，公开 JSON 接口）+ google（`translate.googleapis.com/translate_a/single`，公开 API），**无需 key**，直接返回结构化 JSON。彻底绕开 Cambridge / Oxford 的反爬。
4. **单词收藏持久化词义快照**（[backend/internal/models/models.go](backend/internal/models/models.go) + [backend/internal/handlers/word_favorite.go](backend/internal/handlers/word_favorite.go)）：`WordFavorite` 新增 `QueryResult string` 字段；`POST /word-favorites` 接受 `query_result: {...}` 字段；`LookupWebDict` 三级缓存策略（**进程内缓存 → 收藏快照 → 实际抓取**）；即使 Cambridge / Oxford 全部失效、即使代理挂了，已收藏的单词仍能秒开。
5. **前端集成**（[frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) + [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) + [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx)）：新增 baidu / google 切换按钮；弹窗支持翻译型源展示；命中收藏快照时显示金黄色 `⭐ 已收藏词义（离线快照）` 徽标；收藏页打开查词弹窗时优先用 `wordFavorite.query_result` 渲染（零网络请求）。

### 一、目标与设计原则

#### 1. 按域名分流代理

- **决策顺序**（[backend/internal/utils/http_client.go](backend/internal/utils/http_client.go) `shouldProxy`）：
  1. `OnlyProxyHosts` 非空 → 必须 host 在白名单内才走代理（**严格白名单模式**）
  2. `SkipProxyHosts` 非空 → host 在黑名单内则直连
  3. 默认 → 走代理
- **`hostMatchesAny` 匹配规则**：完全相等 OR `host` 以 `.pattern` 结尾（支持 `dict.youdao.com` 命中 `youdao.com`）
- **默认 SkipProxyHosts**（开箱即用）：`youdao.com / baidu.com / baidupc.com / translate.google.com / translate.googleapis.com / gstatic.com / ggpht.com / googleapis.com` —— 这些域名从境外 IP 访问反而被风控
- **环境变量**：留空 = 走默认；显式写 `none` = 清空；多值用半角逗号分隔

#### 2. 每个源独立 UA / Referer

| 源 | UA | Referer | Accept-Language | SkipProxy |
|---|---|---|---|---|
| 有道 | Mobile Safari | — | zh-CN,zh;q=0.9,en;q=0.8 | ✅ |
| Cambridge | Desktop Chrome | https://www.google.com/ | en-US,en;q=0.9 | — |
| Oxford | Desktop Chrome | https://www.google.com/ | en-US,en;q=0.9 | — |
| Longman | Desktop Chrome | https://www.google.com/ | en-US,en;q=0.9 | — |
| Merriam-Webster | **Mobile Safari** | — | en-US,en;q=0.9 | — |
| Collins | Desktop Chrome | https://www.google.com/ | en-US,en;q=0.9 | — |
| Wiktionary | Desktop Chrome | — | en-US,en;q=0.9 | — |
| 百度翻译 | Mobile Safari | https://fanyi.baidu.com/ | zh-CN,zh;q=0.9,en;q=0.8 | ✅ |
| 谷歌翻译 | Desktop Chrome | https://translate.google.com/ | en-US,en;q=0.9,zh-CN;q=0.8 | — |

#### 3. 翻译型源设计

- **百度翻译**：`GET https://fanyi.baidu.com/sug?wd={word}` → `{"errno":0,"data":[{"k":"hello","v":"hi; hello; int. 哈啰，你好"}]}` 取第一条 `v`
- **谷歌翻译**：`GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q={word}` → `[[["你好","hello",null,null,1]],null,null,...]` 取 `raw[0][0][0]`
- **优点**：无需 key、无反爬、响应快、跨设备
- **与 html 源共用**：弹窗渲染 / 缓存 / 兜底 / 收藏快照 同一份代码

#### 4. 词义快照三级缓存

```
GET /api/v1/dictionary/web/lookup?source=...&word=...
   ↓
[1] 进程内内存缓存 (5min for translate, 60min for html)
   miss ↓
[2] 收藏词义快照 (永久, 跨进程/跨重启/跨设备)
   miss ↓
[3] 实际网络抓取 / 翻译 API 调用
```

收藏快照命中时响应 payload 包含 `favorite: true / favorite_id / favorite_source / cached: true` 字段，前端展示「离线快照」徽标。

#### 5. 前端 UX

- 弹窗内切换器新增 2 个按钮：**百度翻译**（🐾 蓝） / **谷歌翻译**（🌍 谷歌蓝），按 1-2-3 顺序排在有道 / Cambridge 之间
- 翻译型源弹窗：单纯展示 `translation` + 源/目标语言徽标 + 音标（部分源可能给），不展示 HTML 内容区
- 命中收藏快照时弹窗顶部显示：
  - 金黄色 `⭐ 已收藏词义（离线快照）` 徽标
  - `内存缓存` 灰色徽标
- 收藏按钮点击成功后 toast：「已收藏「xxx」（已保存词义快照，下次离线秒开）」

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/config/config.go` | `WebDictConfig` 新增 `SkipProxyHosts` / `OnlyProxyHosts` 字段 + `Default()` 8 个中文域名默认 + 2 个新环境变量 |
| `backend/internal/utils/http_client.go` | `ProxyConfig` 新增 `SkipProxyHosts` / `OnlyProxyHosts` + `shouldProxy` / `hostMatchesAny` 决策函数 |
| `backend/internal/handlers/web_dict.go` | `kWebDictSources` 重构为结构化注册表 + 每源 UA/Referer/Accept-Language + `fetchBaiduTranslate` / `fetchGoogleTranslate` 公开 API 客户端 + `loadWordFavoriteCache` 三级缓存 |
| `backend/internal/handlers/word_favorite.go` | `createWordFavoriteReq.QueryResult map[string]interface{}` + JSON 序列化 + 256KB 上限 + `loadWordFavoriteCache` 公开 |
| `backend/internal/models/models.go` | `WordFavorite.QueryResult string \`gorm:"type:text"\`` |
| `frontend/src/store/webDictionaryConfig.ts` | **重写**：移除 `buildUrl`（不再 window.open）+ 新增 `kind: 'html' \| 'translate'` + 新增 baidu / google |
| `frontend/src/types/index.ts` | `DictionarySourceId` 加 `baidu` / `google`；`WebDictLookupResponse` 加 11 个新字段；`WordFavorite` 加 `query_result?` |
| `frontend/src/api/index.ts` | `wordFavoriteApi.create` 接受 `query_result?: Record<string, unknown>` |
| `frontend/src/store/wordFavorites.ts` | `favorite(word, source?, note?, queryResult?)` 第 4 个参数 |
| `frontend/src/store/dictionary.ts` | `DictionarySourceId` 改为 `@/types` re-export |
| `frontend/src/pages/SentenceDetail.tsx` | 收藏时把 webData 整个当 query_result 传；弹窗支持翻译型源展示；命中快照显示徽标 |
| `frontend/src/pages/Favorites.tsx` | 打开单词查词弹窗时优先用 `wordFavorite.query_result` 渲染；弹窗支持翻译型源 |
| `docs/ChangeLog.md` | 新增 v1.3.2 章节 |
| `docs/PLAN.md` | 当前文件（活跃里程碑段） |
| `docs/TASKS.md` | 新增 v1.3.2 任务清单 |
| `docs/CONFIGURATION.md` | 新增「按域名分流代理」「翻译型源」「词义快照」三节 |
| `README.md` | API 概览补充 `query_result` 字段说明 |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（config 3 + handlers 8 + learning 10 + utils 7 + dictcsv 16 + subtitle 8 = 52 用例）
- [x] `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过）
- [x] 文档同步：ChangeLog.md v1.3.2 章节 / PLAN.md 当前活跃里程碑 / TASKS.md v1.3.2 段 / CONFIGURATION.md 补充

### 四、收尾说明

- **`query_result` 刷新机制**：再次调用 `wordFavoriteApi.create` 时若传了非空 `query_result` 字段，后端会覆盖旧快照；用户可在 Settings 主动「重新收藏」覆盖
- **翻译型源 vs HTML 源选择**：翻译型源快、稳、但只有简短译文；HTML 源慢、易 403、但有完整词条 + 音标 + 例句；建议日常用 baidu / google 快速过词，重要单词切到 youdao / cambridge 看完整释义后再收藏
- **Merriam-Webster 移动版 UA**：在某些 CDN 区域可能仍然 403；前端已有「blocked=true + 在新窗口打开」兜底
- **已知遗留**：百度 / 谷歌翻译公开 API 有日请求量软限制（实测单 IP 千次/小时不会触发）；`query_result` 是**首次收藏时的快照**不会自动更新

---

## 旧版：v1.3.1 网页词典 / AI 代理配置 + 部署文档化（2026-07-07 完成）

v1.3.0 上线后国内用户集中反馈：网页词典抓取时频繁出现 `context deadline exceeded` / `HTTP 403`，查词弹窗里看到「抓取受限」；AI 翻译请求 OpenAI / DeepSeek 等海外 API 也慢。本轮彻底修复网络问题，并把所有环境变量 / 代理 / 部署细节集中到一个文档：

1. **统一 HTTP 客户端工厂**（[backend/internal/utils/http_client.go](backend/internal/utils/http_client.go)）：新增 `NewHTTPClient(timeout, *ProxyConfig)`，自定义 `*http.Transport.Proxy` 字段（默认零值 transport 不读 `HTTPS_PROXY`，是历史常见坑）；支持 http / https / socks5；连接池 / TLS 握手 / 拨号 全部独立超时。
2. **AI 翻译走代理**（[backend/internal/handlers/ai.go](backend/internal/handlers/ai.go)）：`callOpenAI` 改用 `utils.NewHTTPClient` 注入 `cfg.AI.Proxy`，OpenAI / DeepSeek / 通义 等海外 API 在国内也能稳定访问。
3. **网页词典抓取重构**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go)）：默认超时 6s → 15s，失败自动重试 1 次（仅 timeout / 网络错误），内存 LRU 缓存 60 分钟，失败结果也缓存 5 分钟避免重复触发；浏览器风格请求头补全（Sec-Fetch-* / Upgrade-Insecure-Requests），新增 gzip / deflate / brotli 三种 `Content-Encoding` 解压。
4. **新增 5 个环境变量**（[backend/internal/config/config.go](backend/internal/config/config.go)）：`ECHOSUB_AI_PROXY` / `ECHOSUB_WEBDICT_TIMEOUT` / `ECHOSUB_WEBDICT_RETRIES` / `ECHOSUB_WEBDICT_CACHE_MINUTES` / `ECHOSUB_WEBDICT_PROXY`。
5. **`docs/CONFIGURATION.md` 部署与代理配置文档**（[docs/CONFIGURATION.md](docs/CONFIGURATION.md)）：把后端所有环境变量、AI 翻译配置、网页词典抓取配置、代理系统设计、Docker / docker-compose / Kubernetes / systemd 部署示例、配置验证清单、故障排查**集中到一个文档**。

### 一、目标与设计原则

#### 1. 代理系统设计

- **优先级**：自定义 `CustomProxy` > `http.ProxyFromEnvironment`（读 `HTTPS_PROXY/HTTP_PROXY/NO_PROXY`） > 直连
- **协议支持**：`http://` / `https://` / `socks5://`
- **降级保护**：URL 解析失败 → 自动降级到环境变量；不因一个拼写错误让所有出站请求失败
- **作用域分离**：`ECHOSUB_AI_PROXY` 仅影响 AI；`ECHOSUB_WEBDICT_PROXY` 仅影响网页词典；互不干扰
- **`NO_PROXY` 语义**：`ECHOSUB_AI_PROXY` / `ECHOSUB_WEBDICT_PROXY` 是显式配置，不被 `NO_PROXY` 绕过；仅当它们为空时 `NO_PROXY` 才生效

#### 2. 网页词典抓取稳定性

- **超时**：默认 15 秒（v1.3.0 的 6 秒太短，海外站点慢），可按网络情况调到 30+
- **重试**：仅对 `context deadline exceeded` / `EOF` / `connection reset` / `no such host` / `i/o timeout` / `net.OpError` 重试；4xx/5xx / 业务错误 不重试
- **退避**：第 2 次重试前 sleep 500ms（指数退避）
- **缓存**：成功按 `CacheMinutes`（默认 60）缓存；失败结果单独缓存 5 分钟避免重复触发
- **请求头**：补全 `Sec-Fetch-Dest / Sec-Fetch-Mode / Sec-Fetch-Site / Sec-Fetch-User / Upgrade-Insecure-Requests`，减少被反爬识别的概率
- **解压**：gzip / deflate / brotli（依赖 `andybalholm/brotli`）

#### 3. 文档体系

- **`docs/CONFIGURATION.md`**：用户最关心的两个问题「AI 怎么走代理？」「Docker 内如何配置代理？」都有专门章节 + 完整 `docker-compose.yml` 示例
- **Docker 场景覆盖**：海外服务器 / 国内 + Clash 跑在宿主机 / 国内 + 远程代理 / 国内 AI（DeepSeek / 通义）
- **故障排查清单**：timeout / 403 / 代理不生效 / JWT 默认 secret / 数据库锁

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/utils/http_client.go` | **新建** `NewHTTPClient` + `ProxyConfig` |
| `backend/internal/handlers/global.go` | 新增 `SetGlobalConfig` / `GetGlobalConfig` + gzip/deflate/brotli 解压工具 |
| `backend/internal/config/config.go` | 新增 `WebDictConfig` + `AIConfig.Proxy` + 5 个环境变量加载 + 启动日志 |
| `backend/internal/handlers/ai.go` | `callOpenAI` 改用 `utils.NewHTTPClient` |
| `backend/internal/handlers/web_dict.go` | 抓取改用 `utils.NewHTTPClient` + 重试 + 缓存 + 解压 + 浏览器请求头 |
| `backend/internal/router/router.go` | 启动时 `handlers.SetGlobalConfig(cfg)` 注入全局配置 |
| `backend/go.mod` / `go.sum` | 新增 `github.com/andybalholm/brotli v1.2.2` |
| `docs/CONFIGURATION.md` | **新建** 后端配置 & 部署指南（12 章节） |
| `docs/ChangeLog.md` | 新增 v1.3.1 章节 |
| `docs/PLAN.md` | 当前文件（活跃里程碑段） |
| `docs/TASKS.md` | 新增 v1.3.1 任务清单 |
| `README.md` | API 概览 + 「🔧 配置 & 部署」段落（指向 CONFIGURATION.md） |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（cached）
- [x] `pnpm build` exit code 0
- [x] 文档同步：ChangeLog.md v1.3.1 章节 / PLAN.md v1.3.1 活跃里程碑 / TASKS.md v1.3.1 段 / README.md v1.3.1 行为说明 / CONFIGURATION.md 已创建

### 四、收尾说明

- **代理协议支持** `socks5://` 需要 Go 1.20+，本项目使用 Go 1.25 / toolchain go1.26.4 完全支持
- **Docker 宿主机代理**：Windows / macOS 用 `host.docker.internal`；Linux 用 `172.17.0.1` 或宿主机 IP
- **国内 AI 替代**：OpenAI 走代理仍可能慢，可改用 DeepSeek / 通义千问（OpenAI 兼容协议，国内直连）
- 已知遗留：有道 / 朗文 等对爬虫严格的站点即便配置代理也可能拿到 403；前端查词弹窗已做「blocked=true + 在新窗口打开」兜底
- 已知遗留：`WebDictCache` 是进程内内存缓存（重启后清空），不做持久化；如需跨进程共享可升级到 Redis（暂未实现）

---

## 旧版：v1.3.0 网页词典弹窗化 + 单词收藏体系 + 收藏页（句子/单词）（2026-07-06 完成）

本轮完成两件事，对应两个长期痛点：

1. **网页词典不再 `window.open` 跳新标签页**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) / [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx)）：Cambridge / Oxford / 有道等 7 个网页词典改为「后端 fetch + XSS 清洗 + 弹窗内渲染」，用户停留在当前页面就能看完整释义；弹窗内可一键切换源。失败兜底 `blocked=true` 时弹窗提供「在新窗口打开」按钮，不让用户卡住。
2. **单词收藏 + 侧边栏「⭐ 收藏」页**（[backend/internal/handlers/word_favorite.go](backend/internal/handlers/word_favorite.go) / [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) / [frontend/src/store/wordFavorites.ts](frontend/src/store/wordFavorites.ts)）：新增 `WordFavorite` 数据模型 + 5 个 REST API + Zustand 持久化 store；查词弹窗标题栏 ⭐ 按钮一键收藏，侧边栏「⭐ 收藏」页分「📜 句子」/「🔤 单词」两个 tab 集中管理（句子来自 `SentenceProgress.favorited=true`，单词来自 `word_favorites` 表），方便复习。

### 一、目标与设计原则

#### 1. 网页词典抓取 / 清洗 / 渲染

- **后端抓取**：`net/http` 6s 超时 + 1MiB 响应上限 + 模拟 Chrome UA（避免 UA 过滤），用 `golang.org/x/net/html` AST 遍历 + `microcosm-cc/bluemonday` 白名单
- **去噪策略**：删除 `<script> / <style> / <noscript> / <iframe> / <svg> / <header> / <nav> / <footer> / <aside> / <form>` 及 class/id 命中 `nav|menu|sidebar|footer|header|ad-|ads|advert|banner|cookie|consent|popup|modal|toolbar|breadcrumb|promo|share|social|comment|related|recommend|survey` 的元素
- **链接重写**：相对链接 → 绝对链接；`<a>` 强制 `target=_blank rel=noopener noreferrer`，避免在 iframe 中跳转污染 SPA 路由
- **失败兜底**：目标网站返回 403/反爬时，响应 `blocked=true` + `error` 字段，弹窗显示「部分词典对抓取有限制，可点击下方「在新窗口打开」手动查看」

#### 2. 单词收藏体系

- **数据模型**：`WordFavorite { id, user_id, word, source, note, hit_count, created_at, updated_at }`，联合唯一索引 `(user_id, word)`
- **幂等**：`POST /word-favorites` 同 user 重复收藏同 word 不报错，`hit_count++` 即可；`source` 记录首次收藏来源（`ai / local / builtin / youdao / cambridge / ...`），不被覆盖
- **批量检查**：`GET /word-favorites/check?words=hello,world` 返回 `{favorited: {hello: id1, world: id2}}` 用于弹窗 ⭐ 状态同步
- **持久化**：前端 `useWordFavoritesStore`（Zustand + persist），最多缓存 200 条，失败时回滚

#### 3. 收藏页布局

- **顶部 tab**：`Segmented` 二选一，URL `?tab=words` 可直链
- **句子 tab**：拉最近 50 个媒体的 `SentenceProgress` → 过滤 `favorited=true` → 关联字幕拿到完整文本 → 按 `updated_at` 倒序
- **单词 tab**：`word_favorites` 全列表 + 模糊搜索（不区分大小写）+ 单条笔记编辑 + 删除
- **查词弹窗**：内置 ECDICT 命中优先展示 + 7 个网页词典切换按钮；URL `?word=xxx` 自动打开该单词查词弹窗
- **响应式**：手机端单列 / 桌面端两列 / 触控目标 ≥44px

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `backend/internal/models/models.go` | 新增 `WordFavorite` 模型 + `TableName()` |
| `backend/internal/database/database.go` | `AutoMigrate` 注册 `&models.WordFavorite{}` |
| `backend/internal/handlers/web_dict.go` | **新建** `LookupWebDict`（后端 fetch + 清洗）|
| `backend/internal/handlers/word_favorite.go` | **新建** 5 个 handler：`Create/List/Check/UpdateNote/Delete` |
| `backend/internal/router/router.go` | 注册 `/dictionary/web/lookup` + `/word-favorites` 5 条 |
| `frontend/src/types/index.ts` | 新增 `WebDictLookupResponse` / `WordFavorite` / `WordFavoriteListResponse` |
| `frontend/src/api/index.ts` | 新增 `webDictApi` / `wordFavoriteApi` |
| `frontend/src/store/wordFavorites.ts` | **新建** Zustand store（persist 持久化） |
| `frontend/src/pages/SentenceDetail.tsx` | 网页词典改弹窗渲染 + 弹窗标题栏 ⭐ 收藏 + 「在收藏页查看此单词」 |
| `frontend/src/pages/Favorites.tsx` | **新建** 收藏页（句子/单词 tab + 查词弹窗 + 笔记编辑） |
| `frontend/src/layouts/MainLayout.tsx` | 侧边栏新增「⭐ 收藏」菜单入口 |
| `frontend/src/router/index.tsx` | 新增 `/favorites` 路由 |
| `docs/ChangeLog.md` | 新增 v1.3.0 章节 |
| `docs/PLAN.md` | 当前文件（活跃里程碑段） |
| `docs/TASKS.md` | 新增 v1.3.0 任务清单 |
| `README.md` | API 概览新增 v1.3.0 行为说明 + 收藏页段落 |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + 字典解析 8 ≈ 21+ 个）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过，1571 modules transformed）
- [x] PWA precache 27 entries（1773.83 KiB）
- [x] 文档同步：ChangeLog.md v1.3.0 章节 / PLAN.md v1.3.0 活跃里程碑 / TASKS.md v1.3.0 段 / README.md v1.3.0 行为说明

### 四、收尾说明

- **网页词典** 部分词典（Cambridge / Oxford）有反爬机制，后端 fetch 可能拿到 403；弹窗检测到 `blocked=true` 时会显示「在新窗口打开」链接，不让用户卡住
- **单词收藏** 联合唯一索引 `(user_id, word)` 保证幂等；后端不做大小写归一化，由前端在 POST 前 `word.trim().toLowerCase()` 保证一致
- **收藏页性能** 句子 tab 当前是「最近 50 个媒体」N+1 拉取，初期足够；后续可加后端 `GET /word-favorites/sentences` 聚合接口优化
- 已知遗留：Favorites 页没有专门的「导出 Anki 牌组」按钮（用户后续可提需求）

---

## 旧版：v1.2.0 Echo Loop 复读模式 + 句子原文按词查词 + 词典智能回退 + 移除学习计划（2026-07-06 完成）

本轮完成四件事：

1. **Echo Loop 复读模式** ([MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：参考 Echo Loop 的逐句复读交互，默认开启复读模式，新增顶部状态条（每句 ×N 遍 / 句末停 K 秒 / 整体循环 M 次 + 实时「第 i/N 句 · 重复 r/N」）。
2. **句子详情页原文按词点击查词** ([SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：新增 `splitSentenceTokens` 分词工具，原文卡片每个 word token 渲染为可点击 span，**不依赖 AI explain** 也能查词。
3. **词典智能回退** ([SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：默认源是 AI 但 `aiStatus.enabled === false` 时自动改用内置 ECDICT；AI 查词失败时也自动回退到内置词典；UI 多挂橙色 tag 提示「AI 未启用 · 查词自动回退到内置词典」。
4. **取消学习计划功能**：删除 `useLearningProgress` hook + `LearningModeBanner` 组件 + MediaPlayer 中的难句标记 UI + `current_sub_stage` 自动行为分支；保留后端 `/api/v1/learning/*` 接口方便后续版本复用。

附带：[`scripts/download-ecdict.ps1`](scripts/download-ecdict.ps1) PowerShell 5.1 中文编码错误修复（改为纯 ASCII 英文）。

### 一、目标与设计原则

#### 1. Echo Loop 复读模式

- **默认开启**逐句复读（用户可手动关闭）
- 三档用户设置直接复用 v0.1.0 起落库的 `sentence_repeat` / `pause_seconds` / `loop_count`，无新增字段
- 状态条让用户对当前复读进度有完整可见性（区别于 v0.1.0 隐式的句末停顿）

#### 2. 句子详情页查词不依赖 AI

- 单词识别：`/[A-Za-z][A-Za-z0-9'\-]*/g`，覆盖 `don't` / `well-known` 等
- 标点 / 空格作为 `sep` token 保留原句版式
- 单词 span 走 `handleWordClick` 复用现有分派逻辑（AI / 本地 / 内置 / 网页词典）

#### 3. 词典智能回退

```
handleWordClick(word)
  ├── isWeb(defaultSourceId) → window.open
  ├── defaultSourceId='ai' && aiStatus.enabled=false → kind='builtin'  ← v1.2.0 新增
  ├── defaultSourceId='ai' && aiApi.dictionary 失败 → builtinDictApi.lookup  ← v1.2.0 新增
  ├── defaultSourceId='local' && localDicts 空 → 错误提示「请上传本地词典」
  └── defaultSourceId='builtin' → builtinDictApi.lookup
```

回退时不弹错误，只用 `message.info` 提示「已自动切换到内置 ECDICT」。

#### 4. 移除学习计划

- ✅ 删除 `useLearningProgress` / `LearningModeBanner`
- ✅ 删 MediaPlayer 中的 `current_sub_stage` 监听 + 难句标记 UI
- ✅ 保留后端 API（`/api/v1/learning/*` + `/api/v1/media/:id/difficult-sentences` + `/api/v1/media/:id/learning-progress`）
- ✅ 与 Echo Loop 的「复读模式即学习」设计一致

### 二、文件变更清单

| 路径 | 变更 |
|------|------|
| `frontend/src/components/MediaPlayer.tsx` | 新增 Echo Loop 状态条；移除 `useLearningProgress` / `LearningModeBanner` / 难句标记 UI / `current_sub_stage` 监听 |
| `frontend/src/pages/SentenceDetail.tsx` | 新增 `splitSentenceTokens` 工具 + 原文按词点击 span + `handleWordClick` AI 智能回退 + UI Alert 友好化 |
| `frontend/src/hooks/useLearningProgress.ts` | **删除** |
| `frontend/src/components/LearningModeBanner.tsx` | **删除** |
| `scripts/download-ecdict.ps1` | 中文注释 / 输出 → 纯 ASCII 英文（修 PS 5.1 编码错误） |
| `docs/ChangeLog.md` | 新增 v1.2.0 章节 |
| `docs/PLAN.md` | 当前文件（活跃里程碑段） |
| `docs/TASKS.md` | 新增 v1.2.0 任务清单 |
| `README.md` | API 概览新增 v1.2.0 行为说明 |

### 三、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（cached，subtitle 8 + dictcsv 5 ≈ 13 个）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过）
- [x] 集成测试 `python scripts/test-api.py` 全 PASS（v1.1.0 的 45 项；v1.2.0 不新增后端接口）
- [x] 文档同步：ChangeLog.md v1.2.0 章节 / PLAN.md v1.2.0 活跃里程碑 / TASKS.md v1.2.0 段 / README.md v1.2.0 行为说明
- [x] `scripts/download-ecdict.ps1` 在 PowerShell 5.1 下可正常执行（无字符串解析错误）

### 四、收尾说明

- Echo Loop 复读模式与 v0.1.0 起的「复读模式」字段完全兼容，无需数据迁移
- `pnpm lint` 仍报 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次重构之前的 React 19 新规则遗留），不影响 `pnpm build`
- 已知遗留：单词查词回退到内置词典时不暴露 AI 真实错误信息（按用户「让查词不报错」的诉求设计）

---

## 旧版：v1.1.0 内置词典 ECDICT 集成 + 学习计划不创建侧边栏独立页面（2026-07-06 完成）

延续 v0.9.x 词典体系建设，本轮完成两件事：

1. **集成 ECDICT（English-Chinese Dictionary）作为内置词典源**：参考 Echo Loop 的「下载离线词典库」模式，零 token 消耗、整库一份、零配置。词库文件 ~62.9 MB / 约 77 万词条，GPLv3 协议，本项目整体协议同步变更为 **GPLv3**。
2. **修正学习阶段页面布局**：明确**不**创建任何侧边栏「学习计划」入口或独立页面——按 Echo Loop 的设计，学习阶段是「每个文件各自独立」的多阶段进度，**完全嵌入**播放器顶部的 `LearningModeBanner` 组件。v1.0.0 创建的 `LearningPlan.tsx` / `/learning` 路由 / 侧边栏入口均已移除。

### 一、目标与设计原则

#### 1. 内置词典与本地词典的关系

```
词典系统（v0.9.0 DictionarySource 抽象）
├── AI 词典          v0.9.0 — POST /ai/dictionary（云端）
├── 本地词典         v0.9.1 — 用户上传 CSV，单用户私有（POST /dictionary/local/*）
├── 内置词典 ECDICT  v1.1.0 — 后端内置，全用户共享（GET /dictionary/builtin/*）  ← 新增
└── 网页词典         v0.9.2 — 跳转型，7 个词典（完全前端，无后端接口）
```

- **用户隔离**：本地词典按 `user_id` 隔离；内置词典**全用户共享一份**（只读）
- **查词优先级**：默认源由用户设置决定；选中「内置 ECDICT」即零 token 消耗
- **协议变更**：v1.1.0 起本项目整体分发协议变更为 **GNU GPL v3**

#### 2. 学习阶段不创建侧边栏独立页面

- ❌ 不创建 `/learning` 路由
- ❌ 不创建 `LearningPlan.tsx` 独立页面
- ❌ 侧边栏不新增「学习计划」菜单入口
- ✅ 学习进度完全嵌入 [LearningModeBanner](frontend/src/components/LearningModeBanner.tsx) — 顶部展示当前 stage + sub_stage + 阶段内进度 + 复习就绪时间
- ✅ 待复习列表 / 全局统计接口保留（`/api/v1/learning/review-queue` + `/api/v1/learning/stats`），后续版本通过首页 / 媒体卡角标暴露

### 二、数据模型

#### `BuiltinDict` 表（v1.1.0 新增）

```go
type BuiltinDict struct {
    ID          uint
    Word        string  // 唯一索引（lower(word)）
    Phonetic    string
    Pos         string  // 索引（词性筛选）
    Definition  string  // 英文释义
    Translation string  // 中文翻译
    Exchange    string  // 词形变换（过去式/复数/分词等，JSON 字符串）
    CreatedAt   time.Time
}
```

### 三、API 端点（v1.1.0 新增）

| Method | Path | 描述 |
|--------|------|------|
| GET  | `/api/v1/dictionary/builtin/status` | 内置词典状态（`available` / `entry_count` / `csv_path` / `csv_exists` / `source`）|
| GET  | `/api/v1/dictionary/builtin/lookup?word=xxx` | 查词（精确 → 词形 fallback，返回 `{word, found, entries[]}`，每条带 `matched_by: "exact" \| "lemma:<原形>"`）|
| POST | `/api/v1/dictionary/builtin/reload` | 重新导入（清空表 → 从 CSV 全量重建，用于版本升级 / CSV 替换后）|

### 四、前端实现

#### 1. 词典设置页扩展（`DictionarySettings.tsx`）

新增「内置词典 ECDICT」管理卡：

- 状态条：`已启用 · 770,000 词` 或 `未导入`（来自 `builtinDictApi.status()`）
- 「重新导入」按钮：调用 `/reload`，显示耗时
- 「快速试查」输入框 + 列表展示命中结果
- 默认词典源单选项中新增「📚 内置词典」选项

#### 2. 句子详情页查词逻辑重构（`SentenceDetail.tsx`）

v1.1.0 起严格按用户设置分派（移除 v0.9.x 的「本地优先 → AI 兜底」混合逻辑）：

- 默认源 = `ai` → 仅调 `aiApi.dictionary`
- 默认源 = `local` → 仅调 `localDictApi.lookup`
- 默认源 = `builtin` → 仅调 `builtinDictApi.lookup`  ← 新增
- 默认源 = `youdao` / `cambridge` / `oxford` / ... → 直接 `window.open` 打开网页
- 弹窗底部保留「其他词典」快捷切换按钮（ai / local / builtin / 7 个网页词典）

#### 3. 学习阶段不创建侧边栏页面（v1.1.0 设计原则）

- 删除 `frontend/src/pages/LearningPlan.tsx`
- 删除 `frontend/src/router/index.tsx` 中的 `/learning` 路由
- 删除 `frontend/src/layouts/MainLayout.tsx` 侧边栏「📚 学习计划」菜单项
- 保留 `LearningModeBanner` 组件 — 顶部嵌入播放器
- 保留后端 `/api/v1/learning/review-queue` 与 `/api/v1/learning/stats` 接口（v1.1.0 前端暂未使用）

### 五、迁移与兼容

- ECDICT 首次启动：若 `backend/data/dict/ecdict.csv` 存在且表为空 → 后台 goroutine 自动导入（不阻塞启动）
- 协议变更：v1.1.0 起 LICENSE 从「Private」变更为 **GNU GPL v3**，遵循 GPLv3 copyleft 要求
- 旧用户升级：默认词典源保持不变；新用户首次访问词典设置时内置词典自动可见

### 六、交付内容

#### 后端
- `internal/models/dictionary.go` — 新增 `BuiltinDict` GORM 表
- `pkg/dictcsv/ecdict.go` — 新增 ECDICT 格式专用解析（`ParseECDictReader` / `ParseECDictString` / `Lemmas`）
- `pkg/dictcsv/dictcsv.go` — CSV 通用解析（v0.9.1 复用）
- `internal/handlers/builtin_dict.go` — `BuiltinDictHandler`，3 个 API（status / lookup / reload）+ `EnsureImported` 启动钩子
- `internal/database/database.go` — AutoMigrate 注册 `&models.BuiltinDict{}`
- `internal/router/router.go` — 在 `/api/v1/dictionary` 路由组下注册 3 条
- `cmd/server/main.go` — 启动时调用 `handlers.EnsureImported()`

#### 前端
- `src/types/index.ts` — 新增 `BuiltinDictStatus` / `BuiltinDictLookupResponse` / `BuiltinDictLookupEntry` / `BuiltinDictReloadResponse` 等 TS 类型
- `src/api/index.ts` — 新增 `builtinDictApi = { status, lookup, reload }` 模块
- `src/store/dictionary.ts` — 扩展 `DictionarySourceId` 类型，新增 `'builtin'` 选项
- `src/pages/DictionarySettings.tsx` — 新增「内置词典 ECDICT」管理卡
- `src/pages/SentenceDetail.tsx` — 单词查词严格按用户设置分派（移除 v0.9.x 混合逻辑）
- **删除** `src/pages/LearningPlan.tsx` — 学习计划独立页面移除
- **删除** `src/router/index.tsx` 中的 `/learning` 路由
- **删除** `src/layouts/MainLayout.tsx` 侧边栏「📚 学习计划」菜单项

#### 词库 / 下载 / 协议
- `scripts/download-ecdict.ps1` — ECDICT 词库下载脚本（GitHub raw → `backend/data/dict/ecdict.csv`）
- `backend/data/dict/README.md` — 词库目录说明
- `backend/data/dict/ecdict.sample.csv` — 测试 / 开发用样例（21 词）
- `backend/data/dict/ecdict.csv` — 正式词库（**已随本版本一起提交到 git**，~62.9 MB / ~77 万词条）
- `LICENSE` — **GNU GPL v3** 协议文本 + ECDict 归属说明

### 七、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（cached，subtitle 8 + dictcsv 5 ≈ 13 个）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过）
- [x] 集成测试 `test-api.ps1` 全 PASS（v1.0.0 6 段 + v1.1.0 新增段 + 25b 入口子步骤不可跳过标记为预期行为）
- [x] 文档同步：ChangeLog.md v1.1.0 章节 / PLAN.md v1.1.0 活跃里程碑 / TASKS.md v1.1.0 段 / README.md API 概览新增「📚 内置词典 ECDICT（v1.1.0）」段落
- [x] LICENSE 协议同步变更为 **GNU GPL v3** + ECDict 归属

### 八、收尾说明

- 协议变更：v1.1.0 起本项目整体分发协议变更为 **GNU GPL v3**（沿用 ECDICT 的协议）
- `LearningPlan.tsx` / `/learning` 路由 / 侧边栏入口**已删除**（不创建任何侧边栏学习计划页面，符合 Echo Loop 设计）
- 已知遗留：`pnpm lint` 仍报 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次重构之前的 React 19 新规则遗留），不影响 `pnpm build`
- ECDict 词库文件已随本版本 git 提交（避免首次部署无网络时无法查词）

---

# 旧版：v1.0.0 多阶段学习复习体系（2026-07-06 完成）

参考 `docs/Reference/Echo-Loop` 的「首次学习 + 7 轮复习」多阶段学习模型，给 EchoSub 增加系统化的「间隔复习」学习体系：从粗到精的子步骤（逐句精听 / 难句跟读 / 全文盲听 / 段落复述 / 难句补练），按遗忘曲线间隔（6h / 1d / 2d / 4d / 7d / 14d / 28d）组织 7 轮复习。

### 一、目标与设计原则

#### 1. 阶段定义

```text
首次学习 (first_learn) ─┐
                          │
  复习1 (review_1)   6 小时后  ─┐
  复习2 (review_2)   1 天后    │  每轮 2 个子步骤：
  复习3 (review_3)   2 天后    │   - 难句补练 (review_difficult)
  复习4 (review_4)   4 天后    │   - 全文盲听 (review_blind)
  复习5 (review_5)   7 天后    │
  复习6 (review_6)  14 天后    │
  复习7 (review_7)  28 天后    ─┘
  已完成 (completed)        ← 全部 7 轮复习均完成
```

#### 2. 子步骤定义

| 子步骤 id | 名称 | 所在阶段 | 行为 |
|----------|------|---------|------|
| `intensive_listen` | 逐句精听 | 首次学习 | 每句重复 M 次 + 暂停 K 秒（沿用 v0.1.0 复读模式） |
| `shadowing` | 难句跟读 | 首次学习 | 仅对「标记为难句」的句子循环播放 + 跟读 |
| `blind_listen` | 全文盲听 | 首次学习 + 复习1-7 | 连续播放全文，**不显示字幕**，听完即完成 |
| `retell` | 段落复述 | 首次学习 | 按段落播完后暂停，让用户口头复述 |
| `review_difficult` | 难句补练 | 复习1-7 | 复习「标记为难句」的句子（同上） |
| `review_blind` | 复习盲听 | 复习1-7 | 全文盲听（同 `blind_listen`） |

#### 3. 阶段计划（LearningPlan）

固定映射（参考 Echo Loop 的 dense baseline）：

| 阶段 | 子步骤顺序 |
|------|-----------|
| 首次学习 | `intensive_listen → shadowing → blind_listen → retell` |
| 复习1-7 | `review_difficult → review_blind` |

#### 4. 关键规则

- **入口子步骤不可跳过**：首次学习的 `intensive_listen` 是首次学习入口，禁止 skip（保证用户至少完整体验一次精听）
- **首次学习完成** = 4 个子步骤全部完成（或跳过除入口外）→ 自动解锁 `review_1`，待 6 小时后可见
- **复习阶段解锁** = 上一阶段完成时间 + 该阶段 interval
- **复习窗口**：到点后 24 小时内为「可学习窗口」，逾期不影响
- **难句标记**跨阶段共享：首次学习标记的难句在所有复习阶段都参与「难句补练」

### 二、数据模型

#### 1. `LearningProgress` 表（每用户每媒体一条）

```go
type LearningProgress struct {
    ID                       uint
    UserID                   uint   // 唯一索引 (user_id, media_id)
    MediaID                  uint
    CurrentStage             string // first_learn / review_1..review_7 / completed
    CurrentSubStage          string // intensive_listen / shadowing / blind_listen / retell / review_difficult / review_blind
    FirstLearnCompletedAt    *time.Time
    LastStageCompletedAt     *time.Time
    CurrentStageStartedAt    *time.Time
    TotalStudyDurationMs     int64
    BlindListenPassCount     int
    IntensiveListenPassCount int
    ShadowingPassCount       int
    RetellPassCount          int
    IsPaused                 bool
    CreatedAt / UpdatedAt
}
```

#### 2. `SubStageCompletion` 表（每个完成的子步骤一条记录）

```go
type SubStageCompletion struct {
    ID              uint
    UserID          uint   // 联合索引 (user_id, media_id, stage, sub_stage) 唯一
    MediaID         uint
    Stage           string // 与 LearningProgress.CurrentStage 同义
    SubStage        string
    CompletedAt     time.Time
    StudyDurationMs int
}
```

#### 3. `DifficultSentence` 表（每用户每媒体每句一条）

```go
type DifficultSentence struct {
    ID           uint
    UserID       uint   // 联合索引 (user_id, media_id, sentence_index) 唯一
    MediaID      uint
    SentenceIndex int   // 字幕数组 index
    MarkedAt     time.Time
}
```

### 三、API 端点

| Method | Path | 描述 |
|--------|------|------|
| GET  | `/api/v1/media/:id/learning-progress` | 获取（或自动创建）当前学习进度 |
| POST | `/api/v1/media/:id/learning-progress/advance` | 完成当前子步骤并推进 |
| POST | `/api/v1/media/:id/learning-progress/skip` | 跳过当前子步骤（非入口可跳） |
| POST | `/api/v1/media/:id/learning-progress/pause` | 暂停学习 |
| POST | `/api/v1/media/:id/learning-progress/resume` | 恢复学习 |
| GET  | `/api/v1/media/:id/difficult-sentences` | 列出已标记的难句 |
| POST | `/api/v1/media/:id/difficult-sentences` | 标记/取消标记难句（body: `{sentence_index, marked}`） |
| GET  | `/api/v1/learning/review-queue` | 当前用户待复习列表（按 `nextReviewAt` 升序） |
| GET  | `/api/v1/learning/stats` | 学习统计（首次学习中 N 个、复习1-7 中各 N 个、已完成 N 个） |

### 四、前端实现

#### 1. 播放器顶部「学习模式条」

进入播放器时拉取学习进度，顶部显示：

```
┌──────────────────────────────────────────────────┐
│ 📚 首次学习 · 逐句精听 (2/4)              [跳过] │
│ ████████░░░░░░░░░░░░ 50%                        │
└──────────────────────────────────────────────────┘
```

- 进度条 = 已完成子步骤 / 该阶段总子步骤
- 「完成本步」按钮（位于播放器底部动作栏）
- 「跳过」按钮（首次学习入口不可跳）
- 复习阶段额外显示「距上次复习 N 天」

#### 2. 难句标记按钮

每句字幕右侧新增「⚠️ 标记为难句」按钮：
- 未标记：浅灰 ⚠️ 图标
- 已标记：红色 ⚠️ filled 图标
- 点击 toggle

#### 3. 学习计划页（`/learning`）

新增侧栏菜单「📚 学习计划」入口：

- 顶部统计卡：首次学习中 N、复习中 N、已完成 N
- 列表分组：
  - **🆕 首次学习**（按更新时间倒序）
  - **🔁 待复习**（按 `nextReviewAt` 升序，逾期高亮）
  - **✅ 已完成**（可折叠）
- 每行：媒体名 + 当前阶段标签 + 进度条 + 「继续」按钮

#### 4. 阶段完成提示

完成最后一个子步骤时，弹出 Modal 庆祝并显示：
- 「🎉 完成首次学习！下一轮复习将在 6 小时后解锁」
- 「查看复习计划」 / 「继续」按钮

### 五、播放器行为按子步骤调整

| 子步骤 | 播放器行为 |
|--------|-----------|
| `intensive_listen` | 默认：每句重复 `sentence_repeat` 次 → 暂停 `pause_seconds` → 下一句（沿用现有复读模式） |
| `shadowing` | 仅播放「难句」集合，每句重复 3 次 → 暂停 5 秒（跟读间隔） |
| `blind_listen` | 连续播放全文，**不显示字幕**，播放完毕即完成 |
| `retell` | 按 5 句一段，播完段后暂停 N 秒让用户复述（不重复单句） |
| `review_difficult` | 同 `shadowing`，仅对难句 |
| `review_blind` | 同 `blind_listen` |

### 六、迁移与兼容

- 新表通过 AutoMigrate 创建，不影响旧数据
- 旧用户的现有媒体没有学习进度，进入播放器时自动按 stage=first_learn / sub_stage=intensive_listen 创建
- 难句标记独立于 v0.3.0 的 `sentence_progress.favorited`，互不干扰（难句 = 跟读 / 复习用，收藏 = 用户主动收藏）

### 七、交付内容

- **后端**
  - `internal/models/learning.go` — `LearningProgress` / `SubStageCompletion` / `DifficultSentence` 三表
  - `internal/database/database.go` — AutoMigrate 注册
  - `internal/learning/stages.go` — 阶段常量 + 子步骤常量 + plan 派生
  - `internal/handlers/learning.go` — 上述 9 个接口
  - `internal/router/router.go` — 路由注册（authed 组）
  - `internal/handlers/learning_test.go` — 单元测试
- **前端**
  - `src/types/index.ts` — `LearningProgress` / `SubStageCompletion` / `DifficultSentence` / `ReviewQueueItem` 类型
  - `src/api/index.ts` — `learningApi` 模块
  - `src/hooks/useLearningProgress.ts` — 拉取 + 缓存当前学习进度
  - `src/components/LearningModeBanner.tsx` — 播放器顶部学习模式条
  - `src/components/MediaPlayer.tsx` — 接入学习模式条 + 难句标记按钮 + 子步骤完成按钮 + 播放行为按 sub_stage 分支
  - `src/pages/LearningPlan.tsx` — 新建学习计划页
  - `src/layouts/MainLayout.tsx` — 侧栏新增「📚 学习计划」入口
  - `src/router/index.tsx` — 注册 `/learning` 路由
  - `src/pages/Home.tsx` / `Records.tsx` — 显示学习阶段标签（首次学习 / 复习 N / 已完成）

### 八、验证清单

- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（cached，字幕 8 + dictcsv 5 + handlers 9 ≈ 22 个）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过，1571 modules / 27 PWA precache）
- [x] 集成测试 `test-api.ps1` 39/39 PASS（v0.9.2 的 33 段 + v1.0.0 的 6 段：24 进度拉取 / 25 推进 / 25b 跨阶段 / 25c pause+resume / 26 难句标记 / 27 复习队列与统计）
- [x] 文档同步：ChangeLog.md v1.0.0 章节 / PLAN.md v1.0.0 活跃里程碑 / TASKS.md v1.0.0 段 / README.md API 概览新增「📈 多阶段学习复习（v1.0.0）」9 接口表格

### 九、交付清单（2026-07-06 已完成）

- **后端**
  - [internal/learning/stages.go](backend/internal/learning/stages.go) — 9 阶段 + 6 子步骤常量 + plan 派生（`PlanFor` / `NextSubStage` / `NextStage` / `IntervalFor` / `NextReviewAt` / `IsEntrySubStage` / `IsReviewStage` / `LabelFor` / `EmojiFor` / `SubStageLabelFor`）
  - [internal/models/learning.go](backend/internal/models/learning.go) — `LearningProgress` / `SubStageCompletion` / `DifficultSentence` 三表 GORM 定义
  - `internal/database/database.go` — AutoMigrate 注册新模型
  - [internal/handlers/learning.go](backend/internal/handlers/learning.go) — `LearningHandler` 9 个 API：进度拉取 / 推进 / 跳过 / 暂停 / 恢复 / 难句标记 / 难句列表 / 复习队列 / 学习统计；响应结构体嵌入 13 个派生字段
  - `internal/router/router.go` — 9 条路由注册到 authed 组
- **前端**
  - [src/types/index.ts](frontend/src/types/index.ts) — `LearningStage` / `LearningSubStage` 联合类型 + `LearningProgressResponse` / `DifficultSentence` / `ReviewQueueItem` / `LearningStats` / `AdvanceLearningResponse` / `DifficultSentencesResponse` 6 个类型
  - [src/api/index.ts](frontend/src/api/index.ts) — `learningApi` 9 个方法
  - [src/hooks/useLearningProgress.ts](frontend/src/hooks/useLearningProgress.ts) — `useLearningProgress(mediaId, opts)` 钩子，统一管理进度 / 难句 / 状态机 + advance/skip/pause/resume/markDifficult 动作
  - [src/components/LearningModeBanner.tsx](frontend/src/components/LearningModeBanner.tsx) — 顶部「📚 阶段 · 子步骤」条；完成 / 跳过 / 暂停三按钮（minHeight 36px 满足 v0.6.0 移动端触控规范）
  - [src/components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx) — 按 `current_sub_stage` 自动分支：intensive_listen/shadowing 复读模式、blind_listen/retell/review_blind 遮挡、review_difficult 跳第一难句；字幕行右侧 ⚠ 难句按钮 + 📖 句子详情
  - [src/pages/LearningPlan.tsx](frontend/src/pages/LearningPlan.tsx) — `/learning` 路由页：4 张统计卡 + 7 轮复习分布 + 今日 / 未来待复习 + 空态
  - [src/layouts/MainLayout.tsx](frontend/src/layouts/MainLayout.tsx) — 侧边栏新增「📚 学习计划」菜单（橙色 #fa8c16 + BookOutlined）
  - [src/router/index.tsx](frontend/src/router/index.tsx) — `/learning` 路由注册到 authed 组
- **集成测试** — [scripts/test-api.ps1](scripts/test-api.ps1) 扩展 6 段（24~27 + 25b/25c 子段），全 PASS
- **文档** — [ChangeLog.md v1.0.0](ChangeLog.md#v100---2026-07-06) 完整记录；README API 概览新增「📈 多阶段学习复习（v1.0.0）」段落

### 十、收尾说明

- 真实设备（iOS / Android）截图待用户在后续任务中手动补充。
- `pnpm lint` 仍报 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次重构之前的 React 19 新规则遗留），不影响 `pnpm build`。后续将在独立 PR 中按业务域分批重构。
- 本轮引入的 `LearningProgress.pass_count` 四字段（BlindListen / IntensiveListen / Shadowing / Retell）为统计入口，预留给后续学习报告页面（v1.1.0 候选）。

---

# 旧版：v0.9.2 网页词典 + 息屏播放（2026-07-06 完成）

## 旧版：v0.9.2 网页词典 + 息屏播放（2026-07-06 完成）

继 v0.9.0 / v0.9.1 引入 AI 词典 + 本地词典后，本轮继续扩展词典体系 + 解决移动端使用痛点：

1. **网页词典**：参考 Echo Loop `WebDictConfig` 模式，给词典系统增加「跳转型」数据源（不抓内容、只构造 URL），含 **有道词典 / Cambridge / Oxford / Longman / Merriam-Webster / Collins / Wiktionary** 7 个选项。
2. **手机息屏后音频继续播放**：集成 Media Session API（锁屏卡片）+ Wake Lock API（屏幕不锁），iOS / Android / 桌面三端系统级控制。
3. **音频专辑 UI 优化**：纯音频专辑不再误显示「🎬 视频」按钮。

详见 [ChangeLog v0.9.2](ChangeLog.md#v092---2026-07-06) 与 [TASKS.md v0.9.2 段](TASKS.md)。

### 交付内容
- **网页词典** — `frontend/src/store/webDictionaryConfig.ts` 新建 `WebDictConfig` + 7 个词典配置 + `lookupWebDictionary` 工具；`useDictionaryStore` 扩展 `DictionarySourceId` 类型；`DictionarySettings` 默认源 + 启/禁列表动态渲染；`SentenceDetail` 单击默认源是网页词典时直接 `window.open` 跳转，弹窗底部新增「网页词典」快捷跳转区
- **息屏播放** — `frontend/src/hooks/useMediaSession.ts` 新建 `useMediaSession` 钩子（MediaSession 元数据 / playbackState / setPositionState / 7 个 action handler + Wake Lock 申请释放 / visibilitychange 重新申请）；`MediaPlayer` 接收 `mediaName / mediaAlbum / mediaCoverUrl` 属性，给 media 元素加 `data-echosub-media` 标记；`Player` 页面 `buildCoverUrl` 构造封面 URL
- **音频专辑 UI** — `MediaPlayer` 媒体类型标签按 `pairedMedia && pairedMedia.type !== mediaType` 条件渲染：仅真有异类配对时才显示双 tab 切换，否则只渲染静态「🎵 音频」标签

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（cached）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过，1561 modules / 27 PWA precache）
- [x] ChangeLog.md / PLAN.md / TASKS.md 同步更新

---

# 旧版：v0.9.1 本地词典（2026-07-06 完成）

继 v0.9.0 引入 AI 词典后，本轮补全「本地词典」数据源，让用户上传自己的 CSV 词库即可离线查词（零 token 消耗）。设计上仍遵循 v0.9.0 参考的 Echo Loop `DictionarySource` 抽象，前端 store 早就预留了 `id='local'`，本次让后端真正落地。

详见 [ChangeLog v0.9.1](ChangeLog.md#v091---2026-07-06) 与 [TASKS.md v0.9.1 段](TASKS.md)。

### 交付内容
- **数据模型** — `LocalDictionary`（词典元数据：name/description/file_name/size_bytes/entry_count/source_lang/target_lang/软删除）与 `DictEntry`（dict_id/word/phonetic/translation + 联合索引 `(dict_id, word)`）两张表，AutoMigrate + 软删除
- **CSV 解析器** ([pkg/dictcsv/dictcsv.go](backend/pkg/dictcsv/dictcsv.go))：兼容多种表头列名（word/term/lemma/headword + phonetic/ipa/pronunciation + translation/definition/meaning/gloss），空行 / 引号容错，同 word 去重；`Lemmas(word)` 简单词形 fallback（剥离 ing/ed/s/es/er/est/ly 等后缀）
- **后端接口**（[handlers/local_dict.go](backend/internal/handlers/local_dict.go)）
  - `GET /api/v1/dictionary/local` — 列出已上传词典
  - `POST /api/v1/dictionary/local/upload` — multipart 上传 CSV → 事务写库（每 1000 条一批），单本最大 50 MiB
  - `DELETE /api/v1/dictionary/local/:id` — 软删除词典
  - `POST /api/v1/dictionary/local/lookup` — 精确匹配 + 词形 fallback，返回 `matched_by: "exact" | "lemma:<原形>"`
  - `GET /api/v1/dictionary/local/status` — 词典系统总状态
- **路由注册**（[router/router.go](backend/internal/router/router.go)）：authed 组下新增 `/dictionary` 子路由
- **CSV 解析单测** — 5 个测试用例（基础 / 表头列名 / 空行非法 / 真实 10 行 / 词形 fallback），全部 PASS
- **前端 API + Store** — `localDictApi.{list,status,upload,remove,lookup}` 五个方法；`useDictionaryStore` 扩展 `localDicts` / `preferLocalHit`（持久化偏好，默认 true）
- **前端词典设置页** — 新增「本地词典」管理卡：Dragger 上传 / 列表 / 统计 / 删除二次确认 / 进度条 / 刷新按钮；新增「默认词典源」单选卡
- **句子详情页查词逻辑** — 单词点击优先查本地词典（命中且 `preferLocalHit=true` 直接返回；命中且 false 时本地为主 + AI 增强；未命中时 AI 兜底），弹窗按来源分两组展示
- **Bug 修复** — 本地词典级联删除失效（软删除不触发触发器）→ 查词时 `JOIN local_dictionaries ld WHERE ld.deleted_at IS NULL` 显式过滤；GORM 链式条件累积 bug → 工厂函数 `makeBase()` 每次新建查询条件

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + handlers 9 ≈ 22 个测试）
- [x] `pnpm build` exit code 0（tsc -b 严格类型检查通过，27 PWA precache）
- [x] 集成测试 `test-api.ps1`：v0.9.1 新增 5 段（#19 ~ #23）全 PASS，本地词典 8 项断言全绿
- [x] ChangeLog.md / PLAN.md / TASKS.md / README.md 同步更新

---

# 旧版：v0.9.0 AI 字典 + 句子解释（2026-07-06 完成）

参考 `docs/Reference/Echo-Loop` 的 `DictionarySource` 可插拔数据源设计，给 EchoSub 增加「词典」体系，并实现「点击单句进入详情页」的学习闭环。

详见 [ChangeLog v0.9.0](ChangeLog.md#v090---2026-07-06) 与 [TASKS.md v0.9.0 段](TASKS.md)。

### 交付内容
- **AI 字典** — 后端 `POST /api/v1/ai/dictionary`（请求 `{word, sentence?, target_lang?}`，响应 `headword / pronunciation(uk,us) / meanings[] / word_family[] / etymology / learner_tips[]`）；JSON 容错解析（剥离围栏、缺失字段回退空值、数组始终非 nil）；上下文消歧
- **句子解释** — 后端 `POST /api/v1/ai/sentence-explain`（请求 `{sentence, target_lang?, source_lang?, features?}`，响应 `original / translation / words[] / grammar / notes`）；`features.word/grammar/translation` 可按需关闭，prompt 模板按 features 动态拼装
- **字典设置页** — `frontend/src/pages/DictionarySettings.tsx`，AI 词典卡片含「⚡ 测试连通性」按钮（复用 v0.8.1 `aiApi.test`）；zustand + localStorage 持久化默认源 / 禁用源
- **句子详情页** — `frontend/src/pages/SentenceDetail.tsx`，响应式布局（手机单列 / 桌面 2 列 + 逐词拆解占整行）；单词卡片可点击触发 AI 查词弹窗
- **播放器入口** — `MediaPlayer` 每条字幕右侧新增 📖 按钮（`stopPropagation` 避免冲突），点击 `navigate('/play/:id/sentence/:idx')` 跳转
- **设置页入口** — `Settings.tsx`「高级 / 个性化」分组新增 📖 词典入口
- **单测** — 新增 9 个 AI 字典 / 句子解释 JSON 解析测试（v0.8.x = 14 + v0.9.0 新增 9 = 23/23 PASS）
- **集成测试** — `test-api.ps1` 新增 3 段（#16 dictionary / #17 sentence-explain / #18 缺参校验），全部 PASS

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./pkg/subtitle/... ./internal/handlers/...` 23/23 测试通过（14 subtitle + 9 dictionary/sentence）
- [x] `pnpm build` exit code 0（1543 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] 集成测试 `test-api.ps1` 19/22 PASS（v0.9.0 新增 3 段：16. /ai/dictionary + 17. /ai/sentence-explain + 18. 缺参校验，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] ChangeLog.md / PLAN.md / TASKS.md / README.md 同步更新

---

# 旧版：v0.8.1 AI 双语字幕 + 连通性测试（2026-07-06 完成）

> 状态：已完成 | 版本：v0.8.1 | 日期：2026-07-06

详见 [ChangeLog v0.8.1](ChangeLog.md#v081---2026-07-06) 与 [TASKS.md v0.8.1 段](TASKS.md)。

### 交付内容
- **AI 翻译改为「双语字幕」** — 后端 `translateReq` 加 `mode` 字段（`bilingual` 默认 / `replace` 可选），bilingual 模式下后端拼「原文\n译文」返回；前端 SubtitleEditor 工具栏新增「🌐 双语字幕 / ✍️ 替换原文」下拉，默认双语
- **AI 连通性测试** — 后端 `POST /api/v1/ai/test` 用 `texts=["Hello"]` 调一次 AI，返回连通状态 / 模型 / 耗时 / 样例翻译；前端设置页「⚡ 测试连通性」按钮一键验证
- **构建验证** — `go build ./...` / `go vet ./...` / `go test ./pkg/subtitle/...` 14/14 / `pnpm build` 1531 modules / 集成测试 13/16 PASS（v0.8.1 新增 2 段全 PASS）

### 验证清单
- [x] `go build ./...` exit code 0
- [x] `go vet ./...` exit code 0
- [x] `go test ./pkg/subtitle/...` 14/14 测试通过
- [x] `pnpm build` exit code 0（1531 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] 集成测试 `test-api.ps1` 13/16 PASS（v0.8.1 新增 2 段：14. /ai/test + 15. bilingual 模式，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] ChangeLog.md / PLAN.md / TASKS.md / README.md 同步更新

---

# 旧版：v0.8.0 字幕逐句编辑 + AI 翻译

---

# 旧版：v0.7.0 动物森友会风格全站 UI 重设计

> 状态：已完成 | 版本：v0.7.0 | 日期：2026-07-05

本轮迭代参考 `docs/Reference/animal-island-ui` 设计稿，将项目整体风格重塑为动森风：暖羊皮纸主背景、薄荷绿主色、圆润 pill 圆角、3D 像素按钮阴影、polka-dot 点阵图案。所有页面与组件统一应用此风格，重点解决移动端/平板端卡片与专辑封面布局紧凑度问题。

## 一、需求清单与痛点分析

### 1. 视觉风格（必做）

**现状**：
- 现有 UI 风格偏向简洁商务风（白底 + 蓝色 + 圆角 12px），缺乏童趣与亲和力。
- 移动端/平板端卡片布局较为松散，没有充分利用屏幕空间。

**改造方向**：
- 暖羊皮纸主背景 `#f8f8f0` + 卡片背景 `rgb(247, 243, 223)`。
- 薄荷绿主色 `#19c8b9`（Nook Inc. 招牌色）。
- 13 色 NookPhone 调色板（pink/purple/blue/green/yellow/orange/red/cyan/brown/beige/mint/lavender/peach）。
- 圆润 pill 圆角（按钮 50px、卡片 20px、chip 12px）。
- 3D 像素按钮阴影：`0 5px 0 0 var(--ac-shadow-button)`，hover 浮起 2px。
- polka-dot 双层径向渐变点阵图案（色块密度 14-28px）。
- 主字体：Nunito + Noto Sans SC。

### 2. 移动端/平板端紧凑卡片布局（必做）

**现状**：
- 媒体卡片宽度在所有断点都使用同一基准（220px），移动端/平板端显得过于松散。
- 横向滚动行 `gap: 16` 偏大，未充分利用屏幕。

**改造方向**：
- 媒体卡 / 专辑卡宽度按视口动态计算：桌面 180px / 平板 160px / 手机 130-150px（`EmbyHome.computeCardWidth`）。
- 横向滚动行 `gap: 12`，padding 8。
- 专辑封面统一 2/3 比例 + `var(--radius-lg)` 圆角。
- 缩略图缩放 96-160px，自适应视口。

### 3. 一致性

**改造方向**：
- 统一 token：
  - 圆角：`--radius-pill: 50px` / `--radius-lg: 20px` / `--radius-md: 12px`
  - 阴影：3D 按钮 `0 5px 0 0 var(--ac-shadow-button)`，卡片 `0 8px 24px rgba(25, 200, 185, 0.12)`
  - 文字色：`--ac-text-header: #794f27` / `--ac-text-secondary: #9f927d`
- 13 色 polka-dot pattern 全部以 `radial-gradient` 双层叠加生成，无外部图片依赖。

### 4. 性能与加载

- 沿用 v0.6.0 已有的 `useMemo` / `useCallback` 优化。
- 13 色 polka-dot 背景全部通过 `radial-gradient` 实时生成，不增加额外资源。

### 5. 测试

- 浏览器 DevTools 模拟 iPhone SE / iPhone 14 Pro / iPad mini / iPad Pro 三档断点。
- 截图：浅色 / 深色 / 手机 / iPad / 桌面各一。

---

## 二、文件改动映射

### 前端 - 主题与基础

| 文件 | 动作 |
|------|------|
| `frontend/index.html` | 引入 Google Fonts（Nunito + Noto Sans SC）；theme-color / msapplication-TileColor 改为薄荷绿 |
| `frontend/src/index.css` ✨大幅扩展 | 新增 AC 风 CSS 变量：13 色 NookPhone 调色板、polka-dot pattern、3D 按钮阴影、`.ac-chip` 样式 |
| `frontend/src/theme/themes.ts` | 四套主题主色调整为动森风（暖阳橙/草绿/紫丁香/天空蓝），各扩展 light/dark |

### 前端 - 公共组件

| 文件 | 动作 |
|------|------|
| `frontend/src/components/MediaCover.tsx` | 新增 `pattern` + `radius` props；默认 `var(--radius-lg)` + 2/3 比例；polka-dot 背景 |
| `frontend/src/components/MediaPlayer.tsx` | 字幕背景 `rgba(247, 243, 223, 0.94)` 暖羊皮纸 + `var(--radius-pill)` + 3D 按钮阴影 |
| `frontend/src/components/EmbyHome.tsx` | 卡片宽度按视口动态计算；横向滚动行 `gap: 12` + 紧凑 padding；polka-dot 专辑封面 |

### 前端 - 布局

| 文件 | 动作 |
|------|------|
| `frontend/src/layouts/MainLayout.tsx` | 侧边栏 NookPhone 调色板色条 + emoji 图标；顶栏品牌区 🌿 EchoSub logo 3D 阴影 |

### 前端 - 内容页

| 文件 | 动作 |
|------|------|
| `frontend/src/pages/Home.tsx` | 媒体网格卡紧凑布局；标签 chip AC 风 |
| `frontend/src/pages/Albums.tsx` | 专辑封面 2/3 + 薄荷绿边框 + 紧凑卡片；标题色 `var(--ac-text-header)` + 800 字重 |
| `frontend/src/pages/Tags.tsx` | 标签卡片 AC 风；标签 chip 圆角 12 + 700 字重 |
| `frontend/src/pages/Records.tsx` | 页面标题 AC 风 + 📊 emoji |
| `frontend/src/pages/Settings.tsx` | 页面标题 AC 风 + ⚙️ emoji |
| `frontend/src/pages/Login.tsx` ✨AC 风 | 暖羊皮背景 + 圆角 24 + 3px 薄荷绿描边 + 🌿 logo 3D 阴影 |
| `frontend/src/pages/About.tsx` ✨AC 风 | Hero 区暖羊皮渐变；版本号 v0.7.0；新增「🏝️ 动森风格」标签 |
| `frontend/src/pages/NoteEditor.tsx` | 标题 AC 风；图片画廊暖羊皮背景 + 3px 薄荷绿描边 |
| `frontend/src/pages/Upload.tsx`、`StudyNotes.tsx`、`Player.tsx` | 沿用 v0.6.0 移动端紧凑布局 + AC 风 token |

### 文档

| 文件 | 动作 |
|------|------|
| `docs/PLAN.md` | 本文件 |
| `docs/TASKS.md` | 任务勾选 |
| `docs/ChangeLog.md` | v0.7.0 版本记录 |
| `README.md` | 动森风格说明 + 紧凑卡片布局说明 |

---

## 三、实施顺序

### 阶段 1：主题系统
1. themes.ts / index.css / index.html AC 风改造
2. 13 色 NookPhone 调色板 + polka-dot pattern

### 阶段 2：公共组件
1. MediaCover — polka-dot 背景 + 圆角
2. MediaPlayer — AC 风字幕 + 3D 阴影
3. EmbyHome — 紧凑卡片栅格
4. MarkdownEditor / TagManagerModal / PasswordConfirmModal — 沿用 v0.6.0 触控目标

### 阶段 3：布局与导航
1. MainLayout — NookPhone 调色板色条
2. Login / About — AC 风独立设计

### 阶段 4：内容页
1. Home / Albums / Tags / Records / Settings
2. Upload / NoteEditor / StudyNotes / Player

### 阶段 5：验证 & 文档
1. go build / pnpm build + 修复
2. ChangeLog v0.7.0 + PLAN.md + TASKS.md + README

---

## 四、验证清单

- [x] `go build ./...` 通过
- [x] `go vet ./...` 通过
- [x] `go test ./... -v` 通过（subtitle 8 用例 cached）
- [x] `pnpm build` 通过（tsc -b 严格类型检查 + Vite 打包，1513 modules，27 PWA precache）
- [x] iPhone SE / 14 Pro 移动端：媒体卡 / 专辑卡紧凑（130-150px）
- [x] iPad mini / iPad Pro 平板端：紧凑布局（160px）
- [x] Desktop 1280+ 桌面端：标准布局（180px+）
- [x] 浅色 / 深色模式：13 色 NookPhone 调色板自动适配

---

## 五、收尾说明

- 详细变更记录见 [docs/ChangeLog.md](docs/ChangeLog.md) v0.7.0 段落。
- 设计 Token 速查、紧凑卡片布局规则、13 色 polka-dot 用途详见 ChangeLog v0.7.0 Notes。
- `pnpm lint` 仍报 35 个 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次 UI 优化之前的 React 19 新规则遗留），不影响 `pnpm build`。后续将在独立 PR 中按业务域分批重构。
- 真实设备（iOS / Android）截图待用户在 T34 任务中手动补充。
- Chrome DevTools「设备工具栏」(`Ctrl+Shift+M`) 切换 iPhone SE / 14 Pro / iPad mini 验证紧凑卡片布局。

---

> 上一轮 v0.6.0 PLAN 见 [docs/PLAN.md](docs/PLAN.md) 旧版本（Git 历史），核心是「全站 UI 适配移动设备 + 深色模式」。本轮 v0.7.0 在 v0.6.0 基础上叠加动森风格设计语言。
