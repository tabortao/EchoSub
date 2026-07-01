import { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, Table, Progress, Spin, Typography, Empty, Tag } from 'antd'
import { CheckCircleOutlined, PlayCircleOutlined, FolderOutlined } from '@ant-design/icons'
import { recordApi } from '@/api'
import type { ProgressResponse, PlayRecord } from '@/types'
import { formatDuration, formatRelative } from '@/utils'
import { useNavigate } from 'react-router-dom'

const { Title } = Typography

export default function Records() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [records, setRecords] = useState<PlayRecord[]>([])
  const [loading, setLoading] = useState(true)

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
    {
      title: '播放次数',
      dataIndex: 'play_count',
      key: 'play_count',
    },
    {
      title: '进度',
      dataIndex: 'last_position',
      key: 'last_position',
      render: (pos: number, record: PlayRecord) =>
        record.media?.duration
          ? `${formatDuration(pos)} / ${formatDuration(record.media.duration)}`
          : formatDuration(pos),
    },
    {
      title: '上次播放',
      dataIndex: 'last_played_at',
      key: 'last_played_at',
      render: (v: string) => formatRelative(v),
    },
  ]

  return (
    <div>
      <Title level={4}>学习记录</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="已背诵句子数"
              value={progress?.completed_sentences ?? 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="播放记录数"
              value={records.length}
              prefix={<PlayCircleOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="专辑数"
              value={progress?.albums?.length ?? 0}
              prefix={<FolderOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {progress && progress.albums.length > 0 && (
        <Card title="按专辑进度" style={{ marginBottom: 16 }}>
          {progress.albums.map((a) => (
            <div key={a.album} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{a.album}</span>
                <span style={{ color: '#888' }}>
                  已学 {a.played}/{a.total} · 共听 {a.total_played} 次
                </span>
              </div>
              <Progress percent={a.total > 0 ? Math.round((a.played / a.total) * 100) : 0} size="small" />
            </div>
          ))}
        </Card>
      )}

      {records.length === 0 ? (
        <Empty description="暂无播放记录" />
      ) : (
        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="middle"
        />
      )}
    </div>
  )
}
