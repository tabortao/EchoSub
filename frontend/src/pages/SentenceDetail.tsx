/**
 * 句子详情页（v0.9.0 起）
 *
 * 设计：
 * - 顶部展示原文 + 媒体名 + 时间戳
 * - 「整句翻译 / 语法 / 逐词」三块由后端 /ai/sentence-explain 一次返回
 * - 单词卡片可点击展开「词典详情」/ai/dictionary 弹窗
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
} from '@ant-design/icons'
import { aiApi, mediaApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useDictionaryStore } from '@/store/dictionary'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type {
  DictionaryResponse, Sentence, SentenceExplainResponse, AIStatus,
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

export default function SentenceDetailPage() {
  const navigate = useNavigate()
  const { id, idx } = useParams<{ id: string; idx: string }>()
  const { isPhone } = useDeviceSize()
  const token = useAuthStore((s) => s.token)
  const { defaultSourceId } = useDictionaryStore()

  const [mediaName, setMediaName] = useState<string>('')
  const [sentence, setSentence] = useState<Sentence | null>(null)
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)

  const [explain, setExplain] = useState<SentenceExplainResponse | null>(null)
  const [loadingExplain, setLoadingExplain] = useState(false)
  const [errorExplain, setErrorExplain] = useState<string | null>(null)

  // 单词词典弹窗
  const [wordModal, setWordModal] = useState<{ word: string; loading: boolean; data: DictionaryResponse | null; error: string | null } | null>(null)

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

  // 3. 单词查词
  const handleWordClick = async (word: string) => {
    if (!sentence) return
    setWordModal({ word, loading: true, data: null, error: null })
    try {
      const res = await aiApi.dictionary({
        word,
        sentence: sentence.text,
        target_lang: aiStatus?.target_lang || 'Chinese',
      })
      setWordModal({ word, loading: false, data: res.data.data, error: null })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '查词失败'
      setWordModal({ word, loading: false, data: null, error: msg })
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
        title={<Space><BookOutlined /> {wordModal?.word ?? ''}</Space>}
        open={!!wordModal}
        onCancel={() => setWordModal(null)}
        footer={null}
        width={isPhone ? '95vw' : 640}
        destroyOnHidden
      >
        {wordModal?.loading && <Skeleton active paragraph={{ rows: 5 }} />}
        {wordModal?.error && <Alert type="error" showIcon message={wordModal.error} />}
        {wordModal?.data && <DictionaryView entry={wordModal.data} onSpeak={handleSpeak} />}
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

/** 字典查询结果视图（用于单词弹窗） */
function DictionaryView({ entry, onSpeak }: { entry: DictionaryResponse; onSpeak: (text: string) => void }) {
  return (
    <div>
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
