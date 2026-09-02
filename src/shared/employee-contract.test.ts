import { describe, expect, it } from 'vitest'
import { EMPLOYEE_FIELD_LIMITS, normalizeEmployeeDraft, validateEmployeeDraft, type EmployeeDraftInput } from './employee-contract'

const validDraft: EmployeeDraftInput = {
  name: '网络情报员',
  role: '公开信息检索与核验',
  description: '负责在授权范围内检索公开信息并保留可追溯来源。',
  systemPrompt: '只使用任务明确授权的来源，标注冲突、时间与信息缺口。',
  modelId: 'deepseek-v4-pro',
  capabilityVersionIds: ['capability.network-intelligence.v1'],
  memoryScopes: ['employee']
}

describe('employee draft contract', () => {
  it('accepts a complete employee and normalizes surrounding whitespace', () => {
    expect(validateEmployeeDraft(validDraft)).toEqual([])
    expect(normalizeEmployeeDraft({ ...validDraft, name: '  网络情报员  ', role: '  公开信息检索与核验  ' })).toMatchObject({ name: '网络情报员', role: '公开信息检索与核验' })
  })

  it.each([
    ['name', '单', 'invalid_employee_name'],
    ['name', '员工\n名称', 'invalid_employee_name'],
    ['role', '单', 'invalid_employee_role'],
    ['description', '说明太短', 'invalid_employee_description'],
    ['systemPrompt', '提示词太短', 'invalid_system_prompt']
  ] as const)('rejects invalid %s values', (field, value, code) => {
    expect(validateEmployeeDraft({ ...validDraft, [field]: value })).toContainEqual(expect.objectContaining({ field, code }))
  })

  it('uses Unicode characters for length limits and rejects oversized values', () => {
    const exactName = '员'.repeat(EMPLOYEE_FIELD_LIMITS.name.max)
    expect(validateEmployeeDraft({ ...validDraft, name: exactName }).find((issue) => issue.field === 'name')).toBeUndefined()
    expect(validateEmployeeDraft({ ...validDraft, name: `${exactName}员` })).toContainEqual(expect.objectContaining({ code: 'invalid_employee_name' }))
  })

  it('validates avatar format and decoded byte size', () => {
    expect(validateEmployeeDraft({ ...validDraft, avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toContainEqual(expect.objectContaining({ code: 'invalid_employee_avatar' }))
    const oversized = 'A'.repeat(Math.ceil((EMPLOYEE_FIELD_LIMITS.avatarBytes + 1) / 3) * 4)
    expect(validateEmployeeDraft({ ...validDraft, avatarDataUrl: `data:image/png;base64,${oversized}` })).toContainEqual(expect.objectContaining({ code: 'invalid_employee_avatar', message: '头像大小不能超过 2 MB' }))
  })
})
