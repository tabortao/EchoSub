import client from './client'
import type {
  AuthResponse,
  MediaFile,
  MediaListResponse,
  SubtitleResponse,
  Album,
  Tag,
  PlayRecord,
  SentenceProgress,
  ProgressResponse,
  StudyStatsResponse,
  Settings,
  BrowseResponse,
  UploadResult,
  StudyNote,
  ApiResponse,
} from '@/types'

// ===== 认证 =====
export const authApi = {
  register: (username: string, password: string) =>
    client.post<ApiResponse<AuthResponse>>('/auth/register', { username, password }),
  login: (username: string, password: string) =>
    client.post<ApiResponse<AuthResponse>>('/auth/login', { username, password }),
  me: () => client.get<ApiResponse>('/auth/me'),
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
  /** 删除单个媒体文件（同步删除同目录同名字幕/封面，DB 软删除） */
  remove: (id: number) =>
    client.delete<ApiResponse<{ deleted: boolean; id: number }>>(`/media/${id}`),
  albums: () => client.get<ApiResponse<{ albums: Album[] }>>('/albums'),
  /** 重命名专辑（磁盘目录 + DB 记录批量更新） */
  renameAlbum: (album: string, newName: string) =>
    client.put<ApiResponse>('/albums/rename', { album, new_name: newName }),
  /** 删除专辑（递归删除磁盘目录 + DB 批量软删除） */
  deleteAlbum: (album: string) =>
    client.delete<ApiResponse>('/albums', { data: { album } }),
}

// ===== 标签 =====
export const tagApi = {
  list: () => client.get<ApiResponse<{ tags: Tag[] }>>('/tags'),
  create: (name: string) => client.post<ApiResponse<Tag>>('/tags', { name }),
  update: (id: number, name: string) => client.put<ApiResponse<Tag>>(`/tags/${id}`, { name }),
  delete: (id: number) => client.delete<ApiResponse>(`/tags/${id}`),
}

// ===== 学习记录 =====
export const recordApi = {
  list: () => client.get<ApiResponse<{ records: PlayRecord[] }>>('/records'),
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
  update: (id: number, data: { title?: string; content?: string }) =>
    client.put<ApiResponse<StudyNote>>(`/notes/${id}`, data),
  delete: (id: number) => client.delete<ApiResponse>(`/notes/${id}`),
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
