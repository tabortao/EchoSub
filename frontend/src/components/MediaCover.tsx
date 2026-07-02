import { useEffect, useState } from 'react'
import { VideoCameraOutlined, AudioOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import type { MediaFile } from '@/types'

interface MediaCoverProps {
  media: MediaFile
  height?: number
}

// MediaCover 渲染媒体封面：
// - 有同名图片（cover_path）时直接显示该图片；
// - 视频无封面图时通过 <video preload="metadata"> 显示首帧；
// - 音频无封面图时用图标占位。
export default function MediaCover({ media, height = 140 }: MediaCoverProps) {
  const token = useAuthStore((s) => s.token) ?? ''
  const [imgError, setImgError] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // 媒体切换时重置错误状态，避免上一个媒体的失败状态影响下一个
  useEffect(() => {
    setImgError(false)
    setVideoError(false)
  }, [media.id])

  const hasImageCover = !!media.cover_path && !imgError

  return (
    <div
      style={{
        height,
        background: '#f0f2f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {hasImageCover ? (
        <img
          src={mediaApi.coverUrl(media.id, token)}
          alt={media.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
        />
      ) : media.type === 'video' && !videoError ? (
        <video
          src={mediaApi.streamUrl(media.id, token)}
          preload="metadata"
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setVideoError(true)}
        />
      ) : (
        <AudioOutlined style={{ fontSize: 48, color: '#999' }} />
      )}
      {/* 兜底图标用于视频加载失败时 */}
      {media.type === 'video' && videoError && !hasImageCover && (
        <VideoCameraOutlined style={{ fontSize: 48, color: '#999', position: 'absolute' }} />
      )}
    </div>
  )
}
