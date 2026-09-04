export const CONNECTION_IPC = {
  getFeishuStatus: 'connection:feishu:get-status',
  connectFeishu: 'connection:feishu:connect',
  disconnectFeishu: 'connection:feishu:disconnect'
} as const

export const FEISHU_REDIRECT_URI = 'http://localhost:3000/callback'
export const FEISHU_REQUESTED_SCOPES = ['offline_access'] as const

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
}

export interface ConnectionBridge {
  getFeishuStatus(): Promise<FeishuConnectionStatus>
  connectFeishu(input: FeishuConnectionInput): Promise<FeishuConnectionStatus>
  disconnectFeishu(): Promise<FeishuConnectionStatus>
}

export function normalizeFeishuConnectionInput(value: unknown): FeishuConnectionInput {
  const input = value as { appId?: unknown; appSecret?: unknown }
  const appId = typeof input?.appId === 'string' ? input.appId.trim() : ''
  const appSecret = typeof input?.appSecret === 'string' ? input.appSecret.trim() : ''
  if (!/^cli_[A-Za-z0-9_-]{4,124}$/.test(appId)) throw new Error('feishu_app_id_invalid')
  if (appSecret.length < 8 || appSecret.length > 512 || /[\r\n]/.test(appSecret)) throw new Error('feishu_app_secret_invalid')
  return { appId, appSecret }
}
