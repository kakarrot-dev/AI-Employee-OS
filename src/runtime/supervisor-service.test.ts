import { describe, expect, it } from 'vitest'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { SupervisorService } from './supervisor-service'

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
})
