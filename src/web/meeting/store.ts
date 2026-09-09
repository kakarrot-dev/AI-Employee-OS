import type { ConversationMessageView, ConversationSummaryView, TaskDetailView } from '../../shared/runtime-contract'
import type { ExpertGroupView } from '../../shared/expert-group-contract'
import { createFeishuMeetingSession, meetingExpertGroup, meetingStageStatus, meetingStages, meetingSummaryFileName, meetingTimeLabel, scheduleDemoMeeting, tickDemoMeetings, type FeishuMeetingSession, type MeetingDraft, type MeetingErrors } from './demo'

export const meetingGroupView: ExpertGroupView = {
  id: meetingExpertGroup.id, name: meetingExpertGroup.name,
  description: `${meetingExpertGroup.description} Web 场景演示，未连接飞书或模型。`,
  createdAt: '2026-09-09T00:00:00.000Z', status: 'active',
  members: meetingExpertGroup.members.map((member) => ({ employeeId: member.id, name: member.name, role: member.responsibility, status: 'draft' }))
}

export class MeetingStore {
  private sessions: Record<string, FeishuMeetingSession> = {}
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  get = (id: string): FeishuMeetingSession | undefined => this.sessions[id]
  create(id: string): void { this.sessions = { ...this.sessions, [id]: createFeishuMeetingSession() }; this.publish() }
  updateDraft(id: string, patch: Partial<MeetingDraft>): void {
    const session = this.sessions[id]
    if (!session || session.stage !== 'draft') return
    this.sessions = { ...this.sessions, [id]: { ...session, draft: { ...session.draft, ...patch } } }
    this.publish()
  }
  submit(id: string): MeetingErrors {
    const session = this.sessions[id]
    if (!session) throw new Error('会议会话不存在')
    const result = scheduleDemoMeeting(session)
    if (result.session !== session) { this.sessions = { ...this.sessions, [id]: result.session }; this.publish() }
    return result.errors
  }
  archive(id: string): void {
    if (!this.sessions[id]) return
    const next = { ...this.sessions }; delete next[id]; this.sessions = next; this.publish()
  }
  dispose(): void { clearTimeout(this.timer); this.listeners.clear() }
  private publish(): void {
    clearTimeout(this.timer)
    const deadlines = Object.values(this.sessions).flatMap((session) => session.nextStepAt === undefined ? [] : [session.nextStepAt])
    if (deadlines.length) this.timer = setTimeout(() => {
      this.sessions = tickDemoMeetings(this.sessions)
      this.publish()
    }, Math.max(1, Math.min(...deadlines) - Date.now()))
    this.listeners.forEach((listener) => listener())
  }
  summary(value: ConversationSummaryView): ConversationSummaryView {
    const session = this.sessions[value.id]
    return session ? { ...value, title: session.meeting?.topic ?? meetingExpertGroup.name, preview: `${meetingExpertGroup.name}：${meetingStageStatus[session.stage].title}（演示）`, updatedAt: [session.events.at(-1)?.at ?? value.updatedAt, value.updatedAt].sort().at(-1)!, lastMessageRole: undefined, lastMessageContent: undefined, messageCount: value.messageCount + session.events.length } : value
  }
}

const literal = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_\[\]<>#|]/g, '\\$&')
export function meetingRequest(id: string, session: FeishuMeetingSession): ConversationMessageView[] {
  const meeting = session.meeting
  if (!meeting) return []
  return [{ id: `${id}:submitted`, role: 'user', createdAt: session.events[0].at, content: [
    '请安排飞书会议，并由会议专家团在会后交付摘要。', '',
    `- **会议主题**：${literal(meeting.topic)}`,
    `- **会议时间**：${meetingTimeLabel(meeting.start)} — ${meetingTimeLabel(meeting.end)}（北京时间）`,
    `- **参会人员**：${meeting.participants.map((person) => literal(`${person.name}（${person.department}）`)).join('、')}`,
    '- **办理设置**：自动录制、会后生成摘要（本地演示）'
  ].join('\n') }]
}

export function meetingTask(id: string, session: FeishuMeetingSession): TaskDetailView | undefined {
  if (!session.meeting) return undefined
  const complete = session.stage === 'complete'
  const taskId = `meeting-task:${id}`
  const at = session.events[0].at
  const lastAt = session.events.at(-1)!.at
  const acceptanceCriteria = ['完成会议预约与参会邀请（演示）', '根据本场飞书妙记核对结论和行动项（演示）', '交付可预览和下载的会议摘要文档（演示）']
  return {
    id: taskId, taskId, draftId: `${taskId}:draft`, conversationId: id, createdAt: at, sourceMessageIds: [`${id}:submitted`],
    title: `${session.meeting.topic} · 会议与摘要`, goal: `安排「${session.meeting.topic}」会议并根据飞书妙记交付摘要。全程为本地演示，不代表真实外部操作。`,
    state: complete ? 'succeeded' : 'running', acceptanceCriteria, employeeVersionIds: meetingExpertGroup.members.map((member) => `demo:${member.id}`),
    directories: [], draftRevision: 1, frozenRevision: 1, runId: `${taskId}:run`, runStartedAt: at, runCompletedAt: complete ? lastAt : undefined,
    assignments: meetingExpertGroup.members.map((member, index) => {
      const lastWork = session.groupWork.filter((work) => work.expertId === member.id).at(-1)
      const started = index === 0 || meetingStages.indexOf(session.stage) >= meetingStages.indexOf(index === 1 ? 'content-ready' : 'summarizing')
      return { id: `${taskId}:${member.id}`, sequence: index + 1, employeeId: member.id, employeeVersionId: `demo:${member.id}`, employeeName: member.name, employeeRole: member.responsibility, state: complete ? 'succeeded' : started ? 'running' : 'pending', createdAt: at, completedAt: complete ? lastAt : undefined, summary: lastWork?.title }
    }),
    timeline: session.events.map((event) => ({ phase: event.kind === 'submitted' ? 'created' : event.kind === 'complete' ? 'delivery_committed' : `meeting:${event.kind}`, createdAt: event.at })),
    delivery: complete ? { id: `${taskId}:delivery`, createdAt: lastAt, content: { schemaVersion: 1, title: '会议摘要已交付', summary: '会议专家团已依据本场飞书妙记示例完成整理与核对，摘要可预览和下载。', detail: { label: '查看专家团协作记录', content: session.groupWork.filter((work) => ['summary-drafted', 'actions-reviewed', 'source-checked'].includes(work.id)).map((work) => `${meetingExpertGroup.members.find((member) => member.id === work.expertId)!.name}：${work.title}`).join('\n\n') }, metrics: [{ label: '协作专家', value: '3' }, { label: '完成要求', value: '3/3' }, { label: '交付文档', value: '1' }] }, acceptanceResults: acceptanceCriteria.map((criterion) => ({ criterion, passed: true })), artifacts: [{ id: `${taskId}:summary`, mediaType: 'text/markdown', relativePath: meetingSummaryFileName(session), sha256: 'demo-no-audit-hash' }], evidenceCount: 1, unresolvedIssues: ['演示记录：飞书妙记、专家团执行及验收均为本地示例。'] } : undefined,
    researchBundles: [], toolActions: [], approvals: []
  }
}
