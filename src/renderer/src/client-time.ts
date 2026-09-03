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
