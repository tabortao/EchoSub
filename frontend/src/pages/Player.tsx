import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spin, Button, Typography, message, Tooltip } from 'antd'
import { ArrowLeftOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import type { MediaFile, Sentence, MediaListItem, MediaListResponse, MediaDetailResponse, PairedMedia } from '@/types'
import MediaPlayer from '@/components/MediaPlayer'

const { Title } = Typography

/**
 * 播放器页面：加载单个媒体 + 字幕，并提供同专辑内上一个/下一个切换。
 * 切换按钮基于当前媒体所在专辑的媒体列表（按存入时间排序）计算相邻项。
 * 若当前媒体存在同目录同基名的另一种类型配对（如 a.mp4 ↔ a.mp3），
 * 会将配对项传给 MediaPlayer，渲染时在播放器内提供视频/音频切换 tab。
 */
export default function Player() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [media, setMedia] = useState<MediaFile | null>(null)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [record, setRecord] = useState<MediaListItem | null>(null)
  const [pairedMedia, setPairedMedia] = useState<PairedMedia | null>(null)
  const [siblingIds, setSiblingIds] = useState<{ prev?: number; next?: number }>({})

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
      {/* 顶部：返回 + 标题 + 上一个/下一个切换 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} title="返回" />
        <Title level={4} style={{ marginBottom: 0, marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {media.name}
        </Title>
        {/* 同专辑内切换上一个/下一个学习内容 */}
        {(siblingIds.prev || siblingIds.next) && (
          <>
            <Tooltip title={siblingIds.prev ? '上一个' : '已是第一个'}>
              <Button
                type="text"
                icon={<StepBackwardOutlined />}
                disabled={!siblingIds.prev}
                onClick={() => goTo(siblingIds.prev)}
              />
            </Tooltip>
            <Tooltip title={siblingIds.next ? '下一个' : '已是最后一个'}>
              <Button
                type="text"
                icon={<StepForwardOutlined />}
                disabled={!siblingIds.next}
                onClick={() => goTo(siblingIds.next)}
              />
            </Tooltip>
          </>
        )}
      </div>
      <MediaPlayer
        mediaId={media.id}
        mediaType={media.type}
        pairedMedia={pairedMedia}
        initialPosition={record?.last_position ?? 0}
        sentences={sentences}
        playCount={record?.play_count ?? 0}
      />
    </div>
  )
}
