import { createHash, randomBytes } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { promisify } from 'node:util'
import axios from 'axios'
import { Client } from '@larksuiteoapi/node-sdk'
import { FEISHU_DOCUMENT_SCOPES, FEISHU_DOCUMENT_TOOL_IDS, FEISHU_REDIRECT_URI, FEISHU_REQUESTED_SCOPES, normalizeFeishuAppId, normalizeFeishuConnectionInput, type FeishuConnectionInput, type FeishuConnectionStatus, type FeishuDocumentToolId } from '../shared/connection-contract'

const execFileAsync = promisify(execFile)
export const FEISHU_AUTHORIZATION_ENDPOINT = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
export const FEISHU_TOKEN_ENDPOINT = 'https://accounts.feishu.cn/oauth/v3/token'
export const FEISHU_DEVELOPER_CONSOLE_ORIGIN = 'https://open.feishu.cn'
export const FEISHU_API_ORIGIN = 'https://open.feishu.cn'
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000
const MAX_DOCUMENT_CONTENT_CHARACTERS = 64_000
const MAX_WIKI_API_REQUESTS = 300
const MAX_WIKI_DOCUMENTS = 500
export const FEISHU_KEYCHAIN_READ_TIMEOUT_MS = 10_000

interface StoredFeishuCredential {
  schemaVersion: 1
  appId: string
  appSecret: string
  accessToken: string
  refreshToken: string
  expiresAt: string
  refreshTokenExpiresAt?: string
  scopes: string[]
}

interface FeishuTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  refresh_token_expires_in?: number
  scope?: string
  token_type?: string
}

export interface FeishuCredentialStore {
  read(): Promise<string | undefined>
  write(value: string): Promise<void>
  delete(): Promise<void>
}

export type FeishuTokenRequester = (body: Record<string, string>) => Promise<FeishuTokenResponse>
export type ExternalUrlOpener = (url: string) => Promise<void>
export type FeishuApiRequester = (input: { method: 'GET' | 'POST'; url: string; accessToken: string; data?: Record<string, unknown> }) => Promise<unknown>

interface FeishuSdkClient {
  accessToken: {
    retrieveByAuthorizationCode(input: { code: string; redirectUri?: string; codeVerifier?: string; scope?: string }): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; refreshTokenExpiresIn?: number; scope?: string; tokenType?: string }>
    refresh(input: { refreshToken: string; scope?: string }): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; refreshTokenExpiresIn?: number; scope?: string; tokenType?: string }>
  }
}

type FeishuSdkClientFactory = (input: { appId: string; appSecret: string }) => FeishuSdkClient

type FeishuTokenErrorDetail = {
  code?: unknown
  error?: unknown
  statusCode?: unknown
}

const silentSdkLogger = {
  error: (..._messages: unknown[]): void => undefined,
  warn: (..._messages: unknown[]): void => undefined,
  info: (..._messages: unknown[]): void => undefined,
  debug: (..._messages: unknown[]): void => undefined,
  trace: (..._messages: unknown[]): void => undefined
}

function feishuSdkHttpInstance(): ReturnType<typeof axios.create> {
  const instance = axios.create({ timeout: 15_000, maxContentLength: 1024 * 1024, maxBodyLength: 64 * 1024 })
  instance.interceptors.response.use((response) => response.data)
  return instance
}

function checkedAt(now: () => number): string { return new Date(now()).toISOString() }

function safeErrorToken(value: unknown, fallback: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  const normalized = String(value).trim().toLowerCase()
  return /^[a-z0-9_.-]{1,64}$/.test(normalized) ? normalized : fallback
}

function feishuTokenExchangeError(error: unknown): Error {
  const detail = error as FeishuTokenErrorDetail
  const oauthError = safeErrorToken(detail?.error, 'unknown')
  const providerCode = safeErrorToken(detail?.code, 'unknown')
  const statusCode = typeof detail?.statusCode === 'number' && Number.isInteger(detail.statusCode) && detail.statusCode >= 0 && detail.statusCode <= 599
    ? String(detail.statusCode)
    : 'unknown'

  if (oauthError === 'invalid_client') return new Error(`feishu_token_invalid_client:provider_${providerCode}:http_${statusCode}`)
  if (oauthError === 'invalid_grant') return new Error(`feishu_token_invalid_grant:provider_${providerCode}:http_${statusCode}`)
  if (statusCode === '0') return new Error('feishu_token_network_failed')
  if (oauthError === 'server_error' || oauthError === 'temporarily_unavailable' || Number(statusCode) >= 500) {
    return new Error(`feishu_token_service_unavailable:provider_${providerCode}:http_${statusCode}`)
  }

  const errorCode = oauthError !== 'unknown' ? oauthError : providerCode
  return new Error(`feishu_token_exchange_failed:${errorCode}:provider_${providerCode}:http_${statusCode}`)
}

function status(state: FeishuConnectionStatus['state'], now: () => number, fields: Partial<FeishuConnectionStatus> = {}): FeishuConnectionStatus {
  return { provider: 'feishu', state, checkedAt: checkedAt(now), scopes: [], ...fields }
}

function parseCredential(value: string): StoredFeishuCredential {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('feishu_credential_invalid') }
  const candidate = parsed as Partial<StoredFeishuCredential>
  if (candidate.schemaVersion !== 1 || typeof candidate.appId !== 'string' || typeof candidate.appSecret !== 'string' || typeof candidate.accessToken !== 'string' || typeof candidate.refreshToken !== 'string' || typeof candidate.expiresAt !== 'string' || !Array.isArray(candidate.scopes) || candidate.scopes.some((scope) => typeof scope !== 'string')) throw new Error('feishu_credential_invalid')
  return candidate as StoredFeishuCredential
}

function toStoredCredential(input: FeishuConnectionInput, token: FeishuTokenResponse, now: () => number, fallbackScopes: string[] = []): StoredFeishuCredential {
  if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('feishu_token_response_invalid')
  if (!token.refresh_token) throw new Error('feishu_offline_access_missing')
  const issuedAt = now()
  return {
    schemaVersion: 1,
    appId: input.appId,
    appSecret: input.appSecret,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(issuedAt + token.expires_in * 1000).toISOString(),
    refreshTokenExpiresAt: token.refresh_token_expires_in ? new Date(issuedAt + token.refresh_token_expires_in * 1000).toISOString() : undefined,
    scopes: token.scope?.split(/\s+/).filter(Boolean) ?? [...fallbackScopes]
  }
}

function missingDocumentScopes(scopes: readonly string[]): string[] {
  const granted = new Set(scopes)
  return FEISHU_DOCUMENT_SCOPES.filter((scope) => !granted.has(scope))
}

function toCredentialStatus(credential: StoredFeishuCredential, now: () => number): FeishuConnectionStatus {
  const missing = missingDocumentScopes(credential.scopes)
  if (missing.length > 0) return status('reauthorization_required', now, { appId: credential.appId, expiresAt: credential.expiresAt, scopes: [...credential.scopes], message: `飞书文档能力缺少权限：${missing.join('、')}，请在开放平台添加权限、发布版本后重新授权` })
  return status('connected', now, { appId: credential.appId, expiresAt: credential.expiresAt, scopes: [...credential.scopes] })
}

function feishuApiFailure(error: unknown): Error {
  const detail = error as { response?: { status?: unknown; data?: { code?: unknown } }; code?: unknown }
  const statusCode = typeof detail.response?.status === 'number' ? detail.response.status : 0
  const providerCode = safeErrorToken(detail.response?.data?.code, 'unknown')
  if (statusCode === 401) return new Error('feishu_authorization_expired')
  if (statusCode === 403) return new Error('feishu_document_forbidden')
  if (statusCode === 429) return new Error('feishu_rate_limited')
  if (statusCode === 0 || Number(statusCode) >= 500) return new Error('feishu_service_unavailable')
  return new Error(`feishu_api_failed:${providerCode}:http_${statusCode}`)
}

async function defaultFeishuApiRequester(input: { method: 'GET' | 'POST'; url: string; accessToken: string; data?: Record<string, unknown> }): Promise<unknown> {
  try {
    const response = await axios.request({ method: input.method, url: input.url, headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json; charset=utf-8' }, data: input.data, timeout: 15_000, maxContentLength: 1024 * 1024, maxBodyLength: 64 * 1024 })
    return response.data
  } catch (error) {
    throw feishuApiFailure(error)
  }
}

export async function requestFeishuDocumentTool(toolVersionId: FeishuDocumentToolId, parameters: Record<string, unknown>, accessToken: string, requester: FeishuApiRequester = defaultFeishuApiRequester): Promise<Record<string, unknown>> {
  if (!accessToken) throw new Error('feishu_not_connected')
  if (toolVersionId === FEISHU_DOCUMENT_TOOL_IDS.search) {
    const query = typeof parameters.query === 'string' ? parameters.query.trim() : ''
    const limit = parameters.limit === undefined ? 5 : Number(parameters.limit)
    if (!query || query.length > 256 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10 || Object.keys(parameters).some((key) => !['query', 'limit'].includes(key))) throw new Error('invalid_tool_parameters')
    const raw = await requester({ method: 'POST', url: `${FEISHU_API_ORIGIN}/open-apis/suite/docs-api/search/object`, accessToken, data: { search_key: query, count: limit, offset: 0, docs_types: ['doc'] } })
    const response = raw as { code?: unknown; data?: { docs_entities?: unknown; has_more?: unknown; total?: unknown } }
    if (response.code !== 0 || !response.data || !Array.isArray(response.data.docs_entities)) throw new Error(`feishu_api_failed:${safeErrorToken(response.code, 'invalid_response')}`)
    const items = response.data.docs_entities.slice(0, limit).flatMap((value) => {
      if (!value || typeof value !== 'object') return []
      const item = value as Record<string, unknown>
      if (typeof item.docs_token !== 'string' || item.docs_type !== 'docx' || typeof item.title !== 'string') return []
      return [{ documentId: item.docs_token, documentType: item.docs_type, title: item.title, ...(typeof item.owner_id === 'string' ? { ownerId: item.owner_id } : {}) }]
    })
    const result = { status: 'succeeded', query, items, total: Number.isSafeInteger(response.data.total) ? response.data.total : items.length, hasMore: response.data.has_more === true, trust: 'untrusted_external_content' }
    return { ...result, responseSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex') }
  }
  if (toolVersionId === FEISHU_DOCUMENT_TOOL_IDS.read) {
    const documentId = typeof parameters.documentId === 'string' ? parameters.documentId.trim() : ''
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(documentId) || Object.keys(parameters).some((key) => key !== 'documentId')) throw new Error('invalid_tool_parameters')
    const raw = await requester({ method: 'GET', url: `${FEISHU_API_ORIGIN}/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`, accessToken })
    const response = raw as { code?: unknown; data?: { content?: unknown } }
    if (response.code !== 0 || typeof response.data?.content !== 'string') throw new Error(`feishu_api_failed:${safeErrorToken(response.code, 'invalid_response')}`)
    const content = response.data.content
    return { status: 'succeeded', documentId, content: content.slice(0, MAX_DOCUMENT_CONTENT_CHARACTERS), contentSha256: createHash('sha256').update(content).digest('hex'), originalCharacters: content.length, truncated: content.length > MAX_DOCUMENT_CONTENT_CHARACTERS, trust: 'untrusted_external_content' }
  }
  if (toolVersionId === FEISHU_DOCUMENT_TOOL_IDS.wikiCount) {
    if (parameters.scope !== 'accessible_wiki_spaces' || Object.keys(parameters).length !== 1) throw new Error('invalid_tool_parameters')
    let requestCount = 0
    const requestPage = async (path: string, query: Record<string, string | undefined>): Promise<{ items: Record<string, unknown>[]; hasMore: boolean; pageToken?: string }> => {
      requestCount += 1
      if (requestCount > MAX_WIKI_API_REQUESTS) throw new Error('feishu_wiki_enumeration_limit_exceeded')
      const url = new URL(path, FEISHU_API_ORIGIN)
      for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value)
      const raw = await requester({ method: 'GET', url: url.toString(), accessToken })
      const response = raw as { code?: unknown; data?: { items?: unknown; has_more?: unknown; page_token?: unknown } }
      if (response.code !== 0 || !Array.isArray(response.data?.items)) throw new Error(`feishu_api_failed:${safeErrorToken(response.code, 'invalid_response')}`)
      return {
        items: response.data.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)),
        hasMore: response.data.has_more === true,
        ...(typeof response.data.page_token === 'string' && response.data.page_token ? { pageToken: response.data.page_token } : {})
      }
    }
    const spaces: Array<{ spaceId: string; name?: string }> = []
    let spacePageToken: string | undefined
    const seenSpacePageTokens = new Set<string>()
    do {
      const page = await requestPage('/open-apis/wiki/v2/spaces', { page_size: '50', page_token: spacePageToken })
      for (const item of page.items) {
        if (typeof item.space_id !== 'string' || !item.space_id) continue
        spaces.push({ spaceId: item.space_id, ...(typeof item.name === 'string' ? { name: item.name } : {}) })
      }
      if (!page.hasMore) break
      if (!page.pageToken || seenSpacePageTokens.has(page.pageToken)) throw new Error('feishu_wiki_pagination_invalid')
      seenSpacePageTokens.add(page.pageToken)
      spacePageToken = page.pageToken
    } while (true)

    const globalDocumentKeys = new Set<string>()
    const documentRefs: Array<{ spaceId: string; nodeToken: string; documentType: string; documentId: string }> = []
    let duplicateReferencesExcluded = 0
    const spaceResults: Array<{ spaceId: string; name?: string; documentCount: number; enumerationSha256: string }> = []
    for (const space of spaces) {
      const parents: Array<string | undefined> = [undefined]
      const seenParents = new Set<string>()
      const spaceDocumentKeys = new Set<string>()
      const spaceRefs: string[] = []
      while (parents.length > 0) {
        const parentNodeToken = parents.shift()
        const parentKey = parentNodeToken ?? '__root__'
        if (seenParents.has(parentKey)) continue
        seenParents.add(parentKey)
        let nodePageToken: string | undefined
        const seenNodePageTokens = new Set<string>()
        do {
          const page = await requestPage(`/open-apis/wiki/v2/spaces/${encodeURIComponent(space.spaceId)}/nodes`, { page_size: '50', parent_node_token: parentNodeToken, page_token: nodePageToken })
          for (const item of page.items) {
            const nodeToken = typeof item.node_token === 'string' ? item.node_token : ''
            const documentId = typeof item.obj_token === 'string' ? item.obj_token : ''
            const documentType = typeof item.obj_type === 'string' ? item.obj_type : ''
            if (item.has_child === true && nodeToken && !seenParents.has(nodeToken)) parents.push(nodeToken)
            if (!nodeToken || !documentId || !documentType) continue
            const documentKey = `${documentType}:${documentId}`
            if (spaceDocumentKeys.has(documentKey)) {
              duplicateReferencesExcluded += 1
              continue
            }
            spaceDocumentKeys.add(documentKey)
            spaceRefs.push(`${documentKey}:${nodeToken}`)
            if (globalDocumentKeys.has(documentKey)) {
              duplicateReferencesExcluded += 1
              continue
            }
            globalDocumentKeys.add(documentKey)
            documentRefs.push({ spaceId: space.spaceId, nodeToken, documentType, documentId })
            if (documentRefs.length > MAX_WIKI_DOCUMENTS) throw new Error('feishu_wiki_enumeration_limit_exceeded')
          }
          if (!page.hasMore) break
          if (!page.pageToken || seenNodePageTokens.has(page.pageToken)) throw new Error('feishu_wiki_pagination_invalid')
          seenNodePageTokens.add(page.pageToken)
          nodePageToken = page.pageToken
        } while (true)
      }
      const sortedSpaceRefs = spaceRefs.sort()
      spaceResults.push({ ...space, documentCount: spaceDocumentKeys.size, enumerationSha256: createHash('sha256').update(JSON.stringify(sortedSpaceRefs)).digest('hex') })
    }
    const enumerationSha256 = createHash('sha256').update(JSON.stringify(documentRefs.map((item) => `${item.documentType}:${item.documentId}:${item.spaceId}:${item.nodeToken}`).sort())).digest('hex')
    const result = { status: 'succeeded', scope: 'accessible_wiki_spaces', coverage: 'all_accessible_wiki_spaces_excluding_my_document_library', spaceCount: spaces.length, totalDocuments: globalDocumentKeys.size, spaces: spaceResults, documentRefs, duplicateReferencesExcluded, enumerationSha256, requestCount, truncated: false, trust: 'untrusted_external_content' }
    return { ...result, responseSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex') }
  }
  throw new Error('unsupported_feishu_tool')
}

export function createFeishuAuthorizationUrl(input: { appId: string; state: string }): string {
  const url = new URL(FEISHU_AUTHORIZATION_ENDPOINT)
  url.search = new URLSearchParams({
    client_id: input.appId,
    response_type: 'code',
    redirect_uri: FEISHU_REDIRECT_URI,
    scope: FEISHU_REQUESTED_SCOPES.join(' '),
    prompt: 'consent',
    state: input.state
  }).toString()
  return url.toString()
}

export function createFeishuDeveloperConsoleUrl(appId: string): string {
  return `${FEISHU_DEVELOPER_CONSOLE_ORIGIN}/app/${normalizeFeishuAppId(appId)}/safe`
}

export async function requestFeishuToken(body: Record<string, string>, createClient: FeishuSdkClientFactory = ({ appId, appSecret }) => new Client({ appId, appSecret, disableTokenCache: true, logger: silentSdkLogger, httpInstance: feishuSdkHttpInstance() as never, source: 'ai-employee-os' })): Promise<FeishuTokenResponse> {
  const appId = body.client_id
  const appSecret = body.client_secret
  if (!appId || !appSecret) throw new Error('feishu_token_request_invalid')
  const client = createClient({ appId, appSecret })
  try {
    const result = body.grant_type === 'authorization_code'
      ? await client.accessToken.retrieveByAuthorizationCode({ code: body.code, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier, scope: body.scope })
      : body.grant_type === 'refresh_token'
        ? await client.accessToken.refresh({ refreshToken: body.refresh_token, scope: body.scope })
        : undefined
    if (!result || !result.accessToken || !result.expiresIn) throw new Error('feishu_token_response_invalid')
    return { access_token: result.accessToken, refresh_token: result.refreshToken, expires_in: result.expiresIn, refresh_token_expires_in: result.refreshTokenExpiresIn, scope: result.scope, token_type: result.tokenType }
  } catch (error) {
    if (error instanceof Error && error.message === 'feishu_token_response_invalid') throw error
    throw feishuTokenExchangeError(error)
  }
}

export class MacOSKeychainFeishuCredentialStore implements FeishuCredentialStore {
  constructor(private readonly helperPath: string) {}

  async read(): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(this.helperPath, ['read', 'feishu'], { encoding: 'utf8', maxBuffer: 16 * 1024, timeout: FEISHU_KEYCHAIN_READ_TIMEOUT_MS, windowsHide: true })
      return stdout.trim() || undefined
    } catch (error) {
      const detail = error as { code?: unknown; killed?: unknown }
      const exitCode = detail.code
      if (exitCode === 44) return undefined
      if (exitCode === 'ETIMEDOUT' || detail.killed === true) throw new Error('feishu_credential_timeout')
      throw new Error('feishu_credential_unavailable')
    }
  }

  async write(value: string): Promise<void> {
    if (value.length < 8 || Buffer.byteLength(value, 'utf8') > 8192) throw new Error('feishu_credential_invalid')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.helperPath, ['write', 'feishu'], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
      let stderr = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('feishu_credential_store_timeout')) }, 5000)
      child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 4096) stderr += chunk.toString('utf8') })
      child.once('error', () => { clearTimeout(timer); reject(new Error('feishu_credential_store_failed')) })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(stderr.includes('User interaction is not allowed') ? 'feishu_credential_store_denied' : 'feishu_credential_store_failed'))
      })
      child.stdin.end(value)
    })
  }

  async delete(): Promise<void> {
    try {
      await execFileAsync(this.helperPath, ['delete', 'feishu'], { encoding: 'utf8', timeout: 3000, windowsHide: true })
    } catch { throw new Error('feishu_credential_delete_failed') }
  }
}

export interface AuthorizationListener {
  waitForCode: Promise<string>
  close(): void
  cancel(): void
}

export type AuthorizationListenerFactory = (expectedState: string) => Promise<AuthorizationListener>

function callbackPage(title: string, message: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${title}</title><style>body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;background:#f4f5f2;color:#1e2420}main{max-width:440px;padding:32px;text-align:center}h1{font-size:24px}p{color:#68716b;line-height:1.6}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
}

async function listenForAuthorization(expectedState: string): Promise<AuthorizationListener> {
  let server: Server | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const close = (): void => { if (timer) clearTimeout(timer); server?.close(); server = undefined }
  const waitForCode = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
  const settle = (action: () => void): void => { if (settled) return; settled = true; close(); action() }
  server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', FEISHU_REDIRECT_URI)
    if (request.method !== 'GET' || requestUrl.pathname !== '/callback') { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    const oauthError = requestUrl.searchParams.get('error')
    const state = requestUrl.searchParams.get('state')
    const code = requestUrl.searchParams.get('code')
    if (oauthError) {
      response.writeHead(400).end(callbackPage('授权未完成', '飞书没有授予连接权限，可以关闭此页面并返回客户端重试。'))
      settle(() => rejectCode(new Error(`feishu_authorization_denied:${oauthError}`)))
      return
    }
    if (state !== expectedState) {
      response.writeHead(400).end(callbackPage('授权校验失败', '回调状态不匹配，请关闭此页面并重新发起连接。'))
      settle(() => rejectCode(new Error('feishu_oauth_state_mismatch')))
      return
    }
    if (!code || code.length > 2048) {
      response.writeHead(400).end(callbackPage('授权结果无效', '飞书没有返回有效授权码，请关闭此页面并重试。'))
      settle(() => rejectCode(new Error('feishu_authorization_code_missing')))
      return
    }
    response.writeHead(200).end(callbackPage('已收到飞书授权', 'AI Employee OS 正在完成令牌校验与本机钥匙串保存，可以关闭此页面并返回客户端。'))
    settle(() => resolveCode(code))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (): void => { server?.off('listening', onListening); reject(new Error('feishu_callback_server_unavailable')) }
      const onListening = (): void => {
        server?.off('error', onError)
        server?.once('error', () => settle(() => rejectCode(new Error('feishu_callback_server_unavailable'))))
        timer = setTimeout(() => settle(() => rejectCode(new Error('feishu_authorization_timeout'))), OAUTH_CALLBACK_TIMEOUT_MS)
        resolve()
      }
      server?.once('error', onError)
      server?.once('listening', onListening)
      server?.listen(3000, 'localhost')
    })
  } catch (error) {
    close()
    throw error
  }
  return { waitForCode, close, cancel: () => settle(() => rejectCode(new Error('feishu_authorization_cancelled'))) }
}

export class FeishuConnectionService {
  private connecting = false
  private activeListener?: AuthorizationListener

  constructor(
    private readonly store: FeishuCredentialStore,
    private readonly openExternal: ExternalUrlOpener,
    private readonly tokenRequester: FeishuTokenRequester = requestFeishuToken,
    private readonly now: () => number = Date.now,
    private readonly listenerFactory: AuthorizationListenerFactory = listenForAuthorization,
    private readonly apiRequester: FeishuApiRequester = defaultFeishuApiRequester
  ) {}

  async openDeveloperConsole(value: unknown): Promise<void> {
    const appId = normalizeFeishuAppId((value as { appId?: unknown })?.appId)
    await this.openExternal(createFeishuDeveloperConsoleUrl(appId))
  }

  async getStatus(): Promise<FeishuConnectionStatus> {
    if (this.connecting) return status('connecting', this.now, { message: '正在等待飞书授权' })
    let raw: string | undefined
    try { raw = await this.store.read() } catch { return status('error', this.now, { message: '无法读取 macOS 钥匙串中的飞书凭证' }) }
    if (!raw) return status('not_connected', this.now)
    let credential: StoredFeishuCredential
    try { credential = parseCredential(raw) } catch { return status('error', this.now, { message: '本机飞书凭证格式无效，请断开后重新连接' }) }
    if (Date.parse(credential.expiresAt) > this.now() + TOKEN_EXPIRY_SKEW_MS) return toCredentialStatus(credential, this.now)
    if (credential.refreshTokenExpiresAt && Date.parse(credential.refreshTokenExpiresAt) <= this.now()) return status('reauthorization_required', this.now, { appId: credential.appId, scopes: credential.scopes, message: '飞书授权已过期，请重新授权' })
    try {
      const token = await this.tokenRequester({ grant_type: 'refresh_token', client_id: credential.appId, client_secret: credential.appSecret, refresh_token: credential.refreshToken })
      const refreshed = toStoredCredential({ appId: credential.appId, appSecret: credential.appSecret }, token, this.now, credential.scopes)
      await this.store.write(JSON.stringify(refreshed))
      return toCredentialStatus(refreshed, this.now)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const needsAuthorization = /invalid_grant|20037|20073|offline_access/.test(message)
      return status(needsAuthorization ? 'reauthorization_required' : 'error', this.now, { appId: credential.appId, scopes: credential.scopes, message: needsAuthorization ? '飞书授权已失效，请重新授权' : '飞书令牌刷新失败，请稍后重试' })
    }
  }

  async connect(value: unknown): Promise<FeishuConnectionStatus> {
    if (this.connecting) throw new Error('feishu_connection_in_progress')
    const candidate = value as { appId?: unknown; appSecret?: unknown }
    const appId = normalizeFeishuAppId(candidate?.appId)
    const suppliedSecret = typeof candidate?.appSecret === 'string' ? candidate.appSecret.trim() : ''
    let input: FeishuConnectionInput
    if (suppliedSecret) input = normalizeFeishuConnectionInput({ appId, appSecret: suppliedSecret })
    else {
      const raw = await this.store.read()
      if (!raw) throw new Error('feishu_app_secret_invalid')
      const stored = parseCredential(raw)
      if (stored.appId !== appId) throw new Error('feishu_app_secret_invalid')
      input = { appId, appSecret: stored.appSecret }
    }
    this.connecting = true
    let listener: AuthorizationListener | undefined
    try {
      const state = randomBytes(32).toString('base64url')
      listener = await this.listenerFactory(state)
      this.activeListener = listener
      await this.openExternal(createFeishuAuthorizationUrl({ appId: input.appId, state }))
      const code = await listener.waitForCode
      const token = await this.tokenRequester({ grant_type: 'authorization_code', client_id: input.appId, client_secret: input.appSecret, code, redirect_uri: FEISHU_REDIRECT_URI })
      const credential = toStoredCredential(input, token, this.now)
      const missing = missingDocumentScopes(credential.scopes)
      if (missing.length > 0) throw new Error(`feishu_required_scopes_missing:${missing.join(',')}`)
      await this.store.write(JSON.stringify(credential))
      return toCredentialStatus(credential, this.now)
    } finally {
      if (this.activeListener === listener) this.activeListener = undefined
      listener?.close()
      this.connecting = false
    }
  }

  cancelAuthorization(): FeishuConnectionStatus {
    this.activeListener?.cancel()
    return status('not_connected', this.now, { message: this.connecting ? '已取消飞书授权' : undefined })
  }

  async disconnect(): Promise<FeishuConnectionStatus> {
    if (this.connecting) throw new Error('feishu_connection_in_progress')
    await this.store.delete()
    return status('not_connected', this.now)
  }

  async executeDocumentTool(toolVersionId: FeishuDocumentToolId, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
    let raw = await this.store.read()
    if (!raw) throw new Error('feishu_not_connected')
    let credential = parseCredential(raw)
    if (missingDocumentScopes(credential.scopes).length > 0) throw new Error('feishu_reauthorization_required')
    if (Date.parse(credential.expiresAt) <= this.now() + TOKEN_EXPIRY_SKEW_MS) {
      const connection = await this.getStatus()
      if (connection.state === 'reauthorization_required') throw new Error('feishu_reauthorization_required')
      if (connection.state !== 'connected') throw new Error('feishu_token_refresh_failed')
      raw = await this.store.read()
      if (!raw) throw new Error('feishu_not_connected')
      credential = parseCredential(raw)
    }
    return requestFeishuDocumentTool(toolVersionId, parameters, credential.accessToken, this.apiRequester)
  }
}
