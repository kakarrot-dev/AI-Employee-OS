import { Agent, Runner, ToolCallError, Usage, tool, type AgentInputItem, type Model, type ModelRequest, type ModelResponse } from '@openai/agents-core'
import type { ProviderConversationInput, ProviderEvent, ProviderInputItem, ProviderRequest } from '../provider/contract'
import type { TaskService } from './task-service'

type Completed = Extract<ProviderEvent, { type: 'completed' }>
type Proposal = Extract<ProviderEvent, { type: 'tool_proposal' }>

export interface EmployeeExecutorPorts {
  execute: (request: ProviderRequest, onEvent: (event: ProviderEvent) => void, signal?: AbortSignal) => Promise<ProviderEvent[]>
  event: (requestId: string, event: ProviderEvent) => void
  propose: (requestId: string, event: Proposal) => Promise<Record<string, unknown>>
  failed: (requestId: string, code: string) => void
}

interface Execution {
  assignmentId: string
  current: ProviderRequest
  next?: ProviderRequest
  receipt?: { completed: Completed; proposal: Proposal }
}

class RuntimeStopped extends Error {}

/** Rejects unsupported SDK item types instead of flattening them into a user prompt. */
export function sdkInputItems(input: ModelRequest['input']): ProviderInputItem[] {
  if (typeof input === 'string') return [{ type: 'message', role: 'user', content: input }]
  return input.map((item): ProviderInputItem => {
    if (item.type === 'function_call') return { type: 'function_call', callId: item.callId, name: item.name, arguments: item.arguments }
    if (item.type === 'function_call_result') {
      const output = item.output
      if (typeof output === 'string') return { type: 'function_call_result', callId: item.callId, output }
      if (Array.isArray(output) || output.type !== 'text') throw new Error('unsupported_employee_tool_output')
      return { type: 'function_call_result', callId: item.callId, output: output.text }
    }
    if (item.type === 'message' || 'role' in item) {
      if (!['system', 'user', 'assistant'].includes(item.role)) throw new Error('unsupported_employee_message_role')
      const parts = item.content
      if (typeof parts === 'string') return { type: 'message', role: item.role as 'system' | 'user' | 'assistant', content: parts }
      if (!parts.every((part) => part.type === 'input_text' || part.type === 'output_text')) throw new Error('unsupported_employee_message_content')
      return { type: 'message', role: item.role as 'system' | 'user' | 'assistant', content: parts.map((part) => 'text' in part ? part.text : '').join('') }
    }
    throw new Error('unsupported_employee_input_item')
  })
}

/** SDK owns the employee model/tool loop. Runtime remains the authority for every next step. */
export class EmployeeExecutor {
  private readonly active = new Map<string, Execution>()

  constructor(private readonly tasks: TaskService, private readonly ports: EmployeeExecutorPorts) {}

  submit(request: ProviderRequest): boolean {
    const context = this.tasks.employeeExecutionContext(request.requestId)
    if (!context || context.executor !== 'openai-agents-ts-v1' || request.outputSchema) return false
    const existing = this.active.get(context.assignmentId)
    if (existing) {
      if (existing.next) throw new Error('duplicate_employee_continuation')
      existing.next = request
      return true
    }
    const execution: Execution = { assignmentId: context.assignmentId, current: request, next: request }
    this.active.set(context.assignmentId, execution)
    void this.run(execution, context).catch((error: unknown) => {
      // Remove before Runtime emits a retry, so a new execution cannot be consumed by the failed one.
      if (this.active.get(context.assignmentId) === execution) this.active.delete(context.assignmentId)
      const failure = error instanceof ToolCallError ? error.error : error
      if (!(failure instanceof RuntimeStopped)) this.ports.failed(execution.current.requestId, failure instanceof Error ? failure.message.split(':')[0] : 'employee_executor_failed')
    }).finally(() => {
      if (this.active.get(context.assignmentId) === execution) this.active.delete(context.assignmentId)
    })
    return true
  }

  private async run(execution: Execution, context: NonNullable<ReturnType<TaskService['employeeExecutionContext']>>): Promise<void> {
    const firstRequestId = execution.current.requestId
    const model: Model = {
      getResponse: async (sdkRequest) => {
        const planned = execution.next
        if (!planned) throw new RuntimeStopped()
        execution.current = planned
        execution.next = undefined
        const items = sdkInputItems(sdkRequest.input)
        // Runtime may narrow available tools, require another source or request a continuation.
        // Carry its latest policy as a user turn; tool results keep their SDK tool-result roles.
        if (planned.requestId !== firstRequestId) {
          if (typeof planned.input !== 'string') throw new Error('invalid_employee_planned_input')
          items.push({ type: 'message', role: 'user', content: planned.input })
        }
        const input: ProviderConversationInput = { schemaVersion: 2, instructions: context.version.systemPrompt, items, tools: planned.proposalTool ? [planned.proposalTool] : [] }
        const request = this.tasks.bindEmployeeProviderInput(planned, input)
        const events = await this.ports.execute(request, (event) => {
          if (event.type === 'output_delta' || event.type === 'usage') this.ports.event(request.requestId, event)
        }, sdkRequest.signal)
        const completed = events.find((event): event is Completed => event.type === 'completed')
        const usage = events.find((event): event is Extract<ProviderEvent, { type: 'usage' }> => event.type === 'usage')
        const proposals = events.filter((event): event is Proposal => event.type === 'tool_proposal')
        if (!completed || !usage || !completed.providerRequestId) throw new Error('invalid_employee_provider_response')
        // Current TaskService contract accepts one action at a time. Validate before any callback can run.
        if (proposals.length > 1 || (completed.incomplete && proposals.length)) throw new Error('multiple_employee_tool_proposals')
        execution.receipt = proposals.length ? { completed, proposal: proposals[0] } : undefined
        if (!proposals.length) this.ports.event(request.requestId, completed)
        const text = events.filter((event) => event.type === 'output_delta').map((event) => event.delta).join('')
        const response: ModelResponse = {
          responseId: completed.providerRequestId,
          usage: new Usage({ requests: 1, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens }),
          output: [
            ...(text ? [{ type: 'message' as const, id: `${request.requestId}-message`, role: 'assistant' as const, status: 'completed' as const, content: [{ type: 'output_text' as const, text }] }] : []),
            ...proposals.map((proposal) => ({ type: 'function_call' as const, id: proposal.callId, callId: proposal.callId, name: proposal.name, arguments: JSON.stringify(proposal.arguments), status: 'completed' as const }))
          ]
        }
        return response
      },
      // Provider streams deltas through the existing Runtime event path even in a non-stream SDK run.
      async *getStreamedResponse() { throw new Error('employee_sdk_stream_mode_unsupported') }
    }
    const proposalTool = tool({
      name: 'propose_tool_action', description: 'Submit one action to the existing Runtime tool gateway.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: true }, strict: false, errorFunction: null,
      execute: async () => {
        const receipt = execution.receipt
        if (!receipt) throw new Error('missing_employee_tool_receipt')
        execution.receipt = undefined
        const result = await this.ports.propose(execution.current.requestId, receipt.proposal)
        this.ports.event(execution.current.requestId, receipt.completed)
        return JSON.stringify(result)
      }
    })
    const agent = new Agent({ name: context.version.name, instructions: context.version.systemPrompt, model, tools: [proposalTool], modelSettings: { parallelToolCalls: false, retry: { maxRetries: 0 } } })
    const runner = new Runner({ modelProvider: { getModel: () => model }, tracingDisabled: true })
    if (typeof execution.current.input !== 'string') throw new Error('invalid_employee_initial_input')
    let history: string | AgentInputItem[] = execution.current.input
    while (execution.next) {
      const result: { history: AgentInputItem[] } = await runner.run(agent, history, { maxTurns: context.maxSteps })
      history = result.history
      // A final SDK text does not complete a task: Runtime may still require output continuation.
    }
  }
}
