import { FEISHU_MEETING_TOOL_IDS, type FeishuMeetingToolId } from './feishu-meeting-contract'

export const CONNECTION_IPC = {
  getFeishuStatus: 'connection:feishu:get-status',
  openFeishuDeveloperConsole: 'connection:feishu:open-developer-console',
  connectFeishu: 'connection:feishu:connect',
  cancelFeishuAuthorization: 'connection:feishu:cancel-authorization',
  disconnectFeishu: 'connection:feishu:disconnect'
} as const

export const FEISHU_REDIRECT_URI = 'http://localhost:3000/callback'
export const FEISHU_DOCUMENT_SCOPES = ['search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'] as const
export const FEISHU_REQUESTED_SCOPES = ['offline_access', ...FEISHU_DOCUMENT_SCOPES] as const

export const FEISHU_DOCUMENT_TOOL_IDS = {
  search: 'feishu.documents.search@feishu-documents/v1',
  read: 'feishu.documents.read@feishu-documents/v1',
  wikiCount: 'feishu.wiki.count@feishu-wiki/v1'
} as const

export type FeishuDocumentToolId = typeof FEISHU_DOCUMENT_TOOL_IDS[keyof typeof FEISHU_DOCUMENT_TOOL_IDS]
export type FeishuToolId = FeishuDocumentToolId | FeishuMeetingToolId
export const FEISHU_TOOL_IDS: Record<string, FeishuToolId> = { ...FEISHU_DOCUMENT_TOOL_IDS, ...Object.fromEntries(Object.entries(FEISHU_MEETING_TOOL_IDS).map(([key, value]) => [`meeting_${key}`, value])) }

export type FeishuConnectionState = 'not_connected' | 'connecting' | 'connected' | 'reauthorization_required' | 'error'

export interface FeishuConnectionStatus {
  provider: 'feishu'
  state: FeishuConnectionState
  checkedAt: string
  appId?: string
  expiresAt?: string
  scopes: string[]
  message?: string
}

export interface FeishuConnectionInput {
  appId: string
  appSecret: string
  enableMeetings?: boolean
}

export interface ConnectionBridge {
  getFeishuStatus(): Promise<FeishuConnectionStatus>
  openFeishuDeveloperConsole(appId: string): Promise<void>
  connectFeishu(input: FeishuConnectionInput): Promise<FeishuConnectionStatus>
  cancelFeishuAuthorization(): Promise<FeishuConnectionStatus>
  disconnectFeishu(): Promise<FeishuConnectionStatus>
}

export function normalizeFeishuAppId(value: unknown): string {
  const appId = typeof value === 'string' ? value.trim() : ''
  if (!/^cli_[A-Za-z0-9_-]{4,124}$/.test(appId)) throw new Error('feishu_app_id_invalid')
  return appId
}

export function normalizeFeishuConnectionInput(value: unknown): FeishuConnectionInput {
  const input = value as { appId?: unknown; appSecret?: unknown }
  const appId = normalizeFeishuAppId(input?.appId)
  const appSecret = typeof input?.appSecret === 'string' ? input.appSecret.trim() : ''
  if (appSecret.length < 8 || appSecret.length > 512 || /[\r\n]/.test(appSecret)) throw new Error('feishu_app_secret_invalid')
  return { appId, appSecret }
}
