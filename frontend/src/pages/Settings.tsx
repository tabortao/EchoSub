import { useEffect, useState } from 'react'
import {
  Card, Form, InputNumber, Button, message, Spin, Typography, Divider,
  Input, Avatar, Upload, Slider, Select, Space, Row, Col,
} from 'antd'
import {
  UserOutlined, LockOutlined, PictureOutlined, CheckOutlined,
  SunOutlined, MoonOutlined, DesktopOutlined,
} from '@ant-design/icons'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'
import { THEMES, type ThemeKey } from '@/theme/themes'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { ColorMode, Settings, User } from '@/types'

const { Text } = Typography

// TTS 语音候选（VoiceCraft 兼容的 Microsoft Edge TTS 音色）
const TTS_VOICES = [
  { value: 'en-US-JennyNeural', label: 'Jenny（美式女声）' },
  { value: 'en-US-GuyNeural', label: 'Guy（美式男声）' },
  { value: 'en-US-AriaNeural', label: 'Aria（美式女声·柔和）' },
  { value: 'en-US-DavisNeural', label: 'Davis（美式男声·温和）' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia（英式女声）' },
  { value: 'en-GB-RyanNeural', label: 'Ryan（英式男声）' },
  { value: 'en-AU-NatashaNeural', label: 'Natasha（澳式女声）' },
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（中文女声）' },
  { value: 'zh-CN-YunxiNeural', label: '云希（中文男声）' },
]

/**
 * 设置页：外观主题 + 颜色模式 + 学习偏好 + TTS + 账户管理。
 * v0.6.0 起全面支持响应式 + 深色模式：
 * - 主题卡片采用大圆角色块（圆形主色 + 渐变），触控更友好
 * - 颜色模式（light / dark / auto）三档选择，立即生效
 * - 桌面端 4 列主题栅格，手机端 2 列
 * - 所有颜色硬编码全部替换为 CSS 变量
 */
export default function SettingsPage() {
  const { loaded, load, update, loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme, color_mode, setColorMode } = useSettingsStore()
  const [form] = Form.useForm<Settings>()
  const [saving, setSaving] = useState(false)
  const { isPhone } = useDeviceSize()

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    if (loaded) {
      form.setFieldsValue({ loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme, color_mode: color_mode ?? 'auto' })
    }
  }, [loaded, loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme, color_mode, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await update(values)
      message.success('设置已保存')
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  const handleThemeChange = async (key: ThemeKey) => {
    if (key === theme) return
    try {
      await update({ loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme: key, color_mode })
      message.success(`已切换到「${THEMES[key].label}」主题`)
    } catch {
      message.error('主题切换失败')
    }
  }

  // 颜色模式立即切换 + 持久化（无需等保存按钮）
  const handleColorModeChange = async (mode: ColorMode) => {
    if (mode === color_mode) return
    setColorMode(mode)
    try {
      await update({ loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme, color_mode: mode })
      const labels: Record<ColorMode, string> = { light: '始终浅色', dark: '始终深色', auto: '跟随系统' }
      message.success(`颜色模式已切换为「${labels[mode]}」`)
    } catch {
      message.error('颜色模式切换失败')
    }
  }

  return (
    <div>
      {/* AC 风页面标题 */}
      <Typography.Title level={4} style={{ marginBottom: 16, color: 'var(--ac-text-header, #794f27)', fontWeight: 800, letterSpacing: '0.02em' }}>⚙️ 设置</Typography.Title>
      <div style={{ marginBottom: isPhone ? 12 : 20 }} />

      {/* 外观主题 —— 大圆角色块 + 响应式栅格 */}
      <Card
        style={{
          marginBottom: 20,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '16px' : '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>🎨</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>外观主题</span>
          <Text type="secondary" style={{ fontSize: 12 }}>🏝️ 4 套主题均为动森风格，仅主色不同；也可用右上角主题色块快速切换</Text>
        </div>
        <Row gutter={[12, 16]}>
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
            const t = THEMES[key]
            const active = (theme ?? 'default') === key
            return (
              <Col key={key} xs={12} sm={6}>
                <ThemeCircle
                  emoji={t.emoji}
                  label={t.label}
                  primary={t.primary}
                  active={active}
                  onClick={() => handleThemeChange(key)}
                  isPhone={isPhone}
                />
              </Col>
            )
          })}
        </Row>
      </Card>

      {/* 颜色模式 —— 三档选择 */}
      <Card
        style={{
          marginBottom: 20,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '16px' : '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>🌓</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>颜色模式</span>
          <Text type="secondary" style={{ fontSize: 12 }}>选择界面的明暗风格</Text>
        </div>
        <ColorModeSwitch value={color_mode ?? 'auto'} onChange={handleColorModeChange} isPhone={isPhone} />
      </Card>

      {/* 学习偏好 + TTS 设置 —— 双列响应式 + 渐变卡片 */}
      <Card
        style={{
          marginBottom: 20,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '16px' : '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>学习偏好</span>
          <Text type="secondary" style={{ fontSize: 12 }}>配置播放器和 TTS 朗读的默认行为</Text>
        </div>
        <Form form={form} layout="vertical">
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>🔁 整体循环播放次数</span>}
                name="loop_count"
                tooltip="整个媒体文件循环播放的次数"
                rules={[{ required: true, message: '请输入循环次数' }]}
              >
                <InputNumber min={1} max={20} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>🔂 逐句重复次数</span>}
                name="sentence_repeat"
                tooltip="逐句复读模式下每句重复播放的次数"
                rules={[{ required: true, message: '请输入重复次数' }]}
              >
                <InputNumber min={1} max={20} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 0]}>
            <Col xs={24}>
              <Form.Item
                label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>⏸️ 句末停顿时间（秒）</span>}
                name="pause_seconds"
                tooltip="每句播放完后静音等待的秒数，供跟读或默念"
                rules={[{ required: true, message: '请输入停顿秒数' }]}
              >
                <InputNumber min={0} max={30} step={0.5} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0 20px' }}>🎤 TTS 朗读默认设置</Divider>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>🗣️ 默认 TTS 语音</span>}
                name="tts_voice"
                tooltip="学习页面 TTS 朗读使用的默认音色"
                rules={[{ required: true, message: '请选择语音' }]}
              >
                <Select options={TTS_VOICES} showSearch optionFilterProp="label" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>🚀 朗读语速：<Text strong style={{ color: 'var(--ant-color-primary)' }}>{(form.getFieldValue('tts_speed') ?? 1.0).toFixed(1)}x</Text></span>}
                name="tts_speed"
                tooltip="0.5x 慢速朗读适合跟读；1.0x 正常；2.0x 快速浏览"
                rules={[{ required: true, message: '请设置语速' }]}
              >
                <Slider min={0.5} max={2.0} step={0.1} marks={{ 0.5: '0.5x', 1.0: '1.0x', 1.5: '1.5x', 2.0: '2.0x' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" onClick={handleSave} loading={saving} size="large" style={{ borderRadius: 10, minWidth: 120, minHeight: 44 }}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 账户管理 */}
      <AccountCard />

      {/* 说明 */}
      <Card
        style={{
          marginTop: 20,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '16px' : '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>📖</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>功能说明</span>
        </div>
        <Row gutter={[12, 12]}>
          {[
            { emoji: '🔁', title: '整体循环', desc: '整个音频/视频从头到尾播放 N 遍' },
            { emoji: '🔂', title: '逐句复读', desc: '结合字幕，每句重复 M 次后进入下一句' },
            { emoji: '⏸️', title: '句末停顿', desc: '每句结束后静音等待 K 秒，便于跟读' },
            { emoji: '🎤', title: 'TTS 朗读', desc: '学习页面朗读使用的音色与语速默认值' },
            { emoji: '🔒', title: '账户安全', desc: '密码 8-64 字符，需同时包含字母和数字' },
            { emoji: '🎨', title: '外观主题', desc: '4 套小学生审美主题随心切换' },
          ].map((item) => (
            <Col key={item.title} xs={24} sm={12} lg={8}>
              <div style={{
                display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12,
                background: 'var(--color-bg-page, #FFF9F0)',
                border: '1px solid var(--color-border-soft, rgba(0,0,0,0.06))',
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{item.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)', fontSize: 13 }}>{item.title}</div>
                  <div style={{ color: 'var(--color-text-tertiary, #8c8c8c)', fontSize: 12, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )
}

/**
 * 主题圆形角色块（v0.6.0 新设计）：
 * - 大圆形主色 + emoji 图标，视觉更聚焦
 * - 选中态：实心圆形 + 阴影上浮 + 右上角 ✓ 徽章
 * - 桌面 / 手机端均保证 44px+ 触控目标
 */
function ThemeCircle({
  emoji, label, primary, active, onClick, isPhone,
}: {
  emoji: string
  label: string
  primary: string
  active: boolean
  onClick: () => void
  isPhone: boolean
}) {
  const circleSize = isPhone ? 64 : 72
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{
        cursor: 'pointer',
        borderRadius: 16,
        padding: isPhone ? '14px 8px 12px' : '18px 12px 14px',
        textAlign: 'center',
        position: 'relative',
        transition: 'all 0.25s',
        background: active
          ? `linear-gradient(135deg, ${primary}1A, ${primary}2E)`
          : 'var(--color-bg-page, #fafafa)',
        border: active
          ? `2px solid ${primary}`
          : '2px solid var(--color-border-soft, rgba(0,0,0,0.06))',
        boxShadow: active
          ? `0 8px 20px ${primary}40`
          : 'var(--color-shadow-card, 0 2px 8px rgba(0,0,0,0.04))',
        transform: active ? 'translateY(-3px)' : 'none',
        minHeight: isPhone ? 110 : 130,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.transform = 'none' }}
    >
      {active && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: '50%',
          background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 8px ${primary}60`,
        }}>
          <CheckOutlined style={{ color: '#fff', fontSize: 12, fontWeight: 700 }} />
        </div>
      )}
      {/* 大圆角色块：径向渐变 + 中心 emoji */}
      <div
        style={{
          width: circleSize,
          height: circleSize,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${primary} 0%, ${primary}CC 60%, ${primary}80 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: circleSize * 0.5,
          boxShadow: active
            ? `0 6px 16px ${primary}50, inset 0 -4px 8px rgba(0,0,0,0.15)`
            : `0 4px 10px ${primary}30, inset 0 -3px 6px rgba(0,0,0,0.10)`,
          filter: active ? 'none' : 'grayscale(0.15)',
          transition: 'all 0.25s',
        }}
      >
        <span style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}>{emoji}</span>
      </div>
      <div style={{
        fontWeight: 700,
        color: active ? primary : 'var(--color-text-primary, #1a1a1a)',
        fontSize: 13,
        lineHeight: 1.2,
      }}>
        {label}
      </div>
    </div>
  )
}

/**
 * 颜色模式三档选择器：浅色 / 深色 / 跟随系统。
 * 桌面端并排展示，手机端纵向堆叠。
 */
function ColorModeSwitch({
  value, onChange, isPhone,
}: {
  value: ColorMode
  onChange: (m: ColorMode) => void
  isPhone: boolean
}) {
  const options: { key: ColorMode; icon: React.ReactNode; label: string; desc: string; previewBg: string; previewText: string }[] = [
    {
      key: 'light',
      icon: <SunOutlined />,
      label: '始终浅色',
      desc: '白底深字，明亮清爽',
      previewBg: '#FFFFFF',
      previewText: '#1a1a1a',
    },
    {
      key: 'dark',
      icon: <MoonOutlined />,
      label: '始终深色',
      desc: '黑底浅字，护眼舒适',
      previewBg: '#1F1E1C',
      previewText: '#E6E6E6',
    },
    {
      key: 'auto',
      icon: <DesktopOutlined />,
      label: '跟随系统',
      desc: '跟随系统设置自动切换',
      previewBg: 'linear-gradient(135deg, #FFFFFF 50%, #1F1E1C 50%)',
      previewText: '#888',
    },
  ]

  return (
    <Row gutter={[12, 12]}>
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <Col key={opt.key} xs={24} sm={8}>
            <div
              onClick={() => onChange(opt.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.key) } }}
              style={{
                cursor: 'pointer',
                borderRadius: 16,
                padding: isPhone ? '14px' : '16px',
                background: active
                  ? 'linear-gradient(135deg, var(--ant-color-primary) 1A, var(--ant-color-primary) 2E)'
                  : 'var(--color-bg-page, #fafafa)',
                border: active
                  ? '2px solid var(--ant-color-primary)'
                  : '2px solid var(--color-border-soft, rgba(0,0,0,0.06))',
                boxShadow: active
                  ? '0 6px 16px color-mix(in srgb, var(--ant-color-primary) 30%, transparent)'
                  : 'var(--color-shadow-card, 0 2px 8px rgba(0,0,0,0.04))',
                transition: 'all 0.25s',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 72,
                position: 'relative',
              }}
            >
              {/* 预览缩略图：直观展示颜色模式效果 */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: opt.previewBg,
                  border: '1px solid var(--color-border-soft, rgba(0,0,0,0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  color: opt.previewText,
                  flexShrink: 0,
                }}
              >
                {opt.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 700,
                  color: active ? 'var(--ant-color-primary)' : 'var(--color-text-primary, #1a1a1a)',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  {opt.icon}
                  {opt.label}
                </div>
                <div style={{
                  color: 'var(--color-text-tertiary, #8c8c8c)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  marginTop: 2,
                }}>
                  {opt.desc}
                </div>
              </div>
              {active && (
                <CheckOutlined style={{ color: 'var(--ant-color-primary)', fontSize: 18, flexShrink: 0 }} />
              )}
            </div>
          </Col>
        )
      })}
    </Row>
  )
}

/**
 * 账户管理卡片：修改用户名、修改密码、上传头像。
 * 所有写操作均走 /auth/* 接口，成功后同步更新本地 store。
 */
function AccountCard() {
  const { user, token, updateUser } = useAuthStore()
  const [profileForm] = Form.useForm<{ username: string }>()
  const [pwdForm] = Form.useForm<{ old_password: string; new_password: string; confirm: string }>()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarTick, setAvatarTick] = useState(0) // 头像 URL 变化时强制刷新
  const { isPhone } = useDeviceSize()

  useEffect(() => {
    if (user) profileForm.setFieldsValue({ username: user.username })
  }, [user, profileForm])

  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields()
      if (values.username === user?.username) {
        message.info('用户名未变化')
        return
      }
      setSavingProfile(true)
      const res = await authApi.updateProfile(values.username)
      updateUser(res.data.data.user as User)
      message.success('用户名已更新')
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '修改失败'
      message.error(msg)
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePwd = async () => {
    try {
      const values = await pwdForm.validateFields()
      setSavingPwd(true)
      await authApi.changePassword(values.old_password, values.new_password)
      message.success('密码已修改')
      pwdForm.resetFields()
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '修改失败'
      message.error(msg)
    } finally {
      setSavingPwd(false)
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const res = await authApi.uploadAvatar(file)
      updateUser(res.data.data.user as User)
      setAvatarTick((t) => t + 1)
      message.success('头像已更新')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '上传失败'
      message.error(msg)
    } finally {
      setUploading(false)
    }
  }

  // 自定义 Upload：不使用 antd Upload 的 action，直接调 handleUpload
  const beforeUpload = (file: File) => {
    handleUpload(file)
    return false // 阻止默认上传行为
  }

  const avatarUrl = user?.avatar_path
    ? `${authApi.avatarUrl(token ?? '')}&t=${avatarTick}`
    : undefined

  return (
    <Card
      style={{
        marginBottom: 20,
        borderRadius: 20,
        border: 'none',
        background: 'var(--color-bg-elevated, #fff)',
        boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
      }}
      styles={{ body: { padding: isPhone ? '16px' : '20px 24px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>👤</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>账户管理</span>
      </div>
      <div style={{
        display: 'flex',
        gap: isPhone ? 16 : 24,
        alignItems: isPhone ? 'center' : 'flex-start',
        flexDirection: isPhone ? 'column' : 'row',
        flexWrap: 'wrap',
      }}>
        {/* 头像区 */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: isPhone ? '14px 18px' : '18px 22px',
          borderRadius: 16,
          background: 'var(--color-bg-page, #fef9f5)',
          border: '1px solid var(--color-border-soft, rgba(0,0,0,0.06))',
          width: isPhone ? '100%' : 'auto',
        }}>
          <Avatar
            size={isPhone ? 72 : 80}
            src={avatarUrl}
            icon={!avatarUrl ? <UserOutlined /> : undefined}
            style={!avatarUrl ? { background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))' } : undefined}
          >
            {!avatarUrl ? (user?.username?.[0]?.toUpperCase() ?? 'U') : undefined}
          </Avatar>
          <Upload
            accept="image/png,image/jpeg,image/webp,image/gif"
            showUploadList={false}
            beforeUpload={beforeUpload}
            maxCount={1}
          >
            <Button icon={<PictureOutlined />} loading={uploading} size={isPhone ? 'middle' : 'small'} style={{ borderRadius: 8, minHeight: isPhone ? 40 : 32 }}>
              更换头像
            </Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 11 }}>jpg/png/webp/gif · ≤2MB</Text>
        </div>

        {/* 表单区 */}
        <div style={{ flex: 1, minWidth: 280, width: '100%' }}>
          <Form form={profileForm} layout="vertical">
            <Form.Item
              label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>用户名</span>}
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { pattern: /^[a-zA-Z0-9_]{3,64}$/, message: '3-64 字符，仅字母/数字/下划线' },
              ]}
            >
              <Input prefix={<UserOutlined />} size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSaveProfile} loading={savingProfile} icon={<UserOutlined />} size="large" style={{ borderRadius: 10, minHeight: 44 }}>
                保存用户名
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '12px 0' }} />

          <Form form={pwdForm} layout="vertical">
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>旧密码</span>}
                  name="old_password"
                  rules={[{ required: true, message: '请输入旧密码' }]}
                >
                  <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>新密码</span>}
                  name="new_password"
                  rules={[
                    { required: true, message: '请输入新密码' },
                    { min: 8, max: 64, message: '8-64 字符' },
                    {
                      validator: (_, value: string) => {
                        if (!value) return Promise.resolve()
                        const hasLetter = /[a-zA-Z]/.test(value)
                        const hasDigit = /\d/.test(value)
                        if (!hasLetter || !hasDigit) return Promise.reject(new Error('需同时包含字母和数字'))
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} autoComplete="new-password" size="large" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              label={<span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1a1a1a)' }}>确认新密码</span>}
              name="confirm"
              dependencies={['new_password']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator: (_, value: string) => {
                    if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                    return Promise.reject(new Error('两次输入不一致'))
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" size="large" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Space wrap>
                <Button type="primary" onClick={handleSavePwd} loading={savingPwd} danger icon={<LockOutlined />} size="large" style={{ borderRadius: 10, minHeight: 44 }}>
                  修改密码
                </Button>
                <Text type="secondary" style={{ fontSize: 12 }}>修改密码不会影响当前登录状态</Text>
              </Space>
            </Form.Item>
          </Form>
        </div>
      </div>
    </Card>
  )
}
