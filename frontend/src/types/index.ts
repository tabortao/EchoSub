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
  /** 季封面绝对路径（来自 Emby 扫描：folder.jpg / poster.jpg 等） */
  cover_path?: string | null
  /** 季横幅绝对路径（banner.jpg / backdrop.jpg） */
  banner_path?: string | null
  /** 季描述（来自 season.nfo / tvshow.nfo 的 <plot> 段） */
  description?: string
  /** 季关联的标签列表（v0.5.0 起） */
  tags?: Tag[]
  /** 季对应的 AlbumMeta.ID（用于标签 attach/detach） */
  meta_id?: number
}

export interface Album {
  album: string
  count: number
  /** 当前用户有过播放记录的专辑内媒体数量（后端 v0.3.1 起返回） */
  played?: number
  /** 专辑下存在季（sub_album）时为 true（v0.4.4 起） */
  has_seasons?: boolean
  /** 专辑封面绝对路径（来自 Emby 扫描：folder.jpg / poster.jpg / cover.jpg） */
  cover_path?: string | null
  /** 专辑横幅绝对路径（banner.jpg / backdrop.jpg） */
  banner_path?: string | null
  /** 专辑描述（来自 tvshow.nfo / album.nfo 的 <plot> 段） */
  description?: string
  /** 用户是否置顶该专辑（v0.4.5 起） */
  pinned?: boolean
  /** 置顶顺序（值越小越靠前；未置顶 = -1） */
  pin_order?: number
  /** 专辑关联的标签列表（v0.5.0 起） */
  tags?: Tag[]
  /** 专辑对应的 AlbumMeta.ID（用于标签 attach/detach） */
  meta_id?: number
  sub_albums?: SubAlbum[]
}

/** 标签可关联的实体类型（v0.5.0 起） */
export type TagEntityType = 'media' | 'album' | 'season' | 'note'

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

export type ColorMode = 'light' | 'dark' | 'auto'

export interface Settings {
  loop_count: number
  sentence_repeat: number
  pause_seconds: number
  tts_voice: string
  tts_speed: number
  /** 界面主题标识：default | green | purple | blue */
  theme?: string
  /** 浅色/深色模式：light | dark | auto（v0.6.0 起） */
  color_mode?: ColorMode
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
  /** 用户是否置顶（v0.4.5 起） */
  pinned?: boolean
  /** 学习页面关联的标签列表（v0.5.0 起） */
  tags?: Tag[]
  created_at: string
  updated_at: string
}

/** 标签筛选结果（v0.5.0 起）：按标签分组返回的实体列表 */
export interface TagFilterResult {
  /** 标签基本信息；后端偶尔可能不返回，统一允许 null */
  tag: Tag | null
  /** 携带此标签的专辑列表（AlbumMeta 中 sub_album='' 的记录） */
  albums: TagFilterAlbum[]
  /** 携带此标签的季列表 */
  seasons: TagFilterSeason[]
  /** 携带此标签的学习页面 */
  notes: StudyNote[]
  /** 携带此标签的媒体文件 */
  medias: MediaFile[]
}

export interface TagFilterAlbum {
  album: string
  sub_album: string
  name: string
  cover_path: string | null
  meta_id: number
}

export type TagFilterSeason = TagFilterAlbum

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

// ===== AI 翻译（v0.8.0 起）=====
/** AI 翻译用量统计（OpenAI 兼容接口的 usage 字段） */
export interface AIUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/** AI 批量翻译请求 */
export interface AITranslateRequest {
  /** 待翻译文本数组（顺序与响应 translations 一一对应） */
  texts: string[]
  /** 目标语言，可选；缺省使用后端配置默认值 */
  target_lang?: string
  /** 源语言，可选；缺省让 AI 自动识别 */
  source_lang?: string
  /**
   * 翻译模式（v0.8.1 起）：
   * - "replace"   ：用译文替换原文（v0.8.0 行为，保留兼容）
   * - "bilingual" ：生成「原文\n译文」双语字幕（默认）
   * 缺省时后端按 bilingual 处理
   */
  mode?: 'replace' | 'bilingual'
}

/** AI 批量翻译响应 */
export interface AITranslateResponse {
  /**
   * 翻译结果（顺序与请求一致；缺失项可能为空串）
   * - replace 模式下：单条译文
   * - bilingual 模式下：「原文\n译文」，可直接写入 SRT 形成双语字幕
   */
  translations: string[]
  /** 实际使用的模型 */
  model: string
  /** token 用量，缺省时为 null */
  usage?: AIUsage | null
}

/** AI 配置状态（仅返回「是否启用」，不返回密钥） */
export interface AIStatus {
  enabled: boolean
  /** 是否有 base url（不返回实际地址，只提示是否已配置） */
  has_base_url: boolean
  /** 当前默认模型 */
  model: string
  /** 默认目标语言 */
  target_lang: string
}

/** AI 连通性测试响应（v0.8.1 起） */
export interface AITestResponse {
  /** 是否连通（HTTP 200 + 业务 ok=true） */
  ok: boolean
  /** AI 是否启用（与 /ai/status 一致） */
  enabled: boolean
  /** 实际调通的模型名 */
  model: string
  /** 脱敏后的 base url 主机名（如 api.openai.com） */
  base_url_host: string
  /** 测试样例翻译结果（连通时返回，例：'你好'） */
  sample_translation?: string
  /** 本次调用耗时（毫秒） */
  latency_ms: number
  /** 错误或成功描述 */
  message: string
}

// ============================================================================
// v0.9.0 字典与句子解释
// ============================================================================

/** 字典查词请求 */
export interface DictionaryRequest {
  /** 要查询的单词（≤ 64 字符） */
  word: string
  /** 上下文句子（用于 AI 消歧） */
  sentence?: string
  /** 目标语言，缺省 Chinese */
  target_lang?: string
}

/** 音标 */
export interface DictionaryPronunciation {
  uk: string
  us: string
}

/** 字典例句 */
export interface DictionaryExample {
  sentence: string
  translation: string
}

/** 字典词义 */
export interface DictionaryMeaning {
  part_of_speech: string
  /** 目标语言释义（数组，按常用度排序） */
  translation: string[]
  /** 英文单语释义 */
  definition: string
  examples: DictionaryExample[]
}

/** 字典词族条目 */
export interface DictionaryWordFamily {
  word: string
  part_of_speech: string
  meaning: string
  example?: DictionaryExample | null
}

/** 字典查询响应 */
export interface DictionaryResponse {
  headword: string
  pronunciation: DictionaryPronunciation
  meanings: DictionaryMeaning[]
  word_family: DictionaryWordFamily[]
  etymology: string
  learner_tips: string[]
}

/** 句子解释功能开关 */
export interface SentenceExplainFeatures {
  word?: boolean
  grammar?: boolean
  translation?: boolean
}

/** 句子解释请求 */
export interface SentenceExplainRequest {
  /** 要解释的句子（≤ 500 字符） */
  sentence: string
  /** 目标语言，缺省 Chinese */
  target_lang?: string
  /** 源语言，缺省让 AI 自动识别 */
  source_lang?: string
  /** 启用的解释项；缺省全部开启 */
  features?: SentenceExplainFeatures
}

/** 逐词拆解 */
export interface WordBreakdown {
  word: string
  lemma: string
  pos: string
  meaning: string
  note?: string
}

/** 语法点 */
export interface GrammarPoint {
  pattern: string
  description: string
  key_phrases: string[]
}

/** 句子解释响应 */
export interface SentenceExplainResponse {
  original: string
  translation: string
  words: WordBreakdown[]
  grammar: GrammarPoint | null
  notes: string
}

/** 词典数据源 id 联合类型（v0.9.2 起扩展网页词典：youdao/cambridge/oxford/longman/merriamWebster/collins/wiktionary） */
export type DictionarySourceId =
  | 'ai'
  | 'local'
  | 'builtin'
  | 'youdao'
  | 'cambridge'
  | 'oxford'
  | 'longman'
  | 'merriamWebster'
  | 'collins'
  | 'wiktionary'

/** 词典数据源描述（用于词典设置页） */
export interface DictionarySourceMeta {
  /** 源 id（持久化 key） */
  id: DictionarySourceId
  /** 显示名 */
  label: string
  /** 图标 emoji */
  emoji: string
  /** 品牌强调色（设置页卡片头像背景） */
  color?: string
  /** 描述 */
  description: string
  /** 是否需要联网 */
  requiresNetwork: boolean
  /** 是否可被用户禁用（true=可禁用 / false=始终启用） */
  canBeDisabled: boolean
  /** 状态文案（如 '已配置' / '未启用'） */
  statusText: string
  /** 状态色调 */
  statusKind: 'success' | 'warning' | 'default'
  /** 是否为网页词典（点击即跳转新标签页，无结构化内容） */
  isWeb?: boolean
}

// ============================================================================
// v0.9.1 本地词典（用户上传 CSV）
// ============================================================================

/** 本地词典条目（v0.9.1） */
export interface LocalDictionary {
  id: number
  name: string
  description: string
  file_name: string
  size_bytes: number
  entry_count: number
  source_lang: string
  target_lang: string
  created_at: string
  updated_at: string
}

/** 本地词典列表响应 */
export interface LocalDictListResponse {
  dictionaries: LocalDictionary[]
}

/** 本地词典系统状态 */
export interface LocalDictStatus {
  available: boolean
  dict_count: number
  entry_count: number
  max_bytes: number
  max_name_len: number
}

/** 本地词典上传结果 */
export interface LocalDictUploadResult {
  id: number
  name: string
  entry_count: number
  skipped: number
  total_lines: number
  header: string[]
}

/** 本地词典查词请求 */
export interface LocalDictLookupRequest {
  word: string
  sentence?: string
  dict_id?: number
}

/** 本地词典查词单条命中 */
export interface LocalDictLookupEntry {
  dict_id: number
  dict_name: string
  /** 实际命中的词形（可能是 fallback 后的原形） */
  word: string
  /** 用户传入的原词 */
  original: string
  phonetic: string
  translation: string
  /** "exact" 精确匹配 / "lemma:study" 词形回退 */
  matched_by: string
}

/** 本地词典查词响应 */
export interface LocalDictLookupResponse {
  word: string
  found: boolean
  entries: LocalDictLookupEntry[]
}

// ============================================================================
// v1.1.0 内置词典 ECDICT（GPLv3，~77 万词条；与 LocalDict 独立）
// ============================================================================

/** 内置词典系统状态 */
export interface BuiltinDictStatus {
  /** 是否已成功导入（词条数 > 0） */
  available: boolean
  /** 已导入的词条数 */
  entry_count: number
  /** CSV 文件绝对路径（用于诊断） */
  csv_path: string
  /** CSV 文件是否存在（v1.1.0 起） */
  csv_exists: boolean
  /** 词库名称/版本（来自 CSV 文件名 / 头部注释） */
  source: string
}

/** 内置词典查词命中条目 */
export interface BuiltinDictEntry {
  word: string
  phonetic: string
  pos: string
  definition: string
  translation: string
  matched_by: 'exact' | string
}

/** 内置词典查词响应 */
export interface BuiltinDictLookupResponse {
  word: string
  found: boolean
  entries: BuiltinDictEntry[]
}

/** 内置词典重导响应（v1.1.0） */
export interface BuiltinDictReloadResponse extends BuiltinDictStatus {
  /** 重导耗时（毫秒） */
  duration_ms: number
}

// ============================================================================
// v1.0.0 多阶段学习复习体系
// ============================================================================

/** 学习大阶段 id（与后端 learning.Stage* 常量一致） */
export type LearningStage =
  | 'first_learn'
  | 'review_1'
  | 'review_2'
  | 'review_3'
  | 'review_4'
  | 'review_5'
  | 'review_6'
  | 'review_7'
  | 'completed'

/** 学习子步骤 id（与后端 learning.SubStage* 常量一致） */
export type LearningSubStage =
  | 'intensive_listen'   // 逐句精听（首次学习入口）
  | 'shadowing'          // 难句跟读
  | 'blind_listen'       // 全文盲听
  | 'retell'             // 段落复述
  | 'review_difficult'   // 复习-难句补练
  | 'review_blind'       // 复习-盲听

/** 学习进度响应（GET /media/:id/learning-progress） */
export interface LearningProgressResponse {
  id: number
  user_id: number
  media_id: number
  current_stage: LearningStage
  current_sub_stage: LearningSubStage | ''
  first_learn_completed_at: string | null
  last_stage_completed_at: string | null
  current_stage_started_at: string | null
  total_study_duration_ms: number
  blind_listen_pass_count: number
  intensive_listen_pass_count: number
  shadowing_pass_count: number
  retell_pass_count: number
  is_paused: boolean
  created_at: string
  updated_at: string
  // 派生字段（后端 buildProgressResponse 注入）
  stage_label: string
  stage_emoji: string
  sub_stage_label: string
  stage_plan: LearningSubStage[]
  stage_index: number
  stage_sub_index: number
  is_entry_sub_stage: boolean
  next_review_at: string | null
  interval_hours: number
  is_review_ready: boolean
  is_completed: boolean
  total_sub_stages: number
  completed_sub_stages: number
}

/** 子步骤完成记录 */
export interface SubStageCompletion {
  id: number
  user_id: number
  media_id: number
  stage: LearningStage
  sub_stage: LearningSubStage
  study_duration_ms: number
  completed_at: string
}

/** 难句标记 */
export interface DifficultSentence {
  id: number
  user_id: number
  media_id: number
  sentence_index: number
  marked_at: string
}

/** 难句列表响应 */
export interface DifficultSentencesResponse {
  items: DifficultSentence[]
  count: number
}

/** 标记/取消标记难句请求 */
export interface MarkDifficultRequest {
  sentence_index: number
  marked: boolean
}

/** 复习队列项 */
export interface ReviewQueueItem {
  media_id: number
  media_name: string
  media_type: 'video' | 'audio'
  media_album: string | null
  media_sub_album: string | null
  media_cover_path: string | null
  current_stage: LearningStage
  stage_label: string
  stage_emoji: string
  current_sub_stage: LearningSubStage
  sub_stage_label: string
  last_completed_at: string | null
  next_review_at: string
  is_overdue: boolean
  is_ready: boolean
  hours_until_ready: number
}

/** 复习队列响应 */
export interface ReviewQueueResponse {
  items: ReviewQueueItem[]
  count: number
}

/** 学习统计响应 */
export interface LearningStats {
  first_learning: number
  reviewing_by_stage: Record<string, number>
  total_reviewing: number
  completed: number
  paused: number
  total: number
}

/** 完成本步请求 body */
export interface AdvanceLearningRequest {
  /** 本次学习耗时（毫秒），可选 */
  study_duration_ms?: number
}

/** 推进响应（含进阶标识） */
export interface AdvanceLearningResponse {
  progress: LearningProgressResponse
  stage_advanced: boolean
}
