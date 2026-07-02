import { useEffect, useState } from 'react'
import { Modal, Select, Input, Button, Space, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { tagApi, mediaApi } from '@/api'
import type { Tag } from '@/types'

interface TagManagerModalProps {
  open: boolean
  mediaId: number | null
  currentTagIds: number[]
  onClose: () => void
  onSaved?: () => void
}

// TagManagerModal 为指定媒体管理标签：多选已有标签 + 快速创建新标签。
export default function TagManagerModal({ open, mediaId, currentTagIds, onClose, onSaved }: TagManagerModalProps) {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>(currentTagIds)
  const [newTagName, setNewTagName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedIds(currentTagIds)
      setNewTagName('')
      tagApi
        .list()
        .then((res) => setAllTags(res.data.data.tags ?? []))
        .catch(() => {})
    }
  }, [open, currentTagIds])

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    try {
      const res = await tagApi.create(name)
      const newTag = res.data.data as Tag
      setAllTags((prev) => [...prev, newTag])
      setSelectedIds((prev) => [...prev, newTag.id])
      setNewTagName('')
      message.success('标签已创建')
    } catch {
      message.error('创建失败')
    }
  }

  const handleSave = async () => {
    if (!mediaId) return
    setSaving(true)
    try {
      await mediaApi.assignTags(mediaId, selectedIds)
      message.success('标签已保存')
      onSaved?.()
      onClose()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="管理标签"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择已有标签"
          value={selectedIds}
          onChange={setSelectedIds}
          options={allTags.map((t) => ({ label: t.name, value: t.id }))}
          optionFilterProp="label"
          showSearch
        />
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入新标签名称"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onPressEnter={handleCreateTag}
            maxLength={64}
          />
          <Button icon={<PlusOutlined />} onClick={handleCreateTag}>
            创建
          </Button>
        </Space.Compact>
      </Space>
    </Modal>
  )
}
