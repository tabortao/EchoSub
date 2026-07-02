import { useEffect, useState, useCallback } from 'react'
import { Card, Row, Col, Statistic, Table, Progress, Spin, Typography, Empty, Tag, Tabs, Button, Space, message } from 'antd'
import { CheckCircleOutlined, PlayCircleOutlined, FolderOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import { recordApi } from '@/api'
import type { ProgressResponse, PlayRecord, StudyStatsResponse } from '@/types'
import { formatDuration, formatRelative } from '@/utils'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

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
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [records, setRecords] = useState<PlayRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'year'>('week')

  // 周视图的基准日期（默认今天），翻页时加减 7 天
  const [weekDate, setWeekDate] = useState(formatDate(new Date()))
  const [monthYear, setMonthYear] = useState(new Date().getFullYear())
  const [yearDate, setYearDate] = useState(formatDate(new Date()))

  const [stats, setStats] = useState<StudyStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [p, r] = await Promise.all([recordApi.progress(), recordApi.list()])
        setProgress(p.data.data)
        setRecords(r.data.data.records ?? [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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

  const columns = [
    {
      title: '媒体名称',
      dataIndex: ['media', 'name'],
      key: 'name',
      render: (text: string, record: PlayRecord) => (
        <a onClick={() => navigate(`/play/${record.media_id}`)}>{text || `#${record.media_id}`}</a>
      ),
    },
    {
      title: '专辑',
      dataIndex: ['media', 'album'],
      key: 'album',
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : '-'),
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

  // 渲染汇总卡片（周/月/年共用，紧凑一行）
  const renderSummaryRow = () => (
    <Row gutter={8} style={{ marginBottom: 12 }}>
      <Col span={8}>
        <Card size="small" style={{ textAlign: 'center', borderRadius: 10, padding: '4px 0' }} bodyStyle={{ padding: 8 }}>
          <Statistic title="🔊 播放次数" value={stats?.total_play ?? 0} valueStyle={{ color: '#FF7A45', fontSize: 18 }} />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" style={{ textAlign: 'center', borderRadius: 10, padding: '4px 0' }} bodyStyle={{ padding: 8 }}>
          <Statistic title="🎵 学习媒体" value={stats?.total_media ?? 0} valueStyle={{ color: '#1890FF', fontSize: 18 }} />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" style={{ textAlign: 'center', borderRadius: 10, padding: '4px 0' }} bodyStyle={{ padding: 8 }}>
          <Statistic title="✅ 背诵句子" value={stats?.total_sentence ?? 0} valueStyle={{ color: '#52C41A', fontSize: 18 }} />
        </Card>
      </Col>
    </Row>
  )

  // 渲染本周视图：周一~周日单行 7 列，每日数据下方展示
  const renderWeekView = () => {
    if (statsLoading) {
      return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
    }
    if (!stats || stats.stats.length === 0) {
      return <Empty description="暂无数据" />
    }
    const maxPlay = Math.max(...stats.stats.map((s) => s.play_count), 1)
    const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

    return (
      <div>
        {renderSummaryRow()}
        {/* 单行 7 列：周一~周日，每日数据下方展示 */}
        <Row gutter={6}>
          {stats.stats.map((s, i) => {
            const barHeight = Math.max(4, (s.play_count / maxPlay) * 80)
            const hasData = s.play_count > 0 || s.sentence_count > 0
            // 日期中的「日」
            const dayNum = s.date.split('-')[2]
            return (
              <Col key={s.date} flex={1}>
                <div
                  style={{
                    borderRadius: 10,
                    padding: '8px 4px',
                    textAlign: 'center',
                    background: s.is_current ? 'rgba(255,122,69,0.10)' : '#fff',
                    border: s.is_current ? '2px solid #FF7A45' : '1px solid #f0f0f0',
                    opacity: hasData ? 1 : 0.55,
                  }}
                >
                  {/* 顶部：星期 + 日期号 */}
                  <div style={{ fontWeight: 700, fontSize: 13, color: s.is_current ? '#FF7A45' : '#1a1a1a' }}>
                    {weekdayLabels[i] ?? s.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{dayNum}日</div>
                  {/* 柱状图 */}
                  <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 4 }}>
                    <div style={{
                      width: '50%',
                      height: barHeight,
                      background: hasData ? 'linear-gradient(180deg, #FF7A45, #FFB37A)' : '#f0f0f0',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s',
                    }} />
                  </div>
                  {/* 下方每日数据 */}
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: '#666' }}>
                    <div>🔊 {s.play_count}</div>
                    <div>🎵 {s.media_count}</div>
                    <div>✅ {s.sentence_count}</div>
                  </div>
                </div>
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
      return <Empty description="暂无数据" />
    }
    const maxPlay = Math.max(...stats.stats.map((s) => s.play_count), 1)

    return (
      <div>
        {renderSummaryRow()}
        <Row gutter={[8, 8]}>
          {stats.stats.map((s) => {
            const barHeight = Math.max(4, (s.play_count / maxPlay) * 80)
            const hasData = s.play_count > 0 || s.sentence_count > 0
            return (
              <Col key={s.date} xs={12} sm={8} md={6} lg={4} xl={3}>
                <Card
                  size="small"
                  bodyStyle={{ padding: 10 }}
                  style={{
                    borderRadius: 10,
                    textAlign: 'center',
                    background: s.is_current ? 'rgba(255,122,69,0.10)' : '#fff',
                    border: s.is_current ? '2px solid #FF7A45' : '1px solid #f0f0f0',
                    opacity: hasData ? 1 : 0.6,
                  }}
                >
                  <div style={{ fontWeight: 700, color: s.is_current ? '#FF7A45' : '#1a1a1a', fontSize: 13 }}>
                    {s.label}
                  </div>
                  <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', margin: '6px 0' }}>
                    <div style={{
                      width: '50%',
                      height: barHeight,
                      background: hasData ? 'linear-gradient(180deg, #FF7A45, #FFB37A)' : '#f0f0f0',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6 }}>
                    <div>🔊 {s.play_count} 次</div>
                    <div>🎵 {s.media_count} 媒体</div>
                    <div>✅ {s.sentence_count} 句</div>
                  </div>
                </Card>
              </Col>
            )
          })}
        </Row>
      </div>
    )
  }

  return (
    <div>
      <Title level={4} style={{ color: '#1a1a1a' }}>📊 学习记录</Title>

      {/* 汇总统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 16 }}>
            <Statistic
              title="已背诵句子数"
              value={progress?.completed_sentences ?? 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 16 }}>
            <Statistic
              title="播放记录数"
              value={records.length}
              prefix={<PlayCircleOutlined style={{ color: '#FF7A45' }} />}
              valueStyle={{ color: '#FF7A45' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 16 }}>
            <Statistic
              title="专辑数"
              value={progress?.albums?.length ?? 0}
              prefix={<FolderOutlined style={{ color: '#FAAD14' }} />}
              valueStyle={{ color: '#FAAD14' }}
            />
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
                    <Button type="link" onClick={goTodayWeek} style={{ color: '#FF7A45' }}>回到本周</Button>
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
        <Card title="📁 按专辑进度" style={{ marginBottom: 16, borderRadius: 16 }}>
          {progress.albums.map((a) => (
            <div key={a.album} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{a.album}</span>
                <span style={{ color: '#888' }}>
                  已学 {a.played}/{a.total} · 共听 {a.total_played} 次
                </span>
              </div>
              <Progress percent={a.total > 0 ? Math.round((a.played / a.total) * 100) : 0} size="small" strokeColor="#FF7A45" />
            </div>
          ))}
        </Card>
      )}

      {/* 播放记录表 */}
      {records.length === 0 ? (
        <Empty description="暂无播放记录" />
      ) : (
        <Card title="🎵 播放记录" style={{ borderRadius: 16 }}>
          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            size="middle"
          />
        </Card>
      )}
    </div>
  )
}
