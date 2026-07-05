/**
 * 设备尺寸与断点判断 hook（v0.6.0 起）。
 *
 * 替代直接在组件里写 `useBreakpoint()` 做 `screens.lg` 这种判断。
 * 提供更细分的语义：
 * - isPhone: 视口宽度 < 768（手机竖屏 / 横屏）
 * - isTablet: 768 ≤ 视口宽度 < 1280（iPad mini / iPad Pro 11）
 * - isDesktop: 视口宽度 ≥ 1280（桌面 / iPad Pro 12.9 横屏）
 * - isMobile: phone + tablet（任何触屏窄屏）
 * - isLandscape: 视口宽度 > 视口高度
 * - isPortrait: 视口宽度 ≤ 视口高度
 * - dpr: 设备像素比（用于高清资源 / 触控精度）
 *
 * 使用：
 *   const { isPhone, isTablet, isLandscape } = useDeviceSize()
 *   if (isPhone) return <MobileLayout />
 *
 * 监听 window resize + orientationchange，组件卸载时自动清理。
 */
import { useEffect, useState } from 'react'

export interface DeviceSize {
  width: number
  height: number
  /** 视口宽度 < 768 */
  isPhone: boolean
  /** 768 ≤ 视口宽度 < 1280 */
  isTablet: boolean
  /** 视口宽度 ≥ 1280 */
  isDesktop: boolean
  /** phone + tablet */
  isMobile: boolean
  /** 视口宽度 > 视口高度 */
  isLandscape: boolean
  /** 视口宽度 ≤ 视口高度 */
  isPortrait: boolean
  /** 设备像素比 (1/2/3) */
  dpr: number
}

const PHONE_MAX = 768
const TABLET_MAX = 1280

function compute(): DeviceSize {
  const w = typeof window === 'undefined' ? 1280 : window.innerWidth
  const h = typeof window === 'undefined' ? 800 : window.innerHeight
  const dpr = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1)
  return {
    width: w,
    height: h,
    isPhone: w < PHONE_MAX,
    isTablet: w >= PHONE_MAX && w < TABLET_MAX,
    isDesktop: w >= TABLET_MAX,
    isMobile: w < TABLET_MAX,
    isLandscape: w > h,
    isPortrait: w <= h,
    dpr,
  }
}

export function useDeviceSize(): DeviceSize {
  const [size, setSize] = useState<DeviceSize>(compute)

  useEffect(() => {
    let raf: number | null = null
    const update = () => {
      if (raf != null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setSize(compute()))
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    // 初始化时主动取一次（兼容 SSR / 异步 hydrate）
    update()
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [])

  return size
}
