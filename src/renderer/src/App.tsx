import { useEffect, useMemo, useState } from 'react'
import type { ConversationMessageView, ProviderStatus, RuntimeStatus, TaskDetailView } from '../../shared/runtime-contract'
import { TeamModule } from './TeamModule'
import { TaskModule } from './TaskModule'
import { ResourceModule } from './ResourceModule'
import { MemoryModule } from './MemoryModule'

type ModuleId = 'workbench' | 'tasks' | 'team' | 'resources' | 'memory' | 'settings'

interface ModuleDefinition {
  id: ModuleId
  label: string
  mark: string
  title: string
  description: string
  contextTitle: string
  contextItems: string[]
}

const modules: ModuleDefinition[] = [
  { id: 'workbench', label: '工作台', mark: '工', title: '工作台', description: '与总管对话，并在同一空间查看任务草稿和运行进度。', contextTitle: '最近对话', contextItems: ['开始第一次对话'] },
  { id: 'tasks', label: '任务', mark: '任', title: '任务', description: '任务只从总管对话生成，这里展示 Runtime 的只读状态投影。', contextTitle: '任务视图', contextItems: ['全部任务', '需要处理', '已完成'] },
  { id: 'team', label: '团队', mark: '团', title: '团队', description: '管理 Agent 员工及其版本；能力目录保持只读。', contextTitle: '团队目录', contextItems: ['Agent 员工', 'Agent 能力'] },
  { id: 'resources', label: '资源', mark: '资', title: '资源', description: '查看内置 Skill、Tool、MCP 与数据源的可用性和依赖。', contextTitle: '资源类型', contextItems: ['Skill', 'Tool', 'MCP', '数据源'] },
  { id: 'memory', label: '记忆', mark: '忆', title: '记忆', description: '查看、修正、停用和删除本地记忆。', contextTitle: '记忆范围', contextItems: ['全部记忆', '对话记忆', '任务经验'] },
  { id: 'settings', label: '设置', mark: '设', title: '设置', description: '配置本地运行、模型服务、预算与存储治理。', contextTitle: '设置', contextItems: ['本地运行', '模型服务', '预算', '存储'] }
]

const initialStatus: RuntimeStatus = {
  state: 'disconnected',
  checkedAt: new Date(0).toISOString(),
  message: '正在读取 Runtime 状态'
}

const initialProviderStatus: ProviderStatus = {
  state: 'starting',
  credentialStatus: { deepseek: 'missing', poe: 'missing' },
  models: [],
  checkedAt: new Date(0).toISOString()
}

function Workbench({ runtimeStatus }: { runtimeStatus: RuntimeStatus }): React.JSX.Element {
  const conversationId = 'local-supervisor'
  const [messages, setMessages] = useState<ConversationMessageView[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string>()
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string>()
  const [tasks, setTasks] = useState<TaskDetailView[]>([])
  const [taskBusy, setTaskBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    window.aiEmployeeOS.conversation.history(conversationId).then((history) => { if (mounted) setMessages(history) }).catch(() => { if (mounted) setError('历史对话读取失败') })
    window.aiEmployeeOS.task.list().then((items) => { if (mounted) setTasks(items) }).catch(() => { if (mounted) setError('任务投影读取失败') })
    const unsubscribe = window.aiEmployeeOS.conversation.onEvent((event) => {
      if (event.type === 'output_delta') {
        setMessages((current) => {
          const id = `stream:${event.requestId}`
          const existing = current.find((message) => message.id === id)
          if (existing) return current.map((message) => message.id === id ? { ...message, content: message.content + event.delta } : message)
          return [...current, { id, role: 'assistant', content: event.delta, createdAt: new Date().toISOString(), modelId: 'deepseek-v4-pro' }]
        })
      } else if (event.type === 'completed') {
        setSending(false)
        setActiveRequestId(undefined)
        setCancelling(false)
      } else if (event.type === 'failed') {
        setSending(false)
        setActiveRequestId(undefined)
        setCancelling(false)
        setError(`模型请求失败：${event.code}`)
      }
    })
    const unsubscribeTask = window.aiEmployeeOS.task.onEvent(() => { window.aiEmployeeOS.task.list().then((items) => { if (mounted) setTasks(items) }) })
    return () => { mounted = false; unsubscribe(); unsubscribeTask() }
  }, [])

  const activeTask = tasks[0]

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending || runtimeStatus.state !== 'connected') return
    setDraft('')
    setError(undefined)
    setSending(true)
    const optimisticId = `local:${Date.now()}`
    setMessages((current) => [...current, { id: optimisticId, role: 'user', content: text, createdAt: new Date().toISOString() }])
    try {
      const result = await window.aiEmployeeOS.conversation.send(conversationId, text)
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, id: result.messageId } : message))
      setActiveRequestId(result.requestId)
    } catch {
      setSending(false)
      setError('消息未进入 Runtime')
    }
  }

  const cancel = async (): Promise<void> => {
    if (!activeRequestId || cancelling) return
    setCancelling(true)
    try {
      await window.aiEmployeeOS.conversation.cancel(activeRequestId)
    } catch {
      setCancelling(false)
      setError('取消请求未进入 Runtime')
    }
  }

  const createTaskDraft = async (): Promise<void> => {
    const source = [...messages].reverse().find((message) => message.role === 'user')
    if (!source) return
    setTaskBusy(true); setError(undefined)
    try {
      const employee = (await window.aiEmployeeOS.employee.list()).find((item) => item.status === 'active' && item.activeVersionId)
      if (!employee?.activeVersionId) throw new Error('没有可工作的已发布员工，请先在团队中创建并测试员工')
      const created = await window.aiEmployeeOS.task.createDraft({ conversationId, sourceMessageIds: [source.id], goal: source.content, acceptanceCriteria: ['完成目标并给出可验证的最终结果'], employeeVersionIds: [employee.activeVersionId] })
      setTasks((current) => [created, ...current])
    } catch (reason) { setError(reason instanceof Error ? reason.message : '任务草稿创建失败') } finally { setTaskBusy(false) }
  }

  const startTask = async (): Promise<void> => {
    if (!activeTask || activeTask.state !== 'draft') return
    setTaskBusy(true); setError(undefined)
    try { const started = await window.aiEmployeeOS.task.start(activeTask.draftId); setTasks((current) => current.map((item) => item.draftId === started.draftId ? started : item)) } catch (reason) { setError(reason instanceof Error ? reason.message : '任务启动失败') } finally { setTaskBusy(false) }
  }

  const requestTaskChange = async (): Promise<void> => {
    const source = [...messages].reverse().find((message) => message.role === 'user')
    if (!activeTask?.taskId || !source) return
    setTaskBusy(true); setError(undefined)
    try { await window.aiEmployeeOS.task.requestChange(activeTask.taskId, source.id, { goal: source.content }); setTasks(await window.aiEmployeeOS.task.list()) } catch (reason) { setError(reason instanceof Error ? reason.message : '变更请求创建失败') } finally { setTaskBusy(false) }
  }

  const decideTaskChange = async (accepted: boolean): Promise<void> => {
    if (!activeTask?.pendingChange) return
    setTaskBusy(true); setError(undefined)
    try {
      const value = accepted ? await window.aiEmployeeOS.task.acceptChange(activeTask.pendingChange.id, { goal: String(activeTask.pendingChange.requestedDiff.goal ?? activeTask.goal), acceptanceCriteria: activeTask.acceptanceCriteria, employeeVersionIds: activeTask.employeeVersionIds }) : await window.aiEmployeeOS.task.rejectChange(activeTask.pendingChange.id)
      setTasks((current) => current.map((item) => item.id === value.id ? value : item))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '变更决策失败') } finally { setTaskBusy(false) }
  }

  return (
    <div className="workspace-grid">
      <section className="conversation-pane" aria-labelledby="conversation-title">
        <div className="conversation-scroll">
          {messages.length === 0 ? <div className="conversation-intro"><div className="supervisor-mark" aria-hidden="true">AI</div><p className="eyeline">本地总管</p><h2 id="conversation-title">从一段对话开始</h2><p>描述目标，总管会先澄清需求；只有你确认任务草稿后，Runtime 才会开始执行。</p></div> : <div className="message-list" aria-live="polite">{messages.map((message) => <article key={message.id} className={`message message--${message.role}`}><span>{message.role === 'user' ? '你' : '总管'}</span><p>{message.content}</p>{message.modelId && <small>{message.modelId}</small>}</article>)}</div>}
        </div>
        <form className="composer" onSubmit={submit}>
          <label htmlFor="supervisor-input">给总管发送消息</label>
          <div><textarea id="supervisor-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="描述你希望 AI 员工完成的工作" disabled={runtimeStatus.state !== 'connected' || sending} />{sending && activeRequestId ? <button type="button" className="cancel-button" onClick={cancel} disabled={cancelling}>{cancelling ? '取消中' : '取消'}</button> : <button type="submit" disabled={!draft.trim() || sending || runtimeStatus.state !== 'connected'}>{sending ? '处理中' : '发送'}</button>}</div>
          {error && <p className="composer-error" role="alert">{error}</p>}
        </form>
      </section>
      <aside className="task-pane" aria-label="任务面板">
        <div className="panel-heading">
          <span>任务面板</span>
          <span className="quiet-badge">只读</span>
        </div>
        {activeTask ? <div className="task-projection"><span className={`task-state task-state--${activeTask.state}`}>{activeTask.state}</span><h3>{activeTask.goal}</h3><h4>验收标准</h4><ul>{activeTask.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul><h4>冻结员工</h4><p>{activeTask.employeeVersionIds.join('、')}</p>{activeTask.assignments.length > 0 && <><h4>串行 Assignment</h4>{activeTask.assignments.map((assignment) => <div className="assignment-row" key={assignment.id}><span>{assignment.sequence}. {assignment.state}</span><small>{assignment.employeeVersionId}</small></div>)}</>}{activeTask.timeline.length > 0 && <><h4>Runtime 时间线</h4>{activeTask.timeline.map((item, index) => <div className="timeline-row" key={`${item.phase}:${index}`}><span>{item.phase}</span><small>{item.nextNode ? `下一步 ${item.nextNode}` : '终态'}</small></div>)}</>}{activeTask.delivery && <div className="delivery-card"><strong>交付已固化</strong>{activeTask.delivery.acceptanceResults.map((item) => <p key={item.criterion}>{item.passed ? '✓' : '×'} {item.criterion}</p>)}</div>}{activeTask.pendingChange && <div className="change-card"><strong>待处理变更</strong><p>{String(activeTask.pendingChange.requestedDiff.goal ?? '需求已变化')}</p>{activeTask.state === 'needs_attention' ? <div><button type="button" onClick={() => decideTaskChange(false)}>保持原任务</button><button type="button" onClick={() => decideTaskChange(true)}>接受并启动新 Revision</button></div> : <small>将在当前节点完成并提交 Checkpoint 后暂停</small>}</div>}{activeTask.state === 'draft' && <button type="button" className="confirm-task" onClick={startTask} disabled={taskBusy}>{taskBusy ? '正在冻结' : '确认并开始'}</button>}{activeTask.state === 'running' && !activeTask.pendingChange && <button type="button" className="confirm-task secondary" onClick={requestTaskChange} disabled={taskBusy}>将最新消息作为变更请求</button>}</div> : <><div className="empty-lines" aria-hidden="true"><span /><span /><span /></div><p>总管识别到工作意图后，需由你明确同意才能形成正式任务。</p>{messages.some((message) => message.role === 'user') && <button type="button" className="confirm-task" onClick={createTaskDraft} disabled={taskBusy}>{taskBusy ? '正在生成' : '同意转为任务草稿'}</button>}</>}
      </aside>
    </div>
  )
}

function ModuleEmptyState({ module }: { module: ModuleDefinition }): React.JSX.Element {
  return (
    <section className="module-empty" aria-labelledby="module-empty-title">
      <span className="module-index" aria-hidden="true">{module.mark}</span>
      <h2 id="module-empty-title">{module.title}尚无数据</h2>
      <p>{module.description}</p>
      <div className="boundary-note">数据将在对应 Phase 由 Local Control Runtime 提供；客户端不会自行生成业务状态。</div>
    </section>
  )
}

function ProviderSettings({ status }: { status: ProviderStatus }): React.JSX.Element {
  return (
    <section className="provider-settings" aria-labelledby="provider-settings-title">
      <div className="provider-settings__heading">
        <div><p>本地 Provider Service</p><h2 id="provider-settings-title">模型服务</h2></div>
        <span className={`service-state service-state--${status.state}`}>{status.state === 'ready' ? '可用' : status.state === 'degraded' ? '部分可用' : '未连接'}</span>
      </div>
      <div className="provider-groups">
        {(['deepseek', 'poe'] as const).map((provider) => (
          <div className="provider-group" key={provider}>
            <div className="provider-group__title"><strong>{provider === 'deepseek' ? 'DeepSeek' : 'Poe'}</strong><span>{status.credentialStatus[provider] === 'configured' ? 'Credential 已配置' : 'Credential 未配置'}</span></div>
            <div className="model-rows">
              {status.models.filter((model) => model.provider === provider).map((model) => <div className="model-row" key={model.modelId}><div><strong>{model.modelId}</strong><span>{model.modality}</span></div><span className={model.verification === 'verified' ? 'verified' : 'unverified'}>{model.verification === 'verified' ? '已验证' : '待验证'}</span></div>)}
            </div>
          </div>
        ))}
      </div>
      <p className="provider-boundary">Renderer 只能读取状态和精确 Model ID；Credential 正文只在 Provider Service 内按需读取。</p>
    </section>
  )
}

export function App(): React.JSX.Element {
  const [activeId, setActiveId] = useState<ModuleId>('workbench')
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(initialStatus)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(initialProviderStatus)
  const activeModule = useMemo(() => modules.find((module) => module.id === activeId)!, [activeId])
  const runtimeLabel = runtimeStatus.state === 'connected' ? 'Runtime 已连接' : runtimeStatus.state === 'connecting' ? '正在连接' : 'Runtime 未连接'

  useEffect(() => {
    let mounted = true
    window.aiEmployeeOS.runtime.getStatus().then((status) => {
      if (mounted) setRuntimeStatus(status)
    })
    window.aiEmployeeOS.provider.getStatus().then((status) => {
      if (mounted) setProviderStatus(status)
    })
    const unsubscribe = window.aiEmployeeOS.runtime.onStatusChanged(setRuntimeStatus)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const reconnect = async (): Promise<void> => {
    setRuntimeStatus(await window.aiEmployeeOS.runtime.reconnect())
  }

  return (
    <main className="app-shell">
      <header className="titlebar">
        <div className="titlebar-brand"><span className="brand-dot" />AI Employee OS <span>本地开发</span></div>
        <button type="button" className={`runtime-status runtime-status--${runtimeStatus.state}`} onClick={reconnect} disabled={runtimeStatus.state === 'connecting'}>
          <span className="status-dot" />{runtimeLabel}
        </button>
      </header>

      <nav className="primary-nav" aria-label="一级导航">
        <div className="brand-mark" aria-label="AI Employee OS">AE</div>
        <div className="nav-items">
          {modules.map((module) => (
            <button key={module.id} type="button" className={activeId === module.id ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => setActiveId(module.id)} aria-current={activeId === module.id ? 'page' : undefined}>
              <span aria-hidden="true">{module.mark}</span><small>{module.label}</small>
            </button>
          ))}
        </div>
      </nav>

      <aside className="context-pane">
        <div className="context-header"><p>{activeModule.contextTitle}</p><span>{activeModule.contextItems.length}</span></div>
        <div className="context-list">
          {activeModule.contextItems.map((item, index) => <button type="button" key={item} className={index === 0 ? 'context-item context-item--active' : 'context-item'}>{item}<span aria-hidden="true">›</span></button>)}
        </div>
        <div className="context-footer"><span className={`status-dot status-dot--${runtimeStatus.state}`} /><div><strong>{runtimeStatus.message}</strong><small>点击顶部状态可重新检查</small></div></div>
      </aside>

      <section className="content-pane">
        <div className="content-header"><div><p>AI EMPLOYEE OS</p><h1>{activeModule.title}</h1><span>{activeModule.description}</span></div></div>
        <div className="content-body">{activeId === 'workbench' ? <Workbench runtimeStatus={runtimeStatus} /> : activeId === 'tasks' ? <TaskModule /> : activeId === 'team' ? <TeamModule /> : activeId === 'resources' ? <ResourceModule /> : activeId === 'memory' ? <MemoryModule /> : activeId === 'settings' ? <ProviderSettings status={providerStatus} /> : <ModuleEmptyState module={activeModule} />}</div>
      </section>
    </main>
  )
}
