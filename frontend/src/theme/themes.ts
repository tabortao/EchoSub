/**
 * 界面主题定义 —— 小学生审美风格。
 * 每套主题包含 Ant Design token 覆写，由 App.tsx 中的 ConfigProvider 动态应用。
 *
 * 主题标识与后端 Setting.Theme 字段对应：
 * - default: 暖阳橙（默认）
 * - green:   清新绿野
 * - purple:  梦幻紫蓝
 * - blue:    天空蓝
 */
import type { ThemeConfig } from 'antd'

export type ThemeKey = 'default' | 'green' | 'purple' | 'blue'

export interface ThemeMeta {
  key: ThemeKey
  /** 展示名称 */
  label: string
  /** 主题图标 emoji */
  emoji: string
  /** 主色（用于色块预览） */
  primary: string
  /** antd 完整 token 覆写 */
  config: ThemeConfig
}

export const THEMES: Record<ThemeKey, ThemeMeta> = {
  default: {
    key: 'default',
    label: '暖阳橙',
    emoji: '🌞',
    primary: '#FF7A45',
    config: {
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
    config: {
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
    config: {
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
    config: {
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
