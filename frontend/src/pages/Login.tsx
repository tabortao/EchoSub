import { useState } from 'react'
import { Card, Form, Input, Button, Tabs, message, Typography, Checkbox, Grid } from 'antd'
import { AudioOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'

const { Title } = Typography
const { useBreakpoint } = Grid

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

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const screens = useBreakpoint()
  const isMobile = !screens.md

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
        ]}
      >
        <Input placeholder="用户名" autoComplete="username" />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[
          { required: true, message: '请输入密码' },
          { min: 6, message: '至少 6 个字符' },
        ]}
      >
        <Input.Password placeholder="密码" autoComplete={isRegister ? 'new-password' : 'current-password'} />
      </Form.Item>
      {!isRegister && (
        <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 12 }}>
          <Checkbox>记住密码</Checkbox>
        </Form.Item>
      )}
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
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
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5',
      padding: isMobile ? 12 : 24,
    }}>
      <Card style={{ width: '100%', maxWidth: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.09)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <AudioOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          <Title level={3} style={{ marginTop: 8, marginBottom: 0 }}>EchoSub</Title>
          <p style={{ color: '#888' }}>语言学习与课文背诵</p>
        </div>
        <Tabs items={items} defaultActiveKey="login" centered />
      </Card>
    </div>
  )
}
