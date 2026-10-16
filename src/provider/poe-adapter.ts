import type { ProviderEvent, ProviderRequest } from './contract'
import { normalizeProviderFailure } from './contract'
import type { CredentialReader } from './keychain'
import { requireModel } from './models'
import { parseToolArguments } from './json'
import { isConversationInput, responsesInput, responsesToolChoice, validateProviderRequest } from './conversation-input'
import { parseConversationResponse } from './conversation-response'
import { assertPoeUniqueItems, poeOutputSchema } from './poe-schema'

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

export class PoeAdapter {
  constructor(private readonly credentials: CredentialReader, private readonly fetchImpl: Fetch = fetch) {}

  async *execute(request: ProviderRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
    const model = requireModel('poe', request.modelId)
    if (request.provider !== 'poe') throw new Error('provider_mismatch')
    validateProviderRequest(request)
    signal?.throwIfAborted()
    if (isConversationInput(request.input) && model.modality !== 'text') throw new Error('unsupported_model_capability')
    const credential = await this.credentials.read('poe')
    const endpoint = `https://api.poe.com/v1${model.endpoint}`
    const body: Record<string, unknown> = model.endpoint === '/responses'
      // Poe's Anthropic bridge currently drops the top-level instructions field.
      // Keep the provider-neutral contract and carry instructions as a system input item.
      ? { model: model.modelId, input: isConversationInput(request.input) ? [...(request.input.instructions ? [{ role: 'system', content: request.input.instructions }] : []), ...responsesInput(request.input)] : request.input, max_output_tokens: request.maxOutputTokens, stream: request.stream }
      : { model: model.modelId, messages: [{ role: 'user', content: request.input }], stream: false, extra_body: request.mediaParameters ?? {} }
    if (model.endpoint === '/responses' && request.outputSchema) {
      const { strict: _strict, ...format } = request.outputSchema
      body.text = { format: { type: 'json_schema', ...format, schema: poeOutputSchema(format.schema) } }
    }
    if (model.endpoint === '/responses' && isConversationInput(request.input) && request.input.tools?.length) {
      body.tools = request.input.tools.map((tool) => ({ type: 'function', ...tool }))
      body.tool_choice = responsesToolChoice(request.toolChoice)
    } else if (model.endpoint === '/responses' && request.proposalTool) {
      body.tools = [{ type: 'function', name: request.proposalTool.name, description: request.proposalTool.description, parameters: request.proposalTool.parameters }]
      body.tool_choice = request.toolChoice ?? 'auto'
    } else if (model.endpoint === '/responses' && request.toolChoice === 'none') {
      body.tool_choice = 'none'
    }
    const response = await this.fetchImpl(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    if (!response.ok) throw normalizeProviderFailure(response.status, response.headers.get('retry-after'))
    if (model.endpoint === '/responses') {
      if (isConversationInput(request.input) || request.stream) {
        for await (const event of parseConversationResponse(response, request, signal)) {
          if (event.type === 'structured_result' && request.outputSchema) assertPoeUniqueItems(request.outputSchema.schema, event.value)
          yield event
        }
      }
      else yield* this.parseNonStream(await response.json(), request)
      return
    }
    const payload = await response.json() as any
    const message = payload?.choices?.[0]?.message
    if (!message) throw new Error('invalid_response')
    yield { type: 'media_result', requestId: request.requestId, modality: model.modality as 'image' | 'video', content: String(message.content ?? ''), attachments: Array.isArray(message.attachments) ? message.attachments : [] }
    if (payload.usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(payload.usage.prompt_tokens ?? 0), outputTokens: Number(payload.usage.completion_tokens ?? 0), totalTokens: Number(payload.usage.total_tokens ?? 0), source: 'provider_actual' }
    yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
  }

  private *parseNonStream(payload: any, request: ProviderRequest): Generator<ProviderEvent> {
    if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') throw new Error('invalid_response')
    // Preserve the actual receipt when a paid response fails structured validation.
    if (payload.usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(payload.usage.input_tokens ?? 0), outputTokens: Number(payload.usage.output_tokens ?? 0), totalTokens: Number(payload.usage.total_tokens ?? 0), source: 'provider_actual' }
    for (const item of payload.output ?? []) {
      if (item.type === 'message') {
        for (const content of item.content ?? []) {
          if (content.type === 'output_text' && typeof content.text === 'string') {
            if (request.outputSchema) {
              const value = parseStructuredText(content.text)
              assertPoeUniqueItems(request.outputSchema.schema, value)
              yield { type: 'structured_result', requestId: request.requestId, value }
            }
            else yield { type: 'output_delta', requestId: request.requestId, delta: content.text }
          }
        }
      }
      if (item.type === 'function_call') yield { type: 'tool_proposal', requestId: request.requestId, callId: String(item.call_id ?? item.id), name: String(item.name), arguments: parseToolArguments(item.arguments ?? '{}') }
    }
    yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
  }
}
