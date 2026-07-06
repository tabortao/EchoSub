/**
 * 字幕编辑器（v0.8.0 起）
 *
 * 职责：
 *   1. 在 MediaPlayer 内部以"编辑模式"形式渲染，提供每条句子的可编辑 TextArea
 *      与时间戳 InputNumber。
 *   2. 通过 aiApi.translate 调用后端代理的 OpenAI 兼容接口，批量翻译当前所有
 *      句子的文本并回填到本地编辑副本（不立即写盘）。
 *   3. 点击"保存"时调用 mediaApi.updateSubtitle 把整个 sentences 数组原子
 *      写回原 SRT/VTT 文件（后端用 pkg/subtitle.WriteFile 做 atomic rename）。
 *
 * 设计要点：
 *   - API key 与 base url 仅在后端，前端只发请求，密钥不出网。
 *   - AI 翻译有两种入口："全部翻译"（一次发整页）和"🌐 单条翻译"（仅一条）。
 *   - 编辑副本（draft）独立于 props.sentences，未点"保存"前不会影响原文件。
 *   - 父组件通过 onSaved 接收写盘后的新 sentences，用于刷新播放器本地副本。
 */
import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Select, Space, Spin, Tag, Tooltip, Typography, message } from 'antd'
import {
  CloudOutlined,
  CheckOutlined,
  CloseOutlined,
  TranslationOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { aiApi, mediaApi } from '@/api'
import type { AIStatus, Sentence } from '@/types'
import { useDeviceSize } from '@/hooks/useDeviceSize'

const { Text } = Typography

interface SubtitleEditorProps {
  mediaId: number
  sentences: Sentence[]
  onSaved: (next: Sentence[]) => void
  onCancel: () => void
}

export default function SubtitleEditor({ mediaId, sentences, onSaved, onCancel }: SubtitleEditorProps) {
  const { isPhone } = useDeviceSize()
  // 编辑副本（深拷贝一份，避免污染 props）
  const [draft, setDraft] = useState<Sentence[]>(() =>
    sentences.map((s) => ({ ...s })),
  )
  // AI 配置状态（拉一次即可）
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [targetLang, setTargetLang] = useState<string>('Chinese')
  // 翻译模式（v0.8.1 起）：默认生成双语字幕（原文 + 译文）
  // - bilingual：保留原文 + 追加译文到下方（写入 SRT 后即双语字幕）
  // - replace  ：用译文替换原文（v0.8.0 行为）
  const [translateMode, setTranslateMode] = useState<'bilingual' | 'replace'>('bilingual')
  // 整页翻译进行中
  const [batchTranslating, setBatchTranslating] = useState(false)
  // 单条翻译进行中（用 index 标记哪条正在翻）
  const [singleTranslating, setSingleTranslating] = useState<number | null>(null)
  // 整页保存中
  const [saving, setSaving] = useState(false)

  // 加载 AI 状态
  useEffect(() => {
    let cancelled = false
    aiApi.status()
      .then((res: { data: { data: AIStatus } }) => {
        if (cancelled) return
        const status = res.data.data
        setAiStatus(status)
        if (status.target_lang) setTargetLang(status.target_lang)
      })
      .catch(() => { /* 静默失败，UI 显示 AI 不可用 */ })
    return () => { cancelled = true }
  }, [])

  // 切换某一行的文本
  const updateText = (idx: number, text: string) => {
    setDraft((prev) => prev.map((s, i) => (i === idx ? { ...s, text } : s)))
  }
  // 切换某一行的 start / end
  const updateTime = (idx: number, key: 'start' | 'end', value: number) => {
    setDraft((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)))
  }

  // 单条 AI 翻译
  const handleSingleTranslate = async (idx: number) => {
    if (!aiStatus?.enabled) {
      message.warning('AI 翻译未启用，请先在 AI 设置中配置')
      return
    }
    const text = draft[idx]?.text?.trim()
    if (!text) {
      message.warning('该句文本为空')
      return
    }
    setSingleTranslating(idx)
    try {
      const res = await aiApi.translate({
        texts: [text],
        target_lang: targetLang,
        mode: translateMode,
      })
      const t = res.data.data?.translations?.[0]
      if (t) {
        updateText(idx, t)
        message.success(`第 ${idx + 1} 句翻译完成（${translateMode === 'bilingual' ? '双语' : '替换'}）`)
      } else {
        message.warning('AI 未返回翻译结果')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'AI 翻译失败'
      message.error(msg)
    } finally {
      setSingleTranslating(null)
    }
  }

  // 全部 AI 翻译（只翻译非空文本，按当前 draft 顺序）
  const handleBatchTranslate = async () => {
    if (!aiStatus?.enabled) {
      message.warning('AI 翻译未启用，请先在 AI 设置中配置')
      return
    }
    const nonEmptyIdx = draft
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.text.trim() !== '')
    if (nonEmptyIdx.length === 0) {
      message.warning('所有句子都为空')
      return
    }
    setBatchTranslating(true)
    try {
      // 后端限制单次 200 条；超长分批（每批之间间隔 200ms，避免限流）
      const BATCH = 50
      const next = [...draft]
      for (let off = 0; off < nonEmptyIdx.length; off += BATCH) {
        const chunk = nonEmptyIdx.slice(off, off + BATCH)
        const res = await aiApi.translate({
          texts: chunk.map(({ s }) => s.text),
          target_lang: targetLang,
          mode: translateMode,
        })
        const translations = res.data.data?.translations ?? []
        chunk.forEach(({ i }, k) => {
          if (translations[k]) next[i] = { ...next[i], text: translations[k] }
        })
        if (off + BATCH < nonEmptyIdx.length) {
          await new Promise((r) => setTimeout(r, 200))
        }
      }
      setDraft(next)
      message.success(`已翻译 ${nonEmptyIdx.length} 句（${translateMode === 'bilingual' ? '双语' : '替换'}）`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'AI 翻译失败'
      message.error(msg)
    } finally {
      setBatchTranslating(false)
    }
  }

  // 保存到原字幕文件
  const handleSave = async () => {
    // 校验
    for (let i = 0; i < draft.length; i++) {
      const s = draft[i]
      if (!s.text.trim()) {
        message.error(`第 ${i + 1} 句文本不能为空`)
        return
      }
      if (s.end < s.start) {
        message.error(`第 ${i + 1} 句结束时间早于开始时间`)
        return
      }
      if (s.start < 0 || s.end < 0) {
        message.error(`第 ${i + 1} 句时间戳不能为负`)
        return
      }
    }
    setSaving(true)
    try {
      // 写回后端时只携带 index/start/end/text，其余字段（completed/repeat_count/favorited）
      // 由后端从数据库恢复，避免把内存中的临时进度覆盖到文件里
      const payload: Sentence[] = draft.map((s) => ({
        index: s.index,
        start: s.start,
        end: s.end,
        text: s.text,
        completed: s.completed,
        repeat_count: s.repeat_count,
        favorited: s.favorited,
      }))
      await mediaApi.updateSubtitle(mediaId, payload)
      message.success(`已保存 ${draft.length} 条字幕到原文件`)
      onSaved(draft)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '保存失败'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const aiReady = !!aiStatus?.enabled

  return (
    <div>
      {/* 工具栏 */}
      <div style={{
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: isPhone ? 8 : 10,
        background: 'var(--ac-bg-content, rgb(247, 243, 223))',
        border: '1.5px solid var(--color-border-soft)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <Tooltip title="整页调用 AI 翻译，非空句子逐条翻译">
          <Button
            type="primary"
            icon={<CloudOutlined />}
            onClick={handleBatchTranslate}
            loading={batchTranslating}
            disabled={!aiReady}
            size={isPhone ? 'middle' : 'small'}
            style={{ minHeight: 36 }}
          >
            AI 翻译全部
          </Button>
        </Tooltip>
        <Space size={4} style={{ marginLeft: 4 }}>
          <TranslationOutlined style={{ color: 'var(--color-text-secondary)' }} />
          <Text type="secondary" style={{ fontSize: 13 }}>模式</Text>
          <Select
            value={translateMode}
            onChange={(v) => setTranslateMode(v)}
            size={isPhone ? 'middle' : 'small'}
            style={{ width: 130 }}
            disabled={!aiReady}
            options={[
              { value: 'bilingual', label: '🌐 双语字幕' },
              { value: 'replace', label: '✍️ 替换原文' },
            ]}
          />
        </Space>
        <Space size={4} style={{ marginLeft: 4 }}>
          <GlobalOutlined style={{ color: 'var(--color-text-secondary)' }} />
          <Text type="secondary" style={{ fontSize: 13 }}>目标</Text>
          <Input
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            placeholder="Chinese"
            size={isPhone ? 'middle' : 'small'}
            style={{ width: 120 }}
            disabled={!aiReady}
          />
        </Space>
        {!aiReady && (
          <Tag color="default" style={{ margin: 0 }}>
            {aiStatus === null
              ? 'AI 状态加载中…'
              : 'AI 未启用（在「AI 设置」中配置 ECHOSUB_AI_* 环境变量）'}
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <Button
          icon={<CloseOutlined />}
          onClick={onCancel}
          size={isPhone ? 'middle' : 'small'}
          style={{ minHeight: 36 }}
        >
          取消
        </Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleSave}
          loading={saving}
          size={isPhone ? 'middle' : 'small'}
          style={{ minHeight: 36 }}
        >
          保存到字幕文件
        </Button>
      </div>

      {/* 句子编辑列表 */}
      <div
        style={{
          maxHeight: isPhone ? 'calc(100vh - 460px)' : 'calc(100vh - 500px)',
          minHeight: 200,
          overflowY: 'auto',
          border: '1.5px solid var(--color-border-soft)',
          borderRadius: 'var(--radius-lg)',
          padding: 8,
          background: 'var(--ac-bg-content, rgb(247, 243, 223))',
        }}
      >
        {draft.map((s, i) => (
          <div
            key={s.index}
            style={{
              padding: isPhone ? 10 : 8,
              marginBottom: 6,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.4)',
              border: '1px solid var(--color-border-soft)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
              flexWrap: 'wrap',
            }}>
              <Tag color="blue" style={{ margin: 0, minWidth: 36, textAlign: 'center' }}>
                #{i + 1}
              </Tag>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>开始</span>
              <InputNumber
                min={0}
                step={0.1}
                value={s.start}
                onChange={(v) => updateTime(i, 'start', Number(v) || 0)}
                size="small"
                style={{ width: 90 }}
              />
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>结束</span>
              <InputNumber
                min={0}
                step={0.1}
                value={s.end}
                onChange={(v) => updateTime(i, 'end', Number(v) || 0)}
                size="small"
                style={{ width: 90 }}
              />
              <div style={{ flex: 1 }} />
              <Tooltip title={aiReady ? 'AI 翻译本句' : 'AI 未启用'}>
                <Button
                  size="small"
                  icon={<TranslationOutlined />}
                  onClick={() => handleSingleTranslate(i)}
                  loading={singleTranslating === i}
                  disabled={!aiReady}
                  style={{ minWidth: 36, minHeight: 32 }}
                >
                  翻译
                </Button>
              </Tooltip>
            </div>
            <Input.TextArea
              value={s.text}
              onChange={(e) => updateText(i, e.target.value)}
              autoSize={{ minRows: 1, maxRows: 6 }}
              placeholder="字幕文本…"
              style={{ fontSize: isPhone ? 14 : 13 }}
            />
          </div>
        ))}
        {draft.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 40 }}>
            无字幕内容
          </div>
        )}
      </div>

      {batchTranslating && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '12px 24px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10, zIndex: 1000,
        }}>
          <Spin size="small" />
          <span>AI 翻译进行中…</span>
        </div>
      )}
    </div>
  )
}
