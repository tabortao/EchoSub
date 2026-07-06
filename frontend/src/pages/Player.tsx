import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Spin, Button, Typography, message, Tooltip, Space } from 'antd'
import { ArrowLeftOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import type { MediaFile, Sentence, MediaListItem, MediaListResponse, MediaDetailResponse, PairedMedia } from '@/types'
import MediaPlayer from '@/components/MediaPlayer'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import { useAuthStore } from '@/store/auth'

const { Title, Text } = Typography

/**
 * 构造媒体封面 URL（v0.9.2：用于 Media Session 锁屏卡片）。
 * - media.cover_path 为 null/空：返回 null（锁屏卡片不显示封面）
 * - 否则走 `/api/v1/media/:id/cover?token=` 端点；后端按媒体 id 查找封面
 *   相对路径，调用方无需关心绝对路径或文件存在性
 */
function buildCoverUrl(mediaId: number, hasCover: boolean, token: string): string | null {
  if (!hasCover) return null
  return mediaApi.coverUrl(mediaId, token)
}

/**
 * 播放器页面：加载单个媒体 + 字幕，并提供同专辑内上一个/下一个切换。
 * 切换按钮基于当前媒体所在专辑的媒体列表（按存入时间排序）计算相邻项。
 * 若当前媒体存在同目录同基名的另一种类型配对（如 a.mp4 ↔ a.mp3），
 * 会将配对项传给 MediaPlayer，渲染时在播放器内提供视频/音频切换 tab。
 *
 * URL 参数：
 *   ?position=X  — 覆盖数据库中的 last_position，强制从 X 秒处开始播放。
 *                   典型用法：首页「继续观看」卡片点击进入时为 0 强制重看，
 *                   或者分享带进度的链接。
 *                   不带时，沿用数据库中保存的 last_position（默认行为）。
 */
export default function Player() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [media, setMedia] = useState<MediaFile | null>(null)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [record, setRecord] = useState<MediaListItem | null>(null)
  const [pairedMedia, setPairedMedia] = useState<PairedMedia | null>(null)
  const [siblingIds, setSiblingIds] = useState<{ prev?: number; next?: number }>({})
  const { isPhone } = useDeviceSize()
  // v0.9.2: 读取 token 用于构造媒体封面 URL（Media Session 锁屏卡片）
  const token = useAuthStore((s) => s.token)

  // 解析 ?position=X 覆盖：负数/NaN 当作 0
  const positionOverride = (() => {
    const raw = searchParams.get('position')
    if (raw == null) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  })()

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      try {
        const [mediaRes, subRes] = await Promise.all([
          mediaApi.get(Number(id)),
          mediaApi.subtitle(Number(id)).catch(() => null),
        ])
        const d = mediaRes.data.data as MediaDetailResponse
        setMedia(d.media)
        setPairedMedia(d.paired_media ?? null)
        setRecord({
          media: d.media,
          play_count: d.play_count,
          last_position: d.last_position,
          last_played_at: d.last_played_at,
        })
        if (subRes) {
          setSentences(subRes.data.data.sentences ?? [])
        }
        // 拉取同专辑媒体列表，计算上一个/下一个
        await loadSiblings(d.media)
      } catch (err: unknown) {
        message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '加载失败')
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate])

  // 加载同专辑的媒体列表，找出当前媒体的前后相邻项
  const loadSiblings = async (m: MediaFile) => {
    if (!m.album) {
      setSiblingIds({})
      return
    }
    try {
      const res = await mediaApi.list({
        album: m.album,
        sub_album: m.sub_album ?? undefined,
        sort: 'file_modified_at',
        order: 'asc',
        page: 1,
        size: 200,
      })
      const list = (res.data.data as MediaListResponse).list ?? []
      const ids = list.map((item) => item.media.id)
      const idx = ids.indexOf(m.id)
      setSiblingIds({
        prev: idx > 0 ? ids[idx - 1] : undefined,
        next: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : undefined,
      })
    } catch {
      setSiblingIds({})
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  if (!media) {
    return null
  }

  const goTo = (targetId: number | undefined) => {
    if (targetId) navigate(`/play/${targetId}`, { replace: true })
  }

  return (
    <div>
      {/* 顶部：返回 + 标题 + 上一个/下一个切换（v0.6.0 移动端触控 44px + 单行省略） */}
      <div style={{
        display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8,
        flexWrap: isPhone ? 'wrap' : 'nowrap',
      }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          title="返回"
          style={{
            minWidth: 44, minHeight: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        />
        <Title
          level={4}
          style={{
            marginBottom: 0,
            marginRight: 'auto',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0, // 关键：flex 子项 min-width 默认 auto 会撑爆父容器
            color: 'var(--color-text-primary, #1a1a1a)',
            fontSize: isPhone ? 16 : 20,
            flex: 1,
            lineHeight: 1.4,
          }}
        >
          {media.name}
        </Title>
        {/* 同专辑内切换上一个/下一个学习内容 —— 触控 44px */}
        {(siblingIds.prev || siblingIds.next) && (
          <Space size={4} style={{ flexShrink: 0 }}>
            <Tooltip title={siblingIds.prev ? '上一个' : '已是第一个'}>
              <Button
                type="text"
                icon={<StepBackwardOutlined />}
                disabled={!siblingIds.prev}
                onClick={() => goTo(siblingIds.prev)}
                style={{
                  minWidth: 44, minHeight: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              />
            </Tooltip>
            <Tooltip title={siblingIds.next ? '下一个' : '已是最后一个'}>
              <Button
                type="text"
                icon={<StepForwardOutlined />}
                disabled={!siblingIds.next}
                onClick={() => goTo(siblingIds.next)}
                style={{
                  minWidth: 44, minHeight: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              />
            </Tooltip>
          </Space>
        )}
      </div>
      {/* 副信息：手机端单行 + 桌面端可选附加（专辑名 / 时长） */}
      {(media.album || media.duration) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 12, paddingLeft: 4, flexWrap: 'wrap',
        }}>
          {media.album && (
            <Text type="secondary" style={{ fontSize: isPhone ? 12 : 13 }}>
              📂 {media.album}{media.sub_album ? ` / ${media.sub_album}` : ''}
            </Text>
          )}
        </div>
      )}
      <MediaPlayer
        mediaId={media.id}
        mediaType={media.type}
        pairedMedia={pairedMedia}
        initialPosition={positionOverride ?? record?.last_position ?? 0}
        sentences={sentences}
        playCount={record?.play_count ?? 0}
        // v0.9.2: 把媒体元数据传给播放器，供 Media Session 锁屏卡片使用
        mediaName={media.name}
        mediaAlbum={[media.album, media.sub_album].filter(Boolean).join(' / ') || undefined}
        mediaCoverUrl={buildCoverUrl(media.id, !!media.cover_path, token ?? '')}
      />
    </div>
  )
}
