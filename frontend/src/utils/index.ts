// 格式化秒为 HH:MM:SS 或 MM:SS
export function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '00:00'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }
  return `${pad(m)}:${pad(s)}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// 格式化文件大小
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// 格式化时间为相对描述
export function formatRelative(iso: string): string {
  if (!iso) return '-'
  const date = new Date(iso)
  const now = Date.now()
  const diff = now - date.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return date.toLocaleDateString('zh-CN')
}
