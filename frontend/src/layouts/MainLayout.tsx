import { Layout, Menu, theme, Button, Space } from 'antd'
import {
  HomeOutlined,
  FolderOutlined,
  TagOutlined,
  HistoryOutlined,
  SettingOutlined,
  LogoutOutlined,
  AudioOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'

const { Sider, Content, Header } = Layout

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/albums', icon: <FolderOutlined />, label: '专辑' },
  { key: '/tags', icon: <TagOutlined />, label: '标签' },
  { key: '/records', icon: <HistoryOutlined />, label: '学习记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, hydrate } = useAuthStore()
  const loadSettings = useSettingsStore((s) => s.load)
  const {
    token: { colorBgContainer },
  } = theme.useToken()

  useEffect(() => {
    hydrate()
    loadSettings()
  }, [hydrate, loadSettings])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const selectedKey = '/' + location.pathname.split('/')[1]
  const current = location.pathname === '/' ? '/' : menuItems.find((m) => m.key === selectedKey)?.key ?? '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" width={220} style={{ background: colorBgContainer }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <AudioOutlined style={{ fontSize: 22, color: '#1677ff' }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>EchoSub</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[current]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: colorBgContainer, padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Space>
            <span>{user?.username}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 16 }}>
          <div style={{ padding: 24, background: colorBgContainer, minHeight: 360, borderRadius: 8 }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
