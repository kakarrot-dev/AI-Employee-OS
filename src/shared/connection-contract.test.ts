import { describe, expect, it } from 'vitest'
import { FEISHU_REDIRECT_URI, FEISHU_REQUESTED_SCOPES, normalizeFeishuAppId, normalizeFeishuConnectionInput } from './connection-contract'

describe('Feishu connection contract', () => {
  it('uses the fixed loopback callback and least-privilege connection scope', () => {
    expect(FEISHU_REDIRECT_URI).toBe('http://localhost:3000/callback')
    expect(FEISHU_REQUESTED_SCOPES).toEqual(['offline_access', 'search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'])
  })

  it('normalizes valid self-built app credentials without weakening validation', () => {
    expect(normalizeFeishuAppId(' cli_example123 ')).toBe('cli_example123')
    expect(() => normalizeFeishuAppId('example123')).toThrow('feishu_app_id_invalid')
    expect(normalizeFeishuConnectionInput({ appId: ' cli_example123 ', appSecret: ' secret-example ' })).toEqual({ appId: 'cli_example123', appSecret: 'secret-example' })
    expect(() => normalizeFeishuConnectionInput({ appId: 'example123', appSecret: 'secret-example' })).toThrow('feishu_app_id_invalid')
    expect(() => normalizeFeishuConnectionInput({ appId: 'cli_example123', appSecret: 'short' })).toThrow('feishu_app_secret_invalid')
  })
})
