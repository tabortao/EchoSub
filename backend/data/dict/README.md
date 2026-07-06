# 内置词典数据目录（v1.1.0）

## ECDICT 词库

EchoSub 集成 ECDICT（English-Chinese Dictionary）作为内置离线词典。

- **项目地址**：https://github.com/skywind3000/ECDICT
- **协议**：GPLv3（详见项目根 `LICENSE`）
- **词条数**：约 77 万
- **原始大小**：~50 MB

## 首次部署

### 方式一：脚本下载（推荐）

```powershell
# 在项目根目录执行
powershell -ExecutionPolicy Bypass -File scripts\download-ecdict.ps1
```

### 方式二：手动下载

1. 访问 https://github.com/skywind3000/ECDICT/releases
2. 下载 `ecdict.csv`（约 50MB）
3. 放入本目录 `ecdict.csv`

### 方式三：跳过

如果不需要内置词典，可直接删除 `ecdict.csv`。
后端启动时会检测到 CSV 缺失并跳过导入，`/dictionary/builtin/status` 返回 `available: false`。

## 自动导入机制

后端启动时（`main.go → handlers.EnsureImported()`）会：

1. 查找 `ecdict.csv`（路径解析顺序见 `builtin_dict.go: resolveBuiltinDictCSVPath`）
2. 若表内已有数据 → 跳过
3. 若表为空 + CSV 存在 → 异步导入（不阻塞启动）
4. 若 CSV 缺失 → 跳过

导入完成后 `/api/v1/dictionary/builtin/status` 返回：
```json
{
  "available": true,
  "entry_count": 770000,
  "csv_path": "D:\\Code\\Go\\EchoSub\\backend\\data\\dict\\ecdict.csv",
  "source": "ECDICT (ecdict.csv)"
}
```

## 重导

版本升级或 CSV 替换后，可通过以下方式重新导入：

- 前端：「设置 → 词典 → 内置词典」卡片中的「🔄 重新导入」按钮
- API：`POST /api/v1/dictionary/builtin/reload`

## 路径解析

| 顺序 | 路径 | 说明 |
|------|------|------|
| 1 | `$ECHOSUB_BUILTIN_DICT_CSV` | 环境变量显式指定 |
| 2 | `backend/data/dict/ecdict.csv` | 与项目根相对的固定路径 |
| 3 | `data/dict/ecdict.csv` | 工作目录下的相对路径 |
| 4 | `<exe 目录>/data/dict/ecdict.csv` | 与可执行文件并列 |

## 文件清单

- `ecdict.csv` — 正式词库文件（部署后存在，git 忽略）
- `ecdict.sample.csv` — 仅供单元测试 / 本地开发使用的样例数据
