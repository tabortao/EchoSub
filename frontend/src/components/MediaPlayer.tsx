import { useEffect, useRef, useState, useCallback } from 'react'
import { Slider, Button, Space, InputNumber, Switch, Tag, Tooltip, message, Typography } from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  OrderedListOutlined,
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
}

type PlayMode = 'normal' | 'repeat'

export default function MediaPlayer({ mediaId, mediaType, initialPosition, sentences }: MediaPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const { loop_count, sentence_repeat, pause_seconds } = useSettingsStore()
  const token = useAuthStore((s) => s.token)

  // UI 状态
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [mode, setMode] = useState<PlayMode>('normal')
  const [loopCount, setLoopCount] = useState(loop_count || 1)
  const [sentenceRepeat, setSentenceRepeat] = useState(sentence_repeat || 3)
  const [pauseSeconds, setPauseSeconds] = useState(pause_seconds ?? 1.5)
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(-1)
  const [repeatCount, setRepeatCount] = useState(0) // 当前句已重复次数

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

  // 同步 ref
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { sentenceRepeatTargetRef.current = sentenceRepeat }, [sentenceRepeat])
  useEffect(() => { pauseSecondsRef.current = pauseSeconds }, [pauseSeconds])
  useEffect(() => { loopCountRef.current = loopCount }, [loopCount])
  useEffect(() => { sentencesRef.current = sentences }, [sentences])

  // 找到当前时间对应的句子索引
  const findSentenceIndex = useCallback((t: number) => {
    const list = sentencesRef.current
    for (let i = 0; i < list.length; i++) {
      if (t >= list[i].start && t < list[i].end) return i
    }
    // 若落在两句之间（间隔），返回上一句的下一句
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
    if (si !== currentSentenceIdx) {
      setCurrentSentenceIdx(si)
    }

    // 逐句复读模式
    if (modeRef.current === 'repeat' && sentencesRef.current.length > 0) {
      const list = sentencesRef.current
      // 当前正在复读的句子
      const curIdx = currentSentenceIdxRef.current
      if (curIdx >= 0 && curIdx < list.length) {
        const cur = list[curIdx]
        if (t >= cur.end) {
          // 到达当前句末尾
          handlingEndRef.current = true
          sentenceRepeatRef.current += 1
          setRepeatCount(sentenceRepeatRef.current)

          if (sentenceRepeatRef.current < sentenceRepeatTargetRef.current) {
            // 重复次数不足，回到句首
            el.currentTime = cur.start
            handlingEndRef.current = false
          } else {
            // 重复完成，标记并停顿
            markSentenceCompleted(curIdx)
            el.pause()
            setPlaying(false)
            const nextIdx = curIdx + 1
            if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
            pauseTimerRef.current = setTimeout(() => {
              if (nextIdx < list.length) {
                // 进入下一句
                sentenceRepeatRef.current = 0
                setRepeatCount(0)
                currentSentenceIdxRef.current = nextIdx
                setCurrentSentenceIdx(nextIdx)
                el.currentTime = list[nextIdx].start
                el.play().then(() => setPlaying(true)).catch(() => {})
              } else {
                // 全部句子完成，检查整体循环
                if (overallLoopRef.current + 1 < loopCountRef.current) {
                  overallLoopRef.current += 1
                  sentenceRepeatRef.current = 0
                  setRepeatCount(0)
                  currentSentenceIdxRef.current = 0
                  setCurrentSentenceIdx(0)
                  el.currentTime = 0
                  el.play().then(() => setPlaying(true)).catch(() => {})
                } else {
                  // 全部结束
                  savePosition(t, true)
                }
              }
              handlingEndRef.current = false
            }, pauseSecondsRef.current * 1000)
          }
        }
      }
    }
  }, [findSentenceIndex, currentSentenceIdx, markSentenceCompleted, savePosition])

  // 用 ref 跟踪当前句子索引以避免闭包陈旧
  const currentSentenceIdxRef = useRef(-1)
  useEffect(() => { currentSentenceIdxRef.current = currentSentenceIdx }, [currentSentenceIdx])

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
    // 重置当前句复读计数
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

  // 媒体自然结束（普通模式）
  const onEnded = () => {
    if (modeRef.current === 'repeat') return // 逐句模式由 timeupdate 处理
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

  // 点击句子跳转
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

  return (
    <div>
      {/* 媒体元素 */}
      <div style={{ background: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        {mediaType === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={streamUrl}
            style={{ maxHeight: 420, width: '100%' }}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            controls={false}
          />
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

      {/* 字幕列表 */}
      {hasSubtitle && (
        <div>
          <div style={{ marginBottom: 8, color: '#666' }}>
            <OrderedListOutlined /> 字幕（点击跳转，绿色为已完成）
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
            {sentences.map((s, i) => (
              <div
                key={s.index}
                onClick={() => jumpToSentence(i)}
                style={{
                  padding: '8px 12px',
                  marginBottom: 4,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: i === currentSentenceIdx ? '#e6f4ff' : s.completed ? '#f6ffed' : 'transparent',
                  borderLeft: i === currentSentenceIdx ? '3px solid #1677ff' : s.completed ? '3px solid #52c41a' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ color: '#999', fontSize: 12, marginRight: 8 }}>
                  {formatDuration(s.start)}
                </span>
                <span style={{ color: i === currentSentenceIdx ? '#1677ff' : '#333' }}>{s.text}</span>
                {s.completed && <Tag color="success" style={{ marginLeft: 8 }}>已背</Tag>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
