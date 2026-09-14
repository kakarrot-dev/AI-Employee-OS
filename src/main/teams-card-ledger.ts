import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TeamsMeetingConfirmation, TeamsParticipantConfirmation } from '../shared/teams-contract'

export interface CardMeetingInput {
  calendarEventId: string; tenantId: string; topic: string; startTime: string; endTime: string; meetingUrl: string
  participants: Array<{ userId: string; name: string; email: string }>
}
interface ParticipantRecord extends TeamsParticipantConfirmation { nonce: string; conversationId?: string; messageId?: string }
interface MeetingRecord extends Omit<CardMeetingInput, 'participants'> { participants: ParticipantRecord[]; updatedAt: string }

/** A durable receipt ledger. No calendar RSVP, model text, or local button can confirm a participant. */
export class TeamsCardLedger {
  private meetings: Record<string, MeetingRecord> = {}
  constructor(private readonly path: string, private readonly now = () => new Date().toISOString()) {
    if (existsSync(path)) {
      const value = JSON.parse(readFileSync(path, 'utf8'))
      if (value.schemaVersion !== 1 || !value.meetings || typeof value.meetings !== 'object') throw new Error('teams_card_ledger_invalid')
      this.meetings = value.meetings
      for (const meeting of Object.values(this.meetings)) for (const person of meeting.participants) if (person.state === 'sending') person.state = 'delivery_unknown'
      this.save()
    }
  }
  prepare(input: CardMeetingInput): TeamsMeetingConfirmation {
    if (!input.calendarEventId || !input.tenantId || !Number.isFinite(Date.parse(input.startTime)) || !Number.isFinite(Date.parse(input.endTime)) || Date.parse(input.endTime) <= Date.parse(input.startTime) || !/^https:\/\/teams\.microsoft\.com\//.test(input.meetingUrl) || new Set(input.participants.map(person => person.userId)).size !== input.participants.length) throw new Error('teams_card_invalid_meeting')
    let meeting = this.meetings[input.calendarEventId]
    if (meeting && meeting.tenantId !== input.tenantId) throw new Error('teams_card_tenant_mismatch')
    if (!meeting) this.meetings[input.calendarEventId] = meeting = { ...input, participants: [], updatedAt: this.now() }
    for (const person of input.participants) if (!meeting.participants.some(item => item.userId === person.userId)) meeting.participants.push({ ...person, state: 'not_sent', nonce: randomBytes(32).toString('hex') })
    meeting.updatedAt = this.now(); this.save()
    return this.snapshot(input.calendarEventId)!
  }
  snapshots(): TeamsMeetingConfirmation[] { return Object.keys(this.meetings).map(eventId => this.snapshot(eventId)!) }
  snapshot(eventId: string): TeamsMeetingConfirmation | undefined {
    const meeting = this.meetings[eventId]
    if (!meeting) return undefined
    const participants = meeting.participants.map(({ userId, name, email, state, respondedAt }) => ({ userId, name, email, state, respondedAt }))
    const confirmedCount = participants.filter(person => person.state === 'confirmed').length
    return { calendarEventId: eventId, policy: 'teams_card', participants, confirmedCount, allConfirmed: participants.length > 0 && confirmedCount === participants.length, updatedAt: meeting.updatedAt }
  }
  unsent(eventId: string): TeamsParticipantConfirmation[] { return this.snapshot(eventId)?.participants.filter(person => person.state === 'not_sent') ?? [] }
  beginSend(eventId: string, userId: string, conversationId: string): void {
    const person = this.person(eventId, userId)
    if (person.state !== 'not_sent') throw new Error('teams_card_already_attempted')
    person.state = 'sending'; person.conversationId = conversationId; this.touch(eventId)
  }
  finishSend(eventId: string, userId: string, messageId?: string): void {
    const person = this.person(eventId, userId)
    if (person.state === 'confirmed' || person.state === 'declined') return // Callback can race the send receipt.
    person.state = messageId ? 'awaiting_confirmation' : 'delivery_unknown'; person.messageId = messageId; this.touch(eventId)
  }
  acknowledge(input: { eventId: string; tenantId: string; userId: string; conversationId: string; nonce: string; decision: string }): TeamsMeetingConfirmation {
    const meeting = this.meetings[input.eventId]
    if (!meeting || meeting.tenantId !== input.tenantId || Date.parse(meeting.endTime) < Date.parse(this.now())) throw new Error('teams_card_invalid_or_expired')
    const person = this.person(input.eventId, input.userId)
    if (!['confirm', 'decline'].includes(input.decision) || !['sending', 'awaiting_confirmation', 'delivery_unknown', 'confirmed', 'declined'].includes(person.state) || person.nonce !== input.nonce || person.conversationId !== input.conversationId) throw new Error('teams_card_identity_mismatch')
    const state = input.decision === 'confirm' ? 'confirmed' : 'declined'
    if (person.state === state) return this.snapshot(input.eventId)! // Duplicate webhook is idempotent.
    if (person.state === 'confirmed' || person.state === 'declined') throw new Error('teams_card_already_answered')
    person.state = state; person.respondedAt = this.now(); this.touch(input.eventId)
    return this.snapshot(input.eventId)!
  }
  card(eventId: string, userId: string): Record<string, unknown> {
    const meeting = this.meetings[eventId], person = this.person(eventId, userId)
    const answered = person.state === 'confirmed' || person.state === 'declined'
    const time = (value: string) => `${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value))}（北京时间）`
    return { type: 'AdaptiveCard', version: '1.4', body: [
      { type: 'TextBlock', text: meeting.topic, size: 'Large', weight: 'Bolder', wrap: true },
      { type: 'FactSet', facts: [{ title: '开始', value: time(meeting.startTime) }, { title: '结束', value: time(meeting.endTime) }, { title: '参会人', value: `${person.name} (${person.email})` }] },
      { type: 'TextBlock', text: answered ? person.state === 'confirmed' ? '你已确认参加。' : '你已拒绝参加。' : '请确认是否参加。本卡片只确认你的参会状态。', wrap: true }
    ], actions: answered ? [{ type: 'Action.OpenUrl', title: '打开会议', url: meeting.meetingUrl }] : [
      ...(['confirm', 'decline'] as const).map(decision => ({ type: 'Action.Execute', title: decision === 'confirm' ? '确认参加' : '无法参加', verb: 'meeting_response', data: { eventId, nonce: person.nonce, decision } })),
      { type: 'Action.OpenUrl', title: '打开会议', url: meeting.meetingUrl }
    ] }
  }
  private person(eventId: string, userId: string): ParticipantRecord {
    const person = this.meetings[eventId]?.participants.find(item => item.userId === userId)
    if (!person) throw new Error('teams_card_participant_missing')
    return person
  }
  private touch(eventId: string): void { this.meetings[eventId].updatedAt = this.now(); this.save() }
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    writeFileSync(`${this.path}.tmp`, JSON.stringify({ schemaVersion: 1, meetings: this.meetings }), { mode: 0o600 })
    renameSync(`${this.path}.tmp`, this.path)
  }
}
