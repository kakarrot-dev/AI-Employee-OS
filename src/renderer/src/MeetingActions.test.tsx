import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDetailView } from '../../shared/task-contract'
import { FEISHU_MEETING_TOOL_IDS as ids } from '../../shared/feishu-meeting-contract'
import { MeetingActions } from './MeetingActions'

const task = (state: TaskDetailView['state'] = 'running'): TaskDetailView => ({ id: 'task', conversationId: 'conversation', draftId: 'draft', title: '会议', goal: '会议', state, acceptanceCriteria: [], employeeVersionIds: [], directories: [], draftRevision: 1, assignments: [], timeline: [], researchBundles: [], approvals: [{ id: 'approval', toolActionId: 'create', decision: 'pending' }], toolActions: [{ id: 'create', toolVersionId: ids.create, state: 'pending', risk: 'medium', approvalId: 'approval', parameters: { topic: '教学研讨会', startTime: '2026-09-08T15:00:00+08:00', endTime: '2026-09-08T15:30:00+08:00', recipientNames: ['张老师'], recipientIds: ['ou_teacher'] } }] })

describe('meeting confirmation and results', () => {
  it('shows the exact meeting and recipient before approving', async () => {
    const input = task(), onUpdate = vi.fn()
    const approveTool = vi.fn().mockResolvedValue({ ...input, approvals: [] })
    Object.defineProperty(window, 'aiEmployeeOS', { configurable: true, value: { task: { approveTool, rejectTool: vi.fn() } } })
    render(<MeetingActions task={input} onUpdate={onUpdate} />)
    expect(screen.getByText('教学研讨会')).toBeInTheDocument()
    expect(screen.getByText(/邀请名单：张老师/)).toBeInTheDocument()
    expect(approveTool).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认创建会议' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(approveTool).toHaveBeenCalledWith('create')
  })
  it('does not expose stale approval on a failed task and retains a created meeting after invitation failure', () => {
    const input = task('failed')
    input.toolActions[0] = { ...input.toolActions[0], state: 'succeeded', meetingResult: { topic: '教学研讨会', meetingNumber: '123456789', meetingUrl: 'https://vc.feishu.cn/j/123456789' } }
    input.toolActions.push({ id: 'send', toolVersionId: ids.send, state: 'result_unknown', risk: 'medium', parameters: { recipientName: '张老师' } })
    render(<MeetingActions task={input} onUpdate={vi.fn()} />)
    expect(screen.getByText('会议创建成功')).toBeInTheDocument()
    expect(screen.getByText('123456789')).toBeInTheDocument()
    expect(screen.getByText(/结果待核实/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认创建会议' })).not.toBeInTheDocument()
    expect(screen.queryByText('邀请已发送；尚未确认对方阅读或接受')).not.toBeInTheDocument()
  })
})

it('shows each Teams participant and card-only confirmation, including missing and declined responses', () => {
  const input = task('needs_attention')
  input.toolActions[0] = { ...input.toolActions[0], toolVersionId: 'teams.meetings.create@teams/v1', state: 'succeeded', parameters: { topic: '测试', attendeeIds: ['one', 'two', 'three'], attendeeNames: ['段茱文', '马二锋', '张俊'], attendeeEmails: ['a@example.com', 'b@example.com', 'c@example.com'] } }
  input.meetingConfirmation = { calendarEventId: 'event', policy: 'teams_card', confirmedCount: 1, allConfirmed: false, updatedAt: '', participants: [{ userId: 'one', name: '段茱文', email: 'a@example.com', state: 'confirmed' }, { userId: 'two', name: '马二锋', email: 'b@example.com', state: 'awaiting_confirmation' }, { userId: 'three', name: '张俊', email: 'c@example.com', state: 'declined' }] }
  render(<MeetingActions task={input} onUpdate={vi.fn()} />)
  expect(screen.getByRole('table', { name: '参会人员及卡片确认状态' })).toBeInTheDocument()
  expect(screen.getByText('已确认 1 / 3 人')).toBeInTheDocument()
  expect(screen.getByText('a@example.com')).toBeInTheDocument()
  expect(screen.getByText('已确认参加')).toBeInTheDocument()
  expect(screen.getByText('等待确认')).toBeInTheDocument()
  expect(screen.getByText('已拒绝参加')).toBeInTheDocument()
  expect(screen.getByText(/日历接受不会替代卡片回执/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '发送未发送的确认卡' })).not.toBeInTheDocument()
})
