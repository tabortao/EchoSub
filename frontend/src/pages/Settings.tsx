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
    <div>
      <Title level={4}>设置</Title>

      {/* 外观主题 */}
      <Card title="🎨 外观主题" style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>选择你喜欢的界面风格</Text>
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
                    borderRadius: 14,
                    border: active ? `3px solid ${t.primary}` : '3px solid transparent',
                    background: `linear-gradient(135deg, ${t.primary}18, ${t.config.token?.colorBgLayout ?? '#fff'})`,
                    padding: 16,
                    textAlign: 'center',
                    position: 'relative',
                    transition: 'all 0.2s',
                    boxShadow: active ? `0 4px 16px ${t.primary}40` : '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  {active && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 22, height: 22, borderRadius: '50%',
                      background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CheckOutlined style={{ color: '#fff', fontSize: 12 }} />
                    </div>
                  )}
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{t.emoji}</div>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 13 }}>{t.label}</div>
                  <div style={{
                    width: 40, height: 8, borderRadius: 4, margin: '8px auto 0',
                    background: `linear-gradient(90deg, ${t.primary}, ${t.primary}80)`,
                  }} />
                </div>
              </Col>
            )
          })}
        </Row>
      </Card>

      {/* 学习偏好 + TTS 设置（统一持久化到后端 settings 表） */}
      <Card title="📚 学习偏好 & TTS 朗读" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" style={{ maxWidth: 480 }}>
          <Form.Item
            label="整体循环播放次数"
            name="loop_count"
            tooltip="整个媒体文件循环播放的次数"
            rules={[{ required: true, message: '请输入循环次数' }]}
          >
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="逐句重复次数"
            name="sentence_repeat"
            tooltip="逐句复读模式下每句重复播放的次数"
            rules={[{ required: true, message: '请输入重复次数' }]}
          >
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="句末停顿时间（秒）"
            name="pause_seconds"
            tooltip="每句播放完后静音等待的秒数，供跟读或默念"
            rules={[{ required: true, message: '请输入停顿秒数' }]}
          >
            <InputNumber min={0} max={30} step={0.5} style={{ width: '100%' }} />
          </Form.Item>

          <Divider style={{ margin: '8px 0' }}>TTS 朗读默认设置</Divider>
          <Form.Item
            label="默认 TTS 语音"
            name="tts_voice"
            tooltip="学习页面 TTS 朗读使用的默认音色，可在播放时单独调整"
            rules={[{ required: true, message: '请选择语音' }]}
          >
            <Select options={TTS_VOICES} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            label={<span>朗读语速：<Text strong>{(form.getFieldValue('tts_speed') ?? 1.0).toFixed(1)}x</Text></span>}
            name="tts_speed"
            tooltip="0.5x 慢速朗读适合跟读；1.0x 正常；2.0x 快速浏览"
            rules={[{ required: true, message: '请设置语速' }]}
          >
            <Slider min={0.5} max={2.0} step={0.1} marks={{ 0.5: '0.5x', 1.0: '1.0x', 1.5: '1.5x', 2.0: '2.0x' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleSave} loading={saving}>保存设置</Button>
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>
          偏好会在播放器与学习页面朗读中作为默认值，单次使用时仍可临时调整。
        </Text>
      </Card>

      <AccountCard />

      <Divider />
      <Card title="📖 说明">
        <ul style={{ paddingLeft: 20, color: '#666', lineHeight: 2 }}>
          <li><Text strong>整体循环</Text>：整个音频/视频从头到尾播放 N 遍。</li>
          <li><Text strong>逐句复读</Text>：结合字幕，每句重复播放 M 次后进入下一句。</li>
          <li><Text strong>句末停顿</Text>：每句播放结束后静音等待 K 秒，便于跟读或复述。</li>
          <li><Text strong>默认 TTS 语音</Text>：学习页面朗读使用的音色与语速默认值。</li>
          <li><Text strong>账户安全</Text>：密码需 8-64 字符且同时包含字母和数字，用户名 3-64 字符仅限字母/数字/下划线。</li>
        </ul>
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
    <Card title="👤 账户管理" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 头像区 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Avatar
            size={96}
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
            <Button icon={<PictureOutlined />} loading={uploading} size="small">更换头像</Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 12 }}>jpg/png/webp/gif · ≤2MB</Text>
        </div>

        {/* 表单区 */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <Form form={profileForm} layout="vertical" style={{ maxWidth: 420 }}>
            <Form.Item
              label="用户名"
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { pattern: /^[a-zA-Z0-9_]{3,64}$/, message: '3-64 字符，仅字母/数字/下划线' },
              ]}
              extra="3-64 字符，仅字母/数字/下划线"
            >
              <Input prefix={<UserOutlined />} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSaveProfile} loading={savingProfile} icon={<UserOutlined />}>
                保存用户名
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '8px 0' }} />

          <Form form={pwdForm} layout="vertical" style={{ maxWidth: 420 }}>
            <Form.Item
              label="旧密码"
              name="old_password"
              rules={[{ required: true, message: '请输入旧密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              label="新密码"
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
              extra="8-64 字符，需同时包含字母和数字"
            >
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label="确认新密码"
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
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" onClick={handleSavePwd} loading={savingPwd} danger icon={<LockOutlined />}>
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
