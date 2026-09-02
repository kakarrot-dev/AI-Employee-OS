import { describe, expect, it } from 'vitest'
import { employeeStatusBreathing, employeeStatusLabel, employeeStatusTone, isActiveEmployeeStatus, normalizeEmployeeStatus } from './employee-status'

describe('employee status presentation', () => {
  it('normalizes the removed pending_changes status from an older Runtime to active', () => {
    expect(normalizeEmployeeStatus('pending_changes')).toBe('active')
    expect(employeeStatusLabel('pending_changes')).toBe('可工作')
    expect(employeeStatusTone('pending_changes')).toBe('success')
    expect(employeeStatusBreathing('pending_changes')).toBe(true)
    expect(isActiveEmployeeStatus('pending_changes')).toBe(true)
  })

  it('never renders an empty label for an unknown Runtime status', () => {
    expect(normalizeEmployeeStatus('future_status')).toBe('unknown')
    expect(employeeStatusLabel('future_status')).toBe('状态未知')
    expect(employeeStatusTone('future_status')).toBe('waiting')
  })
})
