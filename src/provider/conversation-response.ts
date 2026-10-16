import type { ProviderEvent, ProviderRequest } from './contract'
import { providerTools } from './conversation-input'
import { parseToolArguments } from './json'

type ResponsePayload = Record<string, any>

function abort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Provider execution cancelled', 'AbortError')
}

function usageEvent(payload: ResponsePayload, request: ProviderRequest): Extract<ProviderEvent, { type: 'usage' }> {
  const usage = payload.usage
  if (!usage || !['input_tokens', 'output_tokens', 'total_tokens'].every((key) => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) throw new Error('invalid_response')
  return { type: 'usage', requestId: request.requestId, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens, source: 'provider_actual' }
}

function outputText(payload: ResponsePayload): string {
  return (payload.output ?? []).filter((item: any) => item.type === 'message').flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text).join('')
}

function toolEvents(payload: ResponsePayload, fallback: ResponsePayload[], request: ProviderRequest): Array<Extract<ProviderEvent, { type: 'tool_proposal' }>> {
  const outputCalls = (payload.output ?? []).filter((item: any) => item.type === 'function_call')
  const calls: ResponsePayload[] = outputCalls.length ? outputCalls : fallback
  const seen = new Set<string>(), allowed = new Set(providerTools(request).map((tool) => tool.name))
  return calls.map((call) => {
    if (typeof call.call_id !== 'string' || !call.call_id || seen.has(call.call_id) || typeof call.name !== 'string' || !allowed.has(call.name) || typeof call.arguments !== 'string' || (call.status && call.status !== 'completed')) throw new Error('invalid_response')
    seen.add(call.call_id)
    return { type: 'tool_proposal', requestId: request.requestId, callId: call.call_id, name: call.name, arguments: parseToolArguments(call.arguments) }
  })
}

function *terminalEvents(payload: ResponsePayload, request: ProviderRequest, streamedText = '', calls: ResponsePayload[] = []): Generator<ProviderEvent> {
  if (!payload || typeof payload.id !== 'string' || !payload.id || !['completed', 'incomplete'].includes(payload.status)) throw new Error('invalid_response')
  // Record actual billed tokens even when the returned output cannot be used.
  yield usageEvent(payload, request)
  const text = outputText(payload) || streamedText
  if (payload.status === 'incomplete') {
    // Poe emits response.completed with status=incomplete and no reason at its token cap.
    const tokenLimit = payload.incomplete_details?.reason === 'max_output_tokens' || (request.provider === 'poe' && !payload.incomplete_details && payload.usage.output_tokens >= request.maxOutputTokens)
    if (!tokenLimit || !text || calls.length || (payload.output ?? []).some((item: any) => item.type === 'function_call') || request.outputSchema) throw new Error('invalid_response')
    if (!text.startsWith(streamedText)) throw new Error('invalid_response')
    if (text.length > streamedText.length) yield { type: 'output_delta', requestId: request.requestId, delta: text.slice(streamedText.length) }
    yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id, incomplete: true }
    return
  }
  const proposals = toolEvents(payload, calls, request)
  if (!text && !proposals.length) throw new Error('invalid_response')
  if (request.outputSchema) {
    if (!text || proposals.length) throw new Error('invalid_response')
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new Error('invalid_structured_output') }
    yield { type: 'structured_result', requestId: request.requestId, value }
  } else {
    if (!text.startsWith(streamedText)) throw new Error('invalid_response')
    if (text.length > streamedText.length) yield { type: 'output_delta', requestId: request.requestId, delta: text.slice(streamedText.length) }
    for (const event of proposals) yield event
  }
  yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
}

export async function *parseConversationResponse(response: Response, request: ProviderRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
  abort(signal)
  if (!request.stream) {
    const payload = await response.json()
    abort(signal)
    yield* terminalEvents(payload, request)
    return
  }
  if (!response.body) throw new Error('invalid_response')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', frame: string[] = [], streamedText = '', completed = false, terminal = false
  const calls = new Map<string, ResponsePayload>()
  function *parseFrame(): Generator<ProviderEvent> {
    const current = frame; frame = []
    const data = current.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    let payload: ResponsePayload
    try { payload = JSON.parse(data) } catch { throw new Error('invalid_response') }
    const name = current.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? payload.type
    if (terminal) throw new Error('invalid_response')
    if (name === 'response.output_text.delta') {
      if (typeof payload.delta !== 'string') throw new Error('invalid_response')
      streamedText += payload.delta
      if (!request.outputSchema) yield { type: 'output_delta', requestId: request.requestId, delta: payload.delta }
    }
    if (name === 'response.output_item.added' || name === 'response.output_item.done') {
      const item = payload.item
      if (item?.type === 'function_call') {
        if (typeof item.id !== 'string') throw new Error('invalid_response')
        calls.set(item.id, { ...calls.get(item.id), ...item })
      }
    }
    if (name === 'response.function_call_arguments.done') {
      const id = payload.item_id ?? payload.call_id
      if (typeof id !== 'string' || typeof payload.arguments !== 'string') throw new Error('invalid_response')
      calls.set(id, { ...calls.get(id), ...(payload.call_id ? { call_id: payload.call_id } : {}), ...(payload.name ? { name: payload.name } : {}), arguments: payload.arguments, status: 'completed' })
    }
    if (name === 'response.completed' || name === 'response.incomplete') {
      terminal = true
      const full = payload.response
      if (!full || (name === 'response.completed' && full.status !== 'completed' && !(request.provider === 'poe' && full.status === 'incomplete')) || (name === 'response.incomplete' && full.status !== 'incomplete')) throw new Error('invalid_response')
      yield* terminalEvents(full, request, streamedText, [...calls.values()])
      completed = true
    }
    if (name === 'response.failed' || name === 'error') throw new Error('invalid_response')
  }
  const onAbort = (): void => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      abort(signal)
      const { value, done } = await reader.read()
      abort(signal)
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary).replace(/\r$/u, '')
        buffer = buffer.slice(boundary + 1)
        if (line) frame.push(line)
        else yield* parseFrame()
      }
      if (done) break
    }
    if (buffer) frame.push(buffer.replace(/\r$/u, ''))
    if (frame.length) yield* parseFrame()
    if (!completed) throw new Error('invalid_response')
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
