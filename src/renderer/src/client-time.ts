export const UNKNOWN_CLIENT_TIME = '时间未知'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Client timestamp display contract:
 * - same local calendar day: HH:mm
 * - same local calendar year: MM-DD
 * - different local calendar year: YYYY-MM-DD
 */
export function formatClientTimestamp(value: string | number | Date, reference = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return UNKNOWN_CLIENT_TIME

  const sameYear = date.getFullYear() === reference.getFullYear()
  const sameDay = sameYear && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate()
  if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`

  const monthAndDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return sameYear ? monthAndDay : `${date.getFullYear()}-${monthAndDay}`
}

export function formatRunDuration(startedAt: string | undefined, completedAt: string | undefined, now = Date.now()): string {
  const start = Date.parse(startedAt ?? '')
  const end = completedAt ? Date.parse(completedAt) : now
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '未开始'
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}
