// 全局类型定义

export interface User {
  id: number
  username: string
  created_at?: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface Tag {
  id: number
  name: string
  user_id: number
}

export type MediaType = 'video' | 'audio'

export interface MediaFile {
  id: number
  path: string
  name: string
  type: MediaType
  album: string | null
  sub_album: string | null
  duration: number
  file_size: number
  file_modified_at: string
  subtitle_path: string | null
  cover_path: string | null
  tags: Tag[]
}

export interface MediaListItem {
  media: MediaFile
  play_count: number
  last_position: number
  last_played_at: string
}

export interface MediaListResponse {
  list: MediaListItem[]
  total: number
  page: number
  size: number
}

export interface SubAlbum {
  sub_album: string
  count: number
}

export interface Album {
  album: string
  count: number
  sub_albums?: SubAlbum[]
}

export interface BrowseEntry {
  name: string
  is_dir: boolean
  size: number
}

export interface BrowseResponse {
  dirs: BrowseEntry[]
  files: BrowseEntry[]
  path: string
}

export interface UploadResult {
  saved: string[]
  skipped: string[]
  count: number
  path: string
}

export interface Sentence {
  index: number
  start: number
  end: number
  text: string
  completed: boolean
  repeat_count: number
  favorited: boolean
}

export interface SubtitleResponse {
  sentences: Sentence[]
}

export interface PlayRecord {
  id: number
  user_id: number
  media_id: number
  play_count: number
  last_position: number
  last_played_at: string
  media?: MediaFile
}

export interface SentenceProgress {
  id: number
  user_id: number
  media_id: number
  sentence_index: number
  completed: boolean
  repeat_count: number
  updated_at: string
}

export interface Settings {
  loop_count: number
  sentence_repeat: number
  pause_seconds: number
}

export interface AlbumProgress {
  album: string
  total: number
  played: number
  total_played: number
}

export interface TagProgress {
  tag_id: number
  tag_name: string
  total: number
  played: number
}

export interface ProgressResponse {
  albums: AlbumProgress[]
  tags: TagProgress[]
  completed_sentences: number
}

// 学习页面（专辑内自定义笔记，支持 markdown + 多图）
export interface StudyNote {
  id: number
  album: string
  title: string
  content: string
  images: string[]
  created_at: string
  updated_at: string
}

// API 统一响应
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}
