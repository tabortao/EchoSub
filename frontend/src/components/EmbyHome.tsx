import { useEffect, useState, useRef, useCallback } from 'react'
import { Spin, Empty, Tag, Typography, Tooltip, Button, Modal, Input, message, Dropdown, Upload } from 'antd'
import { PlayCircleOutlined, ReadOutlined, FolderOutlined, MoreOutlined, EditOutlined, PictureOutlined, PushpinFilled, PushpinOutlined, DeleteOutlined, LockOutlined, TagsOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import type { MenuProps } from 'antd'
import { mediaApi, noteApi, recordApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useScanStore } from '@/store/scan'
import MediaCover from '@/components/MediaCover'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'
import NoteCardMenu from '@/components/NoteCardMenu'
import TagManagerModal from '@/components/TagManagerModal'
import { formatRelative } from '@/utils'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { MediaListItem, Album, StudyNote, PlayRecord, MediaFile } from '@/types'

const { Text, Title } = Typography

// 媒体卡片宽度基准值（实际宽度按视口动态计算）
// - 手机端：min(45vw, 160px) — 紧凑但仍可点
// - 桌面端：固定 180px
const CARD_WIDTH_DESKTOP = 180
// 专辑入口卡片宽度（更大更突出）
const ALBUM_CARD_WIDTH_DESKTOP = 220

/** 根据视口宽度计算媒体卡片宽度（手机端自适应，桌面端固定） */
function computeCardWidth(isPhone: boolean, vw: number): number {
  if (!isPhone) return CARD_WIDTH_DESKTOP
  // 手机端：约一半视口宽（两张卡片可见），不超过 160
  return Math.min(Math.max(vw * 0.45, 140), 160)
}

/** 根据视口宽度计算专辑卡片宽度 */
function computeAlbumCardWidth(isPhone: boolean, vw: number): number {
  if (!isPhone) return ALBUM_CARD_WIDTH_DESKTOP
  return Math.min(Math.max(vw * 0.45, 160), 200)
}

// 继续学习行的混排项
type FeedItem =
  | { kind: 'media'; item: MediaListItem; ts: string }
  | { kind: 'note'; note: StudyNote; ts: string }

// 专辑入口：一个封面代表整个专辑
interface AlbumEntry {
  album: Album
  cover: MediaListItem | null
  count: number
  played: number
  lastPlayedAt: string
  hasVideo: boolean
}

interface EmbyHomeProps {
  /** 点击媒体卡片，跳转播放器 */
  onPlayMedia: (id: number) => void
  /** 点击学习页面卡片，跳转笔记编辑器 */
  onOpenNote: (id: number) => void
  /** 点击专辑入口，进入专辑详情（网格视图） */
  onOpenAlbum: (album: string) => void
}

/**
 * Emby 风格首页布局：
 * - 顶部「继续学习」横向滚动行：最近播放的媒体 + 最近更新的学习页面
 * - 中部「我的专辑」横向滚动行：每个专辑仅显示一个封面入口（最近播放的视频封面），
 *   点击进入专辑详情页查看全部内容（学习 Emby「My Media」设计）
 * - 底部「独立资源」行：未归入任何专辑的散落文件
 */
export default function EmbyHome({ onPlayMedia, onOpenNote, onOpenAlbum }: EmbyHomeProps) {
  const token = useAuthStore((s) => s.token) ?? ''
  const lastTriggeredAt = useScanStore((s) => s.lastTriggeredAt)
  const lastTriggeredAtRef = useRef(lastTriggeredAt)
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState<FeedItem[]>([])
  const [albumEntries, setAlbumEntries] = useState<AlbumEntry[]>([])
  const [standalone, setStandalone] = useState<MediaListItem[]>([])
  // 响应式卡片宽度
  const { isPhone, width: viewportWidth } = useDeviceSize()
  const CARD_WIDTH = computeCardWidth(isPhone, viewportWidth)
  const ALBUM_CARD_WIDTH = computeAlbumCardWidth(isPhone, viewportWidth)
  // 专辑封面 2:3 比例（响应式） — 让 MediaCover 用 aspectRatio 自动算高度
  const ALBUM_COVER_HEIGHT = Math.round(ALBUM_CARD_WIDTH * 1.5)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recordRes, noteRes, mediaRes, albumRes] = await Promise.all([
        // 只拉取「未完成播放」的媒体（后端过滤：last_position > 0 且 < duration * 0.95），
        // 已看完的媒体不再出现在首页「继续观看」行，避免重复。
        recordApi.recent(20, { unfinished: true }),
        noteApi.list(),
        mediaApi.list({ sort: 'file_modified_at', order: 'desc', page: 1, size: 200 }),
        mediaApi.albums(),
      ])

      const records = (recordRes.data.data.records ?? []) as PlayRecord[]
      const allMedia = (mediaRes.data.data.list ?? []) as MediaListItem[]
      const albums = (albumRes.data.data.albums ?? []) as Album[]

      // 继续学习：最近播放的媒体（去重，最多 12 条）
      // recordApi.recent 后端已去重，但前端再容错一遍以避免重复渲染
      const seenMedia = new Set<number>()
      const mediaFeed: FeedItem[] = []
      for (const r of records) {
        if (r.media && r.media.id !== 0) {
          if (seenMedia.has(r.media.id)) continue
          seenMedia.add(r.media.id)
          mediaFeed.push({
            kind: 'media',
            item: {
              media: r.media as MediaFile,
              play_count: r.play_count,
              last_position: r.last_position,
              last_played_at: r.last_played_at,
            },
            ts: r.last_played_at || '',
          })
          if (mediaFeed.length >= 12) break
        }
      }
      const notes = (noteRes.data.data.notes ?? []).slice(0, 4)
      const noteFeed: FeedItem[] = notes.map((n) => ({
        kind: 'note' as const, note: n, ts: n.updated_at,
      }))
      const merged = [...mediaFeed, ...noteFeed].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 15)
      setRecent(merged)

      // 专辑入口：每个专辑选一个代表封面
      const entries: AlbumEntry[] = albums.map((a) => pickAlbumCover(a, allMedia, records))
        .filter((e) => e.count > 0)
        .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt))
      setAlbumEntries(entries)

      // 独立资源：未归入专辑的散落文件
      setStandalone(allMedia.filter((m) => !m.media.album))
    } catch {
      setRecent([])
      setAlbumEntries([])
      setStandalone([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // 依赖 lastTriggeredAt：Header 触发扫描后重新拉取
  }, [lastTriggeredAt, load])

  // ref 同步，避免组件卸载后漏掉最新值
  useEffect(() => {
    lastTriggeredAtRef.current = lastTriggeredAt
  }, [lastTriggeredAt])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  if (recent.length === 0 && albumEntries.length === 0 && standalone.length === 0) {
    return <Empty description="🎁 暂无内容，把文件放入媒体目录或创建学习页面吧~" />
  }

  return (
    <div>
      {/* 继续观看行：未完成的媒体（recordApi 已过滤 unfinished）+ 最近更新的学习页面 */}
      {recent.length > 0 && (
        <ScrollRow
          title="▶️ 继续观看"
          items={recent}
          renderItem={(f) =>
            f.kind === 'media' ? (
              <MediaCard key={`m-${f.item.media.id}`} item={f.item} showProgress onClick={() => onPlayMedia(f.item.media.id)} cardWidth={CARD_WIDTH} />
            ) : (
              <NoteCard key={`n-${f.note.id}`} note={f.note} token={token} onClick={() => onOpenNote(f.note.id)} onChanged={load} cardWidth={CARD_WIDTH} />
            )
          }
        />
      )}

      {/* 我的专辑：每个专辑一个封面入口 */}
      {albumEntries.length > 0 && (
        <ScrollRow
          title="📂 我的专辑"
          items={albumEntries}
          renderItem={(entry) => (
            <AlbumCard
              key={entry.album.album}
              entry={entry}
              token={token}
              onClick={() => onOpenAlbum(entry.album.album)}
              onChanged={load}
              cardWidth={ALBUM_CARD_WIDTH}
              coverHeight={ALBUM_COVER_HEIGHT}
            />
          )}
        />
      )}

      {/* 独立资源：散落文件 */}
      {standalone.length > 0 && (
        <ScrollRow
          title="📋 独立资源"
          items={standalone}
          renderItem={(item) => (
            <MediaCard key={`m-${item.media.id}`} item={item} showProgress={false} onClick={() => onPlayMedia(item.media.id)} cardWidth={CARD_WIDTH} />
          )}
        />
      )}
    </div>
  )
}

/**
 * 为专辑挑选代表封面：
 * 1. 优先最近播放的视频
 * 2. 其次专辑内第一个视频
 * 3. 再次最近播放的任意媒体
 * 4. 兜底专辑内第一个媒体
 */
function pickAlbumCover(album: Album, allMedia: MediaListItem[], records: PlayRecord[]): AlbumEntry {
  const items = allMedia.filter((m) => m.media.album === album.album)
  const hasVideo = items.some((m) => m.media.type === 'video')

  // 1. 最近播放的视频
  for (const r of records) {
    if (r.media?.album === album.album && r.media.type === 'video') {
      return makeEntry(album, toMediaListItem(r), items.length, r.last_played_at, hasVideo)
    }
  }
  // 2. 第一个视频
  const firstVideo = items.find((m) => m.media.type === 'video')
  if (firstVideo) {
    const lastPlayed = findLastPlayedAt(album.album, records)
    return makeEntry(album, firstVideo, items.length, lastPlayed, hasVideo)
  }
  // 3. 最近播放的任意媒体
  for (const r of records) {
    if (r.media?.album === album.album) {
      return makeEntry(album, toMediaListItem(r), items.length, r.last_played_at, hasVideo)
    }
  }
  // 4. 兜底
  return makeEntry(album, items[0] ?? null, items.length, '', hasVideo)
}

function findLastPlayedAt(albumName: string, records: PlayRecord[]): string {
  for (const r of records) {
    if (r.media?.album === albumName) return r.last_played_at
  }
  return ''
}

function toMediaListItem(r: PlayRecord): MediaListItem {
  return {
    media: r.media as MediaFile,
    play_count: r.play_count,
    last_position: r.last_position,
    last_played_at: r.last_played_at,
  }
}

function makeEntry(album: Album, cover: MediaListItem | null, count: number, lastPlayedAt: string, hasVideo: boolean): AlbumEntry {
  return { album, cover, count, played: album.played ?? 0, lastPlayedAt, hasVideo }
}

/**
 * 横向滚动行：标题 + 可水平滚动的卡片列表。
 */
function ScrollRow<T>({
  title, items, renderItem, extra,
}: {
  title: string
  items: T[]
  renderItem: (item: T) => React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>{title}</Title>
        {extra}
      </div>
      <div className="scroll-row" style={scrollRowStyle}>
        {items.map((item) => renderItem(item))}
      </div>
    </div>
  )
}

const scrollRowStyle: React.CSSProperties = {
  display: 'flex', gap: 16,
  overflowX: 'auto', overflowY: 'hidden',
  paddingBottom: 8, scrollbarWidth: 'thin',
}

/**
 * 专辑入口卡片：一个封面代表整个专辑，点击进入详情。
 * 学习 Emby「My Media」海报风格——大尺寸竖向封面 + 底部渐变标题。
 * 右下角 ⋮ 菜单：置顶/取消置顶、重命名专辑、上传专辑封面（folder.jpg）、删除（密码确认）。
 * 优先使用 album.cover_path（来自 Emby 扫描或用户上传），否则自动挑选代表媒体封面。
 */
function AlbumCard({ entry, onClick, onChanged, token, cardWidth, coverHeight }: {
  entry: AlbumEntry
  onClick: () => void
  onChanged: () => void
  token: string
  cardWidth: number
  coverHeight: number
}) {
  const { album, cover, count, played, hasVideo } = entry
  const [hovered, setHovered] = useState(false)
  const playedPct = count > 0 ? Math.round((played / count) * 100) : 0
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(album.album)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pinned, setPinned] = useState(!!album.pinned)
  // 标签管理弹窗（v0.5.0 起）：专辑级标签由 AlbumMeta.ID 关联
  const [tagOpen, setTagOpen] = useState(false)

  // 优先使用 album 自带封面（来自 Emby 扫描或用户上传）；否则用自动挑选的代表封面
  const hasAlbumCover = !!album.cover_path
  const albumCoverUrl = hasAlbumCover ? mediaApi.albumCoverUrl(album.album, token) : ''

  // 重命名提交
  const submitRename = async () => {
    const newName = renameValue.trim()
    if (!newName) { message.warning('请输入新名称'); return }
    if (newName === album.album) { setRenameOpen(false); return }
    setSubmitting(true)
    try {
      await mediaApi.renameAlbum(album.album, newName)
      message.success('专辑已重命名')
      setRenameOpen(false)
      onChanged()
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '重命名失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 切换置顶
  const handleTogglePin = async () => {
    try {
      const res = await mediaApi.togglePinAlbum(album.album)
      const next = res.data.data?.pinned ?? false
      setPinned(next)
      message.success(next ? '已置顶专辑' : '已取消置顶')
      onChanged()
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '置顶操作失败')
    }
  }

  // 删除专辑
  const handleDelete = (password: string) => {
    return mediaApi.deleteAlbum(album.album, password)
      .then(() => {
        message.success('专辑已删除')
        setDeleteOpen(false)
        onChanged()
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '删除失败'
        message.error(msg)
        if (status === 401) throw err
        setDeleteOpen(false)
      })
  }

  // 上传封面前的 props 配置
  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    beforeUpload: (file) => {
      if (file.size > 10 * 1024 * 1024) {
        message.error('封面图不能超过 10MB')
        return Upload.LIST_IGNORE
      }
      setUploading(true)
      mediaApi.uploadAlbumCover(album.album, file)
        .then(() => {
          message.success('封面已上传')
          onChanged()
        })
        .catch((err: unknown) => {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '上传失败')
        })
        .finally(() => setUploading(false))
      return false
    },
  }

  // 菜单项：最上方为置顶（视觉强调），下方编辑类操作
  const cardMenuItems: MenuProps['items'] = [
    { key: 'pin', icon: pinned ? <PushpinFilled /> : <PushpinOutlined />, label: pinned ? '取消置顶' : '📌 置顶专辑' },
    { type: 'divider' },
    { key: 'rename', icon: <EditOutlined />, label: '✏️ 重命名专辑' },
    { key: 'cover', icon: <PictureOutlined />, label: uploading ? '上传中…' : '🖼️ 上传封面图' },
    { key: 'tag', icon: <TagsOutlined />, label: '🏷️ 管理标签', disabled: !album.meta_id },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '🗑️ 删除专辑', danger: true },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    // 阻止冒泡到卡片点击（防止触发进入专辑）
    domEvent?.stopPropagation()
    if (key === 'pin') {
      handleTogglePin()
    } else if (key === 'rename') {
      setRenameValue(album.album)
      setRenameOpen(true)
    } else if (key === 'cover') {
      // 触发 Upload 组件的 input 点击
      document.getElementById(`album-cover-input-${CSS.escape(album.album)}`)?.click()
    } else if (key === 'tag') {
      // 打开标签管理弹窗（专辑级标签）
      setTagOpen(true)
    } else if (key === 'delete') {
      setDeleteOpen(true)
    }
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: cardWidth, flexShrink: 0, cursor: 'pointer',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        transform: hovered ? 'translateY(-6px) scale(1.02)' : 'none',
        transition: 'transform 0.25s, box-shadow 0.25s',
        position: 'relative',
      }}
    >
      {/* 封面区 */}
      <div style={{ position: 'relative', height: coverHeight }}>
        {hasAlbumCover ? (
          <img
            src={albumCoverUrl}
            alt={album.album}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : cover ? (
          <MediaCover media={cover.media} height={coverHeight} colorKey={album.album} />
        ) : (
          <div style={{
            height: '100%',
            background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FolderOutlined style={{ fontSize: 64, color: 'rgba(255,255,255,0.8)' }} />
          </div>
        )}
        {/* 顶部信息角标：置顶徽标 + 专辑类型 + 数量 */}
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
            <Tag color="orange" style={{ margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 8, fontSize: 12 }}>
              📂 专辑
            </Tag>
            {pinned && (
              <Tag color="gold" style={{ margin: 0, background: 'rgba(250,173,20,0.95)', color: '#fff', fontWeight: 700, borderRadius: 8, fontSize: 12, border: 'none' }}>
                📌 置顶
              </Tag>
            )}
          </div>
          <Tag style={{ margin: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 12, border: 'none', flexShrink: 0 }}>
            {count} 项
          </Tag>
        </div>
        {/* 右下角 ⋮ 菜单按钮：固定位置 + hover 时加深背景 */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 10, right: 10, zIndex: 5,
          }}
        >
          <Dropdown
            menu={{ items: cardMenuItems, onClick: onMenuClick }}
            trigger={['click']}
            placement="topRight"
          >
            <Button
              shape="circle"
              size="small"
              icon={<MoreOutlined style={{ fontSize: 18 }} />}
              style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff' }}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
          {/* 隐藏的 Upload 组件，用于触发文件选择 */}
          <Upload {...uploadProps}>
            <span id={`album-cover-input-${album.album}`} style={{ display: 'none' }} />
          </Upload>
        </div>
        {/* 悬停进入提示（hover 时淡入） */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: hovered ? 1 : 0, transition: 'opacity 0.25s', pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <PlayCircleOutlined style={{ fontSize: 52, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }} />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.6)', background: 'rgba(0,0,0,0.4)', padding: '2px 10px', borderRadius: 12 }}>
            进入专辑
          </span>
        </div>
        {/* 底部渐变标题区 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
          padding: '16px 12px 8px',
        }}>
          <Tooltip title={album.album}>
            <Text ellipsis style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 15, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              {album.album}
            </Text>
          </Tooltip>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {album.has_seasons && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>📁 {album.sub_albums?.length ?? 0} 季</span>}
            {hasVideo && !album.has_seasons && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>🎬 含视频</span>}
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600 }}>
              {played > 0 ? `已看 ${played}/${count}` : `${count} 项`}
            </span>
          </div>
          {/* 观看进度条微条 */}
          {count > 0 && (
            <div style={{ height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${playedPct}%`,
                background: 'linear-gradient(90deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
                transition: 'width 0.4s',
              }} />
            </div>
          )}
        </div>
      </div>

      {/* 重命名专辑 Modal */}
      <Modal
        title={`重命名专辑：${album.album}`}
        open={renameOpen}
        onOk={submitRename}
        onCancel={() => setRenameOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          将同时重命名磁盘上的专辑目录与数据库中的所有关联记录。
        </Text>
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
          autoFocus
          size="large"
          maxLength={255}
        />
      </Modal>

      {/* 删除专辑：密码二次确认 */}
      <PasswordConfirmModal
        open={deleteOpen}
        title="🗑️ 删除专辑"
        description={`确定删除「${album.album}」吗？专辑目录及其全部媒体 / 字幕 / 封面 / 学习页面将被永久删除，无法恢复。`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* 专辑级标签管理弹窗（v0.5.0 起） */}
      <TagManagerModal
        open={tagOpen}
        entityType="album"
        entityId={album.meta_id || null}
        currentTagIds={(album.tags ?? []).map((t) => t.id)}
        onClose={() => setTagOpen(false)}
        onSaved={onChanged}
      />
    </div>
  )
}

/**
 * 媒体海报卡片：竖向布局，封面 + 标题 + 可选进度条。
 * 未读状态：play_count=0 且 last_position=0 时覆盖半透明灰色蒙版 + 锁图标，提示用户还未学习。
 */
function MediaCard({
  item, showProgress, onClick, cardWidth,
}: {
  item: MediaListItem
  showProgress: boolean
  onClick: () => void
  cardWidth: number
}) {
  const m = item.media
  const progress = m.duration > 0 && item.last_position > 0
    ? Math.min(100, (item.last_position / m.duration) * 100)
    : 0
  // 未读：play_count=0 且 last_position=0 表示用户从未播放/学习过
  const isUnread = (item.play_count ?? 0) === 0 && (item.last_position ?? 0) === 0
  return (
    <div
      onClick={onClick}
      style={{
        width: cardWidth, flexShrink: 0, cursor: 'pointer',
        borderRadius: 12, overflow: 'hidden',
        background: 'var(--color-bg-elevated, #fff)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 20px color-mix(in srgb, var(--ant-color-primary) 18%, transparent)` }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
    >
      <div style={{ position: 'relative' }}>
        <MediaCover media={m} height={240} colorKey={m.album ?? m.id} />
        <Tag
          color={m.type === 'video' ? 'magenta' : 'green'}
          style={{ position: 'absolute', top: 8, left: 8, margin: 0, background: 'rgba(255,255,255,0.9)', fontWeight: 600, borderRadius: 8 }}
        >
          {m.type === 'video' ? '🎬' : '🎵'}
        </Tag>
        {item.play_count > 0 && (
          <Tag color="orange" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.9)', fontWeight: 600, borderRadius: 8 }}>
            ▶ {item.play_count}
          </Tag>
        )}
        {/* 未读灰色蒙版：从未播放/学习的媒体被半透明灰层覆盖 + 锁图标，提示尚未开始。
            学习后（play_count>0 或 last_position>0）自动消失。 */}
        {isUnread && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(128,128,128,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.95)' }}>
              <LockOutlined style={{ fontSize: 40, display: 'block', marginBottom: 4, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
              <span style={{ fontSize: 12, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>未开始</span>
            </div>
          </div>
        )}
        <PlayCircleOutlined style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 44, color: 'rgba(255,255,255,0.9)',
          opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
        }} />
        {showProgress && progress > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))' }} />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <Tooltip title={m.name}>
          <Text ellipsis style={{ display: 'block', fontWeight: 600, fontSize: 13, lineHeight: '18px' }}>{m.name}</Text>
        </Tooltip>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {showProgress && item.last_played_at ? formatRelative(item.last_played_at) : (m.sub_album || m.album || '')}
        </Text>
      </div>
    </div>
  )
}

/**
 * 学习页面海报卡片：首图或渐变占位 + 标题。
 * 右下角 ⋮ 菜单：置顶、重命名、上传封面、删除（密码确认）。
 */
function NoteCard({
  note, token, onClick, onChanged, cardWidth,
}: {
  note: StudyNote
  token: string
  onClick: () => void
  onChanged: () => void
  cardWidth: number
}) {
  const hasImg = note.images && note.images.length > 0
  return (
    <div
      onClick={onClick}
      style={{
        width: cardWidth, flexShrink: 0, cursor: 'pointer',
        borderRadius: 12, overflow: 'hidden',
        background: 'var(--color-bg-elevated, #fff)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        position: 'relative',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(250,173,20,0.18)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
    >
      <div style={{ position: 'relative', height: 240 }}>
        {hasImg ? (
          <img
            src={noteApi.imageUrl(note.id, note.images[0], token)}
            alt={note.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{
            height: '100%',
            background: 'linear-gradient(135deg, #fff7e6, #ffe7ba)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ReadOutlined style={{ fontSize: 56, color: '#FAAD14' }} />
          </div>
        )}
        <Tag color="gold" style={{ position: 'absolute', top: 8, left: 8, margin: 0, fontWeight: 600, borderRadius: 8, background: 'rgba(255,255,255,0.9)' }}>
          📖 学习页
        </Tag>
        {note.pinned && (
          <Tag color="gold" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(250,173,20,0.95)', color: '#fff', fontWeight: 700, borderRadius: 8, border: 'none' }}>
            📌 置顶
          </Tag>
        )}
        {/* 右下角 ⋮ 菜单：置顶、重命名、上传封面、删除（密码确认） */}
        <NoteCardMenu note={note} onChanged={onChanged} />
      </div>
      <div style={{ padding: '8px 10px' }}>
        <Tooltip title={note.title}>
          <Text ellipsis style={{ display: 'block', fontWeight: 600, fontSize: 13, lineHeight: '18px' }}>{note.title}</Text>
        </Tooltip>
        <Text type="secondary" style={{ fontSize: 11 }}>{formatRelative(note.updated_at)}</Text>
      </div>
    </div>
  )
}
