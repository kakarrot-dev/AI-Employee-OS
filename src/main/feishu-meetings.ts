import { createHash } from 'node:crypto'
import { FEISHU_MEETING_TOOL_IDS, MEETING_PARAMETER_NAMES, validateMeetingParameters, type FeishuMeetingToolId } from '../shared/feishu-meeting-contract'
import type { FeishuApiRequester } from './feishu-connection'

const origin = 'https://open.feishu.cn'
function resultWithEvidence(result: Record<string, unknown>): Record<string, unknown> {
  return { ...result, checkedAt: new Date().toISOString(), responseSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex') }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export async function requestFeishuMeetingTool(id: FeishuMeetingToolId, parameters: Record<string, unknown>, accessToken: string, requester: FeishuApiRequester, now = Date.now()): Promise<Record<string, unknown>> {
  const core = Object.fromEntries(MEETING_PARAMETER_NAMES[id].map((key) => [key, parameters[key]]))
  validateMeetingParameters(id, core, now)
  const write = id !== FEISHU_MEETING_TOOL_IDS.search
  const request = async (method: 'GET' | 'POST', path: string, data?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    let raw: unknown
    try { raw = await requester({ method, url: `${origin}${path}`, accessToken, data }) }
    catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (write && !/^feishu_(authorization_expired|document_forbidden|rate_limited|api_failed):?/.test(code)) throw new Error('feishu_write_result_unknown')
      throw error
    }
    const response = record(raw)
    if (response.code !== 0) {
      if (typeof response.code !== 'number') throw new Error(write ? 'feishu_write_result_unknown' : 'feishu_response_invalid')
      throw new Error(`feishu_meeting_api_failed:${response.code}`)
    }
    return record(response.data)
  }
  if (id === FEISHU_MEETING_TOOL_IDS.search) {
    const data = await request('GET', `/open-apis/search/v1/user?${new URLSearchParams({ query: String(core.query), page_size: '20' })}`)
    if (!Array.isArray(data.users)) throw new Error('feishu_response_invalid')
    const items = data.users.map(record).filter((user) => typeof user.open_id === 'string' && /^ou_[A-Za-z0-9_-]{1,128}$/.test(user.open_id) && typeof user.name === 'string').map((user) => ({ openId: user.open_id, name: user.name, departmentIds: Array.isArray(user.department_ids) ? user.department_ids.filter((value) => typeof value === 'string') : [] }))
    return resultWithEvidence({ items, hasMore: data.has_more === true, coverage: 'current_organization_only', query: core.query })
  }
  if (id === FEISHU_MEETING_TOOL_IDS.create) {
    const data = await request('POST', '/open-apis/vc/v1/reserves/apply?user_id_type=open_id', { end_time: String(Math.floor(Date.parse(String(core.endTime)) / 1000)), meeting_settings: { topic: core.topic, meeting_initial_type: 1 } })
    const reserve = record(data.reserve)
    if (typeof reserve.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reserve.id) || typeof reserve.meeting_no !== 'string' || !/^\d{9}$/.test(reserve.meeting_no) || typeof reserve.url !== 'string' || !/^https:\/\/vc\.feishu\.cn\/[^\s]+$/.test(reserve.url)) throw new Error('feishu_write_result_unknown')
    return resultWithEvidence({ ...core, recipientNames: parameters.recipientNames, reserveId: reserve.id, meetingNumber: reserve.meeting_no, meetingUrl: reserve.url, ...(typeof reserve.password === 'string' && reserve.password ? { meetingPassword: reserve.password } : {}), status: 'created', calendarEventCreated: false })
  }
  const meeting = record(parameters.meeting)
  if (meeting.reserveId !== core.reserveId || !Array.isArray(meeting.recipientIds) || !meeting.recipientIds.includes(core.recipientId) || typeof meeting.meetingNumber !== 'string' || !/^\d{9}$/.test(meeting.meetingNumber) || typeof meeting.meetingUrl !== 'string' || !/^https:\/\/vc\.feishu\.cn\/[^\s]+$/.test(meeting.meetingUrl) || typeof parameters.actionId !== 'string') throw new Error('meeting_invitation_not_bound')
  const when = (value: unknown): string => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(String(value)))
  const text = `会议邀请：${meeting.topic}\n时间：${when(meeting.startTime)} 至 ${when(meeting.endTime)}（北京时间）\n会议号：${meeting.meetingNumber}\n入会链接：${meeting.meetingUrl}${meeting.meetingPassword ? `\n会议密码：${meeting.meetingPassword}` : ''}\n此邀请未添加至日历，请按约定时间入会。`
  const data = await request('POST', '/open-apis/im/v1/messages?receive_id_type=open_id', { receive_id: core.recipientId, msg_type: 'text', content: JSON.stringify({ text }), uuid: createHash('sha256').update(parameters.actionId).digest('hex').slice(0, 32) })
  if (typeof data.message_id !== 'string' || !data.message_id) throw new Error('feishu_write_result_unknown')
  return resultWithEvidence({ reserveId: core.reserveId, recipientId: core.recipientId, recipientName: parameters.recipientName, messageId: data.message_id, status: 'sent', attendanceStatus: 'unknown', sender: 'connected_user' })
}
