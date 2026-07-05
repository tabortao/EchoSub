import { create } from 'zustand'
import type { ColorMode, Settings } from '@/types'
import { settingsApi } from '@/api'

interface SettingsState extends Settings {
  loaded: boolean
  load: () => Promise<void>
  update: (data: Settings) => Promise<void>
  /**
   * 仅更新颜色模式（不发起后端请求）。
   * 适用于 auto 模式下系统主题切换、用户在设置面板即时切换的本地态。
   * 持久化由 App.tsx 监听 color_mode 变化后统一调 update() 完成。
   */
  setColorMode: (mode: ColorMode) => void
}

const DEFAULTS: Settings = {
  loop_count: 3,
  sentence_repeat: 3,
  pause_seconds: 1.5,
  tts_voice: 'en-US-JennyNeural',
  tts_speed: 1.0,
  theme: 'default',
  color_mode: 'auto',
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const res = await settingsApi.get()
      const data = res.data.data
      // 兜底：旧用户没有 color_mode 字段时取默认
      set({
        ...data,
        color_mode: (data.color_mode as ColorMode) || DEFAULTS.color_mode,
        loaded: true,
      })
    } catch {
      set({ ...DEFAULTS, loaded: true })
    }
  },
  update: async (data: Settings) => {
    await settingsApi.update(data)
    set({ ...data })
  },
  setColorMode: (mode: ColorMode) => {
    set({ color_mode: mode })
  },
}))
