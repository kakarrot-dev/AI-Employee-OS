import { useState } from 'react'
import { Button } from 'react-aria-components'
import { MessageActionCard } from './components/message-ui'
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
  const actions = task.toolActions.filter((action) => isFeishuMeetingTool(action.toolVersionId))
  if (!actions.length) return null
  const decide = async (id: string, approve: boolean): Promise<void> => {
    setBusy(id); setError('')
    try { onUpdate(await (approve ? window.aiEmployeeOS.task.approveTool(id) : window.aiEmployeeOS.task.rejectTool(id))) }
    catch { setError('操作未被接受，请等待状态刷新后重试。') }
    finally { setBusy(undefined) }
  }
  return <section className="message-action-group" aria-label="飞书会议办理">
    {actions.map((action) => {
      const create = action.toolVersionId === ids.create, search = action.toolVersionId === ids.search
      const data: Record<string, unknown> = { ...(create ? action.parameters : (action.parameters.meeting ?? {}) as Record<string, unknown>), ...action.meetingResult }
      const pending = action.state === 'pending' && task.approvals.some((approval) => approval.toolActionId === action.id && approval.decision === 'pending') && ['running', 'needs_attention'].includes(task.state)
      const names = Array.isArray(data.recipientNames) ? data.recipientNames.join('、') : ''
      const status = pending ? create ? '等待你确认主题、时间和邀请名单' : search ? '等待确认查找联系人' : '等待你确认发送此邀请' : action.state === 'succeeded' ? search ? '联系人查找完成' : create ? '会议创建成功' : '邀请已发送；尚未确认对方阅读或接受' : action.state === 'running' ? '正在办理，请勿重复操作' : action.state === 'result_unknown' ? '结果待核实：请在飞书核对，客户端不会自动重试。' : failure(action.failureCode)
      return <MessageActionCard key={action.id} title={search ? '查找组织内联系人' : create ? '创建飞书会议' : `发送邀请给 ${String(action.parameters.recipientName ?? '指定联系人')}`} status={status} tone={pending || action.state === 'result_unknown' ? 'waiting' : action.state === 'succeeded' ? 'success' : action.state === 'running' ? 'active' : 'danger'} actions={pending ? <><Button className="button button--quiet" isDisabled={Boolean(busy)} onPress={() => void decide(action.id, false)}>取消此动作</Button><Button className="button button--primary" isDisabled={Boolean(busy)} onPress={() => void decide(action.id, true)}>{busy === action.id ? '正在处理' : create ? '确认创建会议' : search ? '确认查找' : '确认发送邀请'}</Button></> : undefined}>
        {search ? <p>查找：{String(action.parameters.query)}。搜索不包含外部好友。</p> : <>
          <p>{String(data.topic ?? '')}</p>
          {data.startTime && <p>{time(data.startTime)} — {time(data.endTime)}（北京时间）</p>}
          {create && <p>邀请名单：{names || '仅创建会议，不发送邀请'}{names ? '（请核对同名联系人）' : ''}</p>}
          {create && Array.isArray(data.recipientIds) && data.recipientIds.length > 0 && <ul>{data.recipientIds.map((id, index) => <li key={String(id)}>{Array.isArray(data.recipientNames) ? String(data.recipientNames[index] ?? '') : ''} · 飞书联系人标识：{String(id)}</li>)}</ul>}
          {!create && <p>飞书联系人标识：{String(action.parameters.recipientId ?? '')}</p>}
          {data.meetingNumber && <p>会议号：<strong>{String(data.meetingNumber)}</strong></p>}
          {typeof data.meetingUrl === 'string' && /^https:\/\/vc\.feishu\.cn\//.test(data.meetingUrl) && <p><a href={data.meetingUrl} target="_blank" rel="noreferrer">打开入会链接</a><span> · {data.meetingUrl}</span></p>}
          {data.meetingPassword && <p>会议密码：{String(data.meetingPassword)}</p>}
          <small>以当前飞书用户身份办理；不添加日历日程。会议号在约定结束时间到期。</small>
        </>}
      </MessageActionCard>
    })}
    {error && <p role="alert">{error}</p>}
  </section>
}
