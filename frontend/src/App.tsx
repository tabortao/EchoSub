import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { router } from '@/router'

// 小学生审美主题：温暖橙色主色 + 大圆角 + 柔和配色
export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#FF7A45', // 温暖橙——活力亲切
          colorLink: '#FF7A45',
          colorSuccess: '#52C41A', // 草绿
          colorWarning: '#FAAD14', // 暖黄
          colorError: '#FF4D4F',
          borderRadius: 12,
          fontSize: 15,
          colorBgLayout: '#FFF9F0', // 暖白背景
        },
        components: {
          Menu: {
            itemSelectedBg: 'rgba(255,122,69,0.12)',
            itemSelectedColor: '#FF7A45',
            itemBorderRadius: 10,
            itemHeight: 44,
            itemMarginInline: 8,
          },
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: '0 4px 16px rgba(255,122,69,0.06)',
          },
          Button: {
            borderRadius: 10,
            controlHeight: 38,
            controlHeightLG: 44,
          },
          Tag: {
            borderRadiusSM: 8,
          },
        },
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
