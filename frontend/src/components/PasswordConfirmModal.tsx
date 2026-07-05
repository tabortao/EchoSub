import { useState } from 'react'
import { Modal, Input, Form, Typography } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useDeviceSize } from '@/hooks/useDeviceSize'

const { Text } = Typography

interface PasswordConfirmModalProps {
  open: boolean
  /** 提示标题，默认 "🔐 确认删除" */
  title?: string
  /** 顶部说明文字（描述被删除的对象） */
  description?: string
  /** Modal 内的额外内容插槽 */
  extra?: React.ReactNode
  /** 提交时 loading 态 */
  loading?: boolean
  /** 确认回调（接收明文密码，由调用方负责用 header 传到后端） */
  onConfirm: (password: string) => void | Promise<void>
  onCancel: () => void
}

/**
 * 二次确认删除 Modal：要求用户输入登录密码才能继续。
 * 后端在删除端点（DELETE /media/:id, /media/file, /media/dir, /albums）内部
 * 会用 `X-Delete-Password` header 校验当前用户密码，错误则返回 401。
 *
 * v0.6.0 移动端适配：手机端输入框与按钮升级 large（minHeight 44），确保触控目标合规。
 */
export default function PasswordConfirmModal({
  open,
  title = '🔐 确认删除',
  description,
  extra,
  loading = false,
  onConfirm,
  onCancel,
}: PasswordConfirmModalProps) {
  const { isPhone } = useDeviceSize()
  const [form] = Form.useForm<{ password: string }>()
  const [submitting, setSubmitting] = useState(false)

  const handleOk = async () => {
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      try {
        await onConfirm(v.password)
        form.resetFields()
      } finally {
        setSubmitting(false)
      }
    } catch {
      // 校验失败：do nothing
    }
  }

  const handleCancel = () => {
    if (submitting || loading) return
    form.resetFields()
    onCancel()
  }

  const inputSize = isPhone ? 'large' : 'middle'
  const btnMinHeight = 44

  return (
    <Modal
      title={title}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="确认删除"
      okButtonProps={{ danger: true, loading: submitting || loading, size: inputSize, style: { minHeight: btnMinHeight } }}
      cancelText="取消"
      cancelButtonProps={{ size: inputSize, style: { minHeight: btnMinHeight } }}
      destroyOnClose
      maskClosable={!(submitting || loading)}
    >
      {description && (
        <div style={{ marginBottom: 12, color: '#595959' }}>{description}</div>
      )}
      {extra}
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        为防止误删，请输入登录密码以确认操作。
      </Text>
      <Form form={form} preserve={false} style={{ marginTop: 12 }}>
        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入登录密码' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="登录密码"
            autoComplete="current-password"
            autoFocus
            onPressEnter={handleOk}
            size={inputSize}
            style={{ minHeight: btnMinHeight }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
