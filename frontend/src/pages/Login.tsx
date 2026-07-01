import { useState } from 'react'
import { Card, Form, Input, Button, Tabs, message, Typography } from 'antd'
import { AudioOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'

const { Title } = Typography

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: { username: string; password: string }, isRegister: boolean) => {
    setLoading(true)
    try {
      const res = isRegister
        ? await authApi.register(values.username, values.password)
        : await authApi.login(values.username, values.password)
      const { token, user } = res.data.data
      setAuth(user, token)
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
    >
      <Form.Item
        label="用户名"
        name="username"
        rules={[
          { required: true, message: '请输入用户名' },
          { min: 3, message: '至少 3 个字符' },
        ]}
      >
        <Input placeholder="用户名" />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[
          { required: true, message: '请输入密码' },
          { min: 6, message: '至少 6 个字符' },
        ]}
      >
        <Input.Password placeholder="密码" />
      </Form.Item>
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.09)' }}>
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
