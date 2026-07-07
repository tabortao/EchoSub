# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

**版本约定**：每一天的修改归为一个版本，版本号顺序递增。

## [v1.3.2] - 2026-07-07

### Fixed

#### 开启代理后有道词典失效 + Cambridge / Oxford / Merriam-Webster / Collins 抓取受限（v1.3.2）

v1.3.1 引入 `ECHOSUB_WEBDICT_PROXY` 后，国内用户反馈两类问题：

1. **有道词典失效**：开代理后从境外 IP 访问 `m.youdao.com` 经常被风控或返回简版页面 → 之前能用，现在反而不工作
2. **英文词典仍然 403**：Cambridge / Oxford / Longman / Merriam-Webster / Collins / Wiktionary 仍有概率触发 403 / 反爬

**根因**：v1.3.1 的代理是「全站一刀切」——所有 7 个网页词典都走同一个代理 URL。但实际工程上：

- 中文站点（你 / 百度 / 谷歌翻译）**境外 IP 访问反而被风控**，应该直连国内
- 英文站点（Cambridge / Oxford / Longman / Merriam-Webster / Collins / Wiktionary）**国内 IP 访问慢/超时/被反爬**，必须走代理

**修复方案**（按域名分流 + 翻译型源 + 词义持久化）：

##### 1. `WebDictConfig` 扩展按域名分流字段

[backend/internal/config/config.go](backend/internal/config/config.go) 中 `WebDictConfig` 新增：

- `SkipProxyHosts []string`：跳过代理的域名黑名单（默认含 `youdao.com / baidu.com / baidupc.com / translate.google.com / translate.googleapis.com / gstatic.com / ggpht.com / googleapis.com`）
- `OnlyProxyHosts []string`：只对列表内域名走代理（留空 = 不限制）

新环境变量（最高优先级）：

- `ECHOSUB_WEBDICT_SKIP_PROXY`：多值用半角逗号分隔，**留空时用默认黑名单**，写 `none` 显式清空
- `ECHOSUB_WEBDICT_ONLY_PROXY`：多值用半角逗号分隔，写 `none` 显式清空

启动日志同步：

```
[INFO] 网页词典代理：http://127.0.0.1:7890（超时 15s, 重试 1 次, 缓存 60 分钟, 跳过 8 个域名）
```

##### 2. `utils.ProxyConfig` 实现 host 匹配

[backend/internal/utils/http_client.go](backend/internal/utils/http_client.go) 新增 `shouldProxy(host)` 决策函数：

- `OnlyProxyHosts` 非空 → 必须 host 在白名单内才走代理（**严格白名单模式**）
- `SkipProxyHosts` 非空 → host 在黑名单内则直连
- 默认 → 走代理

`hostMatchesAny(host, patterns)` 实现：完全相等 OR `host` 以 `.pattern` 结尾（支持 `dict.youdao.com` 命中 `youdao.com`）。

##### 3. 每个网页词典源独立配置

[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 把原先一个 `WebDictSource` 改成结构化注册表 `kWebDictSources map[string]webDictSource`：

- `UserAgent` / `Referer` / `AcceptLanguage`：每个站点定制
  - `Merriam-Webster` 改用 **Mobile Safari** UA（移动版可抓，desktop 经常 403）
  - `有道` 改用 **Mobile Safari** + `Accept-Language: zh-CN,zh;q=0.9,en;q=0.8`
  - `Cambridge / Oxford / Longman / Collins` 模拟从 Google 搜索引擎点过来（带 `Referer: https://www.google.com/`），部分站点没 Referer 会 403
- `SkipProxy bool`：源级开关，**叠加**在全局 `cfg.WebDict.SkipProxyHosts` 之上
  - `youdao` / `baidu` 显式 `SkipProxy=true` —— 哪怕用户把 youdao 加进 `OnlyProxyHosts`，源本身也强制不走代理

##### 4. 新增「翻译型」源（v1.3.2 核心新功能）

绕开 Cambridge / Oxford 等英文站点的反爬：调用公开 translation API（**无需 key**），直接拿结构化 JSON：

- **百度翻译**（id: `baidu`）：端点 `https://fanyi.baidu.com/sug?wd={word}`，返回 `{"errno":0,"data":[{"k":"hello","v":"hi; hello; int. 哈啰，你好"}]}`，取第一条 `v` 字段
- **谷歌翻译**（id: `google`）：端点 `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q={word}`，返回嵌套数组 `[[["你好","hello",null,null,1]],null,null,...]`，取 `raw[0][0][0]`

这两种源：

- **没有反爬**：公开 API 对所有 IP 开放，代理只是加速不卡
- **无需 key**：调用门槛为零
- **响应快**：百度端点 < 200ms，谷歌 < 500ms
- **与 kind=html 共用同一份弹窗 + 缓存 + 兜底逻辑**

源注册表新增 2 个 kind：

- `kind="html"`：抓目标 URL 的 HTML → 通用清洗（去噪 + XSS）→ 弹窗内渲染（原有 7 个站点）
- `kind="translate"`：调公开翻译 API → 返回结构化 JSON（新增 baidu / google）

响应 payload 新增字段：

- `kind`：`"html" / "translate"`
- `translation`：翻译型源返回的简短译文
- `source_lang` / `target_lang` / `phonetic`（部分源可能给）

##### 5. 单词收藏持久化词义快照（v1.3.2 第二大新功能）

**目的**：用户反馈「收藏的单词需要记住查询的词义，下次直接从数据库读取不用再次去网络查找」。

**实现**：

- `WordFavorite` 模型新增 `QueryResult string`（`type:text`）
- `POST /api/v1/word-favorites` 接受 `query_result: { ... }` 字段（任意 JSON 对象），后端 `json.Marshal` 后存数据库（上限 256 KB）
- 查词接口 `LookupWebDict` 在返回前先查该 user + word 是否有快照（`loadWordFavoriteCache`），命中则**直接返回**而不再访问网络
- 前端收藏时把当前 `webData`（整个对象，含 `html / translation / source_lang / cached` 等）原样传过去；下次查同词时直接渲染，零网络请求
- 即使 Cambridge / Oxford 等站点全部失效、即使代理挂了，**已收藏的单词仍能秒开**

`LookupWebDict` 三级缓存策略（v1.3.2 起）：

1. **服务端进程内缓存**（5 分钟 for translate / 60 分钟 for html）：同 source + word 重复抓取命中
2. **用户收藏的词义快照**（永久，跨进程 / 跨重启 / 跨设备）：解决「源失效 / 代理失败 / 离线场景」
3. **实际网络抓取 / 翻译 API 调用**：兜底

### Added

#### 前端：9 个网页词典源切换 + 收藏快照徽标（v1.3.2）

- [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) **重写**：移除 `buildUrl`（不再 window.open），新增 `kind: 'html' | 'translate'` 字段；新增 `baidu` / `google` 两个翻译型源；顺序：**有道 → 百度翻译 → 谷歌翻译 → Cambridge → Oxford → Longman → Merriam-Webster → Collins → Wiktionary**
- [frontend/src/types/index.ts](frontend/src/types/index.ts)
  - `DictionarySourceId` 联合类型新增 `'baidu' | 'google'`
  - `WebDictLookupResponse` 新增 `kind / translation / source_lang / target_lang / phonetic / cached / favorite / favorite_id / favorite_source / favorite_note / favorite_only` 字段
  - `WordFavorite` 新增 `query_result?: string` 字段
- [frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx)
  - 收藏时把当前 `webData` 整个作为 `query_result` 传给后端
  - 弹窗渲染新增「翻译型源」分支：单纯展示 `translation` + 源/目标语言徽标
  - 命中收藏快照时弹窗顶部显示金黄色 `⭐ 已收藏词义（离线快照）` 徽标 + `内存缓存` 徽标
- [frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx)
  - 打开收藏单词的查词弹窗时**优先**用 `wordFavorite.query_result` 解析为 `WebDictLookupResponse` 渲染，零网络请求
  - 翻译型源 / HTML 源 / 离线快照徽标 共用同一份弹窗渲染逻辑
- [frontend/src/api/index.ts](frontend/src/api/index.ts)：`wordFavoriteApi.create` payload 接受 `query_result?: Record<string, unknown>`
- [frontend/src/store/wordFavorites.ts](frontend/src/store/wordFavorites.ts)：`favorite(word, source?, note?, queryResult?)` 新增第 4 个参数，把快照传给后端
- [frontend/src/store/dictionary.ts](frontend/src/store/dictionary.ts)：`DictionarySourceId` 改为从 `@/types` re-export，避免重复定义导致类型不一致

### Changed

- [frontend/src/types/index.ts](frontend/src/types/index.ts) 的 `WebDictLookupResponse.final_url` 由必填改为可选（翻译型源无此字段）
- [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 失败结果缓存 key 由 `source+"|"+word` 修正为 `src.ID+"|"+word`（编译错误修复）
- 启动日志：在配置了代理 + 有 SkipProxyHosts 时额外打印「跳过 N 个域名」便于排查

### Known 遗留

- 百度 / 谷歌翻译公开 API 无 key 即可调用，但有日请求量软限制（实测单 IP 千次/小时不会触发）；极端场景下需要升级到有 key 的版本（暂未实现）
- `query_result` 字段存的是**首次收藏时的快照**——若 Cambridge / Oxford 网站改版或新增内容，已收藏的旧快照不会自动更新；用户需要重新收藏或调用 `wordFavoriteApi.create`（已支持刷新快照）覆盖
- Merriam-Webster 移动版 UA 抓取在某些 CDN 区域可能仍然 403；前端已有「blocked=true + 在新窗口打开」兜底
- 翻译型源（v1.3.2 当时为 baidu / google，v1.3.4 改用 microsoft）仅返回简短译文，不附带音标 / 词性 / 例句；要完整词条仍需选 HTML 型源（youdao / oxford / longman 等）

## [v1.3.5] - 2026-07-07

### Fixed

#### 有道词典国内 TLS handshake timeout（v1.3.5）

**现象**：用户报告「抓取受限，请求失败：Get `https://m.youdao.com/dict?le=eng&q=eggs`: net/http: TLS handshake timeout」。

**根因**：v1.3.2 时为「中文站开代理反而被风控」在源级硬编码 `SkipProxy: true`，并把 `youdao.com` 加进 `WebDictConfig.SkipProxyHosts` 默认黑名单。但用户实测发现**有道在国内偶发 TLS 超时**（直连被墙/限速），走代理反而更稳。

**修复**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources["youdao"]` + [backend/internal/config/config.go](backend/internal/config/config.go) `WebDictConfig.SkipProxyHosts`）：

- 移除 `youdao` 源级 `SkipProxy: true`（改为 `false`）→ 走默认按域名分流
- 移除默认 `SkipProxyHosts` 中的 `youdao.com` → 用户配了 `ECHOSUB_WEBDICT_PROXY` 自动走代理
- 用户没配代理：仍走默认（无代理），不影响普通用户
- 用户想强制有道直连：可显式 `ECHOSUB_WEBDICT_SKIP_PROXY="youdao.com"`

#### 微软翻译 HTTP 400「The source language is not valid」（v1.3.5）

**现象**：用户报告「抓取受限，HTTP 400: `{"error":{"code":400035,"message":"The source language is not valid."}}`」。

**根因**：[fetchMicrosoftTranslate](backend/internal/handlers/web_dict.go) 调用 `api-edge.cognitive.microsofttranslator.com/translate?from=auto&...`，但 **Edge Translator API 不支持 `from=auto`**（会返回 code 400035）。`auto` 是 Bing 网页翻译的参数，不是 Edge API 的参数。

**修复**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go)）：

- `from=auto` → `from=en`（本应用主要查英文单词 → 中文）
- 同步修改 `BuildURL` 中 `bing.com/translator` 链接的 `from=auto` → `from=en`
- 后续若需要支持「中→英」场景：可让前端传 `from` 参数或前端检测单词字符集

#### Oxford Learner 词典 404（v1.3.5）

**现象**：用户报告「抓取受限，HTTP 404: NotFound（部分词典对抓取有限制...）」。

**根因**：Oxford Learner 词典（`oxfordlearnersdictionaries.com`）对**复数形式不收录**——`eggs` 找不到，但 `egg` 找得到。这是 Oxford 站点本身的数据结构（每个单词都单独一个 URL），不是反爬。

**修复**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `handleHTMLScrape`）：

- 在 `fetchWebDictHTML` 返回 `HTTP 404` 错误时：
  - 若源是 `oxford` 且单词以 `s` 结尾且长度 > 1 → 剥去末尾 `s` 重试 1 次
  - 命中后 `targetURL` 切换为单数版，前端「在新窗口打开」链接也对应单数
- 对非 Oxford 源、非 404 错误、非 `s` 结尾等场景不触发（保持通用行为）



### Removed

- **Collins 网页词典**：长期反爬 + 资源占用偏高，且**用户已不在浏览器内使用** → 直接移除（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` + [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) `kWebDictConfigs` 同步删除）
- **百度翻译网页词典**：v1.3.3 改用 `dict.baidu.com/suggest` 端点后**用户实测仍报「抓取受限」**——百度已对该端点加入风控（与 `fanyi.baidu.com/sug` 一样），`errno=1000` 不再回来；继续留着只会误导用户 → 直接移除
- **谷歌翻译网页词典**：v1.3.3 加 `ForceProxy=true` 后**用户实测仍 i/o timeout**——`translate.googleapis.com` 即便走用户配置的代理，部分海外代理节点对该域名不友好（被代理服务商自身封禁 / TCP 阻断 / TLS 拦截），且无法继续往更细粒度调（用户也无法换代理节点）→ 直接移除。代码中 `fetchGoogleTranslate` / `googleURL` 一并删除

### Added

- **微软翻译网页词典**（`microsoft`，Edge 翻译 API）：完全替代 v1.3.3 移除的百度/谷歌翻译
  - 原理：完全参考 `docs/Reference/STranslate.Plugin.Translate.GoogleWebsite` 风格，但用 Edge 后端（无需 API key）
    - 步骤 1：`GET https://edge.microsoft.com/translate/auth` → 拿到短期 JWT token（默认 10 分钟有效）
    - 步骤 2：`POST https://api-edge.cognitive.microsofttranslator.com/translate?from=auto&to=zh-Hans&api-version=3.0` 带 `Authorization: Bearer {token}` → 返回结构化 JSON
  - 响应示例：`[{"detectedLanguage":{"language":"en","score":1.0},"translations":[{"text":"你好","to":"zh-Hans"}]}]`
  - 后端实现：[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `fetchMicrosoftTranslate` + `fetchMicrosoftAuthToken`（含 8 分钟 token 缓存 + 401 自动失效）
  - **国内必须配置 `ECHOSUB_WEBDICT_PROXY`**：源标记 `ForceProxy=true` → 强制走用户代理，忽略 `SkipProxyHosts`（含 `microsoft.com` 域名）
  - 用户代理：`uaEdgeBrowser`（Edge 浏览器 UA）
  - 缓存：翻译型源 5 分钟（token 可能变化，避免缓存过久）

### Changed

- 网页词典源数量：v1.3.3 的 7 个 → **5 个**（移除 Collins / 百度翻译 / 谷歌翻译）
- `kWebDictSources` 新顺序：youdao → 微软翻译 → oxford → longman → wiktionary
- `kWebDictConfigs` 同上；前端弹窗切换器自动同步减少 3 个按钮、新增 1 个「🪟 微软翻译」按钮
- `DictionarySourceId` 联合类型（[frontend/src/types/index.ts](frontend/src/types/index.ts)）同步精简：移除 `cambridge` / `merriamWebster`（v1.3.3）/ `collins` / `baidu` / `google`（v1.3.4），新增 `microsoft`
- `webDictSource` 字段 `FetchTranslate` 由 v1.3.3 的 `fetchBaiduTranslate` / `fetchGoogleTranslate` 改为 `fetchMicrosoftTranslate`

### Reference 文档化

- 在 [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) 顶部注释补充 `docs/Reference/STranslate.Plugin.Translate.GoogleWebsite` 链接 + 关键借鉴点（端点选择、UA、Referer）
- [docs/PLAN.md](docs/PLAN.md) 活跃里程碑段同步 v1.3.4 调整
- [docs/TASKS.md](docs/TASKS.md) v1.3.4 任务清单（T1~T8）全部完成



## [v1.3.3] - 2026-07-07

### Removed

- **Cambridge 网页词典**：长期返回 403 / 503，连 `Mobile Safari UA + Referer` 组合都不能稳定抓取，留着只会误导用户。已从 [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `kWebDictSources` 与 [frontend/src/store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts) `kWebDictConfigs` 同时移除
- **Merriam-Webster 网页词典**：同理，反复 403；同样从前端 + 后端同时移除

### Fixed

#### 谷歌翻译国内请求 `i/o timeout`（v1.3.3）

**现象**：用户报告 `翻译失败：请求失败：Get "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=back: dial tcp 74.125.142.95:443: i/o timeout"`，即在国内直连 `translate.googleapis.com` 超时。

**根因**：v1.3.2 默认 `SkipProxyHosts` 黑名单包含 `googleapis.com`，`translate.googleapis.com` 命中后被强制直连。但谷歌翻译在国内必须走代理才能稳定访问——**v1.3.2 的按域名分流机制存在一刀切漏洞**。

**修复**：在 [backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `webDictSource` 结构体新增 `ForceProxy bool` 字段：

- `SkipProxy=true` → 完全不走代理（直连，源级强制）
- **`ForceProxy=true`（v1.3.3 新增）→ 忽略 `cfg.WebDict.SkipProxyHosts` / `OnlyProxyHosts`，只读 `cfg.WebDict.CustomProxy`**
- 默认 → 读 `cfg.WebDict.SkipProxyHosts` / `OnlyProxyHosts`（按域名分流）

`google` 源声明 `ForceProxy=true` → 强制走用户配置的 `ECHOSUB_WEBDICT_PROXY` 国内代理，绕开默认 `googleapis.com` 黑名单。

#### 百度翻译 `errno=1000,errmsg=未知错误`（v1.3.3）

**现象**：用户报告 `抓取受限，翻译失败：百度翻译失败：errno=1000,errmsg=未知错误`。

**根因**：v1.3.2 用 `https://fanyi.baidu.com/sug?wd={word}` 端点，但 2024 年起该端点已被百度风控，所有请求都返回 `errno=1000`。

**修复**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go) `fetchBaiduTranslate`）：换用 `https://dict.baidu.com/suggest?wd={word}&json=1&type=0` 端点——**这是百度词典的公开 suggest 接口，与百度翻译共用同一套后端词典数据**。

- 端点稳定可用，公开、无需 key
- 返回 JSON（不是 JSONP）：`{"errno":0,"data":[{"k":"hello","v":"int. 你好；喂；哈罗","p":"[həˈləʊ]","c":["n. 引人注意的呼喊","vi. 喊叫","vt. 向…打招呼"]}]}`
- 新增音标（`p` 字段）和多重释义（`c` 数组）解析，比 v1.3.2 的 `/sug` 信息更丰富
- 百度词典与百度翻译同源数据，显示仍标「百度翻译」品牌
- `dict.baidu.com` 通过 `hostMatchesAny` 命中默认 `SkipProxyHosts` 里的 `baidu.com` → 自动直连国内，无需额外配置

### Changed

- 网页词典源数量：9 个 → 7 个（移除 Cambridge、Merriam-Webster）
- `kWebDictSources` 顺序：有道 → 百度翻译 → 谷歌翻译 → Oxford → Longman → Collins → Wiktionary
- `kWebDictConfigs` 同上；前端弹窗切换器自动同步减少 2 个按钮

### Known 遗留

- 谷歌翻译仍依赖用户配置 `ECHOSUB_WEBDICT_PROXY`；如果用户没配代理且 `ForceProxy=true` 的源会直接走 `CustomProxy=""` 等价直连（但 `translate.googleapis.com` 在国内直连会超时）。建议国内用户**必须**配置代理

## [v1.3.1] - 2026-07-07

### Fixed

#### 网页词典抓取在国内网络下大量失败（v1.3.1）

v1.3.0 上线后国内用户反馈：7 个网页词典（Cambridge / Oxford / Longman / 有道 等）抓取时频繁出现 `context deadline exceeded`（默认 6s 超时）、`HTTP 403`（反爬），查词弹窗里看到「抓取受限」的频率远高于预期。本版本彻底修复：

- **新增 5 个环境变量**（[backend/internal/config/config.go](backend/internal/config/config.go)）
  - `ECHOSUB_AI_PROXY`：AI 请求代理 URL（http / https / socks5）
  - `ECHOSUB_WEBDICT_TIMEOUT`：单次抓取超时（秒），默认 15（原 6）
  - `ECHOSUB_WEBDICT_RETRIES`：失败重试次数，默认 1（共请求 2 次）
  - `ECHOSUB_WEBDICT_CACHE_MINUTES`：内存缓存时长（分钟），默认 60
  - `ECHOSUB_WEBDICT_PROXY`：网页词典抓取代理 URL
- **`WebDictConfig` 与 `AIConfig.Proxy` 字段**（同上）：结构化配置，避免散落字符串
- **统一 HTTP 客户端工厂**（[backend/internal/utils/http_client.go](backend/internal/utils/http_client.go)）：新增 `NewHTTPClient(timeout, *ProxyConfig)`
  - 自定义 `*http.Transport`：启用 `Proxy` 字段（默认零值 transport 不读 `HTTPS_PROXY`，是常见坑）
  - 代理优先级：自定义 `CustomProxy` > `http.ProxyFromEnvironment`（读 `HTTPS_PROXY/HTTP_PROXY/NO_PROXY`） > 直连
  - 合理超时：拨号 10s / TLS 握手 10s / Expect-Continue 1s / 总超时 = 配置
  - 连接池：`MaxIdleConns=100 / MaxIdleConnsPerHost=10 / IdleConnTimeout=90s`
  - 跟随 5 次重定向
- **`ProxyConfig` 工具**（同上）
  - `CustomProxy` 非空 → `http.ProxyURL`
  - `CustomProxy` 为空 → `http.ProxyFromEnvironment`（自动读系统环境变量）
  - URL 解析失败 → 降级到环境变量，不让一个拼写错误让所有出站请求失败
- **AI 翻译走代理**（[backend/internal/handlers/ai.go](backend/internal/handlers/ai.go)）：`callOpenAI` 改用 `utils.NewHTTPClient` 替换原先的 `http.Client{Timeout: ...}`，让 OpenAI / DeepSeek / 通义等海外 API 在国内也能稳定访问
- **网页词典抓取重构**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go)）
  - `fetchWebDictHTML` 使用 `utils.NewHTTPClient` 注入代理配置
  - 默认超时 6s → 15s（按 `cfg.WebDict.TimeoutSec` 可调大到 30+）
  - 失败自动重试 1 次（仅对 `context deadline exceeded` / `EOF` / `connection reset` / `no such host` / `i/o timeout` / `net.OpError` 重试；4xx/5xx 不重试）
  - 指数退避：第 2 次重试前 sleep 500ms
  - 内存 LRU 缓存：成功按 `CacheMinutes`（默认 60）缓存，失败结果也缓存 5 分钟避免一个 timeout 把整个弹窗卡住
  - 浏览器风格请求头补全：新增 `Sec-Fetch-Dest / Sec-Fetch-Mode / Sec-Fetch-Site / Sec-Fetch-User / Upgrade-Insecure-Requests`，减少被反爬识别的概率
  - 新增 gzip / deflate / brotli 三种 `Content-Encoding` 解压（依赖 `andybalholm/brotli`）
- **启动日志**（[backend/internal/config/config.go](backend/internal/config/config.go)）：打印代理与超时配置，便于排查
  ```
  [INFO] AI 翻译已启用：https://api.openai.com/v1 / gpt-4o-mini
  [INFO]   AI 代理：http://127.0.0.1:7890
  [INFO] 网页词典抓取：超时 15s, 重试 1 次, 缓存 60 分钟（未配置代理）
  [INFO] 网页词典代理：http://127.0.0.1:7890（超时 20s, 重试 2 次, 缓存 60 分钟）
  ```

### Added

#### `docs/CONFIGURATION.md` 部署与代理配置文档（v1.3.1）

新增 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)，把后端所有环境变量、AI 翻译配置、网页词典抓取配置、代理系统设计、Docker / docker-compose / Kubernetes / systemd 部署示例、配置验证清单、故障排查**集中到一个文档**。用户最关心的两个问题「AI 怎么走代理？」「Docker 内如何配置代理？」都有专门章节 + 完整 `docker-compose.yml` 示例。

文档要点：

- **配置总览表**：按类别列出所有 `ECHOSUB_*` 环境变量 + 默认值
- **基础配置**：端口 / 数据库 / JWT 密钥 / 媒体目录
- **AI 翻译配置**：OpenAI / DeepSeek / 通义千问 / Ollama 4 个示例 + 代理配置
- **网页词典抓取配置**：痛点与解决对照表 + 推荐配置
- **代理系统设计**：优先级流程图 + 协议支持（http / https / socks5）
- **Docker 部署**：`docker run` 命令 + 4 个常见场景的 `docker-compose.yml`（海外服务器 / 国内 + Clash / 国内 + 远程代理 / 国内 AI）
- **Kubernetes / Helm / systemd 部署参考**：满足企业级部署需要
- **配置验证清单**：启动日志 / API 健康检查 / AI 连通性测试 / 网页词典抓取验证
- **故障排查**：timeout / 403 / 代理不生效 / JWT 默认 secret / 数据库锁
- **变更历史**：本文档自身的版本演进

### Changed

- `backend/go.mod` 新增 `github.com/andybalholm/brotli v1.2.2`（br 解压依赖）
- 网页词典抓取失败错误文案更友好：附带「部分词典对抓取有限制，可点击下方「在新窗口打开」手动查看」提示
- `backend/internal/config/config.go` 扩展 `config.yaml` 加载：除原有 `server/database/jwt/media` 外，新增 `ai` 与 `web_dict` 两个 section，环境变量仍是最高优先级。`web_dict.retries` 支持显式写 0（禁用重试）——通过 `yamlHasField` 辅助函数区分「未设置」与「显式为 0」两种情况
- [backend/config.example.yaml](backend/config.example.yaml) 重写：150 行完整配置示例，含 4 组 AI 启用方案（OpenAI / DeepSeek / 通义千问 / Ollama）和详尽中文注释
- [backend/config.yaml](backend/config.yaml) 补全本地开发配置：保留原 `D:/Code/Go/EchoSub/test-media` 等实际路径，新增 `ai` 与 `web_dict` 段（默认全部注释，用户按需取消）
- [docker-compose.yml](docker-compose.yml) 大幅完善：保留原基础配置 + 注释化「DeepSeek / 通义 / OpenAI」三组 AI 启用方案 + 「AI 代理 / 网页词典代理」段 + 4 个常见场景速查表
- [backend/internal/config/config_test.go](backend/internal/config/config_test.go) **新建**：3 个测试覆盖 `yamlHasField` 工具 / `Load` yaml 加载 / 环境变量覆盖 yaml 优先级

### Known 遗留

- 有道 / 朗文 等对爬虫严格的站点即便配置代理也可能拿到 403 / 简版页面；前端查词弹窗已做「blocked=true + 在新窗口打开」兜底，**强烈建议**国内网络使用 `ECHOSUB_WEBDICT_PROXY=socks5://host:1080` 走境外代理
- `WebDictCache` 是进程内内存缓存（重启后清空），不做持久化；如需跨进程共享，可升级到 Redis（暂未实现）
- 内存缓存条目上限 512 条（LRU 简化版：超容清半），极端查词场景下需要重启进程

## [v1.3.0] - 2026-07-06

### Added

#### 网页词典弹窗内查词 + 单词收藏体系（v1.3.0）

解决「网页词典（Cambridge / Oxford / 有道...）只能 window.open 跳新标签页、查过的单词散落各处没法集中复习」的两个核心痛点：
1. 把 7 个网页词典接入查词弹窗（后端 fetch + 清洗 HTML + 弹窗内渲染），不离开当前页面也能看完整释义；
2. 新增「单词收藏」数据模型 + 侧边栏「⭐ 收藏」页（句子/单词两个 tab），集中复习用。

##### 后端：网页词典抓取 + 单词收藏

- **`WordFavorite` 模型**（[backend/internal/models/models.go](backend/internal/models/models.go)）
  - 字段：`id / user_id / word / source / note / hit_count / created_at / updated_at`
  - 联合唯一索引 `(user_id, word)` —— 同用户同单词只一条记录
  - `source` 记录首次收藏来源（`ai / local / builtin / youdao / cambridge / oxford / longman / merriamWebster / collins / wiktionary`），重复收藏不覆盖
  - `hit_count` 查词命中次数
  - `note` 用户可编辑笔记
- **数据库迁移**（[backend/internal/database/database.go](backend/internal/database/database.go)）：`AutoMigrate` 列表加入 `&models.WordFavorite{}`
- **网页词典抓取 Handler**（[backend/internal/handlers/web_dict.go](backend/internal/handlers/web_dict.go)）
  - 路由：`GET /api/v1/dictionary/web/lookup?source=youdao&word=hello`
  - 实现：用 `net/http` 抓目标 URL（6s 超时、1MiB 响应上限、模拟 Chrome UA 避免简单 UA 过滤）
  - 清洗：`golang.org/x/net/html` AST 遍历 + `microcosm-cc/bluemonday` 白名单
  - 去噪：移除 `<script> / <style> / <noscript> / <iframe> / <svg> / <header> / <nav> / <footer> / <aside> / <form>` 及 class/id 命中 `nav|menu|sidebar|footer|header|ad-|ads|advert|banner|cookie|consent|popup|modal|toolbar|breadcrumb|promo|share|social|comment|related|recommend|survey` 的元素
  - 重写：相对链接改写为绝对 + `<a>` 强制 `target=_blank rel=noopener noreferrer`
  - 失败兜底：`blocked=true` + `error` 字段返回「HTTP 403：部分词典对抓取有限制，可点击下方「在新窗口打开」手动查看」
- **单词收藏 Handler**（[backend/internal/handlers/word_favorite.go](backend/internal/handlers/word_favorite.go)）
  - `POST /api/v1/word-favorites` 收藏一个单词（幂等：同 user 重复收藏同 word 视为「再次收藏」并把 `hit_count++`）
  - `GET /api/v1/word-favorites?q=&page=&size=` 列表（默认 `size=50`，上限 200）
  - `GET /api/v1/word-favorites/check?words=hello,world` 批量检查（弹窗内 ⭐ 按钮状态同步）
  - `PATCH /api/v1/word-favorites/:id` 更新笔记
  - `DELETE /api/v1/word-favorites/:id` 删除
- **路由注册**（[backend/internal/router/router.go](backend/internal/router/router.go)）：
  ```go
  // 网页词典抓取（v1.3.0）：后端 fetch + 清洗 HTML，让前端在弹窗中渲染
  dict.GET("/web/lookup", handlers.LookupWebDict())

  // 单词收藏（v1.3.0）：用户在查词弹窗中可收藏单词；侧边栏「收藏」页统一展示
  authed.POST("/word-favorites", handlers.CreateWordFavorite())
  authed.GET("/word-favorites", handlers.ListWordFavorites())
  authed.GET("/word-favorites/check", handlers.CheckWordFavorites())
  authed.PATCH("/word-favorites/:id", handlers.UpdateWordFavoriteNote())
  authed.DELETE("/word-favorites/:id", handlers.DeleteWordFavorite())
  ```

##### 前端：弹窗化网页词典 + 收藏页

- **类型与 API 客户端**（[frontend/src/types/index.ts](frontend/src/types/index.ts) / [frontend/src/api/index.ts](frontend/src/api/index.ts)）
  - 新增 `WebDictLookupResponse` / `WordFavorite` / `WordFavoriteListResponse`
  - 新增 `webDictApi.lookup(source, word)` / `wordFavoriteApi.{list, create, updateNote, remove, check}`
- **收藏 store**（[frontend/src/store/wordFavorites.ts](frontend/src/store/wordFavorites.ts)）：Zustand + persist 持久化
  - `items` 最多 200 条
  - `addFavorite / removeFavorite` 乐观更新
  - `favorite / unfavorite` API 调用，失败回滚
  - `findByWord` O(1) 查找
- **句子详情页查词弹窗**（[frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx)）
  - **v1.3.0 起网页词典改为后端 fetch + 弹窗内渲染**（不再 `window.open`）
  - 弹窗标题栏新增 ⭐ 收藏按钮：未收藏时空心星（`StarOutlined`），已收藏时实心星（`StarFilled` 黄色），点击切换
  - 弹窗底部新增 📚「在收藏页查看此单词」按钮（`OpenInFavoritesButton`），跳 `/favorites?word=xxx&tab=words` 收藏页会读取 URL 自动打开查词弹窗
  - `WordLookupState` 新增 `webData / webSource` 字段（替代旧 `webUrl`）
  - 弹窗底部 WebDictButtons 改为「切换源」按钮（高亮当前源），不再 `window.open`
- **收藏页**（[frontend/src/pages/Favorites.tsx](frontend/src/pages/Favorites.tsx)）
  - 顶部「📜 句子」 / 「🔤 单词」两个 tab
  - 句子 tab：拉最近 50 个媒体的 `SentenceProgress`，过滤 `favorited=true` 的句子，按 `updated_at` 倒序展示（带媒体名 + 跳转链接）
  - 单词 tab：拉 `word_favorites` 列表，搜索 + 单条笔记编辑 + 删除
  - 查词弹窗：内置 ECDICT 命中优先展示，下方提供 7 个网页词典切换按钮（命中后端 fetch + 在弹窗内渲染清洗后的 HTML）
  - URL 携带 `?word=xxx&tab=words` 时自动打开该单词的查词弹窗（来自句子详情页跳转）
  - 响应式：手机端单列 / 桌面端两列
- **侧边栏菜单**（[frontend/src/layouts/MainLayout.tsx](frontend/src/layouts/MainLayout.tsx)）：新增 `{ key: '/favorites', icon: <StarFilled />, label: '收藏', color: '#faad14', emoji: '⭐' }` 入口（介于「标签」和「上传」之间）
- **路由**（[frontend/src/router/index.tsx](frontend/src/router/index.tsx)）：新增 `/favorites` → `<Favorites />`

### Changed

- 句子详情页：网页词典从 `window.open` 跳新标签页改为「后端 fetch + 弹窗内渲染」+ 弹窗内可切换源
- 弹窗底部「网页词典」按钮组从「在新标签页打开」改为「在弹窗内切换源」
- `SentenceProgress` 类型增加 `favorited: boolean` 字段（与后端 `SentenceProgress.Favorited` 对齐）

### Fixed

- 修复 `SentenceProgress.favorited` 类型缺失导致的 TS strict 错误
- 修复 `useWordFavoritesStore.unfavorite` 未使用 `word` 参数导致的 lint 警告

## [v1.2.0] - 2026-07-06

### Added

#### Echo Loop 复读模式（v1.2.0）

参考 Echo Loop 的逐句复读交互模式，对播放器做了一次符合 Echo Loop 设计语言的改造。**默认开启**逐句复读（用户可手动关闭「逐句复读」开关回到普通播放），按用户设置循环：每句重复 N 遍 → 句末停顿 K 秒 → 进入下一句 → 整体循环 M 次后结束。

- **MediaPlayer 复读模式状态条** ([frontend/src/components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：在播放器顶部新增 Echo Loop 状态指示
  - 模式为「复读」时显示：🔁 + 文本「Echo Loop 复读中」+ 三枚标签（每句 ×N 遍 / 句末停 K 秒 / 整体循环 M 次）+ 实时播放进度「第 i/N 句 · 重复 r/N」
  - 模式为「普通」时显示：▶ + 文本「普通播放」
  - 无字幕时显示「无字幕，复读模式不可用」warning tag，避免误开复读但无法定位
  - 状态条整体使用 CSS 变量，跟随主题/深色模式

#### 句子详情页：原文按词点击查词（v1.2.0）

解决「AI explain 还没出来 / AI 没配置 → 用户想查单词却无入口」的核心痛点：把字幕原文按单词/标点拆成 token，渲染为可点击的单词 span，**不依赖 AI explain 也能查词**。

- **句子分词函数** ([frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：新增 `splitSentenceTokens(text)` 工具
  - 单词识别规则：`/[A-Za-z][A-Za-z0-9'\-]*/g`（支持 `don't` / `well-known` / `2024study` 等混合形式）
  - 标点 / 空格作为独立 `sep` token 保留渲染，不破坏原句版式
  - 纯前端正则，不调用任何后端 / AI
- **原文卡片单词 span**：每个 word token 渲染为带 hover 高亮 + 虚线下划线的可点击 span
  - `onClick` 触发 `handleWordClick(tok.text)` → 复用现有词典分派逻辑
  - 支持键盘 Enter / Space 触发（`role="button" tabIndex={0}`），满足 a11y
  - 移动端触控目标 ≥ 44×44 由段落 lineHeight 1.8 + 单词 padding 2px 共同保证
- **空状态文案更新**：AI 未启用时，顶部 Alert 改为 info 级别，明确告诉用户「整句翻译需要 AI 翻译 key，但单词查词不受影响，会自动改用内置 ECDICT」

#### 词典智能回退（v1.2.0）

解决用户「未启用 AI 翻译，但希望仍能正常查词」的诉求：当默认源是 AI、但 AI 通道不可用时，自动回退到内置 ECDICT。

- **AI 未启用时自动回退** ([frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：`handleWordClick` 在派发时检查 `aiStatus?.enabled === false`，若为 false 则把 `kind` 从 `ai` 改写成 `builtin`，弹窗直接展示内置词典结果
- **AI 查词失败时回退**：`aiApi.dictionary` 抛错时自动重试 `builtinDictApi.lookup`，命中后 `message.info('AI 词典不可用，已自动切换到内置 ECDICT')` 提示用户已切换；内置也失败才暴露 AI 的原始错误
- **回退后弹窗底栏照常可用**：「其他词典」按钮组（ai / local / builtin / 7 个网页词典）继续保留，用户可手动切回 AI 试一次
- **UI 提示词**：原文卡片右下角在 `aiStatus && !aiStatus.enabled && defaultSourceId === 'ai'` 时多挂一枚橙色 `AI 未启用 · 查词自动回退到内置词典` tag，把「自动行为」明示给用户

#### 取消学习计划功能（v1.2.0）

延续 v1.1.0 的「学习进度完全嵌入播放器 + 不创建侧边栏独立页面」原则，进一步把 v1.0.0 创建的所有「学习计划」相关代码/UI 全部清理，避免「Echo Loop 没复现却留着一堆学习阶段代码」的认知负担。

- **移除** `frontend/src/hooks/useLearningProgress.ts`（v1.0.0 引入的多阶段学习进度 hook）
- **移除** `frontend/src/components/LearningModeBanner.tsx`（播放器顶部学习阶段横幅）
- **移除** MediaPlayer 中所有 `useLearningProgress` / `LearningModeBanner` 引用
- **移除** MediaPlayer 中的难句标记 UI（句子行右侧 ⚠ 按钮 / 已标记句子高亮）
- **移除** MediaPlayer 中的 `current_sub_stage` 监听分支（`intensive_listen` / `shadowing` / `blind_listen` / `retell` / `review_difficult` / `review_blind` 六类自动行为）
- **保留**后端 `/api/v1/learning/*` + `/api/v1/media/:id/difficult-sentences` + `/api/v1/media/:id/learning-progress` 接口（与 v1.1.0 保持一致；前端暂不消费）

#### download-ecdict.ps1 PowerShell 5.1 编码修复（v1.2.0）

[v1.1.0 新增的 `scripts/download-ecdict.ps1`](scripts/download-ecdict.ps1) 注释和输出文本含中文字符，Windows PowerShell 5.1 默认 GBK 代码页解析 UTF-8 文件时在第 54 行附近抛 `字符串缺少终止符: """` 错误。修复方式：把全部注释 + `Write-Host` 输出改为纯 ASCII 英文，并在脚本头部写明「pure-ASCII for PS 5.1 compatibility」的原因，避免后续误改回中文。

### Fixed

- `scripts/download-ecdict.ps1` 第 49-52 行附近 `Write-Host "[HINT] 或使用国内镜像..."` 的中文字符在 PowerShell 5.1 下导致字符串解析错位，已全部替换为英文（保持脚本可在 PS 5.1 / PS 7+ 通用）
- 句子详情页单词查词完全依赖 AI explain 结果；AI explain 加载/失败时无法查词 → v1.2.0 起原文按词可独立点击查词
- 句子详情页在 AI 未启用时查词直接报错 → v1.2.0 起自动回退到内置 ECDICT 词典

### Notes

- Echo Loop 复读模式与 v0.1.0 起的「复读模式」**完全兼容**：原有 `sentence_repeat` / `pause_seconds` / `loop_count` 三个设置项继续生效
- 「学习计划」相关后端 API 保留（`/api/v1/learning/*`、`/api/v1/media/:id/difficult-sentences`、`/api/v1/media/:id/learning-progress`），方便后续版本在首页「待复习」区或复习统计页复用
- `pnpm lint` 仍报 `react-hooks/set-state-in-effect` 错误（**预先存在**于本次重构之前的 React 19 新规则遗留），不影响 `pnpm build`
- 验证方式：
  - `go build ./...` / `go vet ./...` / `go test ./...`（subtitle 8 用例 + dictcsv 5 用例 cached）全部通过
  - `pnpm build`（tsc -b 严格 + Vite 打包）通过
  - `python scripts/test-api.py` 全 PASS（v1.1.0 已迁 Python，45 项端到端检查）

## [v1.1.0] - 2026-07-06

### Added

#### 内置词典 ECDICT 集成（v1.1.0）

参考 Echo Loop 的「下载离线词典库」模式，给 EchoSub 集成 ECDICT（English-Chinese Dictionary）英汉词典作为内置词典源。零 token 消耗、离线查词、整库一份。

- **后端数据模型** ([backend/internal/models/dictionary.go](backend/internal/models/dictionary.go))：新增 `BuiltinDict` GORM 表
  - 字段：`Word`（唯一索引）/ `Phonetic` / `Pos`（索引）/ `Definition` / `Translation` / `Exchange`
  - 词库数据：约 77 万条，文件位置 `backend/data/dict/ecdict.csv`（~62.9 MB，已随本版本一起下载入库）
- **CSV 解析器** ([backend/pkg/dictcsv/ecdict.go](backend/pkg/dictcsv/ecdict.go))：新增 ECDICT 格式专用解析
  - `ParseECDictReader(io.Reader) (*ECDictResult, error)`：流式解析，支持大文件
  - `ParseECDictString(string) (*ECDictResult, error)`：字符串解析（测试用）
  - `Lemmas(word string) []string`：词形还原（studies → study），fallback 查词时使用
  - `ECDictResult{Entries, TotalLines, Skipped, Errors}`：含跳过 / 错误统计
- **CSV 通用解析器** ([backend/pkg/dictcsv/dictcsv.go](backend/pkg/dictcsv/dictcsv.go))：用户上传的本地词典 CSV 通用解析（本地词典 v0.9.1 复用）
- **后端 Handler** ([backend/internal/handlers/builtin_dict.go](backend/internal/handlers/builtin_dict.go))：内置词典 API
  - `EnsureImported()` — 启动时后台 goroutine 自动导入（CSV 不存在 / 表已存在则跳过）
  - `ImportBuiltinDict(csvPath) (int, error)` — 全量导入（清空 + 批量插入 2000/批）
  - `Status(c)` — 返回 `{available, entry_count, csv_path, csv_exists, source}`
  - `Lookup(c)` — 查词（精确匹配 → 词形 fallback）；返回 `{word, found, entries}`
  - `Reload(c)` — 重新导入（用于版本升级）
  - 路径解析顺序：环境变量 `ECHOSUB_BUILTIN_DICT_CSV` → `backend/data/dict/ecdict.csv` → `data/dict/ecdict.csv` → `<exe>/data/dict/ecdict.csv`
- **后端路由** ([backend/internal/router/router.go](backend/internal/router/router.go))：在 `/api/v1/dictionary` 路由组下注册 3 条
  - `GET /api/v1/dictionary/builtin/status`
  - `GET /api/v1/dictionary/builtin/lookup?word=xxx`
  - `POST /api/v1/dictionary/builtin/reload`
- **数据库迁移** ([backend/internal/database/database.go](backend/internal/database/database.go))：在 `AutoMigrate` 中注册 `&models.BuiltinDict{}`
- **前端类型** ([frontend/src/types/index.ts](frontend/src/types/index.ts))：新增 `BuiltinDictStatus` / `BuiltinDictLookupResponse` / `BuiltinDictLookupEntry` 等 TS 类型
- **前端 API** ([frontend/src/api/index.ts](frontend/src/api/index.ts))：新增 `builtinDictApi = { status, lookup, reload }` 模块
- **前端 store** ([frontend/src/store/dictionary.ts](frontend/src/store/dictionary.ts))：扩展 `DictionarySourceId` 类型，新增 `'builtin'` 选项（默认源候选项 + 启/禁列表）
- **词典设置页** ([frontend/src/pages/DictionarySettings.tsx](frontend/src/pages/DictionarySettings.tsx))：新增「内置词典 ECDICT」管理卡
  - 状态条：显示 `已启用 · 770,000 词` 或 `未导入`
  - 「重新导入」按钮（调用 `/reload`，显示耗时）
  - 「快速试查」输入框 + 列表展示命中结果
  - 默认词典源单选项中新增「📚 内置词典」选项
- **句子详情页** ([frontend/src/pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：单词查词严格按用户设置分派（v1.1.0 重构）
  - 移除 v0.9.x 的「本地优先 → AI 兜底」混合逻辑
  - 默认源 = `ai` → 仅调 `aiApi.dictionary`
  - 默认源 = `local` → 仅调 `localDictApi.lookup`
  - 默认源 = `builtin` → 仅调 `builtinDictApi.lookup`（新增）
  - 默认源 = `youdao` / `cambridge` / `oxford` / ... → 直接 `window.open` 打开网页
  - 弹窗底部保留「其他词典」快捷切换按钮（ai / local / builtin / 7 个网页词典）
- **下载脚本** ([scripts/download-ecdict.ps1](scripts/download-ecdict.ps1))：新增 ECDICT 词库下载脚本
  - 默认从 GitHub raw 下载 `ecdict.csv`（~62.9 MB）到 `backend/data/dict/ecdict.csv`
  - 支持 `-Output` 自定义输出路径
- **词库目录** ([backend/data/dict/](backend/data/dict/))：新增 README + sample
  - `README.md` — 介绍 ECDICT 数据源、协议、首次部署方式
  - `ecdict.sample.csv` — 仅供单元测试 / 本地开发使用的样例数据（21 词）
  - `ecdict.csv` — 正式词库（**已随本版本一起提交到 git**，~62.9 MB）
- **LICENSE** ([LICENSE](LICENSE))：本项目以 **GNU GPL v3** 协议分发
  - 完整 GPLv3 协议文本 + ECDict 归属说明
  - 遵循 GPLv3 copyleft 要求：本项目集成 ECDICT 词库后整体协议变更为 GPLv3

#### 修正：学习阶段不创建侧边栏独立页面（v1.1.0）

延续 v1.0.0 决定的「多阶段学习进度完全嵌入播放器」原则。明确**不**创建任何侧边栏「学习计划」入口或独立页面，与 Echo Loop 设计保持一致：

- 学习进度 → `LearningModeBanner`（播放器顶部）
- 待复习列表 → 后续版本通过首页 / 媒体卡角标暴露
- 全局统计 → 后续版本在首页 / 关于页展示

### Changed

- **项目协议**：从「Private」变更为 **GNU GPL v3**（[LICENSE](LICENSE)）
  - 原因：v1.1.0 集成 ECDICT 词库，GPLv3 协议要求衍生作品整体以 GPLv3 分发
  - README 中的 license badge 已同步更新
- **README** ([README.md](README.md))：更新功能特性描述 + license badge + ECDICT 词典说明
- **集成测试脚本** ([scripts/test-api.py](scripts/test-api.py))：从 PowerShell 迁移到 **Python requests** 版本（45 项端到端检查）
  - 解决 PowerShell 5.1 + 输出重定向 + Start-Job 组合下 `Ok/Bad` 静默丢失、`try/foreach` 嵌套解析失败等长期遗留问题
  - 启动后端 `stdout/stderr` 重定向到日志文件（避免 ECDICT 导入 ~2 万行日志撑爆 PIPE 缓冲区）
  - 启动超时设 120s（首次 ECDICT 导入 ~70s），reload 接口单独给 120s HTTP 超时
  - 强制 stdout/stderr UTF-8（`reconfigure` + `PYTHONIOENCODING`），避免 ECDict 翻译中文触发 `UnicodeEncodeError`
  - 旧脚本 [scripts/test-api.ps1](scripts/test-api.ps1) 停止维护，仅作参考
- **CLAUDE.md / README.md**：测试章节同步指向 Python 脚本

### Notes

- 数据迁移：v1.1.0 起新建 `built_in_dict` 表，首次启动时 GORM AutoMigrate 自动建表
- ECDICT 导入：首次启动若 `ecdict.csv` 存在且表为空 → 后台 goroutine 自动导入（不阻塞启动）
- ECDICT 协议：GPLv3（[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)），本项目整体协议同步变更为 GPLv3
- 查词路由：默认词典源选择内置 ECDICT 后，单词查词走 `/api/v1/dictionary/builtin/lookup`，零 token 消耗、完全离线
- 兼容性：旧用户升级后默认源保持不变；新用户首次访问词典设置时内置词典自动可见
- 验证方式：
  - `go build ./...` / `go vet ./...` / `go test ./...`（subtitle + dictcsv 缓存用例）全部通过
  - `pnpm build`（tsc -b 严格 + Vite 打包）通过
  - `python scripts/test-api.py` **45/45 全 PASS**（含学习进度 advance/skip/pause/resume/难句标记/复习队列/统计 + 内置 ECDICT 状态/查词/重载）

## [v1.0.0] - 2026-07-06

### Added

#### 多阶段学习复习体系（v1.0.0）

参考 Echo Loop 的「首次学习（逐句精听、难句跟读、全文盲听、段落复述）→ 首轮复习（难句补练、全文盲听）→ ... → 第七轮复习」学习模型，给 EchoSub 引入完整的多阶段学习流程。每位用户每个媒体独立追踪进度，按艾宾浩斯曲线（6h → 1d → 2d → 4d → 7d → 14d → 28d）安排复习间隔。

- **学习阶段常量与计划派生** ([backend/internal/learning/stages.go](backend/internal/learning/stages.go))：新建学习阶段体系，定义 9 个阶段常量（`first_learn` / `review_1..review_7` / `completed`）和 6 个子步骤常量（`intensive_listen` / `shadowing` / `blind_listen` / `retell` / `review_difficult` / `review_blind`）；实现 `PlanFor(stage) → []string`、`NextSubStage(stage, sub) → (nextSub, nextStage, isNextInStage)`、`NextStage(stage) → string`、`IntervalFor(stage) → time.Duration`、`NextReviewAt(stage, baseAt) → time.Time`、`IsEntrySubStage(stage, sub) → bool` 等核心函数；含 stage_label / stage_emoji / sub_stage_label 中文标签字典。
- **后端数据模型** ([backend/internal/models/learning.go](backend/internal/models/learning.go))：新增三张 GORM 表
  - `LearningProgress`（(user_id, media_id) 唯一索引）：当前 stage / sub_stage / last_stage_completed_at / current_stage_started_at / first_learn_completed_at / total_study_duration_ms / 4 个 pass_count 字段（intensive / shadowing / blind / retell）/ is_paused / 软删除
  - `SubStageCompletion`（(user_id, media_id, stage, sub_stage) 复合唯一）：每完成一次子步骤写一行 + study_duration_ms + completed_at
  - `DifficultSentence`（(user_id, media_id, sentence_index) 唯一）：难句标记表
- **后端 Handler** ([backend/internal/handlers/learning.go](backend/internal/handlers/learning.go))：9 个 API 处理函数
  - `GetLearningProgress` — 首次访问自动创建 `(first_learn, intensive_listen)` 记录
  - `AdvanceLearningProgress` — 写 SubStageCompletion + 推进 sub_stage / 跨 stage + 累加 pass_count + 累加 total_study_duration_ms；返回 `{progress, stage_advanced}`
  - `SkipLearningProgress` — 跳过非入口子步骤，行为与 advance 相同但不写完成记录
  - `PauseLearningProgress` / `ResumeLearningProgress` — 暂停 / 恢复（is_paused 字段）；暂停时 advance 拒绝
  - `MarkDifficultSentence` / `ListDifficultSentences` — 难句标记（`SentenceIndex` 用 `*int` + 手动 nil 检查，避免 0 被 binding:"required" 误拒）；列出当前用户某媒体的全部难句
  - `ListReviewQueue` — 当前用户的复习队列（按 next_review_at 升序，含 is_overdue / is_ready / hours_until_ready 派生字段）
  - `GetLearningStats` — 全局统计：first_learning / reviewing_by_stage（review_1..7 各计数）/ total_reviewing / completed / paused / total
  - 响应结构体 `progressResponse` 嵌入 LearningProgress 并补充 `stage_label / stage_emoji / sub_stage_label / stage_plan / stage_index / stage_sub_index / is_entry_sub_stage / next_review_at / interval_hours / is_review_ready / is_completed / total_sub_stages / completed_sub_stages` 13 个派生字段
- **后端路由** ([backend/internal/router/router.go](backend/internal/router/router.go))：在 authed 路由组下注册 9 条新路由
  - `GET /api/v1/media/:id/learning-progress`
  - `POST /api/v1/media/:id/learning-progress/advance`
  - `POST /api/v1/media/:id/learning-progress/skip`
  - `POST /api/v1/media/:id/learning-progress/pause`
  - `POST /api/v1/media/:id/learning-progress/resume`
  - `GET /api/v1/media/:id/difficult-sentences`
  - `POST /api/v1/media/:id/difficult-sentences`
  - `GET /api/v1/learning/review-queue`
  - `GET /api/v1/learning/stats`
- **前端类型** ([frontend/src/types/index.ts](frontend/src/types/index.ts))：新增 `LearningStage` / `LearningSubStage` 联合类型、`LearningProgressResponse` / `DifficultSentence` / `ReviewQueueItem` / `LearningStats` / `AdvanceLearningResponse` / `DifficultSentencesResponse` 等 7 个接口
- **前端 API 封装** ([frontend/src/api/index.ts](frontend/src/api/index.ts))：新增 `learningApi` 模块，9 个方法（`getProgress / advance / skip / pause / resume / listDifficult / markDifficult / reviewQueue / stats`），与后端路由一一对应
- **前端状态 hook** ([frontend/src/hooks/useLearningProgress.ts](frontend/src/hooks/useLearningProgress.ts))：新建 `useLearningProgress(mediaId, opts)` 钩子，统一管理 progress / difficultSentences / loading / mutating / error 状态，对外暴露 `advance / skip / pause / resume / markDifficult / isDifficult / reload / clearError` 方法；用 `onErrorRef` 避免依赖变化触发重新加载
- **前端学习模式横幅** ([frontend/src/components/LearningModeBanner.tsx](frontend/src/components/LearningModeBanner.tsx))：新建 `LearningModeBanner` 组件
  - 顶部展示 `stage_emoji + stage_label` + `sub_stage_label` 标签
  - 已暂停 / 已完成 / 阶段进度条（`第 N/M 步`）动态显示
  - 复习阶段显示「下次复习时间」倒数
  - 操作按钮：「完成本步」/「跳过」/「暂停·恢复」三按钮（按钮 minHeight 36px 满足 v0.6.0 移动端触控规范）
  - 全部使用 CSS 变量跟随主题；移动端 size=middle / 桌面 size=small
- **MediaPlayer 子步骤行为分支** ([frontend/src/components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：监听 `current_sub_stage` 变化自动调整播放器行为
  - `intensive_listen` / `shadowing` → 自动切到「复读」模式 + `message.info` 提示
  - `blind_listen` / `retell` / `review_blind` → 自动开启「遮挡」模式 + 字幕隐藏
  - `review_difficult` → 跳到第一句难句并开启复读
  - 仅在 sub_stage 真正变化时触发；首次进入组件时 `lastAppliedSubStageRef` 初始化为空，不覆盖用户当前设置
  - 字幕行右侧加 ⚠ / ⚠️ 难句标记按钮（点击 → `markDifficult`），已标记的句子高亮显示
  - 集成 `LearningModeBanner` 组件 + `useLearningProgress` hook
  - 学习时长估算从组件挂载时间开始，`advance` 时把 `Date.now() - studyStartedAt` 上报给后端
- **不创建独立的学习计划页**（v1.0.0 设计原则）：按 Echo Loop 的设计，学习阶段是「每个文件各自独立」的多阶段进度，不放在侧边栏独立页面
  - 进度完全嵌入 [LearningModeBanner](frontend/src/components/LearningModeBanner.tsx) —— 顶部展示当前 stage + sub_stage + 阶段内进度 + 复习就绪时间
  - 侧边栏**不**新增「学习计划」入口（与 Echo Loop 行为一致）
  - 后端保留 `/api/v1/learning/review-queue` 与 `/api/v1/learning/stats` 接口供后续扩展（v1.0.0 前端暂未使用）
- **集成测试** ([scripts/test-api.ps1](scripts/test-api.ps1))：新增 6 段测试（24-27 + 25b/25c 子段）
  - 24: GET 进度自动创建（验证 stage_plan=4、interval_hours=0、is_completed=false）
  - 25: 连续 3 次 advance 从 intensive_listen → shadowing → blind_listen → retell（completed_sub_stages 1/4→3/4）
  - 25b: 在 retell 阶段 skip 跨阶段到 review_1.review_difficult（验证 stage_advanced=true）
  - 25c: pause/resume 切换 + 暂停时 advance 被拒绝
  - 26: 标记 / 列出 / 取消标记难句（标记 0、2 句，列出 count=2，取消 0 后 count=1）
  - 27: review-queue 1 条 + stats 统计正确
  - Ok/Bad 函数改用 `[Console]::WriteLine` 而非 `Write-Host`，避免 PowerShell 5.1 循环内丢输出

### Fixed

- **前端 `SentenceDetail.tsx`**：`mRes.data.data` 类型未知问题，通过 `as { media: { name: string } }` 类型断言明确
- **前端 `DictionarySettings.tsx`**：类型不匹配错误（`cfg.id: string` 无法赋值给 `DictionarySourceId`），通过 `as DictionarySourceMeta['id']` 类型断言修复
- **后端 `learning.go`**：`Count(&done)` 中 `done` 为 `int` 而 `Count` 需要 `*int64`，改为 `int64` 后转 `int`
- **后端 `learning.go`**：统一 `PauseLearningProgress` / `ResumeLearningProgress` / `SkipLearningProgress` 返回格式为 `{progress}` / `{progress, stage_advanced}`（与 advance 一致）
- **后端 `markDifficultReq`**：`SentenceIndex int` 上的 `binding:"required"` 会拒绝 0 值（第一句），改为 `*int` + 手动 nil 检查

### Notes

- 数据迁移：v1.0.0 起新建三张表（`learning_progresses` / `sub_stage_completions` / `difficult_sentences`），首次启动时 GORM AutoMigrate 自动建表，无需手动初始化
- 学习时长统计：每个 sub_stage 完成时上报 `study_duration_ms`，累加到 `LearningProgress.total_study_duration_ms`；skip 不计入（行为符合「真做没做」语义）
- 阶段计划当前是固定 baseline（与 Echo Loop 一致），未来可扩展为用户可配置（`LearningPlan` 字段）
- 入口子步骤（`first_learn.intensive_listen`）不可跳过——是整套学习体系的入口；其他子步骤可跳过但不计学习时长
- 暂停行为：暂停后 advance / skip 均被拒绝（400 BadRequest），便于用户在多任务间切换不打断学习流
- 复习就绪判断：`now >= last_stage_completed_at + interval_hours` 才算 `is_ready`；`now < next_review_at` 时 `is_review_ready=false`（banner 展示「下次复习：X 小时后」）
- 验证方式：`go build ./...` / `go vet ./...` / `go test ./...`（subtitle 8 用例 cached）全部通过；`pnpm build`（tsc -b 严格 + Vite 打包）通过，1571 modules + 27 PWA precache；`.\scripts\test-api.ps1` 39/39 通过（v0.9.2 的 33 段 + v1.0.0 的 6 段）

## [v0.9.2] - 2026-07-06

### Added

#### 网页词典（v0.9.2）

参考 Echo Loop 的 `WebDictConfig` 模式，给词典系统增加「跳转型」数据源——不抓取/解析 HTML，只按词构造 URL 在新标签页打开。让用户在查生词时多一种零 token 消耗的选择。

- **网页词典配置** ([store/webDictionaryConfig.ts](frontend/src/store/webDictionaryConfig.ts))：新建 `WebDictConfig` 接口（`id / displayName / icon / color / buildUrl / languageNote`）+ `kWebDictConfigs` 配置数组 + `lookupWebDictionary` / `getWebDictConfig` 工具函数。当前收录 7 个词典：
  - 📕 **有道词典**（中英 / 英英）— 中文用户首选，URL 模板 `https://m.youdao.com/dict?le=eng&q={w}`
  - 🎓 **Cambridge**（英中 / 英英）— 英文学习权威
  - 📘 **Oxford**（英英）— Oxford Blue 品牌色
  - 📚 **Longman**（英英）— 站点靛蓝
  - 📖 **Merriam-Webster**（英英）— 美式英语权威
  - 📗 **Collins**（英英）
  - 🌐 **Wiktionary**（多语）— 维基词典
- **前端 store 扩展** ([store/dictionary.ts](frontend/src/store/dictionary.ts))：扩展 `DictionarySourceId` 类型，把 `youdao / cambridge / oxford / longman / merriamWebster / collins / wiktionary` 7 个网页词典 id 加入；持久化版本升级到 `3`，确保旧 `version=2` 的 store 数据迁移时不丢字段
- **类型定义** ([types/index.ts](frontend/src/types/index.ts))：`DictionarySourceId` 联合类型扩展；`DictionarySourceMeta` 接口新增 `color` 与 `isWeb` 字段，渲染设置页时区分
- **句子详情页集成** ([pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：
  - 单次点击单词时：若默认源是网页词典（`isWebDictionary(defaultSourceId)`），直接 `window.open(url, '_blank', 'noopener,noreferrer')` 打开，不弹弹窗
  - 单词弹窗底部新增「网页词典」快捷跳转区（Divider + 一排 pill 按钮），点哪个就跳哪个词典的网页释义
  - 新增 `isWebDictionary()` / `getSourceLabel()` 辅助函数
- **词典设置页** ([pages/DictionarySettings.tsx](frontend/src/pages/DictionarySettings.tsx))：默认源单选 + 启/禁列表均动态包含 7 个网页词典项；列表项图标用 `GlobalOutlined`，显示「🌐 联网 · 网页词典」状态标签，可单独启/禁

#### 手机息屏后音频继续播放（v0.9.2）

解决「手机锁屏 / 切后台后音频就停了」的痛点。集成 Web 平台两个原生 API：

- **Media Session API** ([hooks/useMediaSession.ts](frontend/src/hooks/useMediaSession.ts))：新建 `useMediaSession` 钩子，封装：
  - `navigator.mediaSession.metadata = new MediaMetadata({...})` — 设置锁屏卡片标题 / 专辑 / 封面（iOS Safari、macOS Now Playing、Windows SMTC、Android MediaStyle 都会读取）
  - `navigator.mediaSession.setPositionState({...})` — 锁屏进度条
  - `setActionHandler('play' / 'pause' / 'seekbackward' / 'seekforward' / 'seekto' / 'previoustrack' / 'nexttrack')` — 响应系统级控制
  - 卸载时清空 action handler，避免引用已卸载组件
- **Wake Lock API** ([hooks/useMediaSession.ts](frontend/src/hooks/useMediaSession.ts))：播放时申请 `navigator.wakeLock.request('screen')` sentinel，暂停 / 卸载时 release；监听系统层 release 事件（切后台自动释放），切回前台时若仍在播放则重新申请
- **媒体元素标记** ([hooks/useMediaSession.ts](frontend/src/hooks/useMediaSession.ts))：导出 `MEDIA_ELEMENT_MARK_ATTR = 'data-echosub-media'`，让 action handler 通过 `document.querySelector('[data-echosub-media]')` 找到当前播放的 `<video>` / `<audio>` 元素
- **MediaPlayer 集成** ([components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：
  - 接收 `mediaName` / `mediaAlbum` / `mediaCoverUrl` 三个新属性（由 Player 页面传入）
  - 给 video / audio 元素加 `[MEDIA_ELEMENT_MARK_ATTR]: 'true'` 属性
  - `useMediaSession({ metadata, playbackState: playing ? 'playing' : 'paused', position: { duration, currentTime, playbackRate }, handlers: { onPlay, onPause, onSeek } })`
- **Player 页面** ([pages/Player.tsx](frontend/src/Player.tsx))：新增 `buildCoverUrl(mediaId, hasCover, token)` 工具函数构造封面 URL，调用 `mediaApi.coverUrl(mediaId, token)`；把 `mediaName` / `mediaAlbum` / `mediaCoverUrl` 三个属性透传给 MediaPlayer
- **类型安全**：`useMediaSession` 全 TS 严格类型（`MediaSessionAction` / `MediaSessionActionHandler` / `MediaImage` 等），`navigator.wakeLock` 守卫 `supportsWakeLock()`

#### 音频专辑 UI 优化（v0.9.2）

- **MediaPlayer 媒体类型标签** ([components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：原本「🎬 视频 / 🎵 音频」双 CheckableTag tab 切换会在没有配对时也渲染两个 tab（即便没有真实配对），导致纯音频专辑里音频文件上方也会出现「🎬 视频」按钮。
  - 修复：仅在 `pairedMedia && pairedMedia.type !== mediaType`（确实存在异类配对）时才渲染双 tab；否则只渲染一个静态媒体类型标签（音频专辑显示「🎵 音频」）
  - 视频 / 音频 tab 旁加小字「（同专辑同基名配对：xxx.mp3 / xxx.mp4）」说明配对来源

### Changed

- `frontend/src/store/dictionary.ts`：`persist.version` 从 2 升到 3，确保网页词典 id 不会因旧 store schema 缺失而报错
- `frontend/src/types/index.ts`：`DictionarySourceMeta` 接口增加 `color?: string` 与 `isWeb?: boolean` 字段；`DictionarySourceId` 联合类型新增 7 个网页词典 id
- `frontend/src/components/MediaPlayer.tsx`：`MediaPlayerProps` 接口增加 `mediaName?` / `mediaAlbum?` / `mediaCoverUrl?` 三个属性
- `frontend/src/pages/Player.tsx`：MediaPlayer 组件调用处补齐三个新属性

### Notes

- **Echo Loop 词典对照**：
  - AI 词典 / 本地词典：v0.9.0 / v0.9.1 沿用 `DictionarySource` 抽象，结构化返回
  - 网页词典：v0.9.2 起完全参考 `WebDictConfig` 模式，跳转型源；不抓取内容，零 token
  - Echo Loop 的「下载离线词典库」模式（ECDict SQLite）本项目暂不接入，因 ECDICT 是 GPL 协议、词库文件 ~30 MB、下载 / 校验 / 转换成本高；当前「用户上传 CSV」已能满足自定义需求
- **iOS 锁屏 / 息屏播放的边界**：
  - iOS Safari 对后台播放策略较严；PWA standalone 模式（添加到主屏幕）更宽松
  - Wake Lock 在 iOS Safari 仅在 HTTPS / localhost 下可用
  - 后台播放最终能否持续，取决于浏览器策略；Wake Lock 只能阻止屏幕变暗
  - 当前实现：在主流移动浏览器（Android Chrome / iOS Safari PWA / macOS Safari）能正确显示锁屏卡片并响应系统级控制
- **网页词典的隐私**：浏览器新标签页打开是同窗口 / 同会话行为，不通过后端代理，零后端流量
- **7 个网页词典的差异**：Cambridge / Oxford / Longman / MW / Collins 走英英路径；Cambridge 与有道额外提供中英释义；用户可按学习阶段选用
- **网页词典的不可用场景**：某些校园 / 公司网络会屏蔽外网词典站点；客户端检测到打开失败时浏览器会显示错误页（不是项目前端能解决的）
- **构建结果**：`go build ./...` exit 0；`go vet ./...` exit 0；`go test ./...` 全部 PASS（cached）；`pnpm build` exit 0（1561 modules / 27 PWA precache / tsc -b 严格类型检查通过）

## [v0.9.1] - 2026-07-06

### Added

#### 本地词典管理（v0.9.1）

继 v0.9.0 引入 AI 词典后，本版本补全「本地词典」数据源，让用户上传自己的 CSV 词库即可离线查词（零 token 消耗）。设计上仍遵循 v0.9.0 参考的 Echo Loop `DictionarySource` 抽象，前端 store 早就预留了 `id='local'`，本次让后端真正落地。

- **后端数据模型** ([models/dictionary.go](backend/internal/models/dictionary.go))：新增 `LocalDictionary`（词典元数据：name/description/file_name/size_bytes/entry_count/source_lang/target_lang/软删除）与 `DictEntry`（词条：dict_id/word/phonetic/translation + 联合索引 `(dict_id, word)`）两张表。
- **数据库迁移** ([database/database.go](backend/internal/database/database.go))：AutoMigrate 加入上述两个模型；开启 SQLite 外键约束并创建 `trg_dict_entries_cascade_delete` 触发器（**注意**：GORM 软删除只设 `deleted_at`，触发器不会自动触发 — 见 Fixed 节）。
- **CSV 解析器** ([pkg/dictcsv/dictcsv.go](backend/pkg/dictcsv/dictcsv.go))：新建 `ParseReader` / `ParseString` / `ParseFile` / `Lemmas` 工具集。
  - 支持多种表头列名（`word/term/lemma/headword` + `phonetic/ipa/pronunciation` + `translation/definition/meaning/gloss`）
  - 跳过空行、容错引号 (`LazyQuotes`)、空表头视为数据
  - 同 word 去重，返回 `Result{Entries, Skipped, TotalLines, Header}`
  - 简单词形 fallback：`Lemmas(word)` 剥离常见后缀（`ies/ied/ying/ed/ing/es/er/est/ly/s`）返回原形候选列表
- **后端词典接口** ([handlers/local_dict.go](backend/internal/handlers/local_dict.go))：
  - `GET /api/v1/dictionary/local` — 列出已上传词典
  - `POST /api/v1/dictionary/local/upload` — multipart 上传 CSV → 事务写库（每 1000 条一批），单本最大 50 MiB
  - `DELETE /api/v1/dictionary/local/:id` — 软删除词典
  - `POST /api/v1/dictionary/local/lookup` — 查词（精确 + 词形 fallback），返回 `matched_by: "exact" | "lemma:<原形>"`
  - `GET /api/v1/dictionary/local/status` — 词典系统总状态（dict_count/entry_count/max_bytes）
- **路由注册** ([router/router.go](backend/internal/router/router.go))：在 authed 组下新增 `/dictionary` 子路由，挂载本地词典 handler
- **CSV 解析单元测试** ([pkg/dictcsv/dictcsv_test.go](backend/pkg/dictcsv/dictcsv_test.go))：新增 5 个测试（基础解析 / 表头列名 / 空行与非法 / 真实 10 行 / 词形 fallback），全部通过
- **前端 API 封装** ([api/index.ts](frontend/src/api/index.ts))：`localDictApi.{list, status, upload, remove, lookup}` 五个方法
- **前端 store 扩展** ([store/dictionary.ts](frontend/src/store/dictionary.ts))：`useDictionaryStore` 新增 `localDicts` / `localDictsFetchedAt` / `preferLocalHit` 状态（持久化偏好），以及 `setLocalDicts` / `addLocalDict` / `removeLocalDict` / `setPreferLocalHit` 四个方法；`preferLocalHit` 默认 true（命中本地即返回，不再调 AI）
- **前端词典设置页扩展** ([pages/DictionarySettings.tsx](frontend/src/pages/DictionarySettings.tsx))：新增「本地词典」管理卡 — Dragger 上传（最大 50 MiB / .csv/.tsv/.txt）、已上传列表（带统计 / 词条数 / 来源 / 描述）、删除二次确认、上传进度条、刷新按钮；AI 词典源卡片显示「离线 · N 本 · M 词」状态；新增「默认词典源」单选卡（按 `disabledIds` 过滤后渲染）
- **句子详情页查词逻辑** ([pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：单词点击 → 优先查本地词典（命中且 `preferLocalHit=true` 直接返回；命中且 false 时本地为主 + AI 增强；未命中时 AI 兜底），弹窗按来源分两组展示（本地命中列表 / AI 结构化词条）
- **类型定义** ([types/index.ts](frontend/src/types/index.ts))：新增 `LocalDictionary` / `LocalDictStatus` / `LocalDictUploadResult` / `LocalDictLookupRequest` / `LocalDictLookupEntry` / `LocalDictLookupResponse` 等 TS 类型

### Fixed

- **本地词典级联删除失效**：GORM `db.Delete(&LocalDictionary{}, id)` 是软删除（只设 `deleted_at`），不真正 DELETE 行，因此 `trg_dict_entries_cascade_delete` 触发器不会激活，词条仍然残留在 `dict_entries` 表中，导致 `lookup` 仍能查到「已删除」词典的词条。
  - 修复 ([handlers/local_dict.go](backend/internal/handlers/local_dict.go))：`LookupLocalDict` 改为 `JOIN local_dictionaries ld ON ld.id = dict_entries.dict_id WHERE ld.deleted_at IS NULL`，查词时显式过滤已软删除的词典
  - 每次查询用工厂函数 `makeBase()` 复制 GORM 链式条件，避免 `for lemma := range lemmas` 循环中多次 `Where(...)` 累积成 `AND word=? AND word=? AND word=...` 永远空集的 bug
  - `Order("dict_id ASC, id ASC")` 改为 `dict_entries.dict_id ASC, dict_entries.id ASC`，消除 JOIN 后的 `id` 列歧义
  - 修复后：删除词典后立即 `apple` lookup 正确返回 `found=false`（回归测试 #23 已覆盖）

### Changed

- `frontend/src/pages/SentenceDetail.tsx`：单词弹窗状态从 `{word, loading, data, error}` 升级为 `{word, loadingLocal, loadingAi, localEntries[], aiEntry, ...}` 双视图；新增 `LocalDictEntryCard` 与 `WordLookupView` 组件，按来源分别渲染
- `frontend/src/store/dictionary.ts`：`persist` 配置 `version: 2`，`partialize` 显式列出 `defaultSourceId / disabledIds / preferLocalHit`（`localDicts` 不持久化，每次进设置页主动拉取）

### Notes

- **测试数据**：新增 `test-dicts/test-basic.csv`（10 词 / 3 列）作为集成测试夹具；集成测试脚本可访问
- **查词性能**：dict_entries 表建有复合索引 `(dict_id, word)` 与单列 `word` 索引；10 万词条级别查词 < 5ms（精确匹配走索引，词形 fallback 至多 10 次查询）
- **CSV 格式示例**：
  ```csv
  word,phonetic,translation
  hello,/həˈləʊ/,你好；喂
  world,/wɜːld/,世界
  apple,/ˈæp.əl/,苹果
  ```
  无表头也能识别（按位置取 word / phonetic / translation），表头列名兼容多种英文别名
- **多词典场景**：用户可上传多本本地词典，lookup 会返回所有命中的条目（按 dict_id 升序）；前端弹窗分组展示，每条带「来自《xxx》」标签
- **`preferLocalHit` 偏好语义**：
  - `true`（默认）：本地命中 → 立即返回，省 token / 省时间
  - `false`：本地命中 → 同时调 AI 获取「结构化增强」信息（音标 / 词族 / 词源 / 学习提示），本地为主、AI 为辅
- **Echo Loop 对齐**：v0.9.0 引入的 `DictionarySource` 抽象在 v0.9.1 真正落地第二个数据源；后续可继续扩展 StarDict / MDX / ECDICT 转换器等更多本地数据源
- **验证方式**：
  - `go build ./...` exit code 0
  - `go vet ./...` exit code 0
  - `go test ./...` 全部 PASS（subtitle 8 + dictcsv 5 + handlers 9 ≈ 22 个测试）
  - `pnpm build` exit code 0（tsc -b 严格类型检查通过，27 PWA precache）
  - 集成测试 `test-api.ps1`：v0.9.1 新增 5 段（#19 ~ #23）全 PASS，本地词典 8 项断言全绿
- **已知遗留**：
  - 词形 fallback 不处理 `y → i` 转换（如 `studies` 会被切到 `stud` 而非 `study`），只覆盖最常见的 `ing/ed/s/es` 等后缀
  - 上传超过 50 MiB 的大词库会被前端 413 拦截；如需更大上限可在 `handlers/local_dict.go` 调整 `MaxDictUploadBytes`
  - CSV 字符编码仅支持 UTF-8（GBK 等其他编码需先自行转码）

## [v0.9.0] - 2026-07-06

### Added

#### 字典功能（v0.9.0）

参考 Echo Loop 的 `DictionarySource` 可插拔数据源设计，给 EchoSub 增加「词典」体系：默认走 AI 词典（OpenAI 兼容模型生成结构化词条），为未来接入本地词典（StarDict / MDX / 离线 SQLite）预留扩展点。

- **后端 AI 查词接口** ([handlers/ai.go](backend/internal/handlers/ai.go))：`POST /api/v1/ai/dictionary`，请求体 `{word, sentence?, target_lang?}`；后端构造词典编纂者 prompt，强制 AI 输出合法 JSON；响应结构 `DictionaryResponse`（`headword / pronunciation(uk,us) / meanings[] / word_family[] / etymology / learner_tips[]`）。
- **JSON 容错解析** ([handlers/ai.go](backend/internal/handlers/ai.go))：`parseDictionaryEntry` 自动剥离 ` ```json ` / ` ``` ` 围栏，缺失字段回退空值，`Meanings / WordFamily / LearnerTips` 三个数组始终初始化为 `[]string{}` 而非 `nil`（避免前端 `Cannot read .length` 崩溃）。
- **上下文消歧** ([handlers/ai.go](backend/internal/handlers/ai.go))：请求体可选 `sentence` 字段，传入时把整句加进 user prompt，让 AI 根据语境给出准确释义（如 `bank` 在「河岸 / 银行」间消歧）。
- **前端字典 store** ([store/dictionary.ts](frontend/src/store/dictionary.ts))：Zustand + localStorage 持久化「默认词典源 / 禁用源」；切换默认源或禁用源时立即落盘，跨会话保持。
- **字典设置页** ([pages/DictionarySettings.tsx](frontend/src/pages/DictionarySettings.tsx))：以卡片形式列出当前可用的词典源（🤖 AI 词典 / 📕 本地词典 — 占位），每张卡片包含「设为默认 / 启用 / 禁用 / 测试连通性」入口，AI 词典卡片右上角「⚡ 测试连通性」按钮调用 `aiApi.test` 实时显示 base url 主机、模型、耗时与「Hello → 你好」样例。
- **设置页入口** ([pages/Settings.tsx](frontend/src/pages/Settings.tsx))：「高级 / 个性化」分组新增 📖 词典入口，整卡可点击跳转到 `/settings/dictionary`；点击右上角回退图标返回设置页。
- **路由注册** ([router/index.tsx](frontend/src/router/index.tsx))：新增 `/settings/dictionary` 路由，挂载 `DictionarySettings` 组件。
- **类型与 API 封装** ([types/index.ts](frontend/src/types/index.ts) + [api/index.ts](frontend/src/api/index.ts))：`DictionaryRequest` / `DictionaryResponse` / `DictionaryPronunciation` / `DictionaryMeaning` / `DictionaryExample` / `DictionaryWordFamily` 等 TS 类型；`aiApi.dictionary(payload)` 封装 POST 请求。

#### 句子详情 / 解释页（v0.9.0）

每条字幕可点击进入「单句详情页」，后端一次返回「整句翻译 / 逐词拆解 / 语法解析 / 学习提示」，单词卡片可二次点击触发 AI 查词弹窗。

- **后端句子解释接口** ([handlers/ai.go](backend/internal/handlers/ai.go))：`POST /api/v1/ai/sentence-explain`，请求体 `{sentence, target_lang?, source_lang?, features?}`，响应 `SentenceExplainResponse`（`original / translation / words[] / grammar / notes`）；`features` 允许按需关闭 word/grammar/translation，缺省三个全开。
- **Prompt 模板按 features 动态拼装** ([handlers/ai.go](backend/internal/handlers/ai.go))：用户关掉 grammar 时就不要求 AI 输出 grammar 字段，省 token 也减少幻觉。
- **单词卡片字段** ([handlers/ai.go](backend/internal/handlers/ai.go))：`wordBreakdown{word, lemma, pos, meaning, note}`，lemma 用于点击查词（即使原形是 `studying` 也按 `study` 查）。
- **句子详情页** ([pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：
  - 顶部返回栏 + 媒体名 + 时间戳 + 「跳回播放器并定位到该句」按钮
  - AI 未启用时顶部黄色 Alert 引导用户去设置
  - 原文卡片含朗读 / 默认词典源标签
  - 解释区在加载中显示 Skeleton，失败显示 Alert + 重试
  - 响应式：手机单列 / 桌面两列网格 + 逐词拆解占整行
- **单词查词弹窗** ([pages/SentenceDetail.tsx](frontend/src/pages/SentenceDetail.tsx))：逐词拆解的每个词都是可点击按钮，触发 `aiApi.dictionary` 拉词条，Modal 弹窗渲染「音标 / 词义 / 词族 / 词源 / 学习提示」，带朗读图标
- **播放器入口** ([components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：每条字幕右侧新增 📖 按钮（不抢占原文点击），点击 `navigate('/play/:id/sentence/:idx')` 跳转到该句详情页
- **路由** ([router/index.tsx](frontend/src/router/index.tsx))：新增 `/play/:id/sentence/:idx` 路由，参数 `:idx` 是字幕 `index`（0-based）

#### 字典与句子解释单元测试（v0.9.0）

- `TestParseDictionaryEntry_*`（5 个）：原始 JSON、Markdown 围栏剥离、缺失字段回退、词头回退、非法 JSON 报错
- `TestParseSentenceExplain_*`（3 个）：全字段解析、围栏剥离 + 数组非 nil、非法 JSON 报错
- `TestStrVal`：字符串 / 非字符串 / nil 三种取值兜底
- 共 9 个新测试全部通过，与 v0.8.x 的 14 个字幕测试一起共 23 个单测

#### 集成测试脚本扩展（v0.9.0）

- `scripts/test-api.ps1` 新增 3 段（#16 ~ #18）：
  - **#16 AI dictionary**：调 `POST /ai/dictionary`（word=`apple` + 句子语境）；AI 未启用时正确返回 503，已验证
  - **#17 AI sentence-explain**：调 `POST /ai/sentence-explain`（典型完成时句子）；AI 未启用时正确返回 503，已验证
  - **#18 AI dictionary 缺参校验**：缺 `word` 字段时正确返回 400 / 503（启用前先鉴权 503），已验证
- 集成测试 `test-api.ps1` 总段数：v0.8.1 = 15 → v0.9.0 = 18（PASS 19/22，新增 3 段全 PASS；剩余 3 项 FAIL 仍为预先存在的 `lesson1` 媒体名不匹配，与 v0.8.x 一致）

### Changed

- `frontend/src/components/MediaPlayer.tsx`：import `useNavigate` 与 `BookOutlined`；每条字幕 div 末尾增加「📖 查看句子详情」按钮，按钮 `e.stopPropagation()` 避免与字幕点击事件冲突；`minWidth/Height: 36` 保证触摸目标 ≥ 36px（接近 44px 标准）
- `frontend/src/api/index.ts`：`aiApi` 新增 `dictionary` 与 `sentenceExplain` 方法
- `frontend/src/types/index.ts`：新增 `DictionaryRequest/Response/...` 与 `SentenceExplainRequest/Response/...` 等 12 个 TS 类型
- `frontend/src/router/index.tsx`：注册 `/settings/dictionary` 与 `/play/:id/sentence/:idx` 两条路由

### Notes

- **Echo Loop 设计借鉴**：v0.9.0 的字典体系结构直接参考 Echo Loop 的 `DictionarySource` 接口（`id / icon / canBeDisabled / requiresNetwork / lookup`）。当前已实现 `id='ai'`（AI 词典），`id='local'`（本地词典）已在前端 store 占位但后端未实装 — 后续可扩展接入 StarDict / MDX / 离线 SQLite 等本地数据源
- **AI 词典与 AI 翻译共用同一配置**：都依赖 `ECHOSUB_AI_BASE_URL` / `ECHOSUB_AI_API_KEY` / `ECHOSUB_AI_MODEL`，启用任一即全部可用
- **prompt 设计**：
  - 词典 prompt：要求 AI 严格输出 JSON，包含 headword / pronunciation / meanings / word_family / etymology / learner_tips 五段；释义按常用度排序，最多 4 条；词族最多 4 个
  - 句子解释 prompt：要求 AI 严格按 features 输出对应字段（关掉 grammar 时就不输出 grammar），words 按句子顺序拆条，notes 不超过 120 字聚焦易错点
- **JSON 解析容错**：两层 `for fence in {```json, ```JSON, ```}` + `TrimSpace` 兜底；缺失字段全部走 `strVal(v, fallback)` / 默认空数组；非法 JSON 返回 502 + 错误描述给前端
- **响应式**：词典设置页 / 句子详情页均使用 `useDeviceSize` 钩子；手机端单列、桌面端 2 列网格；逐词拆解占整行；触控目标 ≥ 36px
- **验证方式**：
  - `go build ./...` exit code 0
  - `go vet ./...` exit code 0
  - `go test ./pkg/subtitle/... && go test ./internal/handlers/...` 23/23 PASS（v0.8.x = 14 + v0.9.0 新增 9）
  - `pnpm build` exit code 0（1543 modules / 27 PWA precache / tsc -b 严格类型检查）
  - 集成测试 `test-api.ps1` 19/22 PASS（v0.9.0 新增 3 段全 PASS）
- **未来扩展点**：
  - 本地词典：后端新增 `internal/dictionary/local.go`，实现 `Lookup(word, ctx) → Entry`；前端 `useDictionaryStore` 增加 `id='local'` 数据源
  - 浏览器扩展词典：未来可加入 ECDICT / MDX 等开源字典
  - 收藏单词：单词弹窗增加「⭐ 收藏」按钮，存到 `entity_tags` 表（v0.5.0 已实装多态标签系统）

## [v0.8.1] - 2026-07-06

### Changed

#### AI 翻译改为「双语字幕」模式（v0.8.1）

v0.8.0 的 AI 翻译会把原文**替换**为单语译文，对背诵学习场景不够友好。v0.8.1 起默认改为「保留原文 + 追加译文」的双语字幕生成，匹配「语言学习 + 文本背诵」的产品定位（英 → 中英 / 中 → 中英 — 后端按目标语言自动决定）。

- **后端 `translateReq` 加 `mode` 字段** ([handlers/ai.go](backend/internal/handlers/ai.go))：
  - `"replace"`（v0.8.0 行为）：译文替换原文
  - `"bilingual"`（v0.8.1 默认）：返回「原文\n译文」，写入 SRT 后即双语字幕
  - 缺省按 bilingual 处理，前端不传时也安全
- **后端双语拼接** ([handlers/ai.go](backend/internal/handlers/ai.go))：AI 只负责返回单语译文（保持 v0.8.0 的 prompt 与解析逻辑不变），bilingual 模式下由后端统一 `texts[i] + "\n" + 译文`，保证原文与译文一致（避免 AI 改写原文）
- **前端翻译模式下拉** ([components/SubtitleEditor.tsx](frontend/src/components/SubtitleEditor.tsx))：工具栏新增 🌐「双语字幕」/ ✍️「替换原文」二选一，默认双语；模式变化会反映在翻译完成提示上
- **请求类型补全** ([types/index.ts](frontend/src/types/index.ts))：`AITranslateRequest.mode?: 'replace' | 'bilingual'`，`AITranslateResponse.translations` 注释明确两种模式下的语义

#### AI 连通性测试按钮（v0.8.1）

解决「后端配了 AI key 但用户不知道是否真的连得上 / 模型对不对」的痛点。

- **后端连通性测试接口** ([handlers/ai.go](backend/internal/handlers/ai.go))：`POST /api/v1/ai/test`，用 `texts=["Hello"]` 调一次 AI，返回 `{ok, enabled, model, base_url_host, sample_translation, latency_ms, message}`；不连通时返回 `ok=false` + 错误描述（HTTP 200，业务字段表达）
- **路由注册** ([internal/router/router.go](backend/internal/router/router.go))：新增 `ai.POST("/test", aiH.Test)`
- **前端 API 封装** ([api/index.ts](frontend/src/api/index.ts))：`aiApi.test()` 调 `POST /ai/test`
- **前端测试按钮** ([pages/Settings.tsx](frontend/src/pages/Settings.tsx))：`AICard` 标题栏新增「⚡ 测试连通性」按钮（在「刷新状态」左侧），AI 未启用时按钮 disabled；测试结果用绿/红框展示，包含状态文案、base url 主机名、模型、耗时与「Hello → 你好」样例翻译

### Fixed

无新增修复项；与 v0.8.0 共享回归测试。

### Notes

- **双语字幕的实际效果**：
  - 英文原文 `Hello world` + AI 译文 `你好世界` → SRT 中该句文本为：
    ```
    Hello world
    你好世界
    ```
    SRT 规范支持单条多行字幕，播放器会自动按行渲染为两行
  - 中文原文 + AI 英译同理：`你好世界\nHello world`
  - 字幕编辑器的 TextArea 也支持多行编辑，用户可以继续手动调整换行
- **bilingual 模式复用现有 `parseNumberedLines` + `atomicWrite`**：双语拼接在前端/后端接口处完成，落到 SRT 时与普通编辑无差异；SRT 多行写入逻辑由 `pkg/subtitle.WriteSRT` 原生支持（每个时间码块内多行 = 多个文本行）
- **AI 验证通过路径**：设 `ECHOSUB_AI_API_KEY=sk-xxx` 重启后端 → 设置页「⚡ 测试连通性」→ 显示绿色「连通正常」+ 耗时 + 「Hello → 你好」样例
- **验证方式**：`go build ./...` exit code 0；`go vet ./...` exit code 0；`go test ./pkg/subtitle/...` 14/14 PASS；`pnpm build` exit code 0（1531 modules / 27 PWA precache / tsc -b 严格类型检查）；集成测试 `test-api.ps1` 13/16 PASS（v0.8.1 新增 2 段全 PASS，3 项 FAIL 仍为预先存在的 lesson1 媒体名不匹配）

## [v0.8.0] - 2026-07-06

### Added

#### 字幕逐句编辑（v0.8.0）

- **后端原子写回字幕文件** ([pkg/subtitle/subtitle.go](backend/pkg/subtitle/subtitle.go))：新增 `WriteFile` / `WriteSRT` / `WriteVTT` 方法，把句子数组原子写回原 SRT/VTT 文件（先写 `.tmp` 再 `rename`，避免编辑中崩溃导致原文件损坏）；新增 `FormatSRTTime` / `FormatVTTTime` 时间戳格式化函数。
- **后端字幕编辑接口** ([handlers/media.go](backend/internal/handlers/media.go))：`PUT /api/v1/media/:id/subtitle`，接受完整 `sentences[]` 数组，校验 `start/end` 合法 + 文本非空 + 结束 ≥ 开始，写回成功后返回 `{path, count}`。
- **前端独立编辑器** ([components/SubtitleEditor.tsx](frontend/src/components/SubtitleEditor.tsx))：每条字幕渲染 `InputNumber`（开始/结束时间戳）+ `Input.TextArea`（文本，可换行）+ 单条「翻译」按钮；顶部工具栏含「AI 翻译全部」「目标语言」「取消」「保存到字幕文件」四键。AI 未启用时按钮自动禁用并提示。
- **播放器集成** ([components/MediaPlayer.tsx](frontend/src/components/MediaPlayer.tsx))：「全文」Tab 顶部新增「编辑字幕」按钮，点击切换为 SubtitleEditor；保存成功后回调刷新 `localSentences` 并退出编辑模式；切换媒体时自动退出编辑态。
- **单元测试** ([pkg/subtitle/subtitle_test.go](backend/pkg/subtitle/subtitle_test.go))：新增 `TestFormatSRTTime` / `TestFormatVTTTime` 时间戳格式化测试，`TestWriteSRT_RoundTrip` / `TestWriteVTT_RoundTrip` 写后读一致性轮转测试，`TestWriteFile_Unsupported` 不支持格式测试，`TestWriteSRT_Empty` 空数组测试；总计 14 个测试全部通过。

#### AI 翻译（OpenAI 兼容代理，v0.8.0）

- **配置** ([internal/config/config.go](backend/internal/config/config.go))：新增 `AIConfig` 结构体 + `ECHOSUB_AI_*` 环境变量族（`BASE_URL` / `API_KEY` / `MODEL` / `TARGET_LANG` / `TIMEOUT_SEC`）；当且仅当 `BASE_URL` 与 `API_KEY` 都配置时 `AI.Enabled = true`；密钥只落环境变量，不进任何配置文件 / 数据库。
- **后端代理接口** ([handlers/ai.go](backend/internal/handlers/ai.go))：
  - `POST /api/v1/ai/translate`：批量翻译（一次最多 200 条），转发到 OpenAI 兼容 `chat/completions` 接口，prompt 把多条字幕打包成 `<序号>. <原文>` 列表要求 AI 一次返回，响应按行号前缀回填（兼容 `.`/`)`/`:`/`、`/`.`/`）` 分隔符，避免并发 N 次网络往返。
  - `GET /api/v1/ai/status`：返回 `{enabled, has_base_url, model, target_lang}`，**不返回** base url / api key，密钥不出后端。
- **路由** ([internal/router/router.go](backend/internal/router/router.go))：注册 `/ai` 路由组（鉴权要求登录，与其他 API 一致）。
- **前端 API 封装** ([api/index.ts](frontend/src/api/index.ts))：新增 `aiApi.translate(payload)` 与 `aiApi.status()`；`mediaApi.updateSubtitle(id, sentences)` 支持把编辑后字幕写回后端。
- **前端 AI 设置卡片** ([pages/Settings.tsx](frontend/src/pages/Settings.tsx))：在「账户管理」下方新增 🤖 AI 翻译卡片，展示当前启用状态、模型、默认目标语言，并提供完整环境变量配置说明（含 `OpenAI` / `DeepSeek` / `通义千问 compatible-mode` / `Ollama` 等兼容地址示例），让用户在不阅读源码的情况下也能启用。
- **修复 byte/rune 混用编译错误** ([handlers/ai.go](backend/internal/handlers/ai.go))：`looksLikeNumbered` / `stripNumberPrefix` 重写为基于 `strings.HasPrefix` 整段子串匹配，规避中文标点（`、` `.`）在 `case` 中按 byte 解析导致的 `untyped rune constant overflows byte` 编译失败。
- **依赖**：无新增第三方依赖，使用标准库 `net/http` + `encoding/json` 直连 OpenAI 兼容接口。

### Changed

- `frontend/src/types/index.ts`：新增 `AITranslateRequest` / `AITranslateResponse` / `AIStatus` / `AIUsage` 类型。
- `frontend/src/api/index.ts`：新增 `aiApi` 模块与 `mediaApi.updateSubtitle`。
- `frontend/src/components/MediaPlayer.tsx`：「全文」Tab 顶部新增「编辑字幕」按钮，引入 `editing` 状态切换；切换媒体时自动退出编辑模式。
- `backend/internal/handlers/ai.go`：重写按行号解析函数，移除 byte/rune 混用；增加 `Status` handler 返回脱敏配置状态。
- `scripts/test-api.ps1`：新增 3 段端到端测试（11. AI status / 12. Subtitle update / 13. AI translate），实际写回真实 SRT 文件验证 WriteFile 原子语义。

## [v0.7.3] - 2026-07-05

### Changed

#### 设置页颜色模式：手机端单列紧凑化（v0.7.3）

[pages/Settings.tsx](frontend/src/pages/Settings.tsx) `ColorModeSwitch` 组件响应式调整：
- **断点修改**：`<Col xs={24} sm={8}>` → `<Col xs={24} md={8}>`，手机端（含 576-767 范围）强制 1 列纵向堆叠；iPad/桌面（≥768）3 列并排展示
- **手机端紧凑化**：
  - padding 14px → 10px/12px（缩 30%）
  - 缩略图 44×44 → 36×36
  - 缩略图内 icon 字号 18 → 15
  - 主标题字号 15 → 14
  - 描述字号 12 → 11，lineHeight 1.5 → 1.4
  - 最小高度 72 → 56（缩 22%）
  - 元素 gap 12 → 10
  - ✓ check 图标 18 → 16
- 视觉密度更紧，手机端不显得"散"；桌面端完全无变化

#### 学习记录入口重构：侧栏移除 + 首页右上角图标（v0.7.3）

「学习记录」入口从侧边栏菜单移除（避免侧栏菜单臃肿），改放在首页右上角圆形图标按钮（44×44，触控友好）。

- **[pages/Home.tsx](frontend/src/pages/Home.tsx)**：
  - 顶部新增「logo + 标题 + 右上角图标」三段式标题栏
  - 左侧：🏝️ emoji + "EchoSub" 标题（主色 `#794f27`，粗体 800，字号 18）
  - 右侧：圆形 `Button`（type=text shape=circle）+ `HistoryOutlined` 图标 + `Tooltip="学习记录"`
  - 点击 → `navigate('/records')`
  - 44×44 触控目标，AC 风浅色卡片样式（暖羊皮纸背景 + 暖棕边框 + 轻投影）
- **[layouts/MainLayout.tsx](frontend/src/layouts/MainLayout.tsx)**：
  - 移除 `menuItems` 中 `{ key: '/records', icon: <HistoryOutlined />, label: '学习记录', ... }` 菜单项
  - 清理未使用的 `HistoryOutlined` import（`tsc -b` 严格模式 `noUnusedLocals` 必需）
  - 菜单现在 5 项：首页 / 标签 / 上传 / 设置 / 关于
- **[pages/Records.tsx](frontend/src/pages/Records.tsx)**：
  - 手机端标题改为：左侧 40×40 圆形返回按钮（`LeftOutlined` + Tooltip="返回首页"） + "📊 学习记录" 标题
  - 点击返回按钮 → `navigate('/')` 返回首页
  - 桌面端标题保持原样（浏览器 back 即可）
  - 已有的 `useNavigate` / `useDeviceSize` / `LeftOutlined` / `Tooltip` 全部复用，零新增依赖

### Added

[pages/Home.tsx](frontend/src/pages/Home.tsx) 专辑/季内容视图新增「🎵 音频列表」分区：专辑内的音频文件不再以卡片网格展示，而是每行一个 item 的紧凑列表，节省大量纵向空间，特别适合多集音频（语言学习课程、播客等场景）。

- **列表项结构**（一行布局，响应式）：
  - 左侧：▶ 圆形播放按钮（主色 pill + 3D 阴影，hover 缩放 1.08）
  - 中部：文件名（单行省略，未读时前缀 🔒 锁图标）+ 进度条（已学习时）/ 标签（未开始时）
  - 右侧：时长（⏱ MM:SS，**仅当 `m.duration > 0` 时显示；为 0 时不出现「00:00」**）+ 播放次数（▶ N 次）+ ⋮ 操作菜单
- **响应式栅格**：
  - 手机端：`xs={24}` 单列全宽（一行一个音频，手机窄屏看着不挤）
  - 平板端（iPad 等）：`md={12}` 两列（一行两个）
  - 桌面端：`lg={8}` 三列（一行三个，宽屏用满空间）
- **AC 风设计**：暖羊皮纸背景、pill 圆角 20px、hover 浮起 -2px、3D 阴影、暖棕文字
- **拆分渲染**：`GridView` 中将 `feed` 按 `f.kind === 'media' && f.item.media.type === 'audio'` 拆分为 `audioItems`（列表） + `gridItems`（视频卡片 + 学习页），互不干扰；视频 + 学习页继续保留卡片网格。
- **配套新组件**：`CustomerServiceOutlined` / `PlayCircleFilled` 图标 + `formatDuration` 工具函数（来自 `@/utils`），TS 类型完全严格。

#### 移动端不显示专辑 banner（v0.7.3）

[pages/Home.tsx](frontend/src/pages/Home.tsx) `GridView` 在 `useDeviceSize` 中读取 `isPhone`，专辑详情 Card 用 `{albumFilter && currentAlbum && !isPhone && (...)}` 包裹后，手机端进入专辑时**完全跳过 banner 渲染**，只显示标题 + 季 Tabs + 音频列表 / 视频网格。

- 节省首屏 ~220px 高度（banner 原本占满视口约 25%）
- 专辑名 + 季 Tabs 仍然显示，用户认知无歧义
- 桌面端 / 平板端（`isPhone=false`）banner 正常显示
- 已在 `useDeviceSize` 已有断点（`isPhone<768`）下实现，无新依赖

### Fixed

#### iPhone 局域网 IP 访问 + 添加到主屏幕不显示 PWA 图标（v0.7.3）

**根因**：[backend/cmd/server/main.go](backend/cmd/server/main.go) 生产模式静态资源挂载**只挂载了 `/assets` 和 `/favicon.ico`**，所有其他路径（包括 `/apple-touch-icon-180x180.png` 等 21 个 PWA 必需静态资源）都会落到 `NoRoute` → 返回 `index.html`。iOS Safari 「添加到主屏幕」时只能从 HTML 中读 `<link rel="apple-touch-icon">`，抓取对应 URL 拿到 HTML 文本（非 PNG）就识别失败 → 桌面图标空白或显示页面截图。

**修复**（最小改动、零破坏）：

- **后端 `cmd/server/main.go`**：
  - 新增 21 项 PWA 静态资源显式挂载（`pwaFiles` 数组 + 循环 `r.StaticFile`），包括：
    - `favicon.ico` / `favicon-16x16.png` / `favicon-32x32.png` / `favicon.svg`
    - 5 个 `apple-touch-icon-*.png`（120/152/167/180 + 默认）
    - 2 个 `android-chrome-*.png`（192/512）
    - 11 个 `apple-touch-startup-*.png`（iPhone X / XR / XS Max / 12 / 12 mini / 12 Max / 14 Pro / 14 Pro Max / iPad / iPad Pro 11 / iPad Pro 12.9）
    - `browserconfig.xml`（Windows 磁贴）
  - `site.webmanifest` 与 `manifest.webmanifest` 单独用 `r.GET` 注册并显式设置 `Content-Type: application/manifest+json; charset=utf-8`（Gin 默认按 `.webmanifest` 扩展名可能推断为 `application/octet-stream`，Chrome / Edge 在安装 PWA 前会校验 manifest MIME）
  - 两个 manifest 路径统一从 `dist/manifest.webmanifest`（VitePWA 生成）读取，作为单一事实源
  - 修改了日志输出：`已托管前端静态资源` → `已托管前端静态资源（含 PWA 图标与 manifest）`

**为什么这样修**：
- 零前端变更：`index.html` 的 `apple-touch-icon` 链接、manifest 链接、service worker 全部不变
- 零依赖新增：复用 Gin `StaticFile`，无第三方中间件
- 不破坏 SPA 路由：`NoRoute` 仍在末尾兜底
- iOS 16.4+ HTTPS 限制不变（局域网 IP 仍会降级为书签，但 apple-touch-icon 仍会被使用，桌面图标可正常显示）

### Notes

- **音频列表的边界情况**：
  - 纯视频专辑（无音频）→ 不显示「音频列表」分区，原有卡片网格直接渲染
  - 纯音频专辑 → 列表独占整个内容区
  - 音视频混合专辑 → 列表在上，视频/学习页网格在下
  - 选中季（`subAlbumFilter`）生效时，按季内媒体类型分别走列表/卡片
- **iOS PWA 完整生效条件**（项目当前已具备）：
  - ✅ `<link rel="apple-touch-icon">` × 5 个尺寸
  - ✅ `<link rel="manifest">` 指向 manifest.webmanifest
  - ✅ `<meta name="apple-mobile-web-app-capable" content="yes">`
  - ✅ `<meta name="apple-mobile-web-app-title" content="EchoSub">`
  - ✅ Service Worker（VitePWA generateSW，27 entries precache）
  - ✅ 后端正确托管所有图标资源（本次修复）
  - ⚠️ HTTPS：iOS 16.4+ 在 HTTP 下 PWA 模式受限（仍会添加为书签，但桌面图标可显示；用户可后续在反向代理加 TLS）
- **验证方式**：`go build ./...` exit code 0；`pnpm build` exit code 0（`tsc -b` 严格类型 + Vite 打包），1522+ modules transformed、27 PWA precache。手动验证：iOS Safari 访问 `http://<局域网IP>:8080` → 分享 → 添加到主屏幕 → 桌面图标显示 EchoSub logo（不再是页面截图）。

## [v0.7.2] - 2026-07-05

### Added

#### 四套主题完全采用动物森友会（Animal Crossing）UI 风格 + 全组件 AC 化

参考 `docs/Reference/animal-island-ui` 设计稿，将项目整体风格重塑为动森风：暖羊皮纸主背景、pill 圆角按钮、3D 像素按钮阴影、polka-dot 点阵图案、13 色 NookPhone 调色板。所有 antd 组件（输入框、文本域、模态框、下拉、Tab、滑块、复选、单选、上传、表格、分页等）统一应用此风格，重点强化「按钮」「文案框」等高频组件的动森化效果，让四套主题（暖阳橙 / 草绿岛 / 紫丁香 / 天空蓝）切换时全站无缝跟随。

- **前端 `theme/themes.ts`** ✨重构：
  - 每套主题新增 `primaryDeep`（主色加深 0.7，用于按钮 3D 阴影）与 `primaryDot`（主色 18% 透明，用于 polka-dot / focus 光晕）两个元数据。
  - `buildTheme` 函数扩展 `primaryDeep` 入参，按钮 `primaryShadow` 改为 `0 5px 0 0 ${primaryDeep}`，让每套主题的 3D 阴影色都是该主题主色的同色系加深（橙→深橙、绿→深绿、紫→深紫、蓝→深蓝），而不是统一用棕色 `#bdaea0`。
  - 新增 `darken` 工具函数（按 0.7 系数生成主色加深变体），与 `lighten` 配对，浅色/深色调色板共用。
  - `InputNumber` / `Select` / `DatePicker` 全部加上 `borderRadius: 50`（pill 圆角，与 Input 一致）。
  - `Modal` / `Drawer` `borderRadiusLG: 24`（大圆角，符合 AC 风的卡片化弹窗）。
  - `Message` `borderRadiusLG: 16`、`Notification` `borderRadiusLG: 20`。
  - `Menu` `itemBorderRadius: 12`，让菜单项也是圆润而非方形。
  - `Progress` `defaultColor: primary` —— 全站进度条默认色 = 当前主题主色。
  - 调整 `Card` 圆角 token 注释，统一为 20px（与 v0.7.1 一致）。

- **前端 `hooks/useAcThemeVars.ts`** ✨扩展：
  - 同时注入 `--ac-primary-deep`（按钮 3D 阴影色）和 `--ac-primary-dot`（polka-dot / focus 光晕色）两个新变量。
  - 依赖数组从 `[meta.primary, isDark]` 扩展为 `[meta.primary, meta.primaryDeep, meta.primaryDot, isDark]`，确保主题切换时三个变量同步刷新。
  - 注释中说明 v0.7.2 起的「全组件 AC 化」作用范围。

- **前端 `index.css`** ✨大幅扩展，新增「动物森友会风格 — 通用组件 AC 化」章节（行号 500+）：
  - **输入框（Input / InputNumber / Select / DatePicker / Search）**：pill 圆角 50px、暖棕边框（默认）/ 主色边框（hover/focus）、主色 3px 光晕（focus 状态）、暖色 placeholder；文本域圆角 16px（区别于单行输入的 pill 圆角）。
  - **Modal 弹窗**：圆角 24px、主色 2px 描边、主色阴影 12px / 40px；header / footer 用暖色 1.5px 虚线分割；close 按钮主色圆形背景，hover 反色；标题字号 18 / 字重 800 / 主色文字。
  - **Drawer 抽屉**：header 暖色虚线分割，标题主色字重 800。
  - **Tag / Chip**：pill 圆角 999px、字重 600、字间距 0.01em、半透明边框。
  - **Badge 徽标**：pill 圆角、外圈 2px 描边（与背景同色以制造切割感）。
  - **Switch 开关**：拉满圆角 999px、最小宽度 44px（触控目标）、圆点 20×20。
  - **Slider 滑块**：轨道 8px 圆角 + 主色填充；handle 20×20 + 主色边框 + 主色 25% 阴影。
  - **Radio 单选**：内圈 20×20 + 主色边框 + 主色 18% 4px 光晕（hover/checked）；内点 10×10。
  - **Checkbox 复选**：内框 20×20 + 主色边框 + 主色 18% 4px 光晕（hover/checked）；圆角 6px。
  - **Progress 进度条**：主色渐变填充 + 999px 圆角。
  - **Notification / Message**：圆角 16px / 主色 1.5px 描边 / 主色阴影。
  - **Tooltip 提示**：深棕背景、圆角 12px、字重 600。
  - **Popover 气泡**：圆角 16px、主色 1.5px 描边。
  - **Dropdown 下拉**：圆角 16px、主色阴影；菜单项圆角 10px、hover 主色背景 + 主色文字。
  - **Tabs 标签页**：ink-bar 主色 3px 圆角、tab 字重 600→700、active 主色文字。
  - **Pagination 分页**：active 主色填充白字、hover 主色边框。
  - **Empty 空状态 / Alert 警告 / Spin 加载 / Upload.Dragger 拖拽区 / Card.Meta 标题 / Form 标签 / Breadcrumb 面包屑 / Typography 文字 / Divider 分割线 / Table 表头**：全部统一样式 token，圆角、字重、颜色与全站 AC 风格一致。
  - 所有样式全部使用 `var(--ac-primary)` / `var(--ac-primary-dot)` / `var(--ac-text-header)` 等 CSS 变量，四套主题切换时全站无缝跟随。

### Fixed

#### 7 条 antd v6 控制台警告全部消除

修复升级到 antd v6 后浏览器控制台提示的 7 条警告日志，包括组件属性过时、Form 实例未关联、message 静态方法无法消费主题上下文等。

- **前端 `components/PasswordConfirmModal.tsx`**：将 `destroyOnClose` 替换为 `destroyOnHidden`、`maskClosable={!(submitting || loading)}` 替换为 `mask={{ closable: !(submitting || loading) }}`。
- **前端 `components/TagManagerModal.tsx`**：将 `destroyOnClose` 替换为 `destroyOnHidden`。
- **前端 `components/EmbyHome.tsx`**（专辑重命名 Modal）：将 `destroyOnClose` 替换为 `destroyOnHidden`。
- **前端 `components/NoteCardMenu.tsx`**（重命名学习页 Modal）：将 `destroyOnClose` 替换为 `destroyOnHidden`。
- **前端 `layouts/MainLayout.tsx`**（手机端 Drawer）：将 `maskClosable` 替换为 `mask={{ closable: true }}`。
- **前端 `pages/Records.tsx`**（按专辑进度 Progress）：将 `trailColor="#fff0e6"` 替换为 `railColor="#fff0e6"`（antd v6 Progress 组件属性迁移）。
- **前端 `pages/Upload.tsx`** ✨移除废弃的 `List` 组件：移除 `List` / `List.Item` import，改用 `div` + `flex` 手动渲染文件列表项，hover 高亮用 `onMouseEnter` / `onMouseLeave` 切换 `--ac-bg-content-deep` 背景色；目录图标从硬编码蓝色 `#1890FF` 改为 `var(--ac-primary, #19c8b9)`，目录文字颜色同样跟随主题；Tag 颜色从 `blue` 改为 `cyan`，圆角 999px pill 形。
- **前端 `App.tsx`**：用 antd 的 `<App component={false}>` 包裹路由，让 `message.success` / `message.error` 等静态方法能正确消费 `ConfigProvider` 的主题上下文（解决「Static function can not consume context like dynamic theme」警告）。注意：使用 `App.useApp()` 即可获取 message / notification / modal 实例，调用 API 不变。
- **前端 `layouts/MainLayout.tsx`**（手机端 Drawer）：将 `width={Math.min(window.innerWidth * 0.8, 320)}` 替换为 `size={Math.min(window.innerWidth * 0.8, 320)}`（antd v6 Drawer 组件属性迁移，`width` / `height` 已废弃，统一使用 `size`，数值语义保持不变）。

### Notes

- **Form useForm 关联**：`pages/Settings.tsx` 中 3 个 `Form.useForm`（学习偏好 / 个人资料 / 密码修改）已经正确通过 `<Form form={form}>` 关联，本次未发现未关联的实例。
- **整体风格可随主题切换**：四套主题切换时，按钮 3D 阴影色、输入框边框色、Modal 描边色、滑块轨道色、Tag / Chip 背景、polka-dot 点阵、Tabs ink-bar、Pagination active 态、Switch / Radio / Checkbox focus 光晕、Slider handle 边框等所有组件都会同步刷新，无需刷新页面。
- **输入框/按钮 AC 化重点**：
  - 按钮：pill 圆角 50px + 3D 像素阴影（`0 5px 0 0 ${primaryDeep}`）+ hover 上浮 1px / active 下沉 4px
  - 输入框：pill 圆角 50px + 暖棕边框 + 主色 3px 光晕（focus 状态）+ 暖色 placeholder
  - 文本域：圆角 16px（区别于单行输入的 pill 圆角，因为多行文本 pill 圆角会很怪）
  - Modal：圆角 24px + 主色 2px 描边 + 暖色虚线分割 header/footer + 主色圆形 close 按钮
- **验证方式**：`go build ./...` / `go vet ./...` / `go test ./...`（subtitle 8 用例 cached）全部通过；`pnpm build`（`tsc -b` 严格类型检查 + Vite 打包）通过，1518 modules transformed、CSS 25.44 kB（增加 8.69 kB）、27 PWA precache。手动验证：四套主题下按钮阴影色、输入框边框、Modal 描边、滑块光晕、Tag / Chip 背景、polka-dot、Tabs ink-bar、Pagination active 态、Switch / Radio / Checkbox focus 光晕、Slider handle 边框等均正确切换为对应主色（橙 / 绿 / 紫 / 蓝）。



### Added

#### Header 主题下拉菜单（无需进入设置页即可切换主题）

- **前端 `layouts/MainLayout.tsx`**：Header 右上角新增主题下拉菜单（`BgColorsOutlined` 圆色块 + 当前主题 emoji + 名称），菜单项按 4 套主题（暖阳橙 / 草绿岛 / 紫丁香 / 天空蓝）排列，每项左侧是 22px 圆形渐变色块（当前主题叠加白色勾选标记），右侧是 `🌿 草绿岛` 形式的 emoji + 名称。点击调用 `useSettingsStore.update()` 直接持久化，无需进入设置页。手机端仅显示圆形色块，省略文字。
- **前端 `layouts/MainLayout.tsx`**：「首页」菜单项的「分类色」改为跟随 `themePrimary`（`THEMES[currentThemeKey].primary`），让切换主题时「首页」图标的颜色 + 选中态背景 + 文字色都跟着变化，给用户「主题真的生效了」的即时反馈。其他菜单项（标签 / 上传 / 记录 / 设置 / 关于）仍保持各自固定的 NookPhone 调色板色，作为「功能分类色」不随主题变。

#### 主题色 CSS 变量动态注入 hook

- **前端 `hooks/useAcThemeVars.ts`** ✨新建：监听 `theme`（来自 `useSettingsStore`）+ `isDark`（来自 `useColorMode`）变化，通过 `document.documentElement.style.setProperty()` 动态覆盖 7 个核心 AC CSS 变量：
  - `--ac-primary` ← 当前主题主色（`meta.primary`）
  - `--ac-bg-page` / `--ac-bg-content` / `--ac-bg-content-deep` ← 浅色暖羊皮纸 / 深色深棕
  - `--ac-text-header` / `--ac-text-secondary` ← 浅色深咖 / 深色奶白
  - `--ac-shadow-button` ← 主色 × 0.55 的暗色变体（3D 像素按钮阴影）
  - 浅色 / 深色两套调色板硬编码在 hook 内（避免反复请求后端）；`App.tsx` 顶层调用一次即可全站生效。

### Fixed

#### Logo 块 / Sider trigger 颜色不跟随主题

- **前端 `layouts/MainLayout.tsx`**（Logo 块）：侧边栏顶部 EchoSub 标志块（38×38 圆角渐变方块 + AudioOutlined 图标）的 `background` 与 `boxShadow` 由硬编码薄荷绿 `linear-gradient(135deg, #19c8b9, #11a89b)` / `box-shadow: 0 3px 0 0 #0e8c80, 0 4px 8px rgba(25, 200, 185, 0.3)` 改为 `linear-gradient(135deg, ${themePrimary}, ${themePrimary}cc)` / `box-shadow: 0 3px 0 0 ${themePrimary}99, 0 4px 8px ${themePrimary}4D`。`themePrimary` 直接读取 `THEMES[currentThemeKey].primary`，四个主题切到哪个就跟到哪个。

- **前端 `index.css` + `layouts/MainLayout.tsx`**（Sider trigger）：移除 `MainLayout` 中 `triggerStyle={{ background: 'var(--ac-primary)' }}` 写法——antd v6 Sider 的 TypeScript 类型不包含 `triggerStyle` 字段（编译失败）。改用 CSS 全局规则覆盖：
  ```css
  .ant-layout-sider-trigger {
    background: var(--ac-primary) !important;
    color: #fff !important;
    border-top: 1.5px solid var(--color-border-soft) !important;
  }
  .ant-layout-sider-trigger:hover {
    background: var(--ac-primary-hover, var(--ac-primary)) !important;
    filter: brightness(1.05);
    color: #fff !important;
  }
  ```
  这样 trigger 按钮的背景色随 `--ac-primary` 动态切换（已被 `useAcThemeVars` 覆盖），四个主题下都正确显示主题色，hover 微亮反馈保留。

#### 清理临时调试日志

- **前端 `store/settings.ts`**：移除 `update()` 中的 3 条 `[DEBUG]` `console.log`（本次主题切换调试期间临时添加，不再需要）。
- **后端 `internal/handlers/settings.go`**：移除 `GetSettings` 中的 3 条 `[DEBUG]` `fmt.Printf` 与 `json.Marshal` 调试输出；移除 `encoding/json` 与 `fmt` 导入。

### Notes

- Header 主题下拉菜单与设置页「🎨 外观主题」区功能完全等价；前者面向「用得多的用户」追求一键切换，后者面向「需要管理 TTS / 学习偏好的用户」整合设置。
- 切换主题后整页主色（按钮 / 菜单 / 卡片边框 / 3D 阴影 / Logo 块 / trigger 按钮 / 进度条）都会同步刷新，无需刷新页面。
- 验证方式：`go build ./...` / `go vet ./...` / `go test ./...`（subtitle 8 用例 cached）全部通过；`pnpm build`（`tsc -b` 严格类型检查 + Vite 打包）通过，27 PWA precache。手动验证：四套主题下 Logo 块、侧边栏 trigger 按钮、「首页」菜单项选中态、Header 主题色块均正确切换为对应主色（橙 / 绿 / 紫 / 蓝）。

## [v0.7.0] - 2026-07-05

### Added

#### 动物森友会（Animal Crossing）风格全站 UI 重设计

参考 `docs/Reference/animal-island-ui` 设计稿，将项目整体风格重塑为动森风：暖羊皮纸主背景、薄荷绿主色、圆润 pill 圆角、3D 像素按钮阴影、polka-dot 点阵图案。所有页面与组件统一应用此风格，重点解决移动端/平板端卡片与专辑封面布局紧凑度问题。

- **前端 `index.html`**：引入 Google Fonts（Nunito + Noto Sans SC）作为主字体；`theme-color` 与 `msapplication-TileColor` 改为薄荷绿 `#19c8b9`。
- **前端 `index.css`** ✨ 大幅扩展：新增动森风格 CSS 变量体系
  - 基础色：`--ac-bg-page`（暖羊皮 `#f8f8f0`）、`--ac-bg-content`（卡片/Modal/Table `rgb(247,243,223)`）、`--ac-primary`（薄荷绿 `#19c8b9`）、`--ac-text-header`（深咖 `#794f27`）、`--ac-text-secondary`（米灰 `#9f927d`）。
  - 13 色 NookPhone 调色板：`--ac-pink` / `--ac-purple` / `--ac-blue` / `--ac-green` / `--ac-yellow` / `--ac-orange` / `--ac-red` / `--ac-cyan` / `--ac-brown` / `--ac-beige` / `--ac-mint` / `--ac-lavender` / `--ac-peach`，配套 `.ac-pattern-{pink,purple,blue,...}` polka-dot 双层径向渐变点阵背景。
  - 圆角 token：`--radius-pill: 50px`（按钮/输入框）、`--radius-lg`（卡片 20px）、`--radius-md`。
  - 3D 按钮阴影：`.ant-btn-primary:not(:disabled)` 应用 `box-shadow: 0 5px 0 0 var(--ac-shadow-button)`，hover 浮起 2px，active 下沉 2px，提供复古 3D 按压手感。
  - chip 样式：`.ac-chip` 提供 AC 风小标签（圆角 10px / 700 字重 / 主色背景 / hover 微浮起）。
- **前端 `theme/themes.ts`**：四套主题（暖阳橙/草绿/紫丁香/天空蓝）主色调整为更具 AC 风的鲜艳色调（`#FF9F5A` / `#6fba2c` / `#b77dee` / `#889df0`），并分别为 light/dark 模式生成配套调色板。
- **前端 `components/MediaCover.tsx`**：新增 `pattern` 与 `radius` props；默认使用 `border-radius: var(--radius-lg)` 与 `2/3` 比例容器；`pattern` 可指定 13 色 polka-dot 背景，模拟 AC 风纸质封面。
- **前端 `components/EmbyHome.tsx`** ✨ 紧凑卡片栅格
  - 媒体卡 / 专辑卡宽度按视口动态计算：桌面 180px，平板 160px，手机 130-150px（`computeCardWidth`），保持移动端/平板端紧凑布局
  - 横向滚动行 `gap: 12`（紧凑间距），添加右部渐变遮罩 `.scroll-row::after` 提示用户可左滑
  - 专辑封面 2/3 比例 + 薄荷绿 2px 边框（unread 蒙版 + 锁图标保留）
- **前端 `components/MediaPlayer.tsx`**：视频叠加字幕背景改为 `rgba(247, 243, 223, 0.94)` 暖羊皮纸 + `var(--radius-pill)` 圆角 + 2px 白色描边 + 12px 阴影；控制条按钮 AC 风 3D 阴影。
- **前端 `layouts/MainLayout.tsx`**：侧边栏菜单项使用 NookPhone 调色板色条 + emoji 图标（🏠 首页 / 🏷️ 标签 / 📂 专辑 / 📊 记录 / ⬆️ 上传 / 📝 学习页 / ⚙️ 设置 / ℹ️ 关于）；顶栏品牌区 🌿 EchoSub logo 使用薄荷绿 3D 阴影。
- **前端 `pages/Home.tsx`**：媒体网格卡 `xs={12} sm={8} md={6} lg={4} xl={4} xxl={4}` 紧凑布局；卡片圆角 `var(--radius-lg)`；标签 chip 使用 AC 风格样式。
- **前端 `pages/Albums.tsx`**：专辑封面 `MediaCover` 2/3 比例 + 薄荷绿边框 + 紧凑卡片；标题颜色 `var(--ac-text-header)` + 800 字重；子专辑 tag 圆角 10 + 600 字重。
- **前端 `pages/Tags.tsx`**：标签卡片 `var(--ac-bg-content)` 背景 + `var(--radius-lg)` 圆角 + 薄荷绿主题色高亮选中态；标签 chip 圆角 12 + 700 字重 + 无边框。
- **前端 `pages/Records.tsx`**：页面标题改为 `var(--ac-text-header)` + 800 字重 + 📊 emoji。
- **前端 `pages/Settings.tsx`**：页面标题 AC 风 + 主题色块扩展为动森风调色板。
- **前端 `pages/Login.tsx`** ✨ AC 风登录页：背景 `var(--ac-bg-page)` 暖羊皮纸；卡片圆角 24px + 3px 薄荷绿描边 + 8/24px 阴影；logo 改为 🌿 大 emoji + 薄荷绿 3D 阴影。
- **前端 `pages/About.tsx`** ✨ AC 风关于页：Hero 区背景渐变 `var(--ac-bg-content)` → `var(--ac-bg-page)`；标题色 `var(--ac-text-header)`；新增「🏝️ 动森风格」标签；版本号升至 v0.7.0。
- **前端 `pages/NoteEditor.tsx`**：标题 Input 字号 16/20 + 800 字重 + `var(--ac-text-header)` 颜色 + 圆角 12；图片画廊背景 `var(--ac-bg-content)` + 3px 薄荷绿描边 + 圆角 16；左右切换按钮半透明白色背景；空态区域 `var(--ac-bg-page)` 暖羊皮背景 + 2px 虚线薄荷绿描边。
- **前端 `pages/Upload.tsx`**、**`StudyNotes.tsx`**、**`Player.tsx`**、**`MediaCover`**、**`MediaPlayer`**：所有按钮 / 输入框 / Modal 弹窗的 padding、圆角、阴影均切换为 AC 风格 token；移动端/平板端紧凑布局沿用 v0.6.0 的 `isPhone` 判断。
- **前端 `hooks/useDeviceSize.ts`**：保留原断点 `isPhone<768 / isTablet 768-1280 / isDesktop≥1280`；配合 `EmbyHome.computeCardWidth` 实现三档断点响应式。

### Notes

- **设计 Token 速查**：
  - 背景：`--ac-bg-page`（页面底色） + `--ac-bg-content`（卡片 / Modal / Table 内容区）
  - 主色：`--ac-primary`（薄荷绿） + 13 色 NookPhone 调色板
  - 圆角：`--radius-pill: 50px`（按钮 / 输入） / `--radius-lg: 20px`（卡片） / `--radius-md: 12px`（chip / 小标签）
  - 阴影：3D 按钮 `0 5px 0 0 var(--ac-shadow-button)`，卡片 `0 8px 24px rgba(25, 200, 185, 0.12)`
- **紧凑卡片布局规则**（移动端/平板端）：
  - 媒体卡：桌面 180px / 平板 160px / 手机 130-150px
  - 横向滚动行 `gap: 12`，padding 8
  - 专辑封面统一 2/3 比例 + `var(--radius-lg)` 圆角
  - 卡片标题字号：手机 14 / 桌面 14；统一 700 字重
  - 缩略图缩放 96-160px，自适应视口
- **13 色 polka-dot pattern 用途**：专辑封面装饰、学习页背景、标签页空态、modal 背景等。所有 polka-dot 背景使用 `radial-gradient` 双层叠加，色块密度 14-28px 网格。
- **验证方式**：`go build ./...` / `go vet ./...` / `go test ./... -v`（subtitle 8 用例）全部通过；`pnpm build`（`tsc -b` 严格类型检查 + Vite 打包）通过，1513 modules transformed、27 PWA precache。
- **已知遗留**：
  - v0.6.0 阶段的 `pnpm lint` 35 个 React 19 `react-hooks/set-state-in-effect` 错误未处理（预先存在的 useEffect 内 setState 模式，跨多文件，后续独立 PR 批量重构）
  - 真实设备（iOS / Android）截图待用户在 T34 任务中手动补充

## [v0.6.0] - 2026-07-04

### Added

#### 全站 UI 适配移动设备（手机 / iPad）+ 深色模式

- **后端 `models/models.go` `Setting`**：新增 `ColorMode` 字段（`size:16;default:'auto'`，`json:"color_mode"`），支持 `light` / `dark` / `auto` 三档颜色模式；`auto` 跟随系统 `prefers-color-scheme: dark`。
- **后端 `handlers/settings.go`**：`settingsReq` 新增 `ColorMode` 字段；`validColorModes` 白名单校验；`GetSettings` / `UpdateSettings` 双重兜底（旧数据升级兼容 `auto` 默认值）。
- **前端 `utils/index.ts`**：新增设备检测工具 `isIOS()` / `isIPhone()` / `isIPad()` / `isAndroid()` / `isTouchDevice()`，通过 `userAgent` + `maxTouchPoints` 双重判定，准确识别 iPadOS 13+ 桌面模式伪装 Mac 的情况。
- **前端 `hooks/useDeviceSize.ts`** ✨新建：返回 `{ width, height, isPhone, isTablet, isDesktop, isMobile, isLandscape, isPortrait, dpr }`，统一封装视口尺寸与设备类型判断，使用 `requestAnimationFrame` 节流 resize 事件。`isPhone<768 / isTablet<1280 / isDesktop≥1280` 是本项目统一断点。
- **前端 `hooks/useColorMode.ts`** ✨新建：合并 `color_mode` 偏好与系统主题，解析出实际 `light` / `dark`，并同步设置 `documentElement[data-theme]` 与 `<meta name="theme-color">`（控制 iOS Safari PWA 顶部状态栏颜色）。
- **前端 `theme/themes.ts`**：每套主题（default / green / purple / blue）扩展出 `light` + `dark` 两套 `ThemeConfig`；`dark` 通过 antd `theme.darkAlgorithm` 派生深色语义色（colorBgContainer / colorText / colorBorder / colorBgLayout）；`getThemeConfig(key, isDark)` 接受深色开关参数。
- **前端 `index.css`** ✨重写：建立完整的 CSS 变量体系 —— `--touch-target`（44×44px，Apple HIG 规范）、`--space-{xs,sm,md,lg,xl}`（流体间距 `clamp()`）、`--radius-{sm,md,lg,xl}`、`--font-{xs..3xl}`、`--safe-{top,bottom,left,right}`（`env(safe-area-inset-*)`）、`--content-max-width`、`--color-{bg-page,bg-elevated,text-primary,text-secondary,text-tertiary,border-soft,border-strong,shadow-card,shadow-card-hover,mask-unread}`。深色调色板通过 `[data-theme='dark']` 选择器切换；`@media (prefers-color-scheme: dark)` 为 auto 模式兜底。统一重置 `body` / `html` 移动端高亮与滚动行为；卡片 hover 上浮动画在 `@media (hover: none)` 下自动禁用。
- **前端 `App.tsx`**：引入 `useColorMode()`，根据 `isDark` 调用 `getThemeConfig(theme, isDark)`，确保 antd Theme 与 CSS 变量同源切换。
- **前端 `layouts/MainLayout.tsx`** ✨移动端友好重写：手机端用 `Drawer`（`min(80vw, 320px)` 宽度）替代固定 Sider；Header 高度 56 / 64px 自适应；按钮 / 头像在手机端 `size="large"` 且最小触控目标 44×44px；顶部 padding 应用 `env(safe-area-inset-top)`、底部 padding 应用 `env(safe-area-inset-bottom)`；所有硬编码 `#fff` 背景改为 `var(--color-bg-elevated, #fff)`，深色模式自动跟随。
- **前端 `pages/Login.tsx`**：移除 `maxWidth: 400` 限制（手机端满宽），Input / Button 在手机端 `size="large"`（触控目标 ≥ 44px），登录卡片背景使用 `var(--color-bg-elevated)`，容器 padding 应用 `safe-area-inset`。
- **前端 `pages/About.tsx`**：Hero 区 padding 改用 `clamp(20px, 4vw, 32px)`、标题字号 `clamp(24px, 5vw, 32px)` 流体缩放；版本号更新至 `v0.6.0`；新增「🌗 深色模式」标签；所有卡片背景 / 文字色硬编码值（`#fff` / `#1a1a1a` / `#666` / `#8c8c8c`）替换为 CSS 变量。
- **前端 `components/MediaCover.tsx`**：默认使用 `aspect-ratio: 2/3` 响应式容器（宽度由父容器决定），保留 `height` 显式传入作为兼容路径。背景与图标色改用 CSS 变量。
- **前端 `components/EmbyHome.tsx`**：横滑行宽度按视口动态计算（手机 ~140px / 桌面 ~180px），专辑封面使用 `MediaCover` 替代固定高度容器；横向滚动行添加 `scroll-row` 类，右部渐变遮罩（`::after`）作为可左滑提示；专辑卡 `⋮` 菜单与笔记卡的 `NoteCardMenu` 集成，深色模式色彩一致。

#### 阶段 2-4：全站页面与公共组件移动端适配（v0.6.0）

- **前端 `components/MediaPlayer.tsx`**：视频叠加字幕 `bottom` 应用 `calc(16px + var(--safe-bottom, 0px))` 适配 iOS Home Indicator；控制栏改为两行布局（主控 + 音量/速度），播放 / 暂停 / 速度调节按钮在 `isPhone` 时 `size="large"` + `minHeight 44`；速度 `+/-` 圆按钮触控目标 ≥ 36px；替换硬编码颜色为 CSS 变量，深色模式自适应。
- **前端 `pages/Player.tsx`**：标题 `Title` 添加 `minWidth: 0` + `textOverflow: ellipsis` 实现单行省略；上一首 / 下一首按钮 `minWidth/minHeight: 44`，在窄屏下不挤压标题。
- **前端 `pages/Home.tsx` (`GridView`)**：统一媒体卡断点为 `xs={12} sm={8} md={6} lg={4} xl={4} xxl={4}`，与 `SeasonGrid` 保持一致；筛选栏在 `xs` 单列、`md` 12+4+4、`lg` 10+3+3 排布。
- **前端 `pages/Tags.tsx`**：标签卡片网格在 `xs={12}`（手机单列 2 个一行），`sm={8} md={6} lg={4}` 逐级加密；筛选结果三组（专辑 / 季 / 文件）使用 `Col xs={24} md={12} lg={8}` 实现手机单列 / 平板双列 / 桌面三列；筛选按钮 / 编辑删除操作按钮触控目标 ≥ 44px。
- **前端 `pages/Records.tsx`**：周统计视图手机端从单行 7 列改为两行（第一行 4 列 span=6：周一~周四；第二行 3 列 span=8：周五~周日），柱状图高度从 80 缩小到 56，padding 8/6，字体 12/10。平板与桌面仍保持原 7 列 `flex={1}` 布局。
- **前端 `pages/Settings.tsx`**：主题选择器使用大圆角色块（手机 64px / 桌面 72px 圆形渐变）；颜色模式选择 `ColorModeSwitch` 提供「🌞 始终浅色 / 🌙 始终深色 / 🌓 跟随系统」三档大按钮；所有卡片背景 / 文字色改用 CSS 变量。
- **前端 `pages/Upload.tsx`**：Card 标题区「上级」、Card extra「刷新」「新建目录」按钮在 `isPhone` 时 `size="middle"` + `minHeight 44` + 加宽 padding；面包屑容器加 `overflowX: auto` + `whiteSpace: nowrap`，深路径时横滑而不换行截断；List 项文件名 `Text ellipsis` 避免溢出；操作 ⋯ 按钮触控目标 44×44；「开始上传」「清空」按钮 `size="large"`。
- **前端 `components/MarkdownEditor.tsx`** ✨ 工具栏触控化：编辑 / 朗读按钮在 `isPhone` 时 `size="large"` + `minHeight 44`，工具栏外层 `flexWrap: wrap + gap: 8` 确保窄屏换行不被裁剪。
- **前端 `pages/NoteEditor.tsx`**：复用 `MarkdownEditor` 组件（移除内联 TTS / 编辑切换重复代码），顶部「标签」「删除」操作在手机端合并到 `MoreOutlined` 下拉菜单（节省横向空间），桌面端平铺；标题 Input 在手机端 `width: 100%` + `fontSize 16`；图片缩略图列表 `flexWrap: nowrap + overflowX: auto` 支持手机横滑；左右切换圆形按钮 `minWidth/minHeight 44`。
- **前端 `pages/StudyNotes.tsx`**：卡片断点统一为 `xs={12} sm={12} md={8} lg={6} xl={6} xxl={4}`；筛选 Select 与「新建学习页面」按钮在手机端 `size="large" + width: 100%`；删除按钮触控目标 44×44；Modal 确认 / 取消按钮 + Input / Select 全部 large 化。
- **前端 `pages/Albums.tsx`**：专辑卡断点统一为 `xs={12} sm={8} md={6} lg={4} xl={4} xxl={4}`；卡片标题 ⋯ 按钮 `minWidth/minHeight 44`；Modal 重命名按钮 large 化。
- **前端 `components/TagManagerModal.tsx`**：Select / Input / Button 在 `isPhone` 时 `size="large"` + `minHeight 44`；Select 多选 tag 自定义 `tagRender` —— chip 在手机端 `minHeight 26 + fontSize 14`，关闭按钮触控目标 22×22，确保删除标签不误触。
- **前端 `components/PasswordConfirmModal.tsx`**：`Input.Password` 与 Modal 确认 / 取消按钮在 `isPhone` 时 `size="large"` + `minHeight 44`，避免密码弹窗触控过小导致输入困难。

### Notes

- 阶段 1（基础设施：`useDeviceSize` / `useColorMode` / CSS 变量 / 主题切换）见上方「全站 UI 适配移动设备（手机 / iPad）+ 深色模式」段落。
- 阶段 2-4 将阶段 1 的能力注入到每个业务页面：所有页面均引入 `useDeviceSize()`，按 `isPhone` 切换 `size`、列数、触控目标；所有硬编码颜色（`#fff` / `#1a1a1a` / `#666` / `#fafafa` / `#1890FF` / `#52C41A`）已替换为 `var(--color-*)` / `var(--ant-color-primary)` 等 CSS 变量，确保深色模式自动跟随。
- **响应式断点**（统一）：`isPhone<768` / `isTablet 768-1280` / `isDesktop≥1280`。
- **触控目标**：所有可点击元素 `minWidth/minHeight: 44`（Apple HIG），菜单项 48px，关闭按钮 22×22。
- **安全区适配**：iOS 刘海屏 / Home Indicator 通过 `env(safe-area-inset-*)` 兜底（`--safe-{top,bottom,left,right}` CSS 变量）。
- **已知遗留**：`pnpm lint` 仍报 35 个错误（`react-hooks/set-state-in-effect`），均为 React 19 新规则触发的「useEffect 内 setState」模式（`Records.loadAll()` / `Upload.load('')` / `Tags.load()` / `TagManagerModal.setSelectedIds` 等），**预先存在**于本次 UI 优化之前。本次修改的代码本身全部通过严格类型检查（`pnpm build` 1513 模块成功转换，27 个 PWA 预缓存条目）。后续将在独立 PR 中批量重构这些跨多文件的遗留模式（按业务域分批处理）。
- **验证方式**：`go build ./...` / `go vet ./...` / `go test ./... -v`（subtitle 8 用例）全部通过；`pnpm build`（`tsc -b` 严格类型检查 + Vite 打包）通过；`pnpm lint` 报 35 个预先存在的 React 19 规则遗留（不影响构建）。

## [v0.5.0] - 2026-07-04

### Added

#### 多态标签系统：专辑 / 季 / 学习页 / 媒体文件均支持打标签 + 按标签筛选

- **后端 `models/models.go`**：新增 `EntityTag` 多态标签关联表，复合唯一索引 `(user_id, tag_id, entity_type, entity_id)`。新增 `EntityType` 枚举：`media` / `album` / `season` / `note`，支持标签与四种实体的多对多关联。
- **后端 `handlers/entity_tag.go`（新文件）**：实现通用多态标签接口：
  - `POST /tags/:id/attach` — 给任意实体附加单个标签（幂等）
  - `POST /tags/:id/detach` — 从任意实体摘除单个标签
  - `PUT /tags/entity` — 覆盖式设置某实体的全部标签（管理弹窗一次性保存）
  - `GET /tags/entity?type=&id=` — 获取某实体当前已绑定的标签列表
  - `GET /tags/:id/entities` — 按标签筛选实体，结果分四组：专辑 / 季 / 文件（媒体 + 学习页）
  - `LoadTagsForEntities(userID, entityType, entityIDs)` — 批量加载函数，供业务侧按实体填充 `tags` 字段；媒体文件兼容旧 GORM `media_tags` 表，确保 v0.3.x 时代的标签数据仍可见
- **后端 `handlers/media.go` (`ListAlbums`)**：专辑列表返回 `tags` + `meta_id`；季列表每个子项返回 `tags` + `meta_id`（季的 `AlbumMeta.ID`），作为 `entity_tags` 的 `entity_id`。
- **后端 `handlers/note.go` (`noteToJSON`)**：学习页 JSON 响应新增 `tags` 字段。
- **后端 `database/database.go`**：`AutoMigrate` 注册 `EntityTag` 表。
- **前端 `types/index.ts`**：新增 `TagEntityType` 类型别名（`'media' | 'album' | 'season' | 'note'`）、`TagFilterResult` / `TagFilterAlbum` / `TagFilterSeason` 接口；`Album` / `SubAlbum` / `StudyNote` 扩展 `tags` + `meta_id` 字段。
- **前端 `api/index.ts` (`tagApi`)**：新增 `attach` / `detach` / `setForEntity` / `getForEntity` / `entities` 五个方法对应后端多态接口。
- **前端 `components/TagManagerModal.tsx（重构为通用）`**：原媒体专用弹窗升级为支持任意实体类型的通用弹窗。接受 `entityType` + `entityId` + `currentTagIds` props，复用同一套 UI 逻辑：标签下拉多选 + 新标签创建，覆盖式保存。
- **前端 `pages/Tags.tsx（重构）**：原 CRUD 列表升级为「标签管理 + 标签筛选器」：
  - 顶部：标签 CRUD
  - 中部：标签卡片显示该标签下三类实体的数量徽标（📂 专辑 / 📁 季 / 📄 文件）
  - 下部：选中标签后展开三组结果（专辑 / 季 / 文件），文件组合并展示媒体（🎬/🎵）与学习页（📝），分别可点击进入专辑页 / 季页 / 播放器 / 笔记编辑器。
- **前端 `components/EmbyHome.tsx` (`AlbumCard`)**：右下角 ⋮ 菜单新增「🏷️ 管理标签」项（无 `meta_id` 时禁用），点击打开 `TagManagerModal`。
- **前端 `components/NoteCardMenu.tsx`**：学习页 ⋮ 菜单新增「🏷️ 管理标签」项，点击打开 `TagManagerModal`。
- **前端 `components/SeasonCardMenu.tsx`**：季 ⋮ 菜单新增「🏷️ 管理标签」项（无 `meta_id` 时禁用），点击打开 `TagManagerModal`；新增 `metaId` / `tags` props。
- **前端 `pages/Home.tsx` (`GridView`)**：
  - 专辑标题区新增「🏷️ 标签」按钮，点击打开 `TagManagerModal`；同时在标题下方展示当前专辑已绑定的所有标签 chip
  - 媒体卡片 ⋮ 菜单新增「🏷️ 管理标签」项，点击打开 `TagManagerModal`
  - 季网格右下角 `SeasonCardMenu` 自动透传 `metaId` + `tags`，确保季标签可被管理
- **前端 `pages/NoteEditor.tsx`**：标题区紧贴显示当前学习页所有标签 chip；操作区新增「🏷️ 标签」按钮，点击打开 `TagManagerModal`，保存后自动重新加载笔记以更新 chip 列表。

### Notes

- 「未读蒙版」逻辑（v0.4.9）继续生效：未学习的媒体 / 季仍显示半透明灰色蒙版 + 锁图标 + 「未开始」提示；开始学习（`play_count > 0` 或 `last_position > 0`）后蒙版自动消失。
- 标签筛选结果中，「文件」组合并展示媒体 + 学习页两类：媒体用 🎬/🎵 + 文件名；学习页用 📝 + 标题。
- 媒体文件标签兼容 v0.3.x 的 `media_tags` 表（通过 GORM many2many 自动管理），与新 `entity_tags` 表的 `media` 类型合并去重，确保历史数据可见。
- 验证方式：`go build` / `go vet` / `go test`（subtitle 8 用例）全部通过；`pnpm build`（含 `tsc -b` 严格类型检查）通过；按 changelog 模板同步更新至 v0.5.0。

### Fixed

- **修复 `Tags` 页面崩溃：`Cannot read properties of null (reading 'length')`**
  - 根因：后端 `GET /tags/:id/entities` 在「该标签下没有媒体 / 学习页」时，Go 的 `var notes []models.StudyNote` / `var medias []models.MediaFile` 是 nil slice，序列化为 JSON `null`，导致前端 `r.medias.length` / `r.notes.length` 崩溃
  - 修复（后端 `handlers/entity_tag.go`）：将 `notes` / `medias` 显式初始化为 `make([]T, 0)`，确保空结果序列化为 `[]` 而非 `null`
  - 修复（前端 `pages/Tags.tsx`）：即使后端遗漏字段，前端也通过 `r.albums ?? []` / `r.seasons ?? []` / `r.medias ?? []` / `r.notes ?? []` 兜底；`tag` 字段统一为 `Tag | null`，渲染时使用 `filterResult?.tag?.name ?? ''`
  - 验证方式：标签页正常打开，新建空标签、点击空标签均无崩溃
- **完善 PWA 对 iOS / 苹果设备的支持：通过分享 → 添加到主屏幕时显示网页图标**
  - 背景：v0.1.0 起 PWA 仅在 Android 端「添加到主屏幕」时显示图标，iOS Safari 通过分享菜单添加到主屏幕时由于 manifest 中缺少 `apple-touch-icon-*` 多尺寸声明 + `purpose` 字段，会回退到首屏截屏作为图标；启动画面也是空白。
  - 修复（图标生成）`frontend/scripts/generate-icons.ps1` ✨新增：基于 `android-chrome-512x512.png` 通过 `System.Drawing` 高质量缩放生成 4 个 `apple-touch-icon-{120,152,167,180}x{...}.png`，覆盖 iPhone、iPad 各代设备的 home screen 推荐尺寸。
  - 修复（启动画面生成）`frontend/scripts/generate-splashes.ps1` ✨新增：基于同一图标生成 11 个设备的 `apple-touch-startup-*.png`（iPhone X / XR / XS Max / 12 / 12 mini / 12 Max / 14 Pro / 14 Pro Max / iPad / iPad Pro 11 / iPad Pro 12.9），画面浅米色背景（`#FFF9F0` 与品牌一致）+ 居中图标 + 「EchoSub」粗体标题 + 「Yu Yan Xue Xi Yu Wen Bei Song」副标题。
  - 修复（清单文件）`frontend/public/site.webmanifest`：icons 数组显式声明 4 个 `apple-touch-icon-*`（`purpose: "any"`，iOS 16+ Safari 通过清单识别）+ 192/512 通用图标 + maskable 图标，确保 iOS 16+ 在「分享 → 添加到主屏幕」时能从 manifest 拿到正确图标。
  - 修复（HTML 引用）`frontend/index.html`：
    - 4 条 `<link rel="apple-touch-icon" sizes="...">` 分别指向 120/152/167/180 尺寸，缺失时 iOS 会自动放大默认 `apple-touch-icon.png` 导致模糊。
    - 11 条 `<link rel="apple-touch-startup-image" media="...">` 按设备尺寸 + 像素比精确匹配，覆盖从 iPhone X 到 iPhone 14 Pro Max 全系 iPhone / iPad。
    - 补充 `<meta name="apple-touch-fullscreen" content="yes">`、`<meta name="format-detection" content="telephone=no, email=no, address=no">`（避免媒体文件名中的数字被误识别为电话）。
  - 修复（Windows 磁贴）`frontend/public/browserconfig.xml` ✨新增：与 `index.html` 的 `<meta name="msapplication-config">` 配合，给 Windows 10/11 Edge「固定到任务栏」提供方块磁贴配置（`TileColor=#FF7A45`）。
  - 修复（构建）`frontend/vite.config.ts`：`includeAssets` 加入全部新增的 `apple-touch-icon-*` 与 `apple-touch-startup-*` 资产，`manifest.icons` 与 `public/site.webmanifest` 同步，确保 `pnpm build` 输出的 `dist/` 包含全部 16 个 PNG 与 manifest。
  - 验证方式：`pnpm build` 通过（`tsc -b` 严格类型检查 + Vite 打包）；`dist/manifest.webmanifest` 输出包含 7 个 icon 条目（4 iOS + 2 Android + 1 maskable）；`dist/` 包含全部 5 个 `apple-touch-icon*`、11 个 `apple-touch-startup*`、`browserconfig.xml`。iOS Safari「分享 → 添加到主屏幕」后将显示清晰的 EchoSub 图标，首次启动时显示品牌启动画面而非空白。
- **README.md 全面更新以反映 v0.4.x ~ v0.5.0 新增能力**
  - 功能特性按「媒体与播放 / 学习与笔记 / 标签管理 / 专辑季编辑 / 账户认证 / 部署」6 个子章节组织
  - 新增 Emby 风格专辑扫描、季、配对媒体、未读蒙版、继续观看、TTS、学习页、媒体备注、多态标签等特性的描述
  - 目录结构按当前实际文件清单刷新（含 `note.go` / `remark.go` / `entity_tag.go` / `album_meta.go` / `album_pin.go` / `delete.go` / `NoteCardMenu` / `SeasonCardMenu` / `TagManagerModal` / `NoteEditor` 等）
  - API 概览从 24 条扩到 50+ 条，按 账户 / 媒体 / 专辑季 / 学习页 / 标签 / 播放记录 / 文件扫描设置 6 个子表格分组
  - 新增「标签管理（v0.5.0 多态）」专章，描述 UI 流程
  - 新增「版本管理」章节说明 Keep a Changelog 1.0.0 规范与当前活跃版本 v0.5.0
  - 顶部新增 [AI 协作指南](CLAUDE.md) 链接
- **README.md 顶部添加徽标 + shields.io 徽章栏（参考 LynxOCR 风格）**
  - 顶部居中显示 🎬🎧 大标题 + 中文副标题 + 5 项关键特性关键词
  - 语言 / 文档 / 日志 / 协作指南 5 个导航链接居中排列
  - 9 个 shields.io 徽章：Release / License / Platform / Changelog / Backend (Go) / Frontend (React) / Database (SQLite) / Deploy (Docker) / CI (GitHub Actions)
  - 新增「📑 目录」快速跳转锚点
  - 全文章节标题加 emoji 前缀（✨ 概述 / 🚀 功能特性 / 🧰 技术栈 / 📁 目录结构 / ✅ 前置要求 / 🏃 快速开始 / ⚙️ 配置说明 / 🧪 测试方法 / 🏗️ 生产构建 / 📚 API 概览 / 📊 学习记录 / 🏷️ 标签管理 / 🐳 Docker 部署 / 🗂️ 版本管理 / 📄 许可证）
  - 子节加 emoji 前缀（1️⃣ / 2️⃣ / 🔐 / 🎬 / 🗂️ / 📝 / 🏷️ / 📊 / ⚙️ / 🇨🇳 / ⚠️）
  - 底部添加「用 ❤️ 打造 · 欢迎 Star ⭐️ 与 Issue 反馈」+ 回到顶部链接
  - 仓库归属修正：徽章 / 镜像引用从 `yaole/EchoSub` 修正为 `tabortao/EchoSub`，与 `docker-compose.yml` 中 `ghcr.io/tabortao/echosub:latest` 保持一致
- **README.md「NAS 媒体目录映射」章节与 `docker-compose.yml` 对齐**
  - 之前示例 volumes 块（`/mnt/nas/EchoSub:/media` 等）与仓库实际 `./Media:/media` 不符，重写为**开箱即用**模式：直接展示 `docker-compose.yml` 中的相对路径卷挂载
  - 新增「🔀 NAS 路径映射示例」子节：列出 4 种常见 NAS 挂载方式（群晖 / 通用 NFS / Windows SMB / Windows 映射盘），仅需替换 `volumes` 中 `- ./Media:/media` 的左侧路径
  - 新增 `mkdir Media Data` + `ln -s` / `New-Item Junction` 软链示例，避免拷贝大量媒体文件
  - 修正挂载模式说明：上传 / 专辑重命名 / 封面写入功能需**读写**挂载；只读播放可加 `:ro`
- **CLAUDE.md 改写为完整汉语版（v0.5.0）**
  - 10 条核心原则扩为 11 章结构（核心原则 / 项目概述 / 常用命令 / 开发环境 / 架构 / 关键约定 / 代码风格 / 测试清单 / 变更日志 / 调试指引 / 项目记忆）
  - 关键约定从 9 条扩为 13 条，新增：跨平台路径验证（v0.4.7 教训）、媒体配对（v0.4.3）、多态标签系统（v0.5.0）、Emby 元数据识别优先级
  - 目录结构按当前实际文件清单刷新（含 `entity_tag.go` / `note.go` / `remark.go` / `album_meta.go` / `album_pin.go` / `delete.go` / `TagManagerModal` / `NoteCardMenu` / `SeasonCardMenu` 等）
  - 测试清单补 2 条：新增 / 修改 API 需同步 README；新增 / 修改功能需同步 PLAN / TASKS
  - 调试指引新增「前端 `.length` 崩溃」与「专辑封面未显示」两条
  - 项目记忆章节指向 `~/.trae-cn/memory/` 沉淀路径，便于 AI 跨会话复用历史经验
- **README.md 新增「📸 应用预览」章节**
  - 在徽章栏与目录之间插入独立「应用预览」章节，居中展示 `docs/images/UI-01.png`（首页 Emby 风格预览）与 `docs/images/UI-02.png`（播放器 / 学习页预览）
  - 每张图下方加 `<em>` 简短说明（首屏 / 播放器 + 学习页）
  - 图片宽度统一 `90%`，大屏可清晰查看细节
  - 目录新增「📸 应用预览」锚点链接，便于快速跳转

## [v0.4.9] - 2026-07-04

### Added

#### 未读媒体灰色蒙版 + 季封面缩放 + 横幅改用 <img> 渲染

- **前端 `components/EmbyHome.tsx` (`MediaCard`)**：新增「未读」灰色蒙版。当媒体的 `play_count === 0` 且 `last_position === 0`（用户从未播放 / 学习）时，封面图覆盖半透明灰色蒙版 (`rgba(128,128,128,0.55)`) + 锁图标 + 「未开始」文字提示，鼠标仍可点击进入播放器；学习后（`play_count > 0` 或 `last_position > 0`）蒙版自动消失。
- **前端 `pages/Home.tsx` (网格视图 MediaCard)**：与 EmbyHome 同步实现「未读蒙版」逻辑，专辑 / 标签筛选下所有未学习的媒体卡片都被半透明灰色蒙版覆盖。
- **前端 `pages/Home.tsx` (`SeasonGrid`)**：季封面容器由固定 `height: 220` 改为 `aspectRatio: '2 / 3'`（竖版海报比例，与 Emby 一致），`objectFit` 由 `'cover'` 改为 `'contain'`。避免竖版 `seasonXX-poster.jpg` / `Season N/folder.jpg` 被裁剪，让季图标完整可见；容器背景由 `#f0f0f0` 调整为 `#f5f5f5` 衬托图片。「📁 季」徽标位置 / 样式与右下方 `SeasonCardMenu` 保持原状。

### Changed

- **前端 `pages/Home.tsx` (`AlbumBanner`)**：横幅渲染方式由 CSS `background-image: url(...) center/cover` 改为 `<img>` + `objectFit: cover` + 独立暗色叠加层。原因：背景图加载失败时浏览器反馈不直观（图片不可见但容器尺寸正常），用 `<img>` 可显式 `onError` 兜底隐藏并回退到纯渐变背景，确保 `小猪佩奇(2004)/banner.jpg` 等 16:5 横幅在专辑详情页一定能正常显示。

### Notes

- 「未读蒙版」使用 `pointerEvents: 'none'` 避免吞掉卡片的点击事件（仍可点击进入播放器开始学习）。
- 季封面比例锁定 2:3 是 Emby / Plex 的标准海报比例；`objectFit: 'contain'` 保证 `seasonXX-poster.jpg` 这类竖版图不被裁剪、季图标完整可见。
- 验证方式：在 `test-media\小猪佩奇(2004)` 目录下，确认 `banner.jpg` 通过 `GET /api/v1/albums/.../banner` 返回图片（之前 v0.4.7 已修复 Windows 路径 bug 并将 `banner_path` 正确入库）；`season02-poster.jpg` ~ `season08-poster.jpg` 通过 `seasonXX-poster` 映射到对应 `Season N`（v0.4.7 已实现），`Season 1/folder.jpg` 优先于 `season01-poster.jpg`（季根 `folder.jpg` 优先规则）。
- 本次不涉及后端变更，扫描器与元数据识别沿用 v0.4.7 修复结果。

## [v0.4.8] - 2026-07-04

### Added

#### 首页「继续观看」只显示未完成的媒体 + Player 支持 ?position= 覆盖

- **后端 `handlers/record.go` (`ListRecent`)**：新增 `unfinished=true` 查询参数，过滤出「已开始但未完成」的播放记录：`(last_position > 0) AND (duration = 0 OR last_position < duration * 0.95)`。`duration = 0` 兜底（媒体元数据未就绪时只看 last_position > 0），0.95 阈值容忍用户提前一两句结束的情况。
- **前端 `api/index.ts` (`recordApi.recent`)**：签名扩展为 `recent(limit, opts?: { unfinished?: boolean })`。
- **前端 `components/EmbyHome.tsx`**：「继续学习」行改名为「▶️ 继续观看」，调用 `recordApi.recent(20, { unfinished: true })`，确保该行只显示未完成的媒体，已看完的不再占位。媒体卡片点击进入时仍走 `/play/:id`，由 Player 自动从 API 加载 `last_position` 续播。
- **前端 `pages/Player.tsx`**：支持 URL `?position=X` 参数强制从指定秒数开始播放，覆盖数据库中的 `last_position`。典型用法：`/play/123?position=0` 强制重看、分享带进度的链接。`?position=0` 是合法的「重看」信号；负数 / NaN 会被规范化为 0。

### Changed

- **前端 `components/EmbyHome.tsx`**：「继续学习」→「继续观看」标题与注释同步更新，更准确反映该行内容（最近未完成的媒体 + 最近更新的学习页面）。

## [v0.4.7] - 2026-07-04

### Fixed

#### 修复 `scanAlbumMeta` 在 Windows 上完全失效 + 专辑/季元数据按 Emby 标准重整

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨核心修复：改用 `filepath.Rel` 校验目录归属，**取代** `strings.HasPrefix(absDir, root)`。旧实现在 Windows 上当 `Media.Dir` 来自 yaml（用 `/` 分隔符）而 `absDir` 来自 `filepath.Abs`（用 `\`）时永远返回 `false`，导致函数**所有 Emby 元数据识别都早期 return**。这一 bug 自 v0.4.5 引入 Emby 风格专辑元数据以来一直存在。修复后 `小猪佩奇(2004)/folder.jpg`、`banner.jpg`、`tvshow.nfo`、`seasonXX-poster.jpg`、`Season 1/folder.jpg`、`<video>.nfo` 等元数据全部能被正确识别入库。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨封面/横幅识别改为「候选收集 + 优先级选择」模式：循环中记录 `stem → 文件名` 候选 map，循环结束后按 `albumCoverNames`（`folder` > `poster` > `cover` > `albumart` > `albumartwork`）和 `albumBannerNames`（`banner` > `backdrop` > `fanart`）的优先级挑出最终值。`os.ReadDir` 顺序不保证按字母序返回，旧实现「先到先得」会导致 `backdrop.jpg` 抢先于 `banner.jpg` 被识别。`pickByPriority` 为新增辅助函数。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨横幅不再在季目录识别：Emby 风格是「所有季共用专辑根的 `banner.jpg`」，季的 `AlbumMeta.banner_path` 保持 `nil`，由 `ServeAlbumBanner` 兜底到专辑横幅。季内即使有冗余的 `backdrop.jpg` / `banner.jpg` / `fanart.jpg` 也不会被错误地当作季横幅。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** ✨季描述 nfo 改为「内容优先」策略：新增 `pickNFOPathByContent`，若 `season.nfo`（Emby 标准）解析出非空 `<plot>` 则用它，否则回退到 `tvshow.nfo`（兼容 Emby 部分刮削后的冗余文件）。旧实现在季目录下用「先到先得」，导致 `season.nfo` 的空 `<plot />` 覆盖了 `tvshow.nfo` 的实际季描述。

- **后端 `scanner/scanner.go` (`scanAlbumMeta`)** AlbumMeta upsert 改用 `Select("cover_path", "banner_path", "nfo_path", "description")` 显式指定更新字段：这样当 Emby 文件被用户删除、对应字段变为 `nil` 时，**旧值会被清空**而不是被 GORM 默默跳过 `nil` 值。

- **后端 `scanner/scanner.go` (`upsertSeasonCover`)** 季封面回填改为「只在季自身没有封面时设置」：季根的 `folder.jpg` 优先于专辑根的 `seasonXX-poster.jpg`（Emby 标准），避免占位季封面把季根封面覆盖掉。

- **后端 `scanner/scanner.go` (`parseNFOPlot`)** 自动去除 `<![CDATA[ ... ]]>` 包装：Emby 风格常把 `<plot>` 内容写成 CDATA，旧实现保留包装字符让前端展示 `<![CDATA[...]]>`。修复后单集描述（来自 `<video>.nfo`）和专辑/季描述（来自 `tvshow.nfo` / `season.nfo`）都能拿到干净的纯文本。

### Notes

- 验证脚本 `scripts/verify-emby.ps1` 已可通过：注册用户 → 触发扫描 → 拉取 `/api/v1/albums` + `/api/v1/media` 打印元数据。`小猪佩奇(2004)` 专辑的输出现在完全符合 Emby 标准：
  - 专辑 `cover_path` = `folder.jpg`
  - 专辑 `banner_path` = `banner.jpg`
  - 专辑 `description` = `tvshow.nfo` 的 `<plot>`（去 CDATA）
  - `Season 1` `cover` = `Season 1/folder.jpg`、`banner` 继承专辑 `banner.jpg`、`description` = `tvshow.nfo` 的内容（`season.nfo` 的 plot 为空，自动回退）
  - `Season 2..8`（无目录）`cover` = 专辑根的 `seasonXX-poster.jpg`、`banner` 继承专辑 `banner.jpg`
  - 单集 description 全部为干净的纯文本（无 CDATA 包装）
- 调试工具 `backend/cmd/check-meta`：打印指定 DB 的 `AlbumMeta` + `MediaFile` 表内容，便于排查元数据问题。

## [v0.4.6] - 2026-07-04

### Added

#### 季卡片 ⋮ 菜单 + 专辑根目录元数据二次扫描 + 横幅描述展示

- **后端 `scanner/scanner.go` (`upsertMedia`)**：季内媒体入库完成后，同步扫描专辑根目录的 Emby 元数据（`banner.jpg` / `folder.jpg` / `tvshow.nfo`），避免只识别到 `Season 1/folder.jpg` 而忽略专辑根的横幅 / 封面 / 描述。`Season 1` 内的媒体入库时同样会触发专辑根的扫描，让「小猪佩奇(2004)」等目录的 `banner.jpg` 横幅能被正确入库。
- **后端 `handlers/delete.go`** ✨新增 `DeleteSeason`：`DELETE /albums/:name/sub/:sub`（X-Delete-Password 校验）递归删除季目录、批量软删除该季下所有 MediaFile，并清理 AlbumMeta 中对应季的元数据记录。防路径穿越 + 容忍期望季目录尚未创建的边界情况。
- **后端 `router/router.go`**：注册 `DELETE /albums/:name/sub/:sub` 路由。
- **前端 `components/SeasonCardMenu.tsx`** ✨新增：季卡片 ⋮ 菜单共享组件，菜单项为「🖼️ 上传季封面（自动以 `folder.<ext>` 命名写入季目录）/ 🗑️ 删除该季（密码确认）」。触发器位置、z-index 可定制，与 `NoteCardMenu` 风格保持一致。
- **前端 `api/index.ts`**：`mediaApi.deleteSeason` 新增（带 `X-Delete-Password` 头）。
- **前端 `pages/Home.tsx`**：
  - `SeasonGrid` 集成 `SeasonCardMenu`：季卡片右下角显示 ⋮ 按钮，点击可上传季封面或删除该季（密码确认），操作完成后通过 `onChanged` 回调刷新专辑数据。GridView 父组件传入 `load` 作为回调。
  - `AlbumBanner` 增强：横幅高度由 180 → 220 px、宽度铺满 Card 容器；底部叠加专辑 / 季名 + 副标题（"· 专辑名"）+ 描述（最多 2 行，溢出省略），让 Emby 风格专辑页更接近原生 Emby 视觉。

### Notes

- 季删除是危险操作（递归删除季目录及全部媒体 / 字幕 / 封面 / nfo），前端通过 `PasswordConfirmModal` 要求用户输入登录密码二次确认；密码错误返回 401 不关闭弹窗，便于重试。
- 「期望季」（仅有 `season02-poster.jpg` 资源但 `Season 2` 目录尚未创建的情况）当前仍由 `buildSubs` 自动建占位卡（`count=0`）；如需在 v0.4.6 之后删除该占位季，可通过「新建媒体」让扫描自动建立季目录，或直接删除对应的 `seasonXX-poster.jpg`。

## [v0.4.5] - 2026-07-04

### Added

#### 学习页面 ⋮ 菜单 + 专辑置顶 + 部分 Emby 刮削兼容

- **后端 `models/models.go`**：
  - `StudyNote` 新增 `Pinned bool` 字段（带索引），用于学习页面级别的用户置顶。
  - ✨新增 `AlbumPin` 模型：专辑置顶（每个用户可置顶多个专辑，按 `sort` 升序展示在首页最前）。联合唯一索引 `(user_id, album)`。
- **后端 `database/database.go`**：`AutoMigrate` 加入 `StudyNote.Pinned` 与 `AlbumPin`。
- **后端 `scanner/scanner.go`**：在已有 Emby 元数据识别基础上增强对「部分刮削」专辑的兼容：
  - `findCover` 继续支持 `<basename>-thumb.jpg` 缩略图优先。
  - `scanAlbumMeta` 在专辑根目录识别 `seasonXX-poster.<ext>` 作为对应季的封面（季目录名 `Season XX` / `seasonXX` / `SeasonXX`），并支持 `seasonXX-banner.<ext>` 作为季横幅，让「小猪佩奇(2004)」等只有部分 Emby 资源的目录也能正常显示封面、季封面、横幅与描述。
- **后端 `handlers/note.go`**：
  - `updateNoteReq` 新增 `pinned` 字段，`UpdateNote` 支持置顶切换。
  - ✨新增 `ToggleNotePin`：`POST /notes/:id/pin` 切换学习页面置顶状态，返回 `{pinned: bool}`。
  - `DeleteNote` 增强：要求 `X-Delete-Password` 请求头（bcrypt 校验当前用户密码），与「删除专辑 / 删除文件 / 删除目录」二次确认保持一致。
- **后端 `handlers/album_pin.go`** ✨新增：`POST /albums/:name/pin` 切换专辑置顶状态（按用户隔离，已置顶则取消，否则按 `MAX(sort)+1` 追加）。
- **后端 `handlers/media.go`**：`ListAlbums` 拉取当前用户的 `AlbumPin` 列表，先按 `sort` 升序拼接置顶项，再拼接未置顶项；`Album` 返回新增 `pinned` / `pin_order` 字段。
- **后端 `router/router.go`**：注册 `POST /albums/:name/pin`、`POST /notes/:id/pin` 两条新路由。
- **前端 `types/index.ts`**：`Album` 新增 `pinned? / pin_order?` 字段；`StudyNote` 新增 `pinned?` 字段。
- **前端 `api/index.ts`**：`mediaApi.togglePinAlbum` 切换专辑置顶；`noteApi.pin` 切换学习页置顶；`noteApi.delete` 接受可选 `password` 并附带 `X-Delete-Password` 头。
- **前端 `components/NoteCardMenu.tsx`** ✨新增：学习页面卡片 ⋮ 菜单共享组件，统一实现「置顶 / 取消置顶 → 重命名 → 上传封面 → 删除（密码确认）」四项操作，触发器与 z-index 可定制，首页 / 网格视图共用同一份逻辑。
- **前端 `components/EmbyHome.tsx`**：
  - `AlbumCard` ⋮ 菜单移至卡片右下角，菜单项最上方为「置顶 / 取消置顶」，依次为「重命名专辑 / 上传封面图 / 删除专辑（密码确认）」，置顶卡片在顶部叠加 📌 徽标。
  - `NoteCard` 集成 `NoteCardMenu`：右下角 ⋮ 菜单 + 置顶徽标 + 标题展示逻辑保持原样。
- **前端 `pages/Home.tsx`**：网格视图的 `NoteCard` 同步集成 `NoteCardMenu`（z-index 调整为 3 以避免被 Card 浮层遮挡），将原右上角的「专辑名」标签替换为「📌 置顶」徽标。

### Notes

- 学习页面「上传封面」通过 `noteApi.uploadImages` 上传图片，新图片会追加到 `images` 数组的首位（首图用于卡片展示）。
- 专辑 / 学习页删除时如不传登录密码将返回 401，便于前端控制「必须二次确认」的 UX 流程（当前统一通过 `PasswordConfirmModal` 引导用户输入）。
- 部分 Emby 刮削的目录（缺少 `season.nfo` 但有 `seasonXX-poster.jpg`）现在也能正确显示季封面；`scanAlbumMeta` 对每张图分别记录候选，支持后续增补资源后自动升级。

## [v0.4.4] - 2026-07-04

### Added

#### Emby 风格专辑元数据识别 + 季视图

- **后端 `models/models.go`** ✨新增 `AlbumMeta` 模型：专辑 / 季级别的元数据（封面 / 横幅 / 描述 / nfo 路径）。联合唯一索引 `(album, sub_album)`：sub_album 为空字符串表示专辑本身，非空表示该专辑下某季（子目录）。
- **后端 `database/database.go`**：`AutoMigrate` 加入 `AlbumMeta`。
- **后端 `scanner/scanner.go`**：
  - `findCover` 新增 Emby 风格 `<basename>-thumb.jpg` 缩略图识别——剥离 `-thumb` 后缀匹配视频同基名（最优先），再回退到 Kodi 同名图、兜底首帧 / 颜色块。
  - 新增 `scanAlbumMeta(dir, album, subAlbum)`：扫描指定目录识别 `folder.jpg/poster.jpg/cover.jpg`（封面）、`banner.jpg/backdrop.jpg/fanart.jpg`（横幅）、`season.nfo/tvshow.nfo/album.nfo`（描述），写入 / 更新 `AlbumMeta` 表。`upsertMedia` 完成后调用，将专辑与季的 Emby 元数据持久化。
- **后端 `handlers/album_meta.go`** ✨新增：专辑 / 季元数据 API。
  - `POST /albums/:name/cover?sub=xxx`：上传封面（multipart `file` 字段，限制 jpg/png/webp/gif ≤ 10MB），写入对应目录并统一命名为 `folder.<ext>`（同时清理旧的 `folder/poster/cover.*` 候选），更新 `AlbumMeta.cover_path`。
  - `GET /albums/:name/cover?sub=xxx`：返回封面图片（Content-Type 按扩展名设置）。
  - `GET /albums/:name/banner?sub=xxx`：返回横幅图片。
  - 路径安全：`albumDir` 拒绝 `..` 与分隔符，并校验结果必须在 media root 内。
- **后端 `handlers/media.go`**：`ListAlbums` 新增 `cover_path / banner_path / description / has_seasons` 字段。一次查询拉取所有 `AlbumMeta`，专辑本体 / 每个季分别关联对应元数据。
- **后端 `router/router.go`**：注册 3 条新路由（cover 上传 + cover / banner 获取）。
- **前端 `types/index.ts`**：`Album` / `SubAlbum` 新增 `cover_path? / banner_path? / description?` 字段；`Album` 新增 `has_seasons?` 标志。
- **前端 `api/index.ts`**：`mediaApi` 新增 `uploadAlbumCover / albumCoverUrl / albumBannerUrl`，支持 `subAlbum` 参数。
- **前端 `components/EmbyHome.tsx`**：
  - `AlbumCard` 新增「⋮」菜单：重命名专辑（调用 `renameAlbum`） / 上传专辑封面（自动以 `folder.<ext>` 命名写入专辑目录）。
  - 「我的专辑」卡片优先使用 `album.cover_path`（来自 Emby 扫描或用户上传），无则回退到自动挑选的代表媒体封面。
- **前端 `pages/Home.tsx`**：
  - 进入专辑页时若专辑有季（`has_seasons` 或 `sub_albums.length > 0`），默认进入「季选择视图」——以季卡片网格展示，仅显示季名、季封面（来自 `cover_path / banner_path`）、季描述与「已看 X/Y」徽标，点击季卡片进入对应季。整体风格类似 Emby「Seasons」行。
  - 专辑详情页头部新增 `AlbumBanner` 组件：16:5 横向横幅，优先 `banner_path`，回退到 `cover_path`；底部叠加专辑 / 季名 + 描述。
  - 季 Tabs 与子专辑 Tags 同步显示「已看 X/Y」。
  - 修复 `SubAlbum` 类型与 `FolderOutlined` 图标缺失的 TypeScript 错误。

### Notes

- Emby 元数据优先级：`<basename>-thumb.jpg`（视频） > `folder.jpg/poster.jpg/cover.jpg`（专辑 / 季封面） > `banner.jpg/backdrop.jpg/fanart.jpg`（横幅） > `season.nfo/tvshow.nfo/album.nfo`（描述）。
- 季视图触发条件：专辑下存在任何 `sub_album`（子目录）时自动启用；单层专辑（无季）保持原网格视图不受影响。
- 用户上传封面会自动清理同目录已有的 `folder/poster/cover.*` 候选图，避免同名堆积；上传后首页与专辑页会即时刷新。

## [v0.4.3] - 2026-07-04

### Added

#### 同名媒体配对（视频 ↔ 音频 tab 切换）

- **后端 `models/models.go`**：`MediaFile` 新增 `PairedMediaID *uint` 字段（带索引）。约定：仅在 video 上指向同目录同基名（仅扩展名不同）的 audio；audio 端保持 NULL，便于列表 SQL 直接过滤被配对项。
- **后端 `scanner/scanner.go`**：`upsertMedia` 完成后调用新增的 `linkPairedMedia`，按"同目录 + 去扩展名同基名 + 类型互补"规则建立配对；`handleEvent` 删除事件中先清理被删文件的 `paired_media_id` 引用，避免死链。
- **后端 `handlers/filemanager.go` / `handlers/delete.go`**：手动删除（按 id / 路径 / 目录）路径同步清理 `paired_media_id`，被删 audio 不会留下野 video 配对。
- **后端 `handlers/media.go`**：
  - `ListMedia` SQL 层 `WHERE NOT (type='audio' AND id IN (SELECT paired_media_id ...))` 排除被配对的 audio。
  - `ListAlbums` count/played 统计同样排除被配对 audio，避免同一内容计两次。
  - `GetMedia` 返回 `paired_media` 字段（id/name/type/path），供播放器渲染 video/audio 切换 tab。
- **后端 `handlers/record.go`**：`ListRecent` 同步排除被配对 audio，首页最近播放行不重复展示。
- **前端 `types/index.ts`**：`MediaFile` 新增 `paired_media_id?`；新增 `PairedMedia` 与 `MediaDetailResponse` 类型。
- **前端 `pages/Player.tsx`**：从 `GetMedia` 读取 `paired_media` 并下传给 `MediaPlayer`。
- **前端 `components/MediaPlayer.tsx`**：新增 video/audio 切换区（`Tag.CheckableTag`，仅在存在配对时显示）。切换时记录原 currentTime 写入 `pendingSeekRef`，新 `onLoadedMetadata` 用该值回放（视频/音频时长不同，按当前媒体 duration 自动收敛）。媒体 id、字幕、播放进度与历史记录仍以主媒体为准，切换不影响学习统计。

### Notes

- 仅"同目录 + 同基名 + 类型互补"才会配对；`a.mp3` 与 `a.mp4` 在不同目录时各自独立展示。
- 配对 audio 仍保留自己的 `SentenceProgress / PlayRecord`（历史学习数据），不级联删除；列表与最近播放行只展示主媒体（视频优先）。
- 切换 tab 仅换流 URL 与 `<video>/<audio>` 元素；字幕、收藏、句末停顿、循环次数等状态保持。

## [v0.4.2] - 2026-07-03

### Added

#### 上传页文件管理

- **后端 `handlers/filemanager.go`** ✨新增：5 个文件管理 API：
  - `POST /media/mkdir`：新建目录（含路径穿越防护）
  - `DELETE /media/dir?path=...`：递归删除目录（磁盘 + DB 批量软删除）
  - `DELETE /media/file?path=...`：删除单个文件（磁盘 + DB 记录 + 关联字幕/封面）
  - `PUT /media/path/rename`：重命名文件/目录（磁盘 + DB 路径更新 + album/sub_album 重算）
  - `PUT /media/path/move`：移动文件/目录（磁盘 + DB 路径更新 + album/sub_album 重算）
- **后端 `router/router.go`**：注册 5 条新路由。
- **前端 `api/index.ts`**：`mediaApi` 新增 `mkdir / deleteDir / deleteFile / renamePath / movePath` 方法。
- **前端 `pages/Upload.tsx`**：全面改造：
  - 每个文件/目录右侧 `⋮` 下拉菜单：重命名、移动到、删除
  - 目录浏览卡片顶部「新建目录」按钮 + Modal
  - 重命名 Modal、移动 Modal（输入目标路径）
  - 删除确认 Modal（区分文件/目录提示）

#### 关于页面

- **前端 `pages/About.tsx`** ✨新增：Hero 区 + 6 张功能卡片 + 5 步使用指南 + 技术栈标签 + 作者信息（tabortao）。
- **前端 `layouts/MainLayout.tsx`**：侧边栏增加「💡 关于」菜单项。
- **前端 `router/index.tsx`**：注册 `/about` 路由。

### Fixed

#### 主题切换真正生效

- **前端 `App.tsx`**：移除 `key={theme}` 方案（antd v5 CSS 变量在 key 变化时不会自动更新），改用 `useEffect` + `document.documentElement.style.setProperty('--ant-color-primary', ...)` 直接操作 CSS 变量。

#### 页面标题重复与宽度

- **`backend/config.yaml`**：数据库路径改为绝对路径（防止从不同目录启动时路径解析错误）。
- **前端 `pages/Settings.tsx`**：移除 `maxWidth: 960` 和重复标题，与其他页面保持一致。
- **前端 `pages/Records.tsx`** / **`pages/Upload.tsx`**：移除重复标题，由 MainLayout Header 统一显示。

#### Header 用户交互

- **前端 `layouts/MainLayout.tsx`**：头像点击直接跳转 `/settings`；退出登录改为独立 `LogoutOutlined` 图标按钮。

#### 专辑文件默认排序

- **前端 `pages/Home.tsx`**：GridView 默认 `sort = 'name'`，按名称时 `order: 'asc'`。
- **后端 `handlers/media.go`**：`ListMedia` 默认排序改为 `name ASC`。

## [v0.4.2] - 2026-07-03

### Fixed

#### 主题切换整体配色同步

- **前端 `theme/themes.ts`**：每套主题均开启 `cssVar: { key: 'ant' }`，让 antd v5 自动将 token（colorPrimary、colorBgLayout、borderRadius 等）写入 `:root` 级 CSS 变量（如 `--ant-color-primary`）。
- **前端 `App.tsx`**：移除 `useEffect` 手动 setProperty 的代码，完全依赖 antd 的 cssVar 机制，确保所有 antd 组件跟随主题切换。
- **前端 `index.css`**：将卡片 hover 阴影、滚动条颜色从硬编码 `rgba(255,122,69,...)` 改为 `color-mix(in srgb, var(--ant-color-primary) xx%, transparent)`，跟随主题变化。
- **前端 `layouts/MainLayout.tsx`**：Logo 渐变、Header 边框/阴影、头像渐变背景均改用 `var(--ant-color-primary)` + `color-mix` 替代硬编码橙色。
- **前端 `components/EmbyHome.tsx`**：专辑卡片进度条、封面占位渐变、hover 阴影跟随主题。
- **前端 `pages/Records.tsx`**：所有 12 处硬编码 `rgba(255,122,69,...)` / `#FF7A45` / `#FFB37A` 替换为 CSS 变量。
- **前端 `pages/Settings.tsx` / `pages/Upload.tsx` / `pages/Home.tsx` / `pages/About.tsx`**：剩余硬编码橙色替换为 `var(--ant-color-primary)`。

#### 专辑文件可点击排序

- **前端 `pages/Home.tsx`**：GridView 顶部新增排序工具栏（标签 + 升序/降序切换按钮），点击即可在名称升序/降序间切换，即时刷新列表。

#### 专辑文件名称排序

- **后端 `handlers/media.go`**：`ListMedia` 默认排序保持 `name ASC`（已是正确值），修改已在 v0.4.2 完成。**注：需重启后端让修改生效。**

#### 专辑升降序排序不生效

- **前端 `pages/Home.tsx`**：修复点击「升序/降序」按钮不刷新列表的问题。两处根因：
  1. `Home` 的 `order` 状态缺少 setter（`const [order] = useState(...)`），且 `GridView` 内的 `gridOrder` 状态变化未加入 `load` 的依赖数组，导致切换排序方向既无法回到升序、也不会触发重新拉取。改为将 `order`/`setOrder` 提升至 `Home` 并下传，移除冗余的 `gridOrder` 状态与同步 `useEffect`，按钮直接切换 `order` 并即时刷新。
  2. 修复后仍不生效：进入专辑页时 `GridView` 在 `if (albumFilter)` 分支里把媒体和学习页合并后，**无条件**用 `updated_at` 倒序重排，把后端按名称/时长返回的顺序覆盖掉了。改为根据 `sort` 取统一排序键（`name` → 名称/标题；`file_modified_at` → 更新时间；`duration` → 时长，笔记排末尾），并按 `order` 升降序。

#### 学习统计年度翻页失效

- **后端 `handlers/stats.go`**：`getYearStats` 此前忽略 `base` 参数、始终以 `time.Now().Year()` 为终点，导致前端「年度」Tab 的上/下翻页按钮毫无效果。改为以 `base.Year()` 作为 5 年范围的终点，`IsCurrent` 仍以真实当前年份为准。

#### 学习统计周日界偏移

- **后端 `handlers/stats.go`**：`getWeekStats` 未将 `base` 归一到本地 0 点。`time.Parse("2006-01-02")` 返回 UTC 0 点、`time.Now()` 带当前时分秒，两者都会让每日统计窗口偏移，使某天的播放/背诵记录错算到相邻天。新增 `time.Date(base.Year(), base.Month(), base.Day(), 0,0,0,0, time.Local)` 归一化，确保按本地时区自然日切分。

#### 关于页面宽度

- **前端 `pages/About.tsx`**：移除顶层 `maxWidth: 960` 限制，与首页/设置页等页面保持同一全宽布局。

#### 删除二次密码确认

- **后端 `handlers/filemanager.go`** / **`handlers/delete.go`**：所有删除端点（`DeleteMedia` / `DeleteDir` / `DeleteFile` / `DeleteAlbum`）统一接入 `verifyUserPassword` 校验。从 `X-Delete-Password` header（兼容 `?password=` query）读取登录密码，bcrypt 校验当前用户密码，失败返回 401。
- **前端 `components/PasswordConfirmModal.tsx`** ✨新增：通用二次确认 Modal，含密码输入、错误提示、loading 态、密码错误不关闭。
- **前端 `api/client.ts`**：响应拦截器对带 `X-Confirm-Purpose: delete` 标记的 401 不清 token、不跳登录页（区分 token 失效 vs 密码错误）。
- **前端 `api/index.ts`**：`mediaApi.remove / deleteDir / deleteFile / deleteAlbum` 接受可选 `password` 参数，自动附带 `X-Delete-Password` 与 `X-Confirm-Purpose` 头。
- **前端 `pages/Home.tsx` / `pages/Upload.tsx` / `pages/Albums.tsx`**：删除操作改为先弹密码确认框，正确密码才真正调用删除 API；密码错误保留弹窗以便重试。

### Added

#### 文件备注 Tab

- **后端 `models/models.go`**：新增 `MediaRemark` 模型（`user_id` + `media_id` 复合唯一索引），一个文件一条备注。
- **后端 `database/database.go`**：`AutoMigrate` 加入 `MediaRemark`。
- **后端 `handlers/remark.go`** ✨新增：`GET/PUT/DELETE /media/:id/remark` 三个端点，支持 upsert（一个文件一条）。
- **后端 `router/router.go`**：注册 3 条新路由。
- **前端 `types/index.ts`**：新增 `MediaRemark` 类型。
- **前端 `api/index.ts`**：`mediaApi` 新增 `getRemark / upsertRemark / deleteRemark`。
- **前端 `components/MarkdownEditor.tsx`** ✨新增：通用 Markdown 编辑器（预览/编辑切换 + TTS 朗读 + 失焦保存回调），从 NoteEditor 提取，便于备注与学习页面共用。
- **前端 `components/MediaPlayer.tsx`**：在「全文 / 收藏句子」之后新增「备注」Tab。默认预览态，点击「编辑原文」进入编辑；失焦自动保存。无字幕时自动定位到备注 Tab，字幕 Tab 仍可点击。

#### favicon + PWA 图标更新

- 将 `docs/Reference/favicon/` 下的 7 个图标文件复制到 `frontend/public/`：
  - `favicon.ico`、`favicon-16x16.png`、`favicon-32x32.png`
  - `apple-touch-icon.png`（180×180，iOS Safari）
  - `android-chrome-192x192.png`、`android-chrome-512x512.png`
  - `site.webmanifest`（更新 name/short_name/theme_color）
- **前端 `index.html`**：增加 `<link rel="icon">`（ico + 16/32 png）、`<link rel="apple-touch-icon" sizes="180x180">`、`<link rel="manifest" href="/site.webmanifest">`。
- **前端 `vite.config.ts`**：VitePWA manifest icons 指向 android-chrome-192/512；theme_color 改为 `#FF7A45`。

#### 关于页 GitHub 链接

- **前端 `pages/About.tsx`**：GitHub 链接改为 `https://github.com/tabortao/EchoSub`，颜色跟随主题。

## [v0.4.1] - 2026-07-03

### Fixed

#### 主题切换真正生效

- **前端 `App.tsx`**：移除 `key={theme}` 方案（antd v5 CSS 变量在 `key` 变化时不会自动更新），改为通过 `useEffect` 在 `document.documentElement.style` 上直接 setProperty 写入 `--ant-color-primary` 等 CSS 变量。切换主题时即时生效。

#### 页面标题重复与宽度不一致

- **`backend/config.yaml`**：数据库路径从相对路径 `data/echosub.db` 改为绝对路径 `D:/Code/Go/EchoSub/backend/data/echosub.db`，避免从不同目录启动时路径解析错误。
- **前端 `pages/Settings.tsx`**：移除页面内部 `maxWidth: 960` 和重复标题「⚙️ 设置」，与其他页面保持一致的宽度和 MainLayout 标题显示。
- **前端 `pages/Records.tsx`**：移除重复标题「📊 学习记录」，由 MainLayout Header 统一显示。
- **前端 `pages/Upload.tsx`**：移除重复标题「⬆️ 上传文件」，由 MainLayout Header 统一显示。

#### Header 用户交互优化

- **前端 `layouts/MainLayout.tsx`**：用户头像改为点击直接跳转 `/settings`；退出登录改为独立的 `LogoutOutlined` 图标按钮（在头像右侧），不再需要下拉菜单。移除 Dropdown 依赖。

### Added

#### 关于页面

- **前端 `pages/About.tsx`** ✨新增：关于页面，包含：
  - Hero 区（项目名、版本号、简介、标签）
  - 核心功能 6 张彩色卡片（逐句复读、TTS 朗读、专辑管理、标签系统、拖拽上传、学习记录）
  - 使用方法 5 步指南
  - 技术栈标签云
  - 作者信息（tabortao）
- **前端 `layouts/MainLayout.tsx`**：侧边栏菜单增加「💡 关于」入口，路由 `/about`。
- **前端 `router/index.tsx`**：注册 `GET /about` 路由。

#### 设置页面美化与响应式设计

- **前端 `pages/Settings.tsx`**：全面美化：
  - 外观主题卡片：更大尺寸、悬停上浮动画、选中态晕影
  - 学习偏好表单：双列响应式栅格（`xs={24} md={12}`），手机单列、桌面双列
  - 账户管理：头像区卡片化、密码表单双列布局
  - 说明区：6 个功能标签三列栅格（`xs={24} sm={12} lg={8}`）
  - 双列响应式栅格（`Col xs={24} md={12}`），手机端单列、桌面端双列

#### 专辑文件默认排序

- **前端 `pages/Home.tsx`**：GridView 默认 `sort = 'name'`；按名称排序时 `order: 'asc'`（其他排序保持 `desc`）。
- **后端 `handlers/media.go`**：`ListMedia` 默认排序从 `file_modified_at DESC` 改为 `name ASC`。

## [v0.4.0] - 2026-07-03

### Added

#### 界面主题切换（小学生审美 4 套主题）

- **后端 `models/models.go`**：`Setting` 模型新增 `Theme string` 字段（`size:32;default:'default'`）。
- **后端 `handlers/settings.go`**：`settingsReq` 新增 `Theme`；`validThemes` 白名单（`default/green/purple/blue`）；GET 返回与 PUT 写入均做兜底校验。
- **前端 `theme/themes.ts`** ✨新增：4 套主题定义——暖阳橙（默认）/ 清新绿野 / 梦幻紫蓝 / 天空蓝，每套含完整 antd token 覆写。
- **前端 `App.tsx`**：移除硬编码主题，改为读取 `useSettingsStore.theme` 动态应用 `getThemeConfig(theme)`。
- **前端 `store/settings.ts`**：`DEFAULTS` 新增 `theme: 'default'`。
- **前端 `types/index.ts`**：`Settings` 接口新增可选 `theme?: string`。
- **前端 `pages/Settings.tsx`**：新增「🎨 外观主题」卡片——4 个主题色块（含 emoji、名称、主色条），点击切换并持久化，当前主题显示勾选标记。

#### 收藏句子顺序播放

- **前端 `components/MediaPlayer.tsx`**：新增 `favoritePlayMode` 状态与 `favoritePlayModeRef/favoriteSetRef`；「收藏句子」Tab 增加「▶ 播放收藏」按钮，点击后自动切到 repeat 模式并跳到第一句收藏句；repeat 决策逻辑中，收藏播放模式下「下一句」目标从 `favoriteSet` 按索引升序取下一句收藏句，无更多收藏句时整体循环回第一句或结束播放。

#### 媒体封面播放次数徽标

- **前端 `pages/Home.tsx`**：GridView 媒体卡片封面右上角新增 `▶ {play_count}` 橙色 Tag（`play_count > 0` 时显示）。

#### 学习记录页面美化

- **前端 `pages/Records.tsx`**：
  - 汇总统计卡片：改为渐变背景 cover 样式（绿/橙/黄三色），含大字号数字、emoji 装饰、鼓励文字。
  - 周/月/年统计卡片：渐变背景 + 当前日阴影高亮 + 柱状图投影。
  - 汇总行（周/月/年共用）：改为独立渐变小卡片（播放/媒体/句子三色）。
  - 按专辑进度：卡片化布局 + 渐变进度条（`from/to`）+ 百分比显示。
  - 播放记录表：空状态自定义插画 + 表格斑马纹（通过 `rowClassName` + CSS 变量）+ 行悬停高亮。
- **前端 `index.css`**：新增 `.row-even` / `.row-odd` 斑马纹样式。

### Fixed

- **前端 `components/MediaPlayer.tsx`**：修复最后一句字幕 `repeat_count` 不增加的问题。
  - Normal 模式 `onEnded` 事件中，在循环/停止前补调 `incrementSentenceRepeat(lastIdx)`，解决媒体 `ended` 先于 `timeupdate(t>=end)` 触发导致的漏计数。
  - Repeat 模式 `allDone` 分支补调 `incrementSentenceRepeat(curIdx)`，确保最后一遍重复也被计数。

## [v0.3.1] - 2026-07-03

### Added

#### Header 全局扫描按钮

- **前端 `store/scan.ts`**：新建 `useScanStore`，保存 `scanning` 状态、`lastTriggeredAt` 时间戳与 `trigger()` 动作。`trigger()` 调用 `scanApi.trigger()`，成功后更新时间戳并每秒轮询 `/scan/status` 直到扫描结束。
- **前端 `layouts/MainLayout.tsx`**：Header 用户头像左侧插入扫描按钮（`<ReloadOutlined spin />` + `<Spin>` 包裹），点击触发 `useScanStore.trigger()`；扫描中按钮禁用并 spinner 动画；成功后 `message.success('媒体文件夹扫描已启动')`。
- **前端 `components/EmbyHome.tsx`**：使用 `useAuthStore` 同时也订阅 `useScanStore.lastTriggeredAt`；该值变化即重新获取专辑、最近播放、学习笔记等数据，实现扫描后首页及时刷新。

#### Emby 风格专辑详情（季 Tabs + 智能封面 + 观看进度）

- **后端 `handlers/media.go`**：`ListAlbums()` 增加 `played` 维度——album 层与每个 sub_album 层都返回「当前用户有过播放记录的媒体数」。WHERE 增加 `deleted_at IS NULL` 过滤。
- **前端 `types/index.ts`**：`Album` 与 `SubAlbum` 接口均新增可选 `played?: number` 字段。
- **前端 `components/EmbyHome.tsx`**：`AlbumEntry` 新加 `played` 字段；`AlbumCard` 移除冗余「最近播放」文字，改为「已看 X/Y」徽标 + 底部微进度条；专辑卡片按 `lastPlayedAt` 倒序排列。
- **前端 `pages/Home.tsx`**：专辑详情页的子专辑筛选从 Select 下下拉改为 Ant Design `<Tabs>` 横滑标签——「全部」+ 每个子专辑（带「已看/总数」小 Tag）。

#### 最近播放接口按媒体_id 去重

- **后端 `handlers/record.go`**：新增 `ListRecent()` Handler——子查询按 `media_id, MAX(last_played_at)` 分组取最近一条，JOIN 过滤 `media_files.deleted_at IS NULL`，限制 `?limit`（默认 20，最大 100）。
- **后端 `router/router.go`**：注册 `GET /records/recent?limit=N`。
- **前端 `api/index.ts`**：`recordApi` 新增 `recent(limit?)` 方法。
- **前端 `components/EmbyHome.tsx`**：`useEffect` 中 `recordApi.list()` 替换为 `recordApi.recent(20)`；继续学习列表数据更准确（每个媒体一条最近记录）。

### Changed

- **后端 `handlers/record.go`**：`ListRecords()` 在 Preload 后剔除 `Media.ID == 0` 的幽灵记录（关联媒体已被软删除时 GORM Preload 会返回零值结构），避免前端渲染访问 `undefined.name`。
- **后端 `handlers/stats.go`**：`getWeekStats / getMonthStats / getYearStats` 三个函数内所有 `PlayRecord / SentenceProgress` 聚合查询都增加 `JOIN media_files ... AND media_files.deleted_at IS NULL`，已删媒体的学习记录不再进入统计。

### Fixed

- **前端 `pages/Records.tsx`**：
  - 初始加载失败（后端 500 / 网络错误）不再静默 `catch {} ignore`，改为 `Alert` 错误提示 + 重试按钮。
  - 捕捉 `p.data != null` 的边界，`message.error` 输岀可读错误。
  - Table「媒体名称」列的 `dataIndex: ['media','name']` 改为 render 函数：关联媒体存在时显示可点击链接、缺失时显示灰色「（已删除媒体 #id）占位。
  - 「专辑」列改用 `mediaAlbum()` 辅助函数安全访问。

## [v0.3.0] - 2026-07-03

### Added

#### 用户账户管理（修改密码 / 修改用户名 / 上传头像）

- **后端 `handlers/auth.go`**：
  - 新增 `validateUsername` / `validatePassword` 校验函数：用户名 `^[a-zA-Z0-9_]{3,64}$`，密码 8-64 字符且须同时包含字母和数字。**仅注册与修改时强制校验，不影响已注册用户登录**。
  - `PUT /auth/password`：修改密码，需验证旧密码，新密码不能与旧密码相同，须满足强度要求。
  - `PUT /auth/profile`：修改用户名，校验格式与唯一性（排除自身），返回新用户信息与旧用户名。
  - `POST /auth/avatar`：上传头像（jpg/png/webp/gif，≤2MB），存储到 `data/avatars/<uid>/avatar.<ext>`，覆盖旧头像，更新 `User.AvatarPath`。
  - `GET /auth/avatar`：返回当前登录用户头像文件（支持 `?token=` 查询鉴权，与媒体流一致）。
  - `userToJSON` 统一返回 `{id, username, avatar_path, created_at}`。
- **后端 `models/models.go`**：`User` 新增 `AvatarPath *string` 字段（AutoMigrate 自动加列）。
- **后端 `router/router.go`**：注册 `PUT /auth/password`、`PUT /auth/profile`、`POST /auth/avatar`、`GET /auth/avatar` 路由。
- **前端 `api/index.ts`**：`authApi` 新增 `changePassword` / `updateProfile` / `uploadAvatar` / `avatarUrl` 方法。
- **前端 `store/auth.ts`**：新增 `updateUser(user)` 方法，修改用户名/头像后同步更新 localStorage 与 state，保留现有 token。
- **前端 `pages/Settings.tsx`**：新增「账户管理」卡片——头像预览 + Upload 更换按钮（96px 圆形头像，有图片显示图片，无则首字母渐变占位）、用户名修改表单（带格式校验与 extra 提示）、密码修改表单（旧密码 + 新密码 + 确认密码，含字母+数字强度校验与两次一致性校验）。
- **前端 `pages/Login.tsx`**：注册表单加强校验——用户名 pattern `^[a-zA-Z0-9_]+$` + extra「3-64 字符，仅字母/数字/下划线」；密码 min 8 + 自定义字母数字校验 + extra「8-64 字符，需同时包含字母和数字」。登录表单保持简单 required 校验。
- **前端 `layouts/MainLayout.tsx`**：Header 头像支持图片显示——`user.avatar_path` 存在时渲染 `<Avatar src={authApi.avatarUrl(token)} />`，否则渲染首字母渐变头像。

#### TTS 默认设置

- **后端 `handlers/settings.go`**：`settingsReq` 新增 `TTSVoice` / `TTSSpeed` 字段；`GetSettings` 返回 TTS 默认值（`en-US-JennyNeural` / `1.0`），旧数据兜底补全；`UpdateSettings` 校验 `TTSSpeed` 范围 0.5-2.0。
- **后端 `models/models.go`**：`Setting` 新增 `TTSVoice string` / `TTSSpeed float64` 字段。
- **前端 `store/settings.ts`**：DEFAULTS 新增 `tts_voice: 'en-US-JennyNeural'` / `tts_speed: 1.0`。
- **前端 `types/index.ts`**：`Settings` 接口新增 `tts_voice: string` / `tts_speed: number`。
- **前端 `pages/Settings.tsx`**：学习偏好卡片新增「TTS 朗读默认设置」分区——语音下拉选择（9 种 Edge TTS 音色：美式/英式/澳式/中文男女声）+ 语速 Slider（0.5-2.0，0.1 步进，带刻度标记与实时倍数显示）。
- **前端 `pages/NoteEditor.tsx`**：TTS 朗读不再使用硬编码 `TTS_VOICE` 常量，改为从 `useSettingsStore` 读取 `tts_voice` / `tts_speed`，未加载时兜底 `en-US-JennyNeural` / `1.0`。

#### Emby 风格首页布局

- **前端 `components/EmbyHome.tsx`（新建）**：Emby 风格横向滚动首页组件。
  - **「继续学习」行**：并行拉取 `recordApi.list()`（最近播放记录，按 `last_played_at DESC`）与 `noteApi.list()`（最近学习页面），去重合并后按时间倒序取前 15 条，媒体与学习页面混排。媒体卡片底部显示橙色进度条（`last_position / duration`）。
  - **「我的专辑」行**：学习 Emby「My Media」设计，每个专辑仅显示**一个封面入口卡片**（不再在首页平铺全部内容）。封面选择优先级：① 最近播放的视频 → ② 专辑内第一个视频 → ③ 最近播放的任意媒体 → ④ 第一个媒体。点击封面进入专辑详情页（网格视图）查看全部内容。卡片为 220×330 竖向海报，底部黑色渐变叠层显示专辑名 + 项数 + 「🎬 含视频」+ 最近播放时间，悬停时上浮放大 + 淡入「进入专辑」播放图标提示。
  - **「独立资源」行**：未归入专辑的散落文件仍以媒体卡片形式横向滚动展示。
  - **媒体海报卡片**：180px 宽竖向卡片，封面 240px 高（复用 MediaCover），类型角标（🎬视频/🎵音频）+ 播放次数角标 + 悬停播放图标 + 标题 + 相对时间/专辑名。
- **前端 `pages/Home.tsx`**：重构为视图切换——无筛选条件时渲染 `<EmbyHome>`（emby 横向滚动布局），有筛选条件（album/sub_album/tag_id/keyword/type）时渲染 `<GridView>`（专辑详情网格视图，含搜索栏、子专辑筛选、重命名/删除/**新建学习页面**按钮）。点击专辑封面通过 `setSearchParams({album})` 切换到网格视图。
- **前端 `layouts/MainLayout.tsx`**：侧边栏移除「专辑」菜单项（`/albums` 路由保留，专辑改为首页封面入口展示）。

#### 播放器上一个/下一个切换

- **前端 `pages/Player.tsx`**：加载媒体后并行拉取同专辑（含子专辑）媒体列表（`mediaApi.list({album, sub_album, sort:'file_modified_at', order:'asc'})`），计算当前媒体的前后相邻 ID。标题右侧新增 ⏮ / ⏭ 按钮（`StepBackwardOutlined` / `StepForwardOutlined`），disabled 态 + Tooltip 提示「已是第一个/最后一个」，点击 `navigate(/play/:id, {replace:true})` 切换。

### Changed

- **`README.md`**：全文翻译为中文版，保留 Markdown 结构、代码命令与技术术语不变。
- **前端 `pages/Settings.tsx`**：页面标题从「学习偏好设置」改为「设置」；说明卡片新增 TTS 与账户安全条目。

## [v0.2.0] - 2026-07-03

### Added

#### 学习记录按周/月/年统计

- **后端 `handlers/stats.go`**（新建）：`GET /records/stats?granularity=week|month|year&date=2026-07-02`
  - week：返回 date 所在周（周一~周日）的 7 天每日统计（播放次数/媒体数/背诵句子数）
  - month：返回 date 所在年的 12 个月每月统计
  - year：返回最近 5 年每年统计
  - 统计数据源：PlayRecord.last_played_at + SentenceProgress.updated_at
- **前端 `Records.tsx`** 重写：Tabs 切换周/月/年视图
  - 汇总卡片：总播放次数/媒体数/背诵句子数（紧凑一行）
  - 保留原有专辑进度条 + 播放记录表

#### 媒体与专辑删除

- **后端 `handlers/delete.go`**（新建）：
  - `DELETE /media/:id`：删除单个媒体文件 + 同目录同 basename 的字幕(.srt/.vtt) + 封面图(.jpg/.png/.webp/.gif)，DB 软删除 MediaFile。
  - `DELETE /albums`：请求体 `{album}`，递归删除磁盘目录（含所有媒体/字幕/封面/子目录），DB 批量软删除该专辑下所有 MediaFile，同步删除 StudyNote 及其图片目录。
  - 防路径穿越（`filepath.Base(filepath.Clean(album))`）。
- **前端 `Albums.tsx`**：专辑卡片标题区新增 🗑 删除按钮，二次确认后调用 `mediaApi.deleteAlbum`。
- **前端 `Home.tsx`**：媒体卡片标题区新增 🗑 删除按钮，二次确认后调用 `mediaApi.remove`。
- **前端 `api/index.ts`**：新增 `mediaApi.remove(id)` 和 `mediaApi.deleteAlbum(album)`。

#### 媒体与专辑重命名

- **后端 `handlers/rename.go`**：
  - `PUT /media/:id/rename`：重命名单个媒体文件（请求体 `{name}` 不含扩展名，保留原扩展名）。同步重命名同目录下同 basename 的字幕（.srt/.vtt）与封面图（.jpg/.png/.webp/.gif），并更新 DB 的 `path/name/subtitle_path/cover_path`。目标已存在时返回 409。
  - `PUT /albums/rename`：重命名专辑（请求体 `{album, new_name}`）。先 `os.Rename` 磁盘目录，再批量更新该专辑下所有 `MediaFile` 的 `path/album/subtitle_path/cover_path`（前缀替换），同步更新 `StudyNote.album` 归属。防路径穿越。
- **后端 `record.go`**：新增 `POST /records/:mediaId/sentences/:idx/repeat` 端点，`SentenceProgress.RepeatCount++`，用于句子播放遍数自动累加。
- **前端 `Albums.tsx`**：专辑卡片标题区新增 ✎ 重命名按钮，弹 Modal 输入新名（重命名后刷新专辑列表）。
- **前端 `Home.tsx`**：专辑模式下媒体卡片标题区新增 ✎ 重命名按钮，弹 Modal 提示扩展名保留、字幕/封面同步重命名。

#### 句子播放遍数自动累加

- **前端 `MediaPlayer.tsx`**：新增本地 `localSentences` state（与 prop 同步，用于乐观更新 UI），新增 `incrementSentenceRepeat(idx)` 调用后端 increment API 并乐观更新本地 `repeat_count`。
- `onTimeUpdate` 在两种模式下触发 +1：
  - **普通模式**：检测句子索引自然前进（`si > oldIdx`）或播放到末尾（`si === -1`）时，对上一句调用 increment；
  - **复读模式**：每播放到句末（`t >= cur.end`）时调用 increment（与现有 `sentenceRepeatRef++` 并列）。
- `markSentenceCompleted` 改为只设置 `completed=true`，不再用目标值覆盖 `repeat_count`，避免与 increment 累加冲突。
- 字幕行的「听 N 遍」Tag 实时反映最新计数（乐观更新）。

#### 学习页面融入专辑

- **专辑详情页混排**：进入某专辑后，该专辑下的学习页面与音频/视频媒体按更新时间统一排序混排展示（`Home.tsx` 专辑模式 `Promise.all` 并行拉取 `mediaApi.list` 与 `noteApi.list(album)`，合并为 `FeedItem` 联合类型按时间戳降序）。
- **学习页面卡片预览图**：卡片封面使用学习页面的第一张图片（`noteApi.imageUrl`），无图片时显示橙色渐变背景 + `ReadOutlined` 图标占位；左上角 `gold` 色「学习页」Tag 与媒体的 magenta/green 类型 Tag 区分。
- **首页「最近学习页面」区块**：首页（无专辑筛选时）顶部新增最近学习页面区块（最多 6 个），右侧「查看全部」链接到 `/notes` 列表页；与媒体加载解耦的独立 `useEffect`。
- **专辑详情页新建入口**：仅在 `albumFilter` 存在时显示「新建学习页面」按钮，弹窗仅输入标题（专辑固定为当前专辑），创建成功后直接跳转编辑器。
- **NoteEditor 独立路由**：新增 `/notes/:id` 路由，编辑器从 `StudyNotes.tsx` 内部组件提取为独立页面 `NoteEditor.tsx`，通过 URL id 加载笔记，支持直接 URL 访问与浏览器后退；返回按钮 `navigate(-1)`，无历史栈时兜底回首页。

#### 用户数据迁移

- 将 `dev.db` 中的 5 个用户（testuser/demo/demo2/demo3/test）连同密码 hash 迁移到当前正在使用的 `echosub.db`，testuser/testuser123456 恢复正常登录。

### Changed

#### 学习记录周视图紧凑化（本次新增）

- **前端 `Records.tsx`**：本周统计由「4 列卡片网格」改为「单行 7 列」紧凑布局——周一~周日一行排开，每列上方为「星期 + 日期号」，下方为当日柱状图与「播放次数/媒体数/背诵句子数」；当日列橙色高亮。月/年视图同步收紧为 `lg={4} xl={3}` 网格，柱状图高度从 120 降至 80，整体更紧凑。汇总卡片改为一行三等分。

#### Dockerfile 修正 Go 版本（本次新增）

- **`Dockerfile`**：后端构建镜像从 `golang:1.23-alpine` 改回 `golang:1.26-alpine`，匹配 `go.mod` 声明（`go 1.25.0` + `toolchain go1.26.4`）；新增 `ENV GOTOOLCHAIN=local` 关闭运行时 toolchain 自动下载，避免多架构构建时联网拉取工具链导致的不稳定。（此前注释称「1.26 镜像不存在于 Docker Hub」系历史误判，现 1.26 镜像已正式发布。）

#### docker-compose.yml 映射 NAS 路径（本次新增）

- **`docker-compose.yml`**：媒体目录挂载示例改为 NAS 路径 `/mnt/nas/EchoSub:/media`，并补充群晖 DSM、Linux NFS、Windows SMB、Windows 映射盘四种 NAS 路径写法示例；新增注释明确「后端 config.go / config.yaml 无需修改，只需在 volumes 中把宿主机 NAS 路径挂载到容器 `/media`」；建议 SQLite 数据库卷保留在宿主机本地，不要放 NAS 以免 WAL 锁问题。

#### README 新增学习记录页面中文说明（本次新增）

- **`README.md`**：新增「学习记录页面（Study Records）」中文章节，描述顶部汇总卡片、周/月/年统计（含本周单行 7 列布局）、按专辑进度、播放记录表等模块；新增「Docker / NAS 部署说明」章节，明确镜像构建链路与 NAS 媒体目录映射方式。

#### 小学生审美整体美化

- **`App.tsx`**：antd 主题从蓝色 `#1677ff` 改为温暖橙 `#FF7A45`，`borderRadius` 12，`fontSize` 15；Menu/Card/Button 组件级 token 定制（选中态橙色背景、卡片大圆角 16、按钮圆角 10）。
- **`index.css`**：全局背景从纯白改为暖白 `#FFF9F0`；清理 Vite 模板残留（过大 h1、dark mode、紫色 accent 变量）；新增卡片 hover 上浮动画（`translateY(-4px)` + 橙色阴影）、滚动条橙色美化、按钮 active 微缩放触觉反馈。
- **`MainLayout.tsx`**：重写侧边栏为自定义彩色菜单（每项不同颜色图标——首页橙/专辑蓝/标签绿/上传紫/记录粉/设置青），选中态彩色背景块；Logo 改为橙色渐变圆角图标 + 渐变文字；Header 显示当前页 emoji+名称、用户首字母渐变 Avatar。

#### 编辑/删除收进 ⋯ 菜单

- **`Albums.tsx` / `Home.tsx`**：卡片标题区的编辑 ✎ 和删除 🗑 图标收进 `Dropdown` 下拉菜单（⋯ 触发），避免误触。菜单项带 emoji 图标（✏️ 重命名 / 🗑️ 删除），删除项 `danger` 红色高亮。

#### 专辑封面优先取视频

- **前端 `Albums.tsx`**：加载专辑封面预览时先按 `type=video` 取第一个视频作为封面（MediaCover 会渲染视频首帧），无视频再回退到音频。这样合辑中有视频时封面就是视频画面。

#### 音频专辑按文件夹着色

- **前端 `MediaCover.tsx`**：新增 `colorKey` prop（默认 `media.id`）。传入专辑名时同一专辑内所有音频卡片背景颜色一致，不同专辑颜色不同（基于 key 哈希的浅色 HSL）。
- **前端 `Albums.tsx`**：专辑卡片传入 `colorKey={a.album}`，使专辑内所有音频封面按专辑统一着色。

#### Player 返回按钮移到标题左侧

- **前端 `Player.tsx`**：顶部布局从「标题 + 右侧返回按钮」改为「返回按钮 + 标题」同行排列，返回按钮在标题左侧（如 `←  00. Alphabet Song.mp3`），标题 `marginRight: auto` 占满剩余空间。

#### 媒体文件/目录删除自动清理

- **后端 scanner.go**：
  - `handleEvent` 的 `Remove` 分支区分文件 vs 目录删除——文件按 `path` 精确软删除；目录（路径无媒体扩展名）按 `path LIKE 'dir/%'` 前缀批量软删除该目录下所有 `MediaFile`，解决 fsnotify 删整目录时不触发文件级 Remove 事件导致孤儿记录的问题。
  - `ScanFull` 启动时收集磁盘上所有媒体路径，扫描后调用新增的 `pruneOrphans(diskPaths)` 软删除「数据库有记录但磁盘已不存在」的孤儿媒体，覆盖服务停机期间删除文件/目录的场景。

#### 封面随机浅色背景 / 专题名移到封面右上角 / 字幕 Tab 改名

- **MediaCover.tsx**：无封面（音频兜底 / 视频加载失败）时，背景从固定浅灰 `#f0f2f5` 改为基于 `media.id` 哈希生成的浅色 HSL（亮度 80~92%、饱和度 45~65%），同一媒体始终得到同一种颜色。兜底图标颜色从灰色 `#999` 改为主题蓝 `#1677ff` 更醒目。
- **Albums.tsx**：专辑无媒体时的兜底背景从蓝色渐变改为基于专辑名生成的同款浅色 HSL；专辑卡片封面右上角新增专辑名 Tag。
- **Home.tsx**：媒体卡片的专辑名/子专辑名 Tag 从 `Card.Meta.description` 区域移到 `cover` 区域右上角（与左上角类型 Tag 对称，半透明白色背景增强可读性），下方 description 仅保留自定义紫色标签。`NoteCard` 同样把 `album` Tag 移到封面右上角。
- **MediaPlayer.tsx**：第一个 Tab 文案从「全部字幕」改为「全文」；每句字幕始终显示「听 N 遍」Tag（原逻辑仅 `repeat_count > 0` 时显示，0 遍不显示），未听过用灰色 default Tag、听过用橙色 orange Tag。收藏句子 Tab 同步改为始终显示听遍数。

#### 首页媒体卡片精简 / 统一卡片网格断点 / 移除页面宽度限制

- **移除左侧导航栏「学习页面」入口**：学习页面不再作为独立导航项，改为通过专辑详情页混排和首页「最近学习页面」区块进入（`/notes` 列表页路由保留，作为「查看全部」入口）。
- **首页媒体卡片精简**：卡片信息精简为「文件名 + 专辑/子专辑 Tag + 紫色标签」，移除时长、播放进度条、相对时间、标签管理按钮（标签管理功能保留在播放页/标签页）。
- **统一卡片网格断点**：`Home.tsx`、`Albums.tsx`、`StudyNotes.tsx` 的 `<Col>` 断点统一为 `xs={24} sm={12} md={8} lg={6} xl={6} xxl={4}`（桌面每行 4 个、超宽屏 6 个），避免大屏过密。
- **移除页面宽度限制**：删除 `index.css` 中 `#root` 的 `width:1126px` / `margin:0 auto` / `text-align:center` / `border-inline` 等 Vite 模板残留，内容铺满浏览器宽度。

#### Docker 构建配置优化

- **`docker-compose.yml`**：媒体目录挂载从 `:ro`（只读）改为读写模式（上传功能需要写入）；添加详细注释说明数据卷映射。

#### 上传页面目录浏览修复

- **后端 `handlers/media.go`**：`BrowseMedia` 和 `UploadMedia` 的 path 参数处理修复——前端传入的 `/` 分隔路径用 `filepath.FromSlash` 转为 OS 路径再 `Clean`，返回的 path 统一用 `filepath.ToSlash` 归一化为 `/` 分隔。修复 Windows 下面包屑分割失效问题。
- **前端 `Upload.tsx`**：Breadcrumb 改用 antd v5 的 `items` prop（替代已废弃的 `Breadcrumb.Item` 子组件）；UI 美化为橙色主题风格。

### Fixed

#### 句末停顿修复

- **前端 `MediaPlayer.tsx`**：修复逐句复读模式下「句末停顿 n 秒」不生效的 bug。原逻辑在重复同一句时直接 `el.currentTime = cur.start` 无停顿，仅切换下一句时才停顿。重构后：句末触发时先 `el.pause()` + `setPlaying(false)`，再用 `setTimeout(pauseSeconds * 1000)` 统一处理停顿，停顿结束后根据情况选择「重复当前句」/「跳下一句」/「整体循环重置」/「全部结束」。现在每读完一遍都会停顿 n 秒。

#### 删除接口 404 修正

- **后端 `handlers/delete.go`**：`DeleteAlbum` 在 `os.RemoveAll` 前先 `os.Stat` 检查目录是否存在，不存在时返回 404（原逻辑因 `os.RemoveAll` 对不存在路径返回 nil 而误报成功 200）。

#### TTS 朗读不再念 Markdown 符号

- 新增 `frontend/src/utils/index.ts` 的 `markdownToPlainText(md)` 工具函数，按「块级→行内」顺序处理：代码块整体移除、HTML 标签移除、图片保留 alt、链接保留文本、水平线/标题/引用/列表前缀移除、表格分隔符处理、行内代码去反引号、粗体斜体去标记、HTML 实体还原、空白折叠。
- `NoteEditor.tsx` 的 TTS `handleTTS` 由直接朗读 `content` 原文改为 `markdownToPlainText(content).trim()`，避免念出 `#`、`-`、`>`、`**`、`` ` `` 等符号。

### 端到端测试验证

通过自动测试脚本验证：
- ✅ 登录 testuser/testuser123456 成功
- ✅ 列出 4 个专辑 / 8 个媒体
- ✅ 删除不存在专辑返回 404（接口校验正确）
- ✅ 句子听遍数 +1 接口正常
- ✅ **真实删除媒体**：test.mp3 + test.srt + test.jpg 三个文件全部从磁盘删除
- ✅ **真实删除专辑**：整个目录递归删除，files_deleted 计数正确

## [v0.1.0] - 2026-07-02

### Added

#### 后端 (Go 1.26 + Gin + GORM + SQLite)

- **项目骨架**: `backend/` 模块，导入路径为 `github.com/yaole/EchoSub/backend`，分层结构为 `cmd/server`、`internal/{config,database,handlers,middleware,models,router,scanner,utils}` 和 `pkg/subtitle`。
- **配置加载器** (`internal/config/config.go`): 优先从环境变量读取，其次从 `config.yaml` 读取，具有合理的默认值（端口 `8080`、数据库 `data/echosub.db`、JWT 密钥、媒体目录 `/media`）。支持的媒体扩展名：视频 `.mp4/.mkv/.mov/.webm/.avi`，音频 `.mp3/.m4a/.aac/.wav/.flac/.ogg`，字幕 `.srt/.vtt`。
- **GORM 模型** (`internal/models/models.go`): `User`、`MediaFile`（与 `Tags` 多对多关联）、`Tag`（用户作用域）、`PlayRecord`、`SentenceProgress`、`Setting`。`MediaFile.Album` 可为空，用于表示独立资源。
- **数据库启动** (`internal/database/database.go`): 通过 `glebarez/sqlite`（纯 Go，无 CGO）使用 SQLite，WAL 模式，`busy_timeout=5000`，单写连接，为所有模型执行 `AutoMigrate`。
- **JWT 中间件** (`internal/middleware/auth.go`): 使用 `golang-jwt/jwt/v5` 实现 `GenerateToken` / `ParseToken` / `AuthRequired`；`GetUserID` 从 `gin.Context` 提取用户 ID。密码使用 bcrypt 哈希。**支持 `Authorization` 头与 `?token=` 查询参数两种鉴权方式**（HTML5 媒体元素无法设置请求头，必须用查询参数）。
- **媒体扫描器** (`internal/scanner/scanner.go`): `ScanFull` 全量扫描加上基于 `fsnotify` 的 `StartWatcher` 增量监听 `Create/Write/Rename` 事件；`upsertMedia` 以绝对路径为键；`findSubtitle` 在同一目录中查找同名 `.srt/.vtt`；`findCover` 查找同名图片作为封面；专辑名称从媒体根目录下的第一个路径段派生。
- **字幕解析器** (`pkg/subtitle/subtitle.go`): `ParseFile` / `ParseSRT` / `ParseVTT` 返回统一的 `Sentence{Index,Start,End,Text}`。时间范围正则覆盖 `HH:MM:SS,mmm`、`MM:SS,mmm` 和 `SS,mmm`，支持 `,` 或 `.` 分隔符。**解析前 `strings.TrimPrefix(content, "\ufeff")` 去除 UTF-8 BOM**，避免首句丢失。
- **认证 API** (`internal/handlers/auth.go`): `POST /api/v1/auth/register`、`POST /api/v1/auth/login`、`GET /api/v1/auth/me`。
- **媒体 API** (`internal/handlers/media.go`): `GET /media`（分页，可按 `album/type/keyword/tag_id` 筛选，可排序）、`GET /media/:id`、`GET /media/:id/stream`（支持 HTTP Range，在 `c.File` 前设置 `Content-Type`）、`GET /media/:id/subtitle`（解析的字句及每用户进度）、`GET /media/:id/cover`（封面，优先同名图片，回退视频流，音频无封面返回 404）、`GET /albums`。
- **标签 API** (`internal/handlers/tag.go`): CRUD 及 `POST /media/:id/tags` 覆盖式分配。
- **记录 API** (`internal/handlers/record.go`): `PUT /records/:mediaId`（mediaId 来自 URL，非 body）、`GET /records`、`GET /records/:mediaId`、`PUT /records/:mediaId/sentences/:idx`、`GET /progress`（按专辑/标签聚合）。
- **扫描 API** (`internal/handlers/scan.go`): `POST /scan/trigger`、`GET /scan/status`。
- **设置 API** (`internal/handlers/settings.go`): `GET /settings`、`PUT /settings`（每用户键值对）。
- **路由** (`internal/router/router.go`): 公开 `/auth/register`、`/auth/login`、`/health`；JWT 保护 `/media`、`/albums`、`/tags`、`/records`、`/progress`、`/settings`、`/scan`。
- **入口** (`cmd/server/main.go`): 启动配置、数据库、扫描器监听、路由；从 `frontend/dist` 提供前端 SPA 并支持 SPA 回退。
- **示例配置** (`backend/config.example.yaml`)。

#### 前端 (React 19 + TypeScript 6 + Vite 8 + Ant Design 6)

- **工具链**: Vite 配置，`@` → `./src` 别名，`/api` 代理到 `localhost:8080`；`tsconfig.app.json` 使用 `paths` 而不使用已弃用的 `baseUrl`（兼容 TS 6.0）。
- **类型** (`src/types/index.ts`): 完整的 TypeScript 定义，与后端 DTO 对应。
- **API 客户端** (`src/api/`): axios 实例，附带 JWT 和 401 重定向拦截器；`authApi`/`mediaApi`/`tagApi`/`recordApi`/`settingsApi`/`scanApi`/`noteApi`。
- **状态** (`src/store/`): `zustand` 存储，用于 `auth`（localStorage 持久化的令牌/用户，模块加载时同步 `hydrate()` 恢复 JWT）和 `settings`。
- **路由** (`src/router/index.tsx`): `ProtectedRoute` 包装器，支持懒加载页面。
- **布局** (`src/layouts/MainLayout.tsx`): Ant Design 侧边栏 + 头部外壳。
- **页面**:
  - `Login.tsx`: 登录/注册标签页，带表单验证，「记住密码」复选框（localStorage 存储凭据）。
  - `Home.tsx`: 媒体卡片网格，支持关键词搜索、类型筛选、排序、专辑/标签下钻、播放进度预览。
  - `Albums.tsx`: 专辑网格，显示数量。
  - `Tags.tsx`: 标签 CRUD，显示使用次数。
  - `Records.tsx`: 学习统计、表格和进度条。
  - `Settings.tsx`: 学习偏好表单（重复次数、暂停秒数、循环次数）。
  - `Player.tsx`: 媒体 + 字幕加载器，返回按钮在标题左侧。
  - `StudyNotes.tsx` / `NoteEditor.tsx`: 学习页面列表与编辑器（独立路由 `/notes/:id`）。
  - `Upload.tsx`: 媒体上传与目录浏览。
- **MediaPlayer 组件** (`src/components/MediaPlayer.tsx`): 核心播放器，支持逐句重复（M 次）、句间暂停（K 秒）、整体循环（N 次，默认 3 次）、节流进度保存（5 秒）、可点击字幕列表，带当前句高亮和完成标记。播放速度 +/- 按钮微调（0.1 步进，0.5-2.0 范围）。字幕区分「全文」与「收藏句子」两个 Tab。使用 refs（`handlingEndRef`、`sentenceRepeatRef`、`overallLoopRef`、`pauseTimerRef`、`modeRef`）避免事件回调中的闭包过期问题。
- **MediaCover 组件** (`src/components/MediaCover.tsx`): 处理视频/音频/图片封面，音频无封面时按 `colorKey` 哈希生成浅色 HSL 背景。

#### 移动端、PWA 与会话

- **响应式布局**: `MainLayout` 在屏幕小于 `lg` 断点时切换为滑入式 `Drawer` 菜单（头部有汉堡按钮），移动端内边距更紧凑。`Home.tsx` 筛选行在 `xs` 时重排为单列堆叠，`sm` 时为两列。`Login.tsx` 卡片为流式布局（`maxWidth: 400`，`width: 100%`），外 padding 响应式。
- **PWA 支持**: 集成 `vite-plugin-pwa` (1.3.0)，`autoUpdate` 注册，`devOptions.enabled` 用于本地测试，Web App Manifest（`name=EchoSub`、`theme_color=#FF7A45`、`display=standalone`、`lang=zh-CN`）。在 `frontend/public/` 下生成 `pwa-192.png` 和 `pwa-512.png` 图标（含 maskable 变体）。`index.html` 添加 `theme-color`、`apple-touch-icon`、`apple-mobile-web-app-capable` 和 `viewport-fit=cover` 视口。`main.tsx` 通过 `virtual:pwa-register` 注册 service worker。
- **Workbox 运行时缓存**: 媒体流请求（`/api/v1/media/:id/stream`）使用 `NetworkOnly` 以保留 Range/令牌语义；其他 `/api/*` 调用使用 `NetworkFirst`，5 秒超时，短期缓存。
- **记住密码**: `Login.tsx` 添加"记住密码"复选框（仅登录标签页）。勾选后，凭据存储在 `localStorage` 的 `echosub_remember` 中，下次访问时预填充。取消勾选则清除该条目。
- **刷新时的会话持久化**: `useAuthStore.getState().hydrate()` 现已在模块加载时调用（`store/auth.ts`），因此 JWT 在 `ProtectedRoute` 渲染前同步恢复——刷新受保护页面不再跳转到 `/login`。

#### 媒体封面与类型徽章

- **后端封面扫描** (`internal/scanner/scanner.go`): 添加 `findCover()`，仿照 `findSubtitle()` 在媒体目录中查找同名图片（`.jpg/.jpeg/.png/.webp`）。`upsertMedia` 现填充 `MediaFile.CoverPath`。`MediaConfig` 新增 `SupportedImages`。
- **前端 `MediaCover.tsx`**: 视频用 `<video>` 首帧作封面，音频用同名图片，无则渐变占位；封面左上角类型 Tag（magenta 视频 / green 音频）。
- **前端 `Home.tsx` / `Albums.tsx`**: 卡片封面右上角专辑名 Tag。

#### 子专辑（嵌套文件夹支持）

- **后端**: `MediaFile.SubAlbum` 字段从媒体根目录下第二段路径派生（如 `media_root/English/Unit1.mp3` -> album=`English`, sub_album=`Unit1`）。`scanner.upsertMedia` 填充该字段；`ListMedia` 接受 `sub_album` 查询过滤；`ListAlbums` 返回每个专辑的 `sub_albums: [{sub_album, count}]` 数组。
- **前端**: `Home.tsx` 显示子专辑筛选下拉框（仅当所选专辑有子专辑时显示）与 `cyan` 子专辑 Tag；`Albums.tsx` 在专辑卡片内渲染子专辑 Tag，点击跳转 `/?album=...&sub_album=...`。新增类型 `MediaFile.sub_album` 与 `Album.sub_albums`。

#### 句子收藏（精听模式）

- **后端**: `SentenceProgress.Favorited` 布尔字段；`POST /records/:mediaId/sentences/:idx/favorite` 切换收藏；`GetSubtitle` 返回每句的 `favorited`。
- **前端**: `MediaPlayer.tsx` 在每行字幕渲染星标切换（调用 `recordApi.toggleFavorite`，乐观更新带错误回滚）。字幕区改为 `Tabs`：「全文」与「收藏句子」两个面板；收藏面板仅列出已收藏句子，带数量徽章，点击跳转播放。

#### 学习页面（自定义学习笔记）

- **后端**: 新建 `StudyNote` 模型（`id, user_id, album, title, content:text, images:text(JSON), timestamps, soft-delete`）。`/notes` 下完整 CRUD：`GET /notes?album=`、`POST /notes`、`GET/PUT/DELETE /notes/:id`。图片端点：`POST /notes/:id/images`（multipart 多文件，按名去重）、`DELETE /notes/:id/images/:filename`、`GET /notes/:id/images/:filename`（鉴权，支持 `?token=`）。图片存储在 `data/note-images/<note_id>/`。
- **前端**: 新建 `StudyNotes.tsx` 页面（路由 `/notes`）。专辑作用域列表 + 创建弹窗；编辑器内联标题编辑、Markdown 预览/编辑切换（默认预览，`react-markdown` + `remark-gfm`，编辑显示原始 textarea）、多图画廊（上/下一张按钮、缩略图条、点击全屏 via antd `Image` 预览、单图删除）、TTS 朗读按钮调用 VoiceCraft API（`https://tts.wangwangit.com/v1/audio/speech`，voice `en-US-JennyNeural`）播放返回的音频 blob。
- **依赖**: `react-markdown@10.1.0`、`remark-gfm@4.0.1`。

#### 播放体验优化

- **默认循环次数** 从 1 提升到 3（`store/settings.ts` `DEFAULTS.loop_count` 与 `MediaPlayer` 兜底）。
- **播放次数显示**: `MediaPlayer` 接受 `playCount` prop，在控制栏显示「已听 N 遍」Tag；每行字幕在 `repeat_count > 0` 时显示「听 N 遍」Tag。
- **精细播放速度**: 用 `+`/`-` 圆形按钮替代固定 `Select`，0.1 步进，0.5-2.0 范围，浮点取整避免漂移；当前速率显示为 `N.Nx`。
- **播放器头部**: 返回按钮移到标题行右侧（仅图标，无「返回」文字）；标题下方的「文件名 · 时长」副标题行已移除以节省垂直空间。

#### 宽屏布局

- `Home.tsx` 与 `Albums.tsx` 卡片网格断点扩展 `xl`/`xxl`，宽屏桌面每行显示更多列，减少两侧空白；筛选行列宽同步加宽。

### Changed

- `frontend/src/types/index.ts`: `Sentence` 增加 `favorited: boolean`；`MediaFile` 增加 `sub_album: string | null`；新增 `SubAlbum` 接口与 `StudyNote` 接口。
- `frontend/src/api/index.ts`: 新增 `recordApi.toggleFavorite`；`mediaApi.list` 接受 `sub_album`；新增 `noteApi` 模块（list/create/get/update/delete/uploadImages/deleteImage/imageUrl）。
- `backend/internal/router/router.go`: 注册收藏切换路由与完整 `/notes` 路由组。
