import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { router } from '@/router'
import { useSettingsStore } from '@/store/settings'
import { getThemeConfig } from '@/theme/themes'
import { useColorMode } from '@/hooks/useColorMode'

/**
 * 应用根组件。
 *
 * v0.6.0 起：
 * - 根据 useColorMode() 解析 light/dark（考虑 color_mode='auto' + 系统主题）
 * - 将 antd 主题切换为对应调色板（cssVar 机制让所有 token 写入 --ant-* CSS 变量）
 * - useColorMode 内部会同步设置 documentElement[data-theme]，供自定义 CSS 变量跟随
 */
export default function App() {
  const theme = useSettingsStore((s) => s.theme)
  const { isDark } = useColorMode()

  return (
    <ConfigProvider locale={zhCN} theme={getThemeConfig(theme, isDark)}>
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
