import { useRef, useState } from 'react'
import type { TaskDetailView } from '../../shared/task-contract'
import { MessageActionCard, MessageConfirmationActions } from './components/message-ui'

const operations = {
  'document.create@local-document/v1': { title: '新建本机文档', confirm: '确认新建文档' },
  'document.read@local-document/v1': { title: '读取本机文档', confirm: '确认读取文档' },
  'document.edit@local-document/v1': { title: '修改本机文档', confirm: '确认修改文档' }
}

export function LocalDocumentActions({ task, onUpdate }: { task: TaskDetailView; onUpdate: (task: TaskDetailView) => void }): React.JSX.Element | null {
  const deciding = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const actions = task.toolActions.filter(action => Object.hasOwn(operations, action.toolVersionId) && action.state === 'pending' && task.approvals.some(approval => approval.id === action.approvalId && approval.toolActionId === action.id && approval.decision === 'pending'))
  if (!['running', 'needs_attention'].includes(task.state) || !actions.length) return null
  const decide = async (id: string, approve: boolean): Promise<void> => {
    if (deciding.current) return
    deciding.current = true; setBusy(true); setError('')
    try { onUpdate(await (approve ? window.aiEmployeeOS.task.approveTool(id) : window.aiEmployeeOS.task.rejectTool(id))) }
    catch { setError('操作未被接受，请等待状态刷新后重试。') }
    finally { deciding.current = false; setBusy(false) }
  }
  return <section className="message-action-group" aria-label="本机文档确认">
    {actions.map(action => {
      const operation = operations[action.toolVersionId as keyof typeof operations]
      const { path, content, oldText, newText } = action.parameters
      const create = action.toolVersionId === 'document.create@local-document/v1'
      const edit = action.toolVersionId === 'document.edit@local-document/v1'
      return <MessageActionCard key={action.id} title={operation.title} status="等待你确认文件操作" tone="waiting" actions={<MessageConfirmationActions cancelLabel="拒绝此动作" confirmLabel={operation.confirm} busy={busy} onCancel={() => void decide(action.id, false)} onConfirm={() => void decide(action.id, true)} />}>
        <p className="local-document-confirmation__path">文件：{typeof path === 'string' ? path : '路径缺失'}</p>
        {create && <><strong>待写入内容</strong><pre className="local-document-confirmation__preview">{typeof content === 'string' ? content : ''}</pre><small>确认后新建该文件；已有同名文件不会被覆盖。</small></>}
        {edit && <><strong>替换前文本</strong><pre className="local-document-confirmation__preview">{typeof oldText === 'string' ? oldText : ''}</pre><strong>替换后文本</strong><pre className="local-document-confirmation__preview">{typeof newText === 'string' ? newText : ''}</pre><small>仅替换唯一匹配的原文；原文不匹配时停止修改。</small></>}
        {!create && !edit && <small>确认后读取此文件，用于核对任务内容。</small>}
      </MessageActionCard>
    })}
    {error && <p role="alert">{error}</p>}
  </section>
}
