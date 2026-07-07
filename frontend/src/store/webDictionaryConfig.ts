/**
 * 网页词典源配置（v0.9.2 起，v1.3.2 重构为后端 fetch + 弹窗内渲染，v1.3.3 移除 Cambridge/Merriam-Webster + 调整百度/谷歌，v1.3.4 移除 Collins/百度/谷歌 + 新增微软翻译）
 *
 * 重要变更（v1.3.2）：
 * - 之前：纯前端配置，按词拼 URL 后 window.open 跳新标签页
 * - 现在：后端负责抓取 / 翻译 API 调用，前端用 webDictApi.lookup() 拿结构化结果
 *   弹窗内直接渲染。
 * - 切换器仅用于「选择不同源 + 触发后端重新查」，不再需要 buildUrl
 *
 * 源类型（v1.3.2 起新增 kind 字段）：
 * - "html"     抓取目标 URL 的 HTML → 后端清洗（去噪+XSS）→ 弹窗内渲染
 *               适用于：youdao / oxford / longman / wiktionary
 * - "translate" 后端调公开翻译 API（无 key）→ 返回结构化 translation 字段
 *               适用于：microsoft（Edge 翻译 API，国内需代理）
 *
 * v1.3.3 调整：
 * - 移除 Cambridge、Merriam-Webster（长期被反爬，可靠性差）
 * - 百度翻译改用 dict.baidu.com/suggest 端点（避开已废弃的 fanyi.baidu.com/sug）
 *
 * v1.3.4 调整（重大）：
 * - 移除 Collins（v1.3.4，长期不稳定）
 * - 移除百度翻译（dict.baidu.com/suggest 也被风控）
 * - 移除谷歌翻译（translate.googleapis.com 国内 i/o timeout）
 * - 新增「微软翻译」：Edge 翻译 API（先拿 token，再调翻译接口）
 *   参考实现：docs/Reference/STranslate.Plugin.Translate.GoogleWebsite
 *
 * 新增一个网页词典只需在 [kWebDictConfigs] 加一行配置；
 * 1) 后端 web_dict.go 中注册源（kind / SkipProxy / ForceProxy / FetchTranslate 等）
 * 2) 在 types/index.ts 的 DictionarySourceId 联合类型加入新 id
 */
import type { WebDictLookupResponse } from '@/types'

export type WebDictKind = 'html' | 'translate'

export interface WebDictConfig {
  /** 稳定唯一 id（持久化键/缓存前缀/切换标识，与后端 kWebDictSources 一一对应） */
  id: string
  /** 切换器与设置页显示名（品牌名，不本地化） */
  displayName: string
  /** 列表 emoji 图标 */
  icon: string
  /** 品牌强调色（用于设置页卡片头像背景） */
  color: string
  /** v1.3.2 起新增：源类型
   *  - html：抓取 HTML（kind=html）
   *  - translate：调公开翻译 API（kind=translate）
   */
  kind: WebDictKind
  /** 可选：目标语言提示（en / zh / en-zh） */
  languageNote?: string
}

/** 全部网页词典配置（顺序即切换器排列顺序）。
 *
 * 说明：
 * - v1.3.4 起精简为 5 个源：youdao / oxford / longman / wiktionary / microsoft
 *   移除：cambridge / merriamWebster（v1.3.3）/ collins（v1.3.4）/ baidu / google（v1.3.4）
 * - 中文友好度优先级：有道 > 微软翻译 > 维基词典（英文释义）> 其余英英词典
 * - 翻译型源（microsoft）：Edge 翻译 API，无需 key，国内需配置 ECHOSUB_WEBDICT_PROXY
 *   - 后端从 edge.microsoft.com/translate/auth 拿短期 JWT token（缓存 8 分钟）
 *   - 再调 api-edge.cognitive.microsofttranslator.com/translate 翻译
 *   - 源标记 ForceProxy=true 强制走代理
 */
export const kWebDictConfigs: WebDictConfig[] = [
  {
    id: 'youdao',
    displayName: '有道词典',
    icon: '📕',
    color: '#EA4B35', // 有道暖红
    kind: 'html',
    languageNote: '中英 / 英英',
  },
  {
    id: 'microsoft',
    displayName: '微软翻译',
    icon: '🪟',
    color: '#0078D4', // 微软蓝
    kind: 'translate',
    languageNote: '多语',
  },
  {
    id: 'oxford',
    displayName: 'Oxford',
    icon: '📘',
    color: '#002147', // Oxford Blue
    kind: 'html',
    languageNote: '英英',
  },
  {
    id: 'longman',
    displayName: 'Longman',
    icon: '📚',
    color: '#3B4CB8', // 站点靛蓝
    kind: 'html',
    languageNote: '英英',
  },
  {
    id: 'wiktionary',
    displayName: 'Wiktionary',
    icon: '🌐',
    color: '#54595D', // Wikimedia 灰
    kind: 'html',
    languageNote: '多语',
  },
]

/** 按 id 查配置，找不到返回 undefined */
export function getWebDictConfig(id: string): WebDictConfig | undefined {
  return kWebDictConfigs.find((c) => c.id === id)
}

/** 翻译型源的简短展示（v1.3.2 起新增）
 *
 * 把后端返回的 WebDictLookupResponse 渲染为简短文本
 * 弹窗内 translation 字段非空时使用，避免 dangerouslySetInnerHTML
 */
export function renderTranslateSummary(data: WebDictLookupResponse): string {
  const t = (data.translation || '').trim()
  if (!t) return ''
  if (data.source_lang && data.target_lang) {
    return `${data.source_lang} → ${data.target_lang}：${t}`
  }
  return t
}
