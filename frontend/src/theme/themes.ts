/**
 * 界面主题定义 —— 动物森友会风格（v0.7.2 起）
 *
 * 设计哲学：
 * 1. 全站统一动物森友会（Animal Crossing）UI 风格 —— 暖羊皮纸背景 + pill 圆角按钮
 *    + 3D 像素按钮阴影 + 13 色 NookPhone 调色板
 * 2. 四套主题仅「主色」不同（橙 / 绿 / 紫 / 蓝），保持整体风格高度一致
 * 3. 每套主题深色模式都基于同色系生成（避免突兀对比，AC 风柔和）
 * 4. antd v5 通过 cssVar 机制把 token 写入 --ant-* CSS 变量
 * 5. 配合 useAcThemeVars 动态注入 --ac-* 变量，让自定义样式（按钮阴影、polka-dot）
 *    都能跟随 4 套主题与深色模式实时变化
 *
 * 主题色定义参考 docs/Reference/animal-island-ui：
 * - 暖阳橙 🍊：#FF9F5A（向日葵 / 秋天 / 阳光明媚）
 * - 草绿岛 🌿：#6fba2c（薄荷 / 草地 / 自然清新）
 * - 紫丁香 💜：#b77dee（薰衣草 / 梦境 / 优雅神秘）
 * - 天空蓝 ☁️：#889df0（云朵 / 海风 / 平静舒心）
 *
 * 主题标识与后端 Setting.Theme 字段对应：
 * - default: 暖阳橙
 * - green:   草绿岛
 * - purple:  紫丁香
 * - blue:    天空蓝
 */
import type { ThemeConfig } from 'antd'
import { theme as antdTheme } from 'antd'

export type ThemeKey = 'default' | 'green' | 'purple' | 'blue'

/**
 * 每套主题的元信息（不依赖 antd，仅供色块预览 / Header 下拉菜单等使用）
 */
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
  /** 主色加深（用于 3D 按钮阴影） */
  primaryDeep: string
  /** 主色背景的 polka-dot 浅色 */
  primaryDot: string
  /** 浅色 antd ThemeConfig */
  light: ThemeConfig
  /** 深色 antd ThemeConfig（v0.6.0 起） */
  dark: ThemeConfig
}

// cssVar key 统一为 'ant' —— antd v5 会自动将 token 映射到 --ant-* 变量
const cssVar = { key: 'ant' }

// 共用组件 token：减少 light/dark 重复定义
const componentTokens = {
  Card: { borderRadiusLG: 20 },
  Tag: { borderRadiusSM: 999 },
} as const

/**
 * 构造主题：根据浅色/深色调色板生成完整 ThemeConfig
 * 重点：
 * - Button: pill 圆角（borderRadius=50），3D 像素阴影
 * - Input/Select/DatePicker: pill 圆角
 * - Menu: 选中态用主色 12% 透明
 * - Card: 大圆角 + 弱投影
 */
function buildTheme(
  primary: string,
  primaryDeep: string,
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
        itemBorderRadius: 12,
      },
      Card: {
        ...componentTokens.Card,
        borderRadiusLG: 20,
        boxShadowTertiary: isDark
          ? `0 4px 16px rgba(0,0,0,0.4)`
          : `0 3px 10px rgba(61, 52, 40, 0.06)`,
      },
      Button: {
        // AC 风：按钮全部 pill 形 + 3D 阴影
        borderRadius: 50,
        controlHeight: 38,
        controlHeightLG: 48,
        borderRadiusLG: 50,
        // 主按钮 / 危险主按钮 阴影：主色的深色变体
        primaryShadow: `0 5px 0 0 ${primaryDeep}`,
        defaultShadow: '0 2px 4px 0 rgba(61, 52, 40, 0.06)',
        dangerShadow: '0 5px 0 0 #c94444',
      },
      Tag: componentTokens.Tag,
      Input: {
        // AC 风：输入框 pill 形
        borderRadius: 50,
        controlHeight: 38,
        controlHeightLG: 48,
        paddingBlock: 8,
      },
      InputNumber: {
        borderRadius: 50,
        controlHeight: 38,
        controlHeightLG: 48,
      },
      Select: {
        borderRadius: 50,
        controlHeight: 38,
        controlHeightLG: 48,
      },
      DatePicker: {
        borderRadius: 50,
        controlHeight: 38,
        controlHeightLG: 48,
      },
      Tabs: {
        titleFontSize: 15,
        horizontalItemPadding: '12px 16px',
        horizontalItemGutter: 24,
      },
      Modal: {
        // AC 风：Modal 圆角 24
        borderRadiusLG: 24,
      },
      Drawer: {
        borderRadiusLG: 24,
      },
      Notification: {
        borderRadiusLG: 20,
      },
      Message: {
        borderRadiusLG: 16,
      },
      Progress: {
        defaultColor: primary,
      },
    },
  }
}

// 解析 hex → [r,g,b]（用于 rgba 拼接）
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/**
 * 加深 hex 颜色（按系数 0.7 缩放） —— 用于 3D 按钮阴影色
 */
function darken(hex: string, factor: number = 0.7): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.floor(((n >> 16) & 0xff) * factor)
  const g = Math.floor(((n >> 8) & 0xff) * factor)
  const b = Math.floor((n & 0xff) * factor)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * 主色变浅（向背景色混入） —— 用于 hover / active 反馈
 */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + amt)
  const g = Math.min(255, ((n >> 8) & 0xff) + amt)
  const b = Math.min(255, (n & 0xff) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const THEMES: Record<ThemeKey, ThemeMeta> = {
  default: {
    key: 'default',
    label: '暖阳橙',
    emoji: '🍊',
    primary: '#FF9F5A',
    primaryLight: lighten('#FF9F5A', 40),
    primaryDeep: darken('#FF9F5A', 0.7),
    primaryDot: 'rgba(255, 159, 90, 0.18)',
    light: buildTheme('#FF9F5A', darken('#FF9F5A', 0.7), hexToRgb('#FF9F5A'), '#F8F8F0', false),
    dark: buildTheme('#FF9F5A', darken('#FF9F5A', 0.7), hexToRgb('#FF9F5A'), '#1F1D18', true),
  },
  green: {
    key: 'green',
    label: '草绿岛',
    emoji: '🌿',
    primary: '#6fba2c',
    primaryLight: lighten('#6fba2c', 40),
    primaryDeep: darken('#6fba2c', 0.7),
    primaryDot: 'rgba(111, 186, 44, 0.18)',
    light: buildTheme('#6fba2c', darken('#6fba2c', 0.7), hexToRgb('#6fba2c'), '#F8F8F0', false),
    dark: buildTheme('#6fba2c', darken('#6fba2c', 0.7), hexToRgb('#6fba2c'), '#1F1D18', true),
  },
  purple: {
    key: 'purple',
    label: '紫丁香',
    emoji: '💜',
    primary: '#b77dee',
    primaryLight: lighten('#b77dee', 40),
    primaryDeep: darken('#b77dee', 0.7),
    primaryDot: 'rgba(183, 125, 238, 0.18)',
    light: buildTheme('#b77dee', darken('#b77dee', 0.7), hexToRgb('#b77dee'), '#F8F8F0', false),
    dark: buildTheme('#b77dee', darken('#b77dee', 0.7), hexToRgb('#b77dee'), '#1F1D18', true),
  },
  blue: {
    key: 'blue',
    label: '天空蓝',
    emoji: '☁️',
    primary: '#889df0',
    primaryLight: lighten('#889df0', 40),
    primaryDeep: darken('#889df0', 0.7),
    primaryDot: 'rgba(136, 157, 240, 0.18)',
    light: buildTheme('#889df0', darken('#889df0', 0.7), hexToRgb('#889df0'), '#F8F8F0', false),
    dark: buildTheme('#889df0', darken('#889df0', 0.7), hexToRgb('#889df0'), '#1F1D18', true),
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
