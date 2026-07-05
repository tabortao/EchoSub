import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Spin, Empty, Typography, Button, Space, Modal,
  Input, message, Image, Tag, Dropdown,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined, UploadOutlined, LeftOutlined, RightOutlined,
  TagsOutlined, MoreOutlined,
} from '@ant-design/icons'
import { noteApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import MarkdownEditor from '@/components/MarkdownEditor'
import TagManagerModal from '@/components/TagManagerModal'
import type { StudyNote } from '@/types'

const { Text } = Typography

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
  const { isPhone } = useDeviceSize()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [images, setImages] = useState<string[]>(note.images)
  const [imgIndex, setImgIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  // 标签管理弹窗（v0.5.0 起）
  const [tagOpen, setTagOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 标题/内容修改后保存
  const save = async (data: { title?: string; content?: string }) => {
    try {
      const res = await noteApi.update(note.id, data)
      if (data.title !== undefined) setTitle(res.data.data.title)
      if (data.content !== undefined) setContent(res.data.data.content)
    } catch {
      message.error('保存失败')
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

  const hasImages = images.length > 0
  const currentImg = hasImages ? images[imgIndex] : null

  // 顶部操作菜单：手机端合并到「⋯」下拉，桌面端平铺
  const moreMenu: MenuProps['items'] = isPhone ? [
    { key: 'tag', icon: <TagsOutlined />, label: '管理标签', onClick: () => setTagOpen(true) },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: <span style={{ color: '#ff4d4f' }}>删除笔记</span>, onClick: onDelete },
  ] : []

  // 按钮尺寸：手机端 large，桌面 middle
  const btnSize = isPhone ? 'large' : 'middle'

  return (
    <div>
      {/* 顶部：返回 + 标题 + 操作 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <Space wrap style={{ flex: 1, minWidth: 0 }}>
          <Button
            type="text"
            size={btnSize}
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            title="返回"
            style={{ minWidth: 44, minHeight: 44 }}
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== note.title) save({ title }) }}
            style={{
              fontSize: isPhone ? 16 : 20,
              fontWeight: 800,
              color: 'var(--ac-text-header, #794f27)',
              width: isPhone ? '100%' : 400,
              maxWidth: isPhone ? '100%' : 400,
              minWidth: 0,
              flex: 1,
              borderRadius: 12,
            }}
          />
          {/* 标签展示（v0.5.0 起）：直接显示当前笔记的所有标签，紧贴标题便于一眼查看 */}
          {(note.tags?.length ?? 0) > 0 && (
            <Space size={4} wrap>
              {note.tags!.map((t) => (
                <Tag key={t.id} color="purple" style={{ borderRadius: 10, margin: 0, fontWeight: 600 }}>{t.name}</Tag>
              ))}
            </Space>
          )}
        </Space>
        {/* 桌面端平铺操作；手机端合并为下拉菜单 */}
        {isPhone ? (
          <Dropdown menu={{ items: moreMenu }} trigger={['click']} placement="bottomRight">
            <Button
              size={btnSize}
              icon={<MoreOutlined />}
              style={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}
            />
          </Dropdown>
        ) : (
          <Space>
            <Button
              size={btnSize}
              icon={<TagsOutlined />}
              onClick={() => setTagOpen(true)}
              style={{ minHeight: 40 }}
            >
              标签
            </Button>
            <Button
              size={btnSize}
              icon={<DeleteOutlined />}
              danger
              onClick={onDelete}
              style={{ minHeight: 40 }}
            >
              删除
            </Button>
          </Space>
        )}
      </div>

      {/* 内容区：复用 MarkdownEditor（v0.6.0 工具栏按钮 large + 触控 44px） */}
      <div style={{ marginBottom: 16 }}>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          onBlurSave={(next) => save({ content: next })}
        />
      </div>

      {/* 图片画廊 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <Text strong>图片（{images.length}）</Text>
          <Space wrap>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { handleUpload(e.target.files); e.target.value = '' }}
            />
            <Button
              size={btnSize}
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
              style={{ minHeight: 44 }}
            >
              上传图片
            </Button>
          </Space>
        </div>

        {hasImages ? (
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--ac-bg-content, rgb(247, 243, 223))', borderRadius: 16, overflow: 'hidden', minHeight: 200, border: '3px solid rgba(25, 200, 185, 0.2)' }}>
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
                  size={isPhone ? 'large' : 'middle'}
                  icon={<LeftOutlined />}
                  onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}
                  style={{ position: 'absolute', left: isPhone ? 8 : 12, minWidth: 44, minHeight: 44, background: 'rgba(255,255,255,0.92)' }}
                />
                <Button
                  shape="circle"
                  size={isPhone ? 'large' : 'middle'}
                  icon={<RightOutlined />}
                  onClick={() => setImgIndex((i) => (i + 1) % images.length)}
                  style={{ position: 'absolute', right: isPhone ? 8 : 12, minWidth: 44, minHeight: 44, background: 'rgba(255,255,255,0.92)' }}
                />
              </>
            )}
          </div>
        ) : (
          <div style={{ padding: isPhone ? 24 : 40, textAlign: 'center', border: '2px dashed rgba(25, 200, 185, 0.35)', borderRadius: 16, color: 'var(--ac-text-secondary, #9f927d)', background: 'var(--ac-bg-page, #f8f8f0)' }}>
            暂无图片，点击"上传图片"添加
          </div>
        )}

        {/* 缩略图列表：手机端可横向滚动 */}
        {hasImages && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              flexWrap: 'nowrap',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 4,
            }}
          >
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
                  flexShrink: 0,
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
                  style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', minWidth: 28, minHeight: 28 }}
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
