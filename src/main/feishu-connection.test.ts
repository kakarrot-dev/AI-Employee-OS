import { describe, expect, it, vi } from 'vitest'
import { FEISHU_REDIRECT_URI } from '../shared/connection-contract'
import { createFeishuAuthorizationUrl, FEISHU_AUTHORIZATION_ENDPOINT, FEISHU_TOKEN_ENDPOINT, FeishuConnectionService, requestFeishuToken, type FeishuCredentialStore } from './feishu-connection'

class MemoryCredentialStore implements FeishuCredentialStore {
  value?: string
  async read(): Promise<string | undefined> { return this.value }
  async write(value: string): Promise<void> { this.value = value }
  async delete(): Promise<void> { this.value = undefined }
}

describe('Feishu connection service', () => {
  it('builds a state-bound PKCE authorization URL with the fixed loopback callback', () => {
    const authorization = new URL(createFeishuAuthorizationUrl({ appId: 'cli_example123', state: 'state-example', codeChallenge: 'challenge-example' }))
    expect(`${authorization.origin}${authorization.pathname}`).toBe(FEISHU_AUTHORIZATION_ENDPOINT)
    expect(Object.fromEntries(authorization.searchParams)).toMatchObject({ client_id: 'cli_example123', response_type: 'code', redirect_uri: FEISHU_REDIRECT_URI, scope: 'offline_access', state: 'state-example', code_challenge: 'challenge-example', code_challenge_method: 'S256' })
  })

  it('uses the official SDK access-token service backed by the current v3 endpoint', async () => {
    expect(FEISHU_TOKEN_ENDPOINT).toBe('https://accounts.feishu.cn/oauth/v3/token')
    const retrieveByAuthorizationCode = vi.fn().mockResolvedValue({ accessToken: 'user-token', refreshToken: 'refresh-token', expiresIn: 7200, refreshTokenExpiresIn: 604800, scope: 'offline_access' })
    const createClient = vi.fn().mockReturnValue({ accessToken: { retrieveByAuthorizationCode, refresh: vi.fn() } })
    await expect(requestFeishuToken({ grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-example', code: 'authorization-code', redirect_uri: FEISHU_REDIRECT_URI, code_verifier: 'verifier' }, createClient)).resolves.toMatchObject({ access_token: 'user-token', refresh_token: 'refresh-token' })
    expect(createClient).toHaveBeenCalledWith({ appId: 'cli_example123', appSecret: 'secret-example' })
    expect(retrieveByAuthorizationCode).toHaveBeenCalledWith({ code: 'authorization-code', redirectUri: FEISHU_REDIRECT_URI, codeVerifier: 'verifier', scope: undefined })

    const failedClient = vi.fn().mockReturnValue({ accessToken: { retrieveByAuthorizationCode: vi.fn().mockRejectedValue({ code: 20049 }), refresh: vi.fn() } })
    await expect(requestFeishuToken({ grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-example', code: 'authorization-code' }, failedClient)).rejects.toThrow('feishu_token_exchange_failed:20049')
  })

  it('refreshes an expired user token and rotates the one-time refresh token', async () => {
    const now = Date.parse('2026-09-04T10:00:00Z')
    const store = new MemoryCredentialStore()
    store.value = JSON.stringify({ schemaVersion: 1, appId: 'cli_example123', appSecret: 'secret-example', accessToken: 'expired-token', refreshToken: 'refresh-old', expiresAt: '2026-09-04T09:00:00Z', refreshTokenExpiresAt: '2026-09-05T09:00:00Z', scopes: ['offline_access'] })
    const requestToken = vi.fn().mockResolvedValue({ access_token: 'fresh-token', refresh_token: 'refresh-new', expires_in: 7200, refresh_token_expires_in: 604800, scope: 'offline_access' })
    const service = new FeishuConnectionService(store, vi.fn(), requestToken, () => now)

    await expect(service.getStatus()).resolves.toMatchObject({ state: 'connected', appId: 'cli_example123', expiresAt: '2026-09-04T12:00:00.000Z' })
    expect(requestToken).toHaveBeenCalledWith({ grant_type: 'refresh_token', client_id: 'cli_example123', client_secret: 'secret-example', refresh_token: 'refresh-old' })
    expect(JSON.parse(store.value!)).toMatchObject({ accessToken: 'fresh-token', refreshToken: 'refresh-new' })
  })

  it('returns an actionable state when authorization expired and deletes credentials on disconnect', async () => {
    const store = new MemoryCredentialStore()
    store.value = JSON.stringify({ schemaVersion: 1, appId: 'cli_example123', appSecret: 'secret-example', accessToken: 'expired-token', refreshToken: 'refresh-old', expiresAt: '2026-09-04T09:00:00Z', refreshTokenExpiresAt: '2026-09-04T09:30:00Z', scopes: ['offline_access'] })
    const service = new FeishuConnectionService(store, vi.fn(), vi.fn(), () => Date.parse('2026-09-04T10:00:00Z'))

    await expect(service.getStatus()).resolves.toMatchObject({ state: 'reauthorization_required', appId: 'cli_example123' })
    await expect(service.disconnect()).resolves.toMatchObject({ state: 'not_connected' })
    expect(store.value).toBeUndefined()
  })
})
