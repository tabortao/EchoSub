import { Layout, Button, Space, Drawer, Tooltip, Avatar, Spin } from 'antd'
import {
  HomeOutlined,
  TagOutlined,
  HistoryOutlined,
  SettingOutlined,
  LogoutOutlined,
  AudioOutlined,
  MenuOutlined,
  UploadOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { message } from 'antd'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { useScanStore } from '@/store/scan'
import { authApi } from '@/api'
import { useDeviceSize } from '@/hooks/useDeviceSize'

const { Sider, Content, Header } = Layout

// 每个菜单项配一个鲜艳颜色，小学生喜欢多彩视觉
interface MenuItemCfg {
  key: string
  icon: ReactNode
  label: string
  color: string
  emoji: string
}

// 侧边栏取消「专辑」入口，专辑改为首页按行展示（emby 风格）
const menuItems: MenuItemCfg[] = [
  { key: '/', icon: <HomeOutlined />, label: '首页', color: '#FF7A45', emoji: '🏠' },
  { key: '/tags', icon: <TagOutlined />, label: '标签', color: '#52C41A', emoji: '🏷️' },
  { key: '/upload', icon: <UploadOutlined />, label: '上传', color: '#722ED1', emoji: '⬆️' },
  { key: '/records', icon: <HistoryOutlined />, label: '学习记录', color: '#EB2F96', emoji: '📊' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置', color: '#13C2C2', emoji: '⚙️' },
  { key: '/about', icon: <InfoCircleOutlined />, label: '关于', color: '#FAAD14', emoji: '💡' },
]

/**
 * 主布局（v0.6.0 起移动端友好）。
 *
 * 断点策略：
 * - isPhone(<768)   → 抽屉导航 + 紧凑 Header（按钮 size=large、不展示文字）
 * - isTablet(768-1280) → 可折叠侧边栏
 * - isDesktop(>=1280) → 默认展开侧边栏
 *
 * 通过 useDeviceSize() 统一判断，避免组件内重复断点逻辑。
 * 同时把背景色硬编码 #fff 改为 CSS 变量，确保深色模式跟随。
 */
export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const loadSettings = useSettingsStore((s) => s.load)
  const scanning = useScanStore((s) => s.scanning)
  const triggerScan = useScanStore((s) => s.trigger)
  const { isPhone, isTablet, isDesktop } = useDeviceSize()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // 手机端默认折叠侧边栏（虽然手机用的是 Drawer，但 isDesktop=false 时也防止动画溢出）
  useEffect(() => {
    if (isDesktop) setCollapsed(false)
  }, [isDesktop])

  const handleTriggerScan = async () => {
    if (scanning) return
    try {
      await triggerScan()
      message.success('媒体文件夹扫描已启动')
    } catch (err) {
      message.error('触发扫描失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const selectedKey = '/' + location.pathname.split('/')[1]
  const current = location.pathname === '/' ? '/' : menuItems.find((m) => m.key === selectedKey)?.key ?? '/'

  // 手机端关闭抽屉后再导航；桌面端直接 navigate
  const handleMenuClick = (key: string) => {
    navigate(key)
    if (isPhone) setDrawerOpen(false)
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
          // 手机端菜单项触控目标 48px（>44 满足 HIG）
          padding: isPhone ? '14px 16px' : (showLabel ? '10px 16px' : '10px 0'),
          margin: isPhone ? '2px 8px' : '4px 8px',
          borderRadius: 12,
          cursor: 'pointer',
          background: active ? item.color + '18' : 'transparent',
          color: active ? item.color : 'var(--color-text-secondary, #595959)',
          fontWeight: active ? 600 : 400,
          fontSize: isPhone ? 16 : 15,
          minHeight: isPhone ? 48 : undefined,
          transition: 'background 0.2s',
          justifyContent: showLabel ? 'flex-start' : 'center',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'var(--color-border-soft, rgba(0,0,0,0.04))'
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent'
        }}
      >
        <span style={{ color: item.color, fontSize: 18, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
        {showLabel && <span>{item.label}</span>}
      </div>
    )
  }

  // 侧边栏内容（手机抽屉 + 桌面 Sider 共用）
  const renderSidebar = (showLogoText: boolean) => (
    <>
      <div style={{
        height: isPhone ? 56 : 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: showLogoText ? 'flex-start' : 'center',
        gap: 8,
        padding: showLogoText ? '0 16px' : 0,
        borderBottom: `1px solid color-mix(in srgb, var(--ant-color-primary) 12%, transparent)`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 8px color-mix(in srgb, var(--ant-color-primary) 30%, transparent)`,
        }}>
          <AudioOutlined style={{ fontSize: 20, color: '#fff' }} />
        </div>
        {showLogoText && (
          <span style={{
            fontSize: 20, fontWeight: 800,
            background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>EchoSub</span>
        )}
      </div>
      <div style={{ paddingTop: 8 }}>
        {menuItems.map((item) => renderMenuItem(item, showLogoText))}
      </div>
    </>
  )

  // 桌面侧边栏宽度：iPad 240 / 桌面 240
  const siderWidth = isDesktop ? 240 : 220

  return (
    <Layout style={{ minHeight: '100svh' }}>
      {isPhone ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={Math.min(window.innerWidth * 0.8, 320)}
          styles={{
            body: { padding: 0, background: 'var(--color-bg-elevated, #fff)' },
            header: { display: 'none' },
          }}
          // 抽屉层级与触摸滚动体验
          maskClosable
        >
          {renderSidebar(true)}
        </Drawer>
      ) : (
        <Sider
          width={siderWidth}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          // 桌面亮色 Sider 背景：使用 elevated 变量，深色模式自动跟随
          style={{
            background: 'var(--color-bg-elevated, #fff)',
            borderRight: `1px solid color-mix(in srgb, var(--ant-color-primary) 12%, transparent)`,
          }}
        >
          {renderSidebar(!collapsed)}
        </Sider>
      )}
      <Layout>
        <Header style={{
          // 背景：CSS 变量，深色模式自动跟随
          background: 'var(--color-bg-elevated, #fff)',
          // 手机端紧凑 padding + 顶部安全区
          padding: isPhone
            ? '0 8px 0 8px'
            : '0 24px',
          paddingTop: isPhone ? 'var(--safe-top, 0px)' : undefined,
          height: isPhone ? 56 : 64,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          borderBottom: `1px solid color-mix(in srgb, var(--ant-color-primary) 12%, transparent)`,
          boxShadow: `0 1px 4px color-mix(in srgb, var(--ant-color-primary) 4%, transparent)`,
        }}>
          {isPhone ? (
            // 手机端：菜单按钮 + 当前页标题
            <Space size={4}>
              <Button
                type="text"
                size="large"
                icon={<MenuOutlined style={{ fontSize: 20 }} />}
                onClick={() => setDrawerOpen(true)}
                aria-label="打开导航菜单"
                style={{ minWidth: 44, minHeight: 44 }}
              />
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)', marginLeft: 4 }}>
                {menuItems.find((m) => m.key === current)?.emoji} {menuItems.find((m) => m.key === current)?.label}
              </span>
            </Space>
          ) : (
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>
              {menuItems.find((m) => m.key === current)?.emoji} {menuItems.find((m) => m.key === current)?.label}
            </span>
          )}
          <Space size={isPhone ? 0 : 8} wrap={false}>
            {/* 扫描媒体目录按钮：手机端仅图标，平板以上展示文字 */}
            <Tooltip title={scanning ? '正在扫描…' : '重新扫描媒体文件夹'}>
              <Spin spinning={scanning} size="small">
                <Button
                  type="text"
                  size={isPhone ? 'large' : 'middle'}
                  icon={<ReloadOutlined spin={scanning} style={{ fontSize: isPhone ? 18 : 16 }} />}
                  onClick={handleTriggerScan}
                  disabled={scanning}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minWidth: isPhone ? 44 : undefined,
                    minHeight: isPhone ? 44 : undefined,
                  }}
                  aria-label="重新扫描媒体"
                >
                  {!isPhone && !scanning ? '扫描' : ''}
                </Button>
              </Spin>
            </Tooltip>
            {/* 用户头像：手机端稍大；点击直接进入设置页 */}
            <Tooltip title={user?.username + ' - 点击打开设置'}>
              <div
                onClick={() => navigate('/settings')}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {user?.avatar_path ? (
                  <Avatar
                    size={isPhone ? 36 : 32}
                    src={authApi.avatarUrl(token ?? '')}
                  />
                ) : (
                  <Avatar
                    size={isPhone ? 36 : 32}
                    style={{
                      background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
                      fontWeight: 600,
                    }}
                  >
                    {user?.username?.[0]?.toUpperCase() ?? 'U'}
                  </Avatar>
                )}
              </div>
            </Tooltip>
            {/* 退出登录按钮：手机端仅图标 + 大尺寸触控目标 */}
            <Tooltip title="退出登录">
              <Button
                type="text"
                size={isPhone ? 'large' : 'middle'}
                icon={<LogoutOutlined style={{ fontSize: isPhone ? 18 : 16 }} />}
                onClick={handleLogout}
                style={{
                  minWidth: isPhone ? 44 : undefined,
                  minHeight: isPhone ? 44 : undefined,
                }}
                aria-label="退出登录"
              >
                {isPhone ? '' : '退出'}
              </Button>
            </Tooltip>
          </Space>
        </Header>
        <Content style={{ margin: 0 }}>
          {/* 页面内容容器：流体 padding，深色模式自动跟随 */}
          <div style={{
            padding: isPhone ? '8px 8px calc(8px + var(--safe-bottom, 0px))' : (isTablet ? '16px 20px' : '20px 24px'),
            background: 'var(--color-bg-page, #FFF9F0)',
            minHeight: `calc(100svh - ${isPhone ? 56 : 64}px)`,
            width: '100%',
            maxWidth: 'var(--content-max-width, 1600px)',
            margin: '0 auto',
            boxSizing: 'border-box',
          }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
