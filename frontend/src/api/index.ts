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
  DictionaryRequest,
  DictionaryResponse,
  SentenceExplainRequest,
  SentenceExplainResponse,
  LocalDictListResponse,
  LocalDictStatus,
  LocalDictUploadResult,
  LocalDictLookupRequest,
  LocalDictLookupResponse,
  LearningProgressResponse,
  AdvanceLearningRequest,
  AdvanceLearningResponse,
  DifficultSentencesResponse,
  MarkDifficultRequest,
  BuiltinDictStatus,
  BuiltinDictLookupResponse,
  BuiltinDictReloadResponse,
  WebDictLookupResponse,
  WordFavorite,
  WordFavoriteListResponse,
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
  /**
   * 字典查词（v0.9.0 起）：
   * 把单词发给后端，AI 返回结构化 DictionaryResponse（音标/词义/例句/词族/词源）
   */
  dictionary: (payload: DictionaryRequest) =>
    client.post<ApiResponse<DictionaryResponse>>('/ai/dictionary', payload),
  /**
   * 句子解释（v0.9.0 起）：
   * 对单条句子生成结构化讲解（翻译/逐词拆解/语法点/学习提示）
   */
  sentenceExplain: (payload: SentenceExplainRequest) =>
    client.post<ApiResponse<SentenceExplainResponse>>('/ai/sentence-explain', payload),
}

// ===== 本地词典（v0.9.1 起）=====
// 用户上传 CSV → 后端解析入库；查词走 SQL（精确 + 简单词形 fallback）
export const localDictApi = {
  /**
   * 列出已导入的本地词典（按创建时间倒序）
   */
  list: () => client.get<ApiResponse<LocalDictListResponse>>('/dictionary/local'),
  /**
   * 本地词典系统状态：总词典数、词条数、可用性、上传体积上限
   */
  status: () => client.get<ApiResponse<LocalDictStatus>>('/dictionary/local/status'),
  /**
   * 上传并导入 CSV 词典（multipart/form-data）
   * - file: 必填，CSV / TSV / TXT
   * - name: 必填，词典名
   * - description / source_lang / target_lang: 可选
   */
  upload: (form: FormData) =>
    client.post<ApiResponse<LocalDictUploadResult>>('/dictionary/local/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  /**
   * 删除本地词典（级联删除其下词条）
   */
  remove: (id: number) =>
    client.delete<ApiResponse<{ id: number; deleted: true }>>(`/dictionary/local/${id}`),
  /**
   * 查词：精确匹配 + 简单词形 fallback
   * @param payload.word 待查单词
   * @param payload.sentence 可选上下文（当前版本未使用，预留）
   * @param payload.dict_id 可选，限定只查某本词典；缺省 = 全部
   */
  lookup: (payload: LocalDictLookupRequest) =>
    client.post<ApiResponse<LocalDictLookupResponse>>('/dictionary/local/lookup', payload),
}

// ===== 内置词典（v1.1.0 起，GPLv3 ECDict 词库）=====
// 后端首次启动时自动从 backend/data/dict/ecdict.csv 导入到 built_in_dict 表
// 约 77 万词条，覆盖英汉常用词；与 LocalDict 完全独立，可选作为默认源
// 类型定义统一在 @/types，本文件仅导出 API 方法
export const builtinDictApi = {
  status: () => client.get<ApiResponse<BuiltinDictStatus>>('/dictionary/builtin/status'),
  lookup: (word: string) =>
    client.get<ApiResponse<BuiltinDictLookupResponse>>('/dictionary/builtin/lookup', {
      params: { word },
    }),
  /**
   * 触发重新导入（清空 built_in_dict 表后再次读取 CSV 导入）
   * 通常用于版本升级后刷新词库
   */
  reload: () => client.post<ApiResponse<BuiltinDictReloadResponse>>('/dictionary/builtin/reload'),
}

// ===== 网页词典抓取（v1.3.0 起）=====
// 让 Cambridge / Oxford / Longman / Wiktionary / 有道 等 7 个网页词典也能在弹窗中渲染结果
// 后端负责抓 HTML + 清洗（XSS 防护 + 去噪 + 链接绝对化）
export const webDictApi = {
  /**
   * 抓取并清洗目标 URL 的 HTML
   * @param source 来源 id：youdao / cambridge / oxford / longman / merriamWebster / collins / wiktionary
   * @param word 待查单词
   * @returns WebDictLookupResponse（含 html / blocked / error 等）
   */
  lookup: (source: string, word: string) =>
    client.get<ApiResponse<WebDictLookupResponse>>('/dictionary/web/lookup', {
      params: { source, word },
    }),
}

// ===== 单词收藏（v1.3.0 起）=====
// 弹窗内点击 ⭐ 收藏当前查的单词；侧边栏「收藏」页统一展示
export const wordFavoriteApi = {
  /**
   * 列出当前用户收藏的单词（支持模糊搜索 + 分页）
   * @param opts.q 模糊匹配词
   * @param opts.page 页码（从 1 开始）
   * @param opts.size 每页数量（默认 50，最大 200）
   */
  list: (opts: { q?: string; page?: number; size?: number } = {}) =>
    client.get<ApiResponse<WordFavoriteListResponse>>('/word-favorites', { params: opts }),
  /**
   * 收藏一个单词（幂等：同 user+word 重复 POST 视为再次收藏，hit_count++）
   * @param payload.word 待收藏的单词
   * @param payload.source 收藏来源（ai / local / builtin / youdao / ...）
   * @param payload.note 可选笔记
   */
  create: (payload: { word: string; source?: string; note?: string }) =>
    client.post<ApiResponse<WordFavorite>>('/word-favorites', payload),
  /** 更新某条收藏的笔记 */
  updateNote: (id: number, note: string) =>
    client.patch<ApiResponse<WordFavorite>>(`/word-favorites/${id}`, { note }),
  /** 删除一条收藏 */
  remove: (id: number) =>
    client.delete<ApiResponse<{ id: number; deleted: true }>>(`/word-favorites/${id}`),
  /**
   * 批量检查一组单词是否被收藏（用于 UI 高亮）
   * @param words 单词数组（内部用 , 连接）
   * @returns { favorited: { [word]: id } } 未收藏的单词不在 map 中
   */
  check: (words: string[]) =>
    client.get<ApiResponse<{ favorited: Record<string, number> }>>(
      '/word-favorites/check',
      { params: { words: words.join(',') } },
    ),
}

// ===== 多阶段学习复习体系（v1.0.0 起）=====
// 与后端 router.go 中 /media/:id/learning-progress 路由族一一对应
export const learningApi = {
  /**
   * 获取某个媒体的学习进度（首次访问时由后端按需创建一条 default 记录）
   * @param mediaId 媒体 id
   * @returns LearningProgressResponse 含 stage_emoji / sub_stage_label / 复习就绪时间等派生字段
   */
  getProgress: (mediaId: number) =>
    client.get<ApiResponse<LearningProgressResponse>>(`/media/${mediaId}/learning-progress`),

  /**
   * 推进学习进度：完成当前子步骤，写入 SubStageCompletion，并按学习计划切换到下一步/下一阶段
   * @param mediaId 媒体 id
   * @param payload.study_duration_ms 本次学习耗时（毫秒），可选
   * @returns AdvanceLearningResponse，含最新进度和「是否跨阶段」标识
   */
  advance: (mediaId: number, payload: AdvanceLearningRequest = {}) =>
    client.post<ApiResponse<AdvanceLearningResponse>>(
      `/media/${mediaId}/learning-progress/advance`,
      payload,
    ),

  /**
   * 跳过当前子步骤（不计入学习时长，不影响累计 pass_count）
   * 用于「今天不想做这一步」的快速流转
   */
  skip: (mediaId: number) =>
    client.post<ApiResponse<AdvanceLearningResponse>>(
      `/media/${mediaId}/learning-progress/skip`,
      {},
    ),

  /** 暂停学习：保持当前 stage/sub_stage，但冻结推进；首页可继续操作其他媒体 */
  pause: (mediaId: number) =>
    client.post<ApiResponse<{ progress: LearningProgressResponse }>>(
      `/media/${mediaId}/learning-progress/pause`,
      {},
    ),

  /** 恢复被暂停的学习（仅在 is_paused=true 时生效） */
  resume: (mediaId: number) =>
    client.post<ApiResponse<{ progress: LearningProgressResponse }>>(
      `/media/${mediaId}/learning-progress/resume`,
      {},
    ),

  /**
   * 列出某媒体下当前用户标记的难句（按 sentence_index 升序）
   * @param mediaId 媒体 id
   */
  listDifficult: (mediaId: number) =>
    client.get<ApiResponse<DifficultSentencesResponse>>(
      `/media/${mediaId}/difficult-sentences`,
    ),

  /**
   * 标记/取消难句（幂等）
   * @param mediaId 媒体 id
   * @param payload.sentence_index 句子索引
   * @param payload.marked true=标记 / false=取消
   */
  markDifficult: (mediaId: number, payload: MarkDifficultRequest) =>
    client.post<ApiResponse<{ marked: boolean; sentence_index: number }>>(
      `/media/${mediaId}/difficult-sentences`,
      payload,
    ),
}
