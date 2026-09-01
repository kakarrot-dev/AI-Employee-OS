import type { AllowedModelId, ProviderId } from './models'

export interface JsonSchemaDefinition {
  name: string
  schema: Record<string, unknown>
  strict: true
}

export interface ProposalToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ProviderRequest {
  requestId: string
  provider: ProviderId
  modelId: AllowedModelId
  input: string
  maxOutputTokens: number
  stream: boolean
  outputSchema?: JsonSchemaDefinition
  proposalTool?: ProposalToolDefinition
  toolChoice?: 'auto' | 'required' | 'none'
  mediaParameters?: Record<string, string | number | boolean>
}

export type ProviderEvent =
  | { type: 'output_delta'; requestId: string; delta: string }
  | { type: 'structured_result'; requestId: string; value: unknown }
  | { type: 'tool_proposal'; requestId: string; callId: string; name: string; arguments: unknown }
  | { type: 'media_result'; requestId: string; modality: 'image' | 'video'; content: string; attachments: unknown[] }
  | { type: 'usage'; requestId: string; inputTokens: number; outputTokens: number; totalTokens: number; source: 'provider_actual' }
  | { type: 'completed'; requestId: string; providerRequestId?: string }

export interface ProviderFailure {
  code: 'authentication_failed' | 'model_not_found' | 'rate_limited' | 'insufficient_balance' | 'timeout' | 'cancelled' | 'upstream_unavailable' | 'invalid_response' | 'request_rejected'
  retryable: boolean
  httpStatus?: number
  retryAfterSeconds?: number
}

export function normalizeProviderFailure(status: number, retryAfter?: string | null): ProviderFailure {
  if (status === 401 || status === 403) return { code: 'authentication_failed', retryable: false, httpStatus: status }
  if (status === 404) return { code: 'model_not_found', retryable: false, httpStatus: status }
  if (status === 402) return { code: 'insufficient_balance', retryable: false, httpStatus: status }
  if (status === 429) return { code: 'rate_limited', retryable: true, httpStatus: status, retryAfterSeconds: retryAfter ? Number.parseInt(retryAfter, 10) || undefined : undefined }
  if (status >= 500) return { code: 'upstream_unavailable', retryable: true, httpStatus: status }
  return { code: 'request_rejected', retryable: false, httpStatus: status }
}
