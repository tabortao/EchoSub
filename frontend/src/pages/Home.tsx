import { useEffect, useState } from 'react'
import { Card, Row, Col, Input, Select, Empty, Spin, Tag, Typography, Tooltip, Button, Space, Modal, Dropdown, message, Tabs } from 'antd'
import type { MenuProps } from 'antd'
import { PlayCircleOutlined, SearchOutlined, CloseCircleOutlined, PlusOutlined, ReadOutlined, EditOutlined, DeleteOutlined, MoreOutlined, AppstoreOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { mediaApi, noteApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import MediaCover from '@/components/MediaCover'
import EmbyHome from '@/components/EmbyHome'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'
import type { MediaListResponse, MediaListItem, Album, StudyNote } from '@/types'

const { Text } = Typography

// 网格视图混排数据项：媒体或学习页面，统一按时间戳排序
type FeedItem =
  | { kind: 'media'; item: MediaListItem; ts: string }
  | { kind: 'note'; note: StudyNote; ts: string }

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = useAuthStore((s) => s.token) ?? ''

  // 筛选条件
  const albumFilter = searchParams.get('album') ?? undefined
  const subAlbumFilter = searchParams.get('sub_album') ?? undefined
  const tagFilter = searchParams.get('tag_id') ?? undefined
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState<string | undefined>(undefined)
  const [sort, setSort] = useState('name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')

  // 是否进入网格视图（任一筛选条件激活时）
  const hasFilter = !!(albumFilter || subAlbumFilter || tagFilter || keyword || type)

  return (
    <div>
      {/* 顶部工具栏：搜索 + 类型 + 排序（仅在有筛选时显示） */}
      {hasFilter && (
        <FilterBar
          keyword={keyword} setKeyword={setKeyword}
          type={type} setType={setType}
          sort={sort} setSort={setSort}
          albumFilter={albumFilter} subAlbumFilter={subAlbumFilter}
          tagFilter={tagFilter}
          searchParams={searchParams} setSearchParams={setSearchParams}
          onClear={() => { setSearchParams({}); setKeyword(''); setType(undefined) }}
        />
      )}

      {/* 视图切换：有筛选时显示网格，否则显示 emby 横向滚动布局 */}
      {hasFilter ? (
        <GridView
          keyword={keyword} type={type} sort={sort} order={order} setOrder={setOrder}
          albumFilter={albumFilter} subAlbumFilter={subAlbumFilter} tagFilter={tagFilter}
          locationKey={location.key}
          token={token}
          navigate={navigate}
          searchParams={searchParams} setSearchParams={setSearchParams}
        />
      ) : (
        <EmbyHome
          onPlayMedia={(id) => navigate(`/play/${id}`)}
          onOpenNote={(id) => navigate(`/notes/${id}`)}
          onOpenAlbum={(album) => setSearchParams({ album })}
        />
      )}
    </div>
  )
}

/**
 * 顶部筛选栏：搜索框、类型、排序、清除。
 * 子专辑筛选由 GridView 内部渲染（需要专辑数据）。
 */
function FilterBar(props: {
  keyword: string; setKeyword: (v: string) => void
  type: string | undefined; setType: (v: string | undefined) => void
  sort: string; setSort: (v: string) => void
  albumFilter?: string; subAlbumFilter?: string; tagFilter?: string
  searchParams: URLSearchParams; setSearchParams: (next: URLSearchParams) => void
  onClear: () => void
}) {
  const { keyword, setKeyword, type, setType, sort, setSort, albumFilter, subAlbumFilter, tagFilter,
    searchParams, setSearchParams, onClear } = props
  return (
    <div style={{ marginBottom: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12} lg={10} xl={8}>
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--ant-color-primary)' }} />}
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
        <Col xs={12} md={4} lg={3}>
          <Select
            style={{ width: '100%' }} size="large"
            value={sort} onChange={(v) => setSort(v)}
            options={[
              { value: 'name', label: '🔤 名称' },
              { value: 'file_modified_at', label: '📅 存入时间' },
              { value: 'duration', label: '⏱️ 时长' },
            ]}
          />
        </Col>
      </Row>
      {(albumFilter || subAlbumFilter || tagFilter) && (
        <Space wrap style={{ marginTop: 12 }}>
          <span style={{ color: '#8c8c8c' }}>当前筛选：</span>
          {albumFilter && <Tag color="orange" closable onClose={onClear} style={{ borderRadius: 8 }}>📂 {albumFilter}</Tag>}
          {subAlbumFilter && <Tag color="cyan" closable onClose={() => {
            const next = new URLSearchParams(searchParams); next.delete('sub_album'); setSearchParams(next)
          }} style={{ borderRadius: 8 }}>📁 {subAlbumFilter}</Tag>}
          {tagFilter && <Tag color="purple" closable onClose={onClear} style={{ borderRadius: 8 }}>🏷️ 标签筛选</Tag>}
          <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={onClear}>清除</Button>
        </Space>
      )}
    </div>
  )
}

/**
 * 网格视图：按筛选条件拉取媒体 + 学习页面，混排展示。
 */
function GridView(props: {
  keyword: string; type?: string; sort: string; order: 'asc' | 'desc'; setOrder: (v: 'asc' | 'desc') => void
  albumFilter?: string; subAlbumFilter?: string; tagFilter?: string
  locationKey: string
  token: string
  navigate: ReturnType<typeof useNavigate>
  searchParams: URLSearchParams; setSearchParams: (next: URLSearchParams) => void
}) {
  const { keyword, type, sort, order, setOrder, albumFilter, subAlbumFilter, tagFilter, locationKey, token, navigate } = props
  const [loading, setLoading] = useState(true)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [renameMedia, setRenameMedia] = useState<MediaListItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 待删除的媒体（用于弹出密码确认框）
  const [deleteTarget, setDeleteTarget] = useState<MediaListItem | null>(null)

  const currentAlbum = albums.find((a) => a.album === albumFilter)
  const subAlbums = currentAlbum?.sub_albums ?? []

  const load = async () => {
    setLoading(true)
    try {
      const mediaRes = await mediaApi.list({
        keyword, type, sort, order, page: 1, size: 100,
        album: albumFilter, sub_album: subAlbumFilter, tag_id: tagFilter,
      })
      const mediaList = (mediaRes.data.data as MediaListResponse).list ?? []
      const mediaItems: FeedItem[] = mediaList.map((item) => ({
        kind: 'media' as const, item, ts: item.media.file_modified_at,
      }))
      if (albumFilter) {
        const noteRes = await noteApi.list(albumFilter)
        const notes = noteRes.data.data.notes ?? []
        // 学习页与媒体共用同一排序键：name -> 标题；file_modified_at -> 更新时间；duration -> 0（笔记无时长，排到媒体之后）
        const getSortKey = (f: FeedItem): string => {
          if (sort === 'name') {
            return f.kind === 'media' ? f.item.media.name : f.note.title
          }
          if (sort === 'file_modified_at') {
            return f.ts
          }
          // duration：媒体按 duration，笔记排到末尾
          return f.kind === 'media' ? String(f.item.media.duration ?? 0).padStart(10, '0') : 'zzz'
        }
        const noteItems: FeedItem[] = notes.map((n) => ({
          kind: 'note' as const, note: n, ts: n.updated_at,
        }))
        const merged = [...mediaItems, ...noteItems]
        merged.sort((a, b) => {
          const cmp = getSortKey(a).localeCompare(getSortKey(b))
          return order === 'asc' ? cmp : -cmp
        })
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
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, type, sort, order, albumFilter, subAlbumFilter, tagFilter, locationKey])

  const handleCreateNote = async () => {
    if (!albumFilter) return
    if (!newTitle.trim()) { message.warning('请填写标题'); return }
    try {
      const res = await noteApi.create(albumFilter, newTitle.trim())
      message.success('已创建')
      setCreateOpen(false); setNewTitle('')
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
    setDeleteTarget(item)
  }

  // 用户在密码弹窗中提交后，真正发起删除请求
  const confirmDeleteMedia = async (password: string) => {
    if (!deleteTarget) return
    try {
      await mediaApi.remove(deleteTarget.media.id, password)
      message.success('已删除')
      setDeleteTarget(null)
      await load()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '删除失败'
      // 密码错误不关闭弹窗，让用户重试
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        message.error(msg)
        throw err // 让 Modal 保持打开
      }
      // 其他错误关闭弹窗
      setDeleteTarget(null)
      message.error(msg)
    }
  }

  const buildMediaMenu = (): MenuProps['items'] => [
    { key: 'rename', label: '✏️ 重命名', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '🗑️ 删除', icon: <DeleteOutlined />, danger: true },
  ]
  const onMediaMenuClick = (item: MediaListItem, key: string) => {
    if (key === 'rename') openRenameMedia(item)
    else if (key === 'delete') handleDeleteMedia(item)
  }

  // 升序/降序切换（名称排序时有效）
  const toggleOrder = () => {
    setOrder(order === 'asc' ? 'desc' : 'asc')
  }

  const currentSortLabel = sort === 'name' ? '名称' : (sort === 'file_modified_at' ? '存入时间' : '时长')

  return (
    <>
      {/* 排序工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>排序：</Text>
        <Tag color={sort === 'name' ? 'orange' : 'default'} style={{ borderRadius: 8 }}>{currentSortLabel}</Tag>
        <Button
          size="small"
          type={sort === 'name' ? 'primary' : 'default'}
          icon={order === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
          onClick={toggleOrder}
        >
          {order === 'asc' ? '升序 ↑' : '降序 ↓'}
        </Button>
      </div>

      {/* 专辑详情下的工具栏补充：子专辑 Tabs（季）+ 新建学习页面 */}
      {albumFilter && (
        <div style={{ marginBottom: 16 }}>
          {subAlbums.length > 0 && (
            <Tabs
              activeKey={subAlbumFilter ?? '__all__'}
              onChange={(key) => {
                const next = new URLSearchParams(props.searchParams)
                if (key === '__all__') next.delete('sub_album'); else next.set('sub_album', key)
                props.setSearchParams(next)
              }}
              size="middle"
              items={[
                {
                  key: '__all__',
                  label: (
                    <span>
                      <AppstoreOutlined style={{ marginRight: 4 }} />
                      全部
                    </span>
                  ),
                },
                ...subAlbums.map((s) => ({
                  key: s.sub_album,
                  label: (
                    <span>
                      {s.sub_album}
                      <Tag color="default" style={{ marginLeft: 6, borderRadius: 10 }}>
                        {s.played ?? 0}/{s.count}
                      </Tag>
                    </span>
                  ),
                })),
              ]}
              style={{ marginBottom: 12 }}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建学习页面
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : feed.length === 0 ? (
        <Empty description="🎁 没有匹配的内容" />
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
                      {f.item.play_count > 0 && (
                        <Tag color="orange" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 8 }}>
                          ▶ {f.item.play_count}
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

      <Modal title="📝 新建学习页面" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreateNote} okText="创建" cancelText="取消">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input placeholder="标题" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onPressEnter={handleCreateNote} size="large" autoFocus />
          {albumFilter && <Tag color="orange" style={{ borderRadius: 8 }}>📂 专辑: {albumFilter}</Tag>}
        </Space>
      </Modal>

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

      {/* 删除媒体：要求输入登录密码确认 */}
      <PasswordConfirmModal
        open={!!deleteTarget}
        title="🗑️ 删除媒体文件"
        description={
          deleteTarget
            ? `确定删除「${deleteTarget.media.name}」吗？该文件及同名的字幕/封面将被永久删除，无法恢复。`
            : ''
        }
        onConfirm={confirmDeleteMedia}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

// 学习页面卡片（网格视图用）
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
