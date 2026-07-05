/**
 * 界面主题定义 —— 动物森友会风格（v0.7.0 起）。
 *
 * 关键机制：每套主题均开启 `cssVar: { key: 'ant' }`，使得 antd v5 将 token
 * 以 CSS 变量（如 --ant-color-primary）形式写入到文档根节点（或容器）。
 * 所有页面凡需跟随主题切换的地方，均通过 var(--ant-*) 引用这些变量，
 * 而不是硬编码颜色。
 *
 * 主题标识与后端 Setting.Theme 字段对应：
 * - default: 暖阳橙（动物森友会风主色）
 * - green:   草绿岛
 * - purple:  紫丁香
 * - blue:    天空蓝
 *
 * 颜色参考 docs/Reference/animal-island-ui/DESIGN_PROMPT.md：
 * - 暖羊皮纸背景 #f8f8f0 + 薄荷绿主色 #19c8b9
 * - 13 色 NookPhone 调色板（pink / purple / blue / teal / green / orange / yellow / red 等）
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
      colorSuccess: '#6fba2c',
      colorWarning: '#f5c31c',
      colorError: '#e05a5a',
      borderRadius: 16,
      borderRadiusLG: 20,
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
        borderRadiusLG: 20,
        boxShadowTertiary: isDark
          ? `0 4px 16px rgba(0,0,0,0.4)`
          : `0 3px 10px rgba(61, 52, 40, 0.06)`,
      },
      Button: {
        ...componentTokens.Button,
        borderRadius: 50, // pill 圆角（动物森友会风标志性圆角）
        controlHeight: 38,
        controlHeightLG: 48,
        borderRadiusLG: 50,
        primaryShadow: '0 5px 0 0 #bdaea0',
        defaultShadow: '0 2px 4px 0 rgba(61, 52, 40, 0.06)',
        dangerShadow: '0 5px 0 0 #c94444',
      },
      Tag: componentTokens.Tag,
      Input: {
        borderRadius: 50,
        controlHeight: 38,
        controlHeightLG: 48,
        paddingBlock: 8,
      },
      Tabs: {
        titleFontSize: 15,
        horizontalItemPadding: '12px 16px',
        horizontalItemGutter: 24,
      },
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
    emoji: '🍊',
    primary: '#FF9F5A',
    primaryLight: lighten('#FF9F5A', 40),
    light: buildTheme('#FF9F5A', hexToRgb('#FF9F5A'), '#F8F8F0', false),
    dark: buildTheme('#FF9F5A', hexToRgb('#FF9F5A'), '#1F1D18', true),
  },
  green: {
    key: 'green',
    label: '草绿岛',
    emoji: '🌿',
    primary: '#6fba2c',
    primaryLight: lighten('#6fba2c', 40),
    light: buildTheme('#6fba2c', hexToRgb('#6fba2c'), '#F8F8F0', false),
    dark: buildTheme('#6fba2c', hexToRgb('#6fba2c'), '#1F1D18', true),
  },
  purple: {
    key: 'purple',
    label: '紫丁香',
    emoji: '💜',
    primary: '#b77dee',
    primaryLight: lighten('#b77dee', 40),
    light: buildTheme('#b77dee', hexToRgb('#b77dee'), '#F8F8F0', false),
    dark: buildTheme('#b77dee', hexToRgb('#b77dee'), '#1F1D18', true),
  },
  blue: {
    key: 'blue',
    label: '天空蓝',
    emoji: '☁️',
    primary: '#889df0',
    primaryLight: lighten('#889df0', 40),
    light: buildTheme('#889df0', hexToRgb('#889df0'), '#F8F8F0', false),
    dark: buildTheme('#889df0', hexToRgb('#889df0'), '#1F1D18', true),
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
