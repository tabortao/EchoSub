/** 句子详情页（v0.9.0 起，v1.1.0 重构查词逻辑）
 *
 * 设计：
 * - 顶部展示原文 + 媒体名 + 时间戳
 * - 「整句翻译 / 语法 / 逐词」三块由后端 /ai/sentence-explain 一次返回
 * - 单词卡片可点击展开「词典详情」弹窗
 *   - v1.1.0 严格按用户「默认词典源」分派（不再"本地优先 → AI 兑底"混合）：
 *     - 'ai'       → 仅调 AI 词典
 *     - 'local'    → 仅查本地词典
 *     - 'builtin'  → 仅查内置 ECDict
 *     - 'youdao' / 'cambridge' / ... → 直接在新标签页打开网页
 *   - 弹窗底部始终保留一组「其他词典」快捷入口（包含所有可用源 + 网页词典）
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
  BookFilled, RobotFilled, DatabaseOutlined,
} from '@ant-design/icons'
import { aiApi, builtinDictApi, localDictApi, mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useDictionaryStore } from '@/store/dictionary'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import { kWebDictConfigs, getWebDictConfig, lookupWebDictionary } from '@/store/webDictionaryConfig'
import type {
  AIStatus, DictionaryResponse, Sentence, SentenceExplainResponse,
  BuiltinDictLookupResponse, LocalDictLookupEntry, LocalDictLookupResponse, DictionarySourceId,
} from '@/types'

const { Text, Title, Paragraph } = Typography

/** v1.1.0：判断指定 sourceId 是否是网页词典（有道/Cambridge/...） */
function isWebDictionary(id: DictionarySourceId | string | undefined | null): boolean {
  if (!id) return false
  return kWebDictConfigs.some((c) => c.id === id)
}

/** v1.1.0：根据 sourceId 拿到显示标签（AI/本地/内置/有道/...） */
function getSourceLabel(id: DictionarySourceId | string | undefined | null): string {
  if (!id) return '🤖 AI'
  if (id === 'ai') return '🤖 AI 词典'
  if (id === 'local') return '📕 本地词典'
  if (id === 'builtin') return '📚 内置词典'
  const cfg = getWebDictConfig(id)
  if (cfg) return `${cfg.icon} ${cfg.displayName}`
  return id
}

/** 把秒数格式化为 HH:MM:SS.mmm */
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

/**
 * 句子分词（v1.2.0）
 * - 把字幕原文按"单词 / 分隔符"切分
 * - 单词 = 连续字母/数字/连字符/撇号（如 don't / well-known）
 * - 标点 / 空格作为独立分隔符 token 保留渲染
 * - 不依赖 AI / 后端，纯前端正则，AI explain 失败也不影响查词
 */
export interface SentenceToken {
  text: string
  kind: 'word' | 'sep'
}

const WORD_PATTERN = /[A-Za-z][A-Za-z0-9'\-]*/g

export function splitSentenceTokens(text: string): SentenceToken[] {
  const tokens: SentenceToken[] = []
  let last = 0
  for (const m of text.matchAll(WORD_PATTERN)) {
    const start = m.index ?? 0
    if (start > last) {
      tokens.push({ text: text.slice(last, start), kind: 'sep' })
    }
    tokens.push({ text: m[0], kind: 'word' })
    last = start + m[0].length
  }
  if (last < text.length) {
    tokens.push({ text: text.slice(last), kind: 'sep' })
  }
  return tokens
}

/** v1.1.0 单词弹窗状态：严格按「单一来源」加载
 * - kind 标识当前来源：'ai' | 'local' | 'builtin' | 'web'
 * - 每种来源只对应一种数据
 */
type WordLookupState = {
  word: string
  kind: 'ai' | 'local' | 'builtin' | 'web'
  loading: boolean
  aiEntry: DictionaryResponse | null
  localData: LocalDictLookupResponse | null
  builtinData: BuiltinDictLookupResponse | null
  webUrl: string
  error: string | null
}

const EMPTY_LOOKUP: WordLookupState = {
  word: '',
  kind: 'ai',
  loading: false,
  aiEntry: null,
  localData: null,
  builtinData: null,
  webUrl: '',
  error: null,
}

export default function SentenceDetailPage() {
  const navigate = useNavigate()
  const { id, idx } = useParams<{ id: string; idx: string }>()
  const { isPhone } = useDeviceSize()
  const token = useAuthStore((s) => s.token)
  const { defaultSourceId, localDicts, setLocalDicts } = useDictionaryStore()

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

  // 3. 单词查词（v1.1.0 严格按设置源分派 + v1.2.0 AI 未启用/失败时回退到内置词典）
  //
  // 策略：完全依照 useDictionaryStore.defaultSourceId 派发，不再做"本地优先 → AI 兑底"混合。
  //   - 'ai' / 'local' / 'builtin' → 弹窗展示单源结果
  //   - 'youdao' / 'cambridge' / ... → 直接 window.open 打开网页，不弹弹窗
  //   - 弹窗底部始终保留一组「其他词典」快捷入口（含全部源 + 7 个网页词典）
  //
  // v1.2.0 新增：
  //   - AI 未启用时（aiStatus.enabled === false）默认回退到内置 ECDICT 查词
  //   - 用户主动把默认源设成 AI 但本次请求 AI 失败时，自动回退到内置词典
  //   - 避免出现「未配置 AI 翻译但单词查词完全打不开」的体验断层
  const handleWordClick = async (word: string) => {
    if (!sentence) return

    // 1) 网页词典：直接打开新标签页（不弹弹窗）
    if (isWebDictionary(defaultSourceId)) {
      const cfg = getWebDictConfig(defaultSourceId)
      if (cfg) {
        const url = lookupWebDictionary(cfg, word)
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer')
        } else {
          message.warning('该网页词典暂不可用')
        }
      }
      return
    }

    // 2) 单源弹窗
    let kind: WordLookupState['kind'] =
      defaultSourceId === 'local' ? 'local'
        : defaultSourceId === 'builtin' ? 'builtin'
          : 'ai' // 兜底为 AI

    // v1.2.0：AI 通道不可用时（未配置 / 未启用），自动回退到内置词典查词
    if (kind === 'ai' && aiStatus && aiStatus.enabled === false) {
      kind = 'builtin'
    }

    setWordLookup({ ...EMPTY_LOOKUP, word, kind, loading: true })

    if (kind === 'ai') {
      try {
        const r = await aiApi.dictionary({
          word,
          sentence: sentence.text,
          target_lang: aiStatus?.target_lang || 'Chinese',
        })
        setWordLookup({
          word, kind, loading: false,
          aiEntry: r.data.data, localData: null, builtinData: null, webUrl: '', error: null,
        })
        return
      } catch (err: unknown) {
        // v1.2.0：AI 查词失败时自动回退到内置词典，避免弹错误
        try {
          const fallback = await builtinDictApi.lookup(word)
          setWordLookup({
            word, kind: 'builtin', loading: false,
            aiEntry: null, localData: null, builtinData: fallback.data.data, webUrl: '',
            error: null,
          })
          message.info('AI 词典不可用，已自动切换到内置 ECDICT')
          return
        } catch {
          // 内置也失败 → 暴露 AI 的原始错误
        }
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '查词失败'
        setWordLookup({ word, kind, loading: false, aiEntry: null, localData: null, builtinData: null, webUrl: '', error: msg })
        return
      }
    }

    if (kind === 'local') {
      if (localDicts.length === 0) {
        setWordLookup({ word, kind, loading: false, aiEntry: null, localData: null, builtinData: null, webUrl: '', error: '尚未上传任何本地词典，请先在「设置 → 词典」中上传' })
        return
      }
      try {
        const r = await localDictApi.lookup({ word, sentence: sentence.text })
        setWordLookup({ word, kind, loading: false, aiEntry: null, localData: r.data.data, builtinData: null, webUrl: '', error: null })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '本地查词失败'
        setWordLookup({ word, kind, loading: false, aiEntry: null, localData: null, builtinData: null, webUrl: '', error: msg })
      }
      return
    }

    // builtin
    try {
      const r = await builtinDictApi.lookup(word)
      setWordLookup({ word, kind, loading: false, aiEntry: null, localData: null, builtinData: r.data.data, webUrl: '', error: null })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '内置词典查词失败'
      setWordLookup({ word, kind, loading: false, aiEntry: null, localData: null, builtinData: null, webUrl: '', error: msg })
    }
  }

  // 4. 跳回播放器并跳到该句
  const handleBackToPlayer = () => {
    navigate(`/play/${id}?t=${sentence?.start ?? 0}`)
  }

  // 4.5 在弹窗中切换词典源（v1.1.0）
  //   弹窗底部按钮组调用：kind 保持 word 不变，只切源
  const handleSwitchSource = (sourceId: 'ai' | 'local' | 'builtin') => {
    if (!wordLookup) return
    const word = wordLookup.word
    setWordLookup(null)
    // 用 nextTick 让弹窗先关再开，避免动画冲突
    setTimeout(() => {
      // 临时把 store 里的默认源改为 sourceId，触发对应分支
      const original = useDictionaryStore.getState().defaultSourceId
      useDictionaryStore.getState().setDefault(sourceId)
      handleWordClick(word)
        .finally(() => {
          // 还原默认源
          useDictionaryStore.getState().setDefault(original)
        })
    }, 100)
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

      {/* AI 状态提示（v1.2.0：未启用时仍可继续查词，自动回退到内置词典） */}
      {aiStatus && !aiStatus.enabled && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12 }}
          message="AI 翻译未配置"
          description={
            <span>
              句子整段翻译 / 语法讲解需要 <Text code>ECHOSUB_AI_API_KEY</Text>；未配置时不影响单词查词——系统会自动改用「内置 ECDICT」词典（离线、零 token 消耗）。
            </span>
          }
        />
      )}

      {/* 原文卡片（v1.2.0：单词可点击查词） */}
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
              lineHeight: 1.8,
              margin: 0,
              color: 'var(--color-text-primary, #1a1a1a)',
            }}
          >
            {splitSentenceTokens(sentence.text).map((tok, i) => {
              if (tok.kind === 'sep') {
                return <span key={i}>{tok.text}</span>
              }
              return (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`查词 ${tok.text}`}
                  onClick={() => handleWordClick(tok.text)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleWordClick(tok.text)
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 4,
                    padding: '0 2px',
                    margin: '0 1px',
                    color: 'var(--ant-color-primary)',
                    borderBottom: '1px dashed transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--ant-color-primary-bg, rgba(105,192,255,0.12))'
                    e.currentTarget.style.borderBottomColor = 'var(--ant-color-primary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderBottomColor = 'transparent'
                  }}
                >
                  {tok.text}
                </span>
              )
            })}
          </Paragraph>
          <Space wrap>
            <Tooltip title="朗读原句">
              <Button
                type="text"
                icon={<SoundOutlined />}
                onClick={() => handleSpeak(sentence.text)}
              />
            </Tooltip>
            <Tag color="purple">
              默认词典：{getSourceLabel(defaultSourceId)}
            </Tag>
            {aiStatus && !aiStatus.enabled && defaultSourceId === 'ai' && (
              <Tag color="orange">
                AI 未启用 · 查词自动回退到内置词典
              </Tag>
            )}
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
            onSwitchSource={handleSwitchSource}
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

/**
 * 单词查词结果视图（v1.1.0：单源视图）
 *
 * 严格按 useDictionaryStore.defaultSourceId 显示：
 *   - kind='ai'      → 仅渲染 AI 词典
 *   - kind='local'   → 仅渲染本地词典
 *   - kind='builtin' → 仅渲染内置 ECDICT
 *   - kind='web'     → 仅显示已跳转提示
 *
 * 底部始终保留「网页词典」快捷跳转 + 「其他词典」快捷切换入口。
 */
function WordLookupView({
  state, onSpeak, onSwitchSource, isPhone,
}: {
  state: WordLookupState
  onSpeak: (text: string) => void
  onSwitchSource: (sourceId: 'ai' | 'local' | 'builtin') => void
  isPhone: boolean
}) {
  // 加载中
  if (state.loading) {
    return <Skeleton active paragraph={{ rows: 4 }} />
  }
  // 整体错误
  if (state.error) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Alert type="error" showIcon message={state.error} />
        <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
      </Space>
    )
  }

  // 1) AI 词典视图
  if (state.kind === 'ai') {
    if (!state.aiEntry) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Empty description={`未找到 "${state.word}" 的释义`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
        </Space>
      )
    }
    return (
      <div>
        <DictionaryView entry={state.aiEntry} onSpeak={onSpeak} />
        <Divider style={{ margin: '12px 0 8px' }}>其他词典</Divider>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          切换到本地词典或内置 ECDict 离线查词；点击网页词典按钮在新标签页打开 "{state.word}" 释义
        </Text>
        <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
        <WebDictButtons word={state.word} />
      </div>
    )
  }

  // 2) 本地词典视图
  if (state.kind === 'local') {
    const entries = state.localData?.entries ?? []
    if (entries.length === 0) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Empty
            description={
              state.localData
                ? `本地词典未收录「${state.word}」`
                : '本地词典暂无数据'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
          <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
        </Space>
      )
    }
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <BookFilled style={{ color: 'var(--ant-color-primary)' }} />
          <Text strong style={{ fontSize: 14 }}>本地词典命中</Text>
          <Tag color="green">{entries.length} 条</Tag>
        </div>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {entries.map((e, i) => (
            <LocalDictEntryCard key={`${e.dict_id}-${i}`} entry={e} onSpeak={onSpeak} isPhone={isPhone} />
          ))}
        </Space>
        <Divider style={{ margin: '12px 0 8px' }}>其他词典</Divider>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          切换到 AI 词典获取结构化解释，或到内置 ECDict 查更全词库
        </Text>
        <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
        <WebDictButtons word={state.word} />
      </div>
    )
  }

  // 3) 内置 ECDICT 视图
  if (state.kind === 'builtin') {
    const entries = state.builtinData?.entries ?? []
    if (entries.length === 0) {
      return (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Empty
            description={
              state.builtinData
                ? `内置词典未收录「${state.word}」`
                : '内置词典未导入'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
          <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
        </Space>
      )
    }
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <DatabaseOutlined style={{ color: 'var(--ant-color-primary)' }} />
          <Text strong style={{ fontSize: 14 }}>内置 ECDICT</Text>
          <Tag color="green">{entries.length} 条</Tag>
        </div>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {entries.map((e, i) => (
            <BuiltinDictEntryCard key={`${e.word}-${e.pos}-${i}`} entry={e} onSpeak={onSpeak} isPhone={isPhone} />
          ))}
        </Space>
        <Divider style={{ margin: '12px 0 8px' }}>其他词典</Divider>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          切换到 AI 词典获取结构化解释，或到本地词典查询自建词库
        </Text>
        <SourceSwitchRow currentKind={state.kind} onSwitch={onSwitchSource} />
        <WebDictButtons word={state.word} />
      </div>
    )
  }

  // 4) web 兜底（一般不会进到这里；handleWordClick 已直接 window.open）
  return <Empty description="已在新标签页打开网页词典" image={Empty.PRESENTED_IMAGE_SIMPLE} />
}

/** 单源切换按钮组：AI / 本地 / 内置（v1.1.0 新增） */
function SourceSwitchRow({
  currentKind, onSwitch,
}: {
  currentKind: WordLookupState['kind']
  onSwitch: (sourceId: 'ai' | 'local' | 'builtin') => void
}) {
  const items: Array<{ id: 'ai' | 'local' | 'builtin'; icon: React.ReactNode; label: string; color: string }> = [
    { id: 'ai',      icon: <RobotFilled />,       label: 'AI',  color: 'var(--ant-color-primary)' },
    { id: 'local',   icon: <BookFilled />,        label: '本地', color: '#722ed1' },
    { id: 'builtin', icon: <DatabaseOutlined />,  label: '内置', color: '#13c2c2' },
  ]
  return (
    <Space wrap size={6}>
      {items.map((it) => (
        <Button
          key={it.id}
          size="small"
          icon={it.icon}
          type={currentKind === it.id ? 'primary' : 'default'}
          onClick={() => onSwitch(it.id)}
          style={{
            borderRadius: 10,
            minHeight: 32,
            ...(currentKind === it.id ? {} : { color: it.color, borderColor: it.color }),
          }}
        >
          {it.label}
        </Button>
      ))}
    </Space>
  )
}

/** 网页词典快捷跳转按钮组 */
function WebDictButtons({ word }: { word: string }) {
  return (
    <Space wrap size={6} style={{ marginTop: 8 }}>
      {kWebDictConfigs.map((cfg) => (
        <Button
          key={cfg.id}
          size="small"
          icon={<span style={{ fontSize: 14 }}>{cfg.icon}</span>}
          onClick={() => {
            const url = lookupWebDictionary(cfg, word)
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
          }}
          style={{
            borderRadius: 10,
            borderColor: cfg.color,
            color: cfg.color,
            fontWeight: 600,
          }}
        >
          {cfg.displayName}
          {cfg.languageNote && (
            <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
              {cfg.languageNote}
            </Text>
          )}
        </Button>
      ))}
    </Space>
  )
}

/** 内置 ECDICT 单条命中（v1.1.0） */
function BuiltinDictEntryCard({
  entry, onSpeak, isPhone,
}: {
  entry: BuiltinDictLookupResponse['entries'][number]
  onSpeak: (text: string) => void
  isPhone: boolean
}) {
  const isExact = entry.matched_by === 'exact'
  const lemmaMatch = !isExact && entry.matched_by.startsWith('lemma:')
    ? entry.matched_by.slice(6)
    : null
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
        {lemmaMatch && (
          <Text type="secondary" style={{ fontSize: 12 }}>原词 {lemmaMatch}</Text>
        )}
        {entry.pos && <Tag color="blue" style={{ fontSize: 11 }}>{entry.pos}</Tag>}
        <Tag color={isExact ? 'green' : 'orange'} style={{ fontSize: 11 }}>
          {isExact ? '精确' : `原形 ${lemmaMatch ?? entry.matched_by}`}
        </Tag>
        <div style={{ flex: 1 }} />
        <Text type="secondary" style={{ fontSize: 11 }}>📚 ECDICT</Text>
      </div>
      {entry.phonetic && (
        <div style={{ marginTop: 4 }}>
          <Text code style={{ fontSize: 12 }}>{entry.phonetic}</Text>
        </div>
      )}
      {entry.translation && (
        <Paragraph style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6 }}>
          {entry.translation}
        </Paragraph>
      )}
      {entry.definition && (
        <Paragraph
          type="secondary"
          style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.55 }}
        >
          {entry.definition}
        </Paragraph>
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
