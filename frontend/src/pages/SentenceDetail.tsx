/**
 * 句子详情页（v0.9.0 起）
 *
 * 设计：
 * - 顶部展示原文 + 媒体名 + 时间戳
 * - 「整句翻译 / 语法 / 逐词」三块由后端 /ai/sentence-explain 一次返回
 * - 单词卡片可点击展开「词典详情」弹窗
 *   - v0.9.1：查词逻辑改为「本地优先 → AI 兜底」
 *     - 本地词典命中 + `preferLocalHit=true`：直接展示本地结果
 *     - 本地词典命中 + `preferLocalHit=false`：本地为主 + AI 并列展示
 *     - 本地词典未命中：调用 AI 兜底
 * - 响应式：手机端 1 列、桌面 2 列（翻译 + 解析）
 *
 * 入口：
 * - 路由 /play/:id/sentence/:idx（从 MediaPlayer 句子点击进入）
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Divider, Empty, Modal, Skeleton, Space, Spin, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ArrowLeftOutlined, SoundOutlined,
  BulbOutlined, ReloadOutlined, BookOutlined,
  CheckCircleFilled, ClockCircleOutlined,
  BookFilled, RobotFilled,
} from '@ant-design/icons'
import { aiApi, localDictApi, mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useDictionaryStore } from '@/store/dictionary'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type {
  AIStatus, DictionaryResponse, Sentence, SentenceExplainResponse,
  LocalDictLookupEntry, LocalDictLookupResponse,
} from '@/types'

const { Text, Title, Paragraph } = Typography

/** 把秒数格式化为 HH:MM:SS.mmm */
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

/** 单词弹窗状态（v0.9.1：支持本地 + AI 两种来源） */
type WordLookupState = {
  word: string
  loadingLocal: boolean
  loadingAi: boolean
  /** 本地命中条目（可能为空数组） */
  localEntries: LocalDictLookupEntry[]
  /** 是否已尝试本地查词 */
  localTried: boolean
  /** AI 命中（null = 未命中或未尝试） */
  aiEntry: DictionaryResponse | null
  /** 是否已尝试 AI */
  aiTried: boolean
  /** 整体错误（本地 / AI 都不可用时显示） */
  error: string | null
}

const EMPTY_LOOKUP: WordLookupState = {
  word: '',
  loadingLocal: false,
  loadingAi: false,
  localEntries: [],
  localTried: false,
  aiEntry: null,
  aiTried: false,
  error: null,
}

export default function SentenceDetailPage() {
  const navigate = useNavigate()
  const { id, idx } = useParams<{ id: string; idx: string }>()
  const { isPhone } = useDeviceSize()
  const token = useAuthStore((s) => s.token)
  const { defaultSourceId, localDicts, preferLocalHit, setLocalDicts } = useDictionaryStore()

  const [mediaName, setMediaName] = useState<string>('')
  const [sentence, setSentence] = useState<Sentence | null>(null)
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)

  const [explain, setExplain] = useState<SentenceExplainResponse | null>(null)
  const [loadingExplain, setLoadingExplain] = useState(false)
  const [errorExplain, setErrorExplain] = useState<string | null>(null)

  // 单词词典弹窗
  const [wordLookup, setWordLookup] = useState<WordLookupState | null>(null)

  // 是否启用本地查词（依赖：用户上传了至少一本本地词典）
  const localAvailable = localDicts.length > 0

  // 0. 懒加载本地词典列表（v0.9.1）
  //   用户可能直接通过句子点击进入此页而未访问设置页，
  //   此处补一次拉取，保证 localDicts 非空时能立即启用本地查词
  useEffect(() => {
    if (!token) return
    // TTL 30 分钟，避免每次进页面都请求
    const TTL_MS = 30 * 60 * 1000
    const age = Date.now() - (useDictionaryStore.getState().localDictsFetchedAt ?? 0)
    if (age < TTL_MS && useDictionaryStore.getState().localDicts.length > 0) return
    let cancelled = false
    localDictApi.list()
      .then((res) => {
        if (cancelled) return
        setLocalDicts(res.data.data.dictionaries ?? [])
      })
      .catch(() => { /* 静默失败：本地词典不可用就走 AI 兜底 */ })
    return () => { cancelled = true }
  }, [token, setLocalDicts])

  // 1. 拉取媒体元数据 + 字幕（含该句）
  useEffect(() => {
    if (!id || !token) return
    let cancelled = false
    setLoadingMeta(true)
    setErrorMeta(null)
    Promise.all([
      mediaApi.get(Number(id)),
      mediaApi.subtitle(Number(id)).catch(() => null),
      aiApi.status().catch(() => null),
    ])
      .then(([mRes, sRes, aRes]) => {
        if (cancelled) return
        const m = (mRes.data.data as { media: { name: string } }).media
        setMediaName(m.name)
        const sentenceIdx = Number(idx)
        if (sRes && sRes.data.data?.sentences) {
          const s = sRes.data.data.sentences.find((x: Sentence) => x.index === sentenceIdx)
          setSentence(s ?? null)
        }
        if (aRes) setAiStatus(aRes.data.data)
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMeta((err as { message?: string })?.message ?? '加载失败')
        }
      })
      .finally(() => { if (!cancelled) setLoadingMeta(false) })
    return () => { cancelled = true }
  }, [id, idx, token])

  // 2. 拉取句子解释
  const loadExplain = () => {
    if (!sentence) return
    setLoadingExplain(true)
    setErrorExplain(null)
    aiApi.sentenceExplain({
      sentence: sentence.text,
      target_lang: aiStatus?.target_lang || 'Chinese',
    })
      .then((res) => setExplain(res.data.data))
      .catch((err) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '解释失败'
        setErrorExplain(msg)
      })
      .finally(() => setLoadingExplain(false))
  }
  useEffect(() => { if (sentence) loadExplain() }, [sentence?.index, sentence?.text]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3. 单词查词（v0.9.1：本地优先 → AI 兜底）
  //
  // 策略：
  //   a) 若本地词典可用，先调 localDictApi.lookup
  //   b) 本地命中 + preferLocalHit=true：直接展示本地结果，不再调 AI
  //   c) 本地命中 + preferLocalHit=false：本地为主，并并行调 AI 增强
  //   d) 本地未命中：调 AI 兜底
  //   e) 本地不可用：直接调 AI
  const handleWordClick = async (word: string) => {
    if (!sentence) return
    const initial: WordLookupState = {
      ...EMPTY_LOOKUP,
      word,
      loadingLocal: localAvailable,
    }
    setWordLookup(initial)

    // 1) 先查本地
    let localRes: LocalDictLookupResponse | null = null
    if (localAvailable) {
      try {
        const r = await localDictApi.lookup({ word, sentence: sentence.text })
        localRes = r.data.data
      } catch {
        // 本地查询失败不阻塞，交给 AI 兜底
        localRes = null
      }
    }
    const localHit = !!localRes && localRes.found && localRes.entries.length > 0

    // 2) 决定是否调 AI
    const needAi = !localHit || !preferLocalHit
    if (!needAi) {
      // 命中本地 + preferLocalHit=true：直接展示本地
      setWordLookup({
        ...initial,
        localEntries: localRes?.entries ?? [],
        localTried: true,
        loadingLocal: false,
      })
      return
    }

    // 3) 并行/串行调 AI 兜底（或增强）
    //    - 本地未命中：AI 是唯一来源
    //    - 本地命中 + preferLocalHit=false：本地先展示，AI 并行加载
    setWordLookup((prev) => ({
      ...(prev ?? initial),
      localEntries: localRes?.entries ?? [],
      localTried: localAvailable,
      loadingLocal: false,
      loadingAi: true,
    }))

    try {
      const aiRes = await aiApi.dictionary({
        word,
        sentence: sentence.text,
        target_lang: aiStatus?.target_lang || 'Chinese',
      })
      setWordLookup((prev) => ({
        ...(prev ?? initial),
        aiEntry: aiRes.data.data,
        aiTried: true,
        loadingAi: false,
      }))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '查词失败'
      setWordLookup((prev) => {
        const next = { ...(prev ?? initial), aiTried: true, loadingAi: false }
        // 本地也无结果时，error 才有意义
        if (!next.localEntries || next.localEntries.length === 0) {
          next.error = msg
        }
        return next
      })
    }
  }

  // 4. 跳回播放器并跳到该句
  const handleBackToPlayer = () => {
    navigate(`/play/${id}?t=${sentence?.start ?? 0}`)
  }

  // 5. TTS 朗读单词
  const handleSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) {
      message.warning('当前浏览器不支持语音合成')
      return
    }
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = 0.95
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch {
      message.error('朗读失败')
    }
  }

  const timeRange = useMemo(() => {
    if (!sentence) return ''
    return `${fmtTime(sentence.start)} → ${fmtTime(sentence.end)}`
  }, [sentence])

  if (loadingMeta) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    )
  }
  if (errorMeta) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" message={errorMeta} showIcon />
        <Button style={{ marginTop: 16 }} onClick={() => navigate(-1)}>返回</Button>
      </div>
    )
  }
  if (!sentence) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description={`未找到第 ${idx} 句`} />
        <Button style={{ marginTop: 16 }} onClick={() => navigate(-1)}>返回播放器</Button>
      </div>
    )
  }

  return (
    <div style={{ padding: isPhone ? '12px 12px 60px' : '16px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>
      {/* 顶部返回栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Button
          type="text"
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          aria-label="返回"
        />
        <Title level={4} style={{ margin: 0, color: 'var(--ac-text-header, #794f27)', fontWeight: 800 }}>
          📖 句子详情
        </Title>
        <div style={{ flex: 1 }} />
        <Tag color="blue">
          <ClockCircleOutlined /> {timeRange}
        </Tag>
        <Tooltip title="跳回播放器并定位到该句">
          <Button
            icon={<SoundOutlined />}
            onClick={handleBackToPlayer}
            size={isPhone ? 'middle' : 'large'}
            style={{ borderRadius: 10, minHeight: 44 }}
          >
            回到播放
          </Button>
        </Tooltip>
      </div>

      {/* AI 状态提示 */}
      {aiStatus && !aiStatus.enabled && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12 }}
          message="AI 未配置"
          description={
            <span>
              请在「设置 → AI 翻译」中配置 <Text code>ECHOSUB_AI_API_KEY</Text> 后重启后端。配置完成后句子解释 / 查词功能即可使用。
            </span>
          }
        />
      )}

      {/* 原文卡片 */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 20,
          border: 'none',
          background: 'var(--color-bg-elevated, #fff)',
          boxShadow: 'var(--color-shadow-card, 0 2px 12px rgba(0,0,0,0.04))',
        }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '20px 24px' } }}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {mediaName} · 第 {sentence.index + 1} 句
          </Text>
          <Paragraph
            style={{
              fontSize: isPhone ? 18 : 22,
              fontWeight: 600,
              lineHeight: 1.6,
              margin: 0,
              color: 'var(--color-text-primary, #1a1a1a)',
            }}
          >
            {sentence.text}
          </Paragraph>
          <Space>
            <Tooltip title="朗读原句">
              <Button
                type="text"
                icon={<SoundOutlined />}
                onClick={() => handleSpeak(sentence.text)}
              />
            </Tooltip>
            <Tag color="purple">
              默认词典：{defaultSourceId === 'ai' ? '🤖 AI' : '📕 本地'}
            </Tag>
          </Space>
        </Space>
      </Card>

      {/* 解释区（加载 / 错误 / 内容） */}
      {loadingExplain ? (
        <Card style={{ borderRadius: 20, border: 'none' }} styles={{ body: { padding: 24 } }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : errorExplain ? (
        <Alert
          type="error"
          showIcon
          message="句子解释失败"
          description={errorExplain}
          action={
            <Button size="small" onClick={loadExplain} icon={<ReloadOutlined />}>
              重试
            </Button>
          }
          style={{ borderRadius: 12 }}
        />
      ) : explain ? (
        <SentenceExplainView explain={explain} onWordClick={handleWordClick} isPhone={isPhone} />
      ) : null}

      {/* 单条单词词典弹窗 */}
      <Modal
        title={<Space><BookOutlined /> {wordLookup?.word ?? ''}</Space>}
        open={!!wordLookup}
        onCancel={() => setWordLookup(null)}
        footer={null}
        width={isPhone ? '95vw' : 680}
        destroyOnHidden
      >
        {wordLookup && (
          <WordLookupView
            state={wordLookup}
            onSpeak={handleSpeak}
            isPhone={isPhone}
          />
        )}
      </Modal>
    </div>
  )
}

/** 句子解释视图 */
function SentenceExplainView({
  explain, onWordClick, isPhone,
}: {
  explain: SentenceExplainResponse
  onWordClick: (word: string) => void
  isPhone: boolean
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
      gap: 16,
    }}>
      {/* 翻译 */}
      <Card
        style={{ borderRadius: 20, border: 'none', background: 'var(--color-bg-elevated, #fff)' }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '20px 24px' } }}
      >
        <SectionHeader emoji="🌐" title="整句翻译" />
        {explain.translation ? (
          <Paragraph style={{ fontSize: isPhone ? 15 : 17, lineHeight: 1.7, margin: 0 }}>
            {explain.translation}
          </Paragraph>
        ) : (
          <Text type="secondary">未提供翻译</Text>
        )}
        {explain.notes && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <SectionHeader emoji="💡" title="学习提示" small />
            <Paragraph style={{ color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              {explain.notes}
            </Paragraph>
          </>
        )}
      </Card>

      {/* 语法 */}
      <Card
        style={{ borderRadius: 20, border: 'none', background: 'var(--color-bg-elevated, #fff)' }}
        styles={{ body: { padding: isPhone ? '14px 16px' : '20px 24px' } }}
      >
        <SectionHeader emoji="📐" title="语法解析" />
        {explain.grammar ? (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Tag color="geekblue" style={{ fontSize: 12 }}>{explain.grammar.pattern || '句型'}</Tag>
            <Paragraph style={{ fontSize: isPhone ? 14 : 15, lineHeight: 1.7, margin: 0 }}>
              {explain.grammar.description}
            </Paragraph>
            {explain.grammar.key_phrases && explain.grammar.key_phrases.length > 0 && (
              <Space wrap size={4}>
                {explain.grammar.key_phrases.map((p, i) => (
                  <Tag key={i} color="purple">{p}</Tag>
                ))}
              </Space>
            )}
          </Space>
        ) : (
          <Text type="secondary">未提供语法解析</Text>
        )}
      </Card>

      {/* 逐词拆解（占整行） */}
      {explain.words && explain.words.length > 0 && (
        <Card
          style={{ gridColumn: '1 / -1', borderRadius: 20, border: 'none', background: 'var(--color-bg-elevated, #fff)' }}
          styles={{ body: { padding: isPhone ? '14px 16px' : '20px 24px' } }}
        >
          <SectionHeader emoji="🔍" title={`逐词拆解（${explain.words.length} 个词）`} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {explain.words.map((w, i) => (
              <div
                key={i}
                onClick={() => onWordClick(w.lemma || w.word)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onWordClick(w.lemma || w.word) }}
                style={{
                  background: 'var(--color-bg-page, #fafafa)',
                  borderRadius: 14,
                  padding: 12,
                  cursor: 'pointer',
                  border: '1px solid var(--color-border-soft, rgba(0,0,0,0.06))',
                  transition: 'all 0.2s',
                  minHeight: 80,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <Space size={6} wrap>
                  <Text strong style={{ fontSize: 15, color: 'var(--ant-color-primary)' }}>{w.word}</Text>
                  {w.lemma && w.lemma !== w.word && (
                    <Text type="secondary" style={{ fontSize: 12 }}>原形 {w.lemma}</Text>
                  )}
                  {w.pos && <Tag color="cyan" style={{ fontSize: 10 }}>{w.pos}</Tag>}
                </Space>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
                  {w.meaning || <Text type="secondary">—</Text>}
                </div>
                {w.note && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    <BulbOutlined /> {w.note}
                  </div>
                )}
                <div style={{ marginTop: 6, textAlign: 'right' }}>
                  <Button
                    type="link"
                    size="small"
                    icon={<BookOutlined />}
                    onClick={(e) => { e.stopPropagation(); onWordClick(w.lemma || w.word) }}
                  >
                    词典详情
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/** 单词查词结果视图（v0.9.1：本地 + AI 双视图） */
function WordLookupView({
  state, onSpeak, isPhone,
}: {
  state: WordLookupState
  onSpeak: (text: string) => void
  isPhone: boolean
}) {
  // 加载中
  if (state.loadingLocal || state.loadingAi) {
    return (
      <div>
        <Skeleton active paragraph={{ rows: 4 }} />
        {state.loadingAi && state.localEntries.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
            <RobotFilled /> AI 增强中…
          </Text>
        )}
      </div>
    )
  }
  // 整体错误：本地 + AI 都没结果
  if (state.error && state.localEntries.length === 0 && !state.aiEntry) {
    return <Alert type="error" showIcon message={state.error} />
  }
  // 都没命中
  if (state.localEntries.length === 0 && !state.aiEntry) {
    return <Empty description={`未找到 "${state.word}" 的释义`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <div>
      {/* 本地命中（可能多条） */}
      {state.localEntries.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <BookFilled style={{ color: 'var(--ant-color-primary)' }} />
            <Text strong style={{ fontSize: 14 }}>本地词典命中</Text>
            <Tag color="green">{state.localEntries.length} 条</Tag>
          </div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {state.localEntries.map((e, i) => (
              <LocalDictEntryCard key={`${e.dict_id}-${i}`} entry={e} onSpeak={onSpeak} isPhone={isPhone} />
            ))}
          </Space>
        </div>
      )}

      {/* AI 结果（兜底或增强） */}
      {state.aiEntry && (
        <div>
          {state.localEntries.length > 0 && <Divider style={{ margin: '8px 0 12px' }}>AI 增强</Divider>}
          <DictionaryView entry={state.aiEntry} onSpeak={onSpeak} />
        </div>
      )}
    </div>
  )
}

/** 本地词典单条命中（v0.9.1） */
function LocalDictEntryCard({
  entry, onSpeak, isPhone,
}: {
  entry: LocalDictLookupEntry
  onSpeak: (text: string) => void
  isPhone: boolean
}) {
  const matchedLabel = entry.matched_by === 'exact'
    ? '精确'
    : entry.matched_by.startsWith('lemma:')
      ? `原形 ${entry.matched_by.slice(6)}`
      : entry.matched_by
  return (
    <div
      style={{
        background: 'var(--color-bg-page, #fafafa)',
        borderRadius: 12,
        padding: isPhone ? '10px 12px' : '12px 14px',
        border: '1px solid var(--color-border-soft, rgba(0,0,0,0.06))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text strong style={{ fontSize: 16, color: 'var(--ant-color-primary)' }}>{entry.word}</Text>
        <Tooltip title="朗读">
          <Button
            type="text"
            size="small"
            icon={<SoundOutlined />}
            onClick={() => onSpeak(entry.word)}
          />
        </Tooltip>
        {entry.word !== entry.original && (
          <Text type="secondary" style={{ fontSize: 12 }}>原词 {entry.original}</Text>
        )}
        <Tag color={entry.matched_by === 'exact' ? 'green' : 'orange'} style={{ fontSize: 11 }}>
          {matchedLabel}
        </Tag>
        <div style={{ flex: 1 }} />
        <Text type="secondary" style={{ fontSize: 11 }}>📕 {entry.dict_name}</Text>
      </div>
      {entry.phonetic && (
        <div style={{ marginTop: 4 }}>
          <Text code style={{ fontSize: 12 }}>{entry.phonetic}</Text>
        </div>
      )}
      <Paragraph style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        {entry.translation}
      </Paragraph>
    </div>
  )
}

/** AI 字典查询结果视图 */
function DictionaryView({ entry, onSpeak }: { entry: DictionaryResponse; onSpeak: (text: string) => void }) {
  return (
    <div>
      {/* 来源标签 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <RobotFilled style={{ color: 'var(--ant-color-primary)' }} />
        <Text strong style={{ fontSize: 14 }}>AI 词典</Text>
        <Tag color="blue">结构化</Tag>
      </div>
      {/* 词头 + 音标 */}
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>{entry.headword}</Title>
          <Button type="text" size="small" icon={<SoundOutlined />} onClick={() => onSpeak(entry.headword)} />
        </Space>
        {(entry.pronunciation.uk || entry.pronunciation.us) && (
          <Space size={12}>
            {entry.pronunciation.uk && (
              <span><Text type="secondary">英</Text> <Text code>{entry.pronunciation.uk}</Text></span>
            )}
            {entry.pronunciation.us && (
              <span><Text type="secondary">美</Text> <Text code>{entry.pronunciation.us}</Text></span>
            )}
          </Space>
        )}
      </Space>
      <Divider style={{ margin: '12px 0' }} />

      {/* 词义 */}
      {entry.meanings.length === 0 ? (
        <Empty description="该词无词义信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        entry.meanings.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <Space size={4} wrap>
              {m.part_of_speech && <Tag color="geekblue" style={{ fontSize: 11 }}>{m.part_of_speech}</Tag>}
              {m.translation.map((t, j) => (
                <Text key={j} strong style={{ fontSize: 14 }}>{t}</Text>
              ))}
            </Space>
            {m.definition && (
              <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {m.definition}
              </Paragraph>
            )}
            {m.examples && m.examples.length > 0 && (
              <div style={{ marginTop: 4, paddingLeft: 12, borderLeft: '2px solid var(--color-border-soft, rgba(0,0,0,0.06))' }}>
                {m.examples.map((e, k) => (
                  <div key={k} style={{ fontSize: 12, lineHeight: 1.6, margin: '2px 0' }}>
                    <Text>{e.sentence}</Text>
                    {e.translation && <div><Text type="secondary">{e.translation}</Text></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* 词族 */}
      {entry.word_family && entry.word_family.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }}>词族</Divider>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {entry.word_family.map((w, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                <Text strong>{w.word}</Text>
                {w.part_of_speech && <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{w.part_of_speech}</Text>}
                {w.meaning && <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>· {w.meaning}</span>}
              </div>
            ))}
          </Space>
        </>
      )}

      {/* 词源 */}
      {entry.etymology && (
        <>
          <Divider style={{ margin: '12px 0' }}>词源</Divider>
          <Paragraph style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{entry.etymology}</Paragraph>
        </>
      )}

      {/* 学习提示 */}
      {entry.learner_tips && entry.learner_tips.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }}>💡 学习提示</Divider>
          <Space direction="vertical" size={2}>
            {entry.learner_tips.map((t, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.6 }}>
                <CheckCircleFilled style={{ color: 'var(--ant-color-success)', marginRight: 6, fontSize: 12 }} />
                {t}
              </div>
            ))}
          </Space>
        </>
      )}
    </div>
  )
}

function SectionHeader({ emoji, title, small }: { emoji: string; title: string; small?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ fontSize: small ? 14 : 16 }}>{emoji}</span>
      <span style={{ fontSize: small ? 13 : 15, fontWeight: 700, color: 'var(--color-text-primary, #1a1a1a)' }}>{title}</span>
    </div>
  )
}
