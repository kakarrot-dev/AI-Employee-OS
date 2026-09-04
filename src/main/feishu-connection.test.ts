import { describe, expect, it, vi } from 'vitest'
import { FEISHU_REDIRECT_URI } from '../shared/connection-contract'
import { createFeishuAuthorizationUrl, createFeishuDeveloperConsoleUrl, FEISHU_AUTHORIZATION_ENDPOINT, FEISHU_KEYCHAIN_READ_TIMEOUT_MS, FEISHU_TOKEN_ENDPOINT, FeishuConnectionService, requestFeishuDocumentTool, requestFeishuToken, type AuthorizationListener, type FeishuCredentialStore } from './feishu-connection'

const grantedScopes = 'offline_access search:docs:read docx:document:readonly wiki:wiki:readonly'

class MemoryCredentialStore implements FeishuCredentialStore {
  value?: string
  async read(): Promise<string | undefined> { return this.value }
  async write(value: string): Promise<void> { this.value = value }
  async delete(): Promise<void> { this.value = undefined }
}

describe('Feishu connection service', () => {
  it('allows a bounded Keychain authorization delay before declaring the credential unavailable', () => {
    expect(FEISHU_KEYCHAIN_READ_TIMEOUT_MS).toBe(10_000)
  })

  it('builds a state-bound confidential-client authorization URL with the fixed loopback callback', () => {
    const authorization = new URL(createFeishuAuthorizationUrl({ appId: 'cli_example123', state: 'state-example' }))
    expect(`${authorization.origin}${authorization.pathname}`).toBe(FEISHU_AUTHORIZATION_ENDPOINT)
    expect(Object.fromEntries(authorization.searchParams)).toEqual({ client_id: 'cli_example123', response_type: 'code', redirect_uri: FEISHU_REDIRECT_URI, scope: grantedScopes, prompt: 'consent', state: 'state-example' })
    expect(createFeishuDeveloperConsoleUrl(' cli_example123 ')).toBe('https://open.feishu.cn/app/cli_example123/safe')
  })

  it('opens only the validated app security page used to register the redirect URL', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const service = new FeishuConnectionService(new MemoryCredentialStore(), openExternal)

    await service.openDeveloperConsole({ appId: ' cli_example123 ' })
    expect(openExternal).toHaveBeenCalledWith('https://open.feishu.cn/app/cli_example123/safe')
    await expect(service.openDeveloperConsole({ appId: 'https://example.com' })).rejects.toThrow('feishu_app_id_invalid')
  })

  it('uses the official SDK access-token service backed by the current v3 endpoint', async () => {
    expect(FEISHU_TOKEN_ENDPOINT).toBe('https://accounts.feishu.cn/oauth/v3/token')
    const retrieveByAuthorizationCode = vi.fn().mockResolvedValue({ accessToken: 'user-token', refreshToken: 'refresh-token', expiresIn: 7200, refreshTokenExpiresIn: 604800, scope: 'offline_access' })
    const createClient = vi.fn().mockReturnValue({ accessToken: { retrieveByAuthorizationCode, refresh: vi.fn() } })
    await expect(requestFeishuToken({ grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-example', code: 'authorization-code', redirect_uri: FEISHU_REDIRECT_URI }, createClient)).resolves.toMatchObject({ access_token: 'user-token', refresh_token: 'refresh-token' })
    expect(createClient).toHaveBeenCalledWith({ appId: 'cli_example123', appSecret: 'secret-example' })
    expect(retrieveByAuthorizationCode).toHaveBeenCalledWith({ code: 'authorization-code', redirectUri: FEISHU_REDIRECT_URI, codeVerifier: undefined, scope: undefined })

    const failedClient = vi.fn().mockReturnValue({ accessToken: { retrieveByAuthorizationCode: vi.fn().mockRejectedValue({ code: 20049 }), refresh: vi.fn() } })
    await expect(requestFeishuToken({ grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-example', code: 'authorization-code' }, failedClient)).rejects.toThrow('feishu_token_exchange_failed:20049:provider_20049:http_unknown')
  })

  it('classifies token failures without exposing provider response bodies or credentials', async () => {
    const tokenRequest = { grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-example', code: 'authorization-code' }
    const rejectedClient = (error: unknown) => vi.fn().mockReturnValue({ accessToken: { retrieveByAuthorizationCode: vi.fn().mockRejectedValue(error), refresh: vi.fn() } })

    await expect(requestFeishuToken(tokenRequest, rejectedClient({ statusCode: 401, code: 0, error: 'invalid_client', errorDescription: 'client_secret secret-example is invalid', config: { data: tokenRequest } }))).rejects.toThrow('feishu_token_invalid_client:provider_0:http_401')
    await expect(requestFeishuToken(tokenRequest, rejectedClient({ statusCode: 400, code: 0, error: 'invalid_grant' }))).rejects.toThrow('feishu_token_invalid_grant:provider_0:http_400')
    await expect(requestFeishuToken(tokenRequest, rejectedClient({ statusCode: 0, code: 0, error: '', errorDescription: 'connect ECONNRESET' }))).rejects.toThrow('feishu_token_network_failed')
    await expect(requestFeishuToken(tokenRequest, rejectedClient({ statusCode: 503, code: 20050, error: 'server_error' }))).rejects.toThrow('feishu_token_service_unavailable:provider_20050:http_503')

    try {
      await requestFeishuToken(tokenRequest, rejectedClient({ statusCode: 401, code: 0, error: 'invalid_client', errorDescription: 'secret-example', config: { data: tokenRequest } }))
      throw new Error('expected token exchange to fail')
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-example')
      expect((error as Error).message).not.toContain('client_secret')
    }
  })

  it('refreshes an expired user token and rotates the one-time refresh token', async () => {
    const now = Date.parse('2026-09-04T10:00:00Z')
    const store = new MemoryCredentialStore()
    store.value = JSON.stringify({ schemaVersion: 1, appId: 'cli_example123', appSecret: 'secret-example', accessToken: 'expired-token', refreshToken: 'refresh-old', expiresAt: '2026-09-04T09:00:00Z', refreshTokenExpiresAt: '2026-09-05T09:00:00Z', scopes: grantedScopes.split(' ') })
    const requestToken = vi.fn().mockResolvedValue({ access_token: 'fresh-token', refresh_token: 'refresh-new', expires_in: 7200, refresh_token_expires_in: 604800, scope: grantedScopes })
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

  it('exchanges a fresh code once through the v3 confidential-client flow', async () => {
    const store = new MemoryCredentialStore()
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const requestToken = vi.fn().mockResolvedValue({ access_token: 'user-token', refresh_token: 'refresh-token', expires_in: 7200, refresh_token_expires_in: 604800, scope: grantedScopes })
    const listener: AuthorizationListener = { waitForCode: Promise.resolve('fresh-authorization-code'), close: vi.fn(), cancel: vi.fn() }
    const service = new FeishuConnectionService(store, openExternal, requestToken, () => Date.parse('2026-09-04T10:00:00Z'), async () => listener)

    await expect(service.connect({ appId: 'cli_example123', appSecret: 'secret-example' })).resolves.toMatchObject({ state: 'connected', appId: 'cli_example123' })
    const authorizationUrl = new URL(openExternal.mock.calls[0][0])
    expect(authorizationUrl.searchParams.has('code_challenge')).toBe(false)
    expect(requestToken).toHaveBeenCalledOnce()
    expect(requestToken).toHaveBeenCalledWith({ grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-example', code: 'fresh-authorization-code', redirect_uri: FEISHU_REDIRECT_URI })
    expect(listener.close).toHaveBeenCalledOnce()
  })

  it('reuses the Keychain App Secret when reauthorizing the same app', async () => {
    const store = new MemoryCredentialStore()
    store.value = JSON.stringify({ schemaVersion: 1, appId: 'cli_example123', appSecret: 'secret-from-keychain', accessToken: 'old-token', refreshToken: 'old-refresh', expiresAt: '2026-09-04T12:00:00Z', refreshTokenExpiresAt: '2026-09-11T12:00:00Z', scopes: ['offline_access', 'search:docs:read', 'docx:document:readonly'] })
    const requestToken = vi.fn().mockResolvedValue({ access_token: 'user-token', refresh_token: 'refresh-token', expires_in: 7200, refresh_token_expires_in: 604800, scope: grantedScopes })
    const listener: AuthorizationListener = { waitForCode: Promise.resolve('fresh-authorization-code'), close: vi.fn(), cancel: vi.fn() }
    const service = new FeishuConnectionService(store, vi.fn().mockResolvedValue(undefined), requestToken, () => Date.parse('2026-09-04T10:00:00Z'), async () => listener)

    await expect(service.connect({ appId: 'cli_example123', appSecret: '' })).resolves.toMatchObject({ state: 'connected', scopes: expect.arrayContaining(['wiki:wiki:readonly']) })
    expect(requestToken).toHaveBeenCalledWith({ grant_type: 'authorization_code', client_id: 'cli_example123', client_secret: 'secret-from-keychain', code: 'fresh-authorization-code', redirect_uri: FEISHU_REDIRECT_URI })
    expect(JSON.parse(store.value!)).toMatchObject({ appSecret: 'secret-from-keychain', accessToken: 'user-token' })
  })

  it('does not accept an empty App Secret without a matching saved credential', async () => {
    const service = new FeishuConnectionService(new MemoryCredentialStore(), vi.fn(), vi.fn())
    await expect(service.connect({ appId: 'cli_example123', appSecret: '' })).rejects.toThrow('feishu_app_secret_invalid')
  })

  it('does not activate document tools when the user grant is missing a required scope', async () => {
    const store = new MemoryCredentialStore()
    const listener: AuthorizationListener = { waitForCode: Promise.resolve('fresh-authorization-code'), close: vi.fn(), cancel: vi.fn() }
    const service = new FeishuConnectionService(store, vi.fn().mockResolvedValue(undefined), vi.fn().mockResolvedValue({ access_token: 'user-token', refresh_token: 'refresh-token', expires_in: 7200, scope: 'offline_access' }), () => Date.parse('2026-09-04T10:00:00Z'), async () => listener)

    await expect(service.connect({ appId: 'cli_example123', appSecret: 'secret-example' })).rejects.toThrow('feishu_required_scopes_missing')
    expect(store.value).toBeUndefined()
  })

  it('normalizes bounded search and read results without returning the access token', async () => {
    const requester = vi.fn()
      .mockResolvedValueOnce({ code: 0, data: { docs_entities: [{ docs_token: 'legacyDocument1', docs_type: 'doc', title: '旧版文档' }, { docs_token: 'doccnDocument123', docs_type: 'docx', title: '项目周报', owner_id: 'owner-1' }], total: 2, has_more: false } })
      .mockResolvedValueOnce({ code: 0, data: { content: '已确认的项目进展。' } })

    const search = await requestFeishuDocumentTool('feishu.documents.search@feishu-documents/v1', { query: '项目周报', limit: 3 }, 'secret-access-token', requester)
    const read = await requestFeishuDocumentTool('feishu.documents.read@feishu-documents/v1', { documentId: 'doccnDocument123' }, 'secret-access-token', requester)

    expect(search).toMatchObject({ status: 'succeeded', query: '项目周报', items: [{ documentId: 'doccnDocument123', documentType: 'docx', title: '项目周报', ownerId: 'owner-1' }], responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(read).toMatchObject({ status: 'succeeded', documentId: 'doccnDocument123', content: '已确认的项目进展。', contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/), truncated: false })
    expect(JSON.stringify({ search, read })).not.toContain('secret-access-token')
    expect(requester).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: 'POST', accessToken: 'secret-access-token' }))
    expect(requester).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: 'GET', accessToken: 'secret-access-token' }))
  })

  it('enumerates accessible Wiki spaces and counts unique document resources', async () => {
    const requester = vi.fn()
      .mockResolvedValueOnce({ code: 0, data: { items: [{ space_id: 'space-1', name: '产品知识库' }], has_more: false } })
      .mockResolvedValueOnce({ code: 0, data: { items: [
        { node_token: 'node-1', obj_token: 'doc-1', obj_type: 'docx', has_child: true },
        { node_token: 'shortcut-1', obj_token: 'doc-1', obj_type: 'docx', has_child: false }
      ], has_more: false } })
      .mockResolvedValueOnce({ code: 0, data: { items: [{ node_token: 'node-2', obj_token: 'sheet-1', obj_type: 'sheet', has_child: false }], has_more: false } })

    const count = await requestFeishuDocumentTool('feishu.wiki.count@feishu-wiki/v1', { scope: 'accessible_wiki_spaces' }, 'secret-access-token', requester)

    expect(count).toMatchObject({ status: 'succeeded', coverage: 'all_accessible_wiki_spaces_excluding_my_document_library', spaceCount: 1, totalDocuments: 2, duplicateReferencesExcluded: 1, truncated: false, enumerationSha256: expect.stringMatching(/^[a-f0-9]{64}$/), responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(count.documentRefs).toHaveLength(2)
    expect(requester).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: 'GET', url: 'https://open.feishu.cn/open-apis/wiki/v2/spaces?page_size=50' }))
    expect(requester).toHaveBeenNthCalledWith(3, expect.objectContaining({ method: 'GET', url: expect.stringContaining('parent_node_token=node-1') }))
    expect(JSON.stringify(count)).not.toContain('secret-access-token')
  })

  it('reads a valid credential once for a document Tool execution', async () => {
    const now = Date.parse('2026-09-04T10:00:00Z')
    const store = new MemoryCredentialStore()
    store.value = JSON.stringify({ schemaVersion: 1, appId: 'cli_example123', appSecret: 'secret-example', accessToken: 'user-token', refreshToken: 'refresh-token', expiresAt: '2026-09-04T12:00:00Z', scopes: grantedScopes.split(' ') })
    const read = vi.spyOn(store, 'read')
    const requester = vi.fn().mockResolvedValue({ code: 0, data: { docs_entities: [], total: 0, has_more: false } })
    const service = new FeishuConnectionService(store, vi.fn(), vi.fn(), () => now, undefined, requester)

    await expect(service.executeDocumentTool('feishu.documents.search@feishu-documents/v1', { query: '知识库', limit: 10 })).resolves.toMatchObject({ status: 'succeeded', items: [], total: 0 })
    expect(read).toHaveBeenCalledOnce()
  })

  it('cancels an in-progress browser authorization and releases the listener', async () => {
    let rejectAuthorization!: (error: Error) => void
    const close = vi.fn()
    const cancel = vi.fn(() => rejectAuthorization(new Error('feishu_authorization_cancelled')))
    const listener: AuthorizationListener = {
      waitForCode: new Promise((_resolve, reject) => { rejectAuthorization = reject }),
      close,
      cancel
    }
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const service = new FeishuConnectionService(new MemoryCredentialStore(), openExternal, vi.fn(), () => Date.parse('2026-09-04T10:00:00Z'), async () => listener)
    const connection = service.connect({ appId: 'cli_example123', appSecret: 'secret-example' })
    const rejected = expect(connection).rejects.toThrow('feishu_authorization_cancelled')

    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledOnce())
    expect(service.cancelAuthorization()).toMatchObject({ state: 'not_connected', message: '已取消飞书授权' })
    await rejected
    expect(cancel).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    await expect(service.getStatus()).resolves.toMatchObject({ state: 'not_connected' })
  })
})
