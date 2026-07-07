/**
 * 收藏页（v1.3.0 起）
 *
 * 顶部两个 tab：
 *   - 「句子」：从 SentenceProgress 拉取所有 favorited=true 的句子，按媒体分组
 *   - 「单词」：从 word_favorites 表拉取所有收藏的单词，支持模糊搜索 + 笔记编辑
 *
 * 设计：
 * - 句子 tab 复用 recordApi 拿进度 + mediaApi 拿媒体元数据
 * - 单词 tab 用 wordFavoriteApi + zustand store
 * - 单词点击 → 跳到 /favorites?word=xxx&tab=words 弹窗内查词（v1.3.0 后续）
 * - 响应式：手机端单列 / 桌面端两列
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert, Button, Card, Empty, Input, List, Modal, Popconfirm, Segmented, Skeleton, Space, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  BookOutlined, BulbOutlined, DeleteOutlined, EditOutlined, LinkOutlined, ReloadOutlined, SearchOutlined, StarFilled, SoundOutlined,
} from '@ant-design/icons'
import { builtinDictApi, mediaApi, recordApi, webDictApi, wordFavoriteApi } from '@/api'
import { useWordFavoritesStore } from '@/store/wordFavorites'
import { kWebDictConfigs } from '@/store/webDictionaryConfig'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { BuiltinDictLookupResponse, MediaFile, Sentence, SentenceProgress, WebDictLookupResponse, WordFavorite } from '@/types'

const { Text, Title, Paragraph } = Typography

type TabKey = 'sentences' | 'words'

interface FavoriteSentence {
  progress: SentenceProgress
  media: MediaFile
  sentence: Sentence
}

export default function FavoritesPage() {
  const { isPhone } = useDeviceSize()
  const [searchParams, setSearchParams] = useSearchParams()

  // tab 默认从 URL 读，支持 ?tab=words 跳到单词 tab
  const initialTab = (searchParams.get('tab') as TabKey) || 'sentences'
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [highlightWord, setHighlightWord] = useState<string | null>(searchParams.get('word'))

  // v1.3.0 修复：URL 变化时同步 highlightWord
  //   用户在句子详情页点「📚 在收藏页查看此单词」时连续跳不同 word，
  //   useState 初值只取一次，需要监听 searchParams 变化
  useEffect(() => {
    const w = searchParams.get('word')
    if (w && w !== highlightWord) {
      setHighlightWord(w)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 数据
  const [sentences, setSentences] = useState<FavoriteSentence[]>([])
  const [loadingSentences, setLoadingSentences] = useState(false)
  const { items: wordFavs, fetchedAt, loading: loadingWords, refresh: refreshWords } = useWordFavoritesStore()

  // 单词搜索
  const [wordQ, setWordQ] = useState('')

  // 单词查词弹窗
  const [wordModal, setWordModal] = useState<{
    word: string
    builtin: BuiltinDictLookupResponse | null
    web: WebDictLookupResponse | null
    webSource: string | null
    loading: boolean
    error: string | null
  } | null>(null)

  // 单词笔记编辑
  const [noteEditing, setNoteEditing] = useState<{ id: number; note: string } | null>(null)

  // 切 tab 时同步 URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'sentences') {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    setSearchParams(next, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // 初次进入「单词」tab 时确保 store 已拉过
  useEffect(() => {
    if (tab === 'words' && Date.now() - fetchedAt > 30_000) {
      void refreshWords()
    }
  }, [tab, fetchedAt, refreshWords])

  // URL 携带 ?word=xxx 自动打开查词弹窗（来自句子详情页跳转）
  useEffect(() => {
    if (highlightWord) {
      handleOpenWord(highlightWord)
      // 清除 URL 参数，避免重复打开
      const next = new URLSearchParams(searchParams)
      next.delete('word')
      setSearchParams(next, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightWord])
  // 加载句子收藏
  useEffect(() => {
    if (tab !== 'sentences') return
    setLoadingSentences(true)
    ;(async () => {
      try {
        // 1) 拉最近 200 条播放记录（包含 progress 数组）
        const recent = await recordApi.list().catch(() => null)
        // 2) 由于 recordApi.list() 只返回 PlayRecord，没 progress。改用拉每个媒体的 progress
        //    为避免 N+1，这里通过最近媒体 id 列表依次 get。
        //    实际我们想要的是全局 favorited 句子；后端没现成接口，先用最近 50 个媒体
        const records = recent?.data.data.records ?? []
        const mediaIds = records
          .slice(0, 50)
          .map((r) => r.media?.id)
          .filter((id): id is number => typeof id === 'number')
        const all: FavoriteSentence[] = []
        for (const mid of mediaIds) {
          const [mediaRes, recRes] = await Promise.all([
            mediaApi.get(mid).catch(() => null),
            recordApi.get(mid).catch(() => null),
          ])
          if (!mediaRes || !recRes) continue
          const media = (mediaRes.data.data as { media: MediaFile }).media
          const progress = recRes.data.data.progress ?? []
          const favorited = progress.filter((p) => p.favorited)
          if (favorited.length === 0) continue
          // 拉字幕拿到完整句子文本
          const subRes = await mediaApi.subtitle(mid).catch(() => null)
          const sentenceList: Sentence[] = subRes?.data.data.sentences ?? []
          for (const p of favorited) {
            const sentence = sentenceList.find((s) => s.index === p.sentence_index)
            if (sentence) {
              all.push({ progress: p, media, sentence })
            }
          }
        }
        // 按 updated_at DESC
        all.sort((a, b) => (a.progress.updated_at < b.progress.updated_at ? 1 : -1))
        setSentences(all)
      } finally {
        setLoadingSentences(false)
      }
    })()
  }, [tab])

  // 单词按搜索过滤
  const filteredWords = useMemo(() => {
    const q = wordQ.trim().toLowerCase()
    if (!q) return wordFavs
    return wordFavs.filter((w) => w.word.includes(q))
  }, [wordFavs, wordQ])

  // 打开单词查词弹窗（v1.3.2 增强词义持久化）
  // 优先顺序：
  //   1) 收藏列表里该词的 query_result 快照（零网络请求，离线可用）
  //   2) 内置词典 fallback（兜底）
  //   3) 用户在弹窗内选网页词典时按需访问网络
  const handleOpenWord = async (word: string) => {
    const w = word.trim().toLowerCase()
    if (!w) return
    setWordModal({ word: w, builtin: null, web: null, webSource: null, loading: true, error: null })
    try {
      // 1) 查收藏快照（v1.3.2 新增）
      const fav = wordFavs.find((x) => x.word === w)
      let cachedSnapshot: WebDictLookupResponse | null = null
      if (fav && fav.query_result) {
        try {
          const parsed = JSON.parse(fav.query_result) as WebDictLookupResponse
          // 补回 favorite 字段，让弹窗知道这是离线快照
          parsed.favorite = true
          parsed.favorite_id = fav.id
          parsed.favorite_source = fav.source
          parsed.favorite_note = fav.note
          parsed.cached = true
          cachedSnapshot = parsed
        } catch {
          // JSON 损坏：当没快照，走 fallback
        }
      }

      // 2) 内置词典（fallback 兜底）
      const r = await builtinDictApi.lookup(w).catch(() => null)
      const builtin = r?.data.data ?? null

      // 3) 决定 webData 初始值：优先快照
      if (cachedSnapshot) {
        setWordModal({
          word: w, builtin, web: cachedSnapshot,
          webSource: cachedSnapshot.source, loading: false, error: null,
        })
      } else {
        setWordModal({ word: w, builtin, web: null, webSource: null, loading: false, error: null })
      }
    } catch (err: unknown) {
      setWordModal({
        word: w, builtin: null, web: null, webSource: null, loading: false,
        error: (err as { message?: string })?.message ?? '查词失败',
      })
    }
  }

  // 弹窗内切换到某个网页词典
  const handleSwitchWeb = async (source: string) => {
    if (!wordModal) return
    setWordModal({ ...wordModal, web: null, webSource: source, loading: true, error: null })
    try {
      const r = await webDictApi.lookup(source, wordModal.word)
      setWordModal({ ...wordModal, web: r.data.data, webSource: source, loading: false })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '抓取失败'
      setWordModal({ ...wordModal, web: null, webSource: source, loading: false, error: msg })
    }
  }

  // 删除收藏
  const handleDeleteWord = async (id: number, word: string) => {
    const ok = await useWordFavoritesStore.getState().unfavorite(id, word)
    if (ok) {
      message.success(`已取消收藏「${word}」`)
    } else {
      message.error('取消收藏失败')
    }
  }

  // 保存笔记
  const handleSaveNote = async () => {
    if (!noteEditing) return
    try {
      await wordFavoriteApi.updateNote(noteEditing.id, noteEditing.note)
      // 更新本地 store
      const item = wordFavs.find((w) => w.id === noteEditing.id)
      if (item) {
        useWordFavoritesStore.getState().addFavorite({ ...item, note: noteEditing.note, updated_at: new Date().toISOString() })
      }
      message.success('笔记已保存')
      setNoteEditing(null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '保存失败'
      message.error(msg)
    }
  }

  // 朗读单词
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

  return (
    <div style={{ padding: isPhone ? '12px 12px 60px' : '16px 24px 60px', maxWidth: 1200, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 4, color: 'var(--ac-text-header, #794f27)', fontWeight: 800 }}>
        ⭐ 收藏
      </Title>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
        在句子详情页点击 ⭐ 收藏单词或句子；这里集中管理，方便复习。
      </Text>

      {/* tab 切换 */}
      <Segmented<('sentences' | 'words')>
        value={tab}
        onChange={(v) => setTab(v)}
        options={[
          { label: '📜 句子', value: 'sentences' },
          { label: '🔤 单词', value: 'words' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {/* 句子 tab */}
      {tab === 'sentences' && (
        <Card style={{ borderRadius: 20, border: 'none' }} styles={{ body: { padding: isPhone ? 14 : 20 } }}>
          {loadingSentences ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : sentences.length === 0 ? (
            <Empty description="还没有收藏的句子；在句子详情页点击 ⭐ 即可收藏" />
          ) : (
            <List
              dataSource={sentences}
              grid={{ column: isPhone ? 1 : 2, gutter: 12 }}
              renderItem={(item) => (
                <List.Item>
                  <SentenceCard item={item} onSpeak={handleSpeak} />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      {/* 单词 tab */}
      {tab === 'words' && (
        <>
          <Space style={{ marginBottom: 12, width: '100%' }} wrap>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索收藏的单词..."
              allowClear
              value={wordQ}
              onChange={(e) => setWordQ(e.target.value)}
              style={{ maxWidth: 320, minWidth: 200 }}
            />
            <Tooltip title="刷新">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void refreshWords()}
                loading={loadingWords}
              />
            </Tooltip>
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {wordFavs.length} 个收藏
              {wordQ && filteredWords.length !== wordFavs.length && `，匹配 ${filteredWords.length}`}
            </Text>
          </Space>
          <Card style={{ borderRadius: 20, border: 'none' }} styles={{ body: { padding: isPhone ? 14 : 20 } }}>
            {loadingWords && wordFavs.length === 0 ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : filteredWords.length === 0 ? (
              <Empty description={wordQ ? '没有匹配的单词' : '还没有收藏的单词；在弹窗里点击 ⭐ 即可收藏'} />
            ) : (
              <List
                dataSource={filteredWords}
                grid={{ column: isPhone ? 1 : 2, gutter: 12 }}
                renderItem={(w) => (
                  <List.Item>
                    <WordCard
                      fav={w}
                      onSpeak={handleSpeak}
                      onOpen={() => handleOpenWord(w.word)}
                      onEditNote={() => setNoteEditing({ id: w.id, note: w.note })}
                      onDelete={() => handleDeleteWord(w.id, w.word)}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </>
      )}

      {/* 单词查词弹窗（v1.3.0） */}
      <Modal
        title={<Space><BookOutlined /> {wordModal?.word ?? ''}</Space>}
        open={!!wordModal}
        onCancel={() => setWordModal(null)}
        footer={null}
        width={isPhone ? '95vw' : 760}
        destroyOnHidden
      >
        {wordModal && (
          <WordLookupModalBody
            modal={wordModal}
            onSwitchWeb={handleSwitchWeb}
            onSpeak={handleSpeak}
          />
        )}
      </Modal>

      {/* 笔记编辑弹窗 */}
      <Modal
        title="编辑笔记"
        open={!!noteEditing}
        onCancel={() => setNoteEditing(null)}
        onOk={handleSaveNote}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Input.TextArea
          rows={5}
          value={noteEditing?.note ?? ''}
          onChange={(e) => setNoteEditing(noteEditing ? { ...noteEditing, note: e.target.value } : null)}
          placeholder="给这个单词加点学习笔记..."
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  )
}

/** 单条收藏句子卡片 */
function SentenceCard({ item, onSpeak }: { item: FavoriteSentence; onSpeak: (t: string) => void }) {
  const { media, sentence, progress } = item
  return (
    <div
      style={{
        background: 'var(--color-bg-page, #fafafa)',
        borderRadius: 12,
        padding: 12,
        border: '1px solid var(--color-border-soft, rgba(0,0,0,0.06))',
        height: '100%',
      }}
    >
      <Space size={6} wrap style={{ marginBottom: 6 }}>
        <StarFilled style={{ color: '#faad14', fontSize: 13 }} />
        <Text strong style={{ fontSize: 13 }}>{media.name}</Text>
        <Tag color="cyan" style={{ fontSize: 11 }}>第 {sentence.index + 1} 句</Tag>
        <Tooltip title="朗读">
          <Button
            type="text"
            size="small"
            icon={<SoundOutlined />}
            onClick={() => onSpeak(sentence.text)}
          />
        </Tooltip>
        <Button
          type="link"
          size="small"
          icon={<LinkOutlined />}
          href={`/play/${media.id}/sentence/${sentence.index}`}
          target="_blank"
        >
          打开
        </Button>
      </Space>
      <Paragraph style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: 'var(--color-text-primary)' }}>
        {sentence.text}
      </Paragraph>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
        听 {progress.repeat_count} 次 · 收藏于 {new Date(progress.updated_at).toLocaleString()}
      </Text>
    </div>
  )
}

/** 单条收藏单词卡片 */
function WordCard({
  fav, onSpeak, onOpen, onEditNote, onDelete,
}: {
  fav: WordFavorite
  onSpeak: (t: string) => void
  onOpen: () => void
  onEditNote: () => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg-page, #fafafa)',
        borderRadius: 12,
        padding: 12,
        border: '1px solid var(--color-border-soft, rgba(0,0,0,0.06))',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StarFilled style={{ color: '#faad14', fontSize: 13 }} />
        <Text strong style={{ fontSize: 16, color: 'var(--ant-color-primary)' }}>{fav.word}</Text>
        {fav.source && <Tag color="purple" style={{ fontSize: 10 }}>{sourceLabel(fav.source)}</Tag>}
        <div style={{ flex: 1 }} />
        <Tooltip title="朗读">
          <Button type="text" size="small" icon={<SoundOutlined />} onClick={() => onSpeak(fav.word)} />
        </Tooltip>
        <Tooltip title="查词">
          <Button type="text" size="small" icon={<SearchOutlined />} onClick={onOpen} />
        </Tooltip>
        <Tooltip title="编辑笔记">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEditNote} />
        </Tooltip>
        <Popconfirm
          title={`确定取消收藏「${fav.word}」？`}
          onConfirm={onDelete}
          okText="取消收藏"
          cancelText="不取消"
        >
          <Tooltip title="取消收藏">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      </div>
      {fav.note && (
        <Paragraph
          type="secondary"
          style={{ fontSize: 12, lineHeight: 1.55, margin: '6px 0 0', display: 'flex', gap: 4 }}
        >
          <BulbOutlined style={{ color: '#faad14' }} /> {fav.note}
        </Paragraph>
      )}
      <Text type="secondary" style={{ fontSize: 11, marginTop: 6 }}>
        查 {fav.hit_count} 次 · {new Date(fav.updated_at).toLocaleDateString()}
      </Text>
    </div>
  )
}

function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    ai: 'AI 词典',
    local: '本地词典',
    builtin: '内置 ECDICT',
    youdao: '有道',
    oxford: 'Oxford',
    longman: 'Longman',
    wiktionary: 'Wiktionary',
    microsoft: '微软翻译',
  }
  return map[src] ?? src
}

/** 单词查词弹窗 body：builtin 命中优先展示 + 下方提供网页词典按钮 */
function WordLookupModalBody({
  modal, onSwitchWeb, onSpeak,
}: {
  modal: { word: string; builtin: BuiltinDictLookupResponse | null; web: WebDictLookupResponse | null; webSource: string | null; loading: boolean; error: string | null }
  onSwitchWeb: (source: string) => void
  onSpeak: (t: string) => void
}) {
  if (modal.loading) {
    return <Skeleton active paragraph={{ rows: 4 }} />
  }
  return (
    <div>
      {/* 标题区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <BookOutlined style={{ color: 'var(--ant-color-primary)' }} />
        <Text strong style={{ fontSize: 16 }}>{modal.word}</Text>
        <Tooltip title="朗读">
          <Button type="text" size="small" icon={<SoundOutlined />} onClick={() => onSpeak(modal.word)} />
        </Tooltip>
      </div>

      {/* builtin 命中 */}
      {modal.builtin && modal.builtin.entries.length > 0 && (
        <Card
          size="small"
          style={{ borderRadius: 12, border: '1px solid var(--color-border-soft)', marginBottom: 12 }}
          styles={{ body: { padding: 12 } }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {modal.builtin.entries.map((e, i) => (
              <div key={i}>
                <Space size={6} wrap>
                  <Text strong>{e.word}</Text>
                  {e.pos && <Tag color="blue" style={{ fontSize: 10 }}>{e.pos}</Tag>}
                  <Tag color={e.matched_by === 'exact' ? 'green' : 'orange'} style={{ fontSize: 10 }}>
                    {e.matched_by === 'exact' ? '精确' : '词形'}
                  </Tag>
                </Space>
                {e.phonetic && <div><Text code style={{ fontSize: 11 }}>{e.phonetic}</Text></div>}
                {e.translation && <Paragraph style={{ fontSize: 12, lineHeight: 1.6, margin: '4px 0 0' }}>{e.translation}</Paragraph>}
              </div>
            ))}
          </Space>
        </Card>
      )}
      {modal.builtin && modal.builtin.entries.length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12, borderRadius: 10 }}
          message="内置词典未收录该词"
          description="可点击下方网页词典查询（部分网站对抓取有限制，结果可能为空）"
        />
      )}
      {modal.error && !modal.builtin && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12, borderRadius: 10 }}
          message="查词失败"
          description={modal.error}
        />
      )}

      {/* 网页词典切换 */}
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
        切换到网页词典查询：
      </Text>
      <Space wrap size={6} style={{ marginBottom: 12 }}>
        {kWebDictConfigs.map((cfg) => {
          const active = modal.webSource === cfg.id
          return (
            <Button
              key={cfg.id}
              size="small"
              icon={<span style={{ fontSize: 13 }}>{cfg.icon}</span>}
              type={active ? 'primary' : 'default'}
              loading={modal.loading && active}
              onClick={() => onSwitchWeb(cfg.id)}
              style={{
                borderRadius: 10,
                ...(active ? {} : { color: cfg.color, borderColor: cfg.color }),
              }}
            >
              {cfg.displayName}
            </Button>
          )
        })}
      </Space>

      {/* 网页词典结果 */}
      {modal.web && (
        <div
          style={{
            border: '1px solid var(--color-border-soft)',
            borderRadius: 12,
            padding: 12,
            maxHeight: 480,
            overflow: 'auto',
            background: 'var(--color-bg-page, #fafafa)',
          }}
        >
          {/* v1.3.2 起：离线快照 / 内存缓存 徽标 */}
          {modal.web.favorite && (
            <div style={{ marginBottom: 8 }}>
              <Tag color="gold" icon={<StarFilled />}>已收藏词义（离线快照）</Tag>
              {modal.web.cached && <Tag>内存缓存</Tag>}
            </div>
          )}
          {/* v1.3.4 起：翻译型源（microsoft）用 translation 字段简短展示 */}
          {modal.web.kind === 'translate' && modal.web.translation ? (
            <div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {modal.web.source_lang && modal.web.target_lang
                    ? `${modal.web.source_lang} → ${modal.web.target_lang}`
                    : '翻译'}
                </Text>
              </div>
              <div style={{ fontSize: 18, lineHeight: 1.6 }}>{modal.web.translation}</div>
              {modal.web.phonetic && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>音标：{modal.web.phonetic}</Text>
                </div>
              )}
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  来源 <a href={modal.web.url} target="_blank" rel="noreferrer">{modal.web.source_name}</a>
                </Text>
              </div>
            </div>
          ) : modal.web.blocked ? (
            <Alert
              type="warning"
              showIcon
              message={`${modal.web.source_name} 抓取受限`}
              description={
                <Space direction="vertical" size={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{modal.web.error}</Text>
                  <Button
                    size="small"
                    type="link"
                    icon={<LinkOutlined />}
                    href={modal.web.url}
                    target="_blank"
                  >
                    在新窗口打开原页面
                  </Button>
                </Space>
              }
            />
          ) : modal.web.html ? (
            <>
              <div
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: modal.web.html }}
                className="web-dict-content"
              />
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  来源 <a href={modal.web.url} target="_blank" rel="noreferrer">{modal.web.source_name}</a>
                </Text>
              </div>
            </>
          ) : (
            <Empty description="该网页词典返回空内容" />
          )}
        </div>
      )}
    </div>
  )
}
