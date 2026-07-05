import { useEffect, useState, useCallback } from 'react'
import { Card, Row, Col, Table, Progress, Spin, Tag, Tabs, Button, Space, message, Alert, ConfigProvider, Typography } from 'antd'
import { CheckCircleOutlined, PlayCircleOutlined, FolderOutlined, LeftOutlined, RightOutlined, ReloadOutlined, FireOutlined, TrophyOutlined } from '@ant-design/icons'
import { recordApi } from '@/api'
import type { ProgressResponse, PlayRecord, StudyStatsResponse } from '@/types'
import { formatDuration, formatRelative } from '@/utils'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import { useNavigate } from 'react-router-dom'

const { Text } = Typography

// 格式化日期为 YYYY-MM-DD（本地时区）
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 获取某日期所在周的周一
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day // 周日归到上周末
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export default function Records() {
  const navigate = useNavigate()
  const { isPhone } = useDeviceSize()
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [records, setRecords] = useState<PlayRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'year'>('week')

  // 周视图的基准日期（默认今天），翻页时加减 7 天
  const [weekDate, setWeekDate] = useState(formatDate(new Date()))
  const [monthYear, setMonthYear] = useState(new Date().getFullYear())
  const [yearDate, setYearDate] = useState(formatDate(new Date()))

  const [stats, setStats] = useState<StudyStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [p, r] = await Promise.all([recordApi.progress(), recordApi.list()])
      if (!p.data || p.data.data == null) throw new Error('进度接口返回为空')
      if (!r.data) throw new Error('播放记录接口返回为空')
      setProgress(p.data.data)
      setRecords(r.data.data.records ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      setLoadError(msg)
      message.error('加载学习记录失败：' + msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 加载统计
  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      let date: string
      if (activeTab === 'week') date = weekDate
      else if (activeTab === 'month') date = `${monthYear}-01-01`
      else date = yearDate
      const res = await recordApi.stats(activeTab, date)
      setStats(res.data.data)
    } catch {
      message.error('加载统计失败')
    } finally {
      setStatsLoading(false)
    }
  }, [activeTab, weekDate, monthYear, yearDate])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // 周翻页
  const prevWeek = () => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() - 7)
    setWeekDate(formatDate(d))
  }
  const nextWeek = () => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() + 7)
    setWeekDate(formatDate(d))
  }
  const goTodayWeek = () => setWeekDate(formatDate(new Date()))

  // 月翻页（按年）
  const prevYear = () => setMonthYear((y) => y - 1)
  const nextYear = () => setMonthYear((y) => y + 1)

  // 年翻页
  const prevYearRange = () => {
    const d = new Date(yearDate)
    d.setFullYear(d.getFullYear() - 5)
    setYearDate(formatDate(d))
  }
  const nextYearRange = () => {
    const d = new Date(yearDate)
    d.setFullYear(d.getFullYear() + 5)
    setYearDate(formatDate(d))
  }

  // 计算周范围显示
  const monday = getMonday(new Date(weekDate))
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const weekRangeStr = `${monday.getMonth() + 1}月${monday.getDate()}日 - ${sunday.getMonth() + 1}月${sunday.getDate()}日`

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  // 关联媒体不可用时（已被删除），显示占位名称
  const mediaName = (r: PlayRecord) =>
    r.media && r.media.id !== 0 ? r.media.name : `（已删除媒体 #${r.media_id}）`

  const mediaAlbum = (r: PlayRecord) =>
    r.media && r.media.id !== 0 ? r.media.album : null

  const columns = [
    {
      title: '媒体名称',
      dataIndex: ['media', 'name'],
      key: 'name',
      render: (_text: string, record: PlayRecord) => (
        record.media && record.media.id !== 0
          ? <a onClick={() => navigate(`/play/${record.media?.id ?? record.media_id}`)}>{mediaName(record)}</a>
          : <span style={{ color: '#999' }}>{mediaName(record)}</span>
      ),
    },
    {
      title: '专辑',
      dataIndex: ['media', 'album'],
      key: 'album',
      render: (_v: string | null, record: PlayRecord) => {
        const alb = mediaAlbum(record)
        return alb ? <Tag color="blue">{alb}</Tag> : '-'
      },
    },
    { title: '播放次数', dataIndex: 'play_count', key: 'play_count' },
    {
      title: '进度',
      dataIndex: 'last_position',
      key: 'last_position',
      render: (pos: number, record: PlayRecord) =>
        record.media?.duration ? `${formatDuration(pos)} / ${formatDuration(record.media.duration)}` : formatDuration(pos),
    },
    {
      title: '上次播放',
      dataIndex: 'last_played_at',
      key: 'last_played_at',
      render: (v: string) => formatRelative(v),
    },
  ]

  // 渲染汇总卡片（周/月/年共用，渐变背景）
  const renderSummaryRow = () => (
    <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
      <Col span={8}>
        <div style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--ant-color-primary) 8%, transparent), color-mix(in srgb, var(--ant-color-primary) 18%, transparent))',
          borderRadius: 14, padding: '12px 8px', textAlign: 'center',
          border: '1px solid color-mix(in srgb, var(--ant-color-primary) 20%, transparent)',
        }}>
          <div style={{ fontSize: 20 }}>🔊</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ant-color-primary)', lineHeight: 1.2 }}>
            {stats?.total_play ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>播放次数</div>
        </div>
      </Col>
      <Col span={8}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(24,144,255,0.08), rgba(24,144,255,0.18))',
          borderRadius: 14, padding: '12px 8px', textAlign: 'center',
          border: '1px solid rgba(24,144,255,0.2)',
        }}>
          <div style={{ fontSize: 20 }}>🎵</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1890FF', lineHeight: 1.2 }}>
            {stats?.total_media ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>学习媒体</div>
        </div>
      </Col>
      <Col span={8}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(82,196,26,0.08), rgba(82,196,26,0.18))',
          borderRadius: 14, padding: '12px 8px', textAlign: 'center',
          border: '1px solid rgba(82,196,26,0.2)',
        }}>
          <div style={{ fontSize: 20 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#52C41A', lineHeight: 1.2 }}>
            {stats?.total_sentence ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>背诵句子</div>
        </div>
      </Col>
    </Row>
  )

  // 渲染本周视图：周一~周日单行 7 列（v0.6.0 移动端改为 3+4 两行）
  const renderWeekView = () => {
    if (statsLoading) {
      return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
    }
    if (!stats || stats.stats.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📊</div>
          <div style={{ color: '#999' }}>本周还没有学习记录哦，快去播放吧~</div>
        </div>
      )
    }
    const maxPlay = Math.max(...stats.stats.map((s) => s.play_count), 1)
    const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

    // 渲染单日柱状卡片
    const renderDayCard = (s: { date: string; label: string; play_count: number; media_count: number; sentence_count: number; is_current: boolean }, i: number) => {
      const barHeight = Math.max(6, (s.play_count / maxPlay) * 80)
      const hasData = s.play_count > 0 || s.sentence_count > 0
      const dayNum = s.date.split('-')[2]
      // 手机端减小柱状图高度和内边距，确保 4/3 列布局下视觉密度合适
      const chartHeight = isPhone ? 56 : 80
      const paddingY = isPhone ? 8 : 10
      return (
        <div
          style={{
            borderRadius: 14,
            padding: `${paddingY}px 6px`,
            textAlign: 'center',
            background: s.is_current
              ? 'linear-gradient(135deg, color-mix(in srgb, var(--ant-color-primary) 12%, transparent), color-mix(in srgb, var(--ant-color-primary) 20%, transparent))'
              : hasData
                ? 'linear-gradient(180deg, #fff, #fef9f5)'
                : '#fafafa',
            border: s.is_current ? '2px solid var(--ant-color-primary)' : '1px solid #f0f0f0',
            boxShadow: s.is_current ? `0 4px 12px color-mix(in srgb, var(--ant-color-primary) 15%, transparent)` : 'none',
            opacity: hasData ? 1 : 0.5,
            transition: 'all 0.2s',
          }}
        >
          {/* 顶部：星期 + 日期号 */}
          <div style={{
            fontWeight: 700, fontSize: isPhone ? 12 : 13,
            color: s.is_current ? 'var(--ant-color-primary)' : '#595959',
          }}>
            {weekdayLabels[i] ?? s.label}
          </div>
          <div style={{
            fontSize: isPhone ? 10 : 11,
            color: s.is_current ? 'var(--ant-color-primary)' : '#999',
            marginBottom: isPhone ? 4 : 8, fontWeight: s.is_current ? 700 : 400,
          }}>
            {dayNum}日
          </div>
          {/* 柱状图 */}
          <div style={{ height: chartHeight, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: isPhone ? 4 : 6 }}>
            <div style={{
              width: '55%',
              height: barHeight,
              background: hasData
                ? 'linear-gradient(180deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))'
                : '#e8e8e8',
              borderRadius: '6px 6px 0 0',
              transition: 'height 0.4s ease',
              boxShadow: hasData ? `0 2px 6px color-mix(in srgb, var(--ant-color-primary) 25%, transparent)` : 'none',
            }} />
          </div>
          {/* 下方每日数据 */}
          <div style={{ fontSize: isPhone ? 10 : 11, lineHeight: 1.6, color: '#666' }}>
            <div>🔊 {s.play_count}</div>
            <div>🎵 {s.media_count}</div>
            <div>✅ {s.sentence_count}</div>
          </div>
        </div>
      )
    }

    // 手机端：分两行（4+3），每行 3-4 列；桌面/平板：保持单行 7 列
    if (isPhone) {
      const firstHalf = stats.stats.slice(0, 4)  // 周一~周四
      const secondHalf = stats.stats.slice(4, 7) // 周五~周日
      const startIdxFor = (offset: number) => offset
      return (
        <div>
          {renderSummaryRow()}
          {/* 第一行：周一~周四（4 列，span=6 等分） */}
          <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
            {firstHalf.map((s, idx) => (
              <Col key={s.date} span={6}>
                {renderDayCard(s, startIdxFor(idx))}
              </Col>
            ))}
          </Row>
          {/* 第二行：周五~周日（3 列，span=8 等分） */}
          <Row gutter={[8, 8]}>
            {secondHalf.map((s, idx) => (
              <Col key={s.date} span={8}>
                {renderDayCard(s, 4 + idx)}
              </Col>
            ))}
          </Row>
        </div>
      )
    }

    return (
      <div>
        {renderSummaryRow()}
        {/* 单行 7 列：周一~周日，每日数据下方展示 */}
        <Row gutter={[8, 8]}>
          {stats.stats.map((s, i) => {
            return (
              <Col key={s.date} flex={1}>
                {renderDayCard(s, i)}
              </Col>
            )
          })}
        </Row>
      </div>
    )
  }

  // 渲染月/年统计网格（紧凑布局）
  const renderStatsGrid = () => {
    if (statsLoading) {
      return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
    }
    if (!stats || stats.stats.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📈</div>
          <div style={{ color: '#999' }}>该时间段暂无学习记录~</div>
        </div>
      )
    }
    const maxPlay = Math.max(...stats.stats.map((s) => s.play_count), 1)

    return (
      <div>
        {renderSummaryRow()}
        <Row gutter={[10, 10]}>
          {stats.stats.map((s) => {
            const barHeight = Math.max(6, (s.play_count / maxPlay) * 80)
            const hasData = s.play_count > 0 || s.sentence_count > 0
            return (
              <Col key={s.date} xs={12} sm={8} md={6} lg={4} xl={3}>
                <div
                  style={{
                    borderRadius: 14,
                    textAlign: 'center',
                    background: s.is_current
                      ? `linear-gradient(135deg, color-mix(in srgb, var(--ant-color-primary) 10%, transparent), color-mix(in srgb, var(--ant-color-primary) 18%, transparent))`
                      : hasData
                        ? `linear-gradient(180deg, #fff, color-mix(in srgb, var(--ant-color-primary) 4%, #fff))`
                        : '#fafafa',
                    border: s.is_current ? `2px solid var(--ant-color-primary)` : '1px solid #f0f0f0',
                    boxShadow: s.is_current ? `0 4px 12px color-mix(in srgb, var(--ant-color-primary) 12%, transparent)` : 'none',
                    opacity: hasData ? 1 : 0.55,
                    padding: 12,
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontWeight: 700, color: s.is_current ? 'var(--ant-color-primary)' : '#1a1a1a', fontSize: 13 }}>
                    {s.label}
                  </div>
                  <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', margin: '8px 0' }}>
                    <div style={{
                      width: '55%',
                      height: barHeight,
                      background: hasData
                        ? 'linear-gradient(180deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))'
                        : '#e8e8e8',
                      borderRadius: '6px 6px 0 0',
                      transition: 'height 0.4s ease',
                      boxShadow: hasData ? `0 2px 6px color-mix(in srgb, var(--ant-color-primary) 20%, transparent)` : 'none',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#666', lineHeight: 1.7 }}>
                    <div>🔊 {s.play_count} 次</div>
                    <div>🎵 {s.media_count} 媒体</div>
                    <div>✅ {s.sentence_count} 句</div>
                  </div>
                </div>
              </Col>
            )
          })}
        </Row>
      </div>
    )
  }

  return (
    <div>
      {/* AC 风页面标题 */}
      <Typography.Title level={4} style={{ marginBottom: 16, color: 'var(--ac-text-header, #794f27)', fontWeight: 800, letterSpacing: '0.02em' }}>📊 学习记录</Typography.Title>

      {/* 加载错误提示 + 重试 */}
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={`加载失败：${loadError}`}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={loadAll}>重试</Button>}
          style={{ marginBottom: 16, borderRadius: 12 }}
        />
      )}

      {/* 汇总统计卡片 —— 渐变背景 + 图标装饰 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card
            style={{ borderRadius: 18, overflow: 'hidden', border: 'none' }}
            styles={{ body: { padding: '20px 24px' } }}
            cover={(
              <div style={{
                background: 'linear-gradient(135deg, #52C41A 0%, #73D13D 100%)',
                padding: '18px 24px 28px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 72, opacity: 0.18 }}>✅</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ fontSize: 22, color: '#fff' }} />
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95 }}>已背诵句子</span>
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginTop: 4, lineHeight: 1.1 }}>
                  {progress?.completed_sentences ?? 0}
                </div>
              </div>
            )}
          >
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
              每句都是进步的脚印 🌟
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            style={{ borderRadius: 18, overflow: 'hidden', border: 'none' }}
            styles={{ body: { padding: '20px 24px' } }}
            cover={(
              <div style={{
                background: 'linear-gradient(135deg, var(--ant-color-primary), color-mix(in srgb, var(--ant-color-primary) 70%, white))',
                padding: '18px 24px 28px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 72, opacity: 0.18 }}>🎵</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FireOutlined style={{ fontSize: 22, color: '#fff' }} />
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95 }}>播放记录</span>
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginTop: 4, lineHeight: 1.1 }}>
                  {records.length}
                </div>
              </div>
            )}
          >
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
              坚持就是胜利 🔥
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            style={{ borderRadius: 18, overflow: 'hidden', border: 'none' }}
            styles={{ body: { padding: '20px 24px' } }}
            cover={(
              <div style={{
                background: 'linear-gradient(135deg, #FAAD14 0%, #FFC53D 100%)',
                padding: '18px 24px 28px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 72, opacity: 0.18 }}>📂</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrophyOutlined style={{ fontSize: 22, color: '#fff' }} />
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95 }}>学习专辑</span>
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginTop: 4, lineHeight: 1.1 }}>
                  {progress?.albums?.length ?? 0}
                </div>
              </div>
            )}
          >
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
              知识的宝藏 📚
            </div>
          </Card>
        </Col>
      </Row>

      {/* 周/月/年统计 Tabs */}
      <Card style={{ marginBottom: 16, borderRadius: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'week' | 'month' | 'year')}
          items={[
            {
              key: 'week',
              label: '📅 本周',
              children: (
                <div>
                  {/* 周翻页栏 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Space>
                      <Button icon={<LeftOutlined />} onClick={prevWeek} shape="circle" />
                      <Text strong style={{ fontSize: 16 }}>{weekRangeStr}</Text>
                      <Button icon={<RightOutlined />} onClick={nextWeek} shape="circle" disabled={weekDate >= formatDate(new Date())} />
                    </Space>
                    <Button type="link" onClick={goTodayWeek} style={{ color: 'var(--ant-color-primary)' }}>回到本周</Button>
                  </div>
                  {renderWeekView()}
                </div>
              ),
            },
            {
              key: 'month',
              label: '🗓️ 本月',
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Space>
                      <Button icon={<LeftOutlined />} onClick={prevYear} shape="circle" />
                      <Text strong style={{ fontSize: 16 }}>{monthYear} 年</Text>
                      <Button icon={<RightOutlined />} onClick={nextYear} shape="circle" disabled={monthYear >= new Date().getFullYear()} />
                    </Space>
                  </div>
                  {renderStatsGrid()}
                </div>
              ),
            },
            {
              key: 'year',
              label: '📆 年度',
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Space>
                      <Button icon={<LeftOutlined />} onClick={prevYearRange} shape="circle" />
                      <Text strong style={{ fontSize: 16 }}>{new Date(yearDate).getFullYear() - 4} - {new Date(yearDate).getFullYear()} 年</Text>
                      <Button icon={<RightOutlined />} onClick={nextYearRange} shape="circle" disabled={new Date(yearDate).getFullYear() >= new Date().getFullYear()} />
                    </Space>
                  </div>
                  {renderStatsGrid()}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* 按专辑进度 */}
      {progress && progress.albums.length > 0 && (
        <Card
          title={<span><FolderOutlined style={{ color: '#FAAD14', marginRight: 8 }} />按专辑进度</span>}
          style={{ marginBottom: 20, borderRadius: 18, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
          styles={{ header: { borderBottom: '1px solid #fff0e6', padding: '14px 20px' } }}
        >
          {progress.albums.map((a) => {
            const pct = a.total > 0 ? Math.round((a.played / a.total) * 100) : 0
            return (
              <div
                key={a.album}
                style={{
                  marginBottom: 14, padding: '10px 14px', borderRadius: 12,
                  background: `linear-gradient(90deg, color-mix(in srgb, var(--ant-color-primary) 4%, transparent), transparent)`,
                  border: '1px solid #fff0e6',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: 14 }}>
                    📂 {a.album}
                  </span>
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                    已学 <Text strong style={{ color: 'var(--ant-color-primary)' }}>{a.played}</Text>/{a.total} · 共听 {a.total_played} 次
                  </span>
                </div>
                <Progress
                  percent={pct}
                  size="small"
                  strokeColor={{ from: 'var(--ant-color-primary)', to: 'var(--ant-color-primary, #FFB37A)' }}
                  trailColor="#fff0e6"
                  format={(p) => <span style={{ fontSize: 11, color: '#8c8c8c' }}>{p}%</span>}
                />
              </div>
            )
          })}
        </Card>
      )}

      {/* 播放记录表 */}
      {records.length === 0 ? (
        <Card style={{ borderRadius: 18, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎧</div>
            <div style={{ color: '#999', fontSize: 14 }}>还没有播放记录哦~</div>
            <div style={{ color: '#bbb', fontSize: 12, marginTop: 4 }}>去首页播放一个媒体文件吧</div>
          </div>
        </Card>
      ) : (
        <Card
          title={<span><PlayCircleOutlined style={{ color: 'var(--ant-color-primary)', marginRight: 8 }} />播放记录</span>}
          style={{ borderRadius: 18, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
          styles={{ header: { borderBottom: '1px solid #fff0e6', padding: '14px 20px' } }}
        >
          <ConfigProvider
            theme={{
              components: {
                Table: {
                  rowHoverBg: `color-mix(in srgb, var(--ant-color-primary) 4%, transparent)`,
                },
              },
            }}
          >
            <Table
              columns={columns}
              dataSource={records}
              rowKey="id"
              pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条记录` }}
              size="middle"
              rowClassName={(_, index) => (index % 2 === 0 ? 'row-even' : 'row-odd')}
              style={{
                '--row-even-bg': '#fff',
                '--row-odd-bg': '#fef9f5',
              } as React.CSSProperties}
            />
          </ConfigProvider>
        </Card>
      )}
    </div>
  )
}
