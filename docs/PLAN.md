# PLAN.md — v0.4.0 迭代计划

> 状态：实施中 | 版本：v0.4.0 | 日期：2026-07-03

本次迭代包含 5 个需求，涉及播放器修复、主题系统、收藏播放、封面徽标、记录页美化。

## 需求 1：修复最后一句字幕 repeat_count 不增加

### 根因
- **Normal 模式**：媒体播放到最后一句末尾时，浏览器先触发 `ended` 事件，`timeupdate` 不再有机会在 `t >= end` 时触发。`onEnded` 处理函数中**没有**对当前句子调用 `incrementSentenceRepeat`。
- **Repeat 模式**：`allDone` 分支只调 `markSentenceCompleted(curIdx)`，未调 `incrementSentenceRepeat(curIdx)`。

### 修复方案
文件：`frontend/src/components/MediaPlayer.tsx`

1. **`onEnded`（Normal 模式）**：在循环/停止前，检查 `currentSentenceIdxRef.current`，若 `>= 0` 且该句尚未在本次「到达末尾」时计数，则调用 `incrementSentenceRepeat(lastIdx)`。
2. **Repeat 模式 `allDone` 分支**：在 `markSentenceCompleted(curIdx)` 之后，补调 `incrementSentenceRepeat(curIdx)`，确保最后一遍重复也被计数。

## 需求 2：设置中增加主题切换（小学生审美）

### 设计方案
新增 4 套主题，每套含主色、背景色、强调色：

| 主题 | 主色 | 风格 |
|------|------|------|
| 🌞 暖阳橙（默认） | `#FF7A45` | 当前风格，温暖活力 |
| 🌿 清新绿野 | `#52C41A` | 自然清新，护眼 |
| 💜 梦幻紫蓝 | `#722ED1` | 神秘梦幻 |
| 🌊 天空蓝 | `#1890FF` | 宁静专注 |

### 改动范围
| 文件 | 动作 |
|------|------|
| `backend/internal/models/models.go` | `Setting` 模型新增 `Theme string` 字段 |
| `backend/internal/handlers/settings.go` | `settingsReq` 新增 `Theme`，GET 返回时兜底默认值 `"default"` |
| `frontend/src/types/index.ts` | `Settings` 接口新增 `theme?: string` |
| `frontend/src/store/settings.ts` | 新增 `theme` 字段和默认值 |
| `frontend/src/theme/themes.ts` | **新建**：4 套主题的 antd token 定义 |
| `frontend/src/App.tsx` | 读取 store 中 theme，动态应用 ConfigProvider |
| `frontend/src/pages/Settings.tsx` | 新增「外观主题」卡片，4 个主题色块供选择 |

## 需求 3：收藏列表顺序播放

### 设计方案
在播放器的「收藏句子」Tab 旁增加「▶ 播放收藏」按钮。点击后进入「收藏播放模式」：
- 仅播放已收藏的句子，按句子索引升序
- 播放完当前收藏句后，自动跳到下一句收藏句的 `start` 时间
- 播放完最后一句收藏句后停止（或循环回第一句，根据整体循环设置）
- 退出收藏播放模式恢复普通播放

### 改动范围
| 文件 | 动作 |
|------|------|
| `frontend/src/components/MediaPlayer.tsx` | 新增 `favoritePlayMode` 状态；在 repeat 模式决策逻辑中，若处于收藏播放模式，下一句目标从 `favoriteSet` 中取下一个收藏索引；UI 增加「播放收藏」按钮 |

## 需求 4：封面右上角显示播放遍数

### 现状
- `EmbyHome.MediaCard` 已显示 `▶ {play_count}` ✅
- `Home.GridView` 卡片**未显示**（数据 `f.item.play_count` 已有）

### 改动
| 文件 | 动作 |
|------|------|
| `frontend/src/pages/Home.tsx` | GridView 的 Card 封面右上角增加 `▶ N` 橙色 Tag（play_count > 0 时显示） |

## 需求 5：美化学习记录页面

### 设计方案
保持功能不变，视觉升级：
- 汇总统计卡片：渐变背景 + 大号图标 + 数字动画感
- 周/月/年统计：更鲜明的柱状图配色，当前日高亮加强
- 专辑进度条：渐变色 + 完成百分比文字
- 播放记录表：斑马纹 + 行悬停高亮 + 专辑 Tag 彩色化
- 整体：区块间距优化、空状态美化

### 改动范围
| 文件 | 动作 |
|------|------|
| `frontend/src/pages/Records.tsx` | 全面美化样式 |

## 实施顺序

1. 播放器修复（需求1）— 逻辑修复，独立
2. 主题系统（需求2）— 后端+前端，独立
3. 收藏播放（需求3）— 依赖播放器，在需求1后
4. 封面播放次数（需求4）— 最小改动
5. 美化记录页（需求5）— 纯样式
6. ChangeLog + 版本号

## 验证清单

- [ ] `go build ./...` 通过
- [ ] `go vet ./...` 通过
- [ ] `go test ./... -v` 通过
- [ ] `pnpm build` 通过
- [ ] 播放音频/视频到最后一句，repeat_count 正常 +1
- [ ] 设置页切换主题后全局配色变化
- [ ] 收藏 3 句话后点「播放收藏」，只播放这 3 句并自动跳句
- [ ] GridView 封面右上角显示播放遍数
- [ ] 学习记录页面视觉升级生效
