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
 */
import type { ThemeConfig } from 'antd'

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
  /** antd 完整 token 覆写 */
  config: ThemeConfig
}

// cssVar key 统一为 'ant' —— antd v5 会自动将 token 映射到 --ant-* 变量
const cssVar = { key: 'ant' }

export const THEMES: Record<ThemeKey, ThemeMeta> = {
  default: {
    key: 'default',
    label: '暖阳橙',
    emoji: '🌞',
    primary: '#FF7A45',
    primaryLight: lighten('#FF7A45', 40),
    config: {
      cssVar,
      token: {
        colorPrimary: '#FF7A45',
        colorLink: '#FF7A45',
        colorSuccess: '#52C41A',
        colorWarning: '#FAAD14',
        colorError: '#FF4D4F',
        borderRadius: 12,
        fontSize: 15,
        colorBgLayout: '#FFF9F0',
      },
      components: {
        Menu: {
          itemSelectedBg: 'rgba(255,122,69,0.12)',
          itemSelectedColor: '#FF7A45',
          itemHoverColor: '#FF7A45',
        },
        Card: {
          borderRadiusLG: 16,
          boxShadowTertiary: '0 4px 16px rgba(255,122,69,0.06)',
        },
        Button: { borderRadius: 10, controlHeight: 38, controlHeightLG: 44 },
        Tag: { borderRadiusSM: 8 },
      },
    },
  },
  green: {
    key: 'green',
    label: '清新绿野',
    emoji: '🌿',
    primary: '#52C41A',
    primaryLight: lighten('#52C41A', 40),
    config: {
      cssVar,
      token: {
        colorPrimary: '#52C41A',
        colorLink: '#52C41A',
        colorSuccess: '#52C41A',
        colorWarning: '#FAAD14',
        colorError: '#FF4D4F',
        borderRadius: 12,
        fontSize: 15,
        colorBgLayout: '#F6FFED',
      },
      components: {
        Menu: {
          itemSelectedBg: 'rgba(82,196,26,0.12)',
          itemSelectedColor: '#52C41A',
          itemHoverColor: '#52C41A',
        },
        Card: {
          borderRadiusLG: 16,
          boxShadowTertiary: '0 4px 16px rgba(82,196,26,0.06)',
        },
        Button: { borderRadius: 10, controlHeight: 38, controlHeightLG: 44 },
        Tag: { borderRadiusSM: 8 },
      },
    },
  },
  purple: {
    key: 'purple',
    label: '梦幻紫蓝',
    emoji: '💜',
    primary: '#722ED1',
    primaryLight: lighten('#722ED1', 40),
    config: {
      cssVar,
      token: {
        colorPrimary: '#722ED1',
        colorLink: '#722ED1',
        colorSuccess: '#52C41A',
        colorWarning: '#FAAD14',
        colorError: '#FF4D4F',
        borderRadius: 12,
        fontSize: 15,
        colorBgLayout: '#F9F0FF',
      },
      components: {
        Menu: {
          itemSelectedBg: 'rgba(114,46,209,0.12)',
          itemSelectedColor: '#722ED1',
          itemHoverColor: '#722ED1',
        },
        Card: {
          borderRadiusLG: 16,
          boxShadowTertiary: '0 4px 16px rgba(114,46,209,0.06)',
        },
        Button: { borderRadius: 10, controlHeight: 38, controlHeightLG: 44 },
        Tag: { borderRadiusSM: 8 },
      },
    },
  },
  blue: {
    key: 'blue',
    label: '天空蓝',
    emoji: '🌊',
    primary: '#1890FF',
    primaryLight: lighten('#1890FF', 40),
    config: {
      cssVar,
      token: {
        colorPrimary: '#1890FF',
        colorLink: '#1890FF',
        colorSuccess: '#52C41A',
        colorWarning: '#FAAD14',
        colorError: '#FF4D4F',
        borderRadius: 12,
        fontSize: 15,
        colorBgLayout: '#E6F4FF',
      },
      components: {
        Menu: {
          itemSelectedBg: 'rgba(24,144,255,0.12)',
          itemSelectedColor: '#1890FF',
          itemHoverColor: '#1890FF',
        },
        Card: {
          borderRadiusLG: 16,
          boxShadowTertiary: '0 4px 16px rgba(24,144,255,0.06)',
        },
        Button: { borderRadius: 10, controlHeight: 38, controlHeightLG: 44 },
        Tag: { borderRadiusSM: 8 },
      },
    },
  },
}

/** 根据主题 key 返回 antd ThemeConfig（含默认值兜底） */
export function getThemeConfig(key: string | undefined): ThemeConfig {
  const k = (key && key in THEMES ? key : 'default') as ThemeKey
  return THEMES[k].config
}

/** 获取当前主题元数据 */
export function getThemeMeta(key: string | undefined): ThemeMeta {
  const k = (key && key in THEMES ? key : 'default') as ThemeKey
  return THEMES[k]
}
