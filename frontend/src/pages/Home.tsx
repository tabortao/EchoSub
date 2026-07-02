import { useEffect, useState } from 'react'
import { Card, Row, Col, Input, Select, Empty, Spin, Tag, Typography, Tooltip, Button, Space, Modal, message } from 'antd'
import { PlayCircleOutlined, SearchOutlined, CloseCircleOutlined, PlusOutlined, ReadOutlined } from '@ant-design/icons'
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

  const albumFilter = searchParams.get('album') ?? undefined
  const subAlbumFilter = searchParams.get('sub_album') ?? undefined
  const tagFilter = searchParams.get('tag_id') ?? undefined

  // 当前选中专辑的子专辑列表
  const currentAlbum = albums.find((a) => a.album === albumFilter)
  const subAlbums = currentAlbum?.sub_albums ?? []

  const load = async () => {
    setLoading(true)
    try {
      const mediaRes = await mediaApi.list({
        keyword,
        type,
        sort,
        order: 'desc',
        page: 1,
        size: 100,
        album: albumFilter,
        sub_album: subAlbumFilter,
        tag_id: tagFilter,
      })
      const mediaList = (mediaRes.data.data as MediaListResponse).list ?? []
      const mediaItems: FeedItem[] = mediaList.map((item) => ({
        kind: 'media' as const,
        item,
        ts: item.media.file_modified_at,
      }))
      // 专辑模式：并行拉取该专辑的学习页面，与媒体混排按时间排序
      if (albumFilter) {
        const noteRes = await noteApi.list(albumFilter)
        const notes = noteRes.data.data.notes ?? []
        const noteItems: FeedItem[] = notes.map((n) => ({
          kind: 'note' as const,
          note: n,
          ts: n.updated_at,
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

  // 加载专辑列表（含子专辑），用于子专辑筛选下拉
  useEffect(() => {
    mediaApi.albums().then((res) => setAlbums(res.data.data.albums ?? [])).catch(() => {})
  }, [])

  // 首页模式：额外加载最近学习页面（最多 6 个），与媒体 load 解耦
  useEffect(() => {
    if (albumFilter) {
      setRecentNotes([])
      return
    }
    noteApi
      .list()
      .then((res) => setRecentNotes((res.data.data.notes ?? []).slice(0, 6)))
      .catch(() => {})
  }, [albumFilter, location.key])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, type, sort, albumFilter, subAlbumFilter, tagFilter, location.key])

  const clearFilter = () => {
    setSearchParams({})
  }

  // 新建学习页面（专辑模式下，album 固定为当前 albumFilter）
  const handleCreateNote = async () => {
    if (!albumFilter) return
    if (!newTitle.trim()) {
      message.warning('请填写标题')
      return
    }
    try {
      const res = await noteApi.create(albumFilter, newTitle.trim())
      message.success('已创建')
      setCreateOpen(false)
      setNewTitle('')
      navigate(`/notes/${res.data.data.id}`)
    } catch {
      message.error('创建失败')
    }
  }

  const showRecent = !albumFilter && !subAlbumFilter && !tagFilter && recentNotes.length > 0

  return (
    <div>
      {/* 筛选栏 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12} lg={10} xl={8}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索媒体名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={12} md={4} lg={3}>
          <Select
            placeholder="类型"
            allowClear
            style={{ width: '100%' }}
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: 'video', label: '视频' },
              { value: 'audio', label: '音频' },
            ]}
          />
        </Col>
        {albumFilter && subAlbums.length > 0 && (
          <Col xs={12} md={4} lg={3}>
            <Select
              placeholder="子专辑"
              allowClear
              style={{ width: '100%' }}
              value={subAlbumFilter}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams)
                if (v) next.set('sub_album', v)
                else next.delete('sub_album')
                setSearchParams(next)
              }}
              options={subAlbums.map((s) => ({ value: s.sub_album, label: `${s.sub_album} (${s.count})` }))}
            />
          </Col>
        )}
        <Col xs={12} md={4} lg={3}>
          <Select
            style={{ width: '100%' }}
            value={sort}
            onChange={(v) => setSort(v)}
            options={[
              { value: 'file_modified_at', label: '存入时间' },
              { value: 'name', label: '名称' },
              { value: 'duration', label: '时长' },
            ]}
          />
        </Col>
        {albumFilter && (
          <Col xs={24} md={6} lg={4}>
            <Button type="primary" icon={<PlusOutlined />} block onClick={() => setCreateOpen(true)}>
              新建学习页面
            </Button>
          </Col>
        )}
      </Row>

      {/* 当前筛选 */}
      {(albumFilter || subAlbumFilter || tagFilter) && (
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <span style={{ color: '#666' }}>当前筛选：</span>
            {albumFilter && <Tag color="blue" closable onClose={clearFilter}>专辑: {albumFilter}</Tag>}
            {subAlbumFilter && <Tag color="cyan" closable onClose={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('sub_album')
              setSearchParams(next)
            }}>子专辑: {subAlbumFilter}</Tag>}
            {tagFilter && <Tag color="purple" closable onClose={clearFilter}>标签筛选</Tag>}
            <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={clearFilter}>清除</Button>
          </Space>
        </div>
      )}

      {/* 最近学习页面区块（仅首页、无筛选时） */}
      {showRecent && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>最近学习页面</Title>
            <Button type="link" onClick={() => navigate('/notes')}>查看全部</Button>
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
        <Empty description="暂无内容，请将文件放入媒体目录或创建学习页面" />
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
                        style={{ position: 'absolute', top: 8, left: 8, margin: 0 }}
                      >
                        {f.item.media.type === 'video' ? '视频' : '音频'}
                      </Tag>
                      <PlayCircleOutlined style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 40,
                        color: 'rgba(22,119,255,0.85)',
                        pointerEvents: 'none',
                      }} />
                    </div>
                  }
                >
                  <Card.Meta
                    title={
                      <Tooltip title={f.item.media.name}>
                        <Text ellipsis style={{ maxWidth: '100%' }}>{f.item.media.name}</Text>
                      </Tooltip>
                    }
                    description={
                      <div>
                        <div style={{ marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {f.item.media.album && <Tag color="blue" style={{ marginRight: 0 }}>{f.item.media.album}</Tag>}
                          {f.item.media.sub_album && <Tag color="cyan" style={{ marginRight: 0 }}>{f.item.media.sub_album}</Tag>}
                        </div>
                        {f.item.media.tags && f.item.media.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {f.item.media.tags.map((t) => (
                              <Tag key={t.id} color="purple" style={{ marginRight: 0 }}>{t.name}</Tag>
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
      <Modal
        title="新建学习页面"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreateNote}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="标题"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onPressEnter={handleCreateNote}
          />
          {albumFilter && <Tag color="blue">专辑: {albumFilter}</Tag>}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ReadOutlined style={{ fontSize: 48, color: '#fa8c16' }} />
            </div>
          )}
          <Tag color="gold" style={{ position: 'absolute', top: 8, left: 8, margin: 0 }}>学习页</Tag>
        </div>
      }
    >
      <Card.Meta
        title={
          <Tooltip title={note.title}>
            <Text ellipsis style={{ maxWidth: '100%' }}>{note.title}</Text>
          </Tooltip>
        }
        description={<Tag color="blue">{note.album}</Tag>}
      />
    </Card>
  )
}
