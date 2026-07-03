import { useEffect, useState } from 'react'
import {
  Card, Form, InputNumber, Button, message, Spin, Typography, Divider,
  Input, Avatar, Upload, Slider, Select, Space, Row, Col,
} from 'antd'
import { UserOutlined, LockOutlined, PictureOutlined, CheckOutlined } from '@ant-design/icons'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'
import { THEMES, type ThemeKey } from '@/theme/themes'
import type { Settings, User } from '@/types'

const { Title, Text } = Typography

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

export default function SettingsPage() {
  const { loaded, load, update, loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme } = useSettingsStore()
  const [form] = Form.useForm<Settings>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    if (loaded) {
      form.setFieldsValue({ loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme })
    }
  }, [loaded, loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme, form])

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
      await update({ loop_count, sentence_repeat, pause_seconds, tts_voice, tts_speed, theme: key })
      message.success(`已切换到「${THEMES[key].label}」主题`)
    } catch {
      message.error('主题切换失败')
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>
          ⚙️ 设置
        </Title>
        <Text type="secondary">管理你的学习偏好、外观主题和账户信息</Text>
      </div>

      {/* 外观主题 —— 渐变卡片 + 响应式栅格 */}
      <Card
        style={{ marginBottom: 20, borderRadius: 20, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>🎨</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>外观主题</span>
          <Text type="secondary" style={{ fontSize: 12 }}>选择你喜欢的界面风格</Text>
        </div>
        <Row gutter={[12, 12]}>
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
            const t = THEMES[key]
            const active = (theme ?? 'default') === key
            return (
              <Col key={key} xs={12} sm={6}>
                <div
                  onClick={() => handleThemeChange(key)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 16,
                    border: active ? `3px solid ${t.primary}` : '3px solid transparent',
                    background: active
                      ? `linear-gradient(135deg, ${t.primary}14, ${t.primary}22)`
                      : 'linear-gradient(135deg, #fafafa, #f5f5f5)',
                    padding: '18px 16px',
                    textAlign: 'center',
                    position: 'relative',
                    transition: 'all 0.25s',
                    boxShadow: active ? `0 4px 16px ${t.primary}30` : '0 2px 8px rgba(0,0,0,0.04)',
                    transform: active ? 'translateY(-2px)' : 'none',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.transform = 'none' }}
                >
                  {active && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 24, height: 24, borderRadius: '50%',
                      background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 2px 8px ${t.primary}40`,
                    }}>
                      <CheckOutlined style={{ color: '#fff', fontSize: 13, fontWeight: 700 }} />
                    </div>
                  )}
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{t.emoji}</div>
                  <div style={{ fontWeight: 700, color: active ? t.primary : '#1a1a1a', fontSize: 14 }}>{t.label}</div>
                  <div style={{
                    width: 44, height: 8, borderRadius: 4, margin: '10px auto 0',
                    background: active ? `linear-gradient(90deg, ${t.primary}, ${t.primary}70)` : '#d9d9d9',
                    transition: 'background 0.3s',
                  }} />
                </div>
              </Col>
            )
          })}
        </Row>
      </Card>

      {/* 学习偏好 + TTS 设置 —— 双列响应式 + 渐变卡片 */}
      <Card
        style={{ marginBottom: 20, borderRadius: 20, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>学习偏好</span>
          <Text type="secondary" style={{ fontSize: 12 }}>配置播放器和 TTS 朗读的默认行为</Text>
        </div>
        <Form form={form} layout="vertical">
          <Row gutter={[24, 8]}>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600 }}>🔁 整体循环播放次数</span>}
                name="loop_count"
                tooltip="整个媒体文件循环播放的次数"
                rules={[{ required: true, message: '请输入循环次数' }]}
              >
                <InputNumber min={1} max={20} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600 }}>🔂 逐句重复次数</span>}
                name="sentence_repeat"
                tooltip="逐句复读模式下每句重复播放的次数"
                rules={[{ required: true, message: '请输入重复次数' }]}
              >
                <InputNumber min={1} max={20} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[24, 8]}>
            <Col xs={24}>
              <Form.Item
                label={<span style={{ fontWeight: 600 }}>⏸️ 句末停顿时间（秒）</span>}
                name="pause_seconds"
                tooltip="每句播放完后静音等待的秒数，供跟读或默念"
                rules={[{ required: true, message: '请输入停顿秒数' }]}
              >
                <InputNumber min={0} max={30} step={0.5} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0 20px' }}>🎤 TTS 朗读默认设置</Divider>

          <Row gutter={[24, 8]}>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600 }}>🗣️ 默认 TTS 语音</span>}
                name="tts_voice"
                tooltip="学习页面 TTS 朗读使用的默认音色"
                rules={[{ required: true, message: '请选择语音' }]}
              >
                <Select options={TTS_VOICES} showSearch optionFilterProp="label" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<span style={{ fontWeight: 600 }}>🚀 朗读语速：<Text strong style={{ color: '#FF7A45' }}>{(form.getFieldValue('tts_speed') ?? 1.0).toFixed(1)}x</Text></span>}
                name="tts_speed"
                tooltip="0.5x 慢速朗读适合跟读；1.0x 正常；2.0x 快速浏览"
                rules={[{ required: true, message: '请设置语速' }]}
              >
                <Slider min={0.5} max={2.0} step={0.1} marks={{ 0.5: '0.5x', 1.0: '1.0x', 1.5: '1.5x', 2.0: '2.0x' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" onClick={handleSave} loading={saving} size="large" style={{ borderRadius: 10, minWidth: 120 }}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 账户管理 */}
      <AccountCard />

      {/* 说明 */}
      <Card
        style={{ marginTop: 20, borderRadius: 20, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>📖</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>功能说明</span>
        </div>
        <Row gutter={[16, 12]}>
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
                background: 'linear-gradient(135deg, #fef9f5, #fff)', border: '1px solid #fff0e6',
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{item.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 13 }}>{item.title}</div>
                  <div style={{ color: '#8c8c8c', fontSize: 12, lineHeight: 1.5 }}>{item.desc}</div>
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
      style={{ marginBottom: 20, borderRadius: 20, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>👤</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>账户管理</span>
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 头像区 */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '18px 22px', borderRadius: 16, background: 'linear-gradient(135deg, #fef9f5, #fff)',
          border: '1px solid #fff0e6',
        }}>
          <Avatar
            size={80}
            src={avatarUrl}
            icon={!avatarUrl ? <UserOutlined /> : undefined}
            style={!avatarUrl ? { background: 'linear-gradient(135deg, #FF7A45, #FFB37A)' } : undefined}
          >
            {!avatarUrl ? (user?.username?.[0]?.toUpperCase() ?? 'U') : undefined}
          </Avatar>
          <Upload
            accept="image/png,image/jpeg,image/webp,image/gif"
            showUploadList={false}
            beforeUpload={beforeUpload}
            maxCount={1}
          >
            <Button icon={<PictureOutlined />} loading={uploading} size="small" style={{ borderRadius: 8 }}>更换头像</Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 11 }}>jpg/png/webp/gif · ≤2MB</Text>
        </div>

        {/* 表单区 */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <Form form={profileForm} layout="vertical">
            <Form.Item
              label={<span style={{ fontWeight: 600 }}>用户名</span>}
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { pattern: /^[a-zA-Z0-9_]{3,64}$/, message: '3-64 字符，仅字母/数字/下划线' },
              ]}
            >
              <Input prefix={<UserOutlined />} size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSaveProfile} loading={savingProfile} icon={<UserOutlined />} style={{ borderRadius: 10 }}>
                保存用户名
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '12px 0' }} />

          <Form form={pwdForm} layout="vertical">
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label={<span style={{ fontWeight: 600 }}>旧密码</span>}
                  name="old_password"
                  rules={[{ required: true, message: '请输入旧密码' }]}
                >
                  <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label={<span style={{ fontWeight: 600 }}>新密码</span>}
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
              label={<span style={{ fontWeight: 600 }}>确认新密码</span>}
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
              <Space>
                <Button type="primary" onClick={handleSavePwd} loading={savingPwd} danger icon={<LockOutlined />} style={{ borderRadius: 10 }}>
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
