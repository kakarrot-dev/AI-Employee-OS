import { createHash, randomBytes } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { promisify } from 'node:util'
import axios from 'axios'
import { Client } from '@larksuiteoapi/node-sdk'
import { FEISHU_REDIRECT_URI, FEISHU_REQUESTED_SCOPES, normalizeFeishuConnectionInput, type FeishuConnectionInput, type FeishuConnectionStatus } from '../shared/connection-contract'

const execFileAsync = promisify(execFile)
export const FEISHU_AUTHORIZATION_ENDPOINT = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
export const FEISHU_TOKEN_ENDPOINT = 'https://accounts.feishu.cn/oauth/v3/token'
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000

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

interface FeishuSdkClient {
  accessToken: {
    retrieveByAuthorizationCode(input: { code: string; redirectUri?: string; codeVerifier?: string; scope?: string }): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; refreshTokenExpiresIn?: number; scope?: string; tokenType?: string }>
    refresh(input: { refreshToken: string; scope?: string }): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; refreshTokenExpiresIn?: number; scope?: string; tokenType?: string }>
  }
}

type FeishuSdkClientFactory = (input: { appId: string; appSecret: string }) => FeishuSdkClient

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

function toStoredCredential(input: FeishuConnectionInput, token: FeishuTokenResponse, now: () => number): StoredFeishuCredential {
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
    scopes: token.scope?.split(/\s+/).filter(Boolean) ?? []
  }
}

function toConnectedStatus(credential: StoredFeishuCredential, now: () => number): FeishuConnectionStatus {
  return status('connected', now, { appId: credential.appId, expiresAt: credential.expiresAt, scopes: [...credential.scopes] })
}

export function createFeishuAuthorizationUrl(input: { appId: string; state: string; codeChallenge: string }): string {
  const url = new URL(FEISHU_AUTHORIZATION_ENDPOINT)
  url.search = new URLSearchParams({
    client_id: input.appId,
    response_type: 'code',
    redirect_uri: FEISHU_REDIRECT_URI,
    scope: FEISHU_REQUESTED_SCOPES.join(' '),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256'
  }).toString()
  return url.toString()
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
    const detail = error as { code?: unknown; error?: unknown; statusCode?: unknown }
    const code = typeof detail.error === 'string' && detail.error ? detail.error : typeof detail.code === 'number' || typeof detail.code === 'string' ? String(detail.code) : typeof detail.statusCode === 'number' ? String(detail.statusCode) : 'unknown'
    throw new Error(`feishu_token_exchange_failed:${code}`)
  }
}

export class MacOSKeychainFeishuCredentialStore implements FeishuCredentialStore {
  constructor(private readonly helperPath: string) {}

  async read(): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(this.helperPath, ['read', 'feishu'], { encoding: 'utf8', maxBuffer: 16 * 1024, timeout: 3000, windowsHide: true })
      return stdout.trim() || undefined
    } catch (error) {
      const exitCode = (error as { code?: unknown }).code
      if (exitCode === 44) return undefined
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

interface AuthorizationListener {
  waitForCode: Promise<string>
  close(): void
}

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
  return { waitForCode, close }
}

export class FeishuConnectionService {
  private connecting = false

  constructor(
    private readonly store: FeishuCredentialStore,
    private readonly openExternal: ExternalUrlOpener,
    private readonly tokenRequester: FeishuTokenRequester = requestFeishuToken,
    private readonly now: () => number = Date.now
  ) {}

  async getStatus(): Promise<FeishuConnectionStatus> {
    if (this.connecting) return status('connecting', this.now, { message: '正在等待飞书授权' })
    let raw: string | undefined
    try { raw = await this.store.read() } catch { return status('error', this.now, { message: '无法读取 macOS 钥匙串中的飞书凭证' }) }
    if (!raw) return status('not_connected', this.now)
    let credential: StoredFeishuCredential
    try { credential = parseCredential(raw) } catch { return status('error', this.now, { message: '本机飞书凭证格式无效，请断开后重新连接' }) }
    if (Date.parse(credential.expiresAt) > this.now() + TOKEN_EXPIRY_SKEW_MS) return toConnectedStatus(credential, this.now)
    if (credential.refreshTokenExpiresAt && Date.parse(credential.refreshTokenExpiresAt) <= this.now()) return status('reauthorization_required', this.now, { appId: credential.appId, scopes: credential.scopes, message: '飞书授权已过期，请重新授权' })
    try {
      const token = await this.tokenRequester({ grant_type: 'refresh_token', client_id: credential.appId, client_secret: credential.appSecret, refresh_token: credential.refreshToken })
      const refreshed = toStoredCredential({ appId: credential.appId, appSecret: credential.appSecret }, token, this.now)
      await this.store.write(JSON.stringify(refreshed))
      return toConnectedStatus(refreshed, this.now)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const needsAuthorization = /invalid_grant|20037|20073|offline_access/.test(message)
      return status(needsAuthorization ? 'reauthorization_required' : 'error', this.now, { appId: credential.appId, scopes: credential.scopes, message: needsAuthorization ? '飞书授权已失效，请重新授权' : '飞书令牌刷新失败，请稍后重试' })
    }
  }

  async connect(value: unknown): Promise<FeishuConnectionStatus> {
    if (this.connecting) throw new Error('feishu_connection_in_progress')
    const input = normalizeFeishuConnectionInput(value)
    this.connecting = true
    let listener: AuthorizationListener | undefined
    try {
      const state = randomBytes(32).toString('base64url')
      const codeVerifier = randomBytes(64).toString('base64url')
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      listener = await listenForAuthorization(state)
      await this.openExternal(createFeishuAuthorizationUrl({ appId: input.appId, state, codeChallenge }))
      const code = await listener.waitForCode
      const token = await this.tokenRequester({ grant_type: 'authorization_code', client_id: input.appId, client_secret: input.appSecret, code, redirect_uri: FEISHU_REDIRECT_URI, code_verifier: codeVerifier })
      const credential = toStoredCredential(input, token, this.now)
      await this.store.write(JSON.stringify(credential))
      return toConnectedStatus(credential, this.now)
    } finally {
      listener?.close()
      this.connecting = false
    }
  }

  async disconnect(): Promise<FeishuConnectionStatus> {
    if (this.connecting) throw new Error('feishu_connection_in_progress')
    await this.store.delete()
    return status('not_connected', this.now)
  }
}
