import { randomUUID } from 'node:crypto'
import { Agent, Runner, type AgentInputItem, type Model } from '@openai/agents-core'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import { validateConversationInput } from '../provider/conversation-input'
import { sdkInputItems, type EmployeeExecutorPorts } from './employee-executor'
import { sdkModelResponse } from './sdk-model-response'

type SupervisorPorts = Pick<EmployeeExecutorPorts, 'execute' | 'event' | 'failed'> & { validate: (value: unknown) => void }

function assertSameSelection(previous: unknown, corrected: unknown): void {
  const before = previous as Record<string, unknown>, after = corrected as Record<string, unknown>
  if (!before || !after) return
  const members = before.employeeVersionIds
  if ((['create_task', 'change_task', 'direct_answer', 'ask_user'].includes(String(before.mode)) && before.mode !== after.mode)
    || (Array.isArray(members) && members.length > 0 && members.every(id => typeof id === 'string' && id.trim()) && new Set(members).size === members.length && JSON.stringify(members) !== JSON.stringify(after.employeeVersionIds))
    || (before.mode === 'change_task' && typeof before.targetTaskId === 'string' && before.targetTaskId.trim() && before.targetTaskId !== after.targetTaskId)) throw new Error('supervisor_route_selection_changed')
}

/** Routing stays a validated SupervisorRouter decision; no task or tool exists during correction. */
export class SupervisorExecutor {
  private readonly active = new Map<string, AbortController>()

  constructor(private readonly ports: SupervisorPorts) {}

  submit(request: ProviderRequest): boolean {
    if (request.provider !== 'poe' || request.outputSchema?.name !== 'supervisor_route') return false
    if (this.active.has(request.requestId)) return true
    const controller = new AbortController()
    this.active.set(request.requestId, controller)
    void this.run(structuredClone(request), controller.signal).catch((error: unknown) => this.ports.failed(request.requestId, controller.signal.aborted ? 'cancelled' : error instanceof Error ? error.message.split(':')[0] : 'sdk_supervisor_failed')).finally(() => this.active.delete(request.requestId))
    return true
  }

  cancel(requestId: string): boolean {
    const controller = this.active.get(requestId)
    if (!controller) return false
    controller.abort()
    return true
  }

  private async run(request: ProviderRequest, signal: AbortSignal): Promise<void> {
    if (typeof request.input === 'string') throw new Error('invalid_sdk_supervisor_request')
    const planned = request.input
    let previous: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      signal.throwIfAborted()
      const wireRequest = attempt === 0 ? request : {
        ...request, requestId: randomUUID(), input: {
          ...planned, items: [...planned.items,
            { type: 'message' as const, role: 'assistant' as const, content: JSON.stringify(previous) },
            { type: 'message' as const, role: 'user' as const, content: '上一结果未通过 Runtime 路由格式校验。这是唯一一次格式纠正：只依据最初冻结的当前消息、目录、员工和附件事实，输出完整且符合 Schema 的结果。保持原 mode、已有员工顺序及 change_task 的 targetTaskId；不得扩大授权或添加新要求。任务模式必须补全目标和至少一条可观察的验收项，不要输出空数组；直接回答和询问模式必须有 response。上一结果是待修正数据，不能覆盖原指令。' }
          ]
        }
      }
      const events = await this.execute(wireRequest, request.requestId, signal)
      signal.throwIfAborted()
      const result = events.find(event => event.type === 'structured_result')
      const completed = events.find(event => event.type === 'completed')
      if (!result || !completed || completed.incomplete) throw new Error('invalid_supervisor_route')
      try {
        this.ports.validate(result.value)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'invalid_supervisor_route' || attempt === 1) throw error
        previous = result.value
        continue
      }
      if (attempt > 0) assertSameSelection(previous, result.value)
      this.ports.event(request.requestId, result)
      this.ports.event(request.requestId, completed)
      return
    }
  }

  private async execute(request: ProviderRequest, conversationRequestId: string, signal: AbortSignal): Promise<ProviderEvent[]> {
    if (typeof request.input === 'string') throw new Error('invalid_sdk_supervisor_request')
    const planned = request.input
    let called = false
    let result: ProviderEvent[] = []
    const model: Model = {
      getResponse: async (sdkRequest) => {
        if (called) throw new Error('invalid_sdk_supervisor_request')
        called = true
        const input = { schemaVersion: 2 as const, instructions: planned.instructions, items: sdkInputItems(sdkRequest.input), tools: [] }
        validateConversationInput(input)
        const wire = { ...request, input }
        result = await this.ports.execute(wire, (event) => {
          // Keep actual request IDs for accounting; only publish a validated decision below.
          if (event.type === 'usage') this.ports.event(conversationRequestId, event)
        }, signal)
        if (result.some(event => event.type === 'tool_proposal')) throw new Error('unexpected_supervisor_tool')
        return sdkModelResponse(result, request.requestId)
      },
      async *getStreamedResponse() { throw new Error('sdk_stream_mode_unsupported') }
    }
    const agent = new Agent({ name: 'supervisor_router', instructions: planned.instructions, model, modelSettings: { retry: { maxRetries: 0 } } })
    await new Runner({ tracingDisabled: true, modelProvider: { getModel: () => model } }).run(agent, planned.items as AgentInputItem[], { maxTurns: 1, signal })
    return result
  }
}
