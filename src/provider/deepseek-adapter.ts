import type { CredentialReader } from './keychain'
import { normalizeProviderFailure, type ProviderEvent, type ProviderRequest } from './contract'
import { requireModel } from './models'
import { parseToolArguments } from './json'

type Fetch = typeof fetch

function parseStructuredText(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed)
  } catch {
    throw new Error('invalid_structured_output')
  }
}

export class DeepSeekAdapter {
  constructor(private readonly credentials: CredentialReader, private readonly fetchImpl: Fetch = fetch) {}

  async *execute(request: ProviderRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
    const model = requireModel('deepseek', request.modelId)
    if (model.modality !== 'text' || model.endpoint !== '/responses') throw new Error('unsupported_model_capability')
    if (request.provider !== 'deepseek') throw new Error('provider_mismatch')
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 4096) throw new Error('invalid_output_budget')
    if (request.input.length < 1 || request.input.length > 100_000) throw new Error('invalid_input')

    const credential = await this.credentials.read('deepseek')
    if (request.outputSchema && !request.proposalTool && !request.stream) {
      yield* this.executeStructuredJson(request, credential, signal)
      return
    }
    const body: Record<string, unknown> = {
      model: request.modelId,
      input: request.input,
      reasoning: { effort: 'none' },
      max_output_tokens: request.maxOutputTokens,
      stream: request.stream
    }
    if (request.outputSchema) {
      const { strict: _strict, ...format } = request.outputSchema
      body.text = { format: { type: 'json_schema', ...format } }
    }
    if (request.proposalTool) {
      body.tools = [{ type: 'function', name: request.proposalTool.name, description: request.proposalTool.description, parameters: request.proposalTool.parameters }]
      body.tool_choice = request.toolChoice ?? 'auto'
    } else if (request.toolChoice === 'none') {
      body.tool_choice = 'none'
    }

    const response = await this.fetchImpl('https://api.deepseek.com/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
    if (!response.ok) throw normalizeProviderFailure(response.status, response.headers.get('retry-after'))

    if (request.stream) {
      yield* this.parseStream(response, request)
    } else {
      yield* this.parseNonStream(await response.json(), request)
    }
  }

  private async *executeStructuredJson(request: ProviderRequest, credential: string, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
    const schema = request.outputSchema!
    const response = await this.fetchImpl('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId,
        messages: [
          { role: 'system', content: `你是 Runtime 的 JSON 控制面。只输出一个可被 JSON.parse 解析、且符合下列 JSON Schema 的完整 JSON 对象；不要 Markdown、代码围栏、解释或前后缀。\nSchema name: ${schema.name}\nJSON Schema: ${JSON.stringify(schema.schema)}` },
          { role: 'user', content: request.input }
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: request.maxOutputTokens,
        stream: false
      }),
      signal
    })
    if (!response.ok) throw normalizeProviderFailure(response.status, response.headers.get('retry-after'))
    const payload = await response.json() as any
    const content = payload?.choices?.[0]?.message?.content
    if (typeof payload?.id !== 'string' || typeof content !== 'string' || !content.trim()) throw new Error('invalid_structured_output')
    yield { type: 'structured_result', requestId: request.requestId, value: parseStructuredText(content) }
    if (payload.usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(payload.usage.prompt_tokens ?? 0), outputTokens: Number(payload.usage.completion_tokens ?? 0), totalTokens: Number(payload.usage.total_tokens ?? 0), source: 'provider_actual' }
    yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
  }

  private async *parseStream(response: Response, request: ProviderRequest): AsyncGenerator<ProviderEvent> {
    if (!response.body) throw new Error('invalid_response')
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    let completed = false
    let producedOutput = false
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const eventName = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim()
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
        if (!eventName || !data) continue
        const payload = JSON.parse(data) as Record<string, any>
        if (eventName === 'response.output_text.delta' && typeof payload.delta === 'string') { producedOutput = true; yield { type: 'output_delta', requestId: request.requestId, delta: payload.delta } }
        if (eventName === 'response.function_call_arguments.done') {
          const name = typeof payload.name === 'string' ? payload.name : request.proposalTool?.name
          if (!name) throw new Error('invalid_response')
          producedOutput = true
          yield { type: 'tool_proposal', requestId: request.requestId, callId: String(payload.item_id ?? payload.call_id), name, arguments: parseToolArguments(payload.arguments ?? '{}') }
        }
        if (eventName === 'response.completed') {
          completed = true
          const usage = payload.response?.usage
          if (usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(usage.input_tokens ?? 0), outputTokens: Number(usage.output_tokens ?? 0), totalTokens: Number(usage.total_tokens ?? 0), source: 'provider_actual' }
          yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.response?.id }
        }
        if (eventName === 'response.incomplete') {
          const reason = payload.response?.incomplete_details?.reason
          if (reason !== 'max_output_tokens' || !producedOutput) throw new Error('invalid_response')
          completed = true
          if (!request.proposalTool) yield { type: 'output_delta', requestId: request.requestId, delta: '\n\n[输出因长度上限截断]' }
          const usage = payload.response?.usage
          if (usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(usage.input_tokens ?? 0), outputTokens: Number(usage.output_tokens ?? 0), totalTokens: Number(usage.total_tokens ?? 0), source: 'provider_actual' }
          yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.response?.id }
        }
        if (eventName === 'response.failed') throw new Error('invalid_response')
      }
    }
    if (!completed) throw new Error('invalid_response')
  }

  private *parseNonStream(payload: any, request: ProviderRequest): Generator<ProviderEvent> {
    if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') throw new Error('invalid_response')
    for (const item of payload.output ?? []) {
      if (item.type === 'message') {
        for (const content of item.content ?? []) {
          if (content.type === 'output_text' && typeof content.text === 'string') {
            if (request.outputSchema) yield { type: 'structured_result', requestId: request.requestId, value: parseStructuredText(content.text) }
            else yield { type: 'output_delta', requestId: request.requestId, delta: content.text }
          }
        }
      }
      if (item.type === 'function_call') yield { type: 'tool_proposal', requestId: request.requestId, callId: String(item.call_id ?? item.id), name: String(item.name), arguments: parseToolArguments(item.arguments ?? '{}') }
    }
    if (payload.usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(payload.usage.input_tokens ?? 0), outputTokens: Number(payload.usage.output_tokens ?? 0), totalTokens: Number(payload.usage.total_tokens ?? 0), source: 'provider_actual' }
    yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
  }
}
