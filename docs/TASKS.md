# TASKS.md — v1.3.5 网页词典 3 个源修复（2026-07-07）

配套 [PLAN.md](PLAN.md) / [CONFIGURATION.md](CONFIGURATION.md)。每完成一个任务勾选并填时间。

## v1.3.5 网页词典 3 个源修复（2026-07-07）

### 后端 — 修复

- [x] **T1** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources["youdao"].SkipProxy: true → false`（让用户代理生效）
- [x] **T2** [backend/internal/config/config.go](backend/internal/config/config.go) `WebDictConfig.SkipProxyHosts` 默认值移除 `youdao.com`
- [x] **T3** `microsoft.BuildURL` 中 `from=auto → from=en` + `fetchMicrosoftTranslate` 中 `apiURL from=auto → from=en`（Edge API 不支持 auto）
- [x] **T4** `handleHTMLScrape` 新增 Oxford 404 剥 s 重试逻辑 + `isHTTPNotFound` 辅助函数（处理 `eggs → egg`）

### 验证

- [x] **T5** `go build ./...` / `go vet ./...` / `go test ./...` / `pnpm build` 全绿；ChangeLog v1.3.5 章节 + PLAN v1.3.5 活跃里程碑同步完成



## v1.3.4 网页词典最终精简为 5 源 + 微软翻译（2026-07-07）

### 后端 — 移除 / 新增

- [x] **T1** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` 移除 `collins` / `baidu` / `google` 三个 source（Collins 长期反爬；百度翻译换端点后仍风控；谷歌翻译即便 ForceProxy 也 i/o timeout）
- [x] **T2** 同步移除 `collinsURL` / `baiduURL` / `googleURL` 构造函数 + `fetchBaiduTranslate` / `fetchGoogleTranslate` 函数
- [x] **T3** 新增 `fetchMicrosoftTranslate` + `fetchMicrosoftAuthToken`：Edge 翻译 API 两步式（先拿 8 分钟有效 JWT token，再调 `api-edge.cognitive.microsofttranslator.com/translate`）
- [x] **T4** 新增 `microsoft` source：`Kind: kindTranslate`、`ForceProxy: true`、`FetchTranslate: fetchMicrosoftTranslate`
- [x] **T5** 新增 token 缓存：8 分钟 TTL + 401 自动失效 + sync.RWMutex 保护

### 前端 — 同步

- [x] **T6** [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) `kWebDictConfigs` 移除 `collins` / `baidu` / `google`，新增 `microsoft`（🪟 微软蓝 #0078D4）
- [x] **T7** [frontend/src/types/index.ts](frontend/src/types/index.ts) `DictionarySourceId` 联合类型同步精简（移除 5 个 + 加 1 个）；同步 [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) `sourceLabel`；同步 [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 注释；同步 [frontend/src/store/wordFavorites.ts](frontend/src/store/wordFavorites.ts) 注释；同步 [frontend/src/api/index.ts](frontend/src/api/index.ts) 注释

### 验证

- [x] **T8** `go build ./...` / `go vet ./...` / `go test ./...` / `pnpm build` 全绿；ChangeLog v1.3.4 章节 + PLAN v1.3.4 活跃里程碑同步完成



## v1.3.3 网页词典精简源 + 修复百度/谷歌（2026-07-07）

### 后端 — 移除 / 修复

- [x] **T1** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` 移除 `cambridge` / `merriamWebster` 两个 source（长期 403，留着误导用户）
- [x] **T2** 移除 `cambridgeURL` / `merriamWebsterURL` 构造函数（同步清理）
- [x] **T3** `webDictSource` 结构体新增 `ForceProxy bool` 字段——与现有 `SkipProxy` 互斥：用于「源级强制走代理，忽略 cfg.WebDict.SkipProxyHosts」
- [x] **T4** `makeProxyForSource` 决策逻辑升级：
  - `SkipProxy=true` → 返回 nil（直连）
  - `ForceProxy=true`（新增）→ 只读 `cfg.WebDict.CustomProxy`，忽略 `SkipProxyHosts` / `OnlyProxyHosts`
  - 默认 → 合并 `cfg.WebDict.SkipProxyHosts` / `OnlyProxyHosts`
- [x] **T5** `google` 源标记 `ForceProxy: true`——修复 `translate.googleapis.com` 命中默认 `googleapis.com` 黑名单后直连 `i/o timeout` 的 bug
- [x] **T6** `fetchBaiduTranslate` 换端点：`fanyi.baidu.com/sug`（2024 年起返回 errno=1000）→ `dict.baidu.com/suggest?wd={word}&json=1&type=0`（百度词典公开 suggest，与百度翻译同源数据）
- [x] **T7** 百度翻译响应解析升级：v1.3.2 只取 `v` 字段 → v1.3.3 额外取 `p`（音标）和 `c`（多重释义数组）拼装 HTML

### 前端

- [x] **T8** [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) `kWebDictConfigs` 移除 `cambridge` / `merriamWebster` 两条（与后端一致）
- [x] **T9** 注释更新为 v1.3.3：源数量 9 → 7；翻译型源说明（baidu 换端点 / google 强制走代理）

### 验证

- [x] **T10** `go build ./...` exit 0
- [x] **T11** `go vet ./...` exit 0
- [x] **T12** `go test ./...` 全部 PASS（handlers / learning / utils / dictcsv / subtitle 全部 ok）
- [x] **T13** `pnpm build` exit 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过）

### 文档

- [x] **T14** [docs/ChangeLog.md](docs/ChangeLog.md) 新增 v1.3.3 章节（Removed / Fixed / Changed / Known 遗留 4 段）
- [x] **T15** [docs/PLAN.md](docs/PLAN.md) 活跃里程碑切到 v1.3.3
- [x] **T16** [docs/TASKS.md](docs/TASKS.md) 当前文件（T1~T16 全部勾选）

### 收尾

- **代理配置强烈建议**：谷歌翻译依赖 `ECHOSUB_WEBDICT_PROXY`；国内用户必须配，否则 i/o timeout
- **7 个网页词典最终顺序**：有道 → 百度翻译 → 谷歌翻译 → Oxford → Longman → Collins → Wiktionary

---

# TASKS.md — v1.3.2 网页词典按域名分流 + 翻译型源（百度/谷歌）+ 词义持久化

配套 [PLAN.md](PLAN.md) / [CONFIGURATION.md](CONFIGURATION.md)。每完成一个任务勾选并填时间。

## v1.3.2 网页词典按域名分流 + 翻译型源 + 词义持久化（2026-07-07）

### 后端 — 按域名分流代理

- [x] **T1** [backend/internal/config/config.go](backend/internal/config/config.go) `WebDictConfig` 新增 `SkipProxyHosts` / `OnlyProxyHosts` 字段 + `Default()` 8 个中文域名默认 + 2 个新环境变量 `ECHOSUB_WEBDICT_SKIP_PROXY` / `ECHOSUB_WEBDICT_ONLY_PROXY`
- [x] **T2** [backend/internal/utils/http_client.go](backend/internal/utils/http_client.go) `ProxyConfig` 新增 `SkipProxyHosts` / `OnlyProxyHosts` + `shouldProxy` / `hostMatchesAny` 决策函数（host 大小写不敏感，支持 parent domain 匹配）
- [x] **T3** 启动日志在配置了代理 + 有 SkipProxyHosts 时额外打印「跳过 N 个域名」便于排查

### 后端 — 翻译型源（baidu / google）

- [x] **T4** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` 重构为结构化注册表 `map[string]webDictSource` + 每源 `UserAgent` / `Referer` / `AcceptLanguage` / `SkipProxy`
- [x] **T5** Merriam-Webster 改用 **Mobile Safari** UA（移动版可抓，desktop 经常 403）；Cambridge / Oxford / Longman / Collins 模拟从 Google 搜索点过来（带 `Referer`）
- [x] **T6** `fetchBaiduTranslate` 实现：`GET https://fanyi.baidu.com/sug?wd={word}`，取第一条 `v` 字段
- [x] **T7** `fetchGoogleTranslate` 实现：`GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q={word}`，解嵌套数组取 `raw[0][0][0]`
- [x] **T8** `handleTranslate` / `handleHTMLScrape` 双路径，统一 gin.H 响应（新增 `kind / translation / source_lang / target_lang / phonetic` 字段）

### 后端 — 词义快照

- [x] **T9** [backend/internal/models/models.go](backend/internal/models/models.go) `WordFavorite.QueryResult string \`gorm:"type:text"\`` 字段
- [x] **T10** [backend/internal/handlers/word_favorite.go](backend/internal/handlers/word_favorite.go) `createWordFavoriteReq.QueryResult map[string]interface{}` + JSON 序列化 + 256KB 上限
- [x] **T11** `LookupWebDict` 三级缓存策略（进程内缓存 → 收藏快照 → 实际抓取）+ `loadWordFavoriteCache` 公开（命中返回 cached map + favorite_id 等元数据）
- [x] **T12** 收藏快照命中时响应 payload 包含 `favorite: true / favorite_id / favorite_source / cached: true` 字段

### 前端 — 源切换 + 翻译型渲染

- [x] **T13** [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) **重写**：移除 `buildUrl`（不再 window.open）+ 新增 `kind: 'html' | 'translate'` + 新增 `baidu` / `google`（🐾 百度蓝 / 🌍 谷歌蓝）
- [x] **T14** [frontend/src/types/index.ts](frontend/src/types/index.ts) `DictionarySourceId` 加 `baidu` / `google`；`WebDictLookupResponse` 加 11 个新字段（kind/translation/source_lang/target_lang/phonetic/cached/favorite/favorite_id/favorite_source/favorite_note/favorite_only）；`WordFavorite` 加 `query_result?`
- [x] **T15** [frontend/src/api/index.ts](frontend/src/api/index.ts) `wordFavoriteApi.create` payload 接受 `query_result?: Record<string, unknown>`
- [x] **T16** [frontend/src/store/wordFavorites.ts](frontend/src/store/wordFavorites.ts) `favorite(word, source?, note?, queryResult?)` 第 4 个参数
- [x] **T17** [frontend/src/store/dictionary.ts](frontend/src/store/dictionary.ts) `DictionarySourceId` 改为 `@/types` re-export

### 前端 — 弹窗渲染

- [x] **T18** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 收藏时把当前 `webData` 整个作为 `query_result` 传给后端；toast「已收藏「xxx」（已保存词义快照，下次离线秒开）」
- [x] **T19** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 弹窗渲染新增「翻译型源」分支（`kind === 'translate' && translation` 时单纯展示翻译 + 源/目标语言徽标 + 音标）；命中收藏快照时顶部显示金黄色 `⭐ 已收藏词义（离线快照）` 徽标 + `内存缓存` 灰色徽标
- [x] **T20** [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) 打开单词查词弹窗时优先用 `wordFavorite.query_result` 解析为 `WebDictLookupResponse` 渲染，零网络请求

### 验证

- [x] **T21** `go build ./...` exit code 0
- [x] **T22** `go vet ./...` exit code 0
- [x] **T23** `go test ./...` 全部 PASS（config 3 + handlers 8 + learning 10 + utils 7 + dictcsv 16 + subtitle 8 = 52 用例）
- [x] **T24** `pnpm build` exit code 0（1571 modules / 27 PWA precache / tsc -b 严格类型检查通过）
- [x] **T25** 修复编译错误：`backend/internal/handlers/web_dict.go` 失败结果缓存 key 由 `source+"|"+word` 修正为 `src.ID+"|"+word`

### 文档

- [x] **T26** [docs/ChangeLog.md](docs/ChangeLog.md) 新增 v1.3.2 章节
- [x] **T27** [docs/PLAN.md](docs/PLAN.md) 活跃里程碑切换到 v1.3.2
- [x] **T28** [docs/TASKS.md](docs/TASKS.md) 当前文件（T1~T28 全部勾选）
- [x] **T29** [docs/CONFIGURATION.md](docs/CONFIGURATION.md) 新增「按域名分流代理」「翻译型源」「词义快照」三节
- [x] **T30** [README.md](README.md) API 概览补充 `query_result` 字段说明 + 词典源数量（9 个）

---

## 旧版：v1.3.1 网页词典 / AI 代理配置 + 部署文档化（2026-07-07）

## v1.3.1 网页词典 / AI 代理配置 + 部署文档化（2026-07-07）

### 后端 — 统一 HTTP 客户端工厂

- [x] **T1** [backend/internal/utils/http_client.go](backend/internal/utils/http_client.go) **新建** `NewHTTPClient` + `ProxyConfig`
  - 自定义 `*http.Transport.Proxy` 字段（默认零值 transport 不读 `HTTPS_PROXY`，是历史常见坑）
  - 代理优先级：自定义 `CustomProxy` > `http.ProxyFromEnvironment` > 直连
  - URL 解析失败 → 自动降级到环境变量（降级保护）
  - 协议支持：`http://` / `https://` / `socks5://`
  - 连接池：`MaxIdleConns=100 / MaxIdleConnsPerHost=10 / IdleConnTimeout=90s`
  - 独立超时：拨号 10s / TLS 握手 10s / Expect-Continue 1s / 总超时 = 配置
  - 跟随 5 次重定向
  - `socks5://` 需要 Go 1.20+，本项目 go1.26.4 完全支持

### 后端 — AI 翻译走代理

- [x] **T2** [backend/internal/handlers/ai.go](backend/internal/handlers/ai.go) `callOpenAI` 改用 `utils.NewHTTPClient`
  - 替换原先 `http.Client{Timeout: ...}`（零值 transport 不读 `HTTPS_PROXY`）
  - 注入 `cfg.AI.Proxy`（来自 `ECHOSUB_AI_PROXY`）
  - OpenAI / DeepSeek / 通义千问 在国内也能稳定访问

### 后端 — 网页词典抓取重构

- [x] **T3** [backend/internal/handlers/global.go](backend/internal/handlers/global.go) 新增 `SetGlobalConfig` / `GetGlobalConfig`
  - router 启动时 `handlers.SetGlobalConfig(cfg)` 注入
  - 让 `LookupWebDict` 这种 `gin.HandlerFunc` 工厂无需依赖参数注入也能拿到 `*config.Config`
- [x] **T4** [backend/internal/handlers/global.go](backend/internal/handlers/global.go) 新增 gzip / deflate / brotli 解压工具
  - 依赖 `github.com/andybalholm/brotli v1.2.2`
  - 用于处理网页词典返回的 `Content-Encoding`
- [x] **T5** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 抓取改用 `utils.NewHTTPClient`
  - 注入 `cfg.WebDict.Proxy`（来自 `ECHOSUB_WEBDICT_PROXY`）
  - 默认超时 6s → 15s（按 `cfg.WebDict.TimeoutSec`）
- [x] **T6** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 失败重试 + 内存缓存
  - 失败自动重试 1 次（仅 timeout / EOF / connection reset / no such host / i/o timeout / net.OpError）
  - 4xx/5xx / 业务错误 不重试
  - 指数退避：第 2 次重试前 sleep 500ms
  - 成功按 `CacheMinutes`（默认 60）缓存
  - 失败结果单独缓存 5 分钟避免重复触发
  - 内存上限 512 条（LRU 简化版：超容清半）
- [x] **T7** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 浏览器风格请求头补全
  - 新增 `Sec-Fetch-Dest / Sec-Fetch-Mode / Sec-Fetch-Site / Sec-Fetch-User / Upgrade-Insecure-Requests`
  - 减少被反爬识别的概率
- [x] **T8** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 失败错误文案更友好
  - 附带「部分词典对抓取有限制，可点击下方「在新窗口打开」手动查看」提示

### 后端 — 配置扩展

- [x] **T9** [backend/internal/config/config.go](backend/internal/config/config.go) 新增 `WebDictConfig`
  - 字段：`TimeoutSec / MaxBytes / Retries / CacheMinutes / Proxy`
  - 默认值：`15 / 1MiB / 1 / 60 / ""`
- [x] **T10** [backend/internal/config/config.go](backend/internal/config/config.go) `AIConfig.Proxy` 字段
  - 用途：OpenAI / Anthropic 等海外 API 在国内访问常需代理
- [x] **T11** [backend/internal/config/config.go](backend/internal/config/config.go) 5 个环境变量加载
  - `ECHOSUB_AI_PROXY` / `ECHOSUB_WEBDICT_TIMEOUT` / `ECHOSUB_WEBDICT_RETRIES` / `ECHOSUB_WEBDICT_CACHE_MINUTES` / `ECHOSUB_WEBDICT_PROXY`
- [x] **T12** [backend/internal/config/config.go](backend/internal/config/config.go) 启动日志
  - 打印代理与超时配置，便于排查
  - `[INFO] AI 翻译已启用：... / ...`
  - `[INFO]   AI 代理：...`
  - `[INFO] 网页词典抓取：超时 15s, 重试 1 次, 缓存 60 分钟（未配置代理）`

### 后端 — 依赖

- [x] **T13** [backend/go.mod](backend/go.mod) / [backend/go.sum](backend/go.sum) 新增 `github.com/andybalholm/brotli v1.2.2`
  - 用于 br 解压
  - 间接依赖自动加入

### 文档 — CONFIGURATION.md

- [x] **T14** [docs/CONFIGURATION.md](docs/CONFIGURATION.md) **新建** 后端配置 & 部署指南
  - 12 章节：配置总览 / 基础配置 / AI 翻译 / 网页词典 / 代理系统设计 / 内置词典 / Docker / K8s / systemd / 验证 / 故障排查 / 变更历史
  - Docker 4 个常见场景示例（海外 / 国内+Clash / 国内+远程代理 / 国内 AI）
  - 配置验证清单（启动日志 / API 健康 / AI 连通 / 网页词典抓取）
  - 故障排查清单（timeout / 403 / 代理不生效 / JWT 默认 secret / 数据库锁）
  - 关联文档引用 [README.md](../README.md) · [ChangeLog.md](ChangeLog.md) · [PLAN.md](PLAN.md) · [TASKS.md](TASKS.md) · [CLAUDE.md](../CLAUDE.md)

### 验证

- [x] **T15** `go build ./...` exit code 0
- [x] **T16** `go vet ./...` exit code 0
- [x] **T17** `go test ./...` 全部 PASS（cached）
- [x] **T18** `pnpm build` exit code 0
- [x] **T19** 文档同步：ChangeLog.md v1.3.1 章节 / PLAN.md v1.3.1 活跃里程碑 / TASKS.md v1.3.1 段 / README.md v1.3.1 行为说明 / CONFIGURATION.md 已创建

### 收尾

- 已知遗留：有道 / 朗文 等对爬虫严格的站点即便配置代理也可能拿到 403 / 简版页面；前端查词弹窗已做「blocked=true + 在新窗口打开」兜底
- 已知遗留：`WebDictCache` 是进程内内存缓存（重启后清空），不做持久化；如需跨进程共享可升级到 Redis（暂未实现）
- 已知遗留：内存缓存条目上限 512 条（LRU 简化版：超容清半），极端查词场景下需要重启进程

---

# TASKS.md — v1.3.0 网页词典弹窗化 + 单词收藏体系 + 收藏页（句子/单词）

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v1.3.0 网页词典弹窗化 + 单词收藏体系 + 收藏页（句子/单词）（2026-07-06）

### 后端 — 网页词典抓取

- [x] **T1** [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 新建 `LookupWebDict` handler
  - 路由 `GET /api/v1/dictionary/web/lookup?source=youdao&word=hello`
  - 用 `net/http` 6s 超时 + 1MiB 响应上限 + 模拟 Chrome UA
  - 用 `golang.org/x/net/html` AST 遍历 + `microcosm-cc/bluemonday` 白名单清洗
  - 去噪：删除 `<script> / <style> / <noscript> / <iframe> / <svg> / <header> / <nav> / <footer> / <aside> / <form>` 及 class/id 命中关键词的元素
  - 链接重写：相对链接 → 绝对链接；`<a>` 强制 `target=_blank rel=noopener noreferrer`
  - 失败兜底：响应 `blocked=true` + `error` 字段，弹窗提示「在新窗口打开」

### 后端 — 单词收藏

- [x] **T2** [backend/internal/models/models.go](backend/internal/models/models.go) 新增 `WordFavorite` 模型
  - 字段：`id / user_id / word / source / note / hit_count / created_at / updated_at`
  - 联合唯一索引 `(user_id, word)`，同用户同单词只一条
  - `TableName()` 显式指定 `word_favorites`
- [x] **T3** [backend/internal/database/database.go](backend/internal/database/database.go) `AutoMigrate` 注册 `&models.WordFavorite{}`
- [x] **T4** [backend/internal/handlers/word_favorite.go](backend/internal/handlers/word_favorite.go) 新建 5 个 handler
  - `CreateWordFavorite` — `POST /word-favorites`，幂等（重复收藏 `hit_count++`）
  - `ListWordFavorites` — `GET /word-favorites?q=&page=&size=`，默认 `size=50` 上限 200
  - `CheckWordFavorites` — `GET /word-favorites/check?words=hello,world`，返回 `{favorited: {word: id}}`
  - `UpdateWordFavoriteNote` — `PATCH /word-favorites/:id`，只更新笔记
  - `DeleteWordFavorite` — `DELETE /word-favorites/:id`
- [x] **T5** [backend/internal/router/router.go](backend/internal/router/router.go) 注册
  - `dict.GET("/web/lookup", handlers.LookupWebDict())`
  - `authed.POST/GET/PATCH/DELETE /word-favorites/...`

### 前端 — 类型与 API

- [x] **T6** [frontend/src/types/index.ts](frontend/src/types/index.ts) 新增 3 个 TS 类型
  - `WebDictLookupResponse { source, source_name, word, url, final_url, html, blocked, error }`
  - `WordFavorite { id, word, source, note, hit_count, created_at, updated_at }`
  - `WordFavoriteListResponse { items, total, page, size }`
- [x] **T7** [frontend/src/api/index.ts](frontend/src/api/index.ts) 新增 2 个 API 模块
  - `webDictApi.lookup(source, word)`
  - `wordFavoriteApi.{list, create, updateNote, remove, check}`

### 前端 — 收藏 store

- [x] **T8** [frontend/src/store/wordFavorites.ts](frontend/src/store/wordFavorites.ts) **新建** Zustand store
  - `items: WordFavorite[]` 最多 200 条
  - `refresh` 拉取列表
  - `addFavorite` / `removeFavorite` 乐观更新
  - `favorite` / `unfavorite` 异步 API，失败回滚
  - `findByWord(word)` O(1) 查找
  - persist 持久化到 localStorage，version=1

### 前端 — 句子详情页弹窗化

- [x] **T9** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 网页词典改弹窗渲染
  - `WordLookupState` 新增 `webData / webSource` 字段（替代旧 `webUrl`）
  - `handleWordClick` 中 `isWebDictionary(defaultSourceId)` 走 `webDictApi.lookup` 而非 `window.open`
  - 弹窗底部「网页词典」按钮组改为「切换源」按钮（高亮当前源）
  - 弹窗内 `handleSwitchWebSource(source)` 重新 fetch
- [x] **T10** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 弹窗标题栏 ⭐ 收藏
  - 未收藏：`<StarOutlined />`，已收藏：`<StarFilled />` 黄色
  - `handleToggleFavorite` 调用 `useWordFavoritesStore.favorite / unfavorite`
  - 收藏成功 `message.success` 提示
- [x] **T11** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 「在收藏页查看此单词」按钮
  - 跳 `/favorites?word=xxx&tab=words`
  - 收藏页读取 URL 自动打开查词弹窗

### 前端 — 收藏页

- [x] **T12** [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) **新建** 收藏页
  - 顶部 `Segmented` 二选一 tab：📜 句子 / 🔤 单词
  - tab 同步到 URL `?tab=words`
- [x] **T13** [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) 句子 tab
  - 拉最近 50 个媒体的 `SentenceProgress` → 过滤 `favorited=true`
  - 关联字幕拿到完整句子文本
  - 按 `updated_at DESC` 排序
  - 单卡片显示：⭐ + 媒体名 + 句号 + 朗读按钮 + 跳转链接
- [x] **T14** [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) 单词 tab
  - `useWordFavoritesStore` 拉全列表
  - 模糊搜索（不区分大小写）
  - 单条笔记编辑弹窗（`Modal` + `Input.TextArea`）
  - 删除（带 Popconfirm 确认）
  - 单卡片显示：⭐ + 单词 + 笔记预览 + 朗读 + 查词 + 笔记 + 删除
- [x] **T15** [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) 查词弹窗（v1.3.0）
  - 标题栏：📖 + 单词
  - 内置 ECDICT 命中优先展示
  - 7 个网页词典切换按钮组（高亮当前源）
  - 渲染清洗后的 HTML（`dangerouslySetInnerHTML`）
  - 失败 / blocked 提示 + 「在新窗口打开」链接
  - 响应式：手机端 `width=95vw` / 桌面端 760px
- [x] **T16** [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx) URL `?word=xxx` 自动打开查词弹窗
  - 句子详情页跳来时携带 word 参数
  - 监听 `searchParams` 变化同步 `highlightWord`
  - 打开后清除 URL 参数（避免重复打开）

### 前端 — 路由 + 侧边栏

- [x] **T17** [frontend/src/router/index.tsx](frontend/src/router/index.tsx) 新增 `/favorites` 路由 → `<Favorites />`
- [x] **T18** [frontend/src/layouts/MainLayout.tsx](frontend/src/layouts/MainLayout.tsx) 侧边栏新增「⭐ 收藏」菜单入口
  - 位置：介于「标签」和「上传」之间
  - icon `<StarFilled />`，color `#faad14`

### 验证

- [x] **T19** `go build ./...` exit code 0
- [x] **T20** `go vet ./...` exit code 0
- [x] **T21** `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + 字典解析 8 ≈ 21+ 个，cached）
- [x] **T22** `pnpm build` exit code 0（tsc -b 严格类型检查通过，1571 modules transformed）
- [x] **T23** PWA precache 27 entries（1773.83 KiB）
- [x] **T24** 文档同步：ChangeLog.md v1.3.0 章节 / PLAN.md v1.3.0 活跃里程碑 / TASKS.md v1.3.0 段 / README.md v1.3.0 段落

### 收尾

- 已知遗留：部分词典（Cambridge / Oxford）有反爬机制，后端 fetch 拿不到时弹窗需手动跳新窗口
- 已知遗留：Favorites 句子 tab 当前是「最近 50 个媒体」N+1 拉取，初期足够；后续可加后端 `GET /word-favorites/sentences` 聚合接口优化
- 已知遗留：未提供「导出 Anki 牌组」功能（按需后续版本）

---

# TASKS.md — v1.2.0 Echo Loop 复读模式 + 句子原文按词查词 + 词典智能回退 + 移除学习计划

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v1.2.0 Echo Loop 复读模式 + 句子原文按词查词 + 词典智能回退 + 移除学习计划（2026-07-06）

### 前端 — Echo Loop 复读模式

- [x] **T1** [frontend/src/components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx) 新增 Echo Loop 状态条
  - 模式为「复读」时显示：🔁 + 文本「Echo Loop 复读中」+ 三枚标签（每句 ×N 遍 / 句末停 K 秒 / 整体循环 M 次）+ 实时播放进度「第 i/N 句 · 重复 r/N」
  - 模式为「普通」时显示：▶ + 文本「普通播放」
  - 无字幕时显示「无字幕，复读模式不可用」warning tag

### 前端 — 句子详情页原文按词查词

- [x] **T2** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 新增 `splitSentenceTokens(text)` 工具
  - 单词识别：`/[A-Za-z][A-Za-z0-9'\-]*/g`，覆盖 `don't` / `well-known` 等混合形式
  - 标点 / 空格作为 `sep` token 保留原句版式
  - 纯前端正则，不调用任何后端 / AI
- [x] **T3** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) 原文卡片单词 span
  - 每个 word token 渲染为带 hover 高亮 + 虚线下划线的可点击 span
  - `onClick` 触发 `handleWordClick(tok.text)` → 复用现有词典分派逻辑
  - 支持键盘 Enter / Space 触发（`role="button" tabIndex={0}`）
  - 移动端触控目标由 lineHeight 1.8 + padding 2px 共同保证

### 前端 — 词典智能回退

- [x] **T4** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) `handleWordClick` AI 智能回退
  - 默认源 = `ai` 且 `aiStatus.enabled === false` → `kind` 改写为 `builtin`
  - `aiApi.dictionary` 失败时自动重试 `builtinDictApi.lookup`
  - 内置命中后 `message.info('AI 词典不可用，已自动切换到内置 ECDICT')` 提示用户
  - 内置也失败才暴露 AI 的原始错误
- [x] **T5** [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx) UI 提示
  - 原文卡片右下角在 `aiStatus && !aiStatus.enabled && defaultSourceId === 'ai'` 时多挂橙色 tag「AI 未启用 · 查词自动回退到内置词典」
  - 顶部 Alert 改为 info 级别，明示「整句翻译需要 AI 翻译 key，但单词查词不受影响」

### 前端 — 移除学习计划

- [x] **T6** **删除** [frontend/src/hooks/useLearningProgress.ts](frontend/src/hooks/useLearningProgress.ts) — v1.0.0 引入的多阶段学习进度 hook
- [x] **T7** **删除** [frontend/src/components/LearningModeBanner.tsx](frontend/src/components/LearningModeBanner.tsx) — 播放器顶部学习阶段横幅
- [x] **T8** [frontend/src/components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx) 移除
  - 移除所有 `useLearningProgress` / `LearningModeBanner` 引用
  - 移除难句标记 UI（句子行右侧 ⚠ 按钮 / 已标记句子高亮）
  - 移除 `current_sub_stage` 监听分支（六类自动行为）

### 脚本 — PowerShell 5.1 编码修复

- [x] **T9** [scripts/download-ecdict.ps1](scripts/download-ecdict.ps1) 中文 → 纯 ASCII
  - 全部注释 / `Write-Host` 输出 / 临时文件名说明改为英文
  - 脚本头部写明「pure-ASCII for PS 5.1 compatibility」原因
  - 修复第 49-52 行 `Write-Host "[HINT] 或使用国内镜像..."` 在 PS 5.1 GBK 代码页下抛 `字符串缺少终止符: """` 的问题

### 验证

- [x] **T10** `go build ./...` exit code 0
- [x] **T11** `go vet ./...` exit code 0
- [x] **T12** `go test ./...` 全部 PASS（cached，subtitle 8 + dictcsv 5 ≈ 13 个）
- [x] **T13** `pnpm build` exit code 0（tsc -b 严格类型检查通过）
- [x] **T14** `python scripts/test-api.py` 全 PASS（v1.1.0 45 项；v1.2.0 不新增后端接口，沿用现有数据）
- [x] **T15** ChangeLog.md v1.2.0 章节完整记录（Echo Loop 复读 / 按词查词 / 词典回退 / 移除学习计划 / download-ecdict.ps1 修复 / Fixed / Notes）
- [x] **T16** PLAN.md v1.2.0 活跃里程碑段已添加
- [x] **T17** README.md 行为说明 + v1.2.0 关键改动段落

---

# TASKS.md — v1.1.0 内置词典 ECDICT + 学习阶段不创建侧边栏独立页面

## v1.1.0 内置词典 ECDICT 集成 + 学习计划不创建侧边栏独立页面（2026-07-06）

### 后端 — 内置词典

- [x] **T1** `internal/models/dictionary.go` 新增 `BuiltinDict` GORM 表 — 字段 `Word`（唯一索引）/ `Phonetic` / `Pos`（索引）/ `Definition` / `Translation` / `Exchange`
- [x] **T2** `pkg/dictcsv/ecdict.go` 新建 — `ParseECDictReader(io.Reader) (*ECDictResult, error)` 流式解析 ECDICT 格式；`ParseECDictString(string)` 字符串解析（测试用）；`Lemmas(word string) []string` 词形还原（studies → study）
- [x] **T3** `pkg/dictcsv/dictcsv.go` 复用 — 用户上传的本地词典 CSV 通用解析（v0.9.1 复用）
- [x] **T4** `internal/database/database.go` AutoMigrate 注册 `&models.BuiltinDict{}`
- [x] **T5** `internal/handlers/builtin_dict.go` 新建 `BuiltinDictHandler`
  - `EnsureImported()` — 启动时后台 goroutine 自动导入（CSV 不存在 / 表已存在则跳过）
  - `ImportBuiltinDict(csvPath) (int, error)` — 全量导入（清空 + 批量插入 2000/批，事务）
  - `Status(c)` — 返回 `{available, entry_count, csv_path, csv_exists, source}`
  - `Lookup(c)` — 查词（精确匹配 → 词形 fallback）；返回 `{word, found, entries[]}`，每条带 `matched_by: "exact" | "lemma:<原形>"`
  - `Reload(c)` — 重新导入（清空后从 CSV 重建）
  - 路径解析顺序：环境变量 `ECHOSUB_BUILTIN_DICT_CSV` → `backend/data/dict/ecdict.csv` → `data/dict/ecdict.csv` → `<exe>/data/dict/ecdict.csv`
- [x] **T6** `internal/router/router.go` 在 `/api/v1/dictionary` 路由组下注册 3 条
  - `GET /api/v1/dictionary/builtin/status`
  - `GET /api/v1/dictionary/builtin/lookup?word=xxx`
  - `POST /api/v1/dictionary/builtin/reload`
- [x] **T7** `cmd/server/main.go` 启动时调用 `handlers.EnsureImported()`

### 后端 — 测试

- [x] **T8** `pkg/dictcsv/dictcsv_test.go`（v0.9.1 复用 5 个用例）— 基础解析 / 表头列名 / 空行与非法 / 真实 10 行 / 词形 fallback 全部 PASS

### 前端 — 内置词典

- [x] **T9** `src/types/index.ts` 新增 4 个 TS 类型 — `BuiltinDictStatus` / `BuiltinDictLookupResponse` / `BuiltinDictLookupEntry` / `BuiltinDictReloadResponse`
- [x] **T10** `src/api/index.ts` 新增 `builtinDictApi = { status, lookup, reload }` 模块
- [x] **T11** `src/store/dictionary.ts` 扩展 `DictionarySourceId` 类型，新增 `'builtin'` 选项
- [x] **T12** `src/pages/DictionarySettings.tsx` 新增「内置词典 ECDICT」管理卡
  - 状态条：`已启用 · 770,000 词` 或 `未导入`（来自 `builtinDictApi.status()`）
  - 「重新导入」按钮：调用 `/reload`，显示耗时
  - 「快速试查」输入框 + 列表展示命中结果
  - 默认词典源单选项中新增「📚 内置词典」选项

### 前端 — 查词逻辑重构

- [x] **T13** `src/pages/SentenceDetail.tsx` 单词查词严格按用户设置分派（v1.1.0 重构）
  - 移除 v0.9.x 的「本地优先 → AI 兜底」混合逻辑
  - 默认源 = `ai` → 仅调 `aiApi.dictionary`
  - 默认源 = `local` → 仅调 `localDictApi.lookup`
  - 默认源 = `builtin` → 仅调 `builtinDictApi.lookup`
  - 默认源 = `youdao` / `cambridge` / `oxford` / ... → 直接 `window.open` 打开网页
  - 弹窗底部保留「其他词典」快捷切换按钮（ai / local / builtin / 7 个网页词典）

### 前端 — 学习计划页面移除

- [x] **T14** **删除** `src/pages/LearningPlan.tsx` — 学习计划独立页面移除（v1.0.0 误创建）
- [x] **T15** **删除** `src/router/index.tsx` 中的 `/learning` 路由
- [x] **T16** **删除** `src/layouts/MainLayout.tsx` 侧边栏「📚 学习计划」菜单项
- [x] **T17** 保留 `LearningModeBanner` 组件 — 顶部嵌入播放器
- [x] **T18** 保留后端 `/api/v1/learning/review-queue` + `/api/v1/learning/stats` 接口（v1.1.0 前端暂未使用）

### 词库 / 下载 / 协议

- [x] **T19** `scripts/download-ecdict.ps1` 新建 — ECDICT 词库下载脚本（GitHub raw → `backend/data/dict/ecdict.csv`）
- [x] **T20** `backend/data/dict/README.md` 新建 — 词库目录说明（数据源、协议、首次部署）
- [x] **T21** `backend/data/dict/ecdict.sample.csv` 新建 — 测试 / 开发用样例（21 词）
- [x] **T22** `backend/data/dict/ecdict.csv` 提交 — 正式词库（~62.9 MB / ~77 万词条，已随本版本 git 提交）
- [x] **T23** `LICENSE` 协议变更为 **GNU GPL v3** + ECDict 归属说明

### 集成测试

- [x] **T24** `scripts/test-api.ps1` 25b 步骤错误处理优化
  - 在 retell 阶段调用 skip，预期跨阶段到 review_1；若当前实际不是 retell 也接受（不强制预期）
  - 「入口子步骤不可跳过」标记为预期行为（Ok 而非 Bad）
- [x] **T25** `scripts/test-api.ps1` Ok/Bad 函数实现优化 — 从 `[Console]::WriteLine` 改为 `Write-Host`，确保 PowerShell 5.1 + 输出重定向时日志可见

### 验证

- [x] **T26** `go build ./...` exit code 0
- [x] **T27** `go vet ./...` exit code 0
- [x] **T28** `go test ./...` 全部 PASS（cached，subtitle 8 + dictcsv 5 ≈ 13 个）
- [x] **T29** `pnpm build` exit code 0（tsc -b 严格类型检查通过）
- [x] **T30** `.\scripts\test-api.ps1` 全 PASS（v1.0.0 6 段 + v1.1.0 25b/25c 优化 + 入口子步骤预期行为）
- [x] **T31** ChangeLog.md v1.1.0 章节完整记录（内置词典 ECDICT 集成 / 学习阶段不创建侧边栏独立页面 / Changed / Notes）
- [x] **T32** PLAN.md v1.1.0 活跃里程碑段已添加（顶部状态 + 七章 + 验证清单 + 收尾说明）
- [x] **T33** README.md API 概览新增「📚 内置词典 ECDICT（v1.1.0）」段落 + 3 个接口表格
- [x] **T34** LICENSE 协议同步变更为 **GNU GPL v3** + ECDict 归属

### 收尾

- [x] **T35** 协议变更：v1.1.0 起本项目整体分发协议变更为 **GNU GPL v3**（沿用 ECDICT 的协议）
- [x] **T36** `LearningPlan.tsx` / `/learning` 路由 / 侧边栏入口**已删除**（不创建任何侧边栏学习计划页面，符合 Echo Loop 设计）
- [x] **T37** 已知遗留：`pnpm lint` 仍报 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次重构之前的 React 19 新规则遗留），不影响 `pnpm build`

### 集成测试迁移（PowerShell → Python）

- [x] **T38** `scripts/test-api.py` 新建（710 行） — 用 Python `requests` + `subprocess` 重写端到端测试，45 项检查全 PASS
  - 解决 PowerShell 5.1 + 输出重定向 + Start-Job 组合下 `Ok/Bad` 静默丢失、`try/foreach` 嵌套解析失败等长期遗留问题
  - 启动后端 `stdout/stderr` 重定向到日志文件（避免 ECDICT 导入 ~2 万行日志撑爆 PIPE 缓冲区）
  - 启动超时 120s（首次 ECDICT 导入 ~70s）
  - 强制 stdout/stderr UTF-8（`reconfigure` + `PYTHONIOENCODING`），避免 ECDict 翻译中文触发 `UnicodeEncodeError`
  - reload 接口单独给 120s HTTP 超时
- [x] **T39** 旧 PowerShell 脚本 [scripts/test-api.ps1](scripts/test-api.ps1) **停止维护**，README/CLAUDE 标注「仅作参考」
- [x] **T40** `python scripts/test-api.py` **45/45 全 PASS**（含学习进度 advance/skip/pause/resume/难句标记/复习队列/统计 + 内置 ECDICT 状态/查词/重载）

---

# TASKS.md — v1.0.0 多阶段学习复习体系

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v1.0.0 多阶段学习复习体系（2026-07-06）

### 后端

- [x] **T1** `internal/learning/stages.go` 新建 — 定义 9 个阶段常量（`first_learn` / `review_1..review_7` / `completed`）和 6 个子步骤常量（`intensive_listen` / `shadowing` / `blind_listen` / `retell` / `review_difficult` / `review_blind`）；实现 `PlanFor` / `NextSubStage` / `NextStage` / `IntervalFor` / `NextReviewAt` / `IsEntrySubStage` / `IsReviewStage` / `LabelFor` / `EmojiFor` / `SubStageLabelFor` 核心函数；含 stage_label / stage_emoji / sub_stage_label 中文标签字典
- [x] **T2** `internal/models/learning.go` 新建 — 定义三张 GORM 表
  - `LearningProgress`（(user_id, media_id) 唯一索引）：current_stage / current_sub_stage / last_stage_completed_at / current_stage_started_at / first_learn_completed_at / total_study_duration_ms / 4 个 pass_count / is_paused / 软删除
  - `SubStageCompletion`（(user_id, media_id, stage, sub_stage) 复合唯一）：study_duration_ms + completed_at
  - `DifficultSentence`（(user_id, media_id, sentence_index) 唯一）：marked_at
- [x] **T3** `internal/database/database.go` AutoMigrate 注册上述三个模型
- [x] **T4** `internal/handlers/learning.go` 新建 `LearningHandler`，9 个 API 接口
  - `GetLearningProgress` — 首次访问自动创建
  - `AdvanceLearningProgress` — 写 SubStageCompletion + 推进 sub_stage/跨 stage + 累加 pass_count + 累加学习时长
  - `SkipLearningProgress` — 跳过非入口子步骤
  - `PauseLearningProgress` / `ResumeLearningProgress` — is_paused 切换
  - `MarkDifficultSentence` / `ListDifficultSentences` — 难句标记（`SentenceIndex` 用 `*int` 避免 binding:"required" 误拒 0）
  - `ListReviewQueue` — 全局复习队列
  - `GetLearningStats` — 全局学习统计
  - 响应结构体嵌入 `LearningProgress` 并补 13 个派生字段（stage_label / stage_emoji / sub_stage_label / stage_plan / stage_index / stage_sub_index / is_entry_sub_stage / next_review_at / interval_hours / is_review_ready / is_completed / total_sub_stages / completed_sub_stages）
- [x] **T5** `internal/router/router.go` 在 authed 路由组下注册 9 条新路由
  - `GET /api/v1/media/:id/learning-progress`
  - `POST /api/v1/media/:id/learning-progress/advance`
  - `POST /api/v1/media/:id/learning-progress/skip`
  - `POST /api/v1/media/:id/learning-progress/pause`
  - `POST /api/v1/media/:id/learning-progress/resume`
  - `GET /api/v1/media/:id/difficult-sentences`
  - `POST /api/v1/media/:id/difficult-sentences`
  - `GET /api/v1/learning/review-queue`
  - `GET /api/v1/learning/stats`

### 前端

- [x] **T6** `src/types/index.ts` 新增 7 个 TS 类型 — `LearningStage` / `LearningSubStage` 联合类型 + `LearningProgressResponse` / `DifficultSentence` / `ReviewQueueItem` / `LearningStats` / `AdvanceLearningResponse` / `DifficultSentencesResponse`
- [x] **T7** `src/api/index.ts` 新增 `learningApi = { getProgress, advance, skip, pause, resume, listDifficult, markDifficult, reviewQueue, stats }` 9 个方法
- [x] **T8** `src/hooks/useLearningProgress.ts` 新建 `useLearningProgress(mediaId, opts)` 钩子 — 统一管理 progress / difficultSentences / loading / mutating / error 状态；对外暴露 advance / skip / pause / resume / markDifficult / isDifficult / reload / clearError 方法；用 `onErrorRef` 避免依赖变化触发重载
- [x] **T9** `src/components/LearningModeBanner.tsx` 新建 — 顶部 `stage_emoji + stage_label + sub_stage_label` 标签；已暂停 / 已完成 / 阶段进度条动态显示；复习阶段显示「下次复习时间」倒数；操作按钮「完成本步 / 跳过 / 暂停·恢复」三按钮（minHeight 36px 满足 v0.6.0 移动端触控规范）
- [x] **T10** `src/components/MediaPlayer.tsx` 子步骤行为分支 — 监听 `current_sub_stage` 自动调整播放器行为
  - `intensive_listen` / `shadowing` → 复读模式
  - `blind_listen` / `retell` / `review_blind` → 遮挡模式
  - `review_difficult` → 跳到第一句难句 + 复读
  - 首次进入组件 `lastAppliedSubStageRef` 初始化为空，不覆盖用户当前设置
  - 字幕行右侧加 ⚠ 难句标记按钮；集成 `LearningModeBanner` + `useLearningProgress`
  - 学习时长估算从组件挂载时间开始
- [x] **T11** `src/pages/LearningPlan.tsx` 新建 `/learning` 路由页 — 顶部 4 张统计卡片（首次学习中 / 复习中 / 已完成 / 已暂停）；各轮复习分布横向卡片；今日待复习 + 未来待复习两段；空态「当前没有需要复习的媒体 🎉」；点击卡片跳到 `/play/:id`
- [x] **T12** `src/layouts/MainLayout.tsx` 侧边栏新增「📚 学习计划」菜单项（橙色 #fa8c16，BookOutlined 图标）
- [x] **T13** `src/router/index.tsx` 在 authed 路由组下注册 `/learning` 路径指向 `LearningPlan` 组件

### 集成测试

- [x] **T14** `scripts/test-api.ps1` 扩展 6 段测试（24-27 + 25b/25c 子段）
  - 24: GET 进度自动创建（验证 stage_plan=4、interval_hours=0、is_completed=false）
  - 25: 连续 3 次 advance 从 intensive_listen → shadowing → blind_listen → retell（completed_sub_stages 1/4→3/4）
  - 25b: 在 retell 阶段 skip 跨阶段到 review_1.review_difficult（stage_advanced=true）
  - 25c: pause/resume 切换 + 暂停时 advance 被拒绝
  - 26: 标记 / 列出 / 取消标记难句（标记 0、2 句，列出 count=2，取消 0 后 count=1）
  - 27: review-queue 1 条 + stats 统计正确
  - Ok/Bad 函数改用 `[Console]::WriteLine` 而非 `Write-Host`，避免 PowerShell 5.1 循环内丢输出
  - step 6 改为「第一个有字幕的媒体」（兼容不同 test-media 内容，不再硬编码 lesson1）

### 验证

- [x] **T15** `go build ./...` exit code 0
- [x] **T16** `go vet ./...` exit code 0
- [x] **T17** `go test ./...` 全部 PASS（cached）
- [x] **T18** `pnpm build` exit code 0（tsc -b 严格类型检查通过，1571 modules / 27 PWA precache）
- [x] **T19** `.\scripts\test-api.ps1` 39/39 通过（v0.9.2 的 33 段 + v1.0.0 的 6 段）
- [x] **T20** ChangeLog.md v1.0.0 章节完整记录（多阶段学习复习体系 / Fixed / Notes）
- [x] **T21** README.md API 概览新增「📈 多阶段学习复习（v1.0.0）」段落 + 9 个接口表格
- [x] **T22** PLAN.md v1.0.0 活跃里程碑段已添加

---

# TASKS.md — v0.9.2 网页词典 + 息屏播放

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v0.9.2 网页词典 + 息屏播放 + 音频专辑优化（2026-07-06）

### 网页词典

- [x] **T1** `src/store/webDictionaryConfig.ts` 新建 — 定义 `WebDictConfig` 接口（`id / displayName / icon / color / buildUrl / languageNote`）+ 7 个词典配置（**有道** / Cambridge / Oxford / Longman / Merriam-Webster / Collins / Wiktionary）+ `lookupWebDictionary` / `getWebDictConfig` 工具
- [x] **T2** `src/store/dictionary.ts` 扩展 `DictionarySourceId` 类型，把 7 个网页词典 id 加入；`persist.version` 从 2 升到 3
- [x] **T3** `src/types/index.ts` 扩展类型 — `DictionarySourceMeta` 新增 `color?: string` 与 `isWeb?: boolean` 字段；`DictionarySourceId` 联合类型加入 7 个网页词典 id
- [x] **T4** `src/pages/SentenceDetail.tsx` 集成 — 新增 `isWebDictionary()` / `getSourceLabel()` 辅助函数；`handleWordClick` 在默认源是网页词典时直接 `window.open` 跳转；单词弹窗底部新增「网页词典」快捷跳转区（Divider + 一排 pill 按钮）
- [x] **T5** `src/pages/DictionarySettings.tsx` 集成 — 默认源单选 + 启/禁列表动态包含 7 个网页词典项；列表项图标用 `GlobalOutlined`，显示「🌐 联网 · 网页词典」状态标签

### 息屏播放

- [x] **T6** `src/hooks/useMediaSession.ts` 新建 — 封装 `useMediaSession` 钩子
  - `supportsMediaSession()` / `supportsWakeLock()` 守卫函数
  - `useEffect` 同步 `mediaSession.metadata`（含 title / artist / album / artwork）
  - `useEffect` 同步 `mediaSession.playbackState`
  - `useEffect` 调用 `setPositionState({ duration, position, playbackRate })`
  - `useEffect` 注册 7 个 `setActionHandler`（play / pause / seekbackward / seekforward / seekto / previoustrack / nexttrack）
  - `useEffect` 播放时申请 WakeLock sentinel，暂停/卸载时 release
  - `useEffect` 监听 `visibilitychange` 切回前台时若仍在播放则重新申请 WakeLock
  - 导出 `MEDIA_ELEMENT_MARK_ATTR = 'data-echosub-media'` 常量
- [x] **T7** `src/components/MediaPlayer.tsx` 集成 — `MediaPlayerProps` 增加 `mediaName?` / `mediaAlbum?` / `mediaCoverUrl?` 三个属性；给 video / audio 元素加 `[MEDIA_ELEMENT_MARK_ATTR]: 'true'` 属性；调用 `useMediaSession({...})`
- [x] **T8** `src/pages/Player.tsx` 集成 — 新增 `buildCoverUrl(mediaId, hasCover, token)` 工具函数；MediaPlayer 调用处补齐三个新属性

### 音频专辑 UI 优化

- [x] **T9** `src/components/MediaPlayer.tsx` 媒体类型标签条件渲染 — 仅在 `pairedMedia && pairedMedia.type !== mediaType`（确实存在异类配对）时才渲染双 CheckableTag tab；否则只渲染一个静态媒体类型标签

### 验证

- [x] **T10** `go build ./...` exit code 0
- [x] **T11** `go vet ./...` exit code 0
- [x] **T12** `go test ./...` 全部 PASS（cached）
- [x] **T13** `pnpm build` exit code 0（tsc -b 严格类型检查通过，1561 modules / 27 PWA precache）
- [x] **T14** ChangeLog.md v0.9.2 章节完整记录（网页词典 / 息屏播放 / 音频专辑优化 / Changed / Notes）
- [x] **T15** PLAN.md v0.9.2 活跃里程碑段已添加
- [x] **T16** README.md 词典特性列表新增「🌐 网页词典（含 有道 / Cambridge / Oxford / Longman / Merriam-Webster / Collins / Wiktionary）」

---

# TASKS.md — v0.9.1 本地词典

## v0.9.1 本地词典（2026-07-06）

### 后端

- [x] **T1** `internal/models/dictionary.go` 新建 — 定义 `LocalDictionary`（name/description/file_name/size_bytes/entry_count/source_lang/target_lang + `gorm.DeletedAt` 软删除）与 `DictEntry`（dict_id/word/phonetic/translation + 联合索引 `(dict_id, word)` + 单列 `word` 索引）两张表
- [x] **T2** `internal/database/database.go` AutoMigrate 注册上述两个模型；开启 SQLite `PRAGMA foreign_keys=ON`；创建 `trg_dict_entries_cascade_delete` 触发器（**注意**：GORM 软删除不触发 — 见 T15）
- [x] **T3** `pkg/dictcsv/dictcsv.go` 新建 `ParseReader / ParseString / ParseFile / Lemmas` 工具集
  - 兼容表头列名：`word/term/lemma/headword` + `phonetic/ipa/pronunciation` + `translation/definition/meaning/gloss`
  - 跳过空行、`csv.LazyQuotes` 容错、空表头按位置取 word/phonetic/translation
  - 同 word 去重、返回 `Result{Entries, Skipped, TotalLines, Header}`
  - `Lemmas(word)` 剥离常见后缀（`ies/ied/ying/ed/ing/es/er/est/ly/s`）返回原形候选列表
- [x] **T4** `internal/handlers/local_dict.go` 新建 `LocalDictHandler`，5 个接口
  - `ListLocalDicts` `GET /api/v1/dictionary/local`
  - `UploadLocalDict` `POST /api/v1/dictionary/local/upload`（multipart，事务写库，每 1000 条一批，单本最大 50 MiB，扩展名 `.csv/.tsv/.txt`）
  - `DeleteLocalDict` `DELETE /api/v1/dictionary/local/:id`（软删除）
  - `LookupLocalDict` `POST /api/v1/dictionary/local/lookup`（精确 + 词形 fallback，返回 `matched_by: "exact" | "lemma:<原形>"`）
  - `LocalDictStatus` `GET /api/v1/dictionary/local/status`（dict_count/entry_count/max_bytes/max_name_len）
- [x] **T5** `internal/router/router.go` 在 authed 组下新增 `/dictionary` 子路由，挂载 `LocalDictHandler`
- [x] **T6** `pkg/dictcsv/dictcsv_test.go` 新建 5 个测试：基础解析 / 表头列名 / 空行与非法 / 真实 10 行 / 词形 fallback
- [x] **T7** `test-dicts/test-basic.csv` 集成测试夹具（10 词 / 3 列：word,phonetic,translation）

### 前端

- [x] **T8** `src/api/index.ts` 新增 `localDictApi = { list, status, upload, remove, lookup }` 五个方法
- [x] **T9** `src/types/index.ts` 新增 6 个 TS 类型 — `LocalDictionary / LocalDictStatus / LocalDictUploadResult / LocalDictLookupRequest / LocalDictLookupEntry / LocalDictLookupResponse`
- [x] **T10** `src/store/dictionary.ts` `useDictionaryStore` 扩展 `localDicts / localDictsFetchedAt / preferLocalHit` 状态 + `setLocalDicts / addLocalDict / removeLocalDict / setPreferLocalHit` 四个方法；`persist` 配置 `version: 2`，`partialize` 显式列出持久化字段（`localDicts` 不持久化，每次进设置页主动拉取）
- [x] **T11** `src/pages/DictionarySettings.tsx` 新增「本地词典」管理卡 — Dragger 上传（最大 50 MiB / .csv/.tsv/.txt）、已上传列表（带统计 / 词条数 / 来源 / 描述 / 软删除时间）、删除二次确认、上传进度条、刷新按钮；AI 词典源卡片显示「离线 · N 本 · M 词」状态；新增「默认词典源」单选卡（按 `disabledIds` 过滤后渲染）+「本地命中时是否仍调 AI」开关
- [x] **T12** `src/pages/SentenceDetail.tsx` 单词查词逻辑升级为「本地优先 → AI 兜底」：状态机 `WordLookupState{word, loadingLocal, loadingAi, localEntries[], localTried, aiEntry, aiTried, error}`；命中分支按 `preferLocalHit` 决定是否调 AI 增强；新增 `LocalDictEntryCard` 与 `WordLookupView` 组件按来源分别渲染

### 验证 & Bug 修复

- [x] **T13** `go build ./...` exit code 0
- [x] **T14** `go vet ./...` exit code 0
- [x] **T15** **Bug 修复 — 本地词典级联删除失效** — GORM `db.Delete(&LocalDictionary{}, id)` 是软删除（只设 `deleted_at`），不真正 DELETE 行，因此 `trg_dict_entries_cascade_delete` 触发器不会激活，词条仍然残留。
  - 修复：`LookupLocalDict` 改为 `JOIN local_dictionaries ld ON ld.id = dict_entries.dict_id WHERE ld.deleted_at IS NULL` 查词时显式过滤
  - 每次查询用工厂函数 `makeBase()` 复制 GORM 链式条件，避免 `for lemma := range lemmas` 循环中多次 `Where(...)` 累积成 `AND word=? AND word=? AND word=...` 永远空集的 bug
  - `Order("dict_id ASC, id ASC")` 改为 `dict_entries.dict_id ASC, dict_entries.id ASC`，消除 JOIN 后的 `id` 列歧义
- [x] **T16** `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + handlers 9 ≈ 22 个测试）
- [x] **T17** `pnpm build` exit code 0（tsc -b 严格类型检查通过，27 PWA precache）
- [x] **T18** 集成测试 `test-api.ps1`：v0.9.1 新增 5 段（#19 ~ #23）全 PASS，本地词典 8 项断言全绿（精确命中 / fallback 命中 / 不存在 / 列表 / 上传 / 状态 / 删除 / 删除后查不到）
- [x] **T19** ChangeLog.md v0.9.1 章节完整记录本地词典 / CSV 解析 / 单元测试 / 集成测试扩展 / Bug 修复
- [x] **T20** PLAN.md / TASKS.md / README.md 同步更新
- [x] **T21** README.md API 概览新增 5 行：`GET /dictionary/local` / `POST /dictionary/local/upload` / `DELETE /dictionary/local/:id` / `POST /dictionary/local/lookup` / `GET /dictionary/local/status`；特征列表新增「📕 本地词典（CSV 离线词库）」

---

# TASKS.md — v0.9.0 AI 字典 + 句子解释

## v0.9.0 AI 字典 + 句子解释（2026-07-06）

### 后端

- [x] **T1** `internal/handlers/ai.go` 新增 `Dictionary` handler（POST /api/v1/ai/dictionary）— 词典编纂者 prompt，强制 JSON 输出；请求 `{word, sentence?, target_lang?}`；响应 `headword / pronunciation(uk,us) / meanings[] / word_family[] / etymology / learner_tips[]`
- [x] **T2** `internal/handlers/ai.go` `parseDictionaryEntry` JSON 容错解析 — 剥离 ` ```json ` / ` ``` ` 围栏，缺失字段回退空值，`Meanings / WordFamily / LearnerTips` 数组始终初始化为 `[]string{}`（避免前端 `.length` 崩溃）
- [x] **T3** `internal/handlers/ai.go` 新增 `ExplainSentence` handler（POST /api/v1/ai/sentence-explain）— 教师 prompt；请求 `{sentence, target_lang?, source_lang?, features?}`；响应 `original / translation / words[] / grammar / notes`；`features.word/grammar/translation` 可按需关闭
- [x] **T4** `internal/handlers/ai.go` `parseSentenceExplain` JSON 容错解析（同样容错 + 数组非 nil 兜底）
- [x] **T5** `internal/handlers/ai.go` 共享 `callRaw` 单次裸调用（与批量 `callOpenAI` 解耦，复用同一 OpenAI 客户端）
- [x] **T6** `internal/router/router.go` 注册 `ai.POST("/dictionary", aiH.Dictionary)` + `ai.POST("/sentence-explain", aiH.ExplainSentence)` 路由
- [x] **T7** `internal/handlers/ai_test.go` 新增 9 个测试（5 dictionary + 3 sentence + 1 strVal）— 与 v0.8.x 的 14 个字幕测试一起共 23/23 PASS

### 前端

- [x] **T8** `src/store/dictionary.ts` 新建 — zustand + localStorage 持久化「默认词典源 / 禁用源」；切换默认源或禁用源时立即落盘；禁用当前默认源时回退到 `ai`
- [x] **T9** `src/types/index.ts` 新增 12 个 TS 类型 — `DictionaryRequest / DictionaryResponse / DictionaryPronunciation / DictionaryMeaning / DictionaryExample / DictionaryWordFamily` + `SentenceExplainRequest / SentenceExplainResponse / SentenceExplainFeatures / WordBreakdown / GrammarPoint`
- [x] **T10** `src/api/index.ts` `aiApi` 新增 `dictionary(payload)` + `sentenceExplain(payload)` 方法
- [x] **T11** `src/pages/DictionarySettings.tsx` 新建 — AI 词典卡片 + 本地词典占位卡片；每张卡片含「设为默认 / 启用 / 禁用 / 测试连通性」入口；AI 卡片「⚡ 测试连通性」按钮调用 `aiApi.test` 显示连通状态 / base url 主机 / 模型 / 耗时 / 样例翻译
- [x] **T12** `src/pages/SentenceDetail.tsx` 新建 — 顶部返回栏 + 媒体名 + 时间戳 + 「跳回播放器并定位到该句」按钮；AI 未启用时顶部黄色 Alert；原文卡片含朗读 / 默认词典源标签；解释区加载中 Skeleton / 失败 Alert + 重试；响应式（手机单列 / 桌面 2 列 + 逐词拆解占整行）
- [x] **T13** `src/pages/SentenceDetail.tsx` 单词查词弹窗 — 逐词拆解的每个词都是可点击按钮，触发 `aiApi.dictionary` 拉词条，Modal 弹窗渲染「音标 / 词义 / 词族 / 词源 / 学习提示」
- [x] **T14** `src/components/MediaPlayer.tsx` import `useNavigate` + `BookOutlined`；每条字幕 div 末尾增加「📖 查看句子详情」按钮，`stopPropagation` 避免冲突，`minWidth/Height: 36` 保证触摸目标
- [x] **T15** `src/pages/Settings.tsx`「高级 / 个性化」分组新增 📖 词典入口，整卡可点击跳转到 `/settings/dictionary`
- [x] **T16** `src/router/index.tsx` 注册 `/settings/dictionary` + `/play/:id/sentence/:idx` 两条路由

### 验证

- [x] **T17** `go build ./...` exit code 0
- [x] **T18** `go vet ./...` exit code 0
- [x] **T19** `go test ./pkg/subtitle/... ./internal/handlers/...` 23/23 测试通过（14 subtitle + 9 dictionary/sentence）
- [x] **T20** `pnpm build` exit code 0（1543 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] **T21** 集成测试 `test-api.ps1` 19/22 PASS（v0.9.0 新增 3 段：16. /ai/dictionary + 17. /ai/sentence-explain + 18. 缺参校验，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] **T22** ChangeLog.md v0.9.0 章节完整记录字典 / 句子解释 / 单元测试 / 集成测试扩展
- [x] **T23** PLAN.md / TASKS.md / README.md 同步更新
- [x] **T24** README.md API 概览新增 `POST /ai/dictionary` + `POST /ai/sentence-explain` 两行；特征列表新增「📖 AI 字典 + 句子解释」

---

# TASKS.md — v0.8.1 AI 双语字幕 + 连通性测试

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v0.8.1 AI 双语字幕 + 连通性测试（2026-07-06）

### 后端

- [x] **T1** `internal/handlers/ai.go` `translateReq` 新增 `mode` 字段（`replace` / `bilingual`，缺省 `bilingual`），bilingual 模式下后端拼接 `原文\n译文` 返回
- [x] **T2** `internal/handlers/ai.go` 新增 `Test` handler（POST /api/v1/ai/test）— 用 `texts=["Hello"]` 调一次 AI，返回连通状态 / 模型 / 耗时 / 样例翻译 / 错误描述
- [x] **T3** `internal/router/router.go` 注册 `ai.POST("/test", aiH.Test)` 路由
- [x] **T4** `pkg/subtitle/subtitle_test.go` v0.8.0 的 14 个测试保持全绿（双语拼接复用现有 `parseNumberedLines` + `atomicWrite`，无新增测试）

### 前端

- [x] **T5** `src/types/index.ts` `AITranslateRequest.mode?: 'replace' | 'bilingual'`，`AITranslateResponse.translations` 注释明确两种模式语义
- [x] **T6** `src/api/index.ts` `aiApi.test()` 调 `POST /ai/test`
- [x] **T7** `src/components/SubtitleEditor.tsx` 工具栏新增「🌐 双语字幕 / ✍️ 替换原文」二选一，默认 `bilingual`；模式变化反映在翻译完成提示上
- [x] **T8** `src/pages/Settings.tsx` `AICard` 标题栏新增「⚡ 测试连通性」按钮（在「刷新状态」左侧），AI 未启用时 disabled；测试结果用绿/红框展示，含状态文案、base url 主机名、模型、耗时与「Hello → 你好」样例翻译

### 验证

- [x] **T9** `go build ./...` exit code 0
- [x] **T10** `go vet ./...` exit code 0
- [x] **T11** `go test ./pkg/subtitle/...` 14/14 测试通过
- [x] **T12** `pnpm build` exit code 0（1531 modules / 27 PWA precache / tsc -b 严格类型检查）
- [x] **T13** 集成测试 `test-api.ps1` 13/16 PASS（v0.8.1 新增 2 段：14. /ai/test + 15. bilingual 模式，全部 PASS；3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）
- [x] **T14** ChangeLog.md v0.8.1 章节完整记录双语字幕与连通性测试实现
- [x] **T15** PLAN.md / TASKS.md / README.md 同步更新

---

# TASKS.md — v0.8.0 字幕逐句编辑 + AI 翻译

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## v0.8.0 字幕逐句编辑 + AI 翻译（2026-07-06）

### 后端

- [x] **T1** `internal/config/config.go` 新增 `AIConfig` 结构体 + `ECHOSUB_AI_*` 环境变量族（BASE_URL / API_KEY / MODEL / TARGET_LANG / TIMEOUT_SEC）
- [x] **T2** `pkg/subtitle/subtitle.go` 新增 `WriteFile` / `WriteSRT` / `WriteVTT` 原子写回方法 + `FormatSRTTime` / `FormatVTTTime` 时间戳格式化
- [x] **T3** `pkg/subtitle/subtitle_test.go` 新增 6 个测试（FormatSRTTime/FormatVTTTime/WriteSRT_RoundTrip/WriteVTT_RoundTrip/WriteFile_Unsupported/WriteSRT_Empty），合计 14 个测试全绿
- [x] **T4** `internal/handlers/media.go` 新增 `UpdateSubtitle` handler（PUT /api/v1/media/:id/subtitle）— 鉴权 + 校验 + 原子写回
- [x] **T5** `internal/handlers/ai.go` 新增 `AIHandler` + `Translate`（批量翻译代理 OpenAI 兼容接口）+ `Status`（脱敏配置状态查询）
- [x] **T6** `internal/router/router.go` 注册 `/ai` 路由组 + 媒体 `PUT /:id/subtitle` 路由

### 前端

- [x] **T7** `src/types/index.ts` 新增 `AITranslateRequest` / `AITranslateResponse` / `AIStatus` / `AIUsage` 类型
- [x] **T8** `src/api/index.ts` 新增 `aiApi` 模块 + `mediaApi.updateSubtitle` 方法
- [x] **T9** `src/components/SubtitleEditor.tsx` 新建 — 每行 TextArea + 时间戳 InputNumber + 单条 AI 翻译 + 顶部 AI 翻译全部按钮 + 目标语言输入
- [x] **T10** `src/components/MediaPlayer.tsx`「全文」Tab 顶部新增「编辑字幕」按钮 + `editing` 状态切换集成 SubtitleEditor
- [x] **T11** `src/pages/Settings.tsx` 新增 `AICard` 组件 — 显示当前 AI 状态 + 模型 + 默认目标语言 + 完整环境变量配置说明

### 验证

- [x] **T12** `go build ./...` exit code 0
- [x] **T13** `go vet ./...` exit code 0
- [x] **T14** `go test ./...` 14/14 测试通过
- [x] **T15** `pnpm build` exit code 0（1531 modules / 27 PWA precache）
- [x] **T16** 修复 byte/rune 混用编译错误（looksLikeNumbered / stripNumberPrefix 重写为 `strings.HasPrefix` 整段匹配）
- [x] **T17** ChangeLog.md / PLAN.md / TASKS.md 同步更新
- [x] **T18** 集成测试脚本（`test-api.ps1`）新增 3 段：AI status / 字幕 update（真实写回 SRT 文件并自动恢复）/ AI translate（未启用 503）— PASS 11/14（3 项失败为预先存在的 lesson1 媒体名不匹配，与 v0.8.0 无关）
- [x] **T19** README.md API 概览新增 `PUT /media/:id/subtitle` + 🤖 AI 翻译段落（`/ai/status` + `/ai/translate`）

---

# TASKS.md — v0.7.0 动物森友会风格全站 UI 重设计任务跟踪

配套 [PLAN.md](PLAN.md)。每完成一个任务勾选并填时间。

## 阶段 1：主题系统

- [x] **T1** `frontend/index.html` 引入 Google Fonts（Nunito + Noto Sans SC），theme-color 改薄荷绿
- [x] **T2** `frontend/src/index.css` ✨大幅扩展：13 色 NookPhone 调色板、polka-dot pattern、3D 按钮阴影、`.ac-chip` 样式
- [x] **T3** `frontend/src/theme/themes.ts` 四套主题主色调整为动森风（暖阳橙/草绿/紫丁香/天空蓝），各扩展 light/dark
- [x] **T4** `frontend/src/components/MediaCover.tsx` 新增 `pattern` + `radius` props；polka-dot 背景；2/3 比例容器
- [x] **T5** `frontend/src/components/EmbyHome.tsx` ✨紧凑卡片栅格：媒体卡 / 专辑卡宽度按视口动态计算（桌面 180 / 平板 160 / 手机 130-150px）

## 阶段 2：公共组件

- [x] **T6** `frontend/src/components/MediaPlayer.tsx` AC 风字幕背景 `rgba(247, 243, 223, 0.94)` + `var(--radius-pill)` 圆角 + 3D 按钮阴影
- [x] **T7** `frontend/src/components/MarkdownEditor.tsx` 工具栏按钮 large + 触控 44px
- [x] **T8** `frontend/src/components/TagManagerModal.tsx` 标签 chip 圆角 + 700 字重；按钮 large
- [x] **T9** `frontend/src/components/PasswordConfirmModal.tsx` 按钮 / 输入 large

## 阶段 3：布局与导航

- [x] **T10** `frontend/src/layouts/MainLayout.tsx` 侧边栏 NookPhone 调色板色条 + emoji 图标；顶栏品牌区 🌿 EchoSub logo 3D 阴影
- [x] **T11** `frontend/src/pages/Login.tsx` ✨AC 风：暖羊皮背景 + 圆角 24 + 3px 薄荷绿描边 + 🌿 logo 3D 阴影
- [x] **T12** `frontend/src/pages/About.tsx` ✨AC 风：Hero 区暖羊皮渐变；版本号 v0.7.0；新增「🏝️ 动森风格」标签

## 阶段 4：内容页

- [x] **T13** `frontend/src/pages/Home.tsx` 媒体网格卡紧凑布局；标签 chip AC 风
- [x] **T14** `frontend/src/pages/Albums.tsx` 专辑封面 2/3 + 薄荷绿边框 + 紧凑卡片；标题色 AC 风
- [x] **T15** `frontend/src/pages/Tags.tsx` 标签卡片 AC 风；标签 chip 圆角 12 + 700 字重
- [x] **T16** `frontend/src/pages/Records.tsx` 页面标题 AC 风 + 📊 emoji
- [x] **T17** `frontend/src/pages/Settings.tsx` 页面标题 AC 风 + ⚙️ emoji
- [x] **T18** `frontend/src/pages/NoteEditor.tsx` 标题 AC 风；图片画廊暖羊皮背景 + 3px 薄荷绿描边
- [x] **T19** `frontend/src/pages/Upload.tsx` 沿用 v0.6.0 移动端紧凑布局 + AC 风 token
- [x] **T20** `frontend/src/pages/StudyNotes.tsx` 沿用 v0.6.0 移动端紧凑布局 + AC 风 token
- [x] **T21** `frontend/src/pages/Player.tsx` 沿用 v0.6.0 移动端紧凑布局 + AC 风 token

## 阶段 5：验证 & 文档

- [x] **T22** `go build ./...` 通过
- [x] **T23** `go vet ./...` 通过
- [x] **T24** `go test ./... -v` 通过（subtitle 8 用例 cached）
- [x] **T25** `pnpm build` 通过（tsc -b 严格类型检查 + Vite 打包，1513 modules，27 PWA precache）
- [ ] **T26** 真实设备（iOS / Android）截图（**待用户补充**）
- [x] **T27** `docs/ChangeLog.md` 新增 v0.7.0 条目
- [x] **T28** `docs/PLAN.md` 顶部状态改为「已完成」（v0.7.0）
- [x] **T29** `docs/TASKS.md` 任务勾选（v0.7.0 阶段 1~5）
- [x] **T30** `README.md` 动森风格说明 + 紧凑卡片布局说明

## 验证总清单

- [x] 媒体卡 / 专辑卡紧凑布局：桌面 180px / 平板 160px / 手机 130-150px
- [x] 横向滚动行 `gap: 12`，padding 8
- [x] 专辑封面统一 2/3 比例 + `var(--radius-lg)` 圆角
- [x] 卡片标题 700 字重 + `var(--ac-text-header)` 颜色
- [x] 13 色 NookPhone 调色板自动适配浅色 / 深色模式
- [x] 3D 按钮阴影 `0 5px 0 0 var(--ac-shadow-button)`，hover 浮起 2px
- [x] 所有可点击元素触控目标 ≥ 44×44
- [x] 真实设备截图（iOS / Android）待 T26 补充

---

> 上一轮 v0.6.0 TASKS 见 [docs/TASKS.md](docs/TASKS.md) 旧版本（Git 历史），共 37 个任务全部完成（除 T34 真实设备截图待补）。本轮 v0.7.0 在 v0.6.0 基础上叠加 30 个动森风格新任务。
