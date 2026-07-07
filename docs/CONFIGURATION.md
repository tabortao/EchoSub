# CONFIGURATION.md — EchoSub 后端配置 & 部署指南

> 版本：v1.3.2（2026-07-07）
>
> 本文档列出 EchoSub 后端所有可配置项、推荐配置、以及**国内网络环境下网页词典 / AI 翻译需要走代理的解决方法**。
>
> 配置优先级：**环境变量 > config.yaml > 代码默认值**。
>
> 关联文档：[README.md](../README.md) · [ChangeLog.md](ChangeLog.md) · [PLAN.md](PLAN.md) · [TASKS.md](TASKS.md) · [CLAUDE.md](../CLAUDE.md)

---

## 一、配置总览

| 类别 | 环境变量前缀 | 是否必填 | 默认值 | 用途 |
|------|-------------|---------|--------|------|
| HTTP 端口 | `ECHOSUB_PORT` | ❌ | `8080` | 后端监听端口 |
| 数据库 | `ECHOSUB_DB_PATH` | ❌ | `data/echosub.db` | SQLite 文件路径 |
| JWT | `ECHOSUB_JWT_SECRET` | ⚠️ 生产必填 | `change-me-in-production` | JWT 签名密钥 |
| 媒体目录 | `ECHOSUB_MEDIA_DIR` | ⚠️ 必填 | `/media` | 被扫描的媒体文件夹 |
| **AI 翻译** | `ECHOSUB_AI_*` | ❌ | — | OpenAI 兼容 API（v0.8.0） |
| **AI 代理** | `ECHOSUB_AI_PROXY` | ❌ | — | AI 请求代理（v1.3.1） |
| **网页词典** | `ECHOSUB_WEBDICT_*` | ❌ | — | 抓取超时 / 重试 / 缓存（v1.3.1） |
| **网页词典代理** | `ECHOSUB_WEBDICT_PROXY` | ❌ | — | 网页词典抓取代理（v1.3.1） |
| **系统级代理** | `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | ❌ | — | 全局代理（v1.3.1 起生效） |
| 内置词典 | `ECHOSUB_BUILTIN_DICT_CSV` | ❌ | `backend/data/dict/ecdict.csv` | ECDICT 词库路径 |

> 详细表格见后续章节。

---

## 二、基础配置

### 2.1 `ECHOSUB_PORT`

HTTP 端口。

```bash
ECHOSUB_PORT=8080
```

### 2.2 `ECHOSUB_DB_PATH`

SQLite 文件路径。启动时自动创建父目录。

```bash
ECHOSUB_DB_PATH=/data/echosub.db           # Linux / Docker
ECHOSUB_DB_PATH=D:\data\echosub.db         # Windows
```

### 2.3 `ECHOSUB_JWT_SECRET`

JWT 签名密钥。**生产环境必须修改**（启动会打印 WARN 提示）。

```bash
ECHOSUB_JWT_SECRET=$(openssl rand -hex 32)   # 64 字符随机串
```

### 2.4 `ECHOSUB_MEDIA_DIR`

被扫描的媒体文件夹。启动时若不存在会自动创建。

```bash
ECHOSUB_MEDIA_DIR=/media                    # Linux / Docker
ECHOSUB_MEDIA_DIR=D:\Media                  # Windows
```

---

## 三、AI 翻译配置（v0.8.0）

所有 AI 配置仅通过**环境变量**注入，**不会**写入 config.yaml 或数据库。原因：API key 敏感，避免明文落盘。

| 环境变量 | 必填 | 默认值 | 说明 |
|----------|------|--------|------|
| `ECHOSUB_AI_BASE_URL` | ⚠️ | `https://api.openai.com/v1` | OpenAI 兼容 base url |
| `ECHOSUB_AI_API_KEY` | ⚠️ | （空） | API 密钥 |
| `ECHOSUB_AI_MODEL` | ❌ | `gpt-4o-mini` | 模型名 |
| `ECHOSUB_AI_TARGET_LANG` | ❌ | `Chinese` | 默认目标语言 |
| `ECHOSUB_AI_TIMEOUT` | ❌ | `60` | 单次请求超时（秒） |
| **`ECHOSUB_AI_PROXY`** | ❌ | （空） | **AI 代理 URL（v1.3.1 起）** |

启用判定：必须 `ECHOSUB_AI_BASE_URL` 与 `ECHOSUB_AI_API_KEY` **都**有值。

### 3.1 配置示例

```bash
# OpenAI 官方
export ECHOSUB_AI_BASE_URL="https://api.openai.com/v1"
export ECHOSUB_AI_API_KEY="sk-xxxxxxxx"
export ECHOSUB_AI_MODEL="gpt-4o-mini"

# DeepSeek
export ECHOSUB_AI_BASE_URL="https://api.deepseek.com/v1"
export ECHOSUB_AI_API_KEY="sk-xxxxxxxx"
export ECHOSUB_AI_MODEL="deepseek-chat"

# 通义千问 DashScope（OpenAI 兼容模式）
export ECHOSUB_AI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export ECHOSUB_AI_API_KEY="sk-xxxxxxxx"
export ECHOSUB_AI_MODEL="qwen-plus"

# 本地 Ollama
export ECHOSUB_AI_BASE_URL="http://localhost:11434/v1"
export ECHOSUB_AI_API_KEY="ollama"      # Ollama 不校验 key
export ECHOSUB_AI_MODEL="qwen2.5:7b"
```

### 3.2 AI 代理配置（v1.3.1 起）

如果 OpenAI / Anthropic 等海外 API 在国内访问慢 / 被墙，通过 `ECHOSUB_AI_PROXY` 走代理。

**支持协议**：`http://` · `https://` · `socks5://`

```bash
# HTTP 代理（如 Clash / V2RayN 默认 7890 端口）
export ECHOSUB_AI_PROXY="http://127.0.0.1:7890"

# SOCKS5 代理
export ECHOSUB_AI_PROXY="socks5://127.0.0.1:1080"

# 带认证
export ECHOSUB_AI_PROXY="http://user:pass@proxy.example.com:8080"
```

> 也可以不设置 `ECHOSUB_AI_PROXY`，而是用系统级 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量（v1.3.1 起生效）。

---

## 四、网页词典抓取配置（v1.3.0 起，v1.3.1 重构，v1.3.2 增强按域名分流 + 翻译型源 + 词义持久化）

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ECHOSUB_WEBDICT_TIMEOUT` | `15` | 单次抓取超时（秒） |
| `ECHOSUB_WEBDICT_RETRIES` | `1` | 失败重试次数（共请求 = retries+1 次） |
| `ECHOSUB_WEBDICT_CACHE_MINUTES` | `60` | 内存缓存时长（分钟），`0` 禁用 |
| **`ECHOSUB_WEBDICT_PROXY`** | （空） | **网页词典抓取代理（v1.3.1 起）** |
| **`ECHOSUB_WEBDICT_SKIP_PROXY`** | 8 个中文域名（见下） | **跳过代理的域名列表（v1.3.2 起，逗号分隔；写 `none` 清空）** |
| **`ECHOSUB_WEBDICT_ONLY_PROXY`** | （空） | **只对列表内域名走代理（v1.3.2 起，逗号分隔；写 `none` 清空）** |

### 4.0 v1.3.2 新增：按域名分流代理 + 翻译型源（百度/谷歌）+ 词义持久化

v1.3.1 引入 `ECHOSUB_WEBDICT_PROXY` 后国内用户集中反馈两类问题：

| 现象 | 原因 | v1.3.2 修复 |
|------|------|-------------|
| 开代理后有道词典失效 | 境外 IP 访问 `m.youdao.com` 被风控或返回简版 | 默认 `SkipProxyHosts` 含 `youdao.com`，强制直连 |
| Cambridge / Oxford / Merriam-Webster / Collins 仍 403 | Merriam-Webster 桌面 UA 被识别为爬虫 | 改用 **Mobile Safari** UA（移动版可抓） |
| Cambridge 等 403 | 没 Referer，部分站点识别为爬虫 | 模拟从 Google 搜索点过来（带 `Referer`） |
| 用户想要的"百度翻译 / 谷歌翻译" | Cambridge / Oxford 等 JS SPA 难抓 | 新增 2 个翻译型源（公开 API，**无需 key**） |
| 收藏的单词每次都要重新查 | 弹窗内只展示，没存到数据库 | `WordFavorite.QueryResult` 词义快照永久存储，零网络请求秒开 |

#### 4.0.1 默认 `SkipProxyHosts`（v1.3.2 起开箱即用）

```
youdao.com
baidu.com
baidupc.com
translate.google.com
translate.googleapis.com
gstatic.com
ggpht.com
googleapis.com
```

这些域名从境外 IP 访问反而被风控或返回简版页面，应该直连国内。

**环境变量优先级**：

- **不设置** `ECHOSUB_WEBDICT_SKIP_PROXY` → 走默认 8 个域名
- **设置为空字符串** `ECHOSUB_WEBDICT_SKIP_PROXY=""` → 走默认（与不设置等价）
- **显式写 `none`** → 清空默认，所有域名都走代理
- **写其他值**（如 `youdao.com,dict.baidu.com`）→ 覆盖默认

**多值分隔**：半角逗号（`,`），前后空格自动 trim。

#### 4.0.2 推荐配置（v1.3.2 国内网络）

```bash
# 走代理（仅英文词典）
export ECHOSUB_WEBDICT_PROXY="http://127.0.0.1:7890"

# 默认 SkipProxyHosts 已包含 youdao / baidu / google，国内直连
# 如需调整：
# 1) 取消默认，全部走代理：ECHOSUB_WEBDICT_SKIP_PROXY="none"
# 2) 添加额外跳过域名：ECHOSUB_WEBDICT_SKIP_PROXY="youdao.com,baidu.com,qq.com"
# 3) 严格白名单模式：ECHOSUB_WEBDICT_ONLY_PROXY="dictionary.cambridge.org,www.oxfordlearnersdictionaries.com,www.ldoceonline.com,www.merriam-webster.com,www.collinsdictionary.com,en.wiktionary.org"
```

#### 4.0.3 翻译型源（v1.3.4 微软翻译 Edge API）

**v1.3.4 起精简为 1 个翻译型源**——微软翻译（替代 v1.3.3 移除的百度翻译 / 谷歌翻译）。

- **微软翻译**（id: `microsoft`）：两步式 Edge 翻译 API（**无需 key**）：
  - 步骤 1：`GET https://edge.microsoft.com/translate/auth` → 拿到短期 JWT token（默认 10 分钟有效，后端缓存 8 分钟）
  - 步骤 2：`POST https://api-edge.cognitive.microsofttranslator.com/translate?from=auto&to=zh-Hans&api-version=3.0` 带 `Authorization: Bearer {token}` → 返回结构化 JSON
  - 响应示例：`[{"detectedLanguage":{"language":"en","score":1.0},"translations":[{"text":"你好","to":"zh-Hans"}]}]`

特点：

- 无 API key 门槛（与百度 / 谷歌翻译一样）
- 反爬友好（Edge 浏览器自家后端，不对自家 UA 限流）
- 响应快（国内走代理 ~300ms，海外直连 ~500ms）
- 翻译型源 `ForceProxy=true`（源级声明）—— 国内用户**必须**配置 `ECHOSUB_WEBDICT_PROXY`，否则 i/o timeout（`edge.microsoft.com` 国内直连被 TCP 阻断）

#### 4.0.4 词义持久化（v1.3.2 起）

`WordFavorite.QueryResult` 字段把查词结果原样存为 JSON 字符串。下次查同词时：

```
GET /api/v1/dictionary/web/lookup?source=...&word=hello
   ↓
[1] 进程内内存缓存（5min for translate, 60min for html）
   miss ↓
[2] 收藏词义快照（永久, 跨进程/跨重启/跨设备）   ← v1.3.2 新增
   miss ↓
[3] 实际网络抓取 / 翻译 API 调用
```

**效果**：即使 Cambridge / Oxford 全部失效、即使代理挂了，已收藏的单词仍能秒开；**离线场景可用**。

**刷新快照**：再次调用 `wordFavoriteApi.create` 时若传了非空 `query_result` 字段，后端会覆盖旧快照。



### 4.1 痛点与解决（v1.3.0 → v1.3.1 修复）

v1.3.0 上线后，国内用户反馈**大量抓取失败**：

| 现象 | 原因 | v1.3.1 修复 |
|------|------|-------------|
| `context deadline exceeded` | 后端直连海外网站超时 | 默认超时 6s → 15s；可调大到 30s |
| `HTTP 403` | 有道 / 朗文 等有反爬 | 补充完整浏览器请求头（Sec-Fetch-*）；走代理绕过 IP 风控 |
| 抓取很慢 | 跨境连接差 | 内存缓存 60 分钟，同一词不重复抓 |
| 单词查词弹窗卡住 | 单次失败就报错 | 自动重试 1 次（仅 timeout / 网络错误）；失败也缓存 5 分钟避免重复触发 |
| 不知道要配置代理 | 没有文档 | 本文档 + 启动日志显示代理状态 |

### 4.2 推荐配置（国内网络）

```bash
# 方式 1：用 ECHOSUB_WEBDICT_PROXY 单独配（推荐）
export ECHOSUB_WEBDICT_PROXY="http://127.0.0.1:7890"
export ECHOSUB_WEBDICT_TIMEOUT=20
export ECHOSUB_WEBDICT_RETRIES=2

# 方式 2：用系统级 HTTPS_PROXY（影响所有出站 HTTP，包括 AI）
export HTTPS_PROXY="http://127.0.0.1:7890"
# 站点 / IP 例外
export NO_PROXY="localhost,127.0.0.1,::1,.local"

# 方式 3：SOCKS5 代理
export ECHOSUB_WEBDICT_PROXY="socks5://127.0.0.1:1080"
```

### 4.3 启动日志

启动时会打印代理与超时配置，便于排查：

```
[INFO] 网页词典抓取：超时 15s, 重试 1 次, 缓存 60 分钟（未配置代理）
[INFO] 网页词典代理：http://127.0.0.1:7890（超时 20s, 重试 2 次, 缓存 60 分钟）
```

---

## 五、代理系统设计（v1.3.1）

### 5.1 代理优先级

```
请求出站
  ├─ 调用方指定代理？
  │   ├─ AI 请求：ECHOSUB_AI_PROXY（v1.3.1）
  │   └─ 网页词典：ECHOSUB_WEBDICT_PROXY（v1.3.1）
  │
  ├─ 系统级环境变量？（Go http.ProxyFromEnvironment）
  │   ├─ HTTPS_PROXY
  │   ├─ HTTP_PROXY
  │   └─ NO_PROXY（排除列表，逗号分隔）
  │
  └─ 直连
```

> `ECHOSUB_AI_PROXY` / `ECHOSUB_WEBDICT_PROXY` **不**会被 `NO_PROXY` 绕过；它们是显式配置。
>
> 仅当 `ECHOSUB_AI_PROXY` / `ECHOSUB_WEBDICT_PROXY` **为空**时，`HTTPS_PROXY` / `HTTP_PROXY` 才生效。

### 5.2 支持的代理协议

| 协议 | 例子 | 适用场景 |
|------|------|---------|
| `http://` | `http://127.0.0.1:7890` | Clash、V2RayN（HTTP 模式）、Squid |
| `https://` | `https://proxy.example.com:8080` | HTTPS 代理 |
| `socks5://` | `socks5://127.0.0.1:1080` | SOCKS5 代理（v1.3.1 起支持，需 Go 1.20+） |

### 5.3 代理验证

启动后日志会显示代理状态。在「设置 → 🤖 AI 翻译」中点「⚡ 测试连通性」可验证 AI 代理；网页词典可通过前端「查词弹窗」实际查词验证。

---

## 六、内置词典 ECDICT（v1.1.0）

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ECHOSUB_BUILTIN_DICT_CSV` | `backend/data/dict/ecdict.csv` | ECDICT 词库 CSV 路径 |

路径解析顺序：
1. 环境变量 `ECHOSUB_BUILTIN_DICT_CSV`
2. `backend/data/dict/ecdict.csv`（开发）
3. `data/dict/ecdict.csv`（生产）
4. `<exe>/data/dict/ecdict.csv`（单二进制）

> 详见 [ChangeLog v1.1.0](ChangeLog.md#v110---2026-07-06)。

---

## 七、Docker 部署

### 7.1 `docker run` 命令

```bash
docker run -d \
  --name echosub \
  -p 8080:8080 \
  -v /your/media:/media:ro \
  -v /your/data:/data \
  -e ECHOSUB_JWT_SECRET="$(openssl rand -hex 32)" \
  -e ECHOSUB_MEDIA_DIR=/media \
  -e ECHOSUB_DB_PATH=/data/echosub.db \
  -e ECHOSUB_AI_BASE_URL="https://api.openai.com/v1" \
  -e ECHOSUB_AI_API_KEY="sk-xxxxxxxx" \
  -e ECHOSUB_AI_MODEL="gpt-4o-mini" \
  -e ECHOSUB_AI_PROXY="http://host.docker.internal:7890" \
  -e ECHOSUB_WEBDICT_PROXY="http://host.docker.internal:7890" \
  -e ECHOSUB_WEBDICT_TIMEOUT=20 \
  -e ECHOSUB_WEBDICT_RETRIES=2 \
  ghcr.io/tabortao/echosub:latest
```

> ⚠️ **Docker 内的代理地址**：`host.docker.internal` 指向宿主机的 127.0.0.1，
> 适合「容器跑在 Windows / macOS 桌面 + 代理在宿主机」的场景。
> Linux 下需用宿主机的 `172.17.0.1` 或宿主 IP 替代。

### 7.2 `docker-compose.yml`

```yaml
version: '3.8'

services:
  echosub:
    image: ghcr.io/tabortao/echosub:latest
    container_name: echosub
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - /your/media:/media:ro          # 媒体目录（只读）
      - /your/data:/data                # 数据库 + 词库
    environment:
      # ===== 基础 =====
      ECHOSUB_PORT: "8080"
      ECHOSUB_MEDIA_DIR: "/media"
      ECHOSUB_DB_PATH: "/data/echosub.db"
      ECHOSUB_JWT_SECRET: "${ECHOSUB_JWT_SECRET:?please set in .env}"

      # ===== AI 翻译 =====
      ECHOSUB_AI_BASE_URL: "https://api.openai.com/v1"
      ECHOSUB_AI_API_KEY: "${ECHOSUB_AI_API_KEY}"
      ECHOSUB_AI_MODEL: "gpt-4o-mini"
      ECHOSUB_AI_TARGET_LANG: "Chinese"
      ECHOSUB_AI_TIMEOUT: "60"
      ECHOSUB_AI_PROXY: "http://host.docker.internal:7890"  # v1.3.1：海外 API 走代理

      # ===== 网页词典抓取 =====
      ECHOSUB_WEBDICT_PROXY: "http://host.docker.internal:7890"  # v1.3.1
      ECHOSUB_WEBDICT_TIMEOUT: "20"   # 默认 15；可按网络情况调大
      ECHOSUB_WEBDICT_RETRIES: "2"    # 默认 1；网络差时调大
      ECHOSUB_WEBDICT_CACHE_MINUTES: "60"

      # ===== 内置词典 =====
      ECHOSUB_BUILTIN_DICT_CSV: "/data/dict/ecdict.csv"

      # ===== 系统级代理（备选）=====
      # HTTPS_PROXY: "http://host.docker.internal:7890"
      # HTTP_PROXY: "http://host.docker.internal:7890"
      # NO_PROXY: "localhost,127.0.0.1,::1,.local"
```

`.env` 文件：

```ini
ECHOSUB_JWT_SECRET=your-random-secret-min-32-chars
ECHOSUB_AI_API_KEY=sk-xxxxxxxx
```

### 7.3 常见 Docker 场景

#### 场景 1：海外服务器（无墙）

```yaml
services:
  echosub:
    image: ghcr.io/tabortao/echosub:latest
    environment:
      ECHOSUB_AI_BASE_URL: "https://api.openai.com/v1"
      ECHOSUB_AI_API_KEY: "sk-xxxxxxxx"
      # 不需要任何代理
```

#### 场景 2：国内服务器 + Clash 跑在宿主机

```yaml
services:
  echosub:
    image: ghcr.io/tabortao/echosub:latest
    environment:
      ECHOSUB_AI_BASE_URL: "https://api.openai.com/v1"
      ECHOSUB_AI_API_KEY: "sk-xxxxxxxx"
      ECHOSUB_AI_PROXY: "http://host.docker.internal:7890"           # 代理
      ECHOSUB_WEBDICT_PROXY: "http://host.docker.internal:7890"       # 代理
      ECHOSUB_WEBDICT_TIMEOUT: "20"
      ECHOSUB_WEBDICT_RETRIES: "2"
```

#### 场景 3：国内服务器 + 代理跑在另一台机器

```yaml
services:
  echosub:
    image: ghcr.io/tabortao/echosub:latest
    environment:
      ECHOSUB_AI_PROXY: "http://user:pass@10.0.0.5:8080"
      ECHOSUB_WEBDICT_PROXY: "socks5://10.0.0.5:1080"
      ECHOSUB_WEBDICT_TIMEOUT: "30"
```

#### 场景 4：使用国内 AI（中转站 / DeepSeek / 通义）

```yaml
services:
  echosub:
    image: ghcr.io/tabortao/echosub:latest
    environment:
      # DeepSeek（国内直连，无需代理）
      ECHOSUB_AI_BASE_URL: "https://api.deepseek.com/v1"
      ECHOSUB_AI_API_KEY: "sk-xxxxxxxx"
      ECHOSUB_AI_MODEL: "deepseek-chat"
      # 网页词典仍需代理
      ECHOSUB_WEBDICT_PROXY: "http://host.docker.internal:7890"
```

---

## 八、Kubernetes / Helm 部署（参考）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echosub
spec:
  replicas: 1
  selector:
    matchLabels:
      app: echosub
  template:
    metadata:
      labels:
        app: echosub
    spec:
      containers:
        - name: echosub
          image: ghcr.io/tabortao/echosub:latest
          ports:
            - containerPort: 8080
          env:
            - name: ECHOSUB_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: echosub-secrets
                  key: jwt-secret
            - name: ECHOSUB_AI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: echosub-secrets
                  key: ai-api-key
            - name: ECHOSUB_AI_PROXY
              value: "http://corp-proxy.default.svc.cluster.local:8080"
            - name: ECHOSUB_WEBDICT_PROXY
              value: "http://corp-proxy.default.svc.cluster.local:8080"
          volumeMounts:
            - name: data
              mountPath: /data
            - name: media
              mountPath: /media
              readOnly: true
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: echosub-data
        - name: media
          nfs:
            server: media-nfs.internal
            path: /exports/media
```

---

## 九、systemd 服务（Linux 自部署）

`/etc/systemd/system/echosub.service`：

```ini
[Unit]
Description=EchoSub
After=network.target

[Service]
Type=simple
User=echosub
Group=echosub
WorkingDirectory=/opt/echosub
ExecStart=/opt/echosub/echosub-server
Restart=always
RestartSec=5

# 基础配置
Environment=ECHOSUB_PORT=8080
Environment=ECHOSUB_MEDIA_DIR=/var/media
Environment=ECHOSUB_DB_PATH=/var/lib/echosub/echosub.db
Environment=ECHOSUB_JWT_SECRET=__replace_with_random__

# AI 翻译
Environment=ECHOSUB_AI_BASE_URL=https://api.openai.com/v1
Environment=ECHOSUB_AI_API_KEY=__replace__
Environment=ECHOSUB_AI_MODEL=gpt-4o-mini

# 代理（按需）
Environment=ECHOSUB_AI_PROXY=http://127.0.0.1:7890
Environment=ECHOSUB_WEBDICT_PROXY=http://127.0.0.1:7890
Environment=ECHOSUB_WEBDICT_TIMEOUT=20
Environment=ECHOSUB_WEBDICT_RETRIES=2

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/echosub /var/log/echosub

[Install]
WantedBy=multi-user.target
```

---

## 十、配置验证清单

部署完成后，按顺序验证：

### 10.1 后端启动日志

```bash
docker logs echosub 2>&1 | grep INFO
```

应该看到类似：

```
[INFO] AI 翻译已启用：https://api.openai.com/v1 / gpt-4o-mini
[INFO]   AI 代理：http://127.0.0.1:7890
[INFO] 网页词典抓取：超时 20s, 重试 2 次, 缓存 60 分钟（未配置代理）
[INFO] 媒体目录: /media
[INFO] 已加载配置文件: /data/config.yaml    # 如果用了 yaml
```

### 10.2 API 健康检查

```bash
curl -s http://localhost:8080/api/v1/health
# → {"code":0,"message":"ok","data":{"status":"ok"}}
```

### 10.3 AI 连通性测试

```bash
# 先获取 token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123456"}' | jq -r .data.token)

# 测连通
curl -s -X POST http://localhost:8080/api/v1/ai/test \
  -H "Authorization: Bearer $TOKEN" | jq .
```

期望：

```json
{
  "code": 0,
  "data": {
    "ok": true,
    "enabled": true,
    "model": "gpt-4o-mini",
    "base_url_host": "api.openai.com",
    "sample_translation": "你好",
    "latency_ms": 1234,
    "message": "连通正常"
  }
}
```

### 10.4 网页词典抓取验证

```bash
# 测试有道
curl -s "http://localhost:8080/api/v1/dictionary/web/lookup?source=youdao&word=hello" \
  -H "Authorization: Bearer $TOKEN" | jq .data.blocked,.data.error

# 测试 Cambridge
curl -s "http://localhost:8080/api/v1/dictionary/web/lookup?source=cambridge&word=hello" \
  -H "Authorization: Bearer $TOKEN" | jq .data.blocked,.data.error
```

期望：`blocked` 为 `false`，`error` 为 `null`（或 `""`）。

如果 `blocked=true` 且 `error` 含 "context deadline exceeded" → 调大 `ECHOSUB_WEBDICT_TIMEOUT` 或配置代理。
如果 `blocked=true` 且 `error` 含 "HTTP 403" → 站点反爬，配置代理后重试。

---

## 十一、故障排查

### 11.1 网页词典 timeout

**现象**：`error: "请求失败: Get \"...\": context deadline exceeded (Client.Timeout exceeded while awaiting headers)"`

**解决**：

1. 调大超时：`ECHOSUB_WEBDICT_TIMEOUT=30`
2. 配置代理：`ECHOSUB_WEBDICT_PROXY=http://127.0.0.1:7890`
3. 减少重试：`ECHOSUB_WEBDICT_RETRIES=0`（避免长延迟）

### 11.2 AI 接口 timeout / 403

**现象**：`调用 AI 接口失败: ...` 或 `AI 服务返回 403`

**解决**：

1. 配置代理：`ECHOSUB_AI_PROXY=http://127.0.0.1:7890`
2. 改用国内 AI：DeepSeek / 通义千问 / 智谱 GLM（见 §3.1）
3. 检查网络：`curl -x http://127.0.0.1:7890 https://api.openai.com/v1/models`

### 11.3 代理没生效

**检查**：

1. 启动日志是否打印代理（`[INFO] 网页词典代理：http://...`）
2. 容器内是否能访问代理：`docker exec echosub curl -x http://host.docker.internal:7890 https://www.google.com`
3. Linux 容器用 `172.17.0.1` 替代 `host.docker.internal`：
   ```bash
   ECHOSUB_AI_PROXY="http://172.17.0.1:7890"
   ```

### 11.4 JWT 报「默认 secret」

**现象**：启动日志 `WARN: 使用默认 JWT secret，生产环境请通过 ECHOSUB_JWT_SECRET ...`

**解决**：

```bash
export ECHOSUB_JWT_SECRET=$(openssl rand -hex 32)
# 或在 docker-compose 用 secrets / .env
```

### 11.5 数据库被锁

**现象**：`database is locked`

**原因**：SQLite 写串行化。**不要**调高连接数。

**解决**：

1. 单进程部署：默认 `MaxOpenConns(1)` 已够
2. 多进程：先 `pkill` 旧进程，确认无残留 `go run` / `air` 监听
3. 删除残留 `-shm` / `-wal` 文件（数据库未正常关闭）

---

## 十二、变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.3.1 | 2026-07-06 | 新增本文档；新增 `ECHOSUB_AI_PROXY` / `ECHOSUB_WEBDICT_*` 5 个环境变量；网页词典支持代理 + 重试 + 缓存 + gzip/br 解压；AI 请求走代理 |
| v1.1.0 | 2026-07-06 | 内置词典 ECDICT（`ECHOSUB_BUILTIN_DICT_CSV`） |
| v0.8.0 | 2026-07-06 | AI 翻译（`ECHOSUB_AI_*` 5 个环境变量） |
| v0.1.0 | 2026-07-06 | 基础配置（`ECHOSUB_PORT` / `DB_PATH` / `JWT_SECRET` / `MEDIA_DIR`） |

---

**最后更新**：v1.3.1（2026-07-06，新增强制代理 + 配置文档）
