import { Usage, type ModelResponse } from '@openai/agents-core'
import type { ProviderEvent } from '../provider/contract'
import { sdkDigest, type SdkDispatchReceipt } from './sdk-checkpoints'

export function sdkDispatchResponse(receipt: SdkDispatchReceipt): ModelResponse {
  if (receipt.source !== 'runtime_frozen_plan') return sdkModelResponse(receipt.events, receipt.request.requestId)
  return {
    responseId: `runtime-response-${receipt.requestId}`,
    usage: new Usage(),
    output: [{ type: 'function_call', id: receipt.callId, callId: receipt.callId, name: `delegate_${sdkDigest(receipt.employeeVersionId).slice(0, 20)}`, arguments: JSON.stringify({ assignmentId: receipt.assignmentId }), status: 'completed' }]
  }
}

export function sdkModelResponse(events: ProviderEvent[], requestId: string): ModelResponse {
  const completed = events.find((event) => event.type === 'completed')
  const usage = events.find((event) => event.type === 'usage')
  if (!completed?.providerRequestId || !usage) throw new Error('invalid_sdk_provider_response')
  const structured = events.find((event) => event.type === 'structured_result')
  const text = structured ? JSON.stringify(structured.value) : events.filter((event) => event.type === 'output_delta').map((event) => event.delta).join('')
  return {
    responseId: completed.providerRequestId,
    usage: new Usage({ requests: 1, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens }),
    output: [
      ...(text ? [{ type: 'message' as const, id: `${requestId}-message`, role: 'assistant' as const, status: 'completed' as const, content: [{ type: 'output_text' as const, text }] }] : []),
      ...events.filter((event) => event.type === 'tool_proposal').map((event) => ({ type: 'function_call' as const, id: event.callId, callId: event.callId, name: event.name, arguments: JSON.stringify(event.arguments), status: 'completed' as const }))
    ]
  }
}
