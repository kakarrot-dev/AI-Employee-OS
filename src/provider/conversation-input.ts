import type { ProviderConversationInput, ProviderRequest, ProposalToolDefinition } from './contract'

const functionName = /^[A-Za-z0-9_-]{1,64}$/u
const callIdentifier = /^[A-Za-z0-9_-]{1,256}$/u

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('invalid_provider_input')
}

export function validateConversationInput(value: unknown): asserts value is ProviderConversationInput {
  if (!record(value) || value.schemaVersion !== 2) throw new Error('unsupported_input_version')
  keys(value, ['schemaVersion', 'instructions', 'items', 'tools'])
  if (value.instructions !== undefined && typeof value.instructions !== 'string') throw new Error('invalid_provider_input')
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 256) throw new Error('invalid_provider_input')
  const calls = new Set<string>(), results = new Set<string>()
  for (const item of value.items) {
    if (!record(item)) throw new Error('invalid_provider_input')
    if (item.type === 'message') {
      keys(item, ['type', 'role', 'content'])
      if (!['system', 'user', 'assistant'].includes(String(item.role)) || typeof item.content !== 'string') throw new Error('invalid_provider_input')
    } else if (item.type === 'function_call') {
      keys(item, ['type', 'callId', 'name', 'arguments'])
      if (typeof item.callId !== 'string' || !callIdentifier.test(item.callId) || calls.has(item.callId) || typeof item.name !== 'string' || !functionName.test(item.name) || typeof item.arguments !== 'string') throw new Error('invalid_provider_input')
      let parameters: unknown
      try { parameters = JSON.parse(item.arguments) } catch { throw new Error('invalid_provider_input') }
      if (!record(parameters)) throw new Error('invalid_provider_input')
      calls.add(item.callId)
    } else if (item.type === 'function_call_result') {
      keys(item, ['type', 'callId', 'output'])
      if (typeof item.callId !== 'string' || !calls.has(item.callId) || results.has(item.callId) || typeof item.output !== 'string') throw new Error('invalid_provider_input')
      results.add(item.callId)
    } else throw new Error('invalid_provider_input')
  }
  if ([...calls].some((id) => !results.has(id))) throw new Error('unsettled_provider_tool_call')
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools) || value.tools.length > 64) throw new Error('invalid_provider_tools')
    const names = new Set<string>()
    for (const tool of value.tools) {
      if (!record(tool)) throw new Error('invalid_provider_tools')
      keys(tool, ['name', 'description', 'parameters'])
      if (typeof tool.name !== 'string' || !functionName.test(tool.name) || names.has(tool.name) || typeof tool.description !== 'string' || tool.description.length > 4096 || !record(tool.parameters) || tool.parameters.type !== 'object') throw new Error('invalid_provider_tools')
      names.add(tool.name)
    }
  }
  if (JSON.stringify(value).length > 100_000) throw new Error('invalid_input')
}

export function validateProviderRequest(request: ProviderRequest): void {
  if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 4096) throw new Error('invalid_output_budget')
  if (typeof request.stream !== 'boolean') throw new Error('invalid_provider_request')
  if (typeof request.input === 'string') {
    if (!request.input.length || request.input.length > 100_000) throw new Error('invalid_input')
  } else {
    validateConversationInput(request.input)
    if (request.proposalTool) throw new Error('ambiguous_provider_tools')
  }
  const tools = providerTools(request)
  const choice = request.toolChoice
  if (choice !== undefined) {
    if (typeof choice === 'string') {
      if (!['auto', 'required', 'none'].includes(choice)) throw new Error('invalid_tool_choice')
      if (choice === 'required' && !tools.length) throw new Error('invalid_tool_choice')
    } else if (!record(choice) || choice.type !== 'function' || !tools.some((tool) => tool.name === choice.name)) throw new Error('invalid_tool_choice')
  }
}

export function providerTools(request: ProviderRequest): ProposalToolDefinition[] {
  return typeof request.input === 'string' ? request.proposalTool ? [request.proposalTool] : [] : request.input.tools ?? []
}

export function responsesInput(input: ProviderConversationInput): Array<Record<string, unknown>> {
  return input.items.map((item) => item.type === 'message' ? { role: item.role, content: item.content }
    : item.type === 'function_call' ? { type: 'function_call', call_id: item.callId, name: item.name, arguments: item.arguments }
      : { type: 'function_call_output', call_id: item.callId, output: item.output })
}

export function responsesToolChoice(choice: ProviderRequest['toolChoice']): unknown {
  return typeof choice === 'object' ? { type: 'function', name: choice.name } : choice ?? 'auto'
}

export function chatInput(input: ProviderRequest['input']): Array<Record<string, unknown>> {
  if (typeof input === 'string') return [{ role: 'user', content: input }]
  const messages: Array<Record<string, unknown>> = input.instructions ? [{ role: 'system', content: input.instructions }] : []
  for (const item of input.items) {
    if (item.type === 'message') messages.push({ role: item.role, content: item.content })
    else if (item.type === 'function_call_result') messages.push({ role: 'tool', tool_call_id: item.callId, content: item.output })
    else {
      const call = { id: item.callId, type: 'function', function: { name: item.name, arguments: item.arguments } }
      const previous = messages.at(-1)
      if (previous?.role === 'assistant' && Array.isArray(previous.tool_calls)) previous.tool_calls.push(call)
      else messages.push({ role: 'assistant', content: null, tool_calls: [call] })
    }
  }
  return messages
}

export function isConversationInput(input: ProviderRequest['input']): input is ProviderConversationInput {
  return typeof input !== 'string'
}
