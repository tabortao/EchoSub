import { useEffect, useRef, useState, useCallback } from 'react'
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
} from '@ant-design/icons'
import { mediaApi, recordApi } from '@/api'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import type { Sentence } from '@/types'
import { formatDuration } from '@/utils'

const { Text } = Typography

interface MediaPlayerProps {
  mediaId: number
  mediaType: 'video' | 'audio'
  initialPosition: number
  sentences: Sentence[]
  playCount: number
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

export default function MediaPlayer({ mediaId, mediaType, initialPosition, sentences, playCount }: MediaPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const subtitleListRef = useRef<HTMLDivElement>(null)
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([])
  const { loop_count, sentence_repeat, pause_seconds } = useSettingsStore()
  const token = useAuthStore((s) => s.token)

  // UI 状态
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [mode, setMode] = useState<PlayMode>('normal')
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

  // 同步 ref
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { sentenceRepeatTargetRef.current = sentenceRepeat }, [sentenceRepeat])
  useEffect(() => { pauseSecondsRef.current = pauseSeconds }, [pauseSeconds])
  useEffect(() => { loopCountRef.current = loopCount }, [loopCount])
  useEffect(() => { sentencesRef.current = sentences }, [sentences])
  useEffect(() => { currentSentenceIdxRef.current = currentSentenceIdx }, [currentSentenceIdx])

  // 从 sentences 初始化收藏集合
  useEffect(() => {
    const fav = new Set<number>()
    sentences.forEach((s) => {
      if (s.favorited) fav.add(s.index)
    })
    setFavoriteSet(fav)
  }, [sentences])

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

  // 标记句子完成
  const markSentenceCompleted = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= sentencesRef.current.length) return
    try {
      await recordApi.updateSentence(mediaId, idx, true, sentenceRepeatTargetRef.current)
    } catch {
      // 忽略
    }
  }, [mediaId])

  // 保存播放位置（节流 5s）
  const savePosition = useCallback((pos: number, increment = false) => {
    const now = Date.now()
    if (!increment && now - lastSaveRef.current < 5000) return
    lastSaveRef.current = now
    recordApi.update(mediaId, pos, increment).catch(() => {})
  }, [mediaId])

  // 时间更新处理：核心复读逻辑
  const onTimeUpdate = useCallback(() => {
    const el = mediaRef.current
    if (!el || handlingEndRef.current) return
    const t = el.currentTime
    setCurrentTime(t)

    // 更新当前句子高亮
    const si = findSentenceIndex(t)
    if (si !== currentSentenceIdxRef.current) {
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

          if (sentenceRepeatRef.current < sentenceRepeatTargetRef.current) {
            el.currentTime = cur.start
            handlingEndRef.current = false
          } else {
            markSentenceCompleted(curIdx)
            el.pause()
            setPlaying(false)
            const nextIdx = curIdx + 1
            if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
            pauseTimerRef.current = setTimeout(() => {
              if (nextIdx < list.length) {
                sentenceRepeatRef.current = 0
                setRepeatCount(0)
                currentSentenceIdxRef.current = nextIdx
                setCurrentSentenceIdx(nextIdx)
                el.currentTime = list[nextIdx].start
                el.play().then(() => setPlaying(true)).catch(() => {})
              } else {
                if (overallLoopRef.current + 1 < loopCountRef.current) {
                  overallLoopRef.current += 1
                  sentenceRepeatRef.current = 0
                  setRepeatCount(0)
                  currentSentenceIdxRef.current = 0
                  setCurrentSentenceIdx(0)
                  el.currentTime = 0
                  el.play().then(() => setPlaying(true)).catch(() => {})
                } else {
                  savePosition(t, true)
                }
              }
              handlingEndRef.current = false
            }, pauseSecondsRef.current * 1000)
          }
        }
      }
    }
  }, [findSentenceIndex, markSentenceCompleted, savePosition])

  // 媒体加载完成
  const onLoadedMetadata = () => {
    const el = mediaRef.current
    if (!el) return
    setDuration(el.duration)
    if (initialPosition > 0 && initialPosition < el.duration) {
      el.currentTime = initialPosition
    }
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
  const onEnded = () => {
    if (modeRef.current === 'repeat') return
    const el = mediaRef.current
    if (!el) return
    if (overallLoopRef.current + 1 < loopCountRef.current) {
      overallLoopRef.current += 1
      el.currentTime = 0
      el.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      setPlaying(false)
      savePosition(el.duration, true)
      message.success('播放完成')
    }
  }

  // 点击句子跳转 + 遮挡模式下 toggle 揭示
  const handleSentenceClick = (idx: number) => {
    if (maskMode) {
      setRevealed((prev) => {
        const next = new Set(prev)
        const sentIdx = sentences[idx].index
        if (next.has(sentIdx)) {
          next.delete(sentIdx)
        } else {
          next.add(sentIdx)
        }
        return next
      })
    }
    jumpToSentence(idx)
  }

  // 跳转到指定句子
  const jumpToSentence = (idx: number) => {
    const el = mediaRef.current
    if (!el || !sentences[idx]) return
    handlingEndRef.current = false
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    el.currentTime = sentences[idx].start
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
    const s = sentences[idx]
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
  const onModeChange = (checked: boolean) => {
    setMode(checked ? 'repeat' : 'normal')
    handlingEndRef.current = false
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    sentenceRepeatRef.current = 0
    setRepeatCount(0)
    if (checked && sentences.length === 0) {
      message.warning('该媒体无字幕文件，逐句复读需要字幕支持')
      setMode('normal')
    }
  }

  // 切换遮挡模式时清空揭示集合
  const onMaskModeChange = (checked: boolean) => {
    setMaskMode(checked)
    if (!checked) setRevealed(new Set())
  }

  // 全部揭示/全部遮挡
  const revealAll = () => setRevealed(new Set(sentences.map((s) => s.index)))
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

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
      const el = mediaRef.current
      if (el) savePosition(el.currentTime)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streamUrl = token ? mediaApi.streamUrl(mediaId, token) : ''
  const hasSubtitle = sentences.length > 0
  const currentSentence = currentSentenceIdx >= 0 ? sentences[currentSentenceIdx] : null
  const currentMasked = maskMode && currentSentence ? !revealed.has(currentSentence.index) : false

  return (
    <div>
      {/* 媒体元素 */}
      <div
        ref={videoContainerRef}
        style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 16, display: 'flex', justifyContent: 'center' }}
      >
        {mediaType === 'video' ? (
          <>
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={streamUrl}
              style={{ maxHeight: isFullscreen ? '100vh' : 480, width: '100%' }}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onEnded={onEnded}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              controls={false}
            />
            {/* 视频叠加字幕：在画面底部显示当前句 */}
            {currentSentence && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.75)',
                  color: '#fff',
                  padding: '6px 18px',
                  borderRadius: 6,
                  maxWidth: '90%',
                  textAlign: 'center',
                  fontSize: isFullscreen ? 22 : 16,
                  lineHeight: 1.5,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                {currentMasked ? maskText(currentSentence.text) : currentSentence.text}
              </div>
            )}
            <Button
              type="text"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              style={{ position: 'absolute', top: 8, right: 8, color: '#fff', background: 'rgba(0,0,0,0.45)', zIndex: 11 }}
              title={isFullscreen ? '退出全屏' : '全屏播放'}
            />
          </>
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={streamUrl}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text type="secondary">{formatDuration(currentTime)} / {formatDuration(duration)}</Text>
        {mode === 'repeat' && currentSentenceIdx >= 0 && (
          <Tag color="processing">
            第 {currentSentenceIdx + 1}/{sentences.length} 句 · 重复 {repeatCount}/{sentenceRepeat}
          </Tag>
        )}
      </div>

      {/* 控制按钮 */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          size="large"
          icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={togglePlay}
        >
          {playing ? '暂停' : '播放'}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => onSeek(0)}>重头</Button>
        <Space>
          <SoundOutlined />
          <Slider min={0} max={1} step={0.05} value={volume} onChange={onVolume} style={{ width: 100 }} tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }} />
        </Space>
        <Space>
          <span>速度</span>
          <Button shape="circle" size="small" icon={<MinusOutlined />} onClick={decRate} disabled={playbackRate <= RATE_MIN} />
          <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 500 }}>{playbackRate.toFixed(1)}x</span>
          <Button shape="circle" size="small" icon={<PlusOutlined />} onClick={incRate} disabled={playbackRate >= RATE_MAX} />
        </Space>
        <Tag color="gold" style={{ margin: 0 }}>已听 {playCount} 遍</Tag>
      </Space>

      {/* 播放设置 */}
      <Space wrap size="large" style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 8, display: 'flex' }}>
        <Space>
          <Tooltip title="开启后结合字幕逐句重复播放">
            <span>逐句复读</span>
          </Tooltip>
          <Switch checked={mode === 'repeat'} onChange={onModeChange} disabled={!hasSubtitle} />
          {!hasSubtitle && <Tag>无字幕</Tag>}
        </Space>
        <Space>
          <span>整体循环</span>
          <InputNumber min={1} max={20} value={loopCount} onChange={(v) => setLoopCount(v ?? 1)} size="small" style={{ width: 60 }} /> 次
        </Space>
        {mode === 'repeat' && (
          <>
            <Space>
              <span>每句重复</span>
              <InputNumber min={1} max={20} value={sentenceRepeat} onChange={(v) => setSentenceRepeat(v ?? 3)} size="small" style={{ width: 60 }} /> 次
            </Space>
            <Space>
              <span>句末停顿</span>
              <InputNumber min={0} max={30} step={0.5} value={pauseSeconds} onChange={(v) => setPauseSeconds(v ?? 1.5)} size="small" style={{ width: 70 }} /> 秒
            </Space>
          </>
        )}
      </Space>

      {/* 字幕列表（Tabs：全部字幕 / 收藏句子） */}
      {hasSubtitle && (
        <Tabs
          defaultActiveKey="all"
          items={[
            {
              key: 'all',
              label: <span><OrderedListOutlined /> 全部字幕</span>,
              children: (
                <div>
                  <div style={{ marginBottom: 8, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span>点击跳转，绿色为已完成</span>
                    <Space size="small" wrap>
                      <EyeInvisibleOutlined />
                      <Switch checked={maskMode} onChange={onMaskModeChange} size="small" />
                      <span style={{ fontSize: 12 }}>遮挡模式</span>
                      {maskMode && (
                        <>
                          <Button size="small" type="link" onClick={revealAll} style={{ padding: 0 }}>全部揭示</Button>
                          <Button size="small" type="link" onClick={hideAll} style={{ padding: 0 }}>全部遮挡</Button>
                        </>
                      )}
                    </Space>
                  </div>
                  <div
                    ref={subtitleListRef}
                    style={{ maxHeight: 'calc(100vh - 420px)', minHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}
                  >
                    {sentences.map((s, i) => {
                      const masked = maskMode && !revealed.has(s.index)
                      const isFav = favoriteSet.has(s.index)
                      return (
                        <div
                          key={s.index}
                          ref={(el) => { sentenceRefs.current[i] = el }}
                          onClick={() => handleSentenceClick(i)}
                          style={{
                            padding: '8px 12px',
                            marginBottom: 4,
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: i === currentSentenceIdx ? '#e6f4ff' : s.completed ? '#f6ffed' : 'transparent',
                            borderLeft: i === currentSentenceIdx ? '3px solid #1677ff' : s.completed ? '3px solid #52c41a' : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ color: '#999', fontSize: 12, flexShrink: 0 }}>
                            {formatDuration(s.start)}
                          </span>
                          <span style={{ color: i === currentSentenceIdx ? '#1677ff' : '#333', flex: 1 }}>
                            {masked ? maskText(s.text) : s.text}
                          </span>
                          {s.repeat_count > 0 && (
                            <Tag color="orange" style={{ margin: 0, flexShrink: 0 }}>听 {s.repeat_count} 遍</Tag>
                          )}
                          {s.completed && <Tag color="success" style={{ margin: 0, flexShrink: 0 }}>已背</Tag>}
                          <Tooltip title={isFav ? '取消收藏' : '收藏重难点'}>
                            <Button
                              type="text"
                              size="small"
                              icon={isFav ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(i) }}
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
                <div
                  style={{ maxHeight: 'calc(100vh - 420px)', minHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}
                >
                  {favoriteSet.size === 0 ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
                      暂无收藏句子，点击字幕右侧星标收藏重难点
                    </div>
                  ) : (
                    sentences.filter((s) => favoriteSet.has(s.index)).map((s) => {
                      const i = sentences.findIndex((x) => x.index === s.index)
                      return (
                        <div
                          key={s.index}
                          onClick={() => jumpToSentence(i)}
                          style={{
                            padding: '8px 12px',
                            marginBottom: 4,
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: i === currentSentenceIdx ? '#e6f4ff' : 'transparent',
                            borderLeft: i === currentSentenceIdx ? '3px solid #1677ff' : '3px solid transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ color: '#999', fontSize: 12, flexShrink: 0 }}>
                            {formatDuration(s.start)}
                          </span>
                          <span style={{ color: i === currentSentenceIdx ? '#1677ff' : '#333', flex: 1 }}>
                            {s.text}
                          </span>
                          {s.repeat_count > 0 && (
                            <Tag color="orange" style={{ margin: 0, flexShrink: 0 }}>听 {s.repeat_count} 遍</Tag>
                          )}
                          <Tooltip title="取消收藏">
                            <Button
                              type="text"
                              size="small"
                              icon={<StarFilled style={{ color: '#faad14' }} />}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(i) }}
                            />
                          </Tooltip>
                        </div>
                      )
                    })
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
