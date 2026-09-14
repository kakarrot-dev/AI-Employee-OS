export const TEAMS_TOOL_IDS = { search: 'teams.contacts.search@teams/v1', create: 'teams.meetings.create@teams/v1', addAttendees: 'teams.meetings.add-attendees@teams/v1' } as const
export type TeamsToolId = typeof TEAMS_TOOL_IDS[keyof typeof TEAMS_TOOL_IDS]
export const TEAMS_CAPABILITY_ID = 'capability.teams-meetings.v2'
export const TEAMS_IPC = { status: 'connection:teams:status', connect: 'connection:teams:connect', disconnect: 'connection:teams:disconnect', sendCards: 'connection:teams:send-cards' } as const
export interface TeamsConnectionInput { tenantId: string; clientId: string; clientSecret: string; organizer: string }
export interface TeamsConnectionStatus { provider: 'teams'; state: 'not_connected' | 'connected' | 'error'; checkedAt: string; organizer?: string; tenantId?: string; clientId?: string; canSearch: boolean; canCreate: boolean; message?: string }
export const EMPTY_TEAMS_STATUS: TeamsConnectionStatus = { provider: 'teams', state: 'not_connected', checkedAt: '', canSearch: false, canCreate: false }
export const TEAMS_PARAMETER_PROPERTIES = {
  calendarEventId: { type: 'string', minLength: 1, maxLength: 2048, description: '本事项已成功创建的 Teams 日历会议 ID，必须复用原会议' },
  query: { type: 'string', minLength: 1, maxLength: 100, description: '企业通讯录中的完整姓名；重名时请用户选择' },
  topic: { type: 'string', minLength: 1, maxLength: 100 },
  startTime: { type: 'string', description: 'ISO 8601 时间，必须含时区' },
  endTime: { type: 'string', description: 'ISO 8601 时间，必须含时区' },
  attendeeIds: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string' }, description: '本任务 Teams 通讯录查询返回的用户 ID；无参会人时传空数组' }
}
export const TEAMS_PARAMETER_NAMES: Record<TeamsToolId, string[]> = { [TEAMS_TOOL_IDS.search]: ['query'], [TEAMS_TOOL_IDS.addAttendees]: ['calendarEventId', 'attendeeIds'], [TEAMS_TOOL_IDS.create]: ['topic', 'startTime', 'endTime', 'attendeeIds'] }
export function isTeamsTool(id: string): id is TeamsToolId { return Object.values(TEAMS_TOOL_IDS).includes(id as TeamsToolId) }
export function hasTeamsCapability(ids: readonly string[]): boolean { return ids.includes(TEAMS_CAPABILITY_ID) || ids.includes('capability.teams-meetings.v1') }
export function normalizeTeamsInput(value: unknown): TeamsConnectionInput {
  const input = value as TeamsConnectionInput
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!input || !guid.test(input.tenantId) || !guid.test(input.clientId) || typeof input.clientSecret !== 'string' || input.clientSecret.length < 8 || input.clientSecret.length > 512 || /[\r\n]/.test(input.clientSecret) || typeof input.organizer !== 'string' || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(input.organizer) || input.organizer.length > 254) throw new Error('teams_configuration_invalid')
  return { tenantId: input.tenantId, clientId: input.clientId, clientSecret: input.clientSecret, organizer: input.organizer }
}
export function validateTeamsParameters(id: TeamsToolId, value: Record<string, unknown>, now = Date.now()): void {
  const keys = TEAMS_PARAMETER_NAMES[id]
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) throw new Error('invalid_teams_parameters')
  if (id === TEAMS_TOOL_IDS.addAttendees) {
    if (typeof value.calendarEventId !== 'string' || !/^[A-Za-z0-9_+=\/-]{1,2048}$/.test(value.calendarEventId) || !Array.isArray(value.attendeeIds) || !value.attendeeIds.length || value.attendeeIds.length > 10 || new Set(value.attendeeIds).size !== value.attendeeIds.length || value.attendeeIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('invalid_teams_parameters')
    return
  }
  const text = id === TEAMS_TOOL_IDS.search ? value.query : value.topic
  if (typeof text !== 'string' || !text.trim() || text.length > 100 || /[\x00-\x1f]/.test(text)) throw new Error('invalid_teams_parameters')
  if (id === TEAMS_TOOL_IDS.search) return
  if (!Array.isArray(value.attendeeIds) || value.attendeeIds.length > 10 || new Set(value.attendeeIds).size !== value.attendeeIds.length || value.attendeeIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('invalid_teams_parameters')
  for (const t of [value.startTime, value.endTime]) if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(t) || !Number.isFinite(Date.parse(t))) throw new Error('invalid_meeting_time')
  const start = Date.parse(value.startTime as string), end = Date.parse(value.endTime as string)
  if (start < now || end <= start || end - start > 86400000 || start > now + 365 * 86400000) throw new Error('invalid_meeting_time')
}

export type TeamsParticipantConfirmationState = 'not_sent' | 'sending' | 'awaiting_confirmation' | 'confirmed' | 'declined' | 'delivery_unknown'
export interface TeamsParticipantConfirmation {
  userId: string
  name: string
  email: string
  state: TeamsParticipantConfirmationState
  respondedAt?: string
}
export interface TeamsMeetingConfirmation {
  calendarEventId: string
  policy: 'teams_card'
  participants: TeamsParticipantConfirmation[]
  confirmedCount: number
  allConfirmed: boolean
  updatedAt: string
}
