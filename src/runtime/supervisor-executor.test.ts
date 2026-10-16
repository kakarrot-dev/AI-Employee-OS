import { describe, expect, it, vi } from 'vitest'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import { SupervisorExecutor } from './supervisor-executor'

const request: ProviderRequest = { requestId: 'route', provider: 'poe', modelId: 'claude-sonnet-4.6', input: { schemaVersion: 2, instructions: 'Runtime 路由契约：只选择冻结目录中的员工。', items: [{ type: 'message', role: 'user', content: '{"currentMessage":"请调用双人组","availableEmployees":["reader","writer"]}' }], tools: [] }, stream: false, maxOutputTokens: 2048, outputSchema: { name: 'supervisor_route', schema: { type: 'object' }, strict: true } }

describe('SDK supervisor routing execution', () => {
  it('runs the actual SDK with separate system policy and user facts, then delivers one structured decision', async () => {
    const delivered: ProviderEvent[] = [], failed = vi.fn()
    const execute = vi.fn(async (wire: ProviderRequest, onEvent: (event: ProviderEvent) => void) => {
      expect(wire.input).toEqual(request.input)
      const events: ProviderEvent[] = [
        { type: 'usage', requestId: wire.requestId, inputTokens: 20, outputTokens: 10, totalTokens: 30, source: 'provider_actual' },
        { type: 'structured_result', requestId: wire.requestId, value: validRoute },
        { type: 'completed', requestId: wire.requestId, providerRequestId: 'poe-route' }
      ]
      for (const event of events) onEvent(event)
      return events
    })
    const executor = new SupervisorExecutor({ execute, event: (_id, event) => delivered.push(event), failed, validate })
    expect(executor.submit(request)).toBe(true)
    await vi.waitFor(() => expect(delivered.at(-1)?.type).toBe('completed'))
    expect(execute).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled()
    expect(delivered.map((event) => event.type)).toEqual(['usage', 'structured_result', 'completed'])
  })

  it('propagates provider cancellation without completing or retrying the route', async () => {
    const failed = vi.fn(), event = vi.fn(), execute = vi.fn(async () => { throw new Error('cancelled') })
    const executor = new SupervisorExecutor({ execute, event, failed, validate })
    executor.submit(request)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('route', 'cancelled'))
    expect(execute).toHaveBeenCalledTimes(1); expect(event).not.toHaveBeenCalled()
    expect(executor.submit({ ...request, provider: 'deepseek' })).toBe(false)
  })
})

const validRoute = { mode: 'create_task', response: '', targetTaskId: '', title: '验收文档', goal: '读取附件后写入并回读文档', acceptanceCriteria: ['读取的 marker 与回读文档一致'], employeeVersionIds: ['reader', 'writer'], missingInputs: [] }
const retainedFailure = { ...validRoute, goal: '提取其中的英文 acceptance marker（当前内容为 ', acceptanceCriteria: [] }
const validate = (value: unknown): void => {
  if (!value || typeof value !== 'object' || !Array.isArray((value as typeof validRoute).acceptanceCriteria) || !(value as typeof validRoute).acceptanceCriteria.length) throw new Error('invalid_supervisor_route')
}
const resultEvents = (wire: ProviderRequest, value: unknown): ProviderEvent[] => [
  { type: 'usage', requestId: wire.requestId, inputTokens: 20, outputTokens: 10, totalTokens: 30, source: 'provider_actual' },
  { type: 'structured_result', requestId: wire.requestId, value },
  { type: 'completed', requestId: wire.requestId, providerRequestId: 'poe-' + wire.requestId }
]

describe('Poe route format correction before side effects', () => {
  it('repairs the retained empty acceptance response once using the frozen input and accounts for both actual requests', async () => {
    const delivered: Array<{ id: string; event: ProviderEvent }> = [], failed = vi.fn()
    const frozen = structuredClone(request)
    const execute = vi.fn(async (wire: ProviderRequest, onEvent: (event: ProviderEvent) => void) => {
      const events = resultEvents(wire, execute.mock.calls.length === 1 ? retainedFailure : validRoute)
      for (const event of events) onEvent(event)
      return events
    })
    new SupervisorExecutor({ execute, event: (id, event) => delivered.push({ id, event }), failed, validate }).submit(request)
    await vi.waitFor(() => expect(delivered.at(-1)?.event.type).toBe('completed'))
    expect(execute).toHaveBeenCalledTimes(2)
    const second = execute.mock.calls[1][0]
    expect(second.requestId).not.toBe(request.requestId)
    expect(second).toMatchObject({ provider: request.provider, modelId: request.modelId, maxOutputTokens: request.maxOutputTokens, outputSchema: request.outputSchema })
    expect(typeof second.input).not.toBe('string')
    if (typeof second.input === 'string' || typeof frozen.input === 'string') throw new Error('typed expected')
    expect(second.input.instructions).toBe(frozen.input.instructions)
    expect(second.input.items.slice(0, frozen.input.items.length)).toEqual(frozen.input.items)
    expect(second.input.tools).toEqual([])
    expect(request).toEqual(frozen)
    expect(delivered.every(({ id }) => id === request.requestId)).toBe(true)
    expect(delivered.filter(({ event }) => event.type === 'usage').map(({ event }) => event.requestId)).toEqual([request.requestId, second.requestId])
    expect(delivered.filter(({ event }) => event.type === 'structured_result')).toEqual([{ id: request.requestId, event: { type: 'structured_result', requestId: second.requestId, value: validRoute } }])
    expect(delivered.filter(({ event }) => event.type === 'completed')).toHaveLength(1)
    expect(failed).not.toHaveBeenCalled()
  })

  it('fails after the single correction without delivering a decision', async () => {
    const delivered: ProviderEvent[] = [], failed = vi.fn()
    const execute = vi.fn(async (wire: ProviderRequest, onEvent: (event: ProviderEvent) => void) => {
      const events = resultEvents(wire, retainedFailure); events.forEach(onEvent); return events
    })
    new SupervisorExecutor({ execute, event: (_id, event) => delivered.push(event), failed, validate }).submit(request)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('route', 'invalid_supervisor_route'))
    expect(execute).toHaveBeenCalledTimes(2)
    expect(delivered.map(x => x.type)).toEqual(['usage', 'usage'])
  })

  it.each([
    ['mode', { ...validRoute, mode: 'ask_user', response: '问问题' }],
    ['employee order', { ...validRoute, employeeVersionIds: ['writer', 'reader'] }],
    ['change target', { ...validRoute, mode: 'change_task', targetTaskId: 'other-task' }]
  ])('rejects changing the frozen business selection during correction: %s', async (_name, changed) => {
    const failed = vi.fn(), delivered: ProviderEvent[] = []
    const initial = changed.mode === 'change_task' ? { ...retainedFailure, mode: 'change_task', targetTaskId: 'original-task' } : retainedFailure
    const execute = vi.fn(async (wire: ProviderRequest, onEvent: (event: ProviderEvent) => void) => {
      const events = resultEvents(wire, execute.mock.calls.length === 1 ? initial : changed); events.forEach(onEvent); return events
    })
    new SupervisorExecutor({ execute, event: (_id, event) => delivered.push(event), failed, validate }).submit(request)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('route', 'supervisor_route_selection_changed'))
    expect(execute).toHaveBeenCalledTimes(2)
    expect(delivered.every(x => x.type === 'usage')).toBe(true)
  })

  it('cancels the correction using the original conversation request id', async () => {
    const failed = vi.fn(), delivered: ProviderEvent[] = []
    const execute = vi.fn(async (wire: ProviderRequest, onEvent: (event: ProviderEvent) => void, signal?: AbortSignal) => {
      if (execute.mock.calls.length === 1) { const events = resultEvents(wire, retainedFailure); events.forEach(onEvent); return events }
      return new Promise<ProviderEvent[]>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
    })
    const executor = new SupervisorExecutor({ execute, event: (_id, event) => delivered.push(event), failed, validate })
    executor.submit(request)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2))
    expect(executor.cancel('route')).toBe(true)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('route', 'cancelled'))
    expect(delivered.map(x => x.type)).toEqual(['usage'])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(executor.cancel('route')).toBe(false)
  })

  it('does not retry provider failures or supervisor tool proposals', async () => {
    for (const code of ['authentication_failed', 'invalid_structured_output']) {
      const failed = vi.fn(), execute = vi.fn(async () => { throw new Error(code) })
      new SupervisorExecutor({ execute, event: vi.fn(), failed, validate }).submit(request)
      await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('route', code))
      expect(execute).toHaveBeenCalledTimes(1)
    }
    const failed = vi.fn(), event = vi.fn()
    const execute = vi.fn(async (wire: ProviderRequest, onEvent: (event: ProviderEvent) => void) => {
      const events = [...resultEvents(wire, validRoute), { type: 'tool_proposal' as const, requestId: wire.requestId, callId: 'bad', name: 'write', arguments: {} }]; events.forEach(onEvent); return events
    })
    new SupervisorExecutor({ execute, event, failed, validate }).submit(request)
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('route', 'unexpected_supervisor_tool'))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(event.mock.calls.map(x => x[1].type)).toEqual(['usage'])
  })
})
