import { CdsButton } from './open-claude-ui/primitives/CdsButton'
import { NavArrowRight } from './components/cds-icons'
import type { TaskDetailView } from '../../shared/runtime-contract'
import { formatClientTimestamp } from './client-time'
import { DetailPage, DetailSectionHeader, StatusLight, SummaryList, SummaryListItem } from './components/client-ui'

export type TaskFilter = 'all' | TaskDetailView['state']

export function taskStateLabel(state: TaskDetailView['state']): string {
  return ({ draft: '待确认', pending: '等待开始', running: '进行中', succeeded: '已完成', failed: '执行失败', cancelled: '已取消', needs_attention: '需要你处理' })[state]
}

export function taskStateTone(state: TaskDetailView['state']): 'success' | 'danger' | 'active' | 'waiting' | 'muted' {
  if (state === 'succeeded') return 'success'
  if (state === 'failed' || state === 'needs_attention') return 'danger'
  if (state === 'running') return 'active'
  if (state === 'draft' || state === 'pending') return 'waiting'
  return 'muted'
}

export const taskFilters: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: '全部事项' },
  ...(['draft', 'pending', 'running', 'needs_attention', 'succeeded', 'failed', 'cancelled'] as const).map((id) => ({ id, label: taskStateLabel(id) }))
]

export function TaskModule({ tasks, total, loading, error, onRefresh, onOpen }: {
  tasks: TaskDetailView[]
  total: number
  loading: boolean
  error?: string
  onRefresh: () => void
  onOpen: (task: TaskDetailView) => void
}): React.JSX.Element {
  return <DetailPage width="wide" className="matter-list-page">
    <section aria-label="我的事项列表" aria-busy={loading}>
      <DetailSectionHeader title="我的事项" description="查看各会话的事项与当前进展" meta={loading ? '正在更新' : `${tasks.length} / ${total} 项`} />
      {error && <div className="inline-error" role="alert">{error} <CdsButton variant="secondary" size="sm" type="button" onClick={onRefresh} disabled={loading}>重新读取</CdsButton></div>}
      {loading && total === 0 ? <p className="empty-state" role="status">正在读取事项</p> : tasks.length > 0 ? <SummaryList emptyMessage="" variant="outlined">{tasks.map((task) => {
        const employees = [...new Set(task.assignments.map((assignment) => assignment.employeeName ?? `员工 ${assignment.sequence}`))]
        const updatedAt = task.runCompletedAt ?? task.delivery?.createdAt ?? task.timeline.at(-1)?.createdAt ?? task.runStartedAt ?? task.createdAt
        const label = task.state === 'needs_attention' && task.meetingConfirmation && !task.meetingConfirmation.allConfirmed ? '等待参会人确认' : taskStateLabel(task.state)
        return <SummaryListItem key={task.id} title={task.title} subtitle={employees.length ? employees.join('、') : '待安排员工'} onClick={() => onOpen(task)} trailing={<><span className="matter-list__meta"><StatusLight state={taskStateTone(task.state)} label={label} breathing={task.state === 'running'} />{updatedAt && <time className="quiet-meta" dateTime={updatedAt}>{formatClientTimestamp(updatedAt)}</time>}</span><NavArrowRight aria-hidden /></>} />
      })}</SummaryList> : !error && <div className="runtime-empty-state"><h3>{total === 0 ? '暂无事项' : '没有匹配的事项'}</h3><p>{total === 0 ? '在消息中向总管提出需求，创建的事项会显示在这里。' : '试试其他关键词或状态筛选。'}</p></div>}
    </section>
  </DetailPage>
}
