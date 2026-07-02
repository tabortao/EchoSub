import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Row, Col, Card, Spin, Empty, Typography, Tag, Button, Space, Modal,
  Input, Select, message, Tooltip, Image,
} from 'antd'
import {
  PlusOutlined, ArrowLeftOutlined, EditOutlined, EyeOutlined,
  DeleteOutlined, UploadOutlined, LeftOutlined, RightOutlined,
  SoundOutlined, LoadingOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { noteApi, mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import type { StudyNote, Album } from '@/types'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// VoiceCraft TTS 端点（免费公开服务，兼容 OpenAI TTS 格式）
const TTS_ENDPOINT = 'https://tts.wangwangit.com/v1/audio/speech'
// 英语学习场景默认英文女声
const TTS_VOICE = 'en-US-JennyNeural'

export default function StudyNotes() {
  const token = useAuthStore((s) => s.token)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [albumFilter, setAlbumFilter] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<StudyNote | null>(null)
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
      await load()
      setSelected(res.data.data)
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
          if (selected?.id === note.id) setSelected(null)
          await load()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  if (selected) {
    return (
      <NoteEditor
        note={selected}
        token={token ?? ''}
        onBack={() => { setSelected(null); load() }}
        onDelete={() => handleDelete(selected)}
      />
    )
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
        <Empty description="暂无学习页面，点击右上角创建" />
      ) : (
        <Row gutter={[16, 16]}>
          {notes.map((n) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3} key={n.id}>
              <Card
                hoverable
                onClick={() => setSelected(n)}
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

// ===== 学习页面编辑器 =====
interface NoteEditorProps {
  note: StudyNote
  token: string
  onBack: () => void
  onDelete: () => void
}

function NoteEditor({ note, token, onBack, onDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [images, setImages] = useState<string[]>(note.images)
  const [editing, setEditing] = useState(false) // false=预览渲染, true=编辑原文
  const [saving, setSaving] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 标题/内容修改后保存
  const save = async (data: { title?: string; content?: string }) => {
    setSaving(true)
    try {
      const res = await noteApi.update(note.id, data)
      // 更新本地状态（不影响父组件列表，返回时刷新）
      if (data.title !== undefined) setTitle(res.data.data.title)
      if (data.content !== undefined) setContent(res.data.data.content)
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 上传图片
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      const res = await noteApi.uploadImages(note.id, Array.from(files))
      setImages(res.data.data.images)
      message.success('上传成功')
    } catch {
      message.error('上传失败')
    }
  }

  // 删除图片
  const handleDeleteImage = async (filename: string) => {
    try {
      const res = await noteApi.deleteImage(note.id, filename)
      setImages(res.data.data.images)
      setImgIndex((i) => Math.max(0, Math.min(i, res.data.data.images.length - 1)))
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }

  // TTS 朗读：调用 VoiceCraft API，播放返回的音频
  const handleTTS = async () => {
    const text = content.trim()
    if (!text) {
      message.warning('内容为空')
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setTtsLoading(true)
    try {
      const resp = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice: TTS_VOICE,
          speed: 1.0,
          pitch: '0',
          style: 'general',
        }),
      })
      if (!resp.ok) throw new Error(`TTS 请求失败: ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      await audio.play()
    } catch (err) {
      message.error('朗读失败：' + (err as Error).message)
    } finally {
      setTtsLoading(false)
    }
  }

  const hasImages = images.length > 0
  const currentImg = hasImages ? images[imgIndex] : null

  return (
    <div>
      {/* 顶部：返回 + 标题 + 操作 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} title="返回" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== note.title) save({ title }) }}
            style={{ fontSize: 18, fontWeight: 600, width: 400 }}
          />
        </Space>
        <Space>
          <Button icon={<DeleteOutlined />} danger onClick={onDelete}>删除</Button>
        </Space>
      </div>

      {/* 内容区：markdown 预览/编辑 + TTS */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <Button
              type={editing ? 'default' : 'primary'}
              icon={editing ? <EditOutlined /> : <EyeOutlined />}
              onClick={() => setEditing(!editing)}
            >
              {editing ? '编辑原文' : '预览渲染'}
            </Button>
            <Tooltip title="使用 TTS 朗读内容">
              <Button
                icon={ttsLoading ? <LoadingOutlined /> : <SoundOutlined />}
                onClick={handleTTS}
                loading={ttsLoading}
              >
                朗读
              </Button>
            </Tooltip>
          </Space>
          {saving && <Text type="secondary">保存中...</Text>}
        </div>
        {editing ? (
          <TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => { if (content !== note.content) save({ content }) }}
            autoSize={{ minRows: 8, maxRows: 24 }}
            placeholder="支持 Markdown 语法输入学习内容..."
            style={{ fontFamily: 'monospace' }}
          />
        ) : (
          <div
            style={{
              padding: 16,
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              minHeight: 120,
              background: '#fafafa',
            }}
          >
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <Text type="secondary">暂无内容，点击"编辑原文"输入</Text>
            )}
          </div>
        )}
      </div>

      {/* 图片画廊 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>图片（{images.length}）</Text>
          <Space>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { handleUpload(e.target.files); e.target.value = '' }}
            />
            <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>上传图片</Button>
          </Space>
        </div>

        {hasImages ? (
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', borderRadius: 8, overflow: 'hidden', minHeight: 200 }}>
            <Image
              src={noteApi.imageUrl(note.id, currentImg!, token)}
              alt={currentImg!}
              style={{ maxHeight: 420, maxWidth: '100%', objectFit: 'contain' }}
              preview={{ visible: fullscreen, onVisibleChange: setFullscreen }}
            />
            {images.length > 1 && (
              <>
                <Button
                  shape="circle"
                  icon={<LeftOutlined />}
                  onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}
                  style={{ position: 'absolute', left: 12 }}
                />
                <Button
                  shape="circle"
                  icon={<RightOutlined />}
                  onClick={() => setImgIndex((i) => (i + 1) % images.length)}
                  style={{ position: 'absolute', right: 12 }}
                />
              </>
            )}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', border: '1px dashed #d9d9d9', borderRadius: 8, color: '#999' }}>
            暂无图片，点击"上传图片"添加
          </div>
        )}

        {/* 缩略图列表 */}
        {hasImages && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {images.map((img, i) => (
              <div
                key={img}
                style={{
                  position: 'relative',
                  width: 80,
                  height: 80,
                  border: i === imgIndex ? '2px solid #1677ff' : '2px solid transparent',
                  borderRadius: 4,
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
                onClick={() => setImgIndex(i)}
              >
                <Image
                  src={noteApi.imageUrl(note.id, img, token)}
                  alt={img}
                  width={80}
                  height={80}
                  style={{ objectFit: 'cover' }}
                  preview={false}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(img) }}
                  style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
