import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Spin, Empty, Typography, Button, Space, Modal,
  Input, message, Tooltip, Image, Tag,
} from 'antd'
import {
  ArrowLeftOutlined, EditOutlined, EyeOutlined,
  DeleteOutlined, UploadOutlined, LeftOutlined, RightOutlined,
  SoundOutlined, LoadingOutlined, TagsOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { noteApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { markdownToPlainText } from '@/utils'
import TagManagerModal from '@/components/TagManagerModal'
import type { StudyNote } from '@/types'

const { Text } = Typography
const { TextArea } = Input

// VoiceCraft TTS 端点（免费公开服务，兼容 OpenAI TTS 格式）
const TTS_ENDPOINT = 'https://tts.wangwangit.com/v1/audio/speech'
// 默认音色/语速兜底值（settings 未加载时使用，与后端默认值一致）
const FALLBACK_TTS_VOICE = 'en-US-JennyNeural'
const FALLBACK_TTS_SPEED = 1.0

/**
 * 学习页面编辑器（独立路由页 /notes/:id）。
 * 从 StudyNotes 列表页或专辑混排卡片点击进入，通过 URL id 加载笔记内容。
 * 返回按钮使用 navigate(-1)，无历史栈时兜底回首页。
 */
export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token) ?? ''
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<StudyNote | null>(null)

  // 加载/刷新笔记数据：标签修改后调用此函数刷新当前页面的标签显示
  const loadNote = () => {
    if (!id) return
    setLoading(true)
    noteApi
      .get(Number(id))
      .then((res) => setNote(res.data.data))
      .catch(() => {
        message.error('加载失败')
        setNote(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadNote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 返回上一页；无历史栈（直接 URL 访问）兜底回首页
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  // 删除笔记后返回上一页
  const handleDelete = () => {
    if (!note) return
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
          handleBack()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  if (!note) {
    return <Empty description="笔记不存在或已被删除" />
  }

  return (
    <NoteEditor
      note={note}
      token={token}
      onBack={handleBack}
      onDelete={handleDelete}
      onReload={loadNote}
    />
  )
}

interface NoteEditorProps {
  note: StudyNote
  token: string
  onBack: () => void
  onDelete: () => void
  /** 重新加载笔记数据（标签修改后调用） */
  onReload: () => void
}

function NoteEditor({ note, token, onBack, onDelete, onReload }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [images, setImages] = useState<string[]>(note.images)
  const [editing, setEditing] = useState(false) // false=预览渲染, true=编辑原文
  const [saving, setSaving] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)
  // 标签管理弹窗（v0.5.0 起）
  const [tagOpen, setTagOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 从全局设置读取 TTS 默认音色与语速
  const ttsVoice = useSettingsStore((s) => s.tts_voice) || FALLBACK_TTS_VOICE
  const ttsSpeed = useSettingsStore((s) => s.tts_speed) || FALLBACK_TTS_SPEED

  // 标题/内容修改后保存
  const save = async (data: { title?: string; content?: string }) => {
    setSaving(true)
    try {
      const res = await noteApi.update(note.id, data)
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

  // TTS 朗读：调用 VoiceCraft API，播放返回的音频。
  // 朗读前将 Markdown 转为纯文本，避免念出 # - > ** 等符号。
  const handleTTS = async () => {
    const text = markdownToPlainText(content).trim()
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
          voice: ttsVoice,
          speed: ttsSpeed,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <Space wrap>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} title="返回" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== note.title) save({ title }) }}
            style={{ fontSize: 18, fontWeight: 600, width: 400 }}
          />
          {/* 标签展示（v0.5.0 起）：直接显示当前笔记的所有标签，紧贴标题便于一眼查看 */}
          {(note.tags?.length ?? 0) > 0 && (
            <Space size={4} wrap>
              {note.tags!.map((t) => (
                <Tag key={t.id} color="purple" style={{ borderRadius: 8, margin: 0 }}>{t.name}</Tag>
              ))}
            </Space>
          )}
        </Space>
        <Space>
          <Button icon={<TagsOutlined />} onClick={() => setTagOpen(true)}>标签</Button>
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
            <Tooltip title="使用 TTS 朗读内容（自动去除 Markdown 符号）">
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

      {/* 标签管理弹窗（v0.5.0 起）：学习页标签通过 StudyNote.ID 关联 */}
      <TagManagerModal
        open={tagOpen}
        entityType="note"
        entityId={note.id}
        currentTagIds={(note.tags ?? []).map((t) => t.id)}
        onClose={() => setTagOpen(false)}
        onSaved={onReload}
      />
    </div>
  )
}
