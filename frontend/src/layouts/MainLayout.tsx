import { Layout, Button, Space, Drawer, Tooltip, Avatar, Spin, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  HomeOutlined,
  TagOutlined,
  SettingOutlined,
  LogoutOutlined,
  AudioOutlined,
  MenuOutlined,
  UploadOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  BgColorsOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { message } from 'antd'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { useScanStore } from '@/store/scan'
import { authApi } from '@/api'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import { THEMES, type ThemeKey } from '@/theme/themes'

const { Sider, Content, Header } = Layout

// 每个菜单项配一个鲜艳颜色（动物森友会风 NookPhone 13 色 + 薄荷绿主色）
interface MenuItemCfg {
  key: string
  icon: ReactNode
  label: string
  /** 分类色（区分不同菜单功能） */
  color: string
  emoji: string
}

// 侧边栏取消「专辑」入口，专辑改为首页按行展示（emby 风格）
// v0.7.0 AC 风：使用 13 色 NookPhone 调色板
// 颜色是「分类色」—— 区分不同菜单功能，不随主题切换而变化
const menuItems: MenuItemCfg[] = [
  { key: '/', icon: <HomeOutlined />, label: '首页', color: '#19c8b9', emoji: '🏠' },
  { key: '/tags', icon: <TagOutlined />, label: '标签', color: '#6fba2c', emoji: '🏷️' },
  { key: '/upload', icon: <UploadOutlined />, label: '上传', color: '#b77dee', emoji: '⬆️' },
  // 「学习记录」入口已从侧边栏移除，移至首页右上角图标按钮（v0.7.3）
  { key: '/settings', icon: <SettingOutlined />, label: '设置', color: '#82d5bb', emoji: '⚙️' },
  { key: '/about', icon: <InfoCircleOutlined />, label: '关于', color: '#f7cd67', emoji: '💡' },
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

  // 快速切换主题（v0.7.1 起 Header 直接可切换，无需进入设置页）
  const currentThemeKey = (useSettingsStore((s) => s.theme ?? 'default') as ThemeKey)
  const updateSettings = useSettingsStore((s) => s.update)
  const loopCount = useSettingsStore((s) => s.loop_count)
  const sentenceRepeat = useSettingsStore((s) => s.sentence_repeat)
  const pauseSeconds = useSettingsStore((s) => s.pause_seconds)
  const ttsVoice = useSettingsStore((s) => s.tts_voice)
  const ttsSpeed = useSettingsStore((s) => s.tts_speed)
  const colorMode = useSettingsStore((s) => s.color_mode)

  // v0.7.1：侧边栏「首页」菜单项的颜色跟随当前主题
  // 这样切换主题时，整页主色（按钮、菜单、卡片、3D 阴影）都跟着变，
  // 用户能直观看到主题切换生效。
  const themePrimary = THEMES[currentThemeKey]?.primary ?? '#19c8b9'
  const menuItemsDynamic: MenuItemCfg[] = menuItems.map((m) =>
    m.key === '/' ? { ...m, color: themePrimary } : m
  )

  const handleQuickThemeChange = async (key: ThemeKey) => {
    if (key === currentThemeKey) return
    try {
      await updateSettings({
        loop_count: loopCount,
        sentence_repeat: sentenceRepeat,
        pause_seconds: pauseSeconds,
        tts_voice: ttsVoice,
        tts_speed: ttsSpeed,
        theme: key,
        color_mode: colorMode ?? 'auto',
      })
      message.success(`已切换到「${THEMES[key].label}」主题`)
    } catch {
      message.error('主题切换失败')
    }
  }

  // 主题下拉菜单项
  const themeMenuItems: MenuProps['items'] = (Object.keys(THEMES) as ThemeKey[]).map((key) => {
    const t = THEMES[key]
    const active = currentThemeKey === key
    return {
      key,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: `linear-gradient(135deg, ${t.primary}, ${t.primary}cc)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, boxShadow: `0 2px 4px ${t.primary}40`,
            }}
          >
            {active && <CheckOutlined style={{ color: '#fff', fontSize: 11 }} />}
          </div>
          <span style={{ flex: 1, fontWeight: active ? 700 : 500, color: active ? t.primary : undefined }}>{t.emoji} {t.label}</span>
        </div>
      ),
    }
  })

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

  // 渲染单个菜单项（AC 风：薄荷绿圆角选中态 + 暖羊皮纸 hover 背景）
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
          // AC 风：菜单项 padding 略大一点（视觉舒适）
          padding: isPhone ? '12px 16px' : (showLabel ? '10px 14px' : '10px 0'),
          margin: isPhone ? '2px 8px' : '3px 8px',
          borderRadius: 14, /* AC 风 14px 圆角 */
          cursor: 'pointer',
          background: active ? `color-mix(in srgb, ${item.color} 16%, var(--ac-bg-content-deep))` : 'transparent',
          color: active ? item.color : 'var(--ac-text-secondary, #9f927d)',
          fontWeight: active ? 700 : 500,
          fontSize: isPhone ? 16 : 15,
          minHeight: isPhone ? 48 : undefined,
          transition: 'background 0.2s, color 0.2s, transform 0.2s',
          justifyContent: showLabel ? 'flex-start' : 'center',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'var(--ac-bg-content, rgb(247, 243, 223))'
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

  // 侧边栏内容（手机抽屉 + 桌面 Sider 共用）—— AC 风
  const renderSidebar = (showLogoText: boolean) => (
    <>
      <div style={{
        height: isPhone ? 56 : 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: showLogoText ? 'flex-start' : 'center',
        gap: 10,
        padding: showLogoText ? '0 16px' : 0,
        borderBottom: `1.5px solid var(--color-border-soft)`,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12, /* AC 风圆角 */
          // v0.7.1：Logo 块渐变与 3D 阴影跟随当前主题（避免切主题后仍是薄荷绿）
          background: `linear-gradient(135deg, ${themePrimary}, ${themePrimary}cc)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 3px 0 0 ${themePrimary}99, 0 4px 8px ${themePrimary}4D`, /* 3D 像素堆叠 */
        }}>
          <AudioOutlined style={{ fontSize: 20, color: '#fff' }} />
        </div>
        {showLogoText && (
          <span style={{
            fontSize: 20, fontWeight: 900,
            color: 'var(--ac-text-header, #794f27)',
            letterSpacing: '0.02em',
          }}>EchoSub</span>
        )}
      </div>
      <div style={{ paddingTop: 8 }}>
        {menuItemsDynamic.map((item) => renderMenuItem(item, showLogoText))}
      </div>
    </>
  )

  // 桌面侧边栏宽度：iPad 240 / 桌面 240
  const siderWidth = isDesktop ? 240 : 220

  return (
    <Layout style={{ minHeight: '100svh', background: 'var(--color-bg-page, #f8f8f0)' }}>
      {isPhone ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={Math.min(window.innerWidth * 0.8, 320)}
          styles={{
            body: { padding: 0, background: 'var(--ac-bg-content, rgb(247, 243, 223))' },
            header: { display: 'none' },
          }}
          // 抽屉层级与触摸滚动体验
          mask={{ closable: true }}
        >
          {renderSidebar(true)}
        </Drawer>
      ) : (
        <Sider
          width={siderWidth}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          // v0.7.1：trigger 颜色由全局 CSS .ant-layout-sider-trigger 控制
          // 跟随当前主题主色 --ac-primary（避免 antd 默认深色背景与 AC 风冲突）
          // AC 风 Sider 背景：暖羊皮纸内容区
          style={{
            background: 'var(--ac-bg-content, rgb(247, 243, 223))',
            borderRight: '1.5px solid var(--color-border-soft)',
          }}
        >
          {renderSidebar(!collapsed)}
        </Sider>
      )}
      <Layout style={{ background: 'var(--color-bg-page, #f8f8f0)' }}>
        <Header style={{
          // 背景：暖羊皮纸内容区
          background: 'var(--ac-bg-content, rgb(247, 243, 223))',
          // AC 风：手机端紧凑 padding + 顶部安全区
          padding: isPhone
            ? '0 8px 0 8px'
            : '0 24px',
          paddingTop: isPhone ? 'var(--safe-top, 0px)' : undefined,
          height: isPhone ? 56 : 64,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1.5px solid var(--color-border-soft)',
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
            {/* 快速主题切换（v0.7.1 起）：Header 直接可切换主题 */}
            <Dropdown
              menu={{
                items: themeMenuItems,
                onClick: ({ key }) => handleQuickThemeChange(key as ThemeKey),
                selectedKeys: [currentThemeKey],
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Tooltip title={`当前主题：${THEMES[currentThemeKey].label}（点击切换）`}>
                <Button
                  type="text"
                  size={isPhone ? 'large' : 'middle'}
                  aria-label="切换主题"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: isPhone ? 44 : undefined,
                    minHeight: isPhone ? 44 : undefined,
                  }}
                >
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${THEMES[currentThemeKey].primary}, ${THEMES[currentThemeKey].primary}cc)`,
                      boxShadow: `0 2px 6px ${THEMES[currentThemeKey].primary}50, inset 0 -2px 4px rgba(0,0,0,0.15)`,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  {!isPhone && (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {THEMES[currentThemeKey].emoji} {THEMES[currentThemeKey].label}
                    </span>
                  )}
                  {!isPhone && <BgColorsOutlined style={{ fontSize: 12, opacity: 0.55 }} />}
                </Button>
              </Tooltip>
            </Dropdown>
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
          {/* 页面内容容器：AC 风暖羊皮纸背景 + 紧凑 padding */}
          <div style={{
            padding: isPhone ? '8px 8px calc(12px + var(--safe-bottom, 0px))' : (isTablet ? '16px 16px' : '20px 20px'),
            background: 'var(--color-bg-page, #f8f8f0)',
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
