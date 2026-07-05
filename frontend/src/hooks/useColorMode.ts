import { useEffect, useState } from 'react'
import type { ColorMode } from '@/types'
import { useSettingsStore } from '@/store/settings'

/**
 * 解析后的实际颜色模式（已考虑 auto + 系统主题）
 */
export type ResolvedColorMode = 'light' | 'dark'

/**
 * 合并用户偏好与系统主题，得到实际应使用的颜色模式。
 *
 * - light: 始终浅色
 * - dark:  始终深色
 * - auto:  跟随系统 prefers-color-scheme
 */
function resolve(mode: ColorMode, systemPrefersDark: boolean): ResolvedColorMode {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return systemPrefersDark ? 'dark' : 'light'
}

/**
 * 全局深色模式 hook。
 *
 * 返回值：
 * - colorMode: 用户在设置中选择的偏好（light/dark/auto）
 * - resolved:  实际生效的深浅（已考虑 auto + 系统主题）
 * - isDark:    resolved === 'dark' 的快捷布尔
 *
 * 同时在 documentElement 上设置 data-theme="dark" | "light"，
 * 供 index.css 中的语义色变量与第三方组件跟随。
 */
export function useColorMode() {
  const colorMode = useSettingsStore((s) => s.color_mode || 'auto')
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  // 监听系统主题变化
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    // 兼容旧 / 新版 MediaQueryList API
    if (mql.addEventListener) {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  const resolved = resolve(colorMode, systemPrefersDark)
  const isDark = resolved === 'dark'

  // 同步到 documentElement，供 CSS 变量与第三方组件使用
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', resolved)
    // 顶部状态栏颜色（iOS Safari PWA / Android Chrome）
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (meta) {
      meta.setAttribute('content', isDark ? '#0F0E0C' : '#FFF9F0')
    }
  }, [resolved, isDark])

  return { colorMode, resolved, isDark }
}
