import { describe, expect, it } from 'vitest'
import { normalizeCredential } from './keychain'
import { parseProviderCommand } from './protocol'

describe('provider configuration protocol', () => {
  it('accepts a bounded Poe credential without exposing it in model state', () => {
    expect(parseProviderCommand({ schemaVersion: 1, requestId: 'save-1', type: 'credential.configure', payload: { provider: 'poe', credential: 'poe-test-key' } })).toMatchObject({ type: 'credential.configure', payload: { provider: 'poe' } })
    expect(normalizeCredential('  poe-test-key  ')).toBe('poe-test-key')
    expect(() => normalizeCredential('short')).toThrow('credential_invalid')
    expect(() => normalizeCredential('poe-key\nnext')).toThrow('credential_invalid')
  })

  it('requires an explicit billing acknowledgement for a real model probe', () => {
    expect(parseProviderCommand({ schemaVersion: 1, requestId: 'verify-1', type: 'model.verify', payload: { provider: 'poe', modelId: 'gpt-image-2', acknowledgeBilling: true } })).toMatchObject({ type: 'model.verify' })
    expect(() => parseProviderCommand({ schemaVersion: 1, requestId: 'verify-2', type: 'model.verify', payload: { provider: 'poe', modelId: 'gpt-image-2', acknowledgeBilling: false } })).toThrow('invalid_verification_request')
  })
})
