import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spin, Button, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import type { MediaFile, Sentence, MediaListItem } from '@/types'
import MediaPlayer from '@/components/MediaPlayer'

const { Title } = Typography

export default function Player() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [media, setMedia] = useState<MediaFile | null>(null)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [record, setRecord] = useState<MediaListItem | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      try {
        const [mediaRes, subRes] = await Promise.all([
          mediaApi.get(Number(id)),
          mediaApi.subtitle(Number(id)).catch(() => null),
        ])
        const d = mediaRes.data.data as { media: MediaFile; play_count: number; last_position: number; last_played_at: string }
        setMedia(d.media)
        setRecord({ media: d.media, play_count: d.play_count, last_position: d.last_position, last_played_at: d.last_played_at })
        if (subRes) {
          setSentences(subRes.data.data.sentences ?? [])
        }
      } catch (err: unknown) {
        message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '加载失败')
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, navigate])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  if (!media) {
    return null
  }

  return (
    <div>
      {/* 顶部：返回按钮在标题左侧 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} title="返回" />
        <Title level={4} style={{ marginBottom: 0, marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {media.name}
        </Title>
      </div>
      <MediaPlayer
        mediaId={media.id}
        mediaType={media.type}
        initialPosition={record?.last_position ?? 0}
        sentences={sentences}
        playCount={record?.play_count ?? 0}
      />
    </div>
  )
}
