import { useEffect, useState } from 'react'
import { Card, Breadcrumb, List, Tag, Upload, Progress, message, Typography, Space, Button, Empty, Spin } from 'antd'
import type { UploadFile } from 'antd'
import {
  UploadOutlined,
  FolderOutlined,
  FileOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { mediaApi } from '@/api'
import type { BrowseEntry } from '@/types'
import { formatSize } from '@/utils'

const { Title, Text } = Typography
const { Dragger } = Upload

export default function UploadPage() {
  const [path, setPath] = useState('')
  const [dirs, setDirs] = useState<BrowseEntry[]>([])
  const [files, setFiles] = useState<BrowseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileList, setFileList] = useState<UploadFile[]>([])

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

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <UploadOutlined /> 上传文件
      </Title>

      {/* 目录浏览 */}
      <Card
        size="small"
        title={
          <Space>
            <Text strong>媒体目录</Text>
            {pathSegments.length > 0 && (
              <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={goUp}>
                上级
              </Button>
            )}
          </Space>
        }
        extra={<Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => load(path)}>刷新</Button>}
        style={{ marginBottom: 16 }}
      >
        <Breadcrumb style={{ marginBottom: 12 }}>
          <Breadcrumb.Item>
            <a onClick={() => load('')}>根目录</a>
          </Breadcrumb.Item>
          {pathSegments.map((seg, idx) => (
            <Breadcrumb.Item key={idx}>
              <a onClick={() => goToSegment(idx)}>{seg}</a>
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : dirs.length === 0 && files.length === 0 ? (
          <Empty description="空目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={[...dirs, ...files]}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: item.is_dir ? 'pointer' : 'default', padding: '6px 12px' }}
                onClick={() => item.is_dir && enterDir(item.name)}
              >
                <Space>
                  {item.is_dir ? (
                    <FolderOutlined style={{ color: '#1677ff' }} />
                  ) : (
                    <FileOutlined style={{ color: '#999' }} />
                  )}
                  <Text style={{ color: item.is_dir ? '#1677ff' : '#333' }}>{item.name}</Text>
                  {!item.is_dir && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatSize(item.size)}
                    </Text>
                  )}
                </Space>
                {item.is_dir && <Tag color="blue">文件夹</Tag>}
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 上传区域 */}
      <Card size="small" title={<Text strong>上传到当前目录{path ? `：${path}` : '：根目录'}</Text>}>
        <Dragger
          multiple
          fileList={fileList}
          beforeUpload={(_, files) => {
            // 阻止自动上传，收集到 fileList
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
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此处</p>
          <p className="ant-upload-hint">支持多文件上传，同名文件将自动跳过</p>
        </Dragger>

        {uploading && (
          <div style={{ marginBottom: 16 }}>
            <Progress percent={progress} status="active" />
          </div>
        )}

        <Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleUpload}
            disabled={fileList.length === 0 || uploading}
            loading={uploading}
          >
            开始上传
          </Button>
          <Button
            disabled={fileList.length === 0 || uploading}
            onClick={() => setFileList([])}
          >
            清空
          </Button>
        </Space>

        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          上传完成后文件会自动被扫描入库，可在首页查看。
        </Text>
      </Card>
    </div>
  )
}
