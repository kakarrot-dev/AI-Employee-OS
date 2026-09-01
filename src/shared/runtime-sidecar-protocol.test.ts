import { describe, expect, it } from 'vitest'
import { parseRuntimeCommand } from './runtime-sidecar-protocol'

describe('runtime sidecar protocol', () => {
  it('rejects unknown versions, commands and payloads', () => {
    expect(() => parseRuntimeCommand({ schemaVersion: 2, requestId: '1', type: 'health', payload: {} })).toThrow('unsupported_schema_version')
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'shell.exec', payload: {} })).toThrow('unknown_command')
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'health', payload: { extra: true } })).toThrow('unexpected_payload')
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'events.after', payload: { sequence: -1, limit: 10 } })).toThrow('invalid_event_sequence')
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'memory.search', payload: { query: 'x', allowedScopes: [{ type: 'task', id: '' }] } })).toThrow('invalid_memory_search')
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'memory.list', payload: { scopeType: 'organization' } })).toThrow('invalid_memory_filters')
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'memory.update', payload: { id: 'm1', changes: { secret: 'x' } } })).toThrow('invalid_memory_update')
  })

  it('accepts a bounded event cursor request', () => {
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: 'shutdown', type: 'shutdown.prepare', payload: {} })).toMatchObject({ type: 'shutdown.prepare' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'events.after', payload: { sequence: 0, limit: 100 } })).toMatchObject({ type: 'events.after' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '2', type: 'memory.search', payload: { query: '发布', allowedScopes: [{ type: 'employee', id: 'employee-1' }], categories: ['rule'], limit: 5, tokenBudget: 768 } })).toMatchObject({ type: 'memory.search' })
  })
})
