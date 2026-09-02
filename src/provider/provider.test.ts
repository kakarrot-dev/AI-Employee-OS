import { describe, expect, it, vi } from 'vitest'
import type { CredentialReader } from './keychain'
import { DeepSeekAdapter } from './deepseek-adapter'
import { MODEL_ALLOWLIST, requireModel } from './models'
import { PoeAdapter } from './poe-adapter'

const credentials: CredentialReader = { read: vi.fn().mockResolvedValue('test-secret'), exists: vi.fn().mockResolvedValue(true) }

describe('provider adapters', () => {
  it('freezes the exact provider model allowlist', () => {
    expect(MODEL_ALLOWLIST.map((model) => model.modelId)).toEqual(['deepseek-v4-pro', 'claude-sonnet-4.6', 'gpt-image-2', 'seedance-2.0'])
    expect(() => requireModel('poe', 'gpt-5.4')).toThrow('model_not_allowed')
  })

  it('normalizes a non-streaming DeepSeek Responses result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'response-1', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const events = []
    for await (const event of new DeepSeekAdapter(credentials, fetchMock).execute({ requestId: 'request-1', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'hello', maxOutputTokens: 32, stream: false })) events.push(event)
    expect(events).toEqual([
      { type: 'output_delta', requestId: 'request-1', delta: 'ok' },
      { type: 'usage', requestId: 'request-1', inputTokens: 2, outputTokens: 1, totalTokens: 3, source: 'provider_actual' },
      { type: 'completed', requestId: 'request-1', providerRequestId: 'response-1' }
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/responses')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning).toEqual({ effort: 'none' })
  })

  it('normalizes DeepSeek streaming deltas, actual usage, and completion', async () => {
    const sse = [
      'event: response.output_text.delta\ndata: {"delta":"O"}\n\n',
      'event: response.output_text.delta\ndata: {"delta":"K"}\n\n',
      'event: response.completed\ndata: {"response":{"id":"response-stream","usage":{"input_tokens":4,"output_tokens":2,"total_tokens":6}}}\n\n'
    ].join('')
    const fetchMock = vi.fn().mockResolvedValue(new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    const events = []
    for await (const event of new DeepSeekAdapter(credentials, fetchMock).execute({ requestId: 'request-stream', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'hello', maxOutputTokens: 32, stream: true })) events.push(event)
    expect(events).toEqual([
      { type: 'output_delta', requestId: 'request-stream', delta: 'O' },
      { type: 'output_delta', requestId: 'request-stream', delta: 'K' },
      { type: 'usage', requestId: 'request-stream', inputTokens: 4, outputTokens: 2, totalTokens: 6, source: 'provider_actual' },
      { type: 'completed', requestId: 'request-stream', providerRequestId: 'response-stream' }
    ])
  })

  it('normalizes structured output and tool proposals without executing the tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'response-structured',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: '{"approved":true}' }] },
        { type: 'function_call', call_id: 'call-1', name: 'propose_task', arguments: '{"title":"Review"}' }
      ]
    }), { status: 200 }))
    const events = []
    for await (const event of new DeepSeekAdapter(credentials, fetchMock).execute({
      requestId: 'request-structured', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'plan', maxOutputTokens: 32, stream: false,
      outputSchema: { name: 'decision', schema: { type: 'object' }, strict: true },
      proposalTool: { name: 'propose_task', description: 'Only propose', parameters: { type: 'object' } }
    })) events.push(event)
    expect(events).toContainEqual({ type: 'structured_result', requestId: 'request-structured', value: { approved: true } })
    expect(events).toContainEqual({ type: 'tool_proposal', requestId: 'request-structured', callId: 'call-1', name: 'propose_task', arguments: { title: 'Review' } })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.text.format).toEqual({ type: 'json_schema', name: 'decision', schema: { type: 'object' } })
    expect(body.tools[0].name).toBe('propose_task')
  })

  it('accepts one bounded JSON code fence from DeepSeek structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'response-fenced', output: [{ type: 'message', content: [{ type: 'output_text', text: '```json\n{"mode":"create_task"}\n```' }] }] }), { status: 200 }))
    const events = []
    for await (const event of new DeepSeekAdapter(credentials, fetchMock).execute({ requestId: 'request-fenced', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'route', maxOutputTokens: 32, stream: false, outputSchema: { name: 'route', schema: { type: 'object' }, strict: true } })) events.push(event)
    expect(events).toContainEqual({ type: 'structured_result', requestId: 'request-fenced', value: { mode: 'create_task' } })
  })

  it.each([
    [401, 'authentication_failed', false],
    [429, 'rate_limited', true]
  ])('maps DeepSeek HTTP %i into %s', async (status, code, retryable) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status, headers: status === 429 ? { 'retry-after': '3' } : undefined }))
    const adapter = new DeepSeekAdapter(credentials, fetchMock)
    await expect(async () => {
      for await (const _event of adapter.execute({ requestId: 'request-error', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'hello', maxOutputTokens: 32, stream: false })) void _event
    }).rejects.toMatchObject({ code, retryable, httpStatus: status })
  })

  it('rejects a terminated DeepSeek stream without a completion event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('event: response.output_text.delta\ndata: {"delta":"partial"}\n\n', { status: 200 }))
    const adapter = new DeepSeekAdapter(credentials, fetchMock)
    await expect(async () => {
      for await (const _event of adapter.execute({ requestId: 'request-cut', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'hello', maxOutputTokens: 32, stream: true })) void _event
    }).rejects.toThrow('invalid_response')
  })

  it('preserves usable output when DeepSeek stops only at the output-token limit', async () => {
    const sse = [
      'event: response.output_text.delta\ndata: {"delta":"partial"}\n\n',
      'event: response.incomplete\ndata: {"response":{"id":"response-limited","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":4,"output_tokens":32,"total_tokens":36}}}\n\n'
    ].join('')
    const events = []
    for await (const event of new DeepSeekAdapter(credentials, vi.fn().mockResolvedValue(new Response(sse, { status: 200 }))).execute({ requestId: 'request-limited', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'hello', maxOutputTokens: 32, stream: true })) events.push(event)
    expect(events).toEqual([
      { type: 'output_delta', requestId: 'request-limited', delta: 'partial' },
      { type: 'output_delta', requestId: 'request-limited', delta: '\n\n[输出因长度上限截断]' },
      { type: 'usage', requestId: 'request-limited', inputTokens: 4, outputTokens: 32, totalTokens: 36, source: 'provider_actual' },
      { type: 'completed', requestId: 'request-limited', providerRequestId: 'response-limited' }
    ])
  })

  it('binds a streaming function-call event without a name to the only frozen Proposal tool', async () => {
    const sse = [
      'event: response.function_call_arguments.done\ndata: {"item_id":"call-stream","arguments":"{\\"summary\\":\\"ready\\"}"}\n\n',
      'event: response.completed\ndata: {"response":{"id":"response-tool"}}\n\n'
    ].join('')
    const events = []
    for await (const event of new DeepSeekAdapter(credentials, vi.fn().mockResolvedValue(new Response(sse, { status: 200 }))).execute({ requestId: 'request-tool-stream', provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'call it', maxOutputTokens: 32, stream: true, proposalTool: { name: 'submit_proposal', description: 'submit', parameters: { type: 'object' } }, toolChoice: 'required' })) events.push(event)
    expect(events[0]).toEqual({ type: 'tool_proposal', requestId: 'request-tool-stream', callId: 'call-stream', name: 'submit_proposal', arguments: { summary: 'ready' } })
    expect(events.at(-1)).toEqual({ type: 'completed', requestId: 'request-tool-stream', providerRequestId: 'response-tool' })
  })

  it('uses separate non-streaming media paths for Poe image and video', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: 'poe-1', choices: [{ message: { content: 'media', attachments: [{ url: 'https://example.invalid/media' }] } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }), { status: 200 }))
    for (const modelId of ['gpt-image-2', 'seedance-2.0'] as const) {
      const events = []
      for await (const event of new PoeAdapter(credentials, fetchMock).execute({ requestId: modelId, provider: 'poe', modelId, input: 'make it', maxOutputTokens: 1, stream: false })) events.push(event)
      expect(events[0]).toMatchObject({ type: 'media_result', modality: modelId === 'gpt-image-2' ? 'image' : 'video' })
      const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body)
      expect(body.stream).toBe(false)
    }
  })
})
