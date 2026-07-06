import client from './client'
import type {
  AuthResponse,
  User,
  MediaFile,
  MediaListResponse,
  SubtitleResponse,
  Album,
  Tag,
  TagEntityType,
  TagFilterResult,
  PlayRecord,
  SentenceProgress,
  ProgressResponse,
  StudyStatsResponse,
  Settings,
  BrowseResponse,
  UploadResult,
  StudyNote,
  MediaRemark,
  ApiResponse,
  AITranslateRequest,
  AITranslateResponse,
  AITestResponse,
  AIStatus,
  Sentence,
} from '@/types'

// ===== 认证 =====
export const authApi = {
  register: (username: string, password: string) =>
    client.post<ApiResponse<AuthResponse>>('/auth/register', { username, password }),
  login: (username: string, password: string) =>
    client.post<ApiResponse<AuthResponse>>('/auth/login', { username, password }),
  me: () => client.get<ApiResponse<User>>('/auth/me'),
  /** 修改密码（需验证旧密码） */
  changePassword: (oldPassword: string, newPassword: string) =>
    client.put<ApiResponse>('/auth/password', { old_password: oldPassword, new_password: newPassword }),
  /** 修改用户名 */
  updateProfile: (username: string) =>
    client.put<ApiResponse<{ user: User; old_username: string }>>('/auth/profile', { username }),
  /** 上传头像 */
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.post<ApiResponse<{ user: User }>>('/auth/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  /** 当前用户头像 URL（需拼接 token） */
  avatarUrl: (token: string) => `/api/v1/auth/avatar?token=${encodeURIComponent(token)}`,
}

// ===== 媒体 =====
export const mediaApi = {
  list: (params?: {
    album?: string
    sub_album?: string
    type?: string
    keyword?: string
    tag_id?: string
    sort?: string
    order?: string
    page?: number
    size?: number
  }) => client.get<ApiResponse<MediaListResponse>>('/media', { params }),
  get: (id: number) => client.get<ApiResponse>(`/media/${id}`),
  streamUrl: (id: number, token: string) => `/api/v1/media/${id}/stream?token=${encodeURIComponent(token)}`,
  coverUrl: (id: number, token: string) => `/api/v1/media/${id}/cover?token=${encodeURIComponent(token)}`,
  browse: (path?: string) =>
    client.get<ApiResponse<BrowseResponse>>('/media/browse', { params: { path: path ?? '' } }),
  upload: (path: string, files: File[], onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('path', path)
    files.forEach((f) => form.append('files', f))
    return client.post<ApiResponse<UploadResult>>('/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },
  subtitle: (id: number) => client.get<ApiResponse<SubtitleResponse>>(`/media/${id}/subtitle`),
  assignTags: (id: number, tagIds: number[]) =>
    client.post<ApiResponse>(`/media/${id}/tags`, { tag_ids: tagIds }),
  /** 重命名媒体文件（不含扩展名），后端会同步重命名同目录同名的字幕/封面文件 */
  rename: (id: number, name: string) =>
    client.put<ApiResponse<{ media: MediaFile; renamed: string[] }>>(`/media/${id}/rename`, { name }),
  /** 删除单个媒体文件（同步删除同目录同名字幕/封面，DB 软删除）。
   *  传入 password 时附带 X-Delete-Password 头，由后端校验当前用户密码 */
  remove: (id: number, password?: string) =>
    client.delete<ApiResponse<{ deleted: boolean; id: number }>>(`/media/${id}`, {
      headers: password ? { 'X-Delete-Password': password, 'X-Confirm-Purpose': 'delete' } : undefined,
    }),
  albums: () => client.get<ApiResponse<{ albums: Album[] }>>('/albums'),
  /** 重命名专辑（磁盘目录 + DB 记录批量更新） */
  renameAlbum: (album: string, newName: string) =>
    client.put<ApiResponse>('/albums/rename', { album, new_name: newName }),
  /** 切换专辑置顶（v0.4.5 起）。返回当前是否置顶 */
  togglePinAlbum: (album: string) =>
    client.post<ApiResponse<{ pinned: boolean }>>(`/albums/${encodeURIComponent(album)}/pin`),
  /** 删除专辑（递归删除磁盘目录 + DB 批量软删除）。可选 password 二次确认 */
  deleteAlbum: (album: string, password?: string) =>
    client.delete<ApiResponse>('/albums', {
      data: { album },
      headers: password ? { 'X-Delete-Password': password, 'X-Confirm-Purpose': 'delete' } : undefined,
    }),
  /**
   * 上传专辑/季封面（统一命名为 folder.<ext> 写入对应目录）。
   * subAlbum 为空表示专辑本身，非空表示季目录。
   */
  uploadAlbumCover: (album: string, file: File | Blob, subAlbum = '') => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post<ApiResponse<{ album: string; sub_album: string; cover_path: string }>>(
      `/albums/${encodeURIComponent(album)}/cover${subAlbum ? `?sub=${encodeURIComponent(subAlbum)}` : ''}`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },
  /** 获取专辑/季封面 URL（带 JWT 鉴权 query 参数；<img> 元素无法设置 Authorization 头） */
  albumCoverUrl: (album: string, token: string, subAlbum = '') =>
    `/api/v1/albums/${encodeURIComponent(album)}/cover?token=${encodeURIComponent(token)}${subAlbum ? `&sub=${encodeURIComponent(subAlbum)}` : ''}`,
  /** 获取专辑/季横幅 URL */
  albumBannerUrl: (album: string, token: string, subAlbum = '') =>
    `/api/v1/albums/${encodeURIComponent(album)}/banner?token=${encodeURIComponent(token)}${subAlbum ? `&sub=${encodeURIComponent(subAlbum)}` : ''}`,
  /** 删除某个季（子目录）：X-Delete-Password 头校验当前用户密码 */
  deleteSeason: (album: string, subAlbum: string, password?: string) =>
    client.delete<ApiResponse<{ deleted: boolean; album: string; sub_album: string; files_deleted: number }>>(
      `/albums/${encodeURIComponent(album)}/sub/${encodeURIComponent(subAlbum)}`,
      {
        headers: password ? { 'X-Delete-Password': password, 'X-Confirm-Purpose': 'delete' } : undefined,
      },
    ),
  /** 新建目录 */
  mkdir: (path: string) =>
    client.post<{ data: { path: string } }>('/media/mkdir', { path }),
  /** 删除目录（递归）。可选 password 二次确认 */
  deleteDir: (path: string, password?: string) =>
    client.delete<ApiResponse>('/media/dir', {
      params: { path },
      headers: password ? { 'X-Delete-Password': password, 'X-Confirm-Purpose': 'delete' } : undefined,
    }),
  /** 删除文件。可选 password 二次确认 */
  deleteFile: (path: string, password?: string) =>
    client.delete<ApiResponse>('/media/file', {
      params: { path },
      headers: password ? { 'X-Delete-Password': password, 'X-Confirm-Purpose': 'delete' } : undefined,
    }),
  /** 重命名文件/目录 */
  renamePath: (oldPath: string, newPath: string) =>
    client.put<ApiResponse>('/media/path/rename', { old_path: oldPath, new_path: newPath }),
  /** 移动文件/目录 */
  movePath: (oldPath: string, newPath: string) =>
    client.put<ApiResponse>('/media/path/move', { old_path: oldPath, new_path: newPath }),
  /** 获取文件备注（不存在时 content 为空、exists=false） */
  getRemark: (mediaId: number) =>
    client.get<ApiResponse<MediaRemark>>(`/media/${mediaId}/remark`),
  /** 新增/更新文件备注（upsert，一个文件一条） */
  upsertRemark: (mediaId: number, content: string) =>
    client.put<ApiResponse<MediaRemark>>(`/media/${mediaId}/remark`, { content }),
  /** 删除文件备注 */
  deleteRemark: (mediaId: number) =>
    client.delete<ApiResponse>(`/media/${mediaId}/remark`),
  /**
   * 把编辑后的字幕句子数组原子写回原 SRT/VTT 文件（v0.8.0 起）
   * 后端会校验 start/end/text 合法性，全部通过后调用 pkg/subtitle.WriteFile 写回磁盘
   */
  updateSubtitle: (id: number, sentences: Sentence[]) =>
    client.put<ApiResponse<{ path: string; count: number }>>(`/media/${id}/subtitle`, { sentences }),
}

// ===== 标签 =====
export const tagApi = {
  list: () => client.get<ApiResponse<{ tags: Tag[] }>>('/tags'),
  create: (name: string) => client.post<ApiResponse<Tag>>('/tags', { name }),
  update: (id: number, name: string) => client.put<ApiResponse<Tag>>(`/tags/${id}`, { name }),
  delete: (id: number) => client.delete<ApiResponse>(`/tags/${id}`),
  // ===== 多态标签关联（v0.5.0 起）=====
  /**
   * 通用：给任意类型的实体附加一个标签（幂等）。
   * @param entityType 'media' | 'album' | 'season' | 'note'
   * @param entityId 对应实体的 ID
   */
  attach: (tagId: number, entityType: TagEntityType, entityId: number) =>
    client.post<ApiResponse>(`/tags/${tagId}/attach`, { entity_type: entityType, entity_id: entityId }),
  /** 通用：从某个实体上摘除一个标签 */
  detach: (tagId: number, entityType: TagEntityType, entityId: number) =>
    client.post<ApiResponse>(`/tags/${tagId}/detach`, { entity_type: entityType, entity_id: entityId }),
  /** 通用：覆盖式设置实体的全部标签（用于管理弹窗一次性保存） */
  setForEntity: (entityType: TagEntityType, entityId: number, tagIds: number[]) =>
    client.put<ApiResponse<{ tags: Tag[] }>>('/tags/entity', {
      entity_type: entityType,
      entity_id: entityId,
      tag_ids: tagIds,
    }),
  /** 通用：获取某个实体当前关联的标签列表 */
  getForEntity: (entityType: TagEntityType, entityId: number) =>
    client.get<ApiResponse<{ tags: Tag[] }>>('/tags/entity', {
      params: { type: entityType, id: entityId },
    }),
  /**
   * 按标签筛选：返回该标签下的所有实体，按 专辑 / 季 / 文件（媒体 + 学习页）分组。
   * 前端 Tags 页面选中某个标签后调用此接口。
   */
  entities: (tagId: number) =>
    client.get<ApiResponse<TagFilterResult>>(`/tags/${tagId}/entities`),
}

// ===== 学习记录 =====
export const recordApi = {
  list: () => client.get<ApiResponse<{ records: PlayRecord[] }>>('/records'),
  /**
   * 按 media_id 去重，每个媒体返回最近一条播放记录（已过滤软删除媒体）
   * @param limit 返回数量上限
   * @param opts.unfinished 是否只返回「未完成播放」的记录（last_position > 0 且 < duration * 0.95）。
   *                       首页「继续观看」区使用 unfinished=true，避免已看完的媒体占位。
   */
  recent: (limit = 20, opts: { unfinished?: boolean } = {}) =>
    client.get<ApiResponse<{ records: PlayRecord[] }>>('/records/recent', {
      params: { limit, unfinished: opts.unfinished },
    }),
  update: (mediaId: number, lastPosition: number, incrementPlay = false) =>
    client.put<ApiResponse>(`/records/${mediaId}`, {
      last_position: lastPosition,
      increment_play: incrementPlay,
    }),
  get: (mediaId: number) =>
    client.get<ApiResponse<{ record: PlayRecord; progress: SentenceProgress[] }>>(
      `/records/${mediaId}`,
    ),
  updateSentence: (mediaId: number, idx: number, completed: boolean, repeatCount?: number) =>
    client.put<ApiResponse>(`/records/${mediaId}/sentences/${idx}`, {
      completed,
      repeat_count: repeatCount ?? 0,
    }),
  toggleFavorite: (mediaId: number, idx: number) =>
    client.post<ApiResponse<{ favorited: boolean }>>(`/records/${mediaId}/sentences/${idx}/favorite`),
  /** 句子播放遍数 +1（自然推进越过句末时调用） */
  incrementRepeat: (mediaId: number, idx: number) =>
    client.post<ApiResponse<{ repeat_count: number }>>(`/records/${mediaId}/sentences/${idx}/repeat`),
  progress: () => client.get<ApiResponse<ProgressResponse>>('/progress'),
  /** 按周/月/年维度获取学习统计 */
  stats: (granularity: 'week' | 'month' | 'year', date?: string) =>
    client.get<ApiResponse<StudyStatsResponse>>('/records/stats', { params: { granularity, date } }),
}

// ===== 学习页面（专辑内自定义笔记 + 多图 + markdown）=====
export const noteApi = {
  list: (album?: string) =>
    client.get<ApiResponse<{ notes: StudyNote[] }>>('/notes', { params: album ? { album } : {} }),
  create: (album: string, title: string, content = '') =>
    client.post<ApiResponse<StudyNote>>('/notes', { album, title, content }),
  get: (id: number) => client.get<ApiResponse<StudyNote>>(`/notes/${id}`),
  update: (id: number, data: { title?: string; content?: string; pinned?: boolean }) =>
    client.put<ApiResponse<StudyNote>>(`/notes/${id}`, data),
  /** 删除学习页面（v0.4.5 起需 X-Delete-Password 头校验登录密码） */
  delete: (id: number, password?: string) =>
    client.delete<ApiResponse>(`/notes/${id}`, {
      headers: password ? { 'X-Delete-Password': password, 'X-Confirm-Purpose': 'delete' } : undefined,
    }),
  /** 切换置顶 */
  pin: (id: number) => client.post<ApiResponse<{ pinned: boolean }>>(`/notes/${id}/pin`),
  uploadImages: (id: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return client.post<ApiResponse<{ images: string[] }>>(`/notes/${id}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteImage: (id: number, filename: string) =>
    client.delete<ApiResponse<{ images: string[] }>>(`/notes/${id}/images/${encodeURIComponent(filename)}`),
  imageUrl: (id: number, filename: string, token: string) =>
    `/api/v1/notes/${id}/images/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`,
}

// ===== 设置 =====
export const settingsApi = {
  get: () => client.get<ApiResponse<Settings>>('/settings'),
  update: (data: Settings) => client.put<ApiResponse<Settings>>('/settings', data),
}

// ===== 扫描 =====
export const scanApi = {
  trigger: () => client.post<ApiResponse>('/scan/trigger'),
  status: () => client.get<ApiResponse<{ scanning: boolean }>>('/scan/status'),
}

// ===== AI 翻译（v0.8.0 起）=====
export const aiApi = {
  /**
   * 批量翻译：把多条字幕一次发给后端代理，后端再转发到 OpenAI 兼容 chat/completions 接口
   * 后端会按 "<序号>. <译文>" 解析 AI 输出，缺失项回退原文
   * v0.8.1 起：payload.mode = "bilingual"（默认）时返回「原文\n译文」双语字幕
   */
  translate: (payload: AITranslateRequest) =>
    client.post<ApiResponse<AITranslateResponse>>('/ai/translate', payload),
  /**
   * 查询 AI 是否启用 + 当前默认模型/目标语言
   * 注意：API key 与 base url 始终只存在后端环境变量，前端不接触密钥
   */
  status: () => client.get<ApiResponse<AIStatus>>('/ai/status'),
  /**
   * AI 连通性测试（v0.8.1 起）：
   * 用 texts=["Hello"] 调一次 AI，返回 ok/sample_translation/latency_ms，
   * 设置页用它判断「未配置 / 网络问题 / key 无效 / 模型不对」等场景
   */
  test: () => client.post<ApiResponse<AITestResponse>>('/ai/test', {}),
}
