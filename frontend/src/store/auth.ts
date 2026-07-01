import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
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
