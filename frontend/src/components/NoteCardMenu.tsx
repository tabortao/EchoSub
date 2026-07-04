import { useState } from 'react'
import { Button, Dropdown, Modal, Input, Upload, message } from 'antd'
import {
  MoreOutlined,
  PushpinFilled,
  PushpinOutlined,
  EditOutlined,
  PictureOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import type { MenuProps } from 'antd'
import { noteApi } from '@/api'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'
import type { StudyNote } from '@/types'

interface NoteCardMenuProps {
  note: StudyNote
  /** 操作完成后回调（如刷新列表） */
  onChanged: () => void
  /** 触发器（三个点按钮），由调用方提供以便定制样式。点击按钮不会触发外层卡片点击 */
  trigger?: React.ReactNode
  /** 触发器按钮额外样式 */
  triggerStyle?: React.CSSProperties
  /** 菜单 z-index，默认 5 */
  zIndex?: number
}

/**
 * 学习页面卡片 ⋮ 菜单：
 * - 置顶 / 取消置顶
 * - 重命名（修改标题）
 * - 上传封面（向笔记添加图片，新图片会作为首图用于卡片展示）
 * - 删除（密码二次确认）
 *
 * 该组件仅渲染 Dropdown + 隐藏 Upload + 重命名 Modal + 密码确认 Modal，
 * 触发器（三个点按钮）由调用方提供，便于在不同卡片样式中复用。
 */
export default function NoteCardMenu({
  note,
  onChanged,
  trigger,
  triggerStyle,
  zIndex = 5,
}: NoteCardMenuProps) {
  const [pinned, setPinned] = useState(!!note.pinned)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(note.title)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // 切换置顶
  const handleTogglePin = async () => {
    try {
      const res = await noteApi.pin(note.id)
      const next = res.data.data?.pinned ?? false
      setPinned(next)
      message.success(next ? '已置顶学习页面' : '已取消置顶')
      onChanged()
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? '置顶操作失败',
      )
    }
  }

  // 重命名提交
  const submitRename = async () => {
    const newName = renameValue.trim()
    if (!newName) {
      message.warning('请输入新标题')
      return
    }
    if (newName === note.title) {
      setRenameOpen(false)
      return
    }
    setSubmitting(true)
    try {
      await noteApi.update(note.id, { title: newName })
      message.success('已重命名')
      setRenameOpen(false)
      onChanged()
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? '重命名失败',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // 上传封面：使用笔记图片上传接口，上传后第一张图将作为封面
  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    beforeUpload: (file) => {
      if (file.size > 10 * 1024 * 1024) {
        message.error('封面图不能超过 10MB')
        return Upload.LIST_IGNORE
      }
      setUploading(true)
      noteApi
        .uploadImages(note.id, [file])
        .then(() => {
          message.success(note.images?.length > 0 ? '已追加封面图' : '封面已上传')
          onChanged()
        })
        .catch((err: unknown) => {
          message.error(
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message
              ?? '上传失败',
          )
        })
        .finally(() => setUploading(false))
      return false
    },
  }

  // 删除学习页面
  const handleDelete = (password: string) => {
    return noteApi
      .delete(note.id, password)
      .then(() => {
        message.success('已删除学习页面')
        setDeleteOpen(false)
        onChanged()
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? '删除失败'
        message.error(msg)
        if (status === 401) throw err
        setDeleteOpen(false)
      })
  }

  // 菜单项：最上方为置顶（视觉强调）
  const items: MenuProps['items'] = [
    {
      key: 'pin',
      icon: pinned ? <PushpinFilled /> : <PushpinOutlined />,
      label: pinned ? '取消置顶' : '📌 置顶学习页',
    },
    { type: 'divider' },
    { key: 'rename', icon: <EditOutlined />, label: '✏️ 重命名' },
    { key: 'cover', icon: <PictureOutlined />, label: uploading ? '上传中…' : '🖼️ 上传封面' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '🗑️ 删除', danger: true },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent?.stopPropagation()
    if (key === 'pin') {
      handleTogglePin()
    } else if (key === 'rename') {
      setRenameValue(note.title)
      setRenameOpen(true)
    } else if (key === 'cover') {
      // 触发隐藏的 Upload input
      document.getElementById(`note-cover-input-${note.id}`)?.click()
    } else if (key === 'delete') {
      setDeleteOpen(true)
    }
  }

  const defaultTrigger = (
    <Button
      shape="circle"
      size="small"
      icon={<MoreOutlined style={{ fontSize: 18 }} />}
      style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', ...triggerStyle }}
      onClick={(e) => e.stopPropagation()}
    />
  )

  return (
    <>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 8, right: 8, zIndex }}
      >
        <Dropdown
          menu={{ items, onClick: onMenuClick }}
          trigger={['click']}
          placement="topRight"
        >
          {trigger ?? defaultTrigger}
        </Dropdown>
        {/* 隐藏的 Upload 组件：菜单点击「上传封面」时手动触发 */}
        <Upload {...uploadProps}>
          <span id={`note-cover-input-${note.id}`} style={{ display: 'none' }} />
        </Upload>
      </div>

      {/* 重命名 Modal */}
      <Modal
        title={`重命名学习页面`}
        open={renameOpen}
        onOk={submitRename}
        onCancel={() => setRenameOpen(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
      >
        <div style={{ marginBottom: 8, color: '#8c8c8c' }}>
          将更新「{note.album}」专辑下该学习页面的标题。
        </div>
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
          autoFocus
          size="large"
          maxLength={255}
        />
      </Modal>

      {/* 删除：密码二次确认 */}
      <PasswordConfirmModal
        open={deleteOpen}
        title="🗑️ 删除学习页面"
        description={`确定删除「${note.title}」吗？该学习页面及其全部图片将被永久删除，无法恢复。`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  )
}
