import { describe, expect, it, vi } from 'vitest'
import type { ProviderConversationInput, ProviderEvent, ProviderRequest } from './contract'
import { validateConversationInput } from './conversation-input'
import { DeepSeekAdapter } from './deepseek-adapter'
import { PoeAdapter } from './poe-adapter'
import { assertPoeUniqueItems, poeOutputSchema } from './poe-schema'
import { parseProviderCommand } from './protocol'

const credentials = { read: vi.fn(async () => 'test-credential-never-in-input'), exists: vi.fn(async () => true) }
const lookup = { name: 'lookup', description: 'Read a value', parameters: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'], additionalProperties: false } }
const conversation = (): ProviderConversationInput => ({ schemaVersion: 2, instructions: 'Use verified results.', items: [{ type: 'message', role: 'user', content: 'lookup 7' }, { type: 'function_call', callId: 'previous', name: 'lookup', arguments: '{"value":7}' }, { type: 'function_call_result', callId: 'previous', output: '{"value":7}' }], tools: [lookup] })
const usage = { input_tokens: 12, output_tokens: 4, total_tokens: 16 }
const textOutput = (text: string) => [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }]
const call = { type: 'function_call', id: 'item-1', call_id: 'actual', name: 'lookup', arguments: '{"value":8}', status: 'completed' }
const frame = (type: string, payload: object) => `event: ${type}\r\ndata: ${JSON.stringify({ type, ...payload })}\r\n\r\n`
async function collect(adapter: DeepSeekAdapter | PoeAdapter, request: ProviderRequest, signal?: AbortSignal): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = []
  for await (const event of adapter.execute(request, signal)) events.push(event)
  return events
}

describe('versioned Provider conversation input', () => {
  it('accepts role messages, matched results and multiple tools across IPC', () => {
    const input = conversation(); input.tools!.push({ ...lookup, name: 'other' })
    expect(parseProviderCommand({ schemaVersion: 1, requestId: 'round-2', type: 'execute', payload: { requestId: 'round-2', provider: 'poe', modelId: 'claude-sonnet-4.6', input, stream: false, maxOutputTokens: 64 } })).toMatchObject({ payload: { input } })
  })
  it.each([
    ['unknown version', () => ({ ...conversation(), schemaVersion: 3 })],
    ['orphan result', () => ({ ...conversation(), items: [{ type: 'function_call_result', callId: 'missing', output: 'value' }] })],
    ['unsettled call', () => ({ ...conversation(), items: conversation().items.slice(0, 2) })],
    ['duplicate call id', () => ({ ...conversation(), items: [...conversation().items, conversation().items[1]] })],
    ['duplicate result', () => ({ ...conversation(), items: [...conversation().items, conversation().items[2]] })],
    ['invalid arguments', () => ({ ...conversation(), items: [{ type: 'function_call', callId: 'call-1', name: 'lookup', arguments: '{' }] })],
    ['duplicate tools', () => ({ ...conversation(), tools: [lookup, lookup] })],
    ['unexpected transport fields', () => ({ ...conversation(), apiKey: 'not-accepted' })],
    ['unbounded input', () => ({ ...conversation(), instructions: 'x'.repeat(100_001) })]
  ])('rejects %s', (_name, build) => { expect(() => validateConversationInput(build())).toThrow() })
  it('rejects mixed tool registries and forced unregistered tools before transport', async () => {
    const fetchMock = vi.fn(), adapter = new PoeAdapter(credentials, fetchMock)
    const base: ProviderRequest = { requestId: 'mixed', provider: 'poe', modelId: 'claude-sonnet-4.6', input: conversation(), stream: false, maxOutputTokens: 64 }
    await expect(collect(adapter, { ...base, proposalTool: lookup })).rejects.toThrow('ambiguous_provider_tools')
    await expect(collect(adapter, { ...base, toolChoice: { type: 'function', name: 'unregistered' } })).rejects.toThrow('invalid_tool_choice')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe.each(['deepseek', 'poe'] as const)('%s conversation transport', (provider) => {
  const request = (stream = false): ProviderRequest => ({ requestId: 'round-2', provider, modelId: provider === 'deepseek' ? 'deepseek-v4-pro' : 'claude-sonnet-4.6', input: conversation(), maxOutputTokens: 64, stream, toolChoice: { type: 'function', name: 'lookup' } })
  const adapter = (fetchMock: typeof fetch) => provider === 'deepseek' ? new DeepSeekAdapter(credentials, fetchMock) : new PoeAdapter(credentials, fetchMock)

  it('preserves history and call_id on the wire, returns tool proposals and actual usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'response-2', status: 'completed', output: [call], usage })))
    const events = await collect(adapter(fetchMock), request()), body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.input).toEqual([...(provider === 'poe' ? [{ role: 'system', content: 'Use verified results.' }] : []), { role: 'user', content: 'lookup 7' }, { type: 'function_call', call_id: 'previous', name: 'lookup', arguments: '{"value":7}' }, { type: 'function_call_output', call_id: 'previous', output: '{"value":7}' }])
    expect(body.instructions).toBe(provider === 'deepseek' ? 'Use verified results.' : undefined)
    expect(body.tools).toEqual([{ type: 'function', ...lookup }])
    expect(body.tool_choice).toEqual({ type: 'function', name: 'lookup' })
    expect(JSON.stringify(body)).not.toContain('test-credential')
    expect(events).toContainEqual({ type: 'tool_proposal', requestId: 'round-2', callId: 'actual', name: 'lookup', arguments: { value: 8 } })
    expect(events).toContainEqual({ type: 'usage', requestId: 'round-2', inputTokens: 12, outputTokens: 4, totalTokens: 16, source: 'provider_actual' })
  })
  it('parses chunked UTF-8 CRLF SSE and EOF without duplicating final text', async () => {
    const text = '实际结果:7', sse = frame('response.output_text.delta', { delta: text.slice(0, 2) }) + frame('response.output_text.delta', { delta: text.slice(2) }) + frame('response.completed', { response: { id: 'stream-1', status: 'completed', output: textOutput(text), usage } }).trimEnd()
    const bytes = new TextEncoder().encode(sse)
    const response = new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close() } }))
    const events = await collect(adapter(vi.fn().mockResolvedValue(response)), request(true))
    expect(events.filter((e) => e.type === 'output_delta').map((e) => e.delta).join('')).toBe(text)
    expect(events.at(-1)).toEqual({ type: 'completed', requestId: 'round-2', providerRequestId: 'stream-1' })
  })
  it('holds tools until a complete terminal receipt and keeps call_id instead of item_id', async () => {
    const sse = frame('response.output_item.added', { item: { ...call, arguments: '', status: 'in_progress' } }) + frame('response.function_call_arguments.done', { item_id: call.id, arguments: call.arguments }) + frame('response.completed', { response: { id: 'tool-response', status: 'completed', output: [call], usage } })
    const events = await collect(adapter(vi.fn().mockResolvedValue(new Response(sse))), request(true))
    expect(events.filter((e) => e.type === 'tool_proposal')).toEqual([{ type: 'tool_proposal', requestId: 'round-2', callId: 'actual', name: 'lookup', arguments: { value: 8 } }])
  })
  it('releases no tool if SSE breaks after arguments.done', async () => {
    const sse = frame('response.output_item.added', { item: call }) + frame('response.function_call_arguments.done', { item_id: call.id, arguments: call.arguments }), events: ProviderEvent[] = []
    await expect((async () => { for await (const event of adapter(vi.fn().mockResolvedValue(new Response(sse))).execute(request(true))) events.push(event) })()).rejects.toThrow('invalid_response')
    expect(events.some((e) => e.type === 'tool_proposal' || e.type === 'completed')).toBe(false)
  })
  it('marks truncated text incomplete and rejects partial tool arguments, while retaining billed usage', async () => {
    const response = { id: 'limited', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: textOutput('partial'), usage }
    expect((await collect(adapter(vi.fn().mockResolvedValue(new Response(JSON.stringify(response)))), request())).at(-1)).toMatchObject({ type: 'completed', incomplete: true })
    const events: ProviderEvent[] = [], broken = { ...response, output: [{ ...call, arguments: '{', status: 'incomplete' }] }
    await expect((async () => { for await (const event of adapter(vi.fn().mockResolvedValue(new Response(JSON.stringify(broken)))).execute(request())) events.push(event) })()).rejects.toThrow('invalid_response')
    expect(events.map((e) => e.type)).toEqual(['usage'])
  })
  it('rejects unregistered functions and missing usage', async () => {
    const payload = { id: 'response', status: 'completed', output: [{ ...call, name: 'shell' }], usage }
    await expect(collect(adapter(vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))), request())).rejects.toThrow('invalid_response')
    await expect(collect(adapter(vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...payload, output: textOutput('ready'), usage: undefined })))), request())).rejects.toThrow('invalid_response')
  })
  it('cancels a pending stream read with no completion or tool proposal', async () => {
    const controller = new AbortController(), events: ProviderEvent[] = []
    const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode(frame('response.output_text.delta', { delta: 'starting' }))) } }))
    await expect((async () => { for await (const event of adapter(vi.fn().mockResolvedValue(response)).execute(request(true), controller.signal)) { events.push(event); controller.abort() } })()).rejects.toMatchObject({ name: 'AbortError' })
    expect(events.map((e) => e.type)).toEqual(['output_delta'])
  })
})

it('preserves typed history in the DeepSeek structured control fallback', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'structured', choices: [{ message: { tool_calls: [{ type: 'function', function: { name: 'decision', arguments: '{"ok":true}' } }] } }], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } })))
  const input = conversation(); input.tools = []
  const events = await collect(new DeepSeekAdapter(credentials, fetchMock), { requestId: 'decision', provider: 'deepseek', modelId: 'deepseek-v4-pro', input, stream: false, maxOutputTokens: 64, outputSchema: { name: 'decision', schema: { type: 'object' }, strict: true } })
  expect(events).toContainEqual({ type: 'structured_result', requestId: 'decision', value: { ok: true } })
  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(body.messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'previous', content: '{"value":7}' })
  expect(body.messages.find((m: { tool_calls?: unknown[] }) => m.tool_calls)?.tool_calls[0].id).toBe('previous')
})

it('normalizes the observed Poe completed event with incomplete status only at the billed token limit', async () => {
  const request: ProviderRequest = { requestId: 'poe-limit', provider: 'poe', modelId: 'claude-sonnet-4.6', input: { schemaVersion: 2, items: [{ type: 'message', role: 'user', content: 'list integers' }] }, stream: true, maxOutputTokens: 8 }
  const payload = { id: 'poe-limited', status: 'incomplete', incomplete_details: null, output: textOutput('partial'), usage: { input_tokens: 27, output_tokens: 8, total_tokens: 35 } }
  const adapter = (response: unknown) => new PoeAdapter(credentials, vi.fn().mockResolvedValue(new Response(frame('response.completed', { response }))))
  expect((await collect(adapter(payload), request)).at(-1)).toMatchObject({ type: 'completed', incomplete: true })
  await expect(collect(adapter({ ...payload, usage: { ...payload.usage, output_tokens: 4 } }), request)).rejects.toThrow('invalid_response')
})

it('rejects conversation input for media models', async () => {
  const fetchMock = vi.fn()
  await expect(collect(new PoeAdapter(credentials, fetchMock), { requestId: 'media', provider: 'poe', modelId: 'gpt-image-2', input: conversation(), stream: false, maxOutputTokens: 64 })).rejects.toThrow('unsupported_model_capability')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('projects unsupported Poe uniqueItems without weakening the original output contract', async () => {
  const schema = { type: 'object', properties: { rows: { type: 'array', uniqueItems: true, items: { type: 'object', properties: { uniqueItems: { type: 'string' } } } } } }
  const wire = poeOutputSchema(schema)
  expect(wire).toEqual({ type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { uniqueItems: { type: 'string' } } } } } })
  expect(schema.properties.rows.uniqueItems).toBe(true)
  expect(() => assertPoeUniqueItems(schema, { rows: [{ a: 1, b: 2 }, { b: 2, a: 1 }] })).toThrow('invalid_structured_output')
  const request: ProviderRequest = { requestId: 'unique', provider: 'poe', modelId: 'claude-sonnet-4.6', input: { schemaVersion: 2, items: [{ type: 'message', role: 'user', content: 'decide' }] }, maxOutputTokens: 64, stream: false, outputSchema: { name: 'unique', strict: true, schema } }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'unique-response', status: 'completed', output: textOutput('{"rows":[{"a":1},{"a":1}]}'), usage })))
  const events: ProviderEvent[] = []
  await expect((async () => { for await (const event of new PoeAdapter(credentials, fetchMock).execute(request)) events.push(event) })()).rejects.toThrow('invalid_structured_output')
  expect(events.map((event) => event.type)).toEqual(['usage'])
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).text.format.schema).toEqual(wire)
})

it('retains the paid usage receipt for invalid structured output on the legacy Poe path', async () => {
  const request: ProviderRequest = { requestId: 'legacy-invalid', provider: 'poe', modelId: 'claude-sonnet-4.6', input: 'decide', maxOutputTokens: 64, stream: false, outputSchema: { name: 'review', strict: true, schema: { type: 'object' } } }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'legacy-invalid-response', output: textOutput('{bad-json'), usage })))
  const events: ProviderEvent[] = []
  await expect((async () => { for await (const event of new PoeAdapter(credentials, fetchMock).execute(request)) events.push(event) })()).rejects.toThrow('invalid_structured_output')
  expect(events.map((event) => event.type)).toEqual(['usage'])
})

it('expands the route mode constraints into exclusive Poe anyOf branches while preserving the original flat contract', async () => {
  const schema = { type: 'object', additionalProperties: false, required: ['mode', 'criteria'], properties: { mode: { type: 'string', enum: ['task', 'answer'] }, criteria: { type: 'array', uniqueItems: true, maxItems: 12, items: { type: 'string' } } }, anyOf: [ { properties: { mode: { enum: ['task'] }, criteria: { minItems: 1 } } }, { properties: { mode: { enum: ['answer'] } } } ] }
  const original = structuredClone(schema), wire = poeOutputSchema(schema)
  expect(Object.keys(wire)).toEqual(['anyOf'])
  const branches = wire.anyOf as Array<Record<string, any>>
  expect(branches[0]).toEqual({ type: 'object', additionalProperties: false, required: ['mode', 'criteria'], properties: { mode: { type: 'string', enum: ['task'] }, criteria: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } } } })
  expect(branches[1].properties.criteria.minItems).toBeUndefined()
  expect(schema).toEqual(original)
  expect(() => assertPoeUniqueItems(schema, { mode: 'task', criteria: ['same', 'same'] })).toThrow('invalid_structured_output')
  const request: ProviderRequest = { requestId: 'mode-route', provider: 'poe', modelId: 'claude-sonnet-4.6', input: { schemaVersion: 2, items: [{ type: 'message', role: 'user', content: 'route' }] }, maxOutputTokens: 256, stream: false, outputSchema: { name: 'supervisor_route', strict: true, schema } }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'mode-response', status: 'completed', output: textOutput('{"mode":"task","criteria":["file exists"]}'), usage })))
  await collect(new PoeAdapter(credentials, fetchMock), request)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).text.format.schema).toEqual(wire)
})
