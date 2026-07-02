import { Layout, Button, Space, Drawer, Tooltip, Avatar } from 'antd'
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
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Grid } from 'antd'

const { Sider, Content, Header } = Layout
const { useBreakpoint } = Grid

// 每个菜单项配一个鲜艳颜色，小学生喜欢多彩视觉
interface MenuItemCfg {
  key: string
  icon: ReactNode
  label: string
  color: string
  emoji: string
}

const menuItems: MenuItemCfg[] = [
  { key: '/', icon: <HomeOutlined />, label: '首页', color: '#FF7A45', emoji: '🏠' },
  { key: '/albums', icon: <FolderOutlined />, label: '专辑', color: '#1890FF', emoji: '📂' },
  { key: '/tags', icon: <TagOutlined />, label: '标签', color: '#52C41A', emoji: '🏷️' },
  { key: '/upload', icon: <UploadOutlined />, label: '上传', color: '#722ED1', emoji: '⬆️' },
  { key: '/records', icon: <HistoryOutlined />, label: '学习记录', color: '#EB2F96', emoji: '📊' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置', color: '#13C2C2', emoji: '⚙️' },
]

export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const loadSettings = useSettingsStore((s) => s.load)
  const screens = useBreakpoint()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

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

  // 渲染单个菜单项（彩色图标 + 选中态彩色背景）
  const renderMenuItem = (item: MenuItemCfg, showLabel: boolean) => {
    const active = current === item.key
    return (
      <div
        key={item.key}
        onClick={() => handleMenuClick(item.key)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: showLabel ? '10px 16px' : '10px 0',
          margin: '4px 8px',
          borderRadius: 12,
          cursor: 'pointer',
          background: active ? item.color + '18' : 'transparent',
          color: active ? item.color : '#595959',
          fontWeight: active ? 600 : 400,
          fontSize: 15,
          transition: 'all 0.2s',
          justifyContent: showLabel ? 'flex-start' : 'center',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f5f5f5' }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ color: item.color, fontSize: 18, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
        {showLabel && <span>{item.label}</span>}
      </div>
    )
  }

  const renderSider = (showLogoText: boolean) => (
    <>
      {/* Logo 区域：彩色音频图标 + 渐变文字 */}
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderBottom: '1px solid #fff0e6',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #FF7A45, #FFB37A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(255,122,69,0.3)',
        }}>
          <AudioOutlined style={{ fontSize: 20, color: '#fff' }} />
        </div>
        {showLogoText && (
          <span style={{
            fontSize: 20, fontWeight: 800,
            background: 'linear-gradient(135deg, #FF7A45, #FFB37A)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>EchoSub</span>
        )}
      </div>
      {/* 菜单列表 */}
      <div style={{ paddingTop: 8 }}>
        {menuItems.map((item) => renderMenuItem(item, showLogoText))}
      </div>
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
          styles={{ body: { padding: 0, background: '#fff' } }}
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
          style={{ background: '#fff', borderRight: '1px solid #fff0e6' }}
        >
          {renderSider(!collapsed)}
        </Sider>
      )}
      <Layout>
        <Header style={{
          background: '#fff',
          padding: isMobile ? '0 12px' : '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #fff0e6',
          boxShadow: '0 1px 4px rgba(255,122,69,0.04)',
        }}>
          {isMobile ? (
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
          ) : (
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>
              {menuItems.find((m) => m.key === current)?.emoji} {menuItems.find((m) => m.key === current)?.label}
            </span>
          )}
          <Space>
            <Tooltip title={user?.username}>
              <Avatar size={32} style={{ background: 'linear-gradient(135deg, #FF7A45, #FFB37A)', fontWeight: 600 }}>
                {user?.username?.[0]?.toUpperCase() ?? 'U'}
              </Avatar>
            </Tooltip>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              {isMobile ? '' : '退出'}
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 0 }}>
          <div style={{ padding: isMobile ? 8 : 20, background: '#FFF9F0', minHeight: 'calc(100vh - 64px)' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
