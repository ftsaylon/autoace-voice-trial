export const relativeTime = (timestamp: number, now = Date.now()): string => {
  const delta = Math.max(0, now - timestamp)
  const seconds = Math.round(delta / 1000)
  if (seconds < 45) {
    return "just now"
  }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export const formatDuration = (start?: number, end?: number, now = Date.now()): string => {
  if (!start) {
    return "—"
  }
  const ms = Math.max(0, (end ?? now) - start)
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds}s`
}

export const formatPercent = (value: number): string => {
  return `${Math.round(value * 100)}%`
}

export const formatF1 = (value: number): string => {
  return value.toFixed(2)
}
