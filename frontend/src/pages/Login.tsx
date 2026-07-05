import { useState } from 'react'
import { Card, Form, Input, Button, Tabs, message, Typography, Checkbox } from 'antd'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useDeviceSize } from '@/hooks/useDeviceSize'

const { Title } = Typography

const REMEMBER_KEY = 'echosub_remember'

interface RememberedCredential {
  username: string
  password: string
}

function loadRemembered(): RememberedCredential | null {
  const raw = localStorage.getItem(REMEMBER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as RememberedCredential
  } catch {
    localStorage.removeItem(REMEMBER_KEY)
    return null
  }
}

/**
 * 登录 / 注册页（v0.6.0 起移动端友好）。
 *
 * 关键点：
 * - 卡片宽度 min(100%, 400px)：手机端贴边，桌面端居中
 * - 手机端 Input / Button size=large（触控目标 44px）
 * - 背景 / 文字色使用 CSS 变量，深色模式自动跟随
 * - iOS 顶部安全区：env(safe-area-inset-top)
 */
export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const { isPhone, isTablet } = useDeviceSize()
  const compactInput = isPhone

  const remembered = loadRemembered()

  const handleSubmit = async (
    values: { username: string; password: string; remember?: boolean },
    isRegister: boolean,
  ) => {
    setLoading(true)
    try {
      const res = isRegister
        ? await authApi.register(values.username, values.password)
        : await authApi.login(values.username, values.password)
      const { token, user } = res.data.data
      setAuth(user, token)

      // 仅登录态处理"记住密码"
      if (!isRegister) {
        if (values.remember) {
          localStorage.setItem(
            REMEMBER_KEY,
            JSON.stringify({ username: values.username, password: values.password }),
          )
        } else {
          localStorage.removeItem(REMEMBER_KEY)
        }
      }

      message.success(isRegister ? '注册成功' : '登录成功')
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '操作失败'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const LoginForm = ({ isRegister }: { isRegister: boolean }) => (
    <Form
      layout="vertical"
      onFinish={(v) => handleSubmit(v, isRegister)}
      autoComplete="off"
      initialValues={
        isRegister
          ? undefined
          : {
              username: remembered?.username ?? '',
              password: remembered?.password ?? '',
              remember: !!remembered,
            }
      }
    >
      <Form.Item
        label="用户名"
        name="username"
        rules={[
          { required: true, message: '请输入用户名' },
          { min: 3, message: '至少 3 个字符' },
          { max: 64, message: '最多 64 个字符' },
          {
            pattern: /^[a-zA-Z0-9_]+$/,
            message: '仅允许字母、数字、下划线',
          },
        ]}
        extra={isRegister ? '3-64 字符，仅字母/数字/下划线' : undefined}
      >
        <Input
          placeholder="用户名"
          autoComplete="username"
          size={compactInput ? 'large' : 'middle'}
        />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={
          isRegister
            ? [
                { required: true, message: '请输入密码' },
                { min: 8, message: '至少 8 个字符' },
                { max: 64, message: '最多 64 个字符' },
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve()
                    const hasLetter = /[a-zA-Z]/.test(value)
                    const hasDigit = /\d/.test(value)
                    if (!hasLetter || !hasDigit) {
                      return Promise.reject(new Error('需同时包含字母和数字'))
                    }
                    return Promise.resolve()
                  },
                },
              ]
            : [
                { required: true, message: '请输入密码' },
              ]
        }
        extra={isRegister ? '8-64 字符，需同时包含字母和数字' : undefined}
      >
        <Input.Password
          placeholder="密码"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          size={compactInput ? 'large' : 'middle'}
        />
      </Form.Item>
      {!isRegister && (
        <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 12 }}>
          <Checkbox>记住密码</Checkbox>
        </Form.Item>
      )}
      <Form.Item style={{ marginBottom: 0 }}>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          block
          size={compactInput ? 'large' : 'middle'}
        >
          {isRegister ? '注册' : '登录'}
        </Button>
      </Form.Item>
    </Form>
  )

  const items = [
    { key: 'login', label: '登录', children: <LoginForm isRegister={false} /> },
    { key: 'register', label: '注册', children: <LoginForm isRegister={true} /> },
  ]

  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // AC 风暖羊皮纸背景，深色模式自动跟随
      background: 'var(--ac-bg-page, #f8f8f0)',
      padding: isPhone
        ? 'calc(var(--safe-top, 0px) + 12px) 12px calc(var(--safe-bottom, 0px) + 12px)'
        : (isTablet ? '32px 20px' : '48px 24px'),
      boxSizing: 'border-box',
    }}>
      <Card
        style={{
          width: '100%',
          // 手机端满宽（不限制 400px），桌面端最大 400
          maxWidth: isPhone ? '100%' : 400,
          // AC 风圆润大圆角 + 羊皮纸卡片背景
          borderRadius: 24,
          background: 'var(--ac-bg-content, rgb(247, 243, 223))',
          border: '3px solid rgba(25, 200, 185, 0.25)',
          boxShadow: '0 8px 24px rgba(25, 200, 185, 0.15)',
        }}
        styles={{ body: { padding: isPhone ? 20 : 24 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* AC 风品牌色 Logo（薄荷绿） */}
          <div style={{
            fontSize: isPhone ? 48 : 56, marginBottom: 4,
            filter: 'drop-shadow(0 4px 8px rgba(25, 200, 185, 0.3))',
          }}>🌿</div>
          <Title level={3} style={{ marginTop: 0, marginBottom: 4, color: 'var(--ac-text-header, #794f27)', fontWeight: 800 }}>EchoSub</Title>
          <p style={{ color: 'var(--ac-text-secondary, #9f927d)', fontSize: 13 }}>🍃 语言学习与课文背诵</p>
        </div>
        <Tabs items={items} defaultActiveKey="login" centered />
      </Card>
    </div>
  )
}
