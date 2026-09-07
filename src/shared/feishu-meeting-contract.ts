export const FEISHU_MEETING_SCOPES = ['vc:reserve', 'contact:user:search', 'im:message', 'im:message.send_as_user'] as const
export const FEISHU_MEETING_CAPABILITY_ID = 'capability.feishu-meetings.v2'
export const FEISHU_MEETING_TOOL_IDS = {
  search: 'feishu.contacts.search@feishu-meetings/v1',
  create: 'feishu.meetings.create@feishu-meetings/v1',
  send: 'feishu.meetings.send_invitation@feishu-meetings/v1'
} as const
export type FeishuMeetingToolId = typeof FEISHU_MEETING_TOOL_IDS[keyof typeof FEISHU_MEETING_TOOL_IDS]
export const MEETING_PARAMETER_PROPERTIES = {
  query: { type: 'string', minLength: 1, maxLength: 100 },
  topic: { type: 'string', minLength: 1, maxLength: 100 },
  startTime: { type: 'string', description: '开始时间，ISO 8601，必须含时区，例如 2026-09-08T15:00:00+08:00' },
  endTime: { type: 'string', description: '结束时间，ISO 8601，必须含时区；同时作为会议号有效期' },
  recipientIds: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', pattern: '^ou_[A-Za-z0-9_-]+$' }, description: '搜索结果中的组织内联系人；只创建会议时传空数组' },
  reserveId: { type: 'string', minLength: 1, maxLength: 128 },
  recipientId: { type: 'string', pattern: '^ou_[A-Za-z0-9_-]+$' }
}
export const MEETING_PARAMETER_NAMES: Record<FeishuMeetingToolId, string[]> = {
  [FEISHU_MEETING_TOOL_IDS.search]: ['query'],
  [FEISHU_MEETING_TOOL_IDS.create]: ['topic', 'startTime', 'endTime', 'recipientIds'],
  [FEISHU_MEETING_TOOL_IDS.send]: ['reserveId', 'recipientId']
}
export function isFeishuMeetingTool(id: string): id is FeishuMeetingToolId {
  return Object.values(FEISHU_MEETING_TOOL_IDS).includes(id as FeishuMeetingToolId)
}
export function hasFeishuMeetingCapability(ids: readonly string[]): boolean { return ids.includes(FEISHU_MEETING_CAPABILITY_ID) || ids.includes('capability.feishu-meetings.v1') }
export interface FeishuMeetingResultView {
  topic?: string
  startTime?: string
  endTime?: string
  meetingNumber?: string
  meetingUrl?: string
  meetingPassword?: string
  recipientNames?: string[]
  recipientName?: string
}
export function projectMeetingResult(id: string, result: Record<string, unknown> | undefined, verified: boolean | undefined): FeishuMeetingResultView | undefined {
  if (!isFeishuMeetingTool(id) || !result || !verified || id === FEISHU_MEETING_TOOL_IDS.search) return undefined
  const view: FeishuMeetingResultView = {}
  for (const key of ['topic', 'startTime', 'endTime', 'meetingNumber', 'meetingUrl', 'meetingPassword', 'recipientName'] as const) if (typeof result[key] === 'string') view[key] = result[key]
  if (Array.isArray(result.recipientNames)) view.recipientNames = result.recipientNames.filter((value): value is string => typeof value === 'string')
  return view
}
export function validateMeetingParameters(id: FeishuMeetingToolId, value: Record<string, unknown>, now = Date.now()): void {
  const names = MEETING_PARAMETER_NAMES[id]
  if (Object.keys(value).length !== names.length || names.some((name) => !(name in value))) throw new Error('invalid_meeting_parameters')
  const shortText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\r\n\x00-\x1f]/.test(v)
  if (id === FEISHU_MEETING_TOOL_IDS.search) {
    if (!shortText(value.query, 100)) throw new Error('invalid_meeting_parameters')
  } else if (id === FEISHU_MEETING_TOOL_IDS.create) {
    if (!shortText(value.topic, 100) || !Array.isArray(value.recipientIds) || value.recipientIds.length > 10 || new Set(value.recipientIds).size !== value.recipientIds.length || value.recipientIds.some((v) => typeof v !== 'string' || !/^ou_[A-Za-z0-9_-]{1,128}$/.test(v))) throw new Error('invalid_meeting_parameters')
    for (const time of [value.startTime, value.endTime]) {
      if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time))) throw new Error('invalid_meeting_time')
    }
    const start = Date.parse(value.startTime as string), end = Date.parse(value.endTime as string)
    if (start < now - 60_000 || end <= start || end - start > 24 * 60 * 60_000 || end > now + 30 * 24 * 60 * 60_000) throw new Error('invalid_meeting_time')
  } else if (!shortText(value.reserveId, 128) || !/^[A-Za-z0-9_-]+$/.test(value.reserveId) || typeof value.recipientId !== 'string' || !/^ou_[A-Za-z0-9_-]{1,128}$/.test(value.recipientId)) throw new Error('invalid_meeting_parameters')
}
