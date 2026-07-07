import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Slider, Button, Space, InputNumber, Switch, Tag, Tooltip, message, Typography, Tabs } from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  OrderedListOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  EyeInvisibleOutlined,
  StarOutlined,
  StarFilled,
  MinusOutlined,
  PlusOutlined,
  FileTextOutlined,
  EditOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { mediaApi, recordApi } from '@/api'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import type { Sentence, PairedMedia, MediaType } from '@/types'
import { formatDuration } from '@/utils'
import MarkdownEditor from '@/components/MarkdownEditor'
import SubtitleEditor from '@/components/SubtitleEditor'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import { useMediaSession, MEDIA_ELEMENT_MARK_ATTR } from '@/hooks/useMediaSession'

const { Text } = Typography

interface MediaPlayerProps {
  mediaId: number
  mediaType: MediaType
  /**
   * 同目录同基名的配对媒体（如 a.mp4 ↔ a.mp3）。若存在，播放器顶部展示
   * 视频/音频切换 tab，切换时只换 streamUrl 与媒体元素，媒体 id、字幕、播放记录
   * 仍以主媒体（视频优先）为准。
   */
  pairedMedia?: PairedMedia | null
  initialPosition: number
  sentences: Sentence[]
  playCount: number
  /**
   * 媒体名（v0.9.2 起：用于 Media Session 锁屏卡片标题）。
   * 未传时回退到 `medias/${id}` 占位。
   */
  mediaName?: string
  /** 所属专辑（含子专辑），用于 Media Session album 字段，可选 */
  mediaAlbum?: string
  /**
   * 媒体封面相对路径（v0.9.2 起：用于 Media Session 锁屏封面）。
   * 由调用方负责拼接 base URL（如 token 鉴权需要）。
   */
  mediaCoverUrl?: string | null
}

type PlayMode = 'normal' | 'repeat'

// 将字幕文字中的非空白字符替换为 *，用于背诵遮挡模式
function maskText(text: string): string {
  return text.replace(/[^\s]/g, '*')
}

// 速度上下限
const RATE_MIN = 0.5
const RATE_MAX = 2.0
const RATE_STEP = 0.1

export default function MediaPlayer({ mediaId, mediaType, pairedMedia, initialPosition, sentences, playCount, mediaName, mediaAlbum, mediaCoverUrl }: MediaPlayerProps) {
  const navigate = useNavigate()
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const subtitleListRef = useRef<HTMLDivElement>(null)
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([])
  const { loop_count, sentence_repeat, pause_seconds } = useSettingsStore()
  const token = useAuthStore((s) => s.token)
  const { isPhone } = useDeviceSize()

  // 本地字幕状态（用于乐观更新听遍数，与 prop 同步）
  const [localSentences, setLocalSentences] = useState<Sentence[]>(sentences)
  useEffect(() => { setLocalSentences(sentences) }, [sentences])

  // v1.3.8：把 hasSubtitle 派生提前到 line 99 之前。
  //   原来 hasSubtitle 在 line 653 声明（函数体靠后），line 99 的 useState 引用时
  //   TypeScript 会报"used before declaration"（const 在 TDZ 之外，hoist 不允许）。
  //   派生非常轻量（line 653 那行只有 1 表达式），重复定义一处不影响性能。
  const hasSubtitleEarly = localSentences.length > 0

  // UI 状态
  // v1.2.0：默认开启逐句复读（Echo Loop 模式）。这是 Echo Loop 参考实现的核心行为：
  //   - 每句重复 N 次（sentence_repeat）
  //   - 句末停顿 K 秒（pause_seconds）
  //   - 整体循环 M 次（loop_count）
  // 用户可手动关闭「逐句复读」开关回到普通播放模式。
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  // v1.3.8：无字幕时强制初始 mode='normal'（Echo Loop 不可用）。
  //   v1.3.7 之前无字幕时 mode 仍默认为 'repeat'，只是被 onModeChange 检测后强制回退，
  //   但首次渲染时 UI 会闪一下「Echo Loop 复读中」徽标（line 686-688 的 warning tag 会短暂显示）。
  //   现在初始化时就分流：无字幕 → 'normal'，有字幕 → 'repeat'（保留默认学习行为）。
  //   引用 line 89 的 hasSubtitleEarly（line 653 的 hasSubtitle 太晚，TDZ 会报错）。
  const [mode, setMode] = useState<PlayMode>(hasSubtitleEarly ? 'repeat' : 'normal')
  const [loopCount, setLoopCount] = useState(loop_count || 3)
  const [sentenceRepeat, setSentenceRepeat] = useState(sentence_repeat || 3)
  const [pauseSeconds, setPauseSeconds] = useState(pause_seconds ?? 1.5)
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(-1)
  const [repeatCount, setRepeatCount] = useState(0) // 当前句已重复次数
  const [maskMode, setMaskMode] = useState(false) // 字幕遮挡模式（背诵用）
  const [revealed, setRevealed] = useState<Set<number>>(new Set()) // 逐句揭示集合
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [favoriteSet, setFavoriteSet] = useState<Set<number>>(new Set()) // 收藏的句子 index 集合
  const [favoritePlayMode, setFavoritePlayMode] = useState(false) // 仅播放收藏句子模式
  // 文件备注：默认预览态；切换媒体时从后端拉取
  const [remark, setRemark] = useState('')
  const [remarkLoaded, setRemarkLoaded] = useState(false)
  // 当前正在播放的媒体类型与 id：有配对时支持手动切换 video↔audio
  const [activeType, setActiveType] = useState<MediaType>(mediaType)
  // 字幕编辑模式：true 时"全文" tab 显示 SubtitleEditor（v0.8.0）
  const [editing, setEditing] = useState(false)
  // 切换 tab 时记录上一个进度，待新元素 ready 后回放
  const pendingSeekRef = useRef<number | null>(null)

  // 可变状态（不触发渲染）
  const handlingEndRef = useRef(false)
  const sentenceRepeatRef = useRef(0)
  const overallLoopRef = useRef(0)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveRef = useRef(0)
  const modeRef = useRef<PlayMode>('normal')
  const sentenceRepeatTargetRef = useRef(3)
  const pauseSecondsRef = useRef(1.5)
  const loopCountRef = useRef(1)
  const sentencesRef = useRef<Sentence[]>(sentences)
  const currentSentenceIdxRef = useRef(-1)
  const favoritePlayModeRef = useRef(false)
  const favoriteSetRef = useRef<Set<number>>(new Set())

  // 同步 ref
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { sentenceRepeatTargetRef.current = sentenceRepeat }, [sentenceRepeat])
  useEffect(() => { pauseSecondsRef.current = pauseSeconds }, [pauseSeconds])
  useEffect(() => { loopCountRef.current = loopCount }, [loopCount])
  useEffect(() => { sentencesRef.current = localSentences }, [localSentences])
  useEffect(() => { currentSentenceIdxRef.current = currentSentenceIdx }, [currentSentenceIdx])
  useEffect(() => { favoritePlayModeRef.current = favoritePlayMode }, [favoritePlayMode])
  useEffect(() => { favoriteSetRef.current = favoriteSet }, [favoriteSet])

  // 从 sentences 初始化收藏集合
  useEffect(() => {
    const fav = new Set<number>()
    sentences.forEach((s) => {
      if (s.favorited) fav.add(s.index)
    })
    setFavoriteSet(fav)
  }, [sentences])

  // 切换媒体时加载文件备注
  useEffect(() => {
    setRemark('')
    setRemarkLoaded(false)
    let cancelled = false
    mediaApi.getRemark(mediaId)
      .then((res) => {
        if (cancelled) return
        setRemark(res.data.data?.content ?? '')
      })
      .catch(() => {
        if (cancelled) return
        setRemark('')
      })
      .finally(() => { if (!cancelled) setRemarkLoaded(true) })
    return () => { cancelled = true }
  }, [mediaId])

  // 切换到不同媒体时，重置 activeType 为该媒体默认类型
  useEffect(() => {
    setActiveType(mediaType)
    setEditing(false) // 切媒体时退出字幕编辑模式
  }, [mediaId, mediaType])

  // 备注失焦保存
  const saveRemark = useCallback(async (next: string) => {
    try {
      await mediaApi.upsertRemark(mediaId, next)
    } catch {
      message.error('备注保存失败')
    }
  }, [mediaId])

  // 字幕自动滚动：当前句始终在可见范围中央
  useEffect(() => {
    if (currentSentenceIdx < 0) return
    const container = subtitleListRef.current
    const el = sentenceRefs.current[currentSentenceIdx]
    if (!container || !el) return
    const targetTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    })
  }, [currentSentenceIdx])

  // 找到当前时间对应的句子索引
  const findSentenceIndex = useCallback((t: number) => {
    const list = sentencesRef.current
    for (let i = 0; i < list.length; i++) {
      if (t >= list[i].start && t < list[i].end) return i
    }
    for (let i = 0; i < list.length; i++) {
      if (t < list[i].start) return i
    }
    return -1
  }, [])

  // 句子听遍数 +1：调用后端 increment API，同时乐观更新本地 state。
  // 触发时机：自然推进越过句末（normal 模式句子切换 / repeat 模式每播放到句末）。
  const incrementSentenceRepeat = useCallback((idx: number) => {
    if (idx < 0 || idx >= sentencesRef.current.length) return
    const s = sentencesRef.current[idx]
    // 乐观更新本地 state（同时同步 ref，避免节流期间多次触发计数漂移）
    setLocalSentences((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, repeat_count: it.repeat_count + 1 } : it))
      sentencesRef.current = next
      return next
    })
    recordApi.incrementRepeat(mediaId, s.index).catch(() => {})
  }, [mediaId])

  // 标记句子完成（仅设置 completed=true，不再覆盖 repeat_count；
  // 实际播放遍数由 incrementSentenceRepeat 累加）
  const markSentenceCompleted = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= sentencesRef.current.length) return
    try {
      await recordApi.updateSentence(mediaId, idx, true)
    } catch {
      // 忽略
    }
  }, [mediaId])

  // 保存播放位置（节流 5s）。
  // - 普通模式 / 句复读模式 / 收藏模式都生效，确保用户从任何模式退出都能留下进度。
  // - 卸载时使用 force=true 绕过节流，保证最后一次播放位置一定落库。
  const savePosition = useCallback((pos: number, opts: { force?: boolean; incrementPlay?: boolean } = {}) => {
    const now = Date.now()
    if (!opts.force && now - lastSaveRef.current < 5000) return
    lastSaveRef.current = now
    recordApi.update(mediaId, pos, opts.incrementPlay ?? false).catch(() => {})
  }, [mediaId])

  // 时间更新处理：核心复读逻辑
  const onTimeUpdate = useCallback(() => {
    const el = mediaRef.current
    if (!el || handlingEndRef.current) return
    const t = el.currentTime
    setCurrentTime(t)

    // 节流保存当前位置：无论在哪个模式（normal / repeat / favorite），5s 内至少落库一次。
    // 这是首页「继续观看」区显示未完成媒体的关键：用户退出时进度不丢。
    savePosition(t)

    // 更新当前句子高亮
    const si = findSentenceIndex(t)
    if (si !== currentSentenceIdxRef.current) {
      const oldIdx = currentSentenceIdxRef.current
      // 自然推进越过上一句结尾 → 该句听遍数 +1
      // （oldIdx >= 0 且 si > oldIdx 或 si === -1 表示播放已越过 oldIdx 的结尾）
      if (oldIdx >= 0 && (si > oldIdx || si === -1 || si < oldIdx)) {
        // 注：si < oldIdx 通常是用户跳转或循环重置，不计入；
        // 这里仅对前进越过 (si > oldIdx) 或播放到末尾 (si === -1) 计数
        if (si > oldIdx || si === -1) {
          incrementSentenceRepeat(oldIdx)
        }
      }
      setCurrentSentenceIdx(si)
    }

    // 逐句复读模式
    if (modeRef.current === 'repeat' && sentencesRef.current.length > 0) {
      const list = sentencesRef.current
      const curIdx = currentSentenceIdxRef.current
      if (curIdx >= 0 && curIdx < list.length) {
        const cur = list[curIdx]
        if (t >= cur.end) {
          handlingEndRef.current = true
          sentenceRepeatRef.current += 1
          setRepeatCount(sentenceRepeatRef.current)
          // 每播放到句末 → 该句听遍数 +1（与 normal 模式统一）
          incrementSentenceRepeat(curIdx)
          // 暂停播放，准备进入句末停顿
          el.pause()
          setPlaying(false)
          if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)

          // 判断下一步动作：继续重复当前句 / 跳到下一句 / 整体循环重置 / 全部结束
          const willRepeatCurrent = sentenceRepeatRef.current < sentenceRepeatTargetRef.current
          const nextIdx = curIdx + 1
          const hasNext = nextIdx < list.length
          const willOverallLoop = !hasNext && overallLoopRef.current + 1 < loopCountRef.current
          const allDone = !willRepeatCurrent && !hasNext && !willOverallLoop

          if (allDone) {
            // 全部完成，无需停顿，直接保存进度结束
            // 修复：最后一遍重复也需要计数 repeat_count
            incrementSentenceRepeat(curIdx)
            markSentenceCompleted(curIdx)
            savePosition(t, { force: true, incrementPlay: true })
            handlingEndRef.current = false
            return
          }

          // 句末停顿 n 秒后再继续
          pauseTimerRef.current = setTimeout(() => {
            if (willRepeatCurrent) {
              // 重复当前句：重置到句首继续播放
              el.currentTime = cur.start
              el.play().then(() => setPlaying(true)).catch(() => {})
            } else {
              // 当前句已听完，标记完成
              markSentenceCompleted(curIdx)
              sentenceRepeatRef.current = 0
              setRepeatCount(0)

              // 收藏播放模式：下一句目标从收藏集合中取
              if (favoritePlayModeRef.current && favoriteSetRef.current.size > 0) {
                const favSorted = Array.from(favoriteSetRef.current).sort((a, b) => a - b)
                const curSenteIdx = list[curIdx].index
                const nextFav = favSorted.find((idx) => idx > curSenteIdx)
                if (nextFav != null) {
                  const nextLocalIdx = list.findIndex((s) => s.index === nextFav)
                  if (nextLocalIdx >= 0) {
                    currentSentenceIdxRef.current = nextLocalIdx
                    setCurrentSentenceIdx(nextLocalIdx)
                    el.currentTime = list[nextLocalIdx].start
                    el.play().then(() => setPlaying(true)).catch(() => {})
                  }
                } else {
                  // 没有更多收藏句 → 整体循环回第一句收藏句，或结束
                  const canLoop = overallLoopRef.current + 1 < loopCountRef.current
                  if (canLoop && favSorted.length > 0) {
                    overallLoopRef.current += 1
                    const firstFav = favSorted[0]
                    const firstLocalIdx = list.findIndex((s) => s.index === firstFav)
                    if (firstLocalIdx >= 0) {
                      currentSentenceIdxRef.current = firstLocalIdx
                      setCurrentSentenceIdx(firstLocalIdx)
                      el.currentTime = list[firstLocalIdx].start
                      el.play().then(() => setPlaying(true)).catch(() => {})
                    }
                  } else {
                    setPlaying(false)
                    savePosition(el.currentTime, { force: true, incrementPlay: true })
                    message.success('收藏句子播放完成')
                  }
                }
              } else if (hasNext) {
                // 普通模式：进入下一句
                currentSentenceIdxRef.current = nextIdx
                setCurrentSentenceIdx(nextIdx)
                el.currentTime = list[nextIdx].start
                el.play().then(() => setPlaying(true)).catch(() => {})
              } else {
                // 整体循环：回到第 0 句
                overallLoopRef.current += 1
                currentSentenceIdxRef.current = 0
                setCurrentSentenceIdx(0)
                el.currentTime = 0
                el.play().then(() => setPlaying(true)).catch(() => {})
              }
            }
            handlingEndRef.current = false
          }, pauseSecondsRef.current * 1000)
        }
      }
    }
  }, [findSentenceIndex, markSentenceCompleted, savePosition, incrementSentenceRepeat])

  // 媒体加载完成：处理初始进度 + video/audio tab 切换时记录的续播点
  const onLoadedMetadata = () => {
    const el = mediaRef.current
    if (!el) return
    setDuration(el.duration)
    if (pendingSeekRef.current != null && pendingSeekRef.current < el.duration) {
      el.currentTime = pendingSeekRef.current
      pendingSeekRef.current = null
    } else if (initialPosition > 0 && initialPosition < el.duration) {
      el.currentTime = initialPosition
    }
  }

  // 手动切换 video ↔ audio tab：在新 src 加载完成后从原进度继续
  const switchMediaType = (next: MediaType) => {
    if (next === activeType) return
    const el = mediaRef.current
    if (el) pendingSeekRef.current = el.currentTime
    setActiveType(next)
    setPlaying(false)
  }

  // 播放/暂停
  const togglePlay = () => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  // 拖动进度
  const onSeek = (value: number) => {
    const el = mediaRef.current
    if (!el) return
    handlingEndRef.current = false
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    el.currentTime = value
    setCurrentTime(value)
    sentenceRepeatRef.current = 0
    setRepeatCount(0)
    const si = findSentenceIndex(value)
    currentSentenceIdxRef.current = si
    setCurrentSentenceIdx(si)
  }

  // 音量
  const onVolume = (value: number) => {
    const el = mediaRef.current
    if (!el) return
    el.volume = value
    setVolume(value)
  }

  // Media Session + Wake Lock 集成（v0.9.2 起）
  // - 锁屏 / 通知中心显示媒体元数据（标题 / 专辑 / 封面）
  // - 系统控制中心 / 蓝牙耳机按键 → 触发 onPlay / onPause / onSeek
  // - 播放时申请 Wake Lock，暂停 / 卸载时释放；切回前台自动续期
  useMediaSession({
    metadata: {
      title: mediaName ?? `Media #${mediaId}`,
      artist: mediaAlbum ?? 'EchoSub',
      album: mediaAlbum ?? 'EchoSub',
      artwork: mediaCoverUrl
        ? [
            { src: mediaCoverUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: mediaCoverUrl, sizes: '192x192', type: 'image/jpeg' },
            { src: mediaCoverUrl, sizes: '512x512', type: 'image/jpeg' },
          ]
        : [],
    },
    playbackState: playing ? 'playing' : 'paused',
    position: {
      duration: duration || 0,
      currentTime: currentTime || 0,
      playbackRate,
    },
    handlers: {
      onPlay: () => {
        const el = mediaRef.current
        if (el && el.paused) el.play().then(() => setPlaying(true)).catch(() => {})
      },
      onPause: () => {
        const el = mediaRef.current
        if (el && !el.paused) {
          el.pause()
          setPlaying(false)
        }
      },
      onSeek: (to) => onSeek(to),
    },
  })

  // 播放速度（0.1 间隔加减，范围 0.5-2.0）
  const onRateChange = (rate: number) => {
    const clamped = Math.min(RATE_MAX, Math.max(RATE_MIN, rate))
    // 修正浮点精度（0.1 累加误差）
    const rounded = Math.round(clamped * 10) / 10
    const el = mediaRef.current
    if (el) el.playbackRate = rounded
    setPlaybackRate(rounded)
  }
  const decRate = () => onRateChange(playbackRate - RATE_STEP)
  const incRate = () => onRateChange(playbackRate + RATE_STEP)

  // 媒体自然结束（普通模式）
  //
  // v1.3.7 重构：移除无字幕早 return，统一由 onEnded 接管循环。
  // v1.3.8 调整：每次 onEnded 触发都把「已听 N 遍 +1」写入后端（即每次循环结束时调用
  //   savePosition(..., incrementPlay: true)），而 v1.3.7 只在第 N 轮才记一次。
  //   这样「已听 N 遍」真正反映"已经完整听过几遍"（与 UI 上的 overallLoopRef 同步），
  //   不再需要等 N 轮结束才能看到数字变化。
  //
  //   有字幕时（mode='repeat'）会在 line 848 onTimeUpdate 内已经按句计过 repeat_count，
  //   但 playCount（已听 N 遍）是整个媒体维度的，每轮 +1 合理。
  const onEnded = () => {
    if (modeRef.current === 'repeat') return
    const el = mediaRef.current
    if (!el) return

    // 有字幕时：补计最后一句（v0.4.x 起的兼容性 fix）
    // 无字幕时：无句可补计
    if (sentencesRef.current.length > 0) {
      const lastIdx = currentSentenceIdxRef.current
      if (lastIdx >= 0 && lastIdx < sentencesRef.current.length) {
        incrementSentenceRepeat(lastIdx)
      }
    }

    // v1.3.8：每次循环都递增 playCount（"已听 N 遍"）
    //   当前 currentTime ≈ el.duration（已播完），用 currentTime 保存位置
    //   force=true 强制覆盖（不依赖 t > lastSavePos 判断）
    //   incrementPlay=true 触发后端 PlayCount++
    const endPos = isFinite(el.duration) && el.duration > 0 ? el.duration : el.currentTime
    savePosition(endPos, { force: true, incrementPlay: true })

    // 整体循环 N 次状态机（v1.3.7 起有 / 无字幕共用同一条逻辑）
    if (overallLoopRef.current + 1 < loopCountRef.current) {
      overallLoopRef.current += 1
      el.currentTime = 0
      el.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      setPlaying(false)
      message.success('播放完成')
    }
  }

  // 点击句子：默认进入句子学习界面（v1.2.0 用户诉求）
  //   - 遮挡模式下：切换该句的揭示状态（保持原行为，便于盲听中快速核对）
  //   - 普通模式：跳转到「句子详情」页面（SentenceDetail），可逐词查词 / 整句解释
  //   - 用户可点击「回到播放」按钮回到播放器并定位到该句时间戳
  const handleSentenceClick = (idx: number) => {
    const s = localSentences[idx]
    if (!s) return
    if (maskMode) {
      setRevealed((prev) => {
        const next = new Set(prev)
        if (next.has(s.index)) {
          next.delete(s.index)
        } else {
          next.add(s.index)
        }
        return next
      })
      return
    }
    // 普通模式：进入句子学习界面
    navigate(`/play/${mediaId}/sentence/${s.index}`)
  }

  // 跳转到指定句子（不在字幕行直接使用；保留给收藏播放等场景）
  const jumpToSentence = (idx: number) => {
    const el = mediaRef.current
    if (!el || !localSentences[idx]) return
    handlingEndRef.current = false
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    el.currentTime = localSentences[idx].start
    sentenceRepeatRef.current = 0
    setRepeatCount(0)
    currentSentenceIdxRef.current = idx
    setCurrentSentenceIdx(idx)
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  // 切换句子收藏（重难点句子）
  const toggleFavorite = async (idx: number) => {
    const s = localSentences[idx]
    if (!s) return
    const next = new Set(favoriteSet)
    let favorited: boolean
    if (next.has(s.index)) {
      next.delete(s.index)
      favorited = false
    } else {
      next.add(s.index)
      favorited = true
    }
    setFavoriteSet(next)
    try {
      await recordApi.toggleFavorite(mediaId, s.index)
    } catch {
      // 回滚
      const rollback = new Set(favoriteSet)
      setFavoriteSet(rollback)
      message.error('收藏失败')
      return
    }
    message.success(favorited ? '已收藏' : '已取消收藏')
  }

  // 切换模式
  //
  // v1.3.7：无字幕时禁用 repeat 模式。
  //   - v1.3.6 已加 line 586-589 的「checked + 无字幕 → 自动回 normal」保护
  //   - 但 line 581 先 setMode('repeat') 再 setMode('normal') 会触发一次中间态
  //   - v1.3.7 改为提前判断：checked + 无字幕 → 直接保持 normal，避免中间态
  const onModeChange = (checked: boolean) => {
    handlingEndRef.current = false
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    sentenceRepeatRef.current = 0
    setRepeatCount(0)
    if (checked && localSentences.length === 0) {
      message.warning('该媒体无字幕文件，逐句复读需要字幕支持')
      setMode('normal')
      return
    }
    setMode(checked ? 'repeat' : 'normal')
  }

  // 切换遮挡模式时清空揭示集合
  const onMaskModeChange = (checked: boolean) => {
    setMaskMode(checked)
    if (!checked) setRevealed(new Set())
  }

  // 全部揭示/全部遮挡
  const revealAll = () => setRevealed(new Set(localSentences.map((s) => s.index)))
  const hideAll = () => setRevealed(new Set())

  // 视频全屏切换（全屏整个容器，保留叠加字幕）
  const toggleFullscreen = () => {
    const el = videoContainerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }

  // 监听全屏变化
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // 卸载时清理：保存最后一次播放位置（force=true 绕过节流保证落库），
  // 这样用户从播放器返回首页时，"继续观看"区能立刻看到该媒体。
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
      const el = mediaRef.current
      if (el) savePosition(el.currentTime, { force: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 当前激活的媒体 id：有配对时根据 tab 选择 video 或 audio 的 id；否则就是主媒体。
  const activeMediaId = pairedMedia && activeType !== mediaType && pairedMedia.type === activeType
    ? pairedMedia.id
    : mediaId
  const streamUrl = token ? mediaApi.streamUrl(activeMediaId, token) : ''
  const hasSubtitle = localSentences.length > 0
  const currentSentence = currentSentenceIdx >= 0 ? localSentences[currentSentenceIdx] : null
  const currentMasked = maskMode && currentSentence ? !revealed.has(currentSentence.index) : false

  return (
    <div>
      {/* Echo Loop 模式状态条（v1.2.0）：
         - 默认开启逐句复读，顶部持续显示当前模式 + 循环遍数徽标
         - 参考 Echo Loop `loopWhole` + `loopSentence` 双循环设计 */}
      <div
        style={{
          marginBottom: 12,
          padding: isPhone ? '8px 12px' : '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          background: mode === 'repeat' ? 'rgba(105, 192, 255, 0.08)' : 'var(--ac-bg-content, rgb(247, 243, 223))',
          border: mode === 'repeat' ? '1.5px solid rgba(105, 192, 255, 0.35)' : '1.5px solid var(--color-border-soft)',
          borderRadius: 'var(--radius-pill)',
        }}
      >
        <span style={{ fontSize: isPhone ? 16 : 18 }}>{mode === 'repeat' ? '🔁' : '▶'}</span>
        <Text strong style={{ fontSize: isPhone ? 13 : 14, color: 'var(--ac-text-header, #794f27)' }}>
          {mode === 'repeat' ? 'Echo Loop 复读中' : '普通播放'}
        </Text>
        {mode === 'repeat' && hasSubtitle && (
          <>
            <Tag color="cyan" style={{ margin: 0 }}>
              每句 × {sentenceRepeat} 遍
            </Tag>
            <Tag color="blue" style={{ margin: 0 }}>
              句末停 {pauseSeconds}s
            </Tag>
            <Tag color="geekblue" style={{ margin: 0 }}>
              整体循环 {loopCount} 次
            </Tag>
            {currentSentenceIdx >= 0 && (
              <Tag color="processing" style={{ margin: 0 }}>
                第 {currentSentenceIdx + 1}/{localSentences.length} 句 · 重复 {repeatCount}/{sentenceRepeat}
              </Tag>
            )}
          </>
        )}
        {!hasSubtitle && mode === 'repeat' && (
          <Tag color="warning" style={{ margin: 0 }}>无字幕，复读模式不可用</Tag>
        )}
      </div>

      {/* 媒体类型标签 / 视频↔音频 tab 切换（v0.9.2）
         - 有配对：渲染 CheckableTag 双 tab 切换
         - 无配对：仅渲染一个静态媒体类型标签（音频专辑只显示「🎵 音频」，不会误显示「🎬 视频」） */}
      {pairedMedia && pairedMedia.type !== mediaType ? (
        <div style={{
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: 4, background: 'var(--ac-bg-content, rgb(247, 243, 223))',
          border: '1.5px solid var(--color-border-soft)', borderRadius: 'var(--radius-pill)',
        }}>
          <Tag.CheckableTag
            checked={activeType === mediaType}
            onChange={(checked) => checked && switchMediaType(mediaType)}
            style={{
              padding: '6px 16px',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              background: activeType === mediaType ? 'var(--ant-color-primary)' : 'transparent',
              color: activeType === mediaType ? '#fff' : 'var(--ac-text-primary, #725d42)',
              fontWeight: 600,
            }}
          >
            {mediaType === 'video' ? '🎬 视频' : '🎵 音频'}
          </Tag.CheckableTag>
          <Tag.CheckableTag
            checked={activeType === pairedMedia.type}
            onChange={(checked) => checked && switchMediaType(pairedMedia.type)}
            style={{
              padding: '6px 16px',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              background: activeType === pairedMedia.type ? 'var(--ant-color-primary)' : 'transparent',
              color: activeType === pairedMedia.type ? '#fff' : 'var(--ac-text-primary, #725d42)',
              fontWeight: 600,
            }}
          >
            {pairedMedia.type === 'video' ? '🎬 视频' : '🎵 音频'}
          </Tag.CheckableTag>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
            （同专辑同基名配对：{mediaType === 'video' ? pairedMedia.name : '视频'}）
          </Text>
        </div>
      ) : (
        // 无配对：仅显示一个静态媒体类型标签（v0.9.2：避免音频专辑误显示「视频」）
        <div style={{
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span
            aria-label={mediaType === 'video' ? '视频' : '音频'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 12px', fontSize: 12, fontWeight: 600,
              color: 'var(--ac-text-primary, #725d42)',
              background: 'var(--ac-bg-content, rgb(247, 243, 223))',
              border: '1.5px solid var(--color-border-soft)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            {mediaType === 'video' ? '🎬 视频' : '🎵 音频'}
          </span>
        </div>
      )}

      {/* 媒体元素 —— 动物森友会风卡片（圆角 20px + 暖羊皮纸外边距） */}
      <div
        ref={videoContainerRef}
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'center',
          boxShadow: 'var(--color-shadow-card)',
        }}
      >
        {activeType === 'video' ? (
          <>
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={streamUrl}
              style={{ maxHeight: isFullscreen ? '100vh' : 480, width: '100%' }}
              {...{ [MEDIA_ELEMENT_MARK_ATTR]: 'true' }} // v0.9.2: 标记媒体元素供 useMediaSession 找到
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onEnded={onEnded}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              controls={false}
              // v1.3.7：移除 loop={!hasSubtitle}。
              //   v1.3.6 用 HTML5 原生 loop 实现「无字幕整体循环」，但浏览器原生 loop
              //   会吞掉 ended 事件，导致「整体第 N 轮 / 已听 N 遍」计数器永远停在 1。
              //   现在统一由 onEnded 接管循环（手动 currentTime=0 + play()），
              //   有 / 无字幕走同一条「整体循环 N 次」状态机。
            />
            {/* 视频叠加字幕：在画面底部显示当前句（v0.7.0 AC 风：暖羊皮纸 + 暖深棕字） */}
            {currentSentence && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(20px + var(--safe-bottom, 0px))',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(247, 243, 223, 0.94)', /* 暖羊皮纸 94% 透明 */
                  color: 'var(--ac-text-header, #794f27)',
                  padding: isFullscreen ? '12px 28px' : isPhone ? '8px 18px' : '10px 22px',
                  borderRadius: 'var(--radius-pill)', /* 胶囊形（AC 风字幕条） */
                  maxWidth: '92%',
                  textAlign: 'center',
                  fontSize: isFullscreen ? 28 : isPhone ? 14 : 16,
                  lineHeight: 1.5,
                  fontWeight: 600,
                  pointerEvents: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  border: '2px solid rgba(255, 255, 255, 0.6)',
                }}
              >
                {currentMasked ? maskText(currentSentence.text) : currentSentence.text}
              </div>
            )}
            <Button
              type="text"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              style={{
                position: 'absolute', top: 8, right: 8,
                color: '#fff', background: 'rgba(0,0,0,0.5)',
                zIndex: 11,
                width: isPhone ? 44 : 40,
                height: isPhone ? 44 : 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title={isFullscreen ? '退出全屏' : '全屏播放'}
            />
          </>
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={streamUrl}
            {...{ [MEDIA_ELEMENT_MARK_ATTR]: 'true' }} // v0.9.2: 标记媒体元素供 useMediaSession 找到
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            // v1.3.7：移除 loop={!hasSubtitle}（同 video，理由见上）
          />
        )}
      </div>

      {/* 进度条 */}
      <Slider
        min={0}
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onChange={onSeek}
        tooltip={{ formatter: (v) => formatDuration(v ?? 0) }}
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <Text type="secondary">{formatDuration(currentTime)} / {formatDuration(duration)}</Text>
        {/* Echo Loop 模式徽标（v1.2.0：合并到顶部状态条后，此处仅显示整体循环进度） */}
        {mode === 'repeat' && currentSentenceIdx >= 0 && (
          <Tag color="cyan">
            🔁 整体第 {Math.min(overallLoopRef.current + 1, loopCount)}/{loopCount} 轮
          </Tag>
        )}
      </div>

      {/* 控制按钮 —— v0.6.0 移动端 2 行布局 + 触控目标 44px */}
      <div style={{ marginBottom: 16 }}>
        {/* 第一行：主控制（播放/暂停、重头、收藏听遍数） */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: isPhone ? 8 : 0,
        }}>
          <Button
            type="primary"
            size="large"
            icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={togglePlay}
            style={{ minWidth: isPhone ? 100 : 96, minHeight: 44, fontSize: isPhone ? 15 : 14 }}
          >
            {playing ? '暂停' : '播放'}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => onSeek(0)}
            size={isPhone ? 'large' : 'middle'}
            style={{ minHeight: 44 }}
          >
            重头
          </Button>
          <div style={{ flex: 1, minWidth: 0 }} />
          <Tag color="gold" style={{ margin: 0, padding: '4px 12px', fontSize: 13, minHeight: 32, lineHeight: '24px' }}>
            🏆 已听 {playCount} 遍
          </Tag>
        </div>

        {/* 第二行：音量 + 速度（手机端换行；触控目标 44px） */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isPhone ? 10 : 12,
          flexWrap: 'wrap',
          padding: isPhone ? '8px 12px' : 0,
          background: isPhone ? 'var(--color-bg-page, #fafafa)' : 'transparent',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <SoundOutlined style={{ fontSize: 16 }} />
            <Slider
              min={0} max={1} step={0.05} value={volume} onChange={onVolume}
              style={{ width: isPhone ? 100 : 120 }}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
            />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px',
            background: isPhone ? 'var(--color-bg-elevated, #fff)' : 'transparent',
            borderRadius: 8,
            border: isPhone ? '1px solid var(--color-border-soft, rgba(0,0,0,0.06))' : 'none',
            minHeight: 44,
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-secondary, #595959)' }}>速度</span>
            <Button
              shape="circle"
              size={isPhone ? 'middle' : 'small'}
              icon={<MinusOutlined />}
              onClick={decRate}
              disabled={playbackRate <= RATE_MIN}
              style={{ minWidth: 36, minHeight: 36 }}
            />
            <span style={{
              minWidth: 48, textAlign: 'center', fontWeight: 600,
              color: 'var(--ant-color-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {playbackRate.toFixed(1)}x
            </span>
            <Button
              shape="circle"
              size={isPhone ? 'middle' : 'small'}
              icon={<PlusOutlined />}
              onClick={incRate}
              disabled={playbackRate >= RATE_MAX}
              style={{ minWidth: 36, minHeight: 36 }}
            />
          </div>
        </div>
      </div>

      {/* 播放设置 —— 动物森友会风卡片 */}
      <div style={{
        marginBottom: 16,
        padding: isPhone ? 12 : 16,
        background: 'var(--ac-bg-content, rgb(247, 243, 223))',
        border: '1.5px solid var(--color-border-soft)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: isPhone ? 12 : 24,
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
          <Tooltip title="Echo Loop：开启后每句重复 N 次 → 停顿 K 秒 → 下一句，整体循环 M 次">
            <span style={{ fontWeight: 600 }}>🔁 Echo Loop</span>
          </Tooltip>
          {/* v1.3.8：无字幕时 checked=false + disabled（v1.3.7 已加 disabled，但 checked 没改，
              仍按 mode 渲染 → 无字幕 + mode='normal'（v1.3.8 起默认值）时显示正确 OFF） */}
          <Switch checked={mode === 'repeat' && hasSubtitle} onChange={onModeChange} disabled={!hasSubtitle} />
          {!hasSubtitle && <Tag>无字幕</Tag>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
          <span style={{ fontWeight: 500 }}>整体循环</span>
          <InputNumber
            min={1} max={20} value={loopCount}
            onChange={(v) => setLoopCount(v ?? 1)}
            size={isPhone ? 'middle' : 'small'}
            style={{ width: 64 }}
          />
          <span style={{ color: 'var(--color-text-tertiary, #8c8c8c)' }}>次</span>
        </div>
        {mode === 'repeat' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
              <span style={{ fontWeight: 500 }}>每句重复</span>
              <InputNumber
                min={1} max={20} value={sentenceRepeat}
                onChange={(v) => setSentenceRepeat(v ?? 3)}
                size={isPhone ? 'middle' : 'small'}
                style={{ width: 64 }}
              />
              <span style={{ color: 'var(--color-text-tertiary, #8c8c8c)' }}>次</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
              <span style={{ fontWeight: 500 }}>句末停顿</span>
              <InputNumber
                min={0} max={30} step={0.5} value={pauseSeconds}
                onChange={(v) => setPauseSeconds(v ?? 1.5)}
                size={isPhone ? 'middle' : 'small'}
                style={{ width: 76 }}
              />
              <span style={{ color: 'var(--color-text-tertiary, #8c8c8c)' }}>秒</span>
            </div>
          </>
        )}
      </div>

      {/* Tabs：全文 / 收藏句子 / 备注。无字幕时禁用前两个 tab，但备注可访问 */}
      <Tabs
        defaultActiveKey={hasSubtitle ? 'all' : 'remark'}
        items={[
          ...(hasSubtitle ? [
            {
              key: 'all',
              label: <span><OrderedListOutlined /> 全文</span>,
              children: editing ? (
                // 编辑模式：渲染 SubtitleEditor（v0.8.0）
                <SubtitleEditor
                  mediaId={mediaId}
                  sentences={localSentences}
                  onCancel={() => setEditing(false)}
                  onSaved={(next) => {
                    setLocalSentences(next)
                    setEditing(false)
                  }}
                />
              ) : (
                <div>
                  <div style={{ marginBottom: 8, color: 'var(--color-text-secondary, #666)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: isPhone ? 12 : 13 }}>点击跳转，绿色为已完成</span>
                    <Space size="small" wrap>
                      <Button
                        size="small"
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(true)}
                        style={{ minHeight: 32 }}
                      >
                        编辑字幕
                      </Button>
                      <EyeInvisibleOutlined />
                      <Switch checked={maskMode} onChange={onMaskModeChange} size="small" />
                      <span style={{ fontSize: 12 }}>遮挡模式</span>
                      {maskMode && (
                        <>
                          <Button size="small" type="link" onClick={revealAll} style={{ padding: 0, minHeight: 32 }}>全部揭示</Button>
                          <Button size="small" type="link" onClick={hideAll} style={{ padding: 0, minHeight: 32 }}>全部遮挡</Button>
                        </>
                      )}
                    </Space>
                  </div>
                  <div
                    ref={subtitleListRef}
                    style={{
                      maxHeight: isPhone ? 'calc(100vh - 380px)' : 'calc(100vh - 420px)',
                      minHeight: 200,
                      overflowY: 'auto',
                      border: '1.5px solid var(--color-border-soft)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 8,
                      background: 'var(--ac-bg-content, rgb(247, 243, 223))',
                    }}
                  >
                    {localSentences.map((s, i) => {
                      const masked = maskMode && !revealed.has(s.index)
                      const isFav = favoriteSet.has(s.index)
                      const isCurrent = i === currentSentenceIdx
                      return (
                        <div
                          key={s.index}
                          ref={(el) => { sentenceRefs.current[i] = el }}
                          onClick={() => handleSentenceClick(i)}
                          style={{
                            padding: isPhone ? '10px 12px' : '8px 12px',
                            marginBottom: 4,
                            borderRadius: 12,
                            cursor: 'pointer',
                            background: isCurrent
                              ? 'color-mix(in srgb, var(--ant-color-primary) 12%, transparent)'
                              : s.completed
                                ? 'color-mix(in srgb, #6fba2c 10%, transparent)'
                                : 'transparent',
                            borderLeft: isCurrent
                              ? '3px solid var(--ant-color-primary)'
                              : s.completed
                                ? '3px solid #6fba2c'
                                : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 44,
                          }}
                        >
                          <span style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12, flexShrink: 0, minWidth: 48 }}>
                            {formatDuration(s.start)}
                          </span>
                          <span style={{
                            color: isCurrent
                              ? 'var(--ant-color-primary)'
                              : 'var(--color-text-primary, #333)',
                            flex: 1,
                            fontSize: isPhone ? 14 : 13,
                            lineHeight: 1.6,
                          }}>
                            {masked ? maskText(s.text) : s.text}
                          </span>
                          {/* 始终显示听遍数，让用户能看到每句的学习情况 */}
                          <Tag color={s.repeat_count > 0 ? 'orange' : 'default'} style={{ margin: 0, flexShrink: 0 }}>听 {s.repeat_count} 遍</Tag>
                          {s.completed && <Tag color="success" style={{ margin: 0, flexShrink: 0 }}>已背</Tag>}
                          <Tooltip title="跳到这句播放">
                            <Button
                              type="text"
                              size={isPhone ? 'middle' : 'small'}
                              icon={<ThunderboltOutlined />}
                              onClick={(e) => { e.stopPropagation(); jumpToSentence(i) }}
                              style={{ minWidth: 36, minHeight: 36 }}
                            />
                          </Tooltip>
                          <Tooltip title={isFav ? '取消收藏' : '收藏重难点'}>
                            <Button
                              type="text"
                              size={isPhone ? 'middle' : 'small'}
                              icon={isFav ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(i) }}
                              style={{ minWidth: 36, minHeight: 36 }}
                            />
                          </Tooltip>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ),
            },
            {
              key: 'fav',
              label: <span><StarFilled style={{ color: '#faad14' }} /> 收藏句子 {favoriteSet.size > 0 && <Tag color="orange" style={{ marginLeft: 4 }}>{favoriteSet.size}</Tag>}</span>,
              children: (
                <div>
                  {/* 收藏播放控制栏 */}
                  {favoriteSet.size > 0 && (
                    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        type={favoritePlayMode ? 'primary' : 'default'}
                        icon={favoritePlayMode ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        size={isPhone ? 'middle' : 'small'}
                        onClick={() => {
                          const next = !favoritePlayMode
                          setFavoritePlayMode(next)
                          if (next) {
                            // v1.3.7：无字幕时禁用 repeat 模式 → 收藏播放也无意义
                            //   收藏列表按 subtitle index 索引，无字幕时 favoriteSet 为空
                            //   但仍要早 return，避免 setMode('repeat') 与 onEnded 状态机冲突
                            if (!hasSubtitle) {
                              message.warning('该媒体无字幕文件，无法按收藏列表复读')
                              setFavoritePlayMode(false)
                              return
                            }
                            // 进入收藏播放模式：自动切到 repeat 模式，并跳到第一句收藏句
                            if (modeRef.current !== 'repeat') setMode('repeat')
                            const favSorted = Array.from(favoriteSet).sort((a, b) => a - b)
                            const firstFav = favSorted[0]
                            const firstLocalIdx = localSentences.findIndex((s) => s.index === firstFav)
                            if (firstLocalIdx >= 0) {
                              jumpToSentence(firstLocalIdx)
                              message.success('已开始按收藏列表播放')
                            }
                          } else {
                            message.info('已退出收藏播放模式')
                          }
                        }}
                        style={{ minHeight: isPhone ? 40 : 32 }}
                      >
                        {favoritePlayMode ? '停止收藏播放' : '▶ 播放收藏'}
                      </Button>
                      {favoritePlayMode && (
                        <Tag color="orange">收藏播放中…</Tag>
                      )}
                      <span style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12 }}>
                        按收藏顺序逐句播放，播完自动跳下一句收藏
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      maxHeight: isPhone ? 'calc(100vh - 430px)' : 'calc(100vh - 470px)',
                      minHeight: 160,
                      overflowY: 'auto',
                      border: '1.5px solid var(--color-border-soft)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 8,
                      background: 'var(--ac-bg-content, rgb(247, 243, 223))',
                    }}
                  >
                  {favoriteSet.size === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary, #999)', padding: 40 }}>
                      暂无收藏句子，点击字幕右侧星标收藏重难点
                    </div>
                  ) : (
                    localSentences.filter((s) => favoriteSet.has(s.index)).map((s) => {
                      const i = localSentences.findIndex((x) => x.index === s.index)
                      const isCurrent = i === currentSentenceIdx
                      return (
                        <div
                          key={s.index}
                          onClick={() => jumpToSentence(i)}
                          style={{
                            padding: isPhone ? '10px 12px' : '8px 12px',
                            marginBottom: 4,
                            borderRadius: 12,
                            cursor: 'pointer',
                            background: isCurrent
                              ? 'color-mix(in srgb, var(--ant-color-primary) 12%, transparent)'
                              : 'transparent',
                            borderLeft: isCurrent
                              ? '3px solid var(--ant-color-primary)'
                              : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            minHeight: 44,
                          }}
                        >
                          <span style={{ color: 'var(--color-text-tertiary, #999)', fontSize: 12, flexShrink: 0, minWidth: 48 }}>
                            {formatDuration(s.start)}
                          </span>
                          <span style={{
                            color: isCurrent
                              ? 'var(--ant-color-primary)'
                              : 'var(--color-text-primary, #333)',
                            flex: 1,
                            fontSize: isPhone ? 14 : 13,
                            lineHeight: 1.6,
                          }}>
                            {s.text}
                          </span>
                          <Tag color={s.repeat_count > 0 ? 'orange' : 'default'} style={{ margin: 0, flexShrink: 0 }}>听 {s.repeat_count} 遍</Tag>
                          <Tooltip title="取消收藏">
                            <Button
                              type="text"
                              size={isPhone ? 'middle' : 'small'}
                              icon={<StarFilled style={{ color: '#faad14' }} />}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(i) }}
                              style={{ minWidth: 36, minHeight: 36 }}
                            />
                          </Tooltip>
                        </div>
                      )
                    })
                  )}
                  </div>
                </div>
              ),
            },
          ] : []),
          {
            key: 'remark',
            label: <span><FileTextOutlined /> 备注</span>,
            children: (
              <div style={{ maxHeight: 'calc(100vh - 420px)', minHeight: 200, overflowY: 'auto', padding: '0 4px' }}>
                {remarkLoaded ? (
                  <MarkdownEditor
                    value={remark}
                    onChange={setRemark}
                    onBlurSave={saveRemark}
                    placeholder="点击「编辑原文」写下对这个文件的备注... 支持 Markdown。"
                    defaultEditing={false}
                    showTTS
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>加载备注中…</div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
