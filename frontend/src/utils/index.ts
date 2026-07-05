// 格式化秒为 HH:MM:SS 或 MM:SS
export function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '00:00'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }
  return `${pad(m)}:${pad(s)}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// 格式化文件大小
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// 格式化时间为相对描述
export function formatRelative(iso: string): string {
  if (!iso) return '-'
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return date.toLocaleDateString('zh-CN')
}

// ===== 设备检测工具（v0.6.0 起） =====
/**
 * 检测当前是否在 iOS 设备（含 iPhone / iPad / iPod）。
 * 通过 userAgent + platform 双重判定，避免 iPad Pro 伪装 Mac 时误判。
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPhone / iPad / iPod 直接识别
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ 桌面版 Safari 会把 iPad 报为 Mac，配合 maxTouchPoints 判定
  if (
    ua.includes('Mac') &&
    navigator.maxTouchPoints > 1 &&
    !('msStream' in window)
  ) {
    return true
  }
  return false
}

/** 是否为 iPhone（窄屏手机） */
export function isIPhone(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone/i.test(navigator.userAgent)
}

/** 是否为 iPad（含 iPadOS 桌面模式） */
export function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad/i.test(ua)) return true
  if (
    ua.includes('Mac') &&
    navigator.maxTouchPoints > 1 &&
    !('msStream' in window)
  ) {
    return true
  }
  return false
}

/** 是否为 Android 设备 */
export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/** 是否为触摸设备（手机 / 平板） */
export function isTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    isIOS() ||
    isAndroid()
  )
}

/**
 * 将 Markdown 原文转换为适合 TTS 朗读的纯文本。
 * 移除所有 Markdown 标记符号（#、-、>、**、`、[]() 等），保留可读文字内容。
 *
 * 处理顺序：先块级（代码块/HTML/图片/链接/水平线/标题/引用/列表/表格），再行内（代码/粗体斜体/HTML实体），最后折叠空白。
 * 代码块整体移除（朗读代码无意义）；图片保留 alt 文本；链接保留显示文本。
 *
 * @param md Markdown 原文
 * @returns 可直接用于 TTS 朗读的纯文本
 */
export function markdownToPlainText(md: string): string {
  if (!md) return ''
  let s = md
  // 1. 代码块（围栏 ``` 或 ~~~）整体移除
  s = s.replace(/```[\s\S]*?```/g, '')
  s = s.replace(/~~~[\s\S]*?~~~/g, '')
  // 2. HTML 标签移除
  s = s.replace(/<[^>]+>/g, '')
  // 3. 图片 ![alt](url) → 保留 alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 4. 链接 [text](url) → 保留 text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // 5. 水平线 --- *** ___
  s = s.replace(/^\s*([-*_=])\1{2,}\s*$/gm, '')
  // 6. 标题前缀 # ## ###
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  // 7. 引用前缀 >
  s = s.replace(/^\s{0,3}>\s?/gm, '')
  // 8. 无序列表前缀 - * +
  s = s.replace(/^\s*[-*+]\s+/gm, '')
  // 9. 有序列表前缀 1.
  s = s.replace(/^\s*\d+\.\s+/gm, '')
  // 10. 表格分隔行移除，其余 | 替换为空格
  s = s.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '')
  s = s.replace(/\|/g, ' ')
  // 11. 行内代码 `code` → 保留 code
  s = s.replace(/`([^`]+)`/g, '$1')
  // 12. 粗体/斜体 **x** __x__ *x* _x_ → 保留 x
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/_([^_]+)_/g, '$1')
  // 13. HTML 实体还原
  s = s.replace(/&nbsp;/g, ' ')
  s = s.replace(/&amp;/g, '&')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/&quot;/g, '"')
  // 14. 折叠多余空白
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}
