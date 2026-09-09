import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  advanceDemoMeeting, createFeishuMeetingSession, meetingContacts, meetingExpertGroup, meetingSummaryFileName, meetingSummaryText, meetingStages, tickDemoMeetings,
  scheduleDemoMeeting, validateMeetingDraft, type MeetingDraft, type MeetingStage, type FeishuMeetingSession
} from './demo'

const now = new Date('2026-09-09T04:00:00Z')
function validSession() {
  const session = createFeishuMeetingSession(now)
  session.draft.topic = '产品 v0.1 需求评审'
  session.draft.participantIds = ['demo-design', 'demo-qa']
  return session
}

function through(target: MeetingStage, draft = validSession()): FeishuMeetingSession {
  let session = scheduleDemoMeeting(draft, now).session
  for (const stage of meetingStages.slice(2, meetingStages.indexOf(target) + 1)) {
    session = advanceDemoMeeting(session, stage, now)
  }
  expect(session.stage).toBe(target)
  return session
}

afterEach(() => vi.useRealTimers())

describe('Web v0.1 飞书会议自动流程', () => {
  it('defaults to a future Beijing-time meeting independently of the machine timezone', () => {
    const session = createFeishuMeetingSession(new Date('2026-12-31T20:00:00Z'))
    expect(session.draft.start).toBe('2027-01-02T10:00')
    expect(validateMeetingDraft(validSession().draft, now)).toEqual({})
    const created = scheduleDemoMeeting(validSession(), now).session
    expect(created.meeting?.start).toBe('2026-09-10T02:00:00.000Z')
  })

  it.each<[Partial<MeetingDraft>, keyof MeetingDraft]>([
    [{ topic: '  ' }, 'topic'],
    [{ topic: '会'.repeat(101) }, 'topic'],
    [{ participantIds: [] }, 'participantIds'],
    [{ participantIds: ['missing'] }, 'participantIds'],
    [{ participantIds: ['demo-design', 'demo-design'] }, 'participantIds'],
    [{ start: '2026-09-09T10:00' }, 'start'],
    [{ start: '2026-02-30T10:00' }, 'start'],
    [{ end: '' }, 'end'],
    [{ end: '2026-09-10T09:00' }, 'end'],
    [{ end: '2026-09-11T10:01' }, 'end'],
    [{ start: '2026-10-10T10:00', end: '2026-10-10T11:00' }, 'end']
  ])('rejects invalid form values %j without advancing or emitting messages', (patch, field) => {
    const session = validSession()
    session.draft = { ...session.draft, ...patch }
    const result = scheduleDemoMeeting(session, now)
    expect(result.errors[field]).toBeTruthy()
    expect(result.session).toBe(session)
    expect(result.session.events).toEqual([])
  })

  it('freezes submitted facts and keeps people with the same name distinct', () => {
    const draft = validSession()
    const scheduled = scheduleDemoMeeting(draft, now).session
    draft.draft.topic = '新的草稿'
    draft.draft.participantIds.pop()
    expect(scheduled.meeting?.topic).toBe('产品 v0.1 需求评审')
    expect(scheduled.meeting?.participants.map((person) => person.id)).toEqual(['demo-design', 'demo-qa'])
    expect(scheduled.meeting?.participants.map((person) => person.name)).toEqual(['陈晨', '陈晨'])
    expect(scheduled.meeting?.participants[0]).not.toBe(meetingContacts[1])
    expect(scheduleDemoMeeting(scheduled, now).session).toBe(scheduled)
  })

  it('requires each event in order and distinguishes reservation, meeting, recording and transcription readiness', () => {
    const draft = validSession()
    expect(advanceDemoMeeting(draft, 'content-ready', now)).toBe(draft)
    let session = scheduleDemoMeeting(draft, now).session
    expect(session.meeting?.reservation).toBeUndefined()
    for (const nextStage of meetingStages.slice(2)) {
      const premature = nextStage === 'complete' ? 'draft' : 'complete'
      expect(advanceDemoMeeting(session, premature, now)).toBe(session)
      session = advanceDemoMeeting(session, nextStage, now)
      expect(advanceDemoMeeting(session, nextStage, now)).toBe(session)
      if (nextStage === 'scheduled') {
        expect(session.meeting?.reservation?.autoRecord).toBe(true)
        expect(session.meeting?.meetingId).toBeUndefined()
        expect(session.meeting?.invitations).toBeUndefined()
      }
      if (nextStage === 'invited') expect(session.meeting?.invitations?.map((item) => item.participantId)).toEqual(['demo-design', 'demo-qa'])
      if (nextStage === 'started') {
        expect(session.meeting?.meetingId).toBeTruthy()
        expect(session.meeting?.meetingId).not.toBe(session.meeting?.reservation?.id)
      }
      if (nextStage === 'ended') expect(session.minutes).toBeUndefined()
      if (nextStage === 'recording-ready' || nextStage === 'transcribing') {
        expect(session.minutes?.transcript).toEqual([])
        expect(session.minutes?.readAt).toBeUndefined()
      }
      if (nextStage !== 'complete') {
        expect(session.summary).toBeUndefined()
        expect(meetingSummaryText(session)).toBe('')
      }
    }
    expect(session.events.map((event) => event.kind)).toEqual(meetingStages.slice(1))
    expect(session.nextStepAt).toBeUndefined()
    expect(session.summary?.sourceMinutesId).toBe(session.minutes?.id)
    expect(session.summary?.expertGroupId).toBe(meetingExpertGroup.id)
    const finalWork = session.groupWork.filter((work) => ['summary-drafted', 'actions-reviewed', 'source-checked'].includes(work.id))
    expect(finalWork.map((work) => work.expertId)).toEqual(['meeting-recorder', 'meeting-followup', 'meeting-planner'])
    expect(finalWork.every((work) => work.sourceMinutesId === session.minutes?.id)).toBe(true)
    expect(new Set(session.groupWork.map((work) => work.id)).size).toBe(session.groupWork.length)
  })

  it('keeps each conclusion and action tied to an actual source and selected participant', () => {
    const complete = through('complete')
    expect(complete.minutes!.transcript[0].text).toContain('产品 v0.1 需求评审')
    for (const decision of complete.summary!.decisions) {
      expect(complete.minutes!.transcript.find((line) => line.id === decision.sourceId)?.decision).toBe(decision.text)
    }
    for (const action of complete.summary!.actions) {
      const source = complete.minutes!.transcript.find((line) => line.id === action.sourceId)!
      expect(source.action?.owner.id).toBe(action.owner.id)
      expect(source.text).toContain(action.due)
      expect(complete.meeting?.participants.some((person) => person.id === action.owner.id)).toBe(true)
    }
    const exported = meetingSummaryText(complete)
    expect(exported).toContain('非真实飞书会议内容')
    expect(exported).toContain('质量部 · 测试工程师')
    expect(exported).toContain('## 会议结论')
    expect(exported).toContain('## 行动项')
    expect(exported).toContain('内容来源：飞书妙记（示例）')
    expect(exported).toContain('交付团队：会议专家团')
    for (const member of meetingExpertGroup.members) expect(exported).toContain(member.name)
    expect(exported).not.toContain('[原文')
    expect(exported).not.toContain(complete.minutes!.transcript[0].text)
    expect(meetingSummaryFileName(complete)).toBe('产品 v0.1 需求评审-会议摘要.md')
  })

  it('exports a safe filename and keeps topic markup literal in the document', () => {
    const session = validSession()
    session.draft.topic = '产品/评审: [议题]<草稿>'
    const complete = through('complete', session)
    expect(meetingSummaryFileName(complete)).toBe('产品-评审- [议题]-草稿--会议摘要.md')
    expect(meetingSummaryText(complete)).toContain('\\[议题\\]\\<草稿\\>')
    expect(meetingSummaryText(session)).toBe('')
  })

  it('does not fabricate a summary from missing or empty content', () => {
    const read = through('content-ready')
    const empty = { ...read, minutes: { ...read.minutes!, transcript: [] } }
    expect(advanceDemoMeeting(empty, 'summarizing', now)).toBe(empty)
    expect(empty.summary).toBeUndefined()
    const unread = { ...read, minutes: { ...read.minutes!, readAt: undefined } }
    expect(advanceDemoMeeting(unread, 'summarizing', now)).toBe(unread)
  })

  it('rejects Minutes from another meeting even when both meetings were created at the same time', () => {
    const first = through('transcribing')
    const second = through('transcribing')
    expect(first.minutes?.id).not.toBe(second.minutes?.id)
    const mismatched = { ...first, minutes: second.minutes }
    expect(advanceDemoMeeting(mismatched, 'content-ready', now)).toBe(mismatched)
    const read = advanceDemoMeeting(first, 'content-ready', now)
    const changedSource = { ...read, minutes: { ...read.minutes!, meetingId: second.meeting!.meetingId! } }
    expect(advanceDemoMeeting(changedSource, 'summarizing', now)).toBe(changedSource)
  })

  it('does not deliver on behalf of a different group or accept an unverified action owner', () => {
    const read = through('content-ready')
    const wrongGroup = { ...read, expertGroupId: 'expert-group.reimbursement' }
    expect(advanceDemoMeeting(wrongGroup, 'summarizing', now)).toBe(wrongGroup)
    const unverified = { ...read, minutes: { ...read.minutes!, transcript: read.minutes!.transcript.map((line) => line.action ? { ...line, action: { ...line.action, owner: meetingContacts[0] } } : line) } }
    expect(advanceDemoMeeting(unverified, 'summarizing', now)).toBe(unverified)
    expect(unverified.groupWork.some((work) => work.id === 'actions-reviewed')).toBe(false)
  })

  it('isolates drafts and messages between new meetings', () => {
    const first = validSession()
    const second = createFeishuMeetingSession(now)
    first.draft.participantIds.push('demo-product')
    expect(second.draft.participantIds).toEqual([])
    expect(second.events).toEqual([])
    expect(second.draft.topic).toBe('')
  })


  it('waits for the next demo deadline without repeating events and only advances due meetings', () => {
    const scheduled = scheduleDemoMeeting(validSession(), now).session
    const sessions = { first: scheduled, otherDraft: validSession() }
    expect(tickDemoMeetings(sessions, now)).toBe(sessions)
    const due = new Date(scheduled.nextStepAt!)
    const advanced = tickDemoMeetings(sessions, due)
    expect(advanced.first.stage).toBe('scheduled')
    expect(advanced.otherDraft).toBe(sessions.otherDraft)
    expect(tickDemoMeetings(advanced, due)).toBe(advanced)
    expect(advanced.first.events).toHaveLength(2)
  })

})
