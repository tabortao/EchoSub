import { useEffect, useState } from 'react'
import { Card, Row, Col, Input, Select, Empty, Spin, Tag, Progress, Typography, Tooltip, Button, Space } from 'antd'
import { PlayCircleOutlined, VideoCameraOutlined, AudioOutlined, SearchOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mediaApi } from '@/api'
import type { MediaListResponse, MediaListItem } from '@/types'
import { formatDuration, formatRelative } from '@/utils'

const { Text } = Typography

export default function Home() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MediaListResponse | null>(null)
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState<string | undefined>(undefined)
  const [sort, setSort] = useState('file_modified_at')

  const albumFilter = searchParams.get('album') ?? undefined
  const tagFilter = searchParams.get('tag_id') ?? undefined

  const load = async () => {
    setLoading(true)
    try {
      const res = await mediaApi.list({
        keyword,
        type,
        sort,
        order: 'desc',
        page: 1,
        size: 100,
        album: albumFilter,
        tag_id: tagFilter,
      })
      setData(res.data.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, type, sort, albumFilter, tagFilter])

  const clearFilter = () => {
    setSearchParams({})
  }

  const items = data?.list ?? []

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 16 }} align="middle">
        <Col flex="auto">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索媒体名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
          />
        </Col>
        <Col>
          <Select
            placeholder="类型"
            allowClear
            style={{ width: 120 }}
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: 'video', label: '视频' },
              { value: 'audio', label: '音频' },
            ]}
          />
        </Col>
        <Col>
          <Select
            style={{ width: 140 }}
            value={sort}
            onChange={(v) => setSort(v)}
            options={[
              { value: 'file_modified_at', label: '存入时间' },
              { value: 'name', label: '名称' },
              { value: 'duration', label: '时长' },
            ]}
          />
        </Col>
      </Row>

      {(albumFilter || tagFilter) && (
        <div style={{ marginBottom: 16 }}>
          <Space>
            <span style={{ color: '#666' }}>当前筛选：</span>
            {albumFilter && <Tag color="blue" closable onClose={clearFilter}>专辑: {albumFilter}</Tag>}
            {tagFilter && <Tag color="purple" closable onClose={clearFilter}>标签筛选</Tag>}
            <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={clearFilter}>清除</Button>
          </Space>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : items.length === 0 ? (
        <Empty description="暂无媒体文件，请将文件放入媒体目录" />
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((item: MediaListItem) => (
            <Col xs={24} sm={12} md={8} lg={6} key={item.media.id}>
              <Card
                hoverable
                onClick={() => navigate(`/play/${item.media.id}`)}
                cover={
                  <div style={{
                    height: 140,
                    background: '#f0f2f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}>
                    {item.media.type === 'video' ? (
                      <VideoCameraOutlined style={{ fontSize: 48, color: '#999' }} />
                    ) : (
                      <AudioOutlined style={{ fontSize: 48, color: '#999' }} />
                    )}
                    <PlayCircleOutlined style={{
                      position: 'absolute',
                      fontSize: 40,
                      color: 'rgba(22,119,255,0.85)',
                    }} />
                  </div>
                }
              >
                <Card.Meta
                  title={
                    <Tooltip title={item.media.name}>
                      <Text ellipsis style={{ maxWidth: '100%' }}>{item.media.name}</Text>
                    </Tooltip>
                  }
                  description={
                    <div>
                      <div style={{ marginBottom: 4 }}>
                        {item.media.album && <Tag color="blue">{item.media.album}</Tag>}
                        <Text type="secondary">{formatDuration(item.media.duration)}</Text>
                      </div>
                      {item.play_count > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <Progress
                            percent={Math.min(100, Math.round((item.last_position / (item.media.duration || 1)) * 100))}
                            size="small"
                            format={() => `已听 ${item.play_count} 次`}
                          />
                        </div>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatRelative(item.last_played_at || item.media.file_modified_at)}
                      </Text>
                    </div>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
