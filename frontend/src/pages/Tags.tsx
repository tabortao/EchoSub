import { useEffect, useState } from 'react'
import { Card, Row, Col, Tag, Input, Button, Empty, Spin, Modal, message, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { tagApi, mediaApi } from '@/api'
import type { Tag as TagType, MediaListResponse } from '@/types'

const { Text } = Typography

export default function Tags() {
  const navigate = useNavigate()
  const [tags, setTags] = useState<TagType[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<TagType | null>(null)
  const [editName, setEditName] = useState('')
  const [counts, setCounts] = useState<Record<number, number>>({})

  const load = async () => {
    setLoading(true)
    try {
      const res = await tagApi.list()
      const list = res.data.data.tags ?? []
      setTags(list)
      // 统计每个标签下媒体数量
      for (const t of list) {
        try {
          const m = await mediaApi.list({ tag_id: String(t.id), size: 1 })
          setCounts((c) => ({ ...c, [t.id]: (m.data.data as MediaListResponse).total }))
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await tagApi.create(newName.trim())
      setNewName('')
      message.success('标签已创建')
      load()
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '创建失败')
    }
  }

  const handleUpdate = async () => {
    if (!editing || !editName.trim()) return
    try {
      await tagApi.update(editing.id, editName.trim())
      setEditing(null)
      message.success('已更新')
      load()
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '更新失败')
    }
  }

  const handleDelete = async (t: TagType) => {
    Modal.confirm({
      title: '确认删除标签？',
      content: `将删除标签「${t.name}」`,
      onOk: async () => {
        try {
          await tagApi.delete(t.id)
          message.success('已删除')
          load()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  return (
    <div>
      <Typography.Title level={4}>标签管理</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={8} align="middle">
          <Col flex="auto">
            <Input
              prefix={<PlusOutlined />}
              placeholder="新建标签"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleCreate}
            />
          </Col>
          <Col>
            <Button type="primary" onClick={handleCreate}>添加</Button>
          </Col>
        </Row>
      </Card>

      {tags.length === 0 ? (
        <Empty description="暂无标签" />
      ) : (
        <Row gutter={[16, 16]}>
          {tags.map((t) => (
            <Col xs={24} sm={12} md={8} lg={6} key={t.id}>
              <Card
                hoverable
                onClick={() => navigate(`/?tag_id=${t.id}`)}
                actions={[
                  <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); setEditing(t); setEditName(t.name) }} />,
                  <DeleteOutlined key="del" onClick={(e) => { e.stopPropagation(); handleDelete(t) }} />,
                ]}
              >
                <Card.Meta
                  title={<Tag color="blue" style={{ fontSize: 16 }}>{t.name}</Tag>}
                  description={<Text type="secondary">{counts[t.id] ?? 0} 个媒体</Text>}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="编辑标签"
        open={!!editing}
        onOk={handleUpdate}
        onCancel={() => setEditing(null)}
      >
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={handleUpdate} />
      </Modal>
    </div>
  )
}
