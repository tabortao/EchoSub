import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { router } from '@/router'
import { useSettingsStore } from '@/store/settings'
import { getThemeConfig } from '@/theme/themes'

export default function App() {
  const theme = useSettingsStore((s) => s.theme)
  return (
    // key={theme} 强制 ConfigProvider 在主题切换时重新挂载，确保 antd CSS 变量正确更新
    <ConfigProvider
      key={theme}
      locale={zhCN}
      theme={getThemeConfig(theme)}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
