import { useEffect, useMemo, useState } from 'react'
import type { TaskDetailView } from '../../shared/runtime-contract'

const filters: Array<{ id: 'all' | TaskDetailView['state']; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'draft', label: '草稿' }, { id: 'pending', label: '待开始' }, { id: 'running', label: '运行中' }, { id: 'needs_attention', label: '需要处理' }, { id: 'succeeded', label: '已完成' }, { id: 'failed', label: '失败' }, { id: 'cancelled', label: '已取消' }
]

const labels: Record<TaskDetailView['state'], string> = { draft: '草稿', pending: '待开始', running: '运行中', needs_attention: '需要处理', succeeded: '已完成', failed: '失败', cancelled: '已取消' }

export function TaskModule(): React.JSX.Element {
  const [tasks, setTasks] = useState<TaskDetailView[]>([])
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [error, setError] = useState<string>()
  const [busyActionId, setBusyActionId] = useState<string>()

  const refresh = async (): Promise<void> => { const values = await window.aiEmployeeOS.task.list(); setTasks(values); setSelectedId((current) => current ?? values[0]?.id) }
  useEffect(() => {
    void refresh().catch(() => setError('任务投影读取失败'))
    const unsubscribe = window.aiEmployeeOS.task.onEvent(() => { void refresh() })
    return unsubscribe
  }, [])

  const visible = useMemo(() => filter === 'all' ? tasks : tasks.filter((task) => task.state === filter), [filter, tasks])
  const selected = tasks.find((task) => task.id === selectedId)
  const decideTool = async (actionId: string, decision: 'approve' | 'reject' | 'succeeded' | 'failed'): Promise<void> => {
    setBusyActionId(actionId); setError(undefined)
    try {
      const updated = decision === 'approve' ? await window.aiEmployeeOS.task.approveTool(actionId) : decision === 'reject' ? await window.aiEmployeeOS.task.rejectTool(actionId) : await window.aiEmployeeOS.task.resolveTool(actionId, decision, { userVerifiedAt: new Date().toISOString(), statement: decision === 'succeeded' ? '用户已在外部核验效果存在' : '用户已在外部核验效果未发生或失败' })
      setTasks((current) => current.map((task) => task.id === updated.id ? updated : task))
    } catch { setError('ToolAction 决策未被 Runtime 接受') } finally { setBusyActionId(undefined) }
  }

  return (
    <section className="task-module">
      <div className="task-filter" aria-label="任务筛选">{filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}<span>{item.id === 'all' ? tasks.length : tasks.filter((task) => task.state === item.id).length}</span></button>)}</div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="task-directory">
        <div className="task-list">{visible.length === 0 ? <div className="directory-empty"><h3>没有对应任务</h3><p>任务只能从总管对话生成。</p></div> : visible.map((task) => <button type="button" key={task.id} className={selectedId === task.id ? 'active' : ''} onClick={() => setSelectedId(task.id)}><span><strong>{task.goal}</strong><small>{labels[task.state]} · Draft r{task.draftRevision}{task.frozenRevision ? ` · Frozen r${task.frozenRevision}` : ''}</small></span><span>›</span></button>)}</div>
        <div className="task-detail-view">{selected ? <><div className="detail-heading"><div><span>{labels[selected.state]}</span><h3>{selected.goal}</h3></div><small>{selected.taskId ?? selected.draftId}</small></div><section className="detail-section"><h4>验收标准</h4><ul>{selected.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></section><section className="detail-section"><h4>串行计划</h4>{selected.assignments.length ? selected.assignments.map((assignment) => <article className="task-assignment" key={assignment.id}><div><strong>Assignment {assignment.sequence}</strong><span>{assignment.state}</span></div><small>{assignment.employeeVersionId}</small>{assignment.summary && <p>{assignment.summary}</p>}</article>) : <p>确认并开始后冻结 Assignment。</p>}</section>{selected.toolActions.length > 0 && <section className="detail-section"><h4>ToolAction</h4>{selected.toolActions.map((action) => { const approval = selected.approvals.find((value) => value.toolActionId === action.id); return <article className="tool-action-card" key={action.id}><div><strong>{action.toolVersionId}</strong><span>{action.state}</span></div><pre>{JSON.stringify(action.parameters, null, 2)}</pre><small>风险：{action.risk}{action.failureCode ? ` · ${action.failureCode}` : ''}</small>{action.state === 'pending' && approval?.decision === 'pending' && <div><button type="button" disabled={busyActionId === action.id} onClick={() => decideTool(action.id, 'reject')}>拒绝</button><button type="button" disabled={busyActionId === action.id} onClick={() => decideTool(action.id, 'approve')}>批准本次动作</button></div>}{action.state === 'result_unknown' && <div><button type="button" disabled={busyActionId === action.id} onClick={() => decideTool(action.id, 'failed')}>核验为失败</button><button type="button" disabled={busyActionId === action.id} onClick={() => decideTool(action.id, 'succeeded')}>核验为成功</button></div>}</article> })}</section>}{selected.researchBundles.map((bundle) => <section className="detail-section" key={bundle.id}><h4>ResearchBundle</h4><p>{bundle.sourceCount} 个来源 · {bundle.claimCount} 条 Claim</p><small>Hash {bundle.contentHash}</small>{bundle.conflicts.map((value) => <p key={value}>冲突：{value}</p>)}{bundle.informationGaps.map((value) => <p key={value}>缺口：{value}</p>)}</section>)}<section className="detail-section"><h4>时间线与 Checkpoint</h4>{selected.timeline.map((item, index) => <div className="timeline-row" key={`${item.createdAt}:${index}`}><span>{item.phase}</span><small>{item.memoryRefs?.length ? `加载记忆 ${item.memoryRefs.map((memory) => memory.id).join('、')} · ${item.memoryRefs.map((memory) => memory.reason).join('；')}` : item.nextNode ? `下一节点 ${item.nextNode}` : '无后续节点'}</small></div>)}</section>{selected.pendingChange && <section className="detail-section"><h4>待处理 ChangeRequest</h4><p>{String(selected.pendingChange.requestedDiff.goal ?? '需求发生变化')}</p></section>}{selected.delivery && <section className="detail-section delivery-card"><h4>Delivery</h4>{selected.delivery.acceptanceResults.map((result) => <p key={result.criterion}>{result.passed ? '✓' : '×'} {result.criterion}</p>)}{selected.delivery.artifacts.map((artifact) => <p key={artifact.id}>{artifact.mediaType} · {artifact.relativePath} · {artifact.sha256}</p>)}<small>{selected.delivery.evidenceCount} 条 Evidence</small>{selected.delivery.unresolvedIssues.map((value) => <p key={value}>未解决：{value}</p>)}</section>}</> : <div className="directory-empty"><h3>选择一个任务</h3><p>查看冻结版本、串行 Assignment、Checkpoint 和交付。</p></div>}</div>
      </div>
    </section>
  )
}
