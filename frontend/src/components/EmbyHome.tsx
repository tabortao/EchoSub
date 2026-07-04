import { useEffect, useState, useRef, useCallback } from 'react'
import { Spin, Empty, Tag, Typography, Tooltip, Button, Modal, Input, message, Dropdown, Upload } from 'antd'
import { PlayCircleOutlined, ReadOutlined, FolderOutlined, MoreOutlined, EditOutlined, PictureOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import type { MenuProps } from 'antd'
import { mediaApi, noteApi, recordApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useScanStore } from '@/store/scan'
import MediaCover from '@/components/MediaCover'
import { formatRelative } from '@/utils'
import type { MediaListItem, Album, StudyNote, PlayRecord, MediaFile } from '@/types'

const { Text, Title } = Typography

// 媒体卡片宽度
const CARD_WIDTH = 180
// 专辑入口卡片宽度（更大更突出）
const ALBUM_CARD_WIDTH = 220
// 专辑入口卡片封面高度（2:3 竖向海报比例）
const ALBUM_COVER_HEIGHT = 330

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recordRes, noteRes, mediaRes, albumRes] = await Promise.all([
        recordApi.recent(20),
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
      {/* 继续学习行 */}
      {recent.length > 0 && (
        <ScrollRow
          title="▶️ 继续学习"
          items={recent}
          renderItem={(f) =>
            f.kind === 'media' ? (
              <MediaCard key={`m-${f.item.media.id}`} item={f.item} showProgress onClick={() => onPlayMedia(f.item.media.id)} />
            ) : (
              <NoteCard key={`n-${f.note.id}`} note={f.note} token={token} onClick={() => onOpenNote(f.note.id)} />
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
            <MediaCard key={`m-${item.media.id}`} item={item} showProgress={false} onClick={() => onPlayMedia(item.media.id)} />
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
        <Title level={5} style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>{title}</Title>
        {extra}
      </div>
      <div style={scrollRowStyle}>
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
 * 右上角 ⋮ 菜单：重命名专辑、上传专辑封面（folder.jpg）。
 * 优先使用 album.cover_path（来自 Emby 扫描或用户上传），否则自动挑选代表媒体封面。
 */
function AlbumCard({ entry, onClick, onChanged, token }: { entry: AlbumEntry; onClick: () => void; onChanged: () => void; token: string }) {
  const { album, cover, count, played, hasVideo } = entry
  const [hovered, setHovered] = useState(false)
  const playedPct = count > 0 ? Math.round((played / count) * 100) : 0
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(album.album)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

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

  const cardMenuItems: MenuProps['items'] = [
    { key: 'rename', icon: <EditOutlined />, label: '重命名专辑' },
    { key: 'cover', icon: <PictureOutlined />, label: uploading ? '上传中…' : '上传封面图' },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    // 阻止冒泡到卡片点击（防止触发进入专辑）
    domEvent?.stopPropagation()
    if (key === 'rename') {
      setRenameValue(album.album)
      setRenameOpen(true)
    } else if (key === 'cover') {
      // 触发 Upload 组件的 input 点击
      document.getElementById(`album-cover-input-${CSS.escape(album.album)}`)?.click()
    }
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: ALBUM_CARD_WIDTH, flexShrink: 0, cursor: 'pointer',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        transform: hovered ? 'translateY(-6px) scale(1.02)' : 'none',
        transition: 'transform 0.25s, box-shadow 0.25s',
        position: 'relative',
      }}
    >
      {/* 封面区 */}
      <div style={{ position: 'relative', height: ALBUM_COVER_HEIGHT }}>
        {hasAlbumCover ? (
          <img
            src={albumCoverUrl}
            alt={album.album}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : cover ? (
          <MediaCover media={cover.media} height={ALBUM_COVER_HEIGHT} colorKey={album.album} />
        ) : (
          <div style={{
            height: '100%',
            background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FolderOutlined style={{ fontSize: 64, color: 'rgba(255,255,255,0.8)' }} />
          </div>
        )}
        {/* 顶部信息角标 */}
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between' }}>
          <Tag color="orange" style={{ margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 8, fontSize: 12 }}>
            📂 专辑
          </Tag>
          <Tag style={{ margin: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 12, border: 'none' }}>
            {count} 项
          </Tag>
        </div>
        {/* 右上角 ⋮ 菜单按钮：hover 时半透明背景，便于在不离开封面时操作 */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 10, right: 10,
            opacity: hovered ? 1 : 0.85, transition: 'opacity 0.2s',
            transform: hovered ? 'translateY(40px)' : 'none',
          }}
        >
          <Dropdown
            menu={{ items: cardMenuItems, onClick: onMenuClick }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button
              shape="circle"
              size="small"
              icon={<MoreOutlined style={{ fontSize: 18 }} />}
              style={{ background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff' }}
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
    </div>
  )
}

/**
 * 媒体海报卡片：竖向布局，封面 + 标题 + 可选进度条。
 */
function MediaCard({
  item, showProgress, onClick,
}: {
  item: MediaListItem
  showProgress: boolean
  onClick: () => void
}) {
  const m = item.media
  const progress = m.duration > 0 && item.last_position > 0
    ? Math.min(100, (item.last_position / m.duration) * 100)
    : 0
  return (
    <div
      onClick={onClick}
      style={{
        width: CARD_WIDTH, flexShrink: 0, cursor: 'pointer',
        borderRadius: 12, overflow: 'hidden', background: '#fff',
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
 */
function NoteCard({ note, token, onClick }: { note: StudyNote; token: string; onClick: () => void }) {
  const hasImg = note.images && note.images.length > 0
  return (
    <div
      onClick={onClick}
      style={{
        width: CARD_WIDTH, flexShrink: 0, cursor: 'pointer',
        borderRadius: 12, overflow: 'hidden', background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'transform 0.2s, box-shadow 0.2s',
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
