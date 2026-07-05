import { useEffect, useState } from 'react'
import { Modal, Select, Input, Button, Space, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { tagApi } from '@/api'
import { useDeviceSize } from '@/hooks/useDeviceSize'
import type { Tag, TagEntityType } from '@/types'

/**
 * TagManagerModal 通用标签管理弹窗。
 * 支持任意实体类型（媒体 / 专辑 / 季 / 学习页），由调用方传入 entityType + entityId。
 * 设计为可复用：实体类型决定后端 attach/detach 的目标，但 UI 完全一致。
 *
 * v0.6.0 移动端适配：
 * - Select / Input / Button 在 isPhone 时升级为 large（minHeight 44）
 * - Modal OK / Cancel 按钮同步 large 化，确保触控目标合规
 */
interface TagManagerModalProps {
  open: boolean
  /** 实体类型，决定后端目标表 */
  entityType: TagEntityType
  /** 实体 ID（媒体:MediaFile.ID；专辑/季:AlbumMeta.ID；学习页:StudyNote.ID） */
  entityId: number | null
  /** 当前已绑定的标签 ID 列表 */
  currentTagIds: number[]
  onClose: () => void
  onSaved?: () => void
}

export default function TagManagerModal({
  open, entityType, entityId, currentTagIds, onClose, onSaved,
}: TagManagerModalProps) {
  const { isPhone } = useDeviceSize()
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
    if (!entityId) return
    setSaving(true)
    try {
      // 覆盖式设置：后端会先删除旧关联再插入新关联
      await tagApi.setForEntity(entityType, entityId, selectedIds)
      message.success('标签已保存')
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '保存失败'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // 标题：按实体类型显示
  const titleByType: Record<TagEntityType, string> = {
    media: '管理标签（媒体）',
    album: '管理标签（专辑）',
    season: '管理标签（季）',
    note: '管理标签（学习页）',
  }

  // 统一的触控目标尺寸：手机端 large，桌面 middle
  const inputSize = isPhone ? 'large' : 'middle'
  const btnMinHeight = 44

  return (
    <Modal
      title={titleByType[entityType] ?? '管理标签'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      okButtonProps={{ size: inputSize, style: { minHeight: btnMinHeight } }}
      cancelButtonProps={{ size: inputSize, style: { minHeight: btnMinHeight } }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          size={inputSize}
          placeholder="选择已有标签"
          value={selectedIds}
          onChange={setSelectedIds}
          options={allTags.map((t) => ({ label: t.name, value: t.id }))}
          optionFilterProp="label"
          showSearch
          maxTagCount="responsive"
          tagRender={({ value, closable, onClose: onTagClose }) => {
            const tag = allTags.find((t) => t.id === value)
            return (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: isPhone ? '2px 10px' : '0 8px',
                  minHeight: isPhone ? 26 : 22,
                  margin: '2px 4px 2px 0',
                  background: 'var(--ant-color-primary-bg, #e6f4ff)',
                  color: 'var(--ant-color-primary, #1677ff)',
                  border: '1px solid color-mix(in srgb, var(--ant-color-primary) 30%, transparent)',
                  borderRadius: 6,
                  fontSize: isPhone ? 14 : 13,
                  fontWeight: 500,
                }}
              >
                {tag?.name ?? value}
                {closable && (
                  <span
                    onClick={onTagClose}
                    style={{
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 22,
                      minHeight: 22,
                      borderRadius: 4,
                    }}
                  >
                    ×
                  </span>
                )}
              </span>
            )
          }}
        />
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入新标签名称"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onPressEnter={handleCreateTag}
            maxLength={64}
            size={inputSize}
            style={{ minHeight: btnMinHeight }}
          />
          <Button
            icon={<PlusOutlined />}
            onClick={handleCreateTag}
            size={inputSize}
            style={{ minHeight: btnMinHeight }}
          >
            创建
          </Button>
        </Space.Compact>
      </Space>
    </Modal>
  )
}
