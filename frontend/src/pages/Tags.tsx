import { useEffect, useState, useCallback } from 'react'
import { Card, Row, Col, Tag, Input, Button, Empty, Spin, Modal, message, Typography, Space, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, FilterFilled, RollbackOutlined, FolderOutlined, PlayCircleOutlined, ReadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { tagApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { Tag as TagType, TagFilterResult, MediaFile, StudyNote, TagFilterAlbum } from '@/types'
import { formatDuration } from '@/utils'

const { Text, Title } = Typography

/**
 * Tags 标签管理页：
 * - 顶部：标签 CRUD（创建 / 重命名 / 删除）
 * - 中部：标签列表（每张卡显示该标签下三类实体的数量：专辑/季/文件）
 * - 下部：选中某个标签后展示三组结果（专辑 / 季 / 文件）。
 *
 * 「文件」组包含 media（媒体文件）+ note（学习页面），分别用 🎬/🎵 与 📝 图标区分。
 */
export default function Tags() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token) ?? ''
  const { isPhone } = useDeviceSize()
  const [tags, setTags] = useState<TagType[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<TagType | null>(null)
  const [editName, setEditName] = useState('')
  // 标签下各类实体的数量（仅显示在卡片上，点击后拉详情）
  const [counts, setCounts] = useState<Record<number, { albums: number; seasons: number; files: number }>>({})
  // 当前选中的标签 id（点击卡片后展开下方三组）
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [filterResult, setFilterResult] = useState<TagFilterResult | null>(null)
  const [filterLoading, setFilterLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await tagApi.list()
      const list = res.data.data.tags ?? []
      setTags(list)
      // 统计每个标签下 专辑/季/文件 数量
      for (const t of list) {
        try {
          const ent = await tagApi.entities(t.id)
          const r = ent.data.data ?? {}
          // 后端偶尔可能返回 null/缺失字段，统一兜底为空数组，避免 .length 崩溃
          const albums = r.albums ?? []
          const seasons = r.seasons ?? []
          const medias = r.medias ?? []
          const notes = r.notes ?? []
          setCounts((c) => ({
            ...c,
            [t.id]: {
              albums: albums.length,
              seasons: seasons.length,
              files: medias.length + notes.length,
            },
          }))
        } catch {
          setCounts((c) => ({ ...c, [t.id]: { albums: 0, seasons: 0, files: 0 } }))
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 选中标签后加载其下所有实体
  useEffect(() => {
    if (selectedTagId == null) {
      setFilterResult(null)
      return
    }
    setFilterLoading(true)
    tagApi.entities(selectedTagId)
      .then((res) => {
        // 兜底空字段，避免后端遗漏字段时前端 .length 崩溃
        const d = res.data.data ?? {}
        setFilterResult({
          tag: d.tag ?? null,
          albums: d.albums ?? [],
          seasons: d.seasons ?? [],
          medias: d.medias ?? [],
          notes: d.notes ?? [],
        })
      })
      .catch(() => setFilterResult(null))
      .finally(() => setFilterLoading(false))
  }, [selectedTagId])

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
      content: `将删除标签「${t.name}」（仅删除标签本身，已绑定的实体不会被删除）`,
      onOk: async () => {
        try {
          await tagApi.delete(t.id)
          message.success('已删除')
          if (selectedTagId === t.id) {
            setSelectedTagId(null)
          }
          load()
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  const onCardClick = (t: TagType) => {
    if (selectedTagId === t.id) {
      // 再次点击收起
      setSelectedTagId(null)
    } else {
      setSelectedTagId(t.id)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16, color: 'var(--ac-text-header, #794f27)', fontWeight: 800, letterSpacing: '0.02em' }}>🏷️ 标签管理</Title>
      <Card style={{ marginBottom: 16, background: 'var(--ac-bg-content, rgb(247, 243, 223))', borderRadius: 'var(--radius-lg)' }}>
        <Row gutter={8} align="middle">
          <Col flex="auto">
            <Input
              prefix={<PlusOutlined />}
              placeholder="新建标签"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleCreate}
              size="large"
            />
          </Col>
          <Col>
            <Button type="primary" onClick={handleCreate} size="large" style={{ minHeight: 40 }}>添加</Button>
          </Col>
        </Row>
      </Card>

      {tags.length === 0 ? (
        <Empty description="暂无标签" />
      ) : (
        <Row gutter={[12, 12]}>
          {tags.map((t) => {
            const c = counts[t.id] ?? { albums: 0, seasons: 0, files: 0 }
            const isSelected = selectedTagId === t.id
            return (
              <Col xs={12} sm={8} md={6} lg={4} key={t.id}>
                <Card
                  hoverable
                  onClick={() => onCardClick(t)}
                  style={isSelected ? {
                    borderColor: 'var(--ant-color-primary)',
                    boxShadow: `0 0 0 2px color-mix(in srgb, var(--ant-color-primary) 28%, transparent)`,
                    borderRadius: 'var(--radius-lg)',
                  } : { background: 'var(--ac-bg-content, rgb(247, 243, 223))', borderRadius: 'var(--radius-lg)' }}
                  styles={{ body: { padding: 12 } }}
                  actions={[
                    <span key="edit" onClick={(e) => { e.stopPropagation(); setEditing(t); setEditName(t.name) }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                      <EditOutlined />
                    </span>,
                    <span key="del" onClick={(e) => { e.stopPropagation(); handleDelete(t) }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }}>
                      <DeleteOutlined />
                    </span>,
                  ]}
                >
                  <Card.Meta
                    title={
                      <Space wrap>
                        <Tag color="blue" style={{ fontSize: isPhone ? 14 : 16, margin: 0, padding: '2px 10px', borderRadius: 12, fontWeight: 700, border: 'none' }}>{t.name}</Tag>
                        {isSelected && <FilterFilled style={{ color: 'var(--ant-color-primary)' }} />}
                      </Space>
                    }
                    description={
                      <Space size={4} wrap>
                        <Tooltip title="专辑数"><Tag color="orange" style={{ borderRadius: 10, margin: 0, fontWeight: 600 }}>📂 {c.albums}</Tag></Tooltip>
                        <Tooltip title="季数"><Tag color="cyan" style={{ borderRadius: 10, margin: 0, fontWeight: 600 }}>📁 {c.seasons}</Tag></Tooltip>
                        <Tooltip title="文件数（媒体 + 学习页）"><Tag color="green" style={{ borderRadius: 10, margin: 0, fontWeight: 600 }}>📄 {c.files}</Tag></Tooltip>
                      </Space>
                    }
                  />
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      {/* 标签筛选结果：按三组分类展示（v0.6.0 移动端单列，桌面 3 列） */}
      {selectedTagId != null && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Title level={5} style={{ margin: 0, color: 'var(--ac-text-header, #794f27)' }}>
              标签「{filterResult?.tag?.name ?? ''}」下的内容
            </Title>
            <Button size={isPhone ? 'middle' : 'small'} icon={<RollbackOutlined />} onClick={() => setSelectedTagId(null)} style={{ minHeight: isPhone ? 40 : 32 }}>
              收起
            </Button>
          </div>

          {filterLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : filterResult ? (
            <Row gutter={[12, 12]}>
              {/* 专辑组 */}
              <Col xs={24} md={12} lg={8}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <span>📂 专辑</span>
                      <Tag color="orange" style={{ borderRadius: 8 }}>{filterResult.albums.length}</Tag>
                    </Space>
                  }
                  styles={{ body: { maxHeight: 480, overflowY: 'auto' } }}
                >
                  {filterResult.albums.length === 0 ? (
                    <Text type="secondary">该标签下暂无专辑</Text>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={6}>
                      {filterResult.albums.map((a) => (
                        <AlbumEntryCard
                          key={`a-${a.meta_id}`}
                          entry={a}
                          token={token}
                          onClick={() => navigate(`/?album=${encodeURIComponent(a.album)}`)}
                          kind="album"
                        />
                      ))}
                    </Space>
                  )}
                </Card>
              </Col>

              {/* 季组 */}
              <Col xs={24} md={12} lg={8}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <span>📁 季</span>
                      <Tag color="cyan" style={{ borderRadius: 8 }}>{filterResult.seasons.length}</Tag>
                    </Space>
                  }
                  styles={{ body: { maxHeight: 480, overflowY: 'auto' } }}
                >
                  {filterResult.seasons.length === 0 ? (
                    <Text type="secondary">该标签下暂无季</Text>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={6}>
                      {filterResult.seasons.map((s) => (
                        <AlbumEntryCard
                          key={`s-${s.meta_id}`}
                          entry={s}
                          token={token}
                          onClick={() => navigate(`/?album=${encodeURIComponent(s.album)}&sub_album=${encodeURIComponent(s.sub_album)}`)}
                          kind="season"
                        />
                      ))}
                    </Space>
                  )}
                </Card>
              </Col>

              {/* 文件组：媒体 + 学习页 */}
              <Col xs={24} lg={8}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <span>📄 文件</span>
                      <Tag color="green" style={{ borderRadius: 8 }}>{filterResult.medias.length + filterResult.notes.length}</Tag>
                    </Space>
                  }
                  styles={{ body: { maxHeight: 480, overflowY: 'auto' } }}
                >
                  {filterResult.medias.length === 0 && filterResult.notes.length === 0 ? (
                    <Text type="secondary">该标签下暂无文件</Text>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={6}>
                      {filterResult.medias.map((m) => (
                        <MediaEntryRow key={`m-${m.id}`} media={m} onClick={() => navigate(`/play/${m.id}`)} />
                      ))}
                      {filterResult.notes.map((n) => (
                        <NoteEntryRow key={`n-${n.id}`} note={n} onClick={() => navigate(`/notes/${n.id}`)} />
                      ))}
                    </Space>
                  )}
                </Card>
              </Col>
            </Row>
          ) : null}
        </div>
      )}

      <Modal
        title="编辑标签"
        open={!!editing}
        onOk={handleUpdate}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
      >
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={handleUpdate} size="large" />
      </Modal>
    </div>
  )
}

// 专辑 / 季 行内卡片
function AlbumEntryCard({ entry, token, onClick, kind }: {
  entry: TagFilterAlbum; token: string; onClick: () => void; kind: 'album' | 'season'
}) {
  const coverUrl = entry.cover_path && token
    ? `/api/v1/albums/${encodeURIComponent(entry.album)}/cover?token=${encodeURIComponent(token)}${entry.sub_album ? `&sub=${encodeURIComponent(entry.sub_album)}` : ''}`
    : ''
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 10, borderRadius: 10, cursor: 'pointer',
        background: 'var(--color-bg-page, #fafafa)',
        border: '1px solid var(--color-border-soft, #f0f0f0)',
        transition: 'all 0.2s',
        minHeight: 64,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--ant-color-primary) 8%, transparent)'; e.currentTarget.style.borderColor = 'var(--ant-color-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-page, #fafafa)'; e.currentTarget.style.borderColor = 'var(--color-border-soft, #f0f0f0)' }}
    >
      <div style={{
        width: 48, height: 48, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {coverUrl ? (
          <img src={coverUrl} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <FolderOutlined style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22 }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text ellipsis style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #1a1a1a)' }}>
          {entry.name}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {kind === 'album' ? '📂 专辑' : '📁 季'}
        </Text>
      </div>
    </div>
  )
}

// 媒体行
function MediaEntryRow({ media, onClick }: { media: MediaFile; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 10, borderRadius: 10, cursor: 'pointer',
        background: 'var(--color-bg-page, #fafafa)',
        border: '1px solid var(--color-border-soft, #f0f0f0)',
        transition: 'all 0.2s',
        minHeight: 64,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--ant-color-primary) 8%, transparent)'; e.currentTarget.style.borderColor = 'var(--ant-color-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-page, #fafafa)'; e.currentTarget.style.borderColor = 'var(--color-border-soft, #f0f0f0)' }}
    >
      <PlayCircleOutlined style={{ fontSize: 20, color: media.type === 'video' ? '#eb2f96' : '#52c41a', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text ellipsis style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #1a1a1a)' }}>{media.name}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {media.type === 'video' ? '🎬 视频' : '🎵 音频'} · {media.album ?? '独立资源'} {media.sub_album ? ` / ${media.sub_album}` : ''} · {formatDuration(media.duration)}
        </Text>
      </div>
    </div>
  )
}

// 学习页行
function NoteEntryRow({ note, onClick }: { note: StudyNote; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 10, borderRadius: 10, cursor: 'pointer',
        background: 'var(--color-bg-page, #fafafa)',
        border: '1px solid var(--color-border-soft, #f0f0f0)',
        transition: 'all 0.2s',
        minHeight: 64,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--ant-color-primary) 8%, transparent)'; e.currentTarget.style.borderColor = 'var(--ant-color-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-page, #fafafa)'; e.currentTarget.style.borderColor = 'var(--color-border-soft, #f0f0f0)' }}
    >
      <ReadOutlined style={{ fontSize: 20, color: '#722ed1', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text ellipsis style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #1a1a1a)' }}>{note.title}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>📝 学习页 · {note.album}</Text>
      </div>
    </div>
  )
}
