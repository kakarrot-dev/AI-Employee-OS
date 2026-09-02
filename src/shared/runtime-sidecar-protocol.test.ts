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
    expect(() => parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'conversation.send', payload: { conversationId: 'c', messageId: 'm', text: '写文档', directories: ['relative'] } })).toThrow('invalid_conversation_directories')
  })

  it('accepts a bounded event cursor request', () => {
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: 'shutdown', type: 'shutdown.prepare', payload: {} })).toMatchObject({ type: 'shutdown.prepare' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '1', type: 'events.after', payload: { sequence: 0, limit: 100 } })).toMatchObject({ type: 'events.after' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '2', type: 'memory.search', payload: { query: '发布', allowedScopes: [{ type: 'employee', id: 'employee-1' }], categories: ['rule'], limit: 5, tokenBudget: 768 } })).toMatchObject({ type: 'memory.search' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '3', type: 'conversation.list', payload: {} })).toMatchObject({ type: 'conversation.list' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '4', type: 'conversation.create', payload: { conversationId: 'conversation-1' } })).toMatchObject({ type: 'conversation.create' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '5', type: 'conversation.archive', payload: { conversationId: 'conversation-1' } })).toMatchObject({ type: 'conversation.archive' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '6', type: 'conversation.send', payload: { conversationId: 'conversation-1', messageId: 'message-1', text: '写文档', directories: ['/tmp/reports'] } })).toMatchObject({ type: 'conversation.send', payload: { directories: ['/tmp/reports'] } })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '7', type: 'supervisor.get', payload: {} })).toMatchObject({ type: 'supervisor.get' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '8', type: 'supervisor.update', payload: { input: { name: '任务总管', systemPrompt: '先核对目标和证据再组织员工。', modelId: 'deepseek-v4-pro', memoryScopes: ['global'] } } })).toMatchObject({ type: 'supervisor.update' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '9', type: 'usage.summary', payload: {} })).toMatchObject({ type: 'usage.summary' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '10', type: 'memory.queue.accept', payload: { id: 'queue-1' } })).toMatchObject({ type: 'memory.queue.accept' })
    expect(parseRuntimeCommand({ schemaVersion: 1, requestId: '11', type: 'memory.queue.dismiss', payload: { id: 'queue-1' } })).toMatchObject({ type: 'memory.queue.dismiss' })
  })
})
