import { useEffect, useState } from 'react'
import { VideoCameraOutlined, AudioOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import type { MediaFile } from '@/types'

interface MediaCoverProps {
  media: MediaFile
  /**
   * 显式高度（像素）。未传时使用 `aspectRatio: 2/3` 响应式容器，
   * 宽度由父容器决定，确保不同设备比例一致。
   * 传值时退化为固定高度（用于特殊场景如小缩略图列表）。
   */
  height?: number
  /** 浅色背景的着色 key。默认用 media.id，传入专辑名时同一专辑所有卡片颜色一致。 */
  colorKey?: string | number
  /**
   * 动物森友会 13 色 polka-dot pattern 名称（v0.7.0 起）。
   * 可选值：pink / purple / blue / yellow / orange / teal / green / red / lime / yellow-green / brown / peach
   * 传值时优先使用 polka-dot 背景；未传时回退到 pastelColor 自动着色。
   */
  pattern?: string
  /**
   * 圆角变体：default=20px（AC 风卡片）；square=8px；pill=999px。
   * 默认 default。
   */
  radius?: 'default' | 'square' | 'pill'
}

/**
 * 媒体封面组件（v0.7.0 动物森友会风）。
 *
 * 行为：
 * - 有同名图片（cover_path）时直接显示该图片；
 * - 视频无封面图时通过 <video preload="metadata"> 显示首帧；
 * - 音频无封面图时用图标占位（动物森友会风大圆角图标 + 主题色）。
 * - 无封面时使用基于 colorKey（默认 media.id）生成的浅色背景；
 *   或使用 `pattern` 指定的 13 色 polka-dot 点阵背景。
 *
 * 响应式：
 * - 默认使用 `aspect-ratio: 2/3` 容器，宽度由父容器决定，
 *   配合 `objectFit: cover` 保证图片比例正确，避免拉伸或留白。
 * - 显式传入 `height` 时退化为固定高度（兼容缩略图等场景）。
 */
export default function MediaCover({
  media,
  height,
  colorKey,
  pattern,
  radius = 'default',
}: MediaCoverProps) {
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

  // 圆角：default=20px（AC 风卡片），square=8px（缩略图），pill=999px（异形装饰）
  const radiusValue =
    radius === 'square' ? '8px' : radius === 'pill' ? '999px' : 'var(--radius-lg)'

  // 容器样式：传 height 时固定高度；否则用 aspectRatio
  const containerStyle: React.CSSProperties = {
    background: hasImageCover || showVideoFrame ? 'transparent' : pattern ? undefined : bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    borderRadius: radiusValue,
  }
  if (height != null) {
    containerStyle.height = height
  } else {
    containerStyle.aspectRatio = '2 / 3'
  }

  // 优先使用 polka-dot pattern 容器
  const className = pattern ? `ac-card ac-pattern-${pattern}` : ''

  return (
    <div style={containerStyle} className={className}>
      {hasImageCover ? (
        <img
          src={mediaApi.coverUrl(media.id, token)}
          alt={media.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: radiusValue,
          }}
          onError={() => setImgError(true)}
        />
      ) : showVideoFrame ? (
        <video
          src={mediaApi.streamUrl(media.id, token)}
          preload="metadata"
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: radiusValue,
          }}
          onError={() => setVideoError(true)}
        />
      ) : (
        <>
          {/* 浅色背景上的图标，用主题色 + 较大尺寸（AC 风装饰感） */}
          {media.type === 'video' ? (
            <VideoCameraOutlined
              style={{
                fontSize: 56,
                color: 'var(--ac-text-primary, #725d42)',
                opacity: 0.5,
              }}
            />
          ) : (
            <AudioOutlined
              style={{
                fontSize: 56,
                color: 'var(--ac-text-primary, #725d42)',
                opacity: 0.5,
              }}
            />
          )}
        </>
      )}
    </div>
  )
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
