import { useEffect, useState } from 'react'
import { VideoCameraOutlined, AudioOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import type { MediaFile } from '@/types'

interface MediaCoverProps {
  media: MediaFile
  height?: number
  /** 浅色背景的着色 key。默认用 media.id，传入专辑名时同一专辑所有卡片颜色一致。 */
  colorKey?: string | number
}

/**
 * 基于字符串生成确定性的浅色 HSL 背景。
 * 浅色 = 高亮度(80~92%)、中等饱和度(45~65%)，保证文字/图标清晰可读。
 * 同一个 key 永远得到同一种颜色，避免每次渲染跳变。
 */
function pastelColor(key: string | number): string {
  const seed = String(key)
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  const sat = 45 + (hash % 21) // 45~65
  const light = 80 + ((hash >> 4) % 13) // 80~92
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

// MediaCover 渲染媒体封面：
// - 有同名图片（cover_path）时直接显示该图片；
// - 视频无封面图时通过 <video preload="metadata"> 显示首帧；
// - 音频无封面图时用图标占位。
// 无封面时使用基于 colorKey（默认 media.id）生成的浅色背景，视觉上区分不同媒体且不刺眼。
export default function MediaCover({ media, height = 140, colorKey }: MediaCoverProps) {
  const token = useAuthStore((s) => s.token) ?? ''
  const [imgError, setImgError] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // 媒体切换时重置错误状态，避免上一个媒体的失败状态影响下一个
  useEffect(() => {
    setImgError(false)
    setVideoError(false)
  }, [media.id])

  const hasImageCover = !!media.cover_path && !imgError
  const showVideoFrame = media.type === 'video' && !videoError && !hasImageCover
  const bg = pastelColor(colorKey ?? media.id)

  return (
    <div
      style={{
        height,
        background: hasImageCover || showVideoFrame ? '#f0f2f5' : bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {hasImageCover ? (
        <img
          src={mediaApi.coverUrl(media.id, token)}
          alt={media.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
        />
      ) : showVideoFrame ? (
        <video
          src={mediaApi.streamUrl(media.id, token)}
          preload="metadata"
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setVideoError(true)}
        />
      ) : (
        <>
          {/* 浅色背景上的图标，用主题色而非灰色更醒目 */}
          {media.type === 'video' ? (
            <VideoCameraOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          ) : (
            <AudioOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          )}
        </>
      )}
    </div>
  )
}
