import { it, expect } from 'vitest'
import { bindTeamsParameters, remainingTeamsTools } from './teams-tools'
import { TEAMS_TOOL_IDS as ids } from '../shared/teams-contract'
import type { ToolAction } from './domain'
const contact = '44444444-4444-4444-4444-444444444444'
const action = (toolVersionId: string, result: Record<string, unknown>): ToolAction => ({ schemaVersion: 1, id: 'action', createdAt: '', runId: 'run', assignmentId: 'assignment', toolVersionId, result, resultVerified: true, state: 'succeeded', parameters: {}, parameterSources: {}, idempotencyKey: '', risk: 'low', sideEffect: 'external_read', timeoutMs: 1000 })
it('binds additions to the latest original meeting when legacy runs already contain duplicates', () => {
  const actions = [action(ids.create, { calendarEventId: 'older' }), action(ids.create, { calendarEventId: 'latest', topic: '原会议' }), action(ids.search, { items: [{ id: contact, name: '李四' }] })]
  expect(remainingTeamsTools(actions)).toEqual([ids.search, ids.addAttendees])
  expect(() => bindTeamsParameters(ids.addAttendees, { calendarEventId: 'older', attendeeIds: [contact] }, actions)).toThrow('teams_event_not_from_task')
  expect(bindTeamsParameters(ids.addAttendees, { calendarEventId: 'latest', attendeeIds: [contact] }, actions)).toMatchObject({ calendarEventId: 'latest', attendeeNames: ['李四'], meeting: { topic: '原会议' } })
  expect(() => bindTeamsParameters(ids.create, { attendeeIds: [] }, actions)).toThrow('teams_meeting_already_attempted')
})
it('blocks unknown additions and rejects attendees without directory evidence', () => {
  const actions = [action(ids.create, { calendarEventId: 'event' })]
  expect(() => bindTeamsParameters(ids.addAttendees, { calendarEventId: 'event', attendeeIds: [contact] }, actions)).toThrow('teams_attendee_not_from_search')
  actions.push({ ...action(ids.addAttendees, {}), state: 'result_unknown' })
  expect(remainingTeamsTools(actions)).toEqual([])
  expect(() => bindTeamsParameters(ids.search, { query: '李四' }, actions)).toThrow('teams_action_unsettled')
})
