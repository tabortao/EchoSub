import { useEffect, useState } from 'react'
import {
  Card, Breadcrumb, Tag, Upload, Progress, message, Typography, Space, Button, Empty, Spin,
  Modal, Input, Dropdown, type MenuProps,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  UploadOutlined,
  FolderOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  ReloadOutlined,
  HomeOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  ExportOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { mediaApi } from '@/api'
import type { BrowseEntry } from '@/types'
import { formatSize } from '@/utils'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'

const { Text } = Typography
const { Dragger } = Upload

// 文件扩展名 → emoji 图标
function fileEmoji(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'mkv', 'mov', 'webm', 'avi'].includes(ext)) return '🎬'
  if (['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg'].includes(ext)) return '🎵'
  if (['srt', 'vtt'].includes(ext)) return '📄'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return '🖼️'
  return '📄'
}

export default function UploadPage() {
  const { isPhone } = useDeviceSize()
  const [path, setPath] = useState('')
  const [dirs, setDirs] = useState<BrowseEntry[]>([])
  const [files, setFiles] = useState<BrowseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileList, setFileList] = useState<UploadFile[]>([])

  // 文件管理弹窗
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirValue, setMkdirValue] = useState('')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<BrowseEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<BrowseEntry | null>(null)
  const [moveValue, setMoveValue] = useState('')
  const [actioning, setActioning] = useState(false)
  // 待删除的文件/目录（用于弹出密码确认框）
  const [deleteTarget, setDeleteTarget] = useState<BrowseEntry | null>(null)

  const load = async (p: string) => {
    setLoading(true)
    try {
      const res = await mediaApi.browse(p)
      setDirs(res.data.data.dirs ?? [])
      setFiles(res.data.data.files ?? [])
      setPath(res.data.data.path ?? '')
    } catch {
      message.error('加载目录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load('')
  }, [])

  const pathSegments = path ? path.split('/').filter(Boolean) : []

  const enterDir = (name: string) => {
    const next = path ? `${path}/${name}` : name
    load(next)
  }

  const goUp = () => {
    if (!pathSegments.length) return
    const segs = [...pathSegments]
    segs.pop()
    load(segs.join('/'))
  }

  const goToSegment = (idx: number) => {
    load(pathSegments.slice(0, idx + 1).join('/'))
  }

  // ── 新建目录 ──
  const openMkdir = () => {
    setMkdirValue('')
    setMkdirOpen(true)
  }
  const handleMkdir = async () => {
    const name = mkdirValue.trim()
    if (!name) { message.warning('请输入目录名'); return }
    setActioning(true)
    try {
      const newPath = path ? `${path}/${name}` : name
      await mediaApi.mkdir(newPath)
      message.success('目录已创建')
      setMkdirOpen(false)
      setMkdirValue('')
      load(path)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '创建失败'
      message.error(msg)
    } finally {
      setActioning(false)
    }
  }

  // ── 删除文件/目录：用户提交密码后真正调用 ──
  const confirmDelete = async (password: string) => {
    if (!deleteTarget) return
    const entry = deleteTarget
    setActioning(true)
    try {
      const targetPath = path ? `${path}/${entry.name}` : entry.name
      if (entry.is_dir) {
        await mediaApi.deleteDir(targetPath, password)
        message.success('目录已删除')
      } else {
        await mediaApi.deleteFile(targetPath, password)
        message.success('文件已删除')
      }
      setDeleteTarget(null)
      load(path)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '删除失败'
      // 密码错误：保留弹窗让用户重试
      if (status === 401) {
        message.error(msg)
        throw err
      }
      // 其他错误：关闭弹窗
      setDeleteTarget(null)
      message.error(msg)
    } finally {
      setActioning(false)
    }
  }

  // ── 重命名 ──
  const openRename = (entry: BrowseEntry) => {
    setRenameTarget(entry)
    setRenameValue(entry.name)
    setRenameOpen(true)
  }
  const handleRename = async () => {
    if (!renameTarget) return
    const newName = renameValue.trim()
    if (!newName) return
    if (newName === renameTarget.name) { setRenameOpen(false); return }
    setActioning(true)
    try {
      const oldPath = path ? `${path}/${renameTarget.name}` : renameTarget.name
      const newPath = path ? `${path}/${newName}` : newName
      await mediaApi.renamePath(oldPath, newPath)
      message.success('重命名成功')
      setRenameOpen(false)
      setRenameTarget(null)
      load(path)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '重命名失败'
      message.error(msg)
    } finally {
      setActioning(false)
    }
  }

  // ── 移动 ──
  const openMove = (entry: BrowseEntry) => {
    setMoveTarget(entry)
    setMoveValue('')
    setMoveOpen(true)
  }
  const handleMove = async () => {
    if (!moveTarget) return
    const dest = moveValue.trim()
    if (!dest) return
    setActioning(true)
    try {
      const oldPath = path ? `${path}/${moveTarget.name}` : moveTarget.name
      const newPath = `${dest}/${moveTarget.name}`
      await mediaApi.movePath(oldPath, newPath)
      message.success('移动成功')
      setMoveOpen(false)
      setMoveTarget(null)
      load(path)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '移动失败'
      message.error(msg)
    } finally {
      setActioning(false)
    }
  }

  // ── 上传 ──
  const handleUpload = async () => {
    const realFiles = fileList
      .map((f) => f.originFileObj)
      .filter((f) => !!f) as File[]
    if (realFiles.length === 0) {
      message.warning('请先选择文件')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      const res = await mediaApi.upload(path, realFiles, (p) => setProgress(p))
      const data = res.data.data
      message.success(`上传完成：成功 ${data.count} 个文件`)
      if (data.skipped.length > 0) {
        message.warning(`跳过 ${data.skipped.length} 个已存在文件`)
      }
      setFileList([])
      load(path)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '上传失败'
      message.error(msg)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const breadcrumbItems = [
    { title: <a onClick={() => load('')}><HomeOutlined /> 根目录</a> },
    ...pathSegments.map((seg, idx) => ({
      title: <a key={idx} onClick={() => goToSegment(idx)}>{seg}</a>,
    })),
  ]

  // 为每个条目生成下拉菜单
  const entryMenu = (entry: BrowseEntry): MenuProps['items'] => [
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: '重命名',
      onClick: () => openRename(entry),
    },
    {
      key: 'move',
      icon: <ExportOutlined />,
      label: '移动到...',
      onClick: () => openMove(entry),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: <span style={{ color: '#ff4d4f' }}>删除</span>,
      onClick: () => {
        setDeleteTarget(entry)
      },
    },
  ]

  return (
    <div>
      {/* 目录浏览 */}
      <Card
        size="small"
        title={
          <Space size={isPhone ? 4 : 8} wrap>
            <Text strong>📂 媒体目录</Text>
            {pathSegments.length > 0 && (
              <Button
                size={isPhone ? 'middle' : 'small'}
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={goUp}
                style={{ minHeight: 44, paddingInline: isPhone ? 12 : 7 }}
              >
                上级
              </Button>
            )}
          </Space>
        }
        extra={
          <Space size={isPhone ? 8 : 4} wrap>
            <Button
              size={isPhone ? 'middle' : 'small'}
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => load(path)}
              style={{ minHeight: 44, paddingInline: isPhone ? 12 : 7 }}
            >
              刷新
            </Button>
            <Button
              size={isPhone ? 'middle' : 'small'}
              type="primary"
              icon={<FolderAddOutlined />}
              onClick={openMkdir}
              style={{ minHeight: 44, paddingInline: isPhone ? 12 : 7 }}
            >
              新建目录
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {/* 面包屑：手机端可横向滚动，路径深时不换行截断 */}
        <div
          style={{
            marginBottom: 12,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <Breadcrumb items={breadcrumbItems} style={{ display: 'inline-flex', minWidth: '100%' }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : dirs.length === 0 && files.length === 0 ? (
          <Empty description="📦 空目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {[...dirs, ...files].map((item) => (
              <div
                key={item.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  gap: 8,
                  cursor: item.is_dir ? 'pointer' : 'default',
                  padding: isPhone ? '12px 12px' : '8px 12px',
                  borderRadius: 8,
                  transition: 'background 0.15s ease',
                  background: 'transparent',
                }}
                onClick={() => item.is_dir && enterDir(item.name)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ac-bg-content-deep, rgba(159,146,125,0.08))'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {item.is_dir ? (
                    <FolderOutlined style={{ color: 'var(--ac-primary, #19c8b9)', fontSize: 18, flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{fileEmoji(item.name)}</span>
                  )}
                  <Text
                    ellipsis
                    style={{
                      color: item.is_dir ? 'var(--ac-primary, #19c8b9)' : 'var(--ac-text-primary, #333)',
                      fontWeight: item.is_dir ? 600 : 400,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {item.name}
                  </Text>
                  {!item.is_dir && (
                    <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                      {formatSize(item.size)}
                    </Text>
                  )}
                </div>
                <Tag
                  color={item.is_dir ? 'cyan' : 'default'}
                  style={{ borderRadius: 999, margin: 0, flexShrink: 0, fontSize: 12 }}
                >
                  {item.is_dir ? '📁 文件夹' : '📄 文件'}
                </Tag>
                <Dropdown menu={{ items: entryMenu(item) }} trigger={['click']} placement="bottomRight">
                  <Button
                    type="text"
                    size={isPhone ? 'middle' : 'small'}
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                    style={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}
                  />
                </Dropdown>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 上传区域 */}
      <Card size="small" title={<Text strong>📤 上传到当前目录{path ? `：${path}` : '：根目录'}</Text>}>
        <Dragger
          multiple
          fileList={fileList}
          beforeUpload={(_, files) => {
            setFileList((prev) => {
              const existing = new Set(prev.map((f) => f.name))
              const newFiles: UploadFile[] = files
                .filter((f) => !existing.has(f.name))
                .map((f) => ({
                  uid: `${f.name}-${Date.now()}`,
                  name: f.name,
                  size: f.size,
                  type: f.type,
                  originFileObj: f,
                }))
              return [...prev, ...newFiles]
            })
            return false
          }}
          onRemove={(file) => {
            setFileList((prev) => prev.filter((f) => f.uid !== file.uid))
          }}
          style={{ marginBottom: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: 'var(--ant-color-primary)' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此处</p>
          <p className="ant-upload-hint">支持多文件上传，同名文件将自动跳过</p>
        </Dragger>

        {uploading && (
          <div style={{ marginBottom: 16 }}>
            <Progress percent={progress} status="active" />
          </div>
        )}

        <Space wrap>
          <Button
            type="primary"
            size="large"
            icon={<UploadOutlined />}
            onClick={handleUpload}
            disabled={fileList.length === 0 || uploading}
            loading={uploading}
            style={{ minHeight: 44, minWidth: isPhone ? 120 : 'auto' }}
          >
            开始上传
          </Button>
          <Button
            size="large"
            disabled={fileList.length === 0 || uploading}
            onClick={() => setFileList([])}
            style={{ minHeight: 44 }}
          >
            清空
          </Button>
        </Space>

        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          ✨ 上传完成后文件会自动被扫描入库，可在首页查看。
        </Text>
      </Card>

      {/* 新建目录弹窗 */}
      <Modal
        title="新建目录"
        open={mkdirOpen}
        onOk={handleMkdir}
        onCancel={() => setMkdirOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={actioning}
      >
        <Input
          placeholder="请输入目录名"
          value={mkdirValue}
          onChange={(e) => setMkdirValue(e.target.value)}
          onPressEnter={handleMkdir}
          autoFocus
          size="large"
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          将在当前目录下创建子目录
        </Text>
      </Modal>

      {/* 重命名弹窗 */}
      <Modal
        title="重命名"
        open={renameOpen}
        onOk={handleRename}
        onCancel={() => { setRenameOpen(false); setRenameTarget(null) }}
        okText="确定"
        cancelText="取消"
        confirmLoading={actioning}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
          size="large"
        />
      </Modal>

      {/* 移动弹窗 */}
      <Modal
        title={`移动到...${moveTarget ? ` (${moveTarget.name})` : ''}`}
        open={moveOpen}
        onOk={handleMove}
        onCancel={() => { setMoveOpen(false); setMoveTarget(null) }}
        okText="移动"
        cancelText="取消"
        confirmLoading={actioning}
      >
        <Input
          placeholder="输入目标目录的相对路径，如：English/Unit1"
          value={moveValue}
          onChange={(e) => setMoveValue(e.target.value)}
          onPressEnter={handleMove}
          autoFocus
          size="large"
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          输入相对于媒体根目录的目标路径（不需要包含文件名）
        </Text>
      </Modal>

      {/* 删除文件/目录：要求输入登录密码确认 */}
      <PasswordConfirmModal
        open={!!deleteTarget}
        title={`🗑️ 删除${deleteTarget?.is_dir ? '目录' : '文件'}`}
        description={
          deleteTarget
            ? `确定要删除「${deleteTarget.name}」吗？${deleteTarget.is_dir ? '目录及其中所有文件都将被删除。' : '数据库中的学习记录不会被删除。'}`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
