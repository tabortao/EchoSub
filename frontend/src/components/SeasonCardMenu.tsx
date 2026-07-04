import { useState } from 'react'
import { Button, Dropdown, Upload, message } from 'antd'
import { MoreOutlined, PictureOutlined, DeleteOutlined, TagsOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import type { MenuProps } from 'antd'
import { mediaApi } from '@/api'
import PasswordConfirmModal from '@/components/PasswordConfirmModal'
import TagManagerModal from '@/components/TagManagerModal'
import type { Tag } from '@/types'

interface SeasonCardMenuProps {
  album: string
  subAlbum: string
  /** 季的 AlbumMeta.ID（用于标签 attach/detach）；为 0 时隐藏标签入口 */
  metaId?: number
  /** 当前季已绑定的标签（用于初始化 TagManagerModal） */
  tags?: Tag[]
  /** 操作完成后回调（通常用于刷新专辑数据） */
  onChanged: () => void
  /** 触发器按钮额外样式 */
  triggerStyle?: React.CSSProperties
  /** 菜单 z-index，默认 5 */
  zIndex?: number
}

/**
 * 季卡片 ⋮ 菜单：
 * - 管理标签（v0.5.0 起）—— 通用 TagManagerModal
 * - 上传季封面（自动以 folder.<ext> 命名写入季目录）
 * - 删除季（递归删除季目录 + 软删除该季下所有 MediaFile / AlbumMeta，需登录密码二次确认）
 */
export default function SeasonCardMenu({
  album,
  subAlbum,
  metaId = 0,
  tags = [],
  onChanged,
  triggerStyle,
  zIndex = 5,
}: SeasonCardMenuProps) {
  const [uploading, setUploading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // 标签管理弹窗：open=true 时显示
  const [tagOpen, setTagOpen] = useState(false)

  // 上传季封面
  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    beforeUpload: (file) => {
      if (file.size > 10 * 1024 * 1024) {
        message.error('封面图不能超过 10MB')
        return Upload.LIST_IGNORE
      }
      setUploading(true)
      mediaApi
        .uploadAlbumCover(album, file, subAlbum)
        .then(() => {
          message.success('季封面已上传')
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

  // 删除季
  const handleDelete = (password: string) => {
    return mediaApi
      .deleteSeason(album, subAlbum, password)
      .then(() => {
        message.success('已删除该季')
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

  const items: MenuProps['items'] = [
    {
      key: 'tag',
      icon: <TagsOutlined />,
      label: '🏷️ 管理标签',
      // 没有 metaId 时（如未扫描的季）禁用入口
      disabled: !metaId,
    },
    { type: 'divider' },
    {
      key: 'cover',
      icon: <PictureOutlined />,
      label: uploading ? '上传中…' : '🖼️ 上传季封面',
    },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '🗑️ 删除该季', danger: true },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent?.stopPropagation()
    if (key === 'tag') {
      setTagOpen(true)
    } else if (key === 'cover') {
      // 触发隐藏的 Upload input
      document.getElementById(`season-cover-input-${album}-${subAlbum}`)?.click()
    } else if (key === 'delete') {
      setDeleteOpen(true)
    }
  }

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
          <Button
            shape="circle"
            size="small"
            icon={<MoreOutlined style={{ fontSize: 18 }} />}
            style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', ...triggerStyle }}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
        <Upload {...uploadProps}>
          <span id={`season-cover-input-${album}-${subAlbum}`} style={{ display: 'none' }} />
        </Upload>
      </div>

      <PasswordConfirmModal
        open={deleteOpen}
        title="🗑️ 删除季"
        description={`确定删除「${album} / ${subAlbum}」吗？该季目录及其全部媒体 / 字幕 / 封面 / nfo 将被永久删除，无法恢复。`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* 标签管理弹窗：通用 TagManagerModal，复用统一标签管理 UI */}
      <TagManagerModal
        open={tagOpen}
        entityType="season"
        entityId={metaId || null}
        currentTagIds={tags.map((t) => t.id)}
        onClose={() => setTagOpen(false)}
        onSaved={onChanged}
      />
    </>
  )
}
