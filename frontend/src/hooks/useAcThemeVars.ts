import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settings'
import { useColorMode } from '@/hooks/useColorMode'
import { THEMES, type ThemeKey } from '@/theme/themes'

/**
 * 动物森友会风格（AC）主题变量注入 hook（v0.7.1 起）。
 *
 * 背景：
 * - `index.css` 中 `--ac-*` 变量（--ac-primary / --ac-bg-page / --ac-bg-content / 等）
 *   原本是静态硬编码的，只使用一组固定颜色（薄荷绿 / 暖羊皮纸 / 棕咖）。
 * - 当用户在设置里切换「暖阳橙/草绿/紫丁香/天空蓝」4 套主题时，antd 组件主色
 *   会跟随切换（因为 antd 内部用 --ant-color-primary），但所有 `var(--ac-*)`
 *   引用都纹丝不动，导致用户感觉「主题切换没用」。
 *
 * 修复：
 * - 监听 theme + isDark 变化
 * - 通过 document.documentElement.style.setProperty() 动态覆盖关键 AC 变量
 * - 浅色：每个主题对应一组暖羊皮纸背景 + 主色调
 * - 深色：背景切换为深棕调，主色加亮、文字反色
 * - 不影响 :root 中已存在的浅色/深色默认 token（兜底色保留）
 *
 * 调用位置：App.tsx 内（全局生效）
 */
export function useAcThemeVars() {
  const themeKey = useSettingsStore((s) => s.theme ?? 'default') as ThemeKey
  const { isDark } = useColorMode()
  const meta = THEMES[themeKey] ?? THEMES.default

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement

    // 当前主题主色
    const primary = meta.primary

    // 浅色模式：暖羊皮纸背景 + 主色调
    // 深色模式：深棕背景 + 提亮主色 + 暖色文字
    const bgPage = isDark ? '#1F1D18' : '#F8F8F0'
    const bgContent = isDark ? '#2A2620' : 'rgb(247, 243, 223)'
    const bgContentDeep = isDark ? '#34302A' : 'rgb(237, 231, 205)'
    const textHeader = isDark ? '#F5E6D3' : '#794F27'
    const textSecondary = isDark ? '#B8A88E' : '#9F927D'
    // 按钮 3D 阴影：取主色的暗色变体（手算：乘以 0.55 并截断到 0-255）
    const r = parseInt(primary.slice(1, 3), 16)
    const g = parseInt(primary.slice(3, 5), 16)
    const b = parseInt(primary.slice(5, 7), 16)
    const shadowButton = `rgb(${Math.floor(r * 0.55)}, ${Math.floor(g * 0.55)}, ${Math.floor(b * 0.55)})`

    root.style.setProperty('--ac-primary', primary)
    root.style.setProperty('--ac-bg-page', bgPage)
    root.style.setProperty('--ac-bg-content', bgContent)
    root.style.setProperty('--ac-bg-content-deep', bgContentDeep)
    root.style.setProperty('--ac-text-header', textHeader)
    root.style.setProperty('--ac-text-secondary', textSecondary)
    root.style.setProperty('--ac-shadow-button', shadowButton)

    // 深色模式：--ant-color-bg-layout 同步覆盖（让 antd 页面底色也变深）
    if (isDark) {
      root.style.setProperty('--ant-color-bg-layout', bgPage)
      root.style.setProperty('--ant-color-bg-container', '#2A2620')
    } else {
      root.style.removeProperty('--ant-color-bg-layout')
      root.style.removeProperty('--ant-color-bg-container')
    }
  }, [meta.primary, isDark])

  return { theme: themeKey, isDark, primary: meta.primary }
}
