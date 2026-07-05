import { useEffect, useState } from 'react'
import { Row, Col, Card, Spin, Empty, Typography, Tag, Modal, Input, Dropdown, message } from 'antd'
import type { MenuProps } from 'antd'
import { FolderOutlined, EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mediaApi } from '@/api'
import MediaCover from '@/components/MediaCover'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { Album, MediaFile, MediaListResponse } from '@/types'

const { Text } = Typography

interface AlbumPreview {
  count: number
  firstMedia?: MediaFile
}

// 基于专辑名生成确定性浅色背景
function pastelColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  const sat = 50 + (hash % 21) // 50~70 稍饱和一点，小学生喜欢鲜艳
  const light = 78 + ((hash >> 4) % 12) // 78~90
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

// 基于专辑名生成一个深色（用于文件夹图标）
function vividColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 70%, 55%)`
}

export default function Albums() {
  const navigate = useNavigate()
  const { isPhone } = useDeviceSize()
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
        for (const a of list) {
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
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const openRename = (a: Album) => {
    setRenameTarget(a)
    setRenameValue(a.album)
    setRenameOpen(true)
  }

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

  const [deleteTarget, setDeleteTarget] = useState<Album | null>(null)

  const handleDelete = (a: Album) => {
    setDeleteTarget(a)
  }

  // 用户在密码弹窗中提交后真正执行删除
  const confirmDeleteAlbum = async (password: string) => {
    if (!deleteTarget) return
    try {
      await mediaApi.deleteAlbum(deleteTarget.album, password)
      message.success('已删除专辑: ' + deleteTarget.album)
      setDeleteTarget(null)
      await reloadAlbums()
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '删除失败'
      if (status === 401) {
        message.error(msg)
        throw err
      }
      setDeleteTarget(null)
      message.error(msg)
    }
  }

  // ⋯ 菜单项：重命名 + 删除
  const buildMenu = (): MenuProps['items'] => [
    { key: 'rename', label: '✏️ 重命名', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '🗑️ 删除专辑', icon: <DeleteOutlined />, danger: true },
  ]

  const onMenuClick = (a: Album, key: string) => {
    if (key === 'rename') openRename(a)
    else if (key === 'delete') handleDelete(a)
  }

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
    return <Empty description="📁 暂无专辑，把媒体文件放入子文件夹就会自动形成专辑哦~" />
  }

  return (
    <div>
      <Typography.Title level={4} style={{ color: 'var(--ac-text-header, #794f27)', fontSize: isPhone ? 18 : 20, fontWeight: 800, letterSpacing: '0.02em' }}>📂 专辑浏览</Typography.Title>
      <Row gutter={[12, 12]}>
        {albums.map((a) => {
          const pv = preview[a.album]
          const subs = a.sub_albums ?? []
          const folderColor = vividColor(a.album)
          return (
            <Col xs={12} sm={8} md={6} lg={4} xl={4} xxl={4} key={a.album}>
              <Card
                hoverable
                style={{ overflow: 'hidden', borderRadius: 'var(--radius-lg)' }}
                onClick={() => navigate(`/?album=${encodeURIComponent(a.album)}`)}
                cover={
                  pv?.firstMedia ? (
                    <div style={{ position: 'relative' }}>
                      <MediaCover media={pv.firstMedia} colorKey={a.album} />
                      <Tag color="blue" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 12, fontSize: 12, padding: '2px 8px', border: 'none' }}>
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
                      <FolderOutlined style={{ fontSize: 56, color: folderColor }} />
                      <Tag color="blue" style={{ position: 'absolute', top: 8, right: 8, margin: 0, background: 'rgba(255,255,255,0.92)', fontWeight: 700, borderRadius: 12, fontSize: 12, padding: '2px 8px', border: 'none' }}>
                        {a.album}
                      </Tag>
                    </div>
                  )
                }
              >
                <Card.Meta
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Text ellipsis style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: isPhone ? 14 : 14, color: 'var(--ac-text-header, #794f27)' }}>{a.album}</Text>
                      <Dropdown
                        menu={{ items: buildMenu(), onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); onMenuClick(a, key) } }}
                        trigger={['click']}
                        placement="bottomRight"
                      >
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            borderRadius: 12, fontSize: 18, color: 'var(--ac-text-secondary, #9f927d)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, minWidth: 44, minHeight: 44, padding: 0,
                          }}
                          title="更多操作"
                        >
                          <MoreOutlined />
                        </button>
                      </Dropdown>
                    </div>
                  }
                  description={
                    <div>
                      <Tag color="blue" style={{ borderRadius: 10, fontWeight: 600 }}>🎵 {a.count} 个文件</Tag>
                      {subs.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {subs.map((s) => (
                            <Tag
                              key={s.sub_album}
                              color="cyan"
                              style={{ cursor: 'pointer', marginRight: 0, borderRadius: 10, fontWeight: 600 }}
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
        title="✏️ 重命名专辑"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={handleRename}
        okText="确定"
        cancelText="取消"
        okButtonProps={{ size: isPhone ? 'large' : 'middle', style: { minHeight: 44 } }}
        cancelButtonProps={{ size: isPhone ? 'large' : 'middle', style: { minHeight: 44 } }}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRename}
          placeholder="输入新的专辑名"
          autoFocus
          size="large"
        />
      </Modal>

      {/* 删除专辑：要求输入登录密码确认 */}
      <PasswordConfirmModal
        open={!!deleteTarget}
        title="🗑️ 删除专辑"
        description={
          deleteTarget
            ? `确定删除专辑「${deleteTarget.album}」吗？整个文件夹（含音频/视频/字幕/封面）将被永久删除，无法恢复。`
            : ''
        }
        onConfirm={confirmDeleteAlbum}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
