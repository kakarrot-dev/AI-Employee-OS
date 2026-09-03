import { describe, expect, it } from 'vitest'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { SupervisorService } from './supervisor-service'
import { LEGACY_SUPERVISOR_PROMPT, PROFESSIONAL_SUPERVISOR_PROMPT } from '../shared/supervisor-contract'

describe('SupervisorService', () => {
  it('seeds, validates and persists the single Runtime-owned configuration', () => {
    const store = new RuntimeStore(':memory:')
    const service = new SupervisorService(new RuntimeKernel(store))
    expect(service.get()).toMatchObject({ id: 'supervisor.local', name: '总管', modelId: 'deepseek-v4-pro', memoryScopes: ['global'] })
    const updated = service.update({ name: '任务总管', systemPrompt: '使用简体中文，依据证据分配并验收工作。', modelId: 'claude-sonnet-4.6', memoryScopes: [] })
    expect(service.get()).toEqual(updated)
    expect(store.eventsAfter(0).map((event) => event.eventType)).toEqual(['supervisor_configuration.seeded', 'supervisor_configuration.updated'])
    expect(() => service.update({ ...updated, name: '总' })).toThrow('invalid_supervisor_name')
    store.close()
  })

  it('upgrades only the legacy default prompt and preserves supervisor identity', () => {
    const store = new RuntimeStore(':memory:')
    const kernel = new RuntimeKernel(store)
    kernel.save({ entityType: 'SupervisorConfiguration', entity: { schemaVersion: 1, id: 'supervisor.local', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', name: '悟空', systemPrompt: LEGACY_SUPERVISOR_PROMPT, modelId: 'deepseek-v4-pro', memoryScopes: ['global'] }, immutable: false }, 'legacy.seeded', {})
    const upgraded = new SupervisorService(kernel).seed()
    expect(upgraded).toMatchObject({ name: '悟空', systemPrompt: PROFESSIONAL_SUPERVISOR_PROMPT })
    expect(store.eventsAfter(0).at(-1)?.eventType).toBe('supervisor_configuration.prompt_upgraded')
    store.close()
  })
})
