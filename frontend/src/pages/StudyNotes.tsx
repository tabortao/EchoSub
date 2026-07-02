import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Spin, Empty, Typography, Tag, Button, Space, Modal,
  Input, Select, message,
} from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { noteApi, mediaApi } from '@/api'
import type { StudyNote, Album } from '@/types'

const { Title, Text, Paragraph } = Typography

export default function StudyNotes() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [albumFilter, setAlbumFilter] = useState<string | undefined>(undefined)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAlbum, setNewAlbum] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await noteApi.list(albumFilter)
      setNotes(res.data.data.notes ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [albumFilter])

  useEffect(() => {
    mediaApi.albums().then((res) => setAlbums(res.data.data.albums ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 新建学习页面
  const handleCreate = async () => {
    if (!newTitle.trim() || !newAlbum.trim()) {
      message.warning('请填写标题并选择专辑')
      return
    }
    try {
      const res = await noteApi.create(newAlbum.trim(), newTitle.trim())
      message.success('已创建')
      setCreateOpen(false)
      setNewTitle('')
      setNewAlbum('')
      // 直接进入编辑器
      navigate(`/notes/${res.data.data.id}`)
    } catch {
      message.error('创建失败')
    }
  }

  // 删除学习页面
  const handleDelete = (note: StudyNote) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除"${note.title}"吗？关联图片将一并删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await noteApi.delete(note.id)
          message.success('已删除')
          await load()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>学习页面</Title>
        <Space wrap>
          <Select
            placeholder="按专辑筛选"
            allowClear
            style={{ width: 180 }}
            value={albumFilter}
            onChange={(v) => setAlbumFilter(v)}
            options={albums.map((a) => ({ value: a.album, label: a.album }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建学习页面</Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : notes.length === 0 ? (
        <Empty description="暂无学习页面，可在专辑详情页或此处创建" />
      ) : (
        <Row gutter={[16, 16]}>
          {notes.map((n) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} xxl={4} key={n.id}>
              <Card
                hoverable
                onClick={() => navigate(`/notes/${n.id}`)}
                actions={[
                  <DeleteOutlined key="del" onClick={(e) => { e.stopPropagation(); handleDelete(n) }} />,
                ]}
              >
                <Card.Meta
                  title={<Text ellipsis style={{ maxWidth: '100%' }}>{n.title}</Text>}
                  description={
                    <div>
                      <Tag color="blue">{n.album}</Tag>
                      {n.images.length > 0 && <Tag color="purple">{n.images.length} 张图</Tag>}
                      {n.content && (
                        <Paragraph
                          ellipsis={{ rows: 2 }}
                          style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#666' }}
                        >
                          {n.content}
                        </Paragraph>
                      )}
                    </div>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="新建学习页面"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="标题"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Select
            placeholder="选择专辑"
            style={{ width: '100%' }}
            value={newAlbum || undefined}
            onChange={(v) => setNewAlbum(v)}
            options={albums.map((a) => ({ value: a.album, label: a.album }))}
          />
        </Space>
      </Modal>
    </div>
  )
}
