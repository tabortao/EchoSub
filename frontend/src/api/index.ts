import client from './client'
import type {
  AuthResponse,
  MediaListResponse,
  SubtitleResponse,
  Album,
  Tag,
  PlayRecord,
  SentenceProgress,
  ProgressResponse,
  Settings,
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
  subtitle: (id: number) => client.get<ApiResponse<SubtitleResponse>>(`/media/${id}/subtitle`),
  assignTags: (id: number, tagIds: number[]) =>
    client.post<ApiResponse>(`/media/${id}/tags`, { tag_ids: tagIds }),
  albums: () => client.get<ApiResponse<{ albums: Album[] }>>('/albums'),
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
  progress: () => client.get<ApiResponse<ProgressResponse>>('/progress'),
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
