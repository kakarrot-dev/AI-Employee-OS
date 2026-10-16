import { describe, expect, it, vi } from 'vitest'
import type { ProviderEvent, ProviderRequest } from './contract'
import { PoeAdapter } from './poe-adapter'

const credentials = { read: async () => 'fixture-key', exists: async () => true }
const usage = { input_tokens: 1484, output_tokens: 10, total_tokens: 1494 }
const request: ProviderRequest = { requestId: 'legacy-stream', provider: 'poe', modelId: 'claude-sonnet-4.6', input: 'Return the acceptance marker.', stream: true, maxOutputTokens: 64 }
const frame = (type: string, data: Record<string, unknown>) => `data: ${JSON.stringify({ type, ...data })}\r\n\r\n`
async function collect(sse: string, value = request) {
  const bytes = new TextEncoder().encode(sse), events: ProviderEvent[] = []
  const response = new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close() } }))
  for await (const event of new PoeAdapter(credentials, vi.fn().mockResolvedValue(response)).execute(value)) events.push(event)
  return events
}

describe('historical Poe string requests', () => {
  it('accepts the observed data-only SSE terminal receipt and records actual usage', async () => {
    const text = '验收 amber_orchid'
    const events = await collect(frame('response.output_text.delta', { delta: text }) + frame('response.completed', { response: { id: 'actual-legacy-response', status: 'completed', usage, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] } }) + 'data: [DONE]\r\n\r\n')
    expect(events.filter((event) => event.type === 'output_delta').map((event) => event.delta).join('')).toBe(text)
    expect(events).toContainEqual({ type: 'usage', requestId: request.requestId, inputTokens: 1484, outputTokens: 10, totalTokens: 1494, source: 'provider_actual' })
    expect(events.at(-1)).toMatchObject({ type: 'completed', providerRequestId: 'actual-legacy-response' })
  })

  it('keeps the real call_id and never releases a historical tool proposal before the terminal receipt', async () => {
    const value: ProviderRequest = { ...request, proposalTool: { name: 'propose_tool_action', description: 'Frozen action', parameters: { type: 'object' } } }
    const call = { type: 'function_call', id: 'item-id', call_id: 'actual-call-id', name: 'propose_tool_action', arguments: '{"toolVersionId":"read"}', status: 'completed' }
    const partial = frame('response.output_item.added', { item: call }) + frame('response.function_call_arguments.done', { item_id: call.id, arguments: call.arguments })
    await expect(collect(partial, value)).rejects.toThrow('invalid_response')
    const events = await collect(partial + frame('response.completed', { response: { id: 'response', status: 'completed', usage, output: [call] } }), value)
    expect(events.filter((event) => event.type === 'tool_proposal')).toEqual([{ type: 'tool_proposal', requestId: request.requestId, callId: 'actual-call-id', name: 'propose_tool_action', arguments: { toolVersionId: 'read' } }])
  })
})
