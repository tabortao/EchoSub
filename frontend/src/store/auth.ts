import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  updateUser: (user: User) => void
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    localStorage.setItem('echosub_token', token)
    localStorage.setItem('echosub_user', JSON.stringify(user))
    set({ user, token })
  },
  // 更新用户信息（修改用户名/头像后调用），保留现有 token
  updateUser: (user) => {
    localStorage.setItem('echosub_user', JSON.stringify(user))
    set({ user })
  },
  logout: () => {
    localStorage.removeItem('echosub_token')
    localStorage.removeItem('echosub_user')
    set({ user: null, token: null })
  },
  hydrate: () => {
    const token = localStorage.getItem('echosub_token')
    const userStr = localStorage.getItem('echosub_user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User
        set({ user, token })
      } catch {
        localStorage.removeItem('echosub_token')
        localStorage.removeItem('echosub_user')
      }
    }
  },
}))

// 模块加载时同步恢复登录态，确保 ProtectedRoute 在首次渲染前就能读到 token，
// 避免刷新页面时被误判为未登录而跳转到 /login。
useAuthStore.getState().hydrate()
