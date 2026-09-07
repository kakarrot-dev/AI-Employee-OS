import { describe, expect, it, vi } from 'vitest'
import { FEISHU_MEETING_SCOPES, FEISHU_MEETING_TOOL_IDS as ids } from '../shared/feishu-meeting-contract'
import { FEISHU_DOCUMENT_SCOPES } from '../shared/connection-contract'
import { FeishuConnectionService, createFeishuAuthorizationUrl, type FeishuApiRequester } from './feishu-connection'
import { requestFeishuMeetingTool } from './feishu-meetings'

const now = Date.parse('2026-09-07T01:00:00Z')
const plan = { topic: '教学研讨会', startTime: '2026-09-08T15:00:00+08:00', endTime: '2026-09-08T15:30:00+08:00', recipientIds: ['ou_teacher'], recipientNames: ['张老师'] }
const reserve = { id: 'reserve_1', meeting_no: '123456789', url: 'https://vc.feishu.cn/j/123456789', password: '1234' }

describe('Feishu meeting API', () => {
  it('keeps meeting scopes opt-in and preserves document-only connections', async () => {
    expect(new URL(createFeishuAuthorizationUrl({ appId: 'cli_test123', state: 's' })).searchParams.get('scope')).not.toContain('vc:reserve')
    const scope = new URL(createFeishuAuthorizationUrl({ appId: 'cli_test123', state: 's', enableMeetings: true })).searchParams.get('scope')!
    for (const value of FEISHU_MEETING_SCOPES) expect(scope).toContain(value)
    const store = { read: vi.fn().mockResolvedValue(JSON.stringify({ schemaVersion: 1, appId: 'cli_test123', appSecret: 'secret-example', accessToken: 'token', refreshToken: 'refresh', expiresAt: '2026-09-08T00:00:00Z', scopes: [...FEISHU_DOCUMENT_SCOPES] })), write: vi.fn(), delete: vi.fn() }
    const api = vi.fn<FeishuApiRequester>()
    const service = new FeishuConnectionService(store, vi.fn(), vi.fn(), () => now, undefined, api)
    expect((await service.getStatus()).state).toBe('connected')
    await expect(service.executeDocumentTool(ids.create, plan)).rejects.toThrow('feishu_meeting_authorization_required')
    expect(api).not.toHaveBeenCalled()
  })
  it('keeps the previous credentials when a meeting upgrade is denied or missing a scope', async () => {
    const old = JSON.stringify({ schemaVersion: 1, appId: 'cli_test123', appSecret: 'secret-example', accessToken: 'old-token', refreshToken: 'old-refresh', expiresAt: '2026-09-08T00:00:00Z', scopes: [...FEISHU_DOCUMENT_SCOPES] })
    const store = { read: vi.fn().mockResolvedValue(old), write: vi.fn(), delete: vi.fn() }
    const token = vi.fn().mockResolvedValue({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 7200, scope: FEISHU_DOCUMENT_SCOPES.join(' ') })
    const service = new FeishuConnectionService(store, vi.fn(), token, () => now, async () => ({ waitForCode: Promise.resolve('code'), close: vi.fn(), cancel: vi.fn() }))
    await expect(service.connect({ appId: 'cli_test123', enableMeetings: true })).rejects.toThrow('feishu_required_scopes_missing')
    expect(store.write).not.toHaveBeenCalled()
    expect((await service.getStatus()).state).toBe('connected')
  })
  it('searches within the organization and reports ambiguity/truncation without private contact fields', async () => {
    const api = vi.fn<FeishuApiRequester>().mockResolvedValue({ code: 0, data: { users: [{ open_id: 'ou_teacher', name: '张老师', mobile: 'private', department_ids: ['department_a'] }, { open_id: 'ou_other', name: '张老师' }], has_more: true } })
    const result = await requestFeishuMeetingTool(ids.search, { query: '张老师' }, 'token', api, now)
    expect(api.mock.calls[0][0].url).toContain('/search/v1/user?query=')
    expect(result).toMatchObject({ hasMore: true, coverage: 'current_organization_only', items: [{ openId: 'ou_teacher', name: '张老师', departmentIds: ['department_a'] }, { openId: 'ou_other', name: '张老师', departmentIds: [] }] })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('creates a real reservation and sends only the bound meeting invitation with a stable UUID', async () => {
    const api = vi.fn<FeishuApiRequester>().mockResolvedValueOnce({ code: 0, data: { reserve } }).mockResolvedValue({ code: 0, data: { message_id: 'om_message' } })
    const meeting = await requestFeishuMeetingTool(ids.create, plan, 'token', api, now)
    expect(api.mock.calls[0][0].data).toEqual({ end_time: '1788852600', meeting_settings: { topic: plan.topic, meeting_initial_type: 1 } })
    expect(meeting).toMatchObject({ reserveId: 'reserve_1', meetingNumber: '123456789', calendarEventCreated: false, recipientIds: ['ou_teacher'] })
    const parameters = { reserveId: 'reserve_1', recipientId: 'ou_teacher', recipientName: '张老师', meeting, actionId: 'action-1' }
    expect(await requestFeishuMeetingTool(ids.send, parameters, 'token', api, now)).toMatchObject({ status: 'sent', attendanceStatus: 'unknown', messageId: 'om_message' })
    await requestFeishuMeetingTool(ids.send, parameters, 'token', api, now)
    const body = api.mock.calls[1][0].data!
    expect(body.receive_id).toBe('ou_teacher')
    expect(body.uuid).toBe(api.mock.calls[2][0].data!.uuid)
    expect(JSON.parse(String(body.content)).text).toContain('会议号：123456789')
    expect(JSON.parse(String(body.content)).text).toContain('会议密码：1234')
    await expect(requestFeishuMeetingTool(ids.send, { ...parameters, recipientId: 'ou_intruder' }, 'token', api, now)).rejects.toThrow('meeting_invitation_not_bound')
  })
  it('sends invitations with the connected user access token', async () => {
    const credential = JSON.stringify({ schemaVersion: 1, appId: 'cli_test123', appSecret: 'secret-example', accessToken: 'connected-user-token', refreshToken: 'refresh', expiresAt: '2026-09-08T00:00:00Z', scopes: [...FEISHU_DOCUMENT_SCOPES, ...FEISHU_MEETING_SCOPES] })
    const api = vi.fn<FeishuApiRequester>().mockResolvedValueOnce({ code: 0, data: { reserve } }).mockResolvedValueOnce({ code: 0, data: { message_id: 'om_user_message' } })
    const service = new FeishuConnectionService({ read: vi.fn().mockResolvedValue(credential), write: vi.fn(), delete: vi.fn() }, vi.fn(), vi.fn(), () => now, undefined, api)
    const meeting = await service.executeDocumentTool(ids.create, plan)
    await service.executeDocumentTool(ids.send, { reserveId: 'reserve_1', recipientId: 'ou_teacher', meeting, actionId: 'user-send' })
    expect(api.mock.calls[1][0]).toMatchObject({ accessToken: 'connected-user-token', data: { receive_id: 'ou_teacher', msg_type: 'text' } })
  })
  it('rejects invalid time before contacting Feishu and never treats a timeout as definite failure', async () => {
    const api = vi.fn<FeishuApiRequester>()
    await expect(requestFeishuMeetingTool(ids.create, { ...plan, startTime: '2026-09-08T15:00:00' }, 'token', api, now)).rejects.toThrow('invalid_meeting_time')
    await expect(requestFeishuMeetingTool(ids.create, { ...plan, endTime: plan.startTime }, 'token', api, now)).rejects.toThrow('invalid_meeting_time')
    expect(api).not.toHaveBeenCalled()
    api.mockRejectedValueOnce(new Error('feishu_service_unavailable'))
    await expect(requestFeishuMeetingTool(ids.create, plan, 'token', api, now)).rejects.toThrow('feishu_write_result_unknown')
    api.mockResolvedValueOnce({ code: 0, data: {} })
    await expect(requestFeishuMeetingTool(ids.create, plan, 'token', api, now)).rejects.toThrow('feishu_write_result_unknown')
    api.mockResolvedValueOnce({ code: 230013 })
    await expect(requestFeishuMeetingTool(ids.create, plan, 'token', api, now)).rejects.toThrow('feishu_meeting_api_failed:230013')
  })
})
