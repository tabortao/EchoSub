import { useEffect, useState } from 'react'
import { Row, Col, Card, Spin, Empty, Typography, Tag } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mediaApi } from '@/api'
import type { Album, MediaListResponse } from '@/types'

const { Text } = Typography

export default function Albums() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<Record<string, number>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const res = await mediaApi.albums()
        setAlbums(res.data.data.albums ?? [])
        // 加载每个专辑前几个媒体预览
        for (const a of res.data.data.albums ?? []) {
          const m = await mediaApi.list({ album: a.album, size: 4 })
          setPreview((p) => ({ ...p, [a.album]: (m.data.data as MediaListResponse).list.length }))
        }
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

  if (albums.length === 0) {
    return <Empty description="暂无专辑，将媒体放入子文件夹即可形成专辑" />
  }

  return (
    <div>
      <Typography.Title level={4}>专辑浏览</Typography.Title>
      <Row gutter={[16, 16]}>
        {albums.map((a) => (
          <Col xs={24} sm={12} md={8} lg={6} key={a.album}>
            <Card
              hoverable
              onClick={() => navigate(`/?album=${encodeURIComponent(a.album)}`)}
              cover={
                <div style={{
                  height: 140,
                  background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FolderOutlined style={{ fontSize: 56, color: '#1677ff' }} />
                </div>
              }
            >
              <Card.Meta
                title={<Text ellipsis style={{ maxWidth: '100%' }}>{a.album}</Text>}
                description={
                  <Tag color="blue">{a.count} 个文件</Tag>
                }
              />
              {preview[a.album] !== undefined && (
                <Text type="secondary" style={{ fontSize: 12 }}>预览 {preview[a.album]} 项</Text>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
