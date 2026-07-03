import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { router } from '@/router'
import { useSettingsStore } from '@/store/settings'
import { getThemeConfig } from '@/theme/themes'

export default function App() {
  const theme = useSettingsStore((s) => s.theme)
  return (
    <ConfigProvider
      locale={zhCN}
      theme={getThemeConfig(theme)}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
