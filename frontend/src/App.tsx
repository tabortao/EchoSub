import { RouterProvider } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { router } from '@/router'
import { useSettingsStore } from '@/store/settings'
import { getThemeConfig } from '@/theme/themes'
import { useColorMode } from '@/hooks/useColorMode'
import { useAcThemeVars } from '@/hooks/useAcThemeVars'

/**
 * 应用根组件。
 *
 * v0.6.0 起：
 * - 根据 useColorMode() 解析 light/dark（考虑 color_mode='auto' + 系统主题）
 * - 将 antd 主题切换为对应调色板（cssVar 机制让所有 token 写入 --ant-* CSS 变量）
 * - useColorMode 内部会同步设置 documentElement[data-theme]，供自定义 CSS 变量跟随
 *
 * v0.7.1 起：
 * - useAcThemeVars 根据 theme + isDark 动态注入 --ac-* 变量
 *   （--ac-primary / --ac-bg-page / --ac-bg-content / --ac-text-header 等）
 *   让所有 AC 风自定义样式（卡片背景、polka-dot、按钮阴影、3D 阴影）
 *   都跟随 4 套主题与深色模式实时变化。
 *
 * v0.7.2 起：
 * - 使用 antd 的 <App /> 包裹路由，让 message.useMessage() / Modal / notification
 *   等静态方法能正确消费 ConfigProvider 的主题上下文
 *   （解决「Static function can not consume context like dynamic theme」警告）
 */
export default function App() {
  const theme = useSettingsStore((s) => s.theme)
  const { isDark } = useColorMode()
  // 必须在 ConfigProvider 之前调用，确保 useEffect 同步设置 documentElement 变量
  useAcThemeVars()

  return (
    <ConfigProvider locale={zhCN} theme={getThemeConfig(theme, isDark)}>
      <AntdApp component={false}>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  )
}
