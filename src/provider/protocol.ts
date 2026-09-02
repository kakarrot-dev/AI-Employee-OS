import type { ProviderEvent, ProviderRequest } from './contract'
import type { ModelDefinition, ProviderId } from './models'
import type { AllowedModelId } from './models'

export const PROVIDER_PROTOCOL_VERSION = 1 as const

export interface ProviderHealth {
  state: 'ready' | 'degraded'
  credentialStatus: Record<ProviderId, 'configured' | 'missing'>
  models: ModelDefinition[]
  checkedAt: string
}

export type ProviderCommand =
  | { schemaVersion: 1; requestId: string; type: 'health'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'credential.configure'; payload: { provider: ProviderId; credential: string } }
  | { schemaVersion: 1; requestId: string; type: 'model.verify'; payload: { provider: ProviderId; modelId: AllowedModelId; acknowledgeBilling: true } }
  | { schemaVersion: 1; requestId: string; type: 'execute'; payload: ProviderRequest }
  | { schemaVersion: 1; requestId: string; type: 'cancel'; payload: { providerRequestId: string } }

export type ProviderMessage =
  | { schemaVersion: 1; type: 'provider.ready'; health: ProviderHealth }
  | { schemaVersion: 1; type: 'provider.event'; requestId: string; event: ProviderEvent }
  | { schemaVersion: 1; type: 'provider.response'; requestId: string; ok: true; result: ProviderHealth | { accepted: true } | { cancelled: boolean } }
  | { schemaVersion: 1; type: 'provider.response'; requestId: string; ok: false; error: { code: string; retryable: boolean; httpStatus?: number } }

export function parseProviderCommand(value: unknown): ProviderCommand {
  if (!value || typeof value !== 'object') throw new Error('invalid_command')
  const command = value as Partial<ProviderCommand>
  if (command.schemaVersion !== PROVIDER_PROTOCOL_VERSION) throw new Error('unsupported_schema_version')
  if (typeof command.requestId !== 'string' || !command.requestId) throw new Error('invalid_request_id')
  if (!['health', 'credential.configure', 'model.verify', 'execute', 'cancel'].includes(String(command.type))) throw new Error('unknown_command')
  if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) throw new Error('invalid_payload')
  if (command.type === 'health' && Object.keys(command.payload).length) throw new Error('unexpected_payload')
  if (command.type === 'credential.configure') {
    const payload = command.payload as { provider?: unknown; credential?: unknown }
    if (!['deepseek', 'poe'].includes(String(payload.provider))) throw new Error('unknown_provider')
    if (typeof payload.credential !== 'string' || payload.credential.trim().length < 8 || payload.credential.length > 8192) throw new Error('credential_invalid')
  }
  if (command.type === 'model.verify') {
    const payload = command.payload as { provider?: unknown; modelId?: unknown; acknowledgeBilling?: unknown }
    if (!['deepseek', 'poe'].includes(String(payload.provider))) throw new Error('unknown_provider')
    if (typeof payload.modelId !== 'string' || payload.acknowledgeBilling !== true) throw new Error('invalid_verification_request')
  }
  if (command.type === 'execute') {
    const request = command.payload as Partial<ProviderRequest>
    if (request.requestId !== command.requestId) throw new Error('request_id_mismatch')
    if (!['deepseek', 'poe'].includes(String(request.provider))) throw new Error('unknown_provider')
    if (typeof request.modelId !== 'string' || typeof request.input !== 'string' || typeof request.stream !== 'boolean') throw new Error('invalid_provider_request')
  }
  if (command.type === 'cancel' && typeof (command.payload as { providerRequestId?: unknown }).providerRequestId !== 'string') throw new Error('invalid_cancel_request')
  return command as ProviderCommand
}
