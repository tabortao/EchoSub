import { create } from 'zustand'
import { scanApi } from '@/api'

/**
 * 全局扫描状态：
 * - `scanning`：正在扫描时 true，用于 Header 按钮显示 spinner
 * - `lastTriggeredAt`：最近一次触发扫描的时间戳（毫秒），用于通知首页等组件刷新
 *
 * 只有「触发扫描」会改变这两个状态。扫描结束后 via 轮询扫描状态接口置回 false。
 */
interface ScanState {
  scanning: boolean
  lastTriggeredAt: number
  trigger: () => Promise<void>
}

export const useScanStore = create<ScanState>((set) => ({
  scanning: false,
  lastTriggeredAt: 0,
  trigger: async () => {
    try {
      await scanApi.trigger()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('触发扫描失败:', msg)
      return
    }

    // 触发成功，更新时间戳（订阅者据此刷新）
    set({ lastTriggeredAt: Date.now() })

    // 轮询等待扫描结束
    set({ scanning: true })
    const poll = async () => {
      try {
        for (let i = 0; i < 60; i++) {
          // 最多等 60 秒
          const r = await scanApi.status()
          if (!r.data.data.scanning) {
            set({ scanning: false })
            return
          }
          await new Promise((res) => setTimeout(res, 1000))
        }
      } catch {
        // 轮询失败也置回 false，避免 spinner 永远转
      } finally {
        set({ scanning: false })
      }
    }
    void poll()
  },
}))
