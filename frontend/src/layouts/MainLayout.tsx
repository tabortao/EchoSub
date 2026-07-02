import { Layout, Menu, theme, Button, Space, Drawer } from 'antd'
import {
  HomeOutlined,
  FolderOutlined,
  TagOutlined,
  HistoryOutlined,
  SettingOutlined,
  LogoutOutlined,
  AudioOutlined,
  MenuOutlined,
  UploadOutlined,
  ReadOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Grid } from 'antd'

const { Sider, Content, Header } = Layout
const { useBreakpoint } = Grid

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/albums', icon: <FolderOutlined />, label: '专辑' },
  { key: '/tags', icon: <TagOutlined />, label: '标签' },
  { key: '/upload', icon: <UploadOutlined />, label: '上传' },
  { key: '/notes', icon: <ReadOutlined />, label: '学习页面' },
  { key: '/records', icon: <HistoryOutlined />, label: '学习记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const loadSettings = useSettingsStore((s) => s.load)
  const screens = useBreakpoint()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const {
    token: { colorBgContainer },
  } = theme.useToken()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const selectedKey = '/' + location.pathname.split('/')[1]
  const current = location.pathname === '/' ? '/' : menuItems.find((m) => m.key === selectedKey)?.key ?? '/'
  const isMobile = !screens.lg

  const handleMenuClick = (key: string) => {
    navigate(key)
    setDrawerOpen(false)
  }

  // 侧边栏内容，collapsed 仅影响桌面端 Sider（Drawer 模式始终展开）
  const renderSider = (showLogoText: boolean) => (
    <>
      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <AudioOutlined style={{ fontSize: 22, color: '#1677ff' }} />
        {showLogoText && <span style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>EchoSub</span>}
      </div>
      <Menu
        mode="inline"
        inlineCollapsed={!showLogoText}
        selectedKeys={[current]}
        items={menuItems}
        onClick={({ key }) => handleMenuClick(key)}
        style={{ borderRight: 0 }}
      />
    </>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          rootStyle={{ width: 220 }}
          styles={{ body: { padding: 0, background: colorBgContainer } }}
        >
          {renderSider(true)}
        </Drawer>
      ) : (
        <Sider
          width={220}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="light"
          style={{ background: colorBgContainer }}
        >
          {renderSider(!collapsed)}
        </Sider>
      )}
      <Layout>
        <Header style={{ background: colorBgContainer, padding: isMobile ? '0 12px' : '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isMobile ? (
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
          ) : (
            <span />
          )}
          <Space>
            <span>{user?.username}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              {isMobile ? '' : '退出'}
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 0 }}>
          <div style={{ padding: isMobile ? 8 : 16, background: colorBgContainer, minHeight: 'calc(100vh - 64px)' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
