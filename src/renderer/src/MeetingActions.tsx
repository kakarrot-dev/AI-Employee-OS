import { Button } from 'react-aria-components'
import { TeamsParticipantList } from './TeamsParticipantList'
import type { TeamsParticipantConfirmation } from '../../shared/teams-contract'
import { TEAMS_TOOL_IDS, isTeamsTool } from '../../shared/teams-contract'
import { useState } from 'react'
import { MessageActionCard, MessageConfirmationActions } from './components/message-ui'
import { FEISHU_MEETING_TOOL_IDS as ids, isFeishuMeetingTool } from '../../shared/feishu-meeting-contract'
import type { TaskDetailView } from '../../shared/task-contract'

function time(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '时间待核实'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value))
}
function failure(code?: string): string {
  if (code === 'approval_rejected') return '你已取消此动作。'
  if (code === 'invalid_meeting_time') return '会议时间已过或不符合预约范围，请核对后重新安排。'
  if (code === 'feishu_meeting_authorization_required' || code === 'tool_unavailable') return '会议授权不可用，请到连接页检查飞书会议权限。'
  if (code === 'feishu_meeting_api_failed' || code === 'feishu_document_forbidden') return '飞书未接受此请求，请核对应用权限、收件人和可触达范围。'
  return '本次动作未完成，请核对飞书中的实际结果；已创建的会议和已发送的邀请会保留。'
}

export function MeetingActions({ task, onUpdate }: { task: TaskDetailView; onUpdate: (task: TaskDetailView) => void }): React.JSX.Element | null {
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const actions = task.toolActions.filter((action) => isFeishuMeetingTool(action.toolVersionId) || isTeamsTool(action.toolVersionId))
  const teamsWrites = actions.filter(action => [TEAMS_TOOL_IDS.create, TEAMS_TOOL_IDS.addAttendees].includes(action.toolVersionId as typeof TEAMS_TOOL_IDS.create))
  const participants: TeamsParticipantConfirmation[] = task.meetingConfirmation?.participants ?? [...new Map(teamsWrites.flatMap(action => (Array.isArray(action.parameters.attendeeIds) ? action.parameters.attendeeIds as string[] : []).map((userId, index) => [userId, { userId, name: String((action.parameters.attendeeNames as string[] | undefined)?.[index] ?? ''), email: String((action.parameters.attendeeEmails as string[] | undefined)?.[index] ?? ''), state: 'not_sent' as const }] as const))).values()]
  const confirmedCount = participants.filter(person => person.state === 'confirmed').length
  const hasCreatedMeeting = teamsWrites.some(action => action.toolVersionId === TEAMS_TOOL_IDS.create && action.state === 'succeeded')
  const sendCards = async (): Promise<void> => {
    setBusy('cards'); setError('')
    try {
      await window.aiEmployeeOS.connection.sendTeamsConfirmationCards(task.id)
      const refreshed = (await window.aiEmployeeOS.task.list()).find(item => item.id === task.id)
      if (refreshed) onUpdate(refreshed)
    } catch { setError('确认卡尚未全部发送。请检查 Bot 回调连接，并请未收到卡片的参会人在 Teams 中打开会议助手。已发送的卡片不会重复发送。') }
    finally { setBusy(undefined) }
  }
  if (!actions.length) return null
  const decide = async (id: string, approve: boolean): Promise<void> => {
    setBusy(id); setError('')
    try { onUpdate(await (approve ? window.aiEmployeeOS.task.approveTool(id) : window.aiEmployeeOS.task.rejectTool(id))) }
    catch { setError('操作未被接受，请等待状态刷新后重试。') }
    finally { setBusy(undefined) }
  }
  return <section className="message-action-group" aria-label="会议办理">
    {actions.map((action) => {
      const teams = isTeamsTool(action.toolVersionId)
      const create = action.toolVersionId === ids.create || action.toolVersionId === TEAMS_TOOL_IDS.create, search = action.toolVersionId === ids.search || action.toolVersionId === TEAMS_TOOL_IDS.search
      const add = action.toolVersionId === TEAMS_TOOL_IDS.addAttendees
      const data: Record<string, unknown> = { ...((create || add) ? { ...action.parameters, ...(action.parameters.meeting as Record<string, unknown> ?? {}) } : (action.parameters.meeting ?? {}) as Record<string, unknown>), ...action.meetingResult }
      if (teams) { data.recipientNames = data.attendeeNames ?? data.recipientNames; data.recipientIds = data.attendeeIds }
      const pending = action.state === 'pending' && task.approvals.some((approval) => approval.toolActionId === action.id && approval.decision === 'pending') && ['running', 'needs_attention'].includes(task.state)
      const names = Array.isArray(data.recipientNames) ? data.recipientNames.join('、') : ''
      const status = pending ? create ? '等待你确认主题、时间和邀请名单' : search ? '等待确认查找联系人' : '等待你确认发送此邀请' : action.state === 'succeeded' ? search ? '联系人查找完成' : create ? teams ? '会议已创建；参会确认见下方' : '会议创建成功' : '邀请已提交；尚未确认对方接受' : action.state === 'running' ? '正在办理，请勿重复操作' : action.state === 'result_unknown' ? `结果待核实：请在 ${teams ? 'Teams 日历' : '飞书'} 核对，客户端不会自动重试。` : teams ? 'Teams 请求未完成，请检查连接、权限或日历中的实际结果。' : failure(action.failureCode)
      return <MessageActionCard key={action.id} title={search ? '查找组织内联系人' : create ? teams ? '创建 Teams 日历会议' : '创建飞书会议' : add ? '给 Teams 会议添加参会人' : `发送邀请给 ${String(action.parameters.recipientName ?? '指定联系人')}`} status={status} tone={pending || action.state === 'result_unknown' ? 'waiting' : action.state === 'succeeded' ? 'success' : action.state === 'running' ? 'active' : 'danger'} actions={pending ? <MessageConfirmationActions cancelLabel="取消此动作" confirmLabel={create ? teams ? '创建会议并发送确认卡' : '确认创建会议' : search ? '确认查找' : '确认发送邀请'} busy={Boolean(busy)} onCancel={() => void decide(action.id, false)} onConfirm={() => void decide(action.id, true)} /> : undefined}>
        {search ? <p>查找：{String(action.parameters.query)}。搜索不包含外部好友。</p> : <>
          <p>{String(data.topic ?? '')}</p>
          {data.startTime && <p>{time(data.startTime)} — {time(data.endTime)}（北京时间）</p>}
          {(create || add) && <p>邀请名单：{names || '仅创建会议，不发送邀请'}{names ? '（请核对同名联系人）' : ''}</p>}
          {(create || add) && Array.isArray(data.recipientIds) && data.recipientIds.length > 0 && <ul>{data.recipientIds.map((id, index) => <li key={String(id)}>{Array.isArray(data.recipientNames) ? String(data.recipientNames[index] ?? '') : ''} · {teams ? 'Teams' : '飞书'} 联系人标识：{String(id)}</li>)}</ul>}
          {!create && !add && <p>飞书联系人标识：{String(action.parameters.recipientId ?? '')}</p>}
          {data.meetingNumber && <p>会议号：<strong>{String(data.meetingNumber)}</strong></p>}
          {typeof data.meetingUrl === 'string' && /^https:\/\/(?:vc\.feishu\.cn|teams\.microsoft\.com)\//.test(data.meetingUrl) && <p><a href={data.meetingUrl} target="_blank" rel="noreferrer">打开入会链接</a><span> · {data.meetingUrl}</span></p>}
          {data.meetingPassword && <p>会议密码：{String(data.meetingPassword)}</p>}
          <small>{teams ? '由 Teams 连接中指定的组织者创建；确认后提交日历邀请，并向参会人发送 Teams 确认卡；全员点击卡片确认后，事项才完成。' : '以当前飞书用户身份办理；不添加日历日程。会议号在约定结束时间到期。'}</small>
        </>}
      </MessageActionCard>
    })}
    {participants.length > 0 && <MessageActionCard title="参会人员确认" status={`已确认 ${confirmedCount} / ${participants.length} 人`} tone={confirmedCount === participants.length ? 'success' : 'waiting'} actions={hasCreatedMeeting && participants.some(person => person.state === 'not_sent') ? <Button className="button button--primary" isDisabled={Boolean(busy)} onPress={() => void sendCards()}>{busy === 'cards' ? '正在发送' : '发送未发送的确认卡'}</Button> : undefined}>
      <TeamsParticipantList participants={participants} />
      <small>{hasCreatedMeeting ? '只有参会人在 Teams 卡片中点击确认才计入已确认；日历接受不会替代卡片回执。' : '会议尚未创建；确认创建后将发送卡片。'}{participants.some(person => person.state === 'not_sent') && hasCreatedMeeting ? ' 卡片未发送时，请检查 Bot 回调连接和参会人的 Bot 私聊是否可用。' : ''}</small>
    </MessageActionCard>}
    {error && <p role="alert">{error}</p>}
  </section>
}
