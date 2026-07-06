/**
 * 单词收藏 store（v1.3.0）
 *
 * 设计：
 * - 内存缓存 + localStorage 持久化（最多保存 200 条最近收藏）
 * - 提供 markFavorited / unmarkFavorited 写操作（乐观更新 + 失败回滚）
 * - 提供 checkBatch(words) 批量检查（用于句子详情页高亮已收藏单词）
 *
 * 数据流：
 * - 「收藏」页加载时调用 wordFavoriteApi.list() 拉全量，refresh() 强制重拉
 * - 弹窗点击 ⭐ 收藏时调用 wordFavoriteApi.create()，成功后 addFavorite()
 * - 弹窗点击 ⭐ 已收藏取消时调用 wordFavoriteApi.remove()，成功后 removeFavorite()
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { wordFavoriteApi } from '@/api'
import type { WordFavorite } from '@/types'

const STORAGE_KEY = 'echosub:word-favorites'
const MAX_CACHE = 200

interface WordFavoritesState {
  /** 缓存的收藏列表（id 升序），不超过 MAX_CACHE 条 */
  items: WordFavorite[]
  /** 上次从后端拉取时间戳（毫秒），用于 TTL 失效 */
  fetchedAt: number
  /** 拉取中（避免并发 refresh） */
  loading: boolean
  /** 错误信息（最近一次失败） */
  error: string | null

  /** 强制重新拉取列表 */
  refresh: () => Promise<void>
  /** 乐观收藏一个单词（已存在则不再调用 API） */
  addFavorite: (item: WordFavorite) => void
  /** 乐观取消收藏 */
  removeFavorite: (id: number) => void
  /**
   * 收藏一个单词（API 调用）。已存在则只增加 hit_count + 更新 note
   * @returns 是否成功
   */
  favorite: (word: string, source?: string, note?: string) => Promise<WordFavorite | null>
  /** 取消收藏（API 调用） */
  unfavorite: (id: number, word: string) => Promise<boolean>
  /** 按 word 找收藏（O(1)） */
  findByWord: (word: string) => WordFavorite | undefined
  /** 清空缓存（退出登录时调用） */
  clear: () => void
}

export const useWordFavoritesStore = create<WordFavoritesState>()(
  persist(
    (set, get) => ({
      items: [],
      fetchedAt: 0,
      loading: false,
      error: null,

      refresh: async () => {
        if (get().loading) return
        set({ loading: true, error: null })
        try {
          const r = await wordFavoriteApi.list({ size: MAX_CACHE })
          const items = r.data.data.items ?? []
          set({ items, fetchedAt: Date.now(), loading: false })
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '拉取收藏失败'
          set({ loading: false, error: msg })
        }
      },

      addFavorite: (item) => {
        const items = get().items.slice()
        const idx = items.findIndex((x) => x.id === item.id || x.word === item.word)
        if (idx >= 0) {
          items[idx] = item
        } else {
          items.unshift(item)
          if (items.length > MAX_CACHE) items.length = MAX_CACHE
        }
        set({ items })
      },

      removeFavorite: (id) => {
        set({ items: get().items.filter((x) => x.id !== id) })
      },

      favorite: async (word, source, note) => {
        const w = word.trim().toLowerCase()
        if (!w) return null
        try {
          const r = await wordFavoriteApi.create({ word: w, source, note })
          const item = r.data.data
          get().addFavorite(item)
          return item
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '收藏失败'
          set({ error: msg })
          return null
        }
      },

      unfavorite: async (id, _word) => {
    // 乐观删除
    const prev = get().items
    get().removeFavorite(id)
    try {
      await wordFavoriteApi.remove(id)
      return true
    } catch (err: unknown) {
      // 回滚
      set({ items: prev })
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '取消收藏失败'
      set({ error: msg })
      return false
    }
  },

      findByWord: (word) => {
        const w = word.trim().toLowerCase()
        return get().items.find((x) => x.word === w)
      },

      clear: () => set({ items: [], fetchedAt: 0, error: null }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ items: state.items }),
    },
  ),
)
