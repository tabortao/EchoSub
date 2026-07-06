/**
 * 网页词典源配置（v0.9.2 起）
 *
 * 参考 Echo Loop `WebDictConfig` 模式：
 * - 网页词典（Cambridge / Oxford / Longman / Merriam-Webster / Collins /
 *   Vocabulary.com / Wiktionary / 有道）本质相同——不抓取/解析 HTML，只按词构造 URL，
 *   交给浏览器新标签页打开。差异仅在 URL 模板与品牌展示，故抽象为一份 [WebDictConfig]
 *   配置 + 一个通用 [lookupWebDictionary] 工具。
 * - 新增一个网页词典只需在 [kWebDictConfigs] 加一行配置。
 *
 * 与本地 / AI 词典的差异：
 * - 本地 / AI 词典返回结构化 `DictionaryResponse`，由前端渲染（弹窗 / 卡片）
 * - 网页词典直接打开浏览器到该 URL，无内容可结构化展示；查词即「跳转」
 *
 * 路由：当前实现不挂后端，纯前端配置
 */

export interface WebDictConfig {
  /** 稳定唯一 id（持久化键/缓存前缀/切换标识，一经发布不可改） */
  id: string
  /** 切换器与设置页显示名（品牌名，不本地化） */
  displayName: string
  /** 列表 emoji 图标 */
  icon: string
  /** 品牌强调色（用于设置页卡片头像背景） */
  color: string
  /** 由「已 URL 编码的查询词」构造完整词条网页地址 */
  buildUrl: (encodedWord: string) => string
  /** 可选：目标语言提示（en / zh / en-zh） */
  languageNote?: string
}

/** 通用：构造 URL 并在新标签页打开 */
export function lookupWebDictionary(config: WebDictConfig, word: string): string {
  // 控制字符防护（避免 word 含换行等导致 URL 异常）
  const safe = String(word || '').trim()
  if (!safe) return ''
  const encoded = encodeURIComponent(safe)
  return config.buildUrl(encoded)
}

// URL 模板（顶层函数，便于 const 配置引用）。`w` 为已 URL 编码的查询词。
const cambridgeUrl = (w: string) =>
  `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${w}`
const oxfordUrl = (w: string) =>
  `https://www.oxfordlearnersdictionaries.com/definition/english/${w}`
const longmanUrl = (w: string) => `https://www.ldoceonline.com/dictionary/${w}`
const merriamWebsterUrl = (w: string) =>
  `https://www.merriam-webster.com/dictionary/${w}`
const collinsUrl = (w: string) =>
  `https://www.collinsdictionary.com/dictionary/english/${w}`
const wiktionaryUrl = (w: string) => `https://en.m.wiktionary.org/wiki/${w}`
const youdaoUrl = (w: string) => `https://m.youdao.com/dict?le=eng&q=${w}`

/** 全部网页词典配置（顺序即切换器排列顺序）。
 *
 * 说明：
 * - Vocabulary.com 与 Macmillan 暂未纳入（Macmillan 官网 2023-06-30 永久关停）
 * - 中文友好度优先级：有道 > Cambridge 中英 > 维基词典（英文释义）> 其余英英词典
 */
export const kWebDictConfigs: WebDictConfig[] = [
  {
    id: 'youdao',
    displayName: '有道词典',
    icon: '📕',
    color: '#EA4B35', // 有道暖红
    buildUrl: youdaoUrl,
    languageNote: '中英 / 英英',
  },
  {
    id: 'cambridge',
    displayName: 'Cambridge',
    icon: '🎓',
    color: '#00BDB6', // 站点导航栏青绿
    buildUrl: cambridgeUrl,
    languageNote: '英中 / 英英',
  },
  {
    id: 'oxford',
    displayName: 'Oxford',
    icon: '📘',
    color: '#002147', // Oxford Blue
    buildUrl: oxfordUrl,
    languageNote: '英英',
  },
  {
    id: 'longman',
    displayName: 'Longman',
    icon: '📚',
    color: '#3B4CB8', // 站点靛蓝
    buildUrl: longmanUrl,
    languageNote: '英英',
  },
  {
    id: 'merriamWebster',
    displayName: 'Merriam-Webster',
    icon: '📖',
    color: '#D7191F', // M-W 品牌红
    buildUrl: merriamWebsterUrl,
    languageNote: '英英',
  },
  {
    id: 'collins',
    displayName: 'Collins',
    icon: '📗',
    color: '#0073E6', // 站点主色蓝
    buildUrl: collinsUrl,
    languageNote: '英英',
  },
  {
    id: 'wiktionary',
    displayName: 'Wiktionary',
    icon: '🌐',
    color: '#54595D', // Wikimedia 灰
    buildUrl: wiktionaryUrl,
    languageNote: '多语',
  },
]

/** 按 id 查配置，找不到返回 undefined */
export function getWebDictConfig(id: string): WebDictConfig | undefined {
  return kWebDictConfigs.find((c) => c.id === id)
}
