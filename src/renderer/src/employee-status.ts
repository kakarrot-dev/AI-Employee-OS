import type { EmployeeUiStatus } from '../../shared/employee-contract'

const STATUS_LABELS: Record<EmployeeUiStatus, string> = {
  draft: '草稿',
  pending_test: '待测试',
  active: '可工作',
  disabled: '已停用',
  archived: '已归档'
}

const CURRENT_STATUSES = new Set<EmployeeUiStatus>(Object.keys(STATUS_LABELS) as EmployeeUiStatus[])

export function normalizeEmployeeStatus(status: unknown): EmployeeUiStatus | 'unknown' {
  if (status === 'pending_changes') return 'active'
  return typeof status === 'string' && CURRENT_STATUSES.has(status as EmployeeUiStatus) ? status as EmployeeUiStatus : 'unknown'
}

export function employeeStatusLabel(status: unknown): string {
  const normalized = normalizeEmployeeStatus(status)
  return normalized === 'unknown' ? '状态未知' : STATUS_LABELS[normalized]
}

export function employeeStatusTone(status: unknown): 'success' | 'waiting' | 'muted' {
  const normalized = normalizeEmployeeStatus(status)
  return normalized === 'active' ? 'success' : normalized === 'disabled' || normalized === 'archived' ? 'muted' : 'waiting'
}

export function employeeStatusBreathing(status: unknown): boolean {
  const normalized = normalizeEmployeeStatus(status)
  return normalized === 'active' || normalized === 'pending_test'
}

export function isActiveEmployeeStatus(status: unknown): boolean {
  return normalizeEmployeeStatus(status) === 'active'
}
