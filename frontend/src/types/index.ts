// 全局类型定义

export interface User {
  id: number
  username: string
  avatar_path: string | null
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
  /** 同目录同基名（仅扩展名不同）的配对媒体 id（仅 video 端可能存在，指向 audio） */
  paired_media_id?: number | null
}

/** 单条媒体详情中返回的配对媒体摘要（GetMedia 附带） */
export interface PairedMedia {
  id: number
  name: string
  type: MediaType
  path: string
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

export interface MediaDetailResponse {
  media: MediaFile
  play_count: number
  last_position: number
  last_played_at: string
  /** 若当前媒体有同目录同基名的另一种类型配对（如 a.mp4 ↔ a.mp3），此字段返回配对项基础信息 */
  paired_media?: PairedMedia | null
}

export interface SubAlbum {
  sub_album: string
  count: number
  /** 当前用户有过播放记录的子专辑内媒体数量（后端 v0.3.1 起返回） */
  played?: number
}

export interface Album {
  album: string
  count: number
  /** 当前用户有过播放记录的专辑内媒体数量（后端 v0.3.1 起返回） */
  played?: number
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
  tts_voice: string
  tts_speed: number
  /** 界面主题标识：default | green | purple | blue */
  theme?: string
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

// 学习统计（按周/月/年维度）
export interface StudyStat {
  date: string
  label: string
  play_count: number
  media_count: number
  sentence_count: number
  is_current: boolean
}

export interface StudyStatsResponse {
  granularity: 'week' | 'month' | 'year'
  stats: StudyStat[]
  total_play: number
  total_media: number
  total_sentence: number
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

// 文件备注（用户对单个媒体文件的 markdown 笔记）
export interface MediaRemark {
  media_id: number
  content: string
  exists: boolean
  created_at?: string
  updated_at?: string
}

// API 统一响应
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}
