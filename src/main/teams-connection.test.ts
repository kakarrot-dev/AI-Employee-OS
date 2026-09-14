import { describe, it, expect, vi } from 'vitest'
import { TeamsConnectionService, type TeamsRequest } from './teams-connection'
import { TEAMS_TOOL_IDS as ids } from '../shared/teams-contract'
const input = { tenantId: '11111111-1111-1111-1111-111111111111', clientId: '22222222-2222-2222-2222-222222222222', clientSecret: 'test-secret-never-project', organizer: 'organizer@example.com' }
const person = { id: '33333333-3333-3333-3333-333333333333', displayName: '张三', mail: 'person@example.com', accountEnabled: true }
function setup(options: { roles?: string[]; missingLink?: boolean; deny?: boolean } = {}) {
  let saved: string | undefined
  const store = { read: vi.fn(async () => saved), write: vi.fn(async (value: string) => { saved = value }), delete: vi.fn(async () => { saved = undefined }) }
  const request = vi.fn<TeamsRequest>(async (method, url) => {
    if (options.deny) throw new Error('teams_permission_denied')
    if (url.includes('/token')) return { access_token: `header.${Buffer.from(JSON.stringify({ roles: options.roles ?? ['Calendars.ReadWrite'] })).toString('base64url')}.signature`, expires_in: 3600 }
    if (url.includes('/calendar?')) return { allowedOnlineMeetingProviders: ['teamsForBusiness'] }
    if (method === 'POST') return { id: 'event1', ...(options.missingLink ? {} : { onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/test' } }) }
    if (url.includes(person.id)) return person
    return { value: [person] }
  })
  return { service: new TeamsConnectionService(store, request), store, request }
}
const plan = () => ({ topic: '项目讨论', startTime: new Date(Date.now() + 3600000).toISOString(), endTime: new Date(Date.now() + 5400000).toISOString(), attendeeIds: [person.id], actionId: 'action-1', attendeeNames: ['张三'] })
describe('native Teams connection', () => {
  it('validates before storage, projects no secrets, restores and disconnects', async () => {
    const { service, store, request } = setup()
    expect((await service.getStatus()).state).toBe('not_connected')
    const status = await service.connect(input)
    expect(status).toMatchObject({ state: 'connected', canSearch: true, canCreate: true })
    expect(JSON.stringify(status)).not.toContain(input.clientSecret)
    expect(store.write).toHaveBeenCalledTimes(1)
    expect((await service.getStatus()).state).toBe('connected')
    expect(request.mock.calls.filter(call => call[1].includes('/token'))).toHaveLength(1)
    await service.disconnect()
    expect((await service.getStatus()).state).toBe('not_connected')
  })
  it('does not save rejected credentials', async () => {
    const { service, store } = setup({ deny: true })
    await expect(service.connect(input)).rejects.toThrow('teams_permission_denied')
    expect(store.write).not.toHaveBeenCalled()
  })
  it('returns directory identity and binds calendar invitations to verified users', async () => {
    const { service, request } = setup(); await service.connect(input)
    expect(await service.execute(ids.search, { query: '张三' })).toMatchObject({ match: 'unique', items: [{ id: person.id, email: person.mail }] })
    const result = await service.execute(ids.create, plan())
    expect(result).toMatchObject({ calendarEventId: 'event1', invitations: 'submitted', responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(request.mock.calls.find(call => call[0] === 'POST' && call[1].endsWith('/events'))?.[2]).toMatchObject({ transactionId: 'action-1', isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', attendees: [{ emailAddress: { address: person.mail, name: '张三' }, type: 'required' }] })
  })
  it('does not claim a meeting succeeded when the write returns no join link', async () => {
    const { service } = setup({ missingLink: true }); await service.connect(input)
    await expect(service.execute(ids.create, plan())).rejects.toThrow('teams_write_result_unknown')
  })
  it('keeps search available without calendar write and blocks event creation', async () => {
    const { service, request } = setup({ roles: [] }); expect(await service.connect(input)).toMatchObject({ canSearch: true, canCreate: false })
    await expect(service.execute(ids.create, plan())).rejects.toThrow('teams_permission_denied')
    expect(request.mock.calls.some(call => call[1].endsWith('/events'))).toBe(false)
  })
  it('rejects expired times and arbitrary parameters before any external write', async () => {
    const { service, request } = setup(); await service.connect(input)
    await expect(service.execute(ids.create, { ...plan(), startTime: '2020-01-01T00:00:00Z' })).rejects.toThrow('invalid_meeting_time')
    await expect(service.execute(ids.search, { query: '张三', url: 'https://example.com' })).rejects.toThrow('invalid_teams_parameters')
    expect(request.mock.calls.some(call => call[1].endsWith('/events'))).toBe(false)
  })
})

describe('Teams existing meeting invitations', () => {
  function meetingSetup(mode: 'ok' | 'lost' | 'timeout' | 'conflict' = 'ok') {
    const original = { emailAddress: { address: 'original@example.com', name: '原参会人' }, type: 'optional', status: { response: 'accepted' } }
    let event = { id: 'existing-event', '@odata.etag': 'version-1', isOrganizer: true, isCancelled: false, subject: '原会议', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/original' }, attendees: [original] as any[] }
    const request = vi.fn<TeamsRequest>(async (method, url, body) => {
      if (url.includes('/token')) return { access_token: `header.${Buffer.from(JSON.stringify({ roles: ['Calendars.ReadWrite'] })).toString('base64url')}.signature`, expires_in: 3600 }
      if (url.includes('/users/' + person.id)) return person
      if (method === 'PATCH') {
        if (mode === 'timeout') throw new Error('teams_write_result_unknown')
        if (mode === 'conflict') throw new Error('teams_request_failed')
        event = { ...event, attendees: mode === 'lost' ? [] : (body as any).attendees }
        return event
      }
      return event
    })
    const service = new TeamsConnectionService({ read: async () => JSON.stringify(input), write: async () => {}, delete: async () => {} }, request)
    const parameters = { calendarEventId: 'existing-event', attendeeIds: [person.id], actionId: 'add-1' }
    return { service, request, parameters, original }
  }
  it('patches only attendees with a concurrency guard, preserves original participants, and verifies readback', async () => {
    const { service, request, parameters, original } = meetingSetup()
    const result = await service.execute(ids.addAttendees, parameters)
    expect(result).toMatchObject({ calendarEventId: 'existing-event', invitations: 'submitted', allAttendeeNames: ['原参会人', '张三'] })
    const patch = request.mock.calls.find(call => call[0] === 'PATCH')!
    expect(Object.keys(patch[2] as object)).toEqual(['attendees'])
    expect((patch[2] as any).attendees[0]).toEqual({ emailAddress: original.emailAddress, type: original.type })
    expect(patch[4]).toEqual({ 'If-Match': 'version-1' })
    expect(request.mock.calls.filter(call => call[1].endsWith('/events/existing-event') && call[0] === 'GET')).toHaveLength(2)
    expect(request.mock.calls.some(call => call[0] === 'POST' && call[1].endsWith('/events'))).toBe(false)
    expect(await service.execute(ids.addAttendees, { ...parameters, actionId: 'add-2' })).toMatchObject({ invitations: 'already_present' })
    expect(request.mock.calls.filter(call => call[0] === 'PATCH')).toHaveLength(1)
  })
  it.each(['lost', 'timeout'] as const)('keeps %s write outcome unknown without retry', async mode => {
    const { service, request, parameters } = meetingSetup(mode)
    await expect(service.execute(ids.addAttendees, parameters)).rejects.toThrow('teams_write_result_unknown')
    expect(request.mock.calls.filter(call => call[0] === 'PATCH')).toHaveLength(1)
  })
  it('does not retry a conflicting event update', async () => {
    const { service, request, parameters } = meetingSetup('conflict')
    await expect(service.execute(ids.addAttendees, parameters)).rejects.toThrow('teams_request_failed')
    expect(request.mock.calls.filter(call => call[0] === 'PATCH')).toHaveLength(1)
  })
})

it('resolves an exact enterprise email without a fuzzy name match', async () => {
  const { service, request } = setup(); await service.connect(input)
  await service.execute(ids.search, { query: 'person@example.com' })
  const url = request.mock.calls.find(call => call[1].includes('/users?$filter='))![1]
  expect(new URL(url).searchParams.get('$filter')).toBe("mail eq 'person@example.com' or userPrincipalName eq 'person@example.com'")
})
