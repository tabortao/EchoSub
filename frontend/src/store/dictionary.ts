import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** v0.9.0 字典设置（本地持久化，localStorage） */
interface DictionaryState {
  /** 默认词典源 id */
  defaultSourceId: 'ai' | 'local'
  /** 被禁用的源 id 集合（仅含 canBeDisabled=true 的源） */
  disabledIds: Array<'ai' | 'local'>

  setDefault: (id: 'ai' | 'local') => void
  setDisabled: (id: 'ai' | 'local', disabled: boolean) => void
}

const STORAGE_KEY = 'echosub:dictionary-settings'

export const useDictionaryStore = create<DictionaryState>()(
  persist(
    (set, get) => ({
      defaultSourceId: 'ai',
      disabledIds: [],
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
    }),
    {
      name: STORAGE_KEY,
      version: 1,
    },
  ),
)
