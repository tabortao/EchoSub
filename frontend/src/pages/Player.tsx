import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spin, Button, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import type { MediaFile, Sentence, MediaListItem } from '@/types'
import MediaPlayer from '@/components/MediaPlayer'
import { formatDuration } from '@/utils'

const { Title, Text } = Typography

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
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        style={{ marginBottom: 12 }}
      >
        返回
      </Button>
      <Title level={4} style={{ marginBottom: 4 }}>{media.name}</Title>
      <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        {media.album ? `${media.album} · ` : ''}{formatDuration(media.duration)}
        {record && record.play_count > 0 ? ` · 已听 ${record.play_count} 次` : ''}
      </Text>
      <MediaPlayer
        mediaId={media.id}
        mediaType={media.type}
        initialPosition={record?.last_position ?? 0}
        sentences={sentences}
      />
    </div>
  )
}
