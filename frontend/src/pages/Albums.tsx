import { useEffect, useState } from 'react'
import { Row, Col, Card, Spin, Empty, Typography, Tag, Modal, Input, message } from 'antd'
import { FolderOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mediaApi } from '@/api'
import MediaCover from '@/components/MediaCover'
import type { Album, MediaFile, MediaListResponse } from '@/types'

const { Text } = Typography

interface AlbumPreview {
  count: number
  firstMedia?: MediaFile
}

// 基于专辑名生成确定性浅色背景（与 MediaCover 的 pastelColor 保持一致风格）
function pastelColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  const sat = 45 + (hash % 21)
  const light = 80 + ((hash >> 4) % 13)
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

export default function Albums() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<Record<string, AlbumPreview>>({})
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Album | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await mediaApi.albums()
        const list = res.data.data.albums ?? []
        setAlbums(list)
        // 加载每个专辑的封面预览：优先取视频，无视频再取音频
        for (const a of list) {
          // 先尝试视频
          let m = await mediaApi.list({ album: a.album, type: 'video', size: 1 })
          let firstList = (m.data.data as MediaListResponse).list
          // 没有视频再取任意（音频）
          if (firstList.length === 0) {
            m = await mediaApi.list({ album: a.album, size: 1 })
            firstList = (m.data.data as MediaListResponse).list
          }
          setPreview((p) => ({
            ...p,
            [a.album]: { count: a.count, firstMedia: firstList[0]?.media },
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

  // 打开重命名 Modal
  const openRename = (a: Album) => {
    setRenameTarget(a)
    setRenameValue(a.album)
    setRenameOpen(true)
  }

  // 执行重命名
  const handleRename = async () => {
    if (!renameTarget) return
    const newName = renameValue.trim()
    if (!newName || newName === renameTarget.album) {
      setRenameOpen(false)
      return
    }
    try {
      await mediaApi.renameAlbum(renameTarget.album, newName)
      message.success('重命名成功')
      setRenameOpen(false)
      setRenameTarget(null)
      await reloadAlbums()
    } catch (err) {
      message.error('重命名失败：' + (err as Error).message)
    }
  }

  // 删除专辑（含目录与所有文件）
  const handleDelete = (a: Album) => {
    Modal.confirm({
      title: '⚠️ 删除专辑',
      content: `确定删除专辑「${a.album}」吗？该专辑的整个文件夹（含音频/视频/字幕/封面/子目录）将被永久删除，且无法恢复。`,
      okText: '永久删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await mediaApi.deleteAlbum(a.album)
          message.success('已删除专辑: ' + a.album)
          await reloadAlbums()
        } catch (err) {
          message.error('删除失败：' + (err as Error).message)
        }
      },
    })
  }

  // 重新加载专辑列表（重命名/删除后调用）
  const reloadAlbums = async () => {
    const res = await mediaApi.albums()
    setAlbums(res.data.data.albums ?? [])
    setPreview({})
    for (const a of res.data.data.albums ?? []) {
      let m = await mediaApi.list({ album: a.album, type: 'video', size: 1 })
      let firstList = (m.data.data as MediaListResponse).list
      if (firstList.length === 0) {
        m = await mediaApi.list({ album: a.album, size: 1 })
        firstList = (m.data.data as MediaListResponse).list
      }
      setPreview((p) => ({
        ...p,
        [a.album]: { count: a.count, firstMedia: firstList[0]?.media },
      }))
    }
  }

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
            <Col xs={24} sm={12} md={8} lg={6} xl={6} xxl={4} key={a.album}>
              <Card
                hoverable
                onClick={() => navigate(`/?album=${encodeURIComponent(a.album)}`)}
                cover={
                  pv?.firstMedia ? (
                    <div style={{ position: 'relative' }}>
                      {/* 传入专辑名作为 colorKey，使音频卡片颜色按专辑统一 */}
                      <MediaCover media={pv.firstMedia} colorKey={a.album} />
                      {/* 专题名右上角，与媒体卡片保持一致 */}
                      <Tag color="blue" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.85)' }}>
                        {a.album}
                      </Tag>
                    </div>
                  ) : (
                    <div style={{
                      height: 140,
                      background: pastelColor(a.album),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}>
                      <FolderOutlined style={{ fontSize: 56, color: '#1677ff' }} />
                      <Tag color="blue" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.85)' }}>
                        {a.album}
                      </Tag>
                    </div>
                  )
                }
              >
                <Card.Meta
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Text ellipsis style={{ flex: 1, minWidth: 0 }}>{a.album}</Text>
                      <EditOutlined
                        onClick={(e) => { e.stopPropagation(); openRename(a) }}
                        style={{ color: '#1677ff', fontSize: 14, flexShrink: 0 }}
                        title="重命名专辑"
                      />
                      <DeleteOutlined
                        onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                        style={{ color: '#ff4d4f', fontSize: 14, flexShrink: 0 }}
                        title="删除专辑"
                      />
                    </div>
                  }
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

      <Modal
        title="重命名专辑"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={handleRename}
        okText="确定"
        cancelText="取消"
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRename}
          placeholder="输入新的专辑名"
          autoFocus
        />
      </Modal>
    </div>
  )
}
