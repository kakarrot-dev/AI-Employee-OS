import axios from 'axios'
import { createHash } from 'node:crypto'
import { EMPTY_TEAMS_STATUS, TEAMS_TOOL_IDS, normalizeTeamsInput, validateTeamsParameters, type TeamsConnectionStatus, type TeamsConnectionInput, type TeamsToolId } from '../shared/teams-contract'
import type { TeamsCredentialStore } from './teams-credential-store'

export type TeamsRequest = (method: 'GET' | 'POST' | 'PATCH', url: string, data?: unknown, token?: string, extraHeaders?: Record<string, string>) => Promise<Record<string, any>>
// Fixed Microsoft endpoints, no provider response body or credentials in errors.
export const teamsRequest: TeamsRequest = async (method, url, data, token, extraHeaders) => {
  try {
    return (await axios.request({ method, url, data, headers: token ? { Authorization: `Bearer ${token}`, ...extraHeaders } : { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000, maxRedirects: 0, maxContentLength: 1024 * 1024, maxBodyLength: 64 * 1024 })).data
  } catch (error) {
    const code = (error as { response?: { status: number } }).response?.status
    if (method !== 'GET' && token && (!code || code >= 500)) throw new Error('teams_write_result_unknown')
    throw new Error(code === 401 ? 'teams_authorization_expired' : code === 403 ? 'teams_permission_denied' : code === 429 ? 'teams_rate_limited' : 'teams_request_failed')
  }
}
export class TeamsConnectionService {
  private token?: { value: string; expires: number; key: string; roles: string[] }
  constructor(private readonly store: TeamsCredentialStore, private readonly request: TeamsRequest = teamsRequest) {}
  private async credential(): Promise<TeamsConnectionInput> {
    const raw = await this.store.read()
    if (!raw) throw new Error('teams_not_connected')
    try { return normalizeTeamsInput(JSON.parse(raw)) } catch { throw new Error('teams_configuration_invalid') }
  }
  private async authorize(input: TeamsConnectionInput): Promise<{ value: string; roles: string[] }> {
    const key = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    if (this.token?.key === key && this.token.expires > Date.now() + 60_000) return this.token
    const body = new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString()
    const result = await this.request('POST', `https://login.microsoftonline.com/${input.tenantId}/oauth2/v2.0/token`, body)
    if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error('teams_token_invalid')
    let roles: string[] = []
    try { const payload = JSON.parse(Buffer.from(result.access_token.split('.')[1], 'base64url').toString()); roles = Array.isArray(payload.roles) ? payload.roles.filter((v: unknown) => typeof v === 'string') : [] } catch { throw new Error('teams_token_invalid') }
    this.token = { key, value: result.access_token, expires: Date.now() + result.expires_in * 1000, roles }
    return this.token
  }
  private async check(input: TeamsConnectionInput): Promise<TeamsConnectionStatus> {
    const token = await this.authorize(input)
    await this.request('GET', 'https://graph.microsoft.com/v1.0/users?$top=1&$select=id', undefined, token.value)
    const calendar = await this.request('GET', `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.organizer)}/calendar?$select=allowedOnlineMeetingProviders`, undefined, token.value)
    const canCreate = token.roles.includes('Calendars.ReadWrite') && Array.isArray(calendar.allowedOnlineMeetingProviders) && calendar.allowedOnlineMeetingProviders.includes('teamsForBusiness')
    return { provider: 'teams', state: 'connected', checkedAt: new Date().toISOString(), tenantId: input.tenantId, clientId: input.clientId, organizer: input.organizer, canSearch: true, canCreate, ...(!canCreate ? { message: '通讯录可用；创建会议需要 Calendars.ReadWrite 应用权限及支持 Teams 的组织者日历。' } : {}) }
  }
  async getStatus(): Promise<TeamsConnectionStatus> {
    try { return await this.check(await this.credential()) } catch (error) {
      if (error instanceof Error && error.message === 'teams_not_connected') return { ...EMPTY_TEAMS_STATUS, checkedAt: new Date().toISOString() }
      return { ...EMPTY_TEAMS_STATUS, state: 'error', checkedAt: new Date().toISOString(), message: error instanceof Error ? error.message : 'teams_request_failed' }
    }
  }
  async connect(value: unknown): Promise<TeamsConnectionStatus> {
    const input = normalizeTeamsInput(value)
    const status = await this.check(input)
    await this.store.write(JSON.stringify(input))
    return status
  }
  async disconnect(): Promise<TeamsConnectionStatus> { await this.store.delete(); this.token = undefined; return { ...EMPTY_TEAMS_STATUS, checkedAt: new Date().toISOString() } }
  async execute(id: TeamsToolId, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
    const publicParameters = Object.fromEntries(Object.entries(parameters).filter(([key]) => !['actionId', 'attendeeNames', 'attendeeEmails', 'meeting'].includes(key)))
    validateTeamsParameters(id, publicParameters)
    const input = await this.credential(), token = await this.authorize(input)
    const graph = (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, headers?: Record<string, string>): Promise<Record<string, any>> => this.request(method, `https://graph.microsoft.com/v1.0${path}`, body, token.value, headers)
    if (id === TEAMS_TOOL_IDS.search) {
      const query = (parameters.query as string).trim()
      const escaped = query.replaceAll("'", "''")
      const filter = query.includes('@') ? `mail eq '${escaped}' or userPrincipalName eq '${escaped}'` : `displayName eq '${escaped}'`
      const response = await graph('GET', `/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName,accountEnabled&$top=100`)
      if (!Array.isArray(response.value) || response['@odata.nextLink']) throw new Error('teams_directory_result_incomplete')
      const items = response.value.filter((user: any) => user.accountEnabled !== false && typeof user.id === 'string' && (user.mail || user.userPrincipalName)).map((user: any) => ({ id: user.id, name: user.displayName, email: user.mail || user.userPrincipalName }))
      return this.receipt({ query, items, match: items.length === 1 ? 'unique' : items.length ? 'ambiguous' : 'not_found', trust: 'untrusted_external_content' })
    }
    if (![TEAMS_TOOL_IDS.create, TEAMS_TOOL_IDS.addAttendees].includes(id as typeof TEAMS_TOOL_IDS.create) || typeof parameters.actionId !== 'string' || !parameters.actionId) throw new Error('invalid_teams_action')
    if (!token.roles.includes('Calendars.ReadWrite')) throw new Error('teams_permission_denied')
    const attendees = []
    for (const id of parameters.attendeeIds as string[]) {
      const user = await graph('GET', `/users/${encodeURIComponent(id)}?$select=id,displayName,mail,userPrincipalName,accountEnabled`)
      const address = user.mail || user.userPrincipalName
      if (user.accountEnabled === false || typeof address !== 'string' || !address.includes('@')) throw new Error('teams_attendee_invalid')
      attendees.push({ emailAddress: { address, name: user.displayName }, type: 'required' })
    }
    if (id === TEAMS_TOOL_IDS.addAttendees) {
      const eventId = parameters.calendarEventId as string
      const path = `/users/${encodeURIComponent(input.organizer)}/events/${encodeURIComponent(eventId)}`
      const existing = await graph('GET', path)
      if (existing.id !== eventId || existing.isCancelled || existing.isOrganizer !== true || !Array.isArray(existing.attendees) || typeof existing['@odata.etag'] !== 'string' || typeof existing.onlineMeeting?.joinUrl !== 'string') throw new Error('teams_event_not_editable')
      const address = (item: any): string => typeof item?.emailAddress?.address === 'string' ? item.emailAddress.address.toLowerCase() : ''
      if (existing.attendees.some((item: any) => !address(item))) throw new Error('teams_event_not_editable')
      const additions = attendees.filter(item => !existing.attendees.some((old: any) => address(old) === address(item)))
      let verified = existing
      if (additions.length) {
        // Preserve every existing participant and all other event properties. ETag prevents lost updates.
        await graph('PATCH', path, { attendees: [...existing.attendees.map((item: any) => ({ emailAddress: item.emailAddress, type: item.type })), ...additions] }, { 'If-Match': existing['@odata.etag'] })
        try { verified = await graph('GET', path) } catch { throw new Error('teams_write_result_unknown') }
        if (verified.id !== eventId || !Array.isArray(verified.attendees) || [...existing.attendees, ...attendees].some(item => !verified.attendees.some((actual: any) => address(actual) === address(item))) || verified.onlineMeeting?.joinUrl !== existing.onlineMeeting.joinUrl) throw new Error('teams_write_result_unknown')
      }
      return this.receipt({ calendarEventId: eventId, meetingUrl: existing.onlineMeeting.joinUrl, topic: existing.subject, startTime: existing.start?.dateTime ? `${existing.start.dateTime}Z` : undefined, endTime: existing.end?.dateTime ? `${existing.end.dateTime}Z` : undefined, organizer: input.organizer, tenantId: input.tenantId, attendeeIds: parameters.attendeeIds, attendeeNames: attendees.map(item => item.emailAddress.name), attendeeEmails: attendees.map(item => item.emailAddress.address), allAttendeeNames: verified.attendees.map((item: any) => item.emailAddress.name || item.emailAddress.address), invitations: additions.length ? 'submitted' : 'already_present', status: 'succeeded' })
    }
    const response = await graph('POST', `/users/${encodeURIComponent(input.organizer)}/events`, { subject: parameters.topic, start: { dateTime: new Date(parameters.startTime as string).toISOString(), timeZone: 'UTC' }, end: { dateTime: new Date(parameters.endTime as string).toISOString(), timeZone: 'UTC' }, attendees, isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', transactionId: parameters.actionId })
    if (typeof response.id !== 'string' || typeof response.onlineMeeting?.joinUrl !== 'string' || !/^https:\/\/teams\.microsoft\.com\//.test(response.onlineMeeting.joinUrl)) throw new Error('teams_write_result_unknown')
    return this.receipt({ topic: parameters.topic, startTime: parameters.startTime, endTime: parameters.endTime, attendeeIds: parameters.attendeeIds, attendeeNames: attendees.map(v => v.emailAddress.name), attendeeEmails: attendees.map(v => v.emailAddress.address), calendarEventId: response.id, meetingUrl: response.onlineMeeting.joinUrl, organizer: input.organizer, tenantId: input.tenantId, invitations: 'submitted', status: 'succeeded' })
  }
  private receipt(result: Record<string, unknown>): Record<string, unknown> { return { ...result, responseSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex') } }
}
