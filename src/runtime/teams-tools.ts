import { TEAMS_TOOL_IDS as ids, isTeamsTool } from '../shared/teams-contract'
import type { ToolAction, Run } from './domain'
import type { RuntimeKernel } from './kernel'

/** Reuse immutable receipts only along this task's explicit run ancestry. */
export function teamsActionHistory(kernel: RuntimeKernel, runId: string, actions = kernel.store.list<ToolAction>('ToolAction')): ToolAction[] {
  const first = kernel.store.get<Run>('Run', runId)
  const runIds = new Set<string>()
  let run = first
  while (run && run.taskId === first?.taskId && !runIds.has(run.id)) {
    runIds.add(run.id)
    run = run.supersedesRunId ? kernel.store.get<Run>('Run', run.supersedesRunId) : undefined
  }
  return actions.filter(a => runIds.has(a.runId) && isTeamsTool(a.toolVersionId))
}
export function bindTeamsParameters(id: string, parameters: Record<string, unknown>, actions: ToolAction[]): Record<string, unknown> {
  if (actions.some(a => ['pending', 'running', 'result_unknown'].includes(a.state))) throw new Error('teams_action_unsettled')
  if (id === ids.search) return parameters
  const creation = actions.findLast(a => a.toolVersionId === ids.create)
  if (id === ids.create && creation) throw new Error('teams_meeting_already_attempted')
  if (id === ids.addAttendees && (!creation || creation.state !== 'succeeded' || !creation.resultVerified || creation.result?.calendarEventId !== parameters.calendarEventId)) throw new Error('teams_event_not_from_task')
  const contacts = actions.filter(a => a.toolVersionId === ids.search && a.state === 'succeeded' && a.resultVerified).flatMap(a => Array.isArray(a.result?.items) ? a.result.items as Array<{ id: string; name: string; email?: string }> : [])
  const attendeeNames = (parameters.attendeeIds as string[]).map(id => { const contact = contacts.find(c => c.id === id); if (!contact) throw new Error('teams_attendee_not_from_search'); return contact.name })
  return { ...parameters, attendeeNames, attendeeEmails: (parameters.attendeeIds as string[]).map(id => contacts.find(c => c.id === id)?.email ?? ''), ...(id === ids.addAttendees ? { meeting: { topic: creation!.result?.topic, startTime: creation!.result?.startTime, endTime: creation!.result?.endTime, meetingUrl: creation!.result?.meetingUrl } } : {}) }
}
export function remainingTeamsTools(actions: ToolAction[]): string[] {
  if (actions.some(a => ['pending','running','result_unknown'].includes(a.state))) return []
  const creation = actions.findLast(a => a.toolVersionId === ids.create)
  return [...(actions.filter(a => a.toolVersionId === ids.search).length < 10 ? [ids.search] : []), ...(!creation ? [ids.create] : creation.state === 'succeeded' && creation.resultVerified && actions.filter(a => a.toolVersionId === ids.addAttendees).length < 10 ? [ids.addAttendees] : [])]
}
export function teamsEvidenceIssue(actions: ToolAction[]): string | undefined {
  const creation = actions.findLast(a => a.toolVersionId === ids.create)
  if (actions.some(a => a.toolVersionId === ids.addAttendees && (a.state !== 'succeeded' || !a.resultVerified || !['submitted', 'already_present'].includes(String(a.result?.invitations))))) return 'Teams 补邀未取得确定回执，不得声称参会人已添加'
  if (creation) return creation.state === 'succeeded' && creation.resultVerified && typeof creation.result?.calendarEventId === 'string' && typeof creation.result?.meetingUrl === 'string' ? undefined : 'Teams 会议创建未取得确定回执，不得重复创建或声称成功'
  return actions.some(a => a.toolVersionId === ids.search && a.state === 'succeeded' && a.resultVerified && Array.isArray(a.result?.items)) ? undefined : '尚未取得 Teams 通讯录查询或会议创建的真实结果'
}
