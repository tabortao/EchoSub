/**
 * 界面主题定义 —— 小学生审美风格。
 *
 * 关键机制：每套主题均开启 `cssVar: { key: 'ant' }`，使得 antd v5 将 token
 * 以 CSS 变量（如 --ant-color-primary）形式写入到文档根节点（或容器）。
 * 所有页面凡需跟随主题切换的地方，均通过 var(--ant-*) 引用这些变量，
 * 而不是硬编码颜色。
 *
 * 主题标识与后端 Setting.Theme 字段对应：
 * - default: 暖阳橙（默认）
 * - green:   清新绿野
 * - purple:  梦幻紫蓝
 * - blue:    天空蓝
 *
 * v0.6.0 起：每个主题额外提供 dark 调色板，token 通过 `algorithm.darkAlgorithm`
 * 派生深色语义色（colorBgContainer / colorText / colorBorder 等），保证视频内容
 * 在深色模式下视觉舒适、对比度充足。
 */
import type { ThemeConfig } from 'antd'
import { theme as antdTheme } from 'antd'

export type ThemeKey = 'default' | 'green' | 'purple' | 'blue'

// ── 渐变色的辅助：为每个主题的 primary 提供同色系的浅色 ──
// 用于渐变填充区域（如专辑封面底色、统计卡片等）
const lighten = (hex: string, amt: number): string => {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + amt)
  const g = Math.min(255, ((n >> 8) & 0xff) + amt)
  const b = Math.min(255, (n & 0xff) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export interface ThemeMeta {
  key: ThemeKey
  /** 展示名称 */
  label: string
  /** 主题图标 emoji */
  emoji: string
  /** 主色（用于色块预览） */
  primary: string
  /** 主色浅色（用于渐变） */
  primaryLight: string
  /** 浅色 antd ThemeConfig */
  light: ThemeConfig
  /** 深色 antd ThemeConfig（v0.6.0 起） */
  dark: ThemeConfig
}

// cssVar key 统一为 'ant' —— antd v5 会自动将 token 映射到 --ant-* 变量
const cssVar = { key: 'ant' }

// 共用组件 token：减少 light/dark 重复定义
const componentTokens = {
  Card: { borderRadiusLG: 16 },
  Button: { borderRadius: 10, controlHeight: 38, controlHeightLG: 44 },
  Tag: { borderRadiusSM: 8 },
} as const

// 构造主题：根据浅色/深色调色板生成完整 ThemeConfig
function buildTheme(
  primary: string,
  primaryRgb: [number, number, number],
  bgLayout: string,
  isDark: boolean
): ThemeConfig {
  const [r, g, b] = primaryRgb
  return {
    cssVar,
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorLink: primary,
      colorSuccess: '#52C41A',
      colorWarning: '#FAAD14',
      colorError: '#FF4D4F',
      borderRadius: 12,
      fontSize: 15,
      colorBgLayout: bgLayout,
    },
    components: {
      Menu: {
        itemSelectedBg: `rgba(${r},${g},${b},${isDark ? 0.22 : 0.12})`,
        itemSelectedColor: primary,
        itemHoverColor: primary,
      },
      Card: {
        ...componentTokens.Card,
        boxShadowTertiary: isDark
          ? `0 4px 16px rgba(0,0,0,0.4)`
          : `0 4px 16px rgba(${r},${g},${b},0.06)`,
      },
      Button: componentTokens.Button,
      Tag: componentTokens.Tag,
    },
  }
}

// 解析 hex → [r,g,b]（用于 rgba 拼接）
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

export const THEMES: Record<ThemeKey, ThemeMeta> = {
  default: {
    key: 'default',
    label: '暖阳橙',
    emoji: '🌞',
    primary: '#FF7A45',
    primaryLight: lighten('#FF7A45', 40),
    light: buildTheme('#FF7A45', hexToRgb('#FF7A45'), '#FFF9F0', false),
    dark: buildTheme('#FF7A45', hexToRgb('#FF7A45'), '#0F0E0C', true),
  },
  green: {
    key: 'green',
    label: '清新绿野',
    emoji: '🌿',
    primary: '#52C41A',
    primaryLight: lighten('#52C41A', 40),
    light: buildTheme('#52C41A', hexToRgb('#52C41A'), '#F6FFED', false),
    dark: buildTheme('#52C41A', hexToRgb('#52C41A'), '#0C130B', true),
  },
  purple: {
    key: 'purple',
    label: '梦幻紫蓝',
    emoji: '💜',
    primary: '#722ED1',
    primaryLight: lighten('#722ED1', 40),
    light: buildTheme('#722ED1', hexToRgb('#722ED1'), '#F9F0FF', false),
    dark: buildTheme('#722ED1', hexToRgb('#722ED1'), '#100C1A', true),
  },
  blue: {
    key: 'blue',
    label: '天空蓝',
    emoji: '🌊',
    primary: '#1890FF',
    primaryLight: lighten('#1890FF', 40),
    light: buildTheme('#1890FF', hexToRgb('#1890FF'), '#E6F4FF', false),
    dark: buildTheme('#1890FF', hexToRgb('#1890FF'), '#0A1620', true),
  },
}

/** 根据主题 key 与深色模式返回 antd ThemeConfig（含默认值兜底） */
export function getThemeConfig(
  key: string | undefined,
  isDark: boolean = false
): ThemeConfig {
  const k = (key && key in THEMES ? key : 'default') as ThemeKey
  return isDark ? THEMES[k].dark : THEMES[k].light
}

/** 获取当前主题元数据 */
export function getThemeMeta(key: string | undefined): ThemeMeta {
  const k = (key && key in THEMES ? key : 'default') as ThemeKey
  return THEMES[k]
}
