// Web v0.1 only: a compressed, automatic demonstration with no external requests.
import { candidateExpertGroups } from '../../renderer/src/ExpertGroupDirectory'

export const meetingExpertGroup = candidateExpertGroups.find((group) => group.id === 'expert-group.meeting')!

export interface MeetingContact { id: string; name: string; department: string }
export const meetingContacts: MeetingContact[] = [
  { id: 'demo-product', name: '林悦', department: '产品部 · 产品经理' },
  { id: 'demo-design', name: '陈晨', department: '设计部 · 设计师' },
  { id: 'demo-engineering', name: '周航', department: '研发部 · 工程师' },
  { id: 'demo-operations', name: '许宁', department: '运营部 · 运营经理' },
  { id: 'demo-qa', name: '陈晨', department: '质量部 · 测试工程师' },
  { id: 'demo-business', name: '唐可', department: '业务部 · 业务负责人' }
]

export interface MeetingDraft { topic: string; participantIds: string[]; start: string; end: string }
export type MeetingErrors = Partial<Record<keyof MeetingDraft, string>>
export interface MeetingSnapshot {
  id: string; topic: string; participants: MeetingContact[]; start: string; end: string
  // The local request, reservation and actual meeting have separate identities.
  reservation?: { id: string; meetingNo: string; autoRecord: true }
  meetingId?: string
  invitations?: Array<{ participantId: string; messageId: string }>
}
export interface TranscriptLine {
  id: string; offset: string; speaker: MeetingContact; text: string
  decision?: string
  action?: { task: string; owner: MeetingContact; due: string }
}
export interface MeetingSummary {
  sourceMinutesId: string
  expertGroupId: string
  overview: string
  decisions: Array<{ text: string; sourceId: string }>
  actions: Array<{ task: string; owner: MeetingContact; due: string; sourceId: string }>
}
export interface FeishuMinutesSource {
  id: string
  provider: 'feishu-minutes'
  mode: 'demo'
  meetingId: string
  title: string
  recordedAt: string
  readAt?: string
  transcript: TranscriptLine[]
}
export interface MeetingGroupWork {
  id: string
  expertId: string
  title: string
  at: string
  sourceMinutesId?: string
}
export const meetingStages = ['draft', 'submitted', 'scheduled', 'invited', 'started', 'recording', 'ended', 'recording-ready', 'transcribing', 'content-ready', 'summarizing', 'reviewing', 'complete'] as const
export type MeetingStage = typeof meetingStages[number]
export const meetingStageStatus: Record<MeetingStage, { title: string; detail: string }> = {
  draft: { title: '填写会议信息', detail: '提交一次，自动演示从预约会议到摘要交付。' },
  submitted: { title: '正在预约会议', detail: '会议策划 Agent 正在安排会议并启用自动录制。' },
  scheduled: { title: '正在发送参会邀请', detail: '将会议主题、约定时间和入会信息发送给所选人员。' },
  invited: { title: '等待会议开始', detail: '邀请已发送，等待飞书会议开始通知。' },
  started: { title: '会议已开始', detail: '已关联实际会议，等待录制开始通知。' },
  recording: { title: '会议进行中 · 录制中', detail: '等待飞书会议结束通知，会后自动继续。' },
  ended: { title: '会议已结束 · 等待录制', detail: '录制文件仍在处理，就绪后再获取妙记。' },
  'recording-ready': { title: '录制已就绪 · 关联妙记', detail: '会议策划 Agent 正在核对录制来源与本场会议。' },
  transcribing: { title: '等待妙记转写', detail: '妙记内容暂未就绪，流程会自动重试读取。' },
  'content-ready': { title: '妙记内容已就绪', detail: '已读取带发言人和时间信息的转写，专家团开始协作。' },
  summarizing: { title: '专家团正在整理摘要', detail: '会议纪要 Agent 提炼概述与结论，行动项跟进 Agent 核对分工。' },
  reviewing: { title: '专家团正在核对文档', detail: '核对负责人、截止时间和妙记来源后统一交付。' },
  complete: { title: '专家团已交付摘要', detail: '打开摘要文档查看，或下载保存。' }
}
const stageDelayMs: Partial<Record<MeetingStage, number>> = {
  submitted: 1200, scheduled: 1500, invited: 2300, started: 1600, recording: 5000,
  ended: 3000, 'recording-ready': 1800, transcribing: 4000, 'content-ready': 1800,
  summarizing: 3000, reviewing: 2500
}
export interface MeetingEvent { kind: Exclude<MeetingStage, 'draft'>; at: string }
export interface FeishuMeetingSession {
  expertGroupId: string
  draft: MeetingDraft
  stage: MeetingStage
  meeting?: MeetingSnapshot
  minutes?: FeishuMinutesSource
  groupWork: MeetingGroupWork[]
  summary?: MeetingSummary
  events: MeetingEvent[]
  nextStepAt?: number
}

function beijingInput(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

export function createFeishuMeetingSession(now = new Date()): FeishuMeetingSession {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const day = beijingInput(tomorrow).slice(0, 10)
  return { expertGroupId: meetingExpertGroup.id, stage: 'draft', draft: { topic: '', participantIds: [], start: `${day}T10:00`, end: `${day}T11:00` }, groupWork: [], events: [] }
}

function parseMeetingTime(input: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return NaN
  const value = Date.parse(`${input}:00+08:00`)
  // Reject normalized invalid dates such as February 30.
  return Number.isFinite(value) && beijingInput(new Date(value)) === input ? value : NaN
}

export function validateMeetingDraft(draft: MeetingDraft, now = new Date()): MeetingErrors {
  const errors: MeetingErrors = {}
  if (!draft.topic.trim()) errors.topic = '请填写会议主题。'
  else if (draft.topic.trim().length > 100) errors.topic = '会议主题最多 100 个字符。'
  if (!draft.participantIds.length) errors.participantIds = '请至少选择 1 位参会人。'
  else if (draft.participantIds.length > 10 || new Set(draft.participantIds).size !== draft.participantIds.length || draft.participantIds.some((id) => !meetingContacts.some((person) => person.id === id))) errors.participantIds = '请选择有效且不重复的参会人，最多 10 位。'
  const start = parseMeetingTime(draft.start)
  const end = parseMeetingTime(draft.end)
  if (!Number.isFinite(start)) errors.start = '请填写有效的开始时间。'
  else if (start <= now.getTime()) errors.start = '开始时间需要晚于当前时间。'
  if (!Number.isFinite(end)) errors.end = '请填写有效的结束时间。'
  else if (Number.isFinite(start) && end <= start) errors.end = '结束时间需要晚于开始时间。'
  else if (end - start > 24 * 60 * 60 * 1000) errors.end = '单次会议最长 24 小时。'
  else if (end > now.getTime() + 30 * 24 * 60 * 60 * 1000) errors.end = '请选择未来 30 天内的会议时间。'
  return errors
}

export function scheduleDemoMeeting(session: FeishuMeetingSession, now = new Date()): { session: FeishuMeetingSession; errors: MeetingErrors } {
  if (session.stage !== 'draft') return { session, errors: {} }
  const errors = validateMeetingDraft(session.draft, now)
  if (Object.keys(errors).length) return { session, errors }
  const { draft } = session
  const meeting: MeetingSnapshot = {
    id: `DEMO-${crypto.randomUUID()}`,
    topic: draft.topic.trim(),
    participants: draft.participantIds.map((id) => ({ ...meetingContacts.find((person) => person.id === id)! })),
    start: new Date(parseMeetingTime(draft.start)).toISOString(),
    end: new Date(parseMeetingTime(draft.end)).toISOString()
  }
  const at = now.toISOString()
  return { session: { ...session, meeting, stage: 'submitted', nextStepAt: now.getTime() + stageDelayMs.submitted!, events: [{ kind: 'submitted', at }] }, errors: {} }
}

function sampleTranscript(meeting: MeetingSnapshot): TranscriptLine[] {
  const lead = meeting.participants[0]
  const collaborator = meeting.participants[1] ?? lead
  const reviewer = meeting.participants[2] ?? collaborator
  const due = `${beijingInput(new Date(Date.parse(meeting.end) + 24 * 60 * 60 * 1000)).slice(0, 10)} 18:00`
  const durationSeconds = (Date.parse(meeting.end) - Date.parse(meeting.start)) / 1000
  const offset = (fraction: number): string => {
    const seconds = Math.floor(durationSeconds * fraction)
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  }
  const decision = '先完成首版方案，再评审实施范围；本次不扩大需求范围。'
  const action = { task: '整理首版方案及待确认清单，并同步给参会人。', owner: collaborator, due }
  return [
    { id: 'transcript-1', offset: offset(0), speaker: lead, text: `今天围绕「${meeting.topic}」对齐讨论范围、首版交付和后续分工。` },
    { id: 'transcript-2', offset: offset(0.15), speaker: collaborator, text: '建议先把已有信息和待确认问题整理成一版方案，避免在资料不完整时直接推进实施。' },
    { id: 'transcript-3', offset: offset(0.35), speaker: lead, text: decision, decision },
    { id: 'transcript-4', offset: offset(0.55), speaker: collaborator, text: `我负责${action.task}截止时间为 ${due}（北京时间）。`, action },
    { id: 'transcript-5', offset: offset(0.8), speaker: reviewer, text: '首版方案发出后由参会人共同评审。具体评审时间尚未确定。', decision: '首版方案发出后共同评审，具体评审时间待定。' }
  ]
}

export function summarizeDemoMinutes(meeting: MeetingSnapshot, minutes: FeishuMinutesSource): MeetingSummary | undefined {
  if (minutes.provider !== 'feishu-minutes' || !meeting.meetingId || minutes.meetingId !== meeting.meetingId || !minutes.readAt) return undefined
  const lines = minutes.transcript
  if (!lines.length || lines.every((line) => !line.text.trim())) return undefined
  // Recorder produces the overview and decisions; follow-up specialist checks
  // action owners/deadlines against the same Minutes content before delivery.
  const decisions = lines.filter((line) => line.decision).map((line) => ({ text: line.decision!, sourceId: line.id }))
  const actions = lines.filter((line) => line.action).map((line) => ({ ...line.action!, sourceId: line.id }))
  if (actions.some((action) => !meeting.participants.some((person) => person.id === action.owner.id) || !lines.find((line) => line.id === action.sourceId)?.text.includes(action.due))) return undefined
  return {
    sourceMinutesId: minutes.id,
    expertGroupId: meetingExpertGroup.id,
    overview: `围绕「${meeting.topic}」讨论范围、首版交付与分工。由会议专家团依据飞书妙记示例内容整理。`,
    decisions,
    actions
  }
}

export function advanceDemoMeeting(session: FeishuMeetingSession, nextStage: MeetingStage, now = new Date()): FeishuMeetingSession {
  if (!session.meeting || session.expertGroupId !== meetingExpertGroup.id) return session
  if (session.stage === 'draft' || meetingStages[meetingStages.indexOf(session.stage) + 1] !== nextStage) return session
  const at = now.toISOString()
  let meeting = session.meeting
  let minutes = session.minutes
  let summary = session.summary
  const work: MeetingGroupWork[] = []
  const addWork = (id: string, expertId: string, title: string): void => {
    work.push({ id, expertId, title, at, sourceMinutesId: minutes?.id })
  }
  if (nextStage === 'scheduled') {
    meeting = { ...meeting, reservation: { id: `demo-reserve-${meeting.id}`, meetingNo: `DEMO-${meeting.id.slice(-9)}`, autoRecord: true } }
    addWork('meeting-created', 'meeting-planner', '已预约会议并启用自动录制')
  }
  if (nextStage === 'invited') {
    if (!meeting.reservation) return session
    meeting = { ...meeting, invitations: meeting.participants.map((person) => ({ participantId: person.id, messageId: `demo-message-${meeting.id}-${person.id}` })) }
    addWork('invitations-sent', 'meeting-planner', '已发送参会邀请')
  }
  if (nextStage === 'started') {
    if (!meeting.reservation || meeting.invitations?.length !== meeting.participants.length) return session
    meeting = { ...meeting, meetingId: `demo-meeting-${meeting.id}` }
  }
  if (meetingStages.indexOf(nextStage) >= meetingStages.indexOf('recording') && !meeting.meetingId) return session
  if (nextStage === 'recording-ready') {
    // An ended notification alone does not provide a ready recording or transcript.
    if (!session.events.some((event) => event.kind === 'ended')) return session
    minutes = { id: `demo-minutes-${meeting.meetingId}`, provider: 'feishu-minutes', mode: 'demo', meetingId: meeting.meetingId!, title: `${meeting.topic} · 妙记`, recordedAt: meeting.start, transcript: [] }
    addWork('minutes-linked', 'meeting-planner', '已关联本场会议的飞书妙记')
  }
  if (['transcribing', 'content-ready', 'summarizing', 'reviewing', 'complete'].includes(nextStage)) {
    if (!minutes || minutes.provider !== 'feishu-minutes' || minutes.meetingId !== meeting.meetingId) return session
  }
  if (nextStage === 'content-ready') {
    minutes = { ...minutes!, readAt: at, transcript: sampleTranscript(meeting) }
    addWork('minutes-read', 'meeting-recorder', '已调取飞书妙记内容')
  }
  if (['summarizing', 'reviewing', 'complete'].includes(nextStage)) {
    const candidate = summarizeDemoMinutes(meeting, minutes!)
    if (!candidate) return session
    if (nextStage === 'reviewing') addWork('summary-drafted', 'meeting-recorder', '已整理会议概述与结论')
    if (nextStage === 'complete') {
      if (!session.groupWork.some((item) => item.id === 'summary-drafted' && item.sourceMinutesId === minutes!.id)) return session
      summary = candidate
      addWork('actions-reviewed', 'meeting-followup', '已核对行动项、负责人及截止时间')
      addWork('source-checked', 'meeting-planner', '已核对妙记来源与会议信息')
    }
  }
  return { ...session, meeting, minutes, summary, stage: nextStage,
    nextStepAt: nextStage === 'complete' ? undefined : now.getTime() + stageDelayMs[nextStage]!,
    groupWork: [...session.groupWork, ...work], events: [...session.events, { kind: nextStage as MeetingEvent['kind'], at }] }
}

export function tickDemoMeetings(sessions: Record<string, FeishuMeetingSession>, now = new Date()): Record<string, FeishuMeetingSession> {
  let updated = sessions
  for (const [id, session] of Object.entries(sessions)) {
    if (session.nextStepAt === undefined || session.nextStepAt > now.getTime()) continue
    const nextStage = meetingStages[meetingStages.indexOf(session.stage) + 1]
    if (!nextStage) continue
    const next = advanceDemoMeeting(session, nextStage, now)
    if (next !== session) {
      if (updated === sessions) updated = { ...sessions }
      updated[id] = next
    }
  }
  return updated
}

export function meetingTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

export function meetingSummaryText(session: FeishuMeetingSession): string {
  const { meeting, summary } = session
  if (!meeting || !summary) return ''
  const prose = (text: string): string => text.replace(/[\r\n]+/g, ' ').replace(/[\\`*_\[\]<>#]/g, '\\$&')
  return [
    `# ${prose(meeting.topic)} · 会议摘要`, '',
    '> Web v0.1 演示 · 依据飞书妙记示例内容，非真实飞书会议内容；专家团协作为本地流程演示。', '',
    `- 内容来源：飞书妙记（示例）· ${prose(session.minutes?.title ?? '')}`,
    `- 交付团队：${prose(meetingExpertGroup.name)}`,
    `- 协作成员：${meetingExpertGroup.members.map((member) => prose(member.name)).join('、')}`,
    `- 会议时间：${meetingTimeLabel(meeting.start)} — ${meetingTimeLabel(meeting.end)}（北京时间）`,
    `- 参会人员：${meeting.participants.map((person) => prose(`${person.name}（${person.department}）`)).join('、')}`, '',
    '## 会议概述', '', prose(summary.overview), '',
    '## 会议结论', '', ...summary.decisions.map((decision) => `- ${prose(decision.text)}`), '',
    '## 行动项', '', ...summary.actions.flatMap((action, index) => [
      `### ${index + 1}. ${prose(action.task)}`, '',
      `- 负责人：${prose(action.owner.name)}（${prose(action.owner.department)}）`,
      `- 截止时间：${action.due}（北京时间）`, ''
    ])
  ].join('\n')
}

export function meetingSummaryFileName(session: FeishuMeetingSession): string {
  const topic = session.meeting?.topic.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().slice(0, 80) || '会议'
  return `${topic}-会议摘要.md`
}
