import { describe, expect, it } from 'vitest'
import { formatClientTimestamp, UNKNOWN_CLIENT_TIME } from './client-time'

describe('client timestamp display contract', () => {
  const reference = new Date(2026, 8, 3, 12, 0)

  it('shows HH:mm for the same local calendar day', () => {
    expect(formatClientTimestamp(new Date(2026, 8, 3, 9, 5), reference)).toBe('09:05')
  })

  it('shows MM-DD for another day in the same local calendar year', () => {
    expect(formatClientTimestamp(new Date(2026, 0, 7, 23, 59), reference)).toBe('01-07')
  })

  it('shows YYYY-MM-DD across local calendar years', () => {
    expect(formatClientTimestamp(new Date(2025, 11, 31, 23, 59), reference)).toBe('2025-12-31')
  })

  it('uses one stable fallback for invalid persisted values', () => {
    expect(formatClientTimestamp('not-a-timestamp', reference)).toBe(UNKNOWN_CLIENT_TIME)
  })
})
