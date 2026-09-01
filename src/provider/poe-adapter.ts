import type { ProviderEvent, ProviderRequest } from './contract'
import { normalizeProviderFailure } from './contract'
import type { CredentialReader } from './keychain'
import { requireModel } from './models'

type Fetch = typeof fetch

export class PoeAdapter {
  constructor(private readonly credentials: CredentialReader, private readonly fetchImpl: Fetch = fetch) {}

  async *execute(request: ProviderRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent> {
    const model = requireModel('poe', request.modelId)
    if (request.provider !== 'poe') throw new Error('provider_mismatch')
    if (request.input.length < 1 || request.input.length > 100_000) throw new Error('invalid_input')
    const credential = await this.credentials.read('poe')
    const endpoint = `https://api.poe.com/v1${model.endpoint}`
    const body = model.endpoint === '/responses'
      ? { model: model.modelId, input: request.input, max_output_tokens: request.maxOutputTokens, stream: request.stream }
      : { model: model.modelId, messages: [{ role: 'user', content: request.input }], stream: false, extra_body: request.mediaParameters ?? {} }
    const response = await this.fetchImpl(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    if (!response.ok) throw normalizeProviderFailure(response.status, response.headers.get('retry-after'))
    if (model.endpoint === '/responses') {
      const payload = await response.json() as any
      for (const item of payload.output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text') yield { type: 'output_delta', requestId: request.requestId, delta: String(content.text) }
      if (payload.usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(payload.usage.input_tokens ?? 0), outputTokens: Number(payload.usage.output_tokens ?? 0), totalTokens: Number(payload.usage.total_tokens ?? 0), source: 'provider_actual' }
      yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
      return
    }
    const payload = await response.json() as any
    const message = payload?.choices?.[0]?.message
    if (!message) throw new Error('invalid_response')
    yield { type: 'media_result', requestId: request.requestId, modality: model.modality as 'image' | 'video', content: String(message.content ?? ''), attachments: Array.isArray(message.attachments) ? message.attachments : [] }
    if (payload.usage) yield { type: 'usage', requestId: request.requestId, inputTokens: Number(payload.usage.prompt_tokens ?? 0), outputTokens: Number(payload.usage.completion_tokens ?? 0), totalTokens: Number(payload.usage.total_tokens ?? 0), source: 'provider_actual' }
    yield { type: 'completed', requestId: request.requestId, providerRequestId: payload.id }
  }
}
