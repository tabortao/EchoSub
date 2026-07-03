import { create } from 'zustand'
import type { Settings } from '@/types'
import { settingsApi } from '@/api'

interface SettingsState extends Settings {
  loaded: boolean
  load: () => Promise<void>
  update: (data: Settings) => Promise<void>
}

const DEFAULTS: Settings = {
  loop_count: 3,
  sentence_repeat: 3,
  pause_seconds: 1.5,
  tts_voice: 'en-US-JennyNeural',
  tts_speed: 1.0,
  theme: 'default',
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const res = await settingsApi.get()
      const data = res.data.data
      set({ ...data, loaded: true })
    } catch {
      set({ ...DEFAULTS, loaded: true })
    }
  },
  update: async (data: Settings) => {
    await settingsApi.update(data)
    set({ ...data })
  },
}))
