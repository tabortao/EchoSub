import { useEffect, useState } from 'react'
import { Row, Col, Card, Spin, Empty, Typography, Tag } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mediaApi } from '@/api'
import MediaCover from '@/components/MediaCover'
import type { Album, MediaFile, MediaListResponse } from '@/types'

const { Text } = Typography

interface AlbumPreview {
  count: number
  firstMedia?: MediaFile
}

export default function Albums() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<Record<string, AlbumPreview>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const res = await mediaApi.albums()
        setAlbums(res.data.data.albums ?? [])
        // 加载每个专辑第一个媒体作为封面预览
        for (const a of res.data.data.albums ?? []) {
          const m = await mediaApi.list({ album: a.album, size: 1 })
          const list = (m.data.data as MediaListResponse).list
          setPreview((p) => ({
            ...p,
            [a.album]: { count: list.length, firstMedia: list[0]?.media },
          }))
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
        {albums.map((a) => {
          const pv = preview[a.album]
          const subs = a.sub_albums ?? []
          return (
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3} key={a.album}>
              <Card
                hoverable
                onClick={() => navigate(`/?album=${encodeURIComponent(a.album)}`)}
                cover={
                  pv?.firstMedia ? (
                    <MediaCover media={pv.firstMedia} />
                  ) : (
                    <div style={{
                      height: 140,
                      background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <FolderOutlined style={{ fontSize: 56, color: '#1677ff' }} />
                    </div>
                  )
                }
              >
                <Card.Meta
                  title={<Text ellipsis style={{ maxWidth: '100%' }}>{a.album}</Text>}
                  description={
                    <div>
                      <Tag color="blue">{a.count} 个文件</Tag>
                      {subs.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {subs.map((s) => (
                            <Tag
                              key={s.sub_album}
                              color="cyan"
                              style={{ cursor: 'pointer', marginRight: 0 }}
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/?album=${encodeURIComponent(a.album)}&sub_album=${encodeURIComponent(s.sub_album)}`)
                              }}
                            >
                              {s.sub_album} ({s.count})
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              </Card>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}
