import { useEffect, useState } from 'react'
import { Card, Row, Col, Input, Select, Empty, Spin, Tag, Typography, Tooltip, Button, Space, Modal, Dropdown, message, Tabs } from 'antd'
import type { MenuProps } from 'antd'
import { PlayCircleOutlined, SearchOutlined, CloseCircleOutlined, PlusOutlined, ReadOutlined, EditOutlined, DeleteOutlined, MoreOutlined, AppstoreOutlined, SortAscendingOutlined, SortDescendingOutlined, FolderOutlined, LockOutlined, TagsOutlined, CustomerServiceOutlined, PlayCircleFilled, HistoryOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { mediaApi, noteApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import MediaCover from '@/components/MediaCover'
import EmbyHome from '@/components/EmbyHome'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'
import NoteCardMenu from '@/components/NoteCardMenu'
import SeasonCardMenu from '@/components/SeasonCardMenu'
import TagManagerModal from '@/components/TagManagerModal'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import { formatDuration } from '@/utils'
import type { MediaListResponse, MediaListItem, Album, SubAlbum, StudyNote } from '@/types'

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
      {/* 顶部标题栏：左侧 logo + 标题，右侧学习记录图标（v0.7.3）
          学习记录入口从侧边栏移到此处，避免侧栏菜单臃肿；图标按钮 44×44 触控达标。 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 26 }}>🏝️</span>
          <span style={{
            fontSize: 18, fontWeight: 800, letterSpacing: '0.02em',
            color: 'var(--ac-text-header, #794f27)',
            fontFamily: 'var(--heading, inherit)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            EchoSub
          </span>
        </div>
        <Tooltip title="学习记录" placement="bottom">
          <Button
            type="text"
            shape="circle"
            icon={<HistoryOutlined style={{ fontSize: 20 }} />}
            onClick={() => navigate('/records')}
            aria-label="学习记录"
            style={{
              width: 44, height: 44, flexShrink: 0,
              color: 'var(--ac-text-header, #794f27)',
              background: 'var(--color-bg-elevated, #fff)',
              border: '1.5px solid var(--color-border-soft, rgba(159,146,125,0.18))',
              boxShadow: 'var(--color-shadow-card, 0 2px 8px rgba(0,0,0,0.04))',
            }}
          />
        </Tooltip>
      </div>

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
  const { isPhone } = useDeviceSize()
  const [loading, setLoading] = useState(true)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [renameMedia, setRenameMedia] = useState<MediaListItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 待删除的媒体（用于弹出密码确认框）
  const [deleteTarget, setDeleteTarget] = useState<MediaListItem | null>(null)
  // 专辑级标签管理弹窗（v0.5.0 起）：点击专辑标题旁的「🏷️ 标签」按钮打开
  const [tagOpen, setTagOpen] = useState(false)
  // 媒体级标签管理弹窗（v0.5.0 起）：在媒体 ⋮ 菜单里点击「管理标签」打开
  const [tagMedia, setTagMedia] = useState<MediaListItem | null>(null)

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
    { key: 'tag', label: '🏷️ 管理标签', icon: <TagsOutlined /> },
    { key: 'rename', label: '✏️ 重命名', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '🗑️ 删除', icon: <DeleteOutlined />, danger: true },
  ]
  const onMediaMenuClick = (item: MediaListItem, key: string) => {
    if (key === 'tag') setTagMedia(item)
    else if (key === 'rename') openRenameMedia(item)
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

      {/* 专辑详情：横幅 + 季选择视图 / 季内容视图（AC 风卡片）
          手机端不显示横幅（节省屏幕空间，专辑封面已能传达视觉信息） */}
      {albumFilter && currentAlbum && !isPhone && (
        <Card
          size="small"
          styles={{ body: { padding: 0 } }}
          style={{ marginBottom: 16, overflow: 'hidden', borderRadius: 'var(--radius-lg)' }}
        >
          {/* 横幅区：有 banner_path 时显示 16:5 横幅，否则用专辑封面作为小背景 */}
          <AlbumBanner album={currentAlbum} token={token} subAlbum={subAlbumFilter ?? null} />
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ fontSize: 16 }}>📂 {currentAlbum.album}</Text>
              {subAlbumFilter && (
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}> / 📁 {subAlbumFilter}</Text>
              )}
              {currentAlbum.description && (
                <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: 12, lineHeight: 1.6 }}>
                  {currentAlbum.description.slice(0, 200)}
                </div>
              )}
              {/* 专辑级标签展示 + 管理入口（v0.5.0 起） */}
              {(currentAlbum.tags?.length ?? 0) > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {currentAlbum.tags!.map((t) => (
                    <Tag key={t.id} color="purple" style={{ borderRadius: 8, margin: 0 }}>{t.name}</Tag>
                  ))}
                </div>
              )}
            </div>
            {/* 管理标签：专辑级标签由 AlbumMeta.ID 关联；meta_id=0 时禁用（罕见） */}
            <Tooltip title={currentAlbum.meta_id ? '管理该专辑的标签' : '该专辑未关联元数据，无法管理标签'}>
              <Button
                icon={<TagsOutlined />}
                onClick={() => setTagOpen(true)}
                disabled={!currentAlbum.meta_id}
              >
                标签
              </Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建学习页面
            </Button>
          </div>
        </Card>
      )}

      {/* 专辑详情下的工具栏补充：子专辑 Tabs（季） */}
      {albumFilter && subAlbums.length > 0 && (
        <div style={{ marginBottom: 12 }}>
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
          />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : albumFilter && subAlbums.length > 0 && !subAlbumFilter ? (
        // 专辑下有季且未选季：默认进入「季选择视图」（仅展示季卡片，不展示全部内容）
        <SeasonGrid
          album={currentAlbum!}
          subAlbums={subAlbums}
          token={token}
          onPick={(sub) => {
            const next = new URLSearchParams(props.searchParams)
            next.set('sub_album', sub)
            props.setSearchParams(next)
          }}
          onChanged={load}
        />
      ) : feed.length === 0 ? (
        <Empty description="🎁 没有匹配的内容" />
      ) : (() => {
        // 拆分：音频 → 列表；视频 + 学习页 → 卡片网格
        // 音频文件以紧凑列表形式展示，节省纵向空间，方便快速浏览大量曲目
        const audioItems = feed.filter((f) => f.kind === 'media' && f.item.media.type === 'audio') as Array<{ kind: 'media'; item: MediaListItem; ts: string }>
        const gridItems = feed.filter((f) => !(f.kind === 'media' && f.item.media.type === 'audio'))
        return (
          <>
            {audioItems.length > 0 && (
              <AudioList
                items={audioItems}
                onPlay={(id) => navigate(`/play/${id}`)}
                onMenuClick={onMediaMenuClick}
                buildMenu={buildMediaMenu}
              />
            )}
            {gridItems.length > 0 && (
              <Row gutter={[12, 12]} style={audioItems.length > 0 ? { marginTop: 16 } : undefined}>
                {gridItems.map((f) => (
                  <Col xs={12} sm={8} md={6} lg={4} xl={4} xxl={4} key={f.kind === 'media' ? `m-${f.item.media.id}` : `n-${f.note.id}`}>
                    {f.kind === 'media' ? (
                      (() => {
                        // 未读：play_count=0 且 last_position=0 表示用户从未播放/学习过
                        const isUnread = (f.item.play_count ?? 0) === 0 && (f.item.last_position ?? 0) === 0
                        return (
                          <Card
                            hoverable
                            onClick={() => navigate(`/play/${f.item.media.id}`)}
                            cover={
                              <div style={{ position: 'relative' }}>
                                <MediaCover media={f.item.media} />
                                <Tag
                                  color="magenta"
                                  style={{ position: 'absolute', top: 8, left: 8, margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 12, fontSize: 12, padding: '2px 8px', border: 'none' }}
                                >
                                  🎬 视频
                                </Tag>
                                {f.item.play_count > 0 && (
                                  <Tag color="orange" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 12, fontSize: 12, padding: '2px 8px', border: 'none' }}>
                                    ▶ {f.item.play_count}
                                  </Tag>
                                )}
                                {/* 未读灰色蒙版：从未播放/学习的媒体被半透明灰层覆盖 + 锁图标。
                                    学习后（play_count>0 或 last_position>0）自动消失。 */}
                                {isUnread && (
                                  <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'var(--color-mask-unread, rgba(40,30,20,0.55))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    pointerEvents: 'none',
                                    borderRadius: 'var(--radius-lg)',
                                  }}>
                                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.95)' }}>
                                      <LockOutlined style={{ fontSize: 48, display: 'block', marginBottom: 4, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
                                      <span style={{ fontSize: 13, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>未开始</span>
                                    </div>
                                  </div>
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
                                    <Text ellipsis style={{ flex: 1, minWidth: 0, fontWeight: 700, color: 'var(--ac-text-header, #794f27)' }}>{f.item.media.name}</Text>
                                  </Tooltip>
                                  <Dropdown
                                    menu={{ items: buildMediaMenu(), onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); onMediaMenuClick(f.item, key) } }}
                                    trigger={['click']}
                                    placement="bottomRight"
                                  >
                                    <button type="button" onClick={(e) => e.stopPropagation()} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, borderRadius: 8, fontSize: 18, color: 'var(--ac-text-secondary, #9f927d)', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="更多操作">
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
                                        <Tag key={t.id} color="purple" style={{ marginRight: 0, borderRadius: 10, fontSize: 11 }}>{t.name}</Tag>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              }
                            />
                          </Card>
                        )
                      })()
                    ) : (
                      <NoteCard note={f.note} token={token} onClick={() => navigate(`/notes/${f.note.id}`)} onChanged={load} />
                    )}
                  </Col>
                ))}
              </Row>
            )}
          </>
        )
      })()}

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

      {/* 专辑级标签管理弹窗（v0.5.0 起）：使用 AlbumMeta.ID 关联 */}
      {currentAlbum && (
        <TagManagerModal
          open={tagOpen}
          entityType="album"
          entityId={currentAlbum.meta_id || null}
          currentTagIds={(currentAlbum.tags ?? []).map((t) => t.id)}
          onClose={() => setTagOpen(false)}
          onSaved={() => {
            // 重新拉取专辑列表以刷新标签显示
            mediaApi.albums().then((res) => setAlbums(res.data.data.albums ?? [])).catch(() => {})
          }}
        />
      )}

      {/* 媒体级标签管理弹窗（v0.5.0 起）：使用 MediaFile.ID 关联 */}
      {tagMedia && (
        <TagManagerModal
          open={!!tagMedia}
          entityType="media"
          entityId={tagMedia.media.id}
          currentTagIds={(tagMedia.media.tags ?? []).map((t) => t.id)}
          onClose={() => setTagMedia(null)}
          onSaved={() => {
            // 重新拉取当前列表以刷新媒体标签显示
            load()
          }}
        />
      )}
    </>
  )
}

// 学习页面卡片（网格视图用）
// 右下角 ⋮ 菜单：置顶、重命名、上传封面、删除（密码确认）。
function NoteCard({
  note, token, onClick, onChanged,
}: {
  note: StudyNote
  token: string
  onClick: () => void
  onChanged: () => void
}) {
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
          {note.pinned && (
            <Tag color="gold" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(250,173,20,0.95)', color: '#fff', fontWeight: 700, borderRadius: 8, border: 'none' }}>
              📌
            </Tag>
          )}
          {/* 右下角 ⋮ 菜单：置顶、重命名、上传封面、删除（密码确认） */}
          <NoteCardMenu note={note} onChanged={onChanged} zIndex={3} />
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

/**
 * 音频列表（v0.7.3 新增）：
 * - 专辑内音频文件以紧凑列表展示，每行一个文件，节省纵向空间
 * - 左侧：▶ 播放按钮（点击进入播放器）
 * - 中部：标题（单行省略）+ 标签 + 进度条（已学习过）
 * - 右侧：时长 + 播放次数 + ⋮ 菜单
 * - 移动端：单列全宽；桌面：等宽列网格（手机 1 列、平板 2 列、桌面 3 列）
 * - 整体采用 AC 风：暖羊皮纸背景、pill 圆角、hover 浮起反馈
 */
function AudioList({
  items, onPlay, onMenuClick, buildMenu,
}: {
  items: Array<{ kind: 'media'; item: MediaListItem; ts: string }>
  onPlay: (id: number) => void
  onMenuClick: (item: MediaListItem, key: string) => void
  buildMenu: () => MenuProps['items']
}) {
  return (
    <div>
      {/* 列表标题（仅在有音频时显示） */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontSize: 14, fontWeight: 700, color: 'var(--ac-text-header, #794f27)',
        letterSpacing: '0.02em',
      }}>
        <CustomerServiceOutlined style={{ fontSize: 18, color: 'var(--ac-primary, #19c8b9)' }} />
        <span>🎵 音频列表</span>
        <Tag color="cyan" style={{ margin: 0, borderRadius: 999, fontWeight: 600, fontSize: 11 }}>
          {items.length} 个文件
        </Tag>
      </div>
      <Row gutter={[10, 10]}>
        {items.map((f) => {
          const m = f.item.media
          const progress = m.duration > 0 && f.item.last_position > 0
            ? Math.min(100, (f.item.last_position / m.duration) * 100)
            : 0
          const isUnread = (f.item.play_count ?? 0) === 0 && (f.item.last_position ?? 0) === 0
          return (
            <Col xs={24} sm={12} lg={8} key={`a-${m.id}`}>
              <div
                className="ac-card"
                onClick={() => onPlay(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', cursor: 'pointer',
                  minHeight: 64,
                  opacity: isUnread ? 0.78 : 1,
                }}
              >
                {/* 左侧播放按钮（圆形 pill） */}
                <div
                  style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--ac-primary, #19c8b9)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 0 0 var(--ac-shadow-button, #bdaea0)',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  onClick={(e) => { e.stopPropagation(); onPlay(m.id) }}
                  aria-label="播放"
                >
                  <PlayCircleFilled style={{ fontSize: 22, color: '#fff' }} />
                </div>
                {/* 中部：标题 + 进度条 + 标签 */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Tooltip title={m.name}>
                    <Text ellipsis style={{
                      fontWeight: 700, fontSize: 14, lineHeight: '20px',
                      color: 'var(--ac-text-header, #794f27)',
                    }}>
                      {isUnread && <LockOutlined style={{ fontSize: 12, marginRight: 4, color: 'var(--ac-text-tertiary, #c4b89e)' }} />}
                      {m.name}
                    </Text>
                  </Tooltip>
                  {/* 进度条：仅当有进度时显示 */}
                  {progress > 0 ? (
                    <div style={{ height: 4, background: 'var(--color-border-soft, rgba(159,146,125,0.18))', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${progress}%`,
                        background: 'var(--ac-primary, #19c8b9)',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {m.tags && m.tags.length > 0 ? (
                        m.tags.slice(0, 2).map((t) => (
                          <Tag key={t.id} color="purple" style={{ margin: 0, borderRadius: 8, fontSize: 10, padding: '0 6px', lineHeight: '16px' }}>{t.name}</Tag>
                        ))
                      ) : (
                        <Text type="secondary" style={{ fontSize: 11, color: 'var(--ac-text-tertiary, #c4b89e)' }}>
                          {m.sub_album || m.album || '未分类'}
                        </Text>
                      )}
                    </div>
                  )}
                </div>
                {/* 右侧：时长 + 播放次数 + ⋮ 菜单
                    时长为 0（未探测到 / 无元数据）时不显示，避免出现「00:00」 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    {m.duration > 0 && (
                      <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac-text-secondary, #9f927d)', fontVariantNumeric: 'tabular-nums' }}>
                        ⏱ {formatDuration(m.duration)}
                      </Text>
                    )}
                    {f.item.play_count > 0 && (
                      <Text style={{ fontSize: 11, color: 'var(--ac-primary, #19c8b9)', fontWeight: 600 }}>
                        ▶ {f.item.play_count} 次
                      </Text>
                    )}
                  </div>
                  <Dropdown
                    menu={{ items: buildMenu(), onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); onMenuClick(f.item, key) } }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        borderRadius: 8, padding: 4, fontSize: 18,
                        color: 'var(--ac-text-secondary, #9f927d)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 32, minHeight: 32,
                      }}
                      title="更多操作"
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </div>
              </div>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}

/**
 * 专辑 / 季横幅：优先 banner.jpg（来自 Emby 扫描），否则用专辑封面。
 * 显示 16:5 横向横幅 + 底部暗色叠加 + 专辑 / 季名 + 描述。
 *
 * 实现说明：使用 <img> + objectFit: cover 替代 CSS background-image url()，
 * 因为 background-image 在某些浏览器对「图片加载失败 / 跨域 / 状态码非 200」的反馈
 * 不直观（图片不可见但占位正常），用 <img> 可以显式 onError 兜底。
 */
function AlbumBanner({ album, subAlbum, token }: { album: Album; subAlbum: string | null; token: string }) {
  // 选中季时优先用季的 banner，否则用专辑的 banner
  const subMeta = subAlbum ? album.sub_albums?.find((s) => s.sub_album === subAlbum) : undefined
  const bannerPath = subMeta?.banner_path ?? album.banner_path
  const coverPath = subMeta?.cover_path ?? album.cover_path
  const description = subMeta?.description ?? album.description
  const bannerUrl = bannerPath ? mediaApi.albumBannerUrl(album.album, token, subAlbum ?? '') : ''
  const coverUrl = coverPath ? mediaApi.albumCoverUrl(album.album, token, subAlbum ?? '') : ''
  // 当季无 banner 时回退到季封面（或专辑封面）
  const imgUrl = bannerUrl || coverUrl
  return (
    <div style={{
      position: 'relative', height: 220, width: '100%',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
    }}>
      {imgUrl && (
        <img
          src={imgUrl}
          alt={subAlbum ?? album.album}
          // objectFit: cover 保证 banner.jpg（典型 16:5）能完整铺满整个横幅容器，
          // 同时保持原图比例（不会拉伸变形）；onError 时隐藏，回退到纯渐变背景。
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      {/* 暗色叠加：保证底部文字可读 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'absolute', bottom: 14, left: 20, right: 20, color: '#fff' }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 800, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {subAlbum ?? album.album}
        </Text>
        {subAlbum && (
          <Text style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 8, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            · {album.album}
          </Text>
        )}
        {description && (
          <div
            style={{
              marginTop: 6,
              color: 'rgba(255,255,255,0.92)',
              fontSize: 13,
              lineHeight: 1.55,
              maxWidth: 720,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 季选择网格：专辑下有多个子专辑时，进入专辑页默认展示。
 * 每张季卡片：封面（cover_path 或 banner_path）+ 季名 + 数量徽标，点击季卡片查看内容。
 * 季卡片右下角 ⋮ 菜单：上传季封面、删除季（密码确认）。
 * 类似 Emby "Seasons" 行。
 *
 * 季封面（seasonXX-poster.jpg / Season N/folder.jpg）通常为竖版 2:3 海报，
 * 容器固定 2:3 高度 + objectFit: 'contain' + 灰底填充，保证竖版图不被裁剪、图标完整可见。
 */
function SeasonGrid({ album, subAlbums, token, onPick, onChanged }: {
  album: Album; subAlbums: SubAlbum[]; token: string
  onPick: (sub: string) => void
  onChanged: () => void
}) {
  return (
    <div>
      <div style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 13 }}>
        该专辑共 {subAlbums.length} 季，点击季卡片查看内容。
      </div>
      <Row gutter={[12, 12]}>
        {subAlbums.map((s) => {
          const cover = s.cover_path || s.banner_path
          const coverUrl = cover ? mediaApi.albumCoverUrl(album.album, token, s.sub_album) : ''
          // 季未读：played=0 且 count>0（季内所有媒体都未开始学习）
          const isUnread = (s.played ?? 0) === 0 && (s.count ?? 0) > 0
          return (
            <Col xs={12} sm={8} md={6} lg={4} xxl={4} key={s.sub_album}>
              <Card
                hoverable
                onClick={() => onPick(s.sub_album)}
                styles={{ body: { padding: 10 } }}
                style={{ overflow: 'hidden', borderRadius: 'var(--radius-lg)' }}
                cover={
                  // 季封面容器：2:3 竖向比例（与 Emby 海报同款），背景浅灰填充以衬托 objectFit: 'contain'
                  // 防止竖版 seasonXX-poster.jpg 被裁剪，保证整张图（含季图标）完整可见。
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 3', background: '#f5f5f5' }}>
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={s.sub_album}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        background: 'var(--ac-pattern-blue, #e6ecff)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FolderOutlined style={{ fontSize: 48, color: 'rgba(43,58,153,0.7)' }} />
                      </div>
                    )}
                    <Tag color="orange" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 12, fontWeight: 700, border: 'none', fontSize: 12, padding: '2px 8px' }}>
                      📁 季
                    </Tag>
                    {/* 季未读灰色蒙版：played=0 且 count>0（季内所有媒体都未开始学习）。
                        季内任意媒体被学习后（played>0）蒙版自动消失。 */}
                    {isUnread && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'var(--color-mask-unread, rgba(40,30,20,0.55))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        pointerEvents: 'none',
                        borderRadius: 'var(--radius-lg)',
                      }}>
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.95)' }}>
                          <LockOutlined style={{ fontSize: 48, display: 'block', marginBottom: 4, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
                          <span style={{ fontSize: 13, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>未开始</span>
                        </div>
                      </div>
                    )}
                    {/* 右下角 ⋮ 菜单：管理标签 / 上传季封面 / 删除该季（密码确认） */}
                    <SeasonCardMenu
                      album={album.album}
                      subAlbum={s.sub_album}
                      metaId={s.meta_id}
                      tags={s.tags}
                      onChanged={onChanged}
                    />
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                      padding: '20px 10px 8px',
                    }}>
                      <Text style={{ color: '#fff', fontWeight: 700, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                        {s.sub_album}
                      </Text>
                    </div>
                  </div>
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text type="secondary" style={{ fontSize: 12, color: 'var(--ac-text-secondary, #9f927d)' }}>
                    {(s.played ?? 0) > 0 ? `已看 ${s.played}/${s.count}` : `${s.count} 项`}
                  </Text>
                </div>
                {s.description && (
                  <Text type="secondary" ellipsis style={{ fontSize: 11, marginTop: 4, display: 'block', color: 'var(--ac-text-secondary, #9f927d)' }}>
                    {s.description}
                  </Text>
                )}
              </Card>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}
