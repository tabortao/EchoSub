import { useEffect, useState } from 'react'
import { Card, Form, InputNumber, Button, message, Spin, Typography, Divider } from 'antd'
import { useSettingsStore } from '@/store/settings'
import type { Settings } from '@/types'

const { Title, Text } = Typography

export default function SettingsPage() {
  const { loaded, load, update, loop_count, sentence_repeat, pause_seconds } = useSettingsStore()
  const [form] = Form.useForm<Settings>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    if (loaded) {
      form.setFieldsValue({ loop_count, sentence_repeat, pause_seconds })
    }
  }, [loaded, loop_count, sentence_repeat, pause_seconds, form])

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

  return (
    <div>
      <Title level={4}>学习偏好设置</Title>
      <Card>
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
          <Form.Item>
            <Button type="primary" onClick={handleSave} loading={saving}>保存设置</Button>
          </Form.Item>
        </Form>
      </Card>

      <Divider />
      <Card title="说明">
        <ul style={{ paddingLeft: 20, color: '#666', lineHeight: 2 }}>
          <li><Text strong>整体循环</Text>：整个音频/视频从头到尾播放 N 遍。</li>
          <li><Text strong>逐句复读</Text>：结合字幕，每句重复播放 M 次后进入下一句。</li>
          <li><Text strong>句末停顿</Text>：每句播放结束后静音等待 K 秒，便于跟读或复述。</li>
          <li>这些偏好会在播放器中作为默认值，可在播放时单独调整。</li>
        </ul>
      </Card>
    </div>
  )
}
