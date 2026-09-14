import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { TeamsCardLedger, type CardMeetingInput } from './teams-card-ledger'
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'teams-cards-')); dirs.push(dir)
  const path = join(dir, 'ledger.json'), now = () => '2026-09-08T04:00:00.000Z'
  const ledger = new TeamsCardLedger(path, now)
  const input: CardMeetingInput = { calendarEventId: 'event-1', tenantId: 'tenant-1', topic: '测试', startTime: '2026-09-08T08:00:00Z', endTime: '2026-09-08T10:00:00Z', meetingUrl: 'https://teams.microsoft.com/l/meetup-join/test', participants: [{ userId: 'person-1', name: '张俊', email: 'zhang@example.com' }, { userId: 'person-2', name: '李四', email: 'li@example.com' }] }
  ledger.prepare(input)
  const response = (userId: string) => {
    const card = ledger.card('event-1', userId) as { actions: Array<{ data: { nonce: string } }> }
    return { eventId: 'event-1', userId, tenantId: 'tenant-1', conversationId: `chat-${userId}`, nonce: card.actions[0].data.nonce, decision: 'confirm' }
  }
  return { ledger, input, path, now, response }
}
it('requires each authenticated participant click; send receipts and duplicate callbacks never inflate the count', () => {
  const { ledger, response } = setup()
  for (const id of ['person-1', 'person-2']) { ledger.beginSend('event-1', id, `chat-${id}`); ledger.finishSend('event-1', id, `message-${id}`) }
  expect(ledger.snapshot('event-1')).toMatchObject({ confirmedCount: 0, allConfirmed: false })
  const firstClick = response('person-1')
  expect(ledger.acknowledge(firstClick)).toMatchObject({ confirmedCount: 1, allConfirmed: false })
  expect(ledger.acknowledge(firstClick)).toMatchObject({ confirmedCount: 1, allConfirmed: false })
  expect(ledger.acknowledge(response('person-2'))).toMatchObject({ confirmedCount: 2, allConfirmed: true })
  expect(JSON.stringify(ledger.snapshot('event-1'))).not.toContain('nonce')
})
it('rejects wrong tenant, person, conversation, nonce and unissued cards', () => {
  const { ledger, response } = setup(), valid = response('person-1')
  expect(() => ledger.acknowledge(valid)).toThrow()
  ledger.beginSend('event-1', 'person-1', 'chat-person-1'); ledger.finishSend('event-1', 'person-1', 'message')
  for (const tampering of [{ tenantId: 'other' }, { userId: 'person-2' }, { conversationId: 'other' }, { nonce: 'forged' }, { decision: 'accepted' }]) expect(() => ledger.acknowledge({ ...valid, ...tampering })).toThrow()
  expect(ledger.snapshot('event-1')?.confirmedCount).toBe(0)
})
it('preserves declined and unknown states across restart and never retries an uncertain send', () => {
  const { ledger, response, path, now, input } = setup()
  ledger.beginSend('event-1', 'person-1', 'chat-person-1')
  ledger.acknowledge({ ...response('person-1'), decision: 'decline' })
  ledger.beginSend('event-1', 'person-2', 'chat-person-2')
  const recovered = new TeamsCardLedger(path, now)
  expect(recovered.prepare(input).participants.map(person => person.state)).toEqual(['declined', 'delivery_unknown'])
  expect(recovered.unsent('event-1')).toHaveLength(0)
  expect(() => recovered.beginSend('event-1', 'person-2', 'chat-person-2')).toThrow('teams_card_already_attempted')
  expect(recovered.snapshot('event-1')?.allConfirmed).toBe(false)
})
it('rejects expired cards and keeps an empty meeting from claiming all invitees confirmed', () => {
  const { ledger, path, input, response } = setup(), valid = response('person-1')
  ledger.beginSend('event-1', 'person-1', 'chat-person-1')
  const expired = new TeamsCardLedger(path, () => '2026-09-08T11:00:00Z')
  expect(() => expired.acknowledge(valid)).toThrow('teams_card_invalid_or_expired')
  expect(expired.prepare({ ...input, calendarEventId: 'empty', participants: [] }).allConfirmed).toBe(false)
})
