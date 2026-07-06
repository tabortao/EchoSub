import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LocalDictionary } from '@/types'

/** v0.9.0 字典设置（本地持久化，localStorage） */
interface DictionaryState {
  /** 默认词典源 id */
  defaultSourceId: 'ai' | 'local'
  /** 被禁用的源 id 集合（仅含 canBeDisabled=true 的源） */
  disabledIds: Array<'ai' | 'local'>

  /** 已上传的本地词典列表（v0.9.1；启动时由前端从后端拉取填充） */
  localDicts: LocalDictionary[]
  /** 本地词典最后刷新时间戳（用于 TTL 失效） */
  localDictsFetchedAt: number
  /** 查词时是否优先使用本地词典命中（命中即不再请求 AI） */
  preferLocalHit: boolean

  setDefault: (id: 'ai' | 'local') => void
  setDisabled: (id: 'ai' | 'local', disabled: boolean) => void

  /** 替换本地词典列表（一般由 `localDictApi.list()` 的结果回填） */
  setLocalDicts: (dicts: LocalDictionary[]) => void
  /** 追加一本刚上传成功的词典（避免重新拉取全表） */
  addLocalDict: (dict: LocalDictionary) => void
  /** 移除已删除的词典 */
  removeLocalDict: (id: number) => void
  setPreferLocalHit: (val: boolean) => void
}

const STORAGE_KEY = 'echosub:dictionary-settings'

export const useDictionaryStore = create<DictionaryState>()(
  persist(
    (set, get) => ({
      defaultSourceId: 'ai',
      disabledIds: [],
      localDicts: [],
      localDictsFetchedAt: 0,
      preferLocalHit: true, // 命中本地后直接返回，不调用 AI
      setDefault: (id) => set({ defaultSourceId: id }),
      setDisabled: (id, disabled) => {
        const cur = new Set(get().disabledIds)
        if (disabled) {
          cur.add(id)
          // 禁用当前默认源时回退到 AI（兜底）
          if (get().defaultSourceId === id) {
            set({ disabledIds: Array.from(cur), defaultSourceId: 'ai' })
            return
          }
        } else {
          cur.delete(id)
        }
        set({ disabledIds: Array.from(cur) })
      },
      setLocalDicts: (dicts) => set({ localDicts: dicts, localDictsFetchedAt: Date.now() }),
      addLocalDict: (dict) => set({ localDicts: [dict, ...get().localDicts] }),
      removeLocalDict: (id) => set({ localDicts: get().localDicts.filter((d) => d.id !== id) }),
      setPreferLocalHit: (val) => set({ preferLocalHit: val }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      // v0.9.1：新增 localDicts / preferLocalHit；旧版无此字段，partialize 确保新字段不强制覆盖
      partialize: (state) => ({
        defaultSourceId: state.defaultSourceId,
        disabledIds: state.disabledIds,
        preferLocalHit: state.preferLocalHit,
      }),
      // localDicts 故意不持久化（每次进设置页时主动从后端拉取最新列表）
    },
  ),
)
