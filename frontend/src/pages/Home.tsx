import { useEffect, useState } from 'react'
import { Card, Row, Col, Input, Select, Empty, Spin, Tag, Typography, Tooltip, Button, Space, Modal, Dropdown, message } from 'antd'
import type { MenuProps } from 'antd'
import { PlayCircleOutlined, SearchOutlined, CloseCircleOutlined, PlusOutlined, ReadOutlined, EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { mediaApi, noteApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import MediaCover from '@/components/MediaCover'
import type { MediaListResponse, MediaListItem, Album, StudyNote } from '@/types'

const { Text, Title } = Typography

// 首页/专辑详情页混排数据项：媒体或学习页面，统一按时间戳排序
type FeedItem =
  | { kind: 'media'; item: MediaListItem; ts: string }
  | { kind: 'note'; note: StudyNote; ts: string }

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = useAuthStore((s) => s.token) ?? ''
  const [loading, setLoading] = useState(true)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [recentNotes, setRecentNotes] = useState<StudyNote[]>([])
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState<string | undefined>(undefined)
  const [sort, setSort] = useState('file_modified_at')
  const [albums, setAlbums] = useState<Album[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [renameMedia, setRenameMedia] = useState<MediaListItem | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const albumFilter = searchParams.get('album') ?? undefined
  const subAlbumFilter = searchParams.get('sub_album') ?? undefined
  const tagFilter = searchParams.get('tag_id') ?? undefined

  const currentAlbum = albums.find((a) => a.album === albumFilter)
  const subAlbums = currentAlbum?.sub_albums ?? []

  const load = async () => {
    setLoading(true)
    try {
      const mediaRes = await mediaApi.list({
        keyword, type, sort, order: 'desc', page: 1, size: 100,
        album: albumFilter, sub_album: subAlbumFilter, tag_id: tagFilter,
      })
      const mediaList = (mediaRes.data.data as MediaListResponse).list ?? []
      const mediaItems: FeedItem[] = mediaList.map((item) => ({
        kind: 'media' as const, item, ts: item.media.file_modified_at,
      }))
      if (albumFilter) {
        const noteRes = await noteApi.list(albumFilter)
        const notes = noteRes.data.data.notes ?? []
        const noteItems: FeedItem[] = notes.map((n) => ({
          kind: 'note' as const, note: n, ts: n.updated_at,
        }))
        const merged = [...mediaItems, ...noteItems].sort((a, b) => b.ts.localeCompare(a.ts))
        setFeed(merged)
      } else {
        setFeed(mediaItems)
      }
    } catch {
      setFeed([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    mediaApi.albums().then((res) => setAlbums(res.data.data.albums ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (albumFilter) { setRecentNotes([]); return }
    noteApi.list().then((res) => setRecentNotes((res.data.data.notes ?? []).slice(0, 6))).catch(() => {})
  }, [albumFilter, location.key])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, type, sort, albumFilter, subAlbumFilter, tagFilter, location.key])

  const clearFilter = () => setSearchParams({})

  const handleCreateNote = async () => {
    if (!albumFilter) return
    if (!newTitle.trim()) { message.warning('请填写标题'); return }
    try {
      const res = await noteApi.create(albumFilter, newTitle.trim())
      message.success('已创建')
      setCreateOpen(false)
      setNewTitle('')
      navigate(`/notes/${res.data.data.id}`)
    } catch { message.error('创建失败') }
  }

  const openRenameMedia = (item: MediaListItem) => {
    const name = item.media.name
    const dotIdx = name.lastIndexOf('.')
    setRenameValue(dotIdx > 0 ? name.slice(0, dotIdx) : name)
    setRenameMedia(item)
  }
  const handleRenameMedia = async () => {
    if (!renameMedia) return
    const newName = renameValue.trim()
    if (!newName) { message.warning('名称不能为空'); return }
    try {
      await mediaApi.rename(renameMedia.media.id, newName)
      message.success('重命名成功')
      setRenameMedia(null)
      await load()
    } catch (err) { message.error('重命名失败：' + (err as Error).message) }
  }

  const handleDeleteMedia = (item: MediaListItem) => {
    Modal.confirm({
      title: '🗑️ 删除媒体文件',
      content: `确定删除「${item.media.name}」吗？该文件及同名的字幕/封面将被永久删除，无法恢复。`,
      okText: '永久删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try {
          await mediaApi.remove(item.media.id)
          message.success('已删除')
          await load()
        } catch (err) { message.error('删除失败：' + (err as Error).message) }
      },
    })
  }

  // ⋯ 菜单：重命名 + 删除（收进下拉菜单避免误触）
  const buildMediaMenu = (): MenuProps['items'] => [
    { key: 'rename', label: '✏️ 重命名', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '🗑️ 删除', icon: <DeleteOutlined />, danger: true },
  ]
  const onMediaMenuClick = (item: MediaListItem, key: string) => {
    if (key === 'rename') openRenameMedia(item)
    else if (key === 'delete') handleDeleteMedia(item)
  }

  const showRecent = !albumFilter && !subAlbumFilter && !tagFilter && recentNotes.length > 0

  return (
    <div>
      {/* 筛选栏 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12} lg={10} xl={8}>
          <Input
            prefix={<SearchOutlined style={{ color: '#FF7A45' }} />}
            placeholder="搜索媒体名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            size="large"
          />
        </Col>
        <Col xs={12} md={4} lg={3}>
          <Select
            placeholder="类型" allowClear style={{ width: '100%' }}
            value={type} onChange={(v) => setType(v)} size="large"
            options={[{ value: 'video', label: '🎬 视频' }, { value: 'audio', label: '🎵 音频' }]}
          />
        </Col>
        {albumFilter && subAlbums.length > 0 && (
          <Col xs={12} md={4} lg={3}>
            <Select
              placeholder="子专辑" allowClear style={{ width: '100%' }}
              value={subAlbumFilter} size="large"
              onChange={(v) => {
                const next = new URLSearchParams(searchParams)
                if (v) next.set('sub_album', v); else next.delete('sub_album')
                setSearchParams(next)
              }}
              options={subAlbums.map((s) => ({ value: s.sub_album, label: `${s.sub_album} (${s.count})` }))}
            />
          </Col>
        )}
        <Col xs={12} md={4} lg={3}>
          <Select
            style={{ width: '100%' }} size="large"
            value={sort} onChange={(v) => setSort(v)}
            options={[
              { value: 'file_modified_at', label: '📅 存入时间' },
              { value: 'name', label: '🔤 名称' },
              { value: 'duration', label: '⏱️ 时长' },
            ]}
          />
        </Col>
        {albumFilter && (
          <Col xs={24} md={6} lg={4}>
            <Button type="primary" icon={<PlusOutlined />} block size="large" onClick={() => setCreateOpen(true)}>
              新建学习页面
            </Button>
          </Col>
        )}
      </Row>

      {/* 当前筛选 */}
      {(albumFilter || subAlbumFilter || tagFilter) && (
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <span style={{ color: '#8c8c8c' }}>当前筛选：</span>
            {albumFilter && <Tag color="orange" closable onClose={clearFilter} style={{ borderRadius: 8 }}>📂 {albumFilter}</Tag>}
            {subAlbumFilter && <Tag color="cyan" closable onClose={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('sub_album')
              setSearchParams(next)
            }} style={{ borderRadius: 8 }}>📁 {subAlbumFilter}</Tag>}
            {tagFilter && <Tag color="purple" closable onClose={clearFilter} style={{ borderRadius: 8 }}>🏷️ 标签筛选</Tag>}
            <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={clearFilter}>清除</Button>
          </Space>
        </div>
      )}

      {/* 最近学习页面区块 */}
      {showRecent && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>📝 最近学习页面</Title>
            <Button type="link" onClick={() => navigate('/notes')} style={{ color: '#FF7A45' }}>查看全部 →</Button>
          </div>
          <Row gutter={[16, 16]}>
            {recentNotes.map((n) => (
              <Col xs={24} sm={12} md={8} lg={6} xl={6} xxl={4} key={`rn-${n.id}`}>
                <NoteCard note={n} token={token} onClick={() => navigate(`/notes/${n.id}`)} />
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* 内容网格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : feed.length === 0 ? (
        <Empty description="🎁 暂无内容，把文件放入媒体目录或创建学习页面吧~" />
      ) : (
        <Row gutter={[16, 16]}>
          {feed.map((f) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} xxl={4} key={f.kind === 'media' ? `m-${f.item.media.id}` : `n-${f.note.id}`}>
              {f.kind === 'media' ? (
                <Card
                  hoverable
                  onClick={() => navigate(`/play/${f.item.media.id}`)}
                  cover={
                    <div style={{ position: 'relative' }}>
                      <MediaCover media={f.item.media} />
                      <Tag
                        color={f.item.media.type === 'video' ? 'magenta' : 'green'}
                        style={{ position: 'absolute', top: 8, left: 8, margin: 0, background: 'rgba(255,255,255,0.9)', fontWeight: 600, borderRadius: 8 }}
                      >
                        {f.item.media.type === 'video' ? '🎬 视频' : '🎵 音频'}
                      </Tag>
                      {f.item.media.album && (
                        <Tag color="blue" style={{ position: 'absolute', top: 8, right: 8, margin: 0, maxWidth: '60%', background: 'rgba(255,255,255,0.9)', fontWeight: 600, borderRadius: 8 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 80, verticalAlign: 'middle' }}>
                            {f.item.media.sub_album || f.item.media.album}
                          </span>
                        </Tag>
                      )}
                      <PlayCircleOutlined style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 44, color: 'rgba(255,122,69,0.85)', pointerEvents: 'none',
                      }} />
                    </div>
                  }
                >
                  <Card.Meta
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Tooltip title={f.item.media.name}>
                          <Text ellipsis style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{f.item.media.name}</Text>
                        </Tooltip>
                        <Dropdown
                          menu={{ items: buildMediaMenu(), onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); onMediaMenuClick(f.item, key) } }}
                          trigger={['click']}
                          placement="bottomRight"
                        >
                          <button type="button" onClick={(e) => e.stopPropagation()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, borderRadius: 8, fontSize: 18, color: '#999', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="更多操作">
                            <MoreOutlined />
                          </button>
                        </Dropdown>
                      </div>
                    }
                    description={
                      <div>
                        {f.item.media.tags && f.item.media.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {f.item.media.tags.map((t) => (
                              <Tag key={t.id} color="purple" style={{ marginRight: 0, borderRadius: 8 }}>{t.name}</Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    }
                  />
                </Card>
              ) : (
                <NoteCard note={f.note} token={token} onClick={() => navigate(`/notes/${f.note.id}`)} />
              )}
            </Col>
          ))}
        </Row>
      )}

      {/* 新建学习页面 Modal */}
      <Modal title="📝 新建学习页面" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreateNote} okText="创建" cancelText="取消">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input placeholder="标题" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onPressEnter={handleCreateNote} size="large" autoFocus />
          {albumFilter && <Tag color="orange" style={{ borderRadius: 8 }}>📂 专辑: {albumFilter}</Tag>}
        </Space>
      </Modal>

      {/* 重命名媒体 Modal */}
      <Modal title="✏️ 重命名媒体" open={!!renameMedia} onCancel={() => setRenameMedia(null)} onOk={handleRenameMedia} okText="确定" cancelText="取消">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={handleRenameMedia} autoFocus size="large" placeholder="输入新名称（不含扩展名）" />
          {renameMedia && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前文件：{renameMedia.media.name}<br />
              扩展名 {renameMedia.media.name.slice(renameMedia.media.name.lastIndexOf('.'))} 将保留，同目录同名字幕/封面文件会同步重命名。
            </Text>
          )}
        </Space>
      </Modal>
    </div>
  )
}

// 学习页面卡片（混排 + 最近区块共用）
function NoteCard({ note, token, onClick }: { note: StudyNote; token: string; onClick: () => void }) {
  const hasImg = note.images && note.images.length > 0
  return (
    <Card
      hoverable
      onClick={onClick}
      cover={
        <div style={{ position: 'relative', height: 140 }}>
          {hasImg ? (
            <img
              src={noteApi.imageUrl(note.id, note.images[0], token)}
              alt={note.title}
              style={{ width: '100%', height: 140, objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div style={{
              height: 140,
              background: 'linear-gradient(135deg, #fff7e6, #ffe7ba)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ReadOutlined style={{ fontSize: 48, color: '#FAAD14' }} />
            </div>
          )}
          <Tag color="gold" style={{ position: 'absolute', top: 8, left: 8, margin: 0, fontWeight: 600, borderRadius: 8 }}>📖 学习页</Tag>
          <Tag color="blue" style={{ position: 'absolute', top: 8, right: 8, margin: 0, maxWidth: '60%', background: 'rgba(255,255,255,0.9)', fontWeight: 600, borderRadius: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 80, verticalAlign: 'middle' }}>
              {note.album}
            </span>
          </Tag>
        </div>
      }
    >
      <Card.Meta
        title={
          <Tooltip title={note.title}>
            <Text ellipsis style={{ maxWidth: '100%', fontWeight: 600 }}>{note.title}</Text>
          </Tooltip>
        }
      />
    </Card>
  )
}
