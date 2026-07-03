import { useState, useRef } from 'react'
import { Input, Button, Space, Tooltip, Typography, message } from 'antd'
import {
  EditOutlined, EyeOutlined, SoundOutlined, LoadingOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSettingsStore } from '@/store/settings'
import { markdownToPlainText } from '@/utils'

const { Text } = Typography
const { TextArea } = Input

// VoiceCraft TTS 端点（免费公开服务，兼容 OpenAI TTS 格式）
const TTS_ENDPOINT = 'https://tts.wangwangit.com/v1/audio/speech'
const FALLBACK_TTS_VOICE = 'en-US-JennyNeural'
const FALLBACK_TTS_SPEED = 1.0

interface MarkdownEditorProps {
  /** 当前内容（受控） */
  value: string
  /** 内容变化回调（编辑模式下实时同步） */
  onChange: (next: string) => void
  /** 失焦保存（可空——为空时不自动保存） */
  onBlurSave?: (next: string) => void | Promise<void>
  /** 占位文字 */
  placeholder?: string
  /** 最小高度（行数） */
  minRows?: number
  /** 最大高度（行数） */
  maxRows?: number
  /** 是否展示 TTS 朗读按钮（默认 true） */
  showTTS?: boolean
  /** 是否默认进入编辑态（默认 false = 预览） */
  defaultEditing?: boolean
  /** 紧凑模式：隐藏外层 padding/minHeight（用于嵌入到其他卡片里） */
  compact?: boolean
}

/**
 * 通用 Markdown 编辑器（预览/编辑切换 + TTS 朗读）。
 * 默认预览态，编辑图标进入编辑态，编辑态再次点击切回预览。
 * 失焦自动调用 onBlurSave（若提供）。
 *
 * 用于：学习页面（NoteEditor）、文件备注 Tab 等需要 Markdown 渲染/编辑的场景。
 */
export default function MarkdownEditor({
  value,
  onChange,
  onBlurSave,
  placeholder = '支持 Markdown 语法...',
  minRows = 8,
  maxRows = 24,
  showTTS = true,
  defaultEditing = false,
  compact = false,
}: MarkdownEditorProps) {
  const [editing, setEditing] = useState(defaultEditing)
  const [saving, setSaving] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsVoice = useSettingsStore((s) => s.tts_voice) || FALLBACK_TTS_VOICE
  const ttsSpeed = useSettingsStore((s) => s.tts_speed) || FALLBACK_TTS_SPEED

  // TTS 朗读：调用 VoiceCraft API 播放
  const handleTTS = async () => {
    const text = markdownToPlainText(value).trim()
    if (!text) {
      message.warning('内容为空')
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setTtsLoading(true)
    try {
      const resp = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice: ttsVoice,
          speed: ttsSpeed,
          pitch: '0',
          style: 'general',
        }),
      })
      if (!resp.ok) throw new Error(`TTS 请求失败: ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      await audio.play()
    } catch (err) {
      message.error('朗读失败：' + (err as Error).message)
    } finally {
      setTtsLoading(false)
    }
  }

  const handleBlur = async () => {
    if (!onBlurSave) return
    setSaving(true)
    try {
      await onBlurSave(value)
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space>
          <Button
            type={editing ? 'default' : 'primary'}
            icon={editing ? <EditOutlined /> : <EyeOutlined />}
            onClick={() => setEditing(!editing)}
          >
            {editing ? '编辑原文' : '预览渲染'}
          </Button>
          {showTTS && (
            <Tooltip title="使用 TTS 朗读内容（自动去除 Markdown 符号）">
              <Button
                icon={ttsLoading ? <LoadingOutlined /> : <SoundOutlined />}
                onClick={handleTTS}
                loading={ttsLoading}
              >
                朗读
              </Button>
            </Tooltip>
          )}
        </Space>
        {saving && <Text type="secondary">保存中...</Text>}
      </div>
      {editing ? (
        <TextArea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          autoSize={{ minRows, maxRows }}
          placeholder={placeholder}
          style={{ fontFamily: 'monospace' }}
        />
      ) : (
        <div
          style={{
            padding: compact ? 0 : 16,
            border: compact ? 'none' : '1px solid #f0f0f0',
            borderRadius: 8,
            minHeight: compact ? 0 : 120,
            background: compact ? 'transparent' : '#fafafa',
          }}
        >
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <Text type="secondary">{placeholder}</Text>
          )}
        </div>
      )}
    </div>
  )
}
