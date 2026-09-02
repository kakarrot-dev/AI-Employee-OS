import { describe, expect, it } from 'vitest'
import { DEFAULT_SUPERVISOR_CONFIG, normalizeSupervisorConfig, validateSupervisorConfig } from './supervisor-contract'

describe('supervisor configuration contract', () => {
  it('accepts and normalizes the supported configuration', () => {
    const input = { ...DEFAULT_SUPERVISOR_CONFIG, name: '  总管助手  ', memoryScopes: ['global' as const] }
    expect(validateSupervisorConfig(input)).toEqual([])
    expect(normalizeSupervisorConfig(input).name).toBe('总管助手')
  })

  it.each([
    [{ ...DEFAULT_SUPERVISOR_CONFIG, name: '总' }, 'invalid_supervisor_name'],
    [{ ...DEFAULT_SUPERVISOR_CONFIG, systemPrompt: '太短' }, 'invalid_supervisor_system_prompt'],
    [{ ...DEFAULT_SUPERVISOR_CONFIG, modelId: 'invented-model' }, 'supervisor_model_not_allowed'],
    [{ ...DEFAULT_SUPERVISOR_CONFIG, memoryScopes: ['employee'] }, 'invalid_supervisor_memory_scopes']
  ])('rejects invalid settings', (input, code) => {
    expect(validateSupervisorConfig(input)[0]?.code).toBe(code)
  })
})
