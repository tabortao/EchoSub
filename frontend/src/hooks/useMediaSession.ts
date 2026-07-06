/**
 * Media Session + Wake Lock 集成（v0.9.2 起）
 *
 * 目标：让手机息屏 / 切后台后音频继续播放，并在锁屏控制中心 / 通知中心
 *       显示媒体信息（标题 / 专辑 / 封面）与播放控制按钮。
 *
 * 两件事：
 *  1) Media Session API（`navigator.mediaSession`）— 设置元数据 + 响应系统级控制
 *     - 浏览器/iOS Safari 锁屏卡片、macOS Now Playing、Windows SMTC、Android MediaStyle
 *     - 所有 action handler 都通过回调传入；本 hook 不持有任何 UI 状态
 *  2) Wake Lock API（`navigator.wakeLock.request('screen')`）— 保持屏幕不锁
 *     - 注意：仅阻止屏幕变暗，**不会阻止系统层媒体中断**。真正能否后台播
 *       放取决于浏览器策略（iOS Safari 限制较严，但 PWA standalone 模式更宽松）
 *     - 仅在 HTTPS / localhost 下可用
 *
 * 用法：
 *   useMediaSession({
 *     metadata: { title, artist, album, artwork: [{ src, sizes, type }] },
 *     playbackState: 'playing' | 'paused' | 'none',
 *     onPlay, onPause, onSeek, onPrevious, onNext,
 *   })
 *
 * 设计要点：
 *  - 全部 effect 都在组件卸载时清理（release WakeLock、clear action handlers）
 *  - `playbackState` 变化时同步更新 `mediaSession.playbackState`
 *  - 不做 navigator.userAgent 嗅探；按 W3C spec 走，调用前判断 `in` 即可
 */
import { useEffect, useRef } from 'react'

/** MediaSession 元数据（精简版，仅用得到字段） */
export interface MediaSessionMetadataInput {
  title?: string
  artist?: string
  album?: string
  /** 封面图列表，按尺寸排序。绝对 URL 或 dataURL。 */
  artwork?: Array<{ src: string; sizes?: string; type?: string }>
}

/** MediaSession 播放状态 */
export type MediaSessionPlaybackState = 'playing' | 'paused' | 'none'

/** 用户在系统控制中心点击按钮时的回调 */
export interface MediaSessionHandlers {
  onPlay?: () => void
  onPause?: () => void
  onSeek?: (to: number) => void
  onPrevious?: () => void
  onNext?: () => void
}

export interface UseMediaSessionOptions {
  metadata?: MediaSessionMetadataInput | null
  playbackState?: MediaSessionPlaybackState
  /** 自定义位置（秒），更新进度条；不传则不更新 position state */
  position?: { duration: number; currentTime: number; playbackRate?: number }
  handlers?: MediaSessionHandlers
}

/** 浏览器是否支持 Wake Lock API（带类型守卫） */
function supportsWakeLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/** 浏览器是否支持 Media Session API（带类型守卫） */
function supportsMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

export function useMediaSession(opts: UseMediaSessionOptions): void {
  const { metadata, playbackState = 'none', position, handlers } = opts

  // 用 ref 持有 handlers，避免 handler 引用变化时反复 setActionHandler
  const handlersRef = useRef<MediaSessionHandlers | undefined>(handlers)
  handlersRef.current = handlers

  // 持有当前 WakeLock sentinel，用于 release
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // 1) 元数据 + playbackState 同步
  useEffect(() => {
    if (!supportsMediaSession()) return
    if (metadata) {
      try {
        // MediaImage[] 字段名是 src/sizes/type；TS 标准库已定义 MediaImage
        const ms = navigator.mediaSession
        ms.metadata = new MediaMetadata({
          title: metadata.title ?? '',
          artist: metadata.artist ?? '',
          album: metadata.album ?? '',
          artwork: metadata.artwork ?? [],
        })
      } catch (err) {
        // 一些旧浏览器构造 MediaMetadata 会失败，回退到属性赋值
        try {
          const ms = navigator.mediaSession
          ms.metadata = {
            title: metadata.title ?? '',
            artist: metadata.artist ?? '',
            album: metadata.album ?? '',
            artwork: metadata.artwork ?? [],
          } as MediaMetadata
        } catch {
          // 静默忽略
          void err
        }
      }
    } else {
      navigator.mediaSession.metadata = null
    }
  }, [metadata?.title, metadata?.artist, metadata?.album, metadata?.artwork])

  useEffect(() => {
    if (!supportsMediaSession()) return
    try {
      navigator.mediaSession.playbackState = playbackState
    } catch {
      // 静默忽略
    }
  }, [playbackState])

  // 2) 进度（更新锁屏进度条 / scrubber）
  useEffect(() => {
    if (!supportsMediaSession()) return
    if (!position) return
    if (!Number.isFinite(position.duration) || position.duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: position.duration,
        position: Math.max(0, Math.min(position.currentTime, position.duration)),
        playbackRate: position.playbackRate ?? 1,
      })
    } catch {
      // 部分浏览器在 duration 异常时抛错，忽略
    }
  }, [position?.duration, position?.currentTime, position?.playbackRate])

  // 3) Action handlers（play / pause / prev / next / seek）
  useEffect(() => {
    if (!supportsMediaSession()) return
    const ms = navigator.mediaSession

    const setHandler = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, fn)
      } catch {
        // 某些 action 在某些浏览器不支持，忽略
      }
    }

    setHandler('play', handlersRef.current?.onPlay ? () => handlersRef.current?.onPlay?.() : null)
    setHandler('pause', handlersRef.current?.onPause ? () => handlersRef.current?.onPause?.() : null)
    setHandler('seekbackward', handlersRef.current?.onSeek ? (details) => {
      // details.seekOffset 默认 10s
      const off = details.seekOffset ?? 10
      const el = getMediaElement()
      if (el) handlersRef.current?.onSeek?.(Math.max(0, el.currentTime - off))
    } : null)
    setHandler('seekforward', handlersRef.current?.onSeek ? (details) => {
      const off = details.seekOffset ?? 10
      const el = getMediaElement()
      if (el) handlersRef.current?.onSeek?.(Math.min(el.duration || 0, el.currentTime + off))
    } : null)
    setHandler('seekto', handlersRef.current?.onSeek ? (details) => {
      if (details.fastSeek && 'fastSeek' in (getMediaElement() ?? {})) {
        // 标准支持 fastSeek
      }
      if (typeof details.seekTime === 'number') {
        handlersRef.current?.onSeek?.(details.seekTime)
      }
    } : null)
    setHandler('previoustrack', handlersRef.current?.onPrevious ? () => handlersRef.current?.onPrevious?.() : null)
    setHandler('nexttrack', handlersRef.current?.onNext ? () => handlersRef.current?.onNext?.() : null)

    return () => {
      // 组件卸载 / handlers 变化时清空（避免引用已卸载的组件方法）
      setHandler('play', null)
      setHandler('pause', null)
      setHandler('seekbackward', null)
      setHandler('seekforward', null)
      setHandler('seekto', null)
      setHandler('previoustrack', null)
      setHandler('nexttrack', null)
    }
  }, [handlers?.onPlay, handlers?.onPause, handlers?.onSeek, handlers?.onPrevious, handlers?.onNext])

  // 4) Wake Lock：playbackState === 'playing' 时申请，pause / none 时释放
  useEffect(() => {
    let cancelled = false

    const acquire = async () => {
      if (!supportsWakeLock()) return
      if (wakeLockRef.current) return // 已持有
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          // 申请过程中组件卸载，立刻 release
          try { await sentinel.release() } catch { /* ignore */ }
          return
        }
        wakeLockRef.current = sentinel
        // 系统层自动 release（切后台 / 关屏）后会触发 release 事件，置空以便下次重新申请
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null
        })
      } catch {
        // 权限被拒 / 不支持 / 文档未可见，忽略
      }
    }

    const release = async () => {
      const sentinel = wakeLockRef.current
      if (!sentinel) return
      try {
        await sentinel.release()
      } catch {
        // ignore
      }
      wakeLockRef.current = null
    }

    if (playbackState === 'playing') {
      void acquire()
    } else {
      void release()
    }

    return () => {
      cancelled = true
      void release()
    }
  }, [playbackState])

  // 5) 切回前台时若仍在播放，重新申请 Wake Lock（系统层 release 后不会自动续期）
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && playbackState === 'playing' && !wakeLockRef.current) {
        // 触发 wake lock 申请：复用上面 effect 逻辑不可行（小副作用），直接调用
        if (supportsWakeLock()) {
          void navigator.wakeLock.request('screen').then((s) => {
            if (wakeLockRef.current) return
            wakeLockRef.current = s
            s.addEventListener('release', () => {
              if (wakeLockRef.current === s) wakeLockRef.current = null
            })
          }).catch(() => { /* ignore */ })
        }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [playbackState])
}

/**
 * 找到当前页面上正在播放的媒体元素（video / audio）。
 * 用 [data-echosub-media] 标记，方便 action handler 找到它。
 */
function getMediaElement(): HTMLMediaElement | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector<HTMLMediaElement>('[data-echosub-media]')
  return el
}

/** 标记播放器中的 media 元素，供 useMediaSession 的 seek handler 找到。 */
export const MEDIA_ELEMENT_MARK_ATTR = 'data-echosub-media'
