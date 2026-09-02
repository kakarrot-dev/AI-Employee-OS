import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChatBubble,
  Eye,
  Group,
  InfoCircle,
  Key,
  Microphone,
  NavArrowDown,
  Page,
  Plus,
  NavArrowRight,
  Settings,
  ShieldCheck,
  Sparks,
  Trash,
  Xmark,
  IconoirProvider
} from 'iconoir-react'
import type { ConversationMessageView, ConversationSummaryView, EmployeeSummary, ProviderStatus, RuntimeStatus, TaskDetailView } from '../../shared/runtime-contract'
import { employeeStatusLabels, TeamModule } from './TeamModule'
import { ResourceModule, resourcesFor, type ResourceKind } from './ResourceModule'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { AppShell, Avatar, ClientModal, ContextPane, IconButton, ListRow, Rail, SearchBox, SectionHeader, StatusLight, Toolbar, type ClientIcon } from './components/client-ui'
import { ChatMessage, MarkdownMessage, MatterRouteNote, MatterTeamAvatars, MessageAttachmentGroup, fileDetail } from './components/message-ui'
import { readClientProfile, SystemModule, systemSections, type ClientProfile, type SystemSectionId } from './SystemModule'

type ModuleId = 'workbench' | 'team' | 'resources' | 'settings'
type MessageView = 'conversation' | 'matter'
type ConversationFilter = 'all' | 'attention' | 'unread'
type ComposerPanel = 'access' | 'model' | 'voice' | null

interface ModuleDefinition {
  id: ModuleId
  label: string
  icon: ClientIcon
  title: string
  contextTitle: string
}

const modules: ModuleDefinition[] = [
  { id: 'workbench', label: '消息', icon: ChatBubble, title: '与总管的对话', contextTitle: '消息' },
  { id: 'team', label: '通讯录', icon: Group, title: 'Agent 员工', contextTitle: '通讯录' },
  { id: 'resources', label: '能力', icon: Sparks, title: '能力目录', contextTitle: '能力' },
  { id: 'settings', label: '系统', icon: Settings, title: '系统', contextTitle: '系统' }
]

const mainRailModules = modules.filter((module) => ['workbench', 'team', 'resources'].includes(module.id))
const footerRailModules = modules.filter((module) => module.id === 'settings')

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
const emptyResourceCatalog: ResourceCatalogView = { skills: [], tools: [], mcps: [], healthChecks: [] }

function readConversationCounts(): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem('ai-employee-os.conversation-read-counts') ?? '{}') as Record<string, number> } catch { return {} }
}

function readInitialConversationId(): string {
  try {
    if (window.localStorage.getItem('ai-employee-os.restore-session') === 'false') return ''
    return window.localStorage.getItem('ai-employee-os.last-conversation') ?? ''
  } catch { return '' }
}

function messageTime(value: string): string {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function taskStateLabel(state: TaskDetailView['state']): string {
  return ({ draft: '待确认', pending: '等待开始', running: '进行中', succeeded: '已完成', failed: '执行失败', cancelled: '已取消', needs_attention: '需要你处理' })[state]
}

function MessageBlock({ message }: { message: ConversationMessageView }): React.JSX.Element {
  const isUser = message.role === 'user'
  return <ChatMessage source={isUser ? 'user' : 'agent'} name={isUser ? '你' : '总管'} initials={isUser ? '你' : '总'} color={isUser ? '#d7b36a' : '#b8c982'} time={messageTime(message.createdAt)}><MarkdownMessage>{message.content}</MarkdownMessage></ChatMessage>
}

function ToolApprovalCard({ task, onDecision, onOpen }: { task: TaskDetailView; onDecision: (actionId: string, decision: 'approve' | 'reject') => void; onOpen: () => void }): React.JSX.Element | null {
  const approval = task.approvals.find((item) => item.decision === 'pending') ?? task.approvals.at(-1)
  if (!approval) return null
  const action = task.toolActions.find((item) => item.id === approval.toolActionId)
  const resolved = approval.decision !== 'pending'
  return <article className={`approval-card${resolved ? ' is-resolved' : ''}`}>
    <div><Key aria-hidden width={19} height={19} /><p>{resolved ? `你已${approval.decision === 'approved' ? '批准' : '拒绝'} ${action?.toolVersionId ?? '这项工具操作'}。` : `总管需要你确认 ${action?.toolVersionId ?? '工具操作'}；风险等级为 ${action?.risk ?? '未知'}，只在当前事项授权范围内生效。`}</p><IconButton label="查看审批详情" icon={Eye} onClick={onOpen} /></div>
    {!resolved && action && <div className="approval-actions"><button type="button" className="button button--quiet" onClick={() => onDecision(action.id, 'reject')}>拒绝</button><button type="button" className="button button--primary" onClick={() => onDecision(action.id, 'approve')}>批准</button></div>}
  </article>
}

function DeliveryCard({ task, onOpen }: { task: TaskDetailView; onOpen: () => void }): React.JSX.Element | null {
  const delivery = task.delivery
  if (!delivery) return null
  const passed = delivery.acceptanceResults.filter((item) => item.passed).length
  return <article className="delivery-card"><div className="delivery-card__icon"><Check aria-hidden width={22} height={22} /></div><div className="delivery-card__body"><div className="card-heading"><StatusLight state={passed === delivery.acceptanceResults.length ? 'success' : 'waiting'} label={passed === delivery.acceptanceResults.length ? '已交付' : '部分通过'} /><span>{messageTime(task.timeline.at(-1)?.createdAt ?? new Date().toISOString())}</span></div><h3>{task.goal}</h3><p>{delivery.acceptanceResults.length ? `${passed} / ${delivery.acceptanceResults.length} 项验收通过，${delivery.evidenceCount} 条证据已固化。` : '交付结果已由 Runtime 固化。'}</p><MessageAttachmentGroup source="agent" embedded attachments={delivery.artifacts.map((artifact) => ({ id: artifact.id, name: artifact.relativePath, detail: `${artifact.mediaType} · SHA-256 已记录` }))} onOpen={onOpen} onReveal={onOpen} /><button type="button" className="text-action" onClick={onOpen}>查看来源、证据与完整验收记录 <NavArrowRight aria-hidden width={14} height={14} /></button></div></article>
}

function MatterDetailModal({ task, onClose }: { task?: TaskDetailView; onClose: () => void }): React.JSX.Element {
  return <ClientModal open={Boolean(task)} title={task?.goal ?? '事项详情'} eyebrow={task ? <StatusLight state={task.state === 'succeeded' ? 'success' : task.state === 'failed' || task.state === 'needs_attention' ? 'danger' : task.state === 'running' ? 'active' : 'waiting'} label={taskStateLabel(task.state)} breathing={task.state === 'running'} /> : undefined} size="medium" onClose={onClose}><div className="matter-detail-content">{task && <>
    <section><h3>目标与验收</h3><p>{task.goal}</p><ul>{task.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section><h3>执行时间线</h3><div className="timeline">{task.timeline.length ? task.timeline.map((item, index) => <div className={`timeline-item timeline-item--${index === task.timeline.length - 1 && task.state === 'running' ? 'active' : 'done'}`} key={`${item.phase}:${index}`}><span>{index < task.timeline.length - 1 || task.state !== 'running' ? <Check aria-hidden width={14} height={14} /> : null}</span><div><strong>{item.phase}</strong><small>{messageTime(item.createdAt)} · {item.nextNode ? `下一步：${item.nextNode}` : '当前记录'}</small></div></div>) : <p className="empty-state">尚未产生执行节点。</p>}</div></section>
    <section><h3>当前临时团队</h3><div className="participant-list">{task.assignments.length ? task.assignments.map((item) => <span key={item.id}><Avatar label={item.employeeVersionId} initials={String(item.sequence)} color="#b8c982" size="small" />{item.employeeVersionId}</span>) : <p className="empty-state">事项尚未冻结执行团队。</p>}</div></section>
    {task.delivery && <section><div className="content-section-title"><h3>验收与证据</h3><span>{task.delivery.evidenceCount} 条证据</span></div><div className="detail-data-list">{task.delivery.acceptanceResults.map((item) => <div className="detail-data-row" key={item.criterion}><span><strong>{item.criterion}</strong><small>Runtime 验收记录</small></span><StatusLight state={item.passed ? 'success' : 'danger'} label={item.passed ? '通过' : '未通过'} /></div>)}{task.delivery.artifacts.map((item) => <div className="detail-data-row" key={item.id}><span><strong>{item.relativePath}</strong><small>{item.mediaType}</small></span><em>{item.sha256.slice(0, 10)}…</em></div>)}</div>{task.delivery.unresolvedIssues.length > 0 && <div className="boundary-note">未解决问题：{task.delivery.unresolvedIssues.join('；')}</div>}</section>}
  </>}</div></ClientModal>
}

function MatterEvent({ task, onOpen }: { task: TaskDetailView; onOpen: () => void }): React.JSX.Element {
  const latest = task.timeline.at(-1)
  return (
    <button type="button" className="matter-event" onClick={onOpen}>
      <span className="matter-event__mark"><Page aria-hidden width={17} height={17} /></span>
      <span className="matter-event__body"><small>{task.goal}</small><strong>{taskStateLabel(task.state)}</strong><span>{latest?.nextNode ? `下一步：${latest.nextNode}` : task.delivery ? '交付与验收记录已固化' : '查看当前进度、团队与验收标准'}</span></span>
      <time>{messageTime(latest?.createdAt ?? new Date().toISOString())}</time><NavArrowRight aria-hidden width={16} height={16} />
    </button>
  )
}

function MatterIndex({ tasks, onSelect }: { tasks: TaskDetailView[]; onSelect: (task: TaskDetailView) => void }): React.JSX.Element {
  const groups: Array<{ id: 'attention' | 'active' | 'completed'; title: string; description: string; matches: (task: TaskDetailView) => boolean }> = [
    { id: 'attention', title: '需要你处理', description: '等待确认、补充信息或处理异常', matches: (task) => task.state === 'draft' || task.state === 'needs_attention' || task.state === 'failed' },
    { id: 'active', title: '进行中', description: '总管或临时团队正在执行', matches: (task) => task.state === 'pending' || task.state === 'running' },
    { id: 'completed', title: '已完成', description: '已交付或已关闭的历史事项', matches: (task) => task.state === 'succeeded' || task.state === 'cancelled' }
  ]
  return (
    <div className="message-scroll" role="tabpanel" aria-label="事项">
      <div className="matter-index-canvas">
        <section className="matter-index-intro"><div><span className="matter-index-eyebrow">当前会话</span><h2>事项</h2><p>事项由总管根据对话意图创建，并独立保存状态、执行分工、进度和交付物。</p></div></section>
        {groups.map((group) => {
          const items = tasks.filter(group.matches)
          if (!items.length) return null
          return <section className="matter-index-section" key={group.id}><div className="matter-index-section__heading"><h3>{group.title}</h3><span>{group.description}</span></div><div className="matter-index-list">{items.map((task) => <button type="button" className="matter-index-card" key={task.id} onClick={() => onSelect(task)}><div className="card-heading"><span className={`task-state task-state--${task.state}`}>{taskStateLabel(task.state)}</span><span>{messageTime(task.timeline.at(-1)?.createdAt ?? new Date().toISOString())}</span></div><div className="matter-index-card__body"><span><strong>{task.goal}</strong><small>{task.acceptanceCriteria.join('；')}</small></span><NavArrowRight aria-hidden width={17} height={17} /></div><div className="matter-index-card__footer"><MatterTeamAvatars team={task.assignments.map((assignment) => ({ id: assignment.id, name: assignment.employeeVersionId, initials: String(assignment.sequence), color: '#b8c982' }))} /><span>{task.timeline.length} 个进度节点</span><span>{task.delivery ? `${task.delivery.artifacts.length} 个交付文件` : '尚未交付'}</span></div></button>)}</div></section>
        })}
        {tasks.length === 0 && <div className="runtime-empty-state runtime-empty-state--compact"><Page width={24} height={24} /><h2>当前会话还没有事项</h2><p>继续与总管对话。需要持续执行、审批或可验收交付物时，会在这里形成事项。</p></div>}
      </div>
    </div>
  )
}

function Workbench({ runtimeStatus, providerStatus, conversationId, onDataChanged }: { runtimeStatus: RuntimeStatus; providerStatus: ProviderStatus; conversationId: string; onDataChanged: () => void }): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationMessageView[]>([])
  const [activeView, setActiveView] = useState<MessageView>('conversation')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string>()
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string>()
  const [tasks, setTasks] = useState<TaskDetailView[]>([])
  const [taskBusy, setTaskBusy] = useState(false)
  const [selectedMatter, setSelectedMatter] = useState<TaskDetailView>()
  const [composerPanel, setComposerPanel] = useState<ComposerPanel>(null)
  const [draftAttachments, setDraftAttachments] = useState<File[]>([])

  useEffect(() => {
    let mounted = true
    setMessages([])
    setActiveView('conversation')
    setSelectedMatter(undefined)
    setComposerPanel(null)
    setDraftAttachments([])
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
  }, [conversationId])

  const conversationTasks = tasks.filter((task) => task.conversationId === conversationId)
  const activeTask = conversationTasks.find((task) => !['succeeded', 'cancelled'].includes(task.state)) ?? conversationTasks[0]

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const text = draft.trim()
    if ((!text && !draftAttachments.length) || sending || runtimeStatus.state !== 'connected') return
    if (draftAttachments.length) { setError('附件已保留在输入框，但 Runtime 尚未开放文件传输；移除附件后可发送文本。'); return }
    setDraft('')
    setError(undefined)
    setSending(true)
    const optimisticId = `local:${Date.now()}`
    setMessages((current) => [...current, { id: optimisticId, role: 'user', content: text, createdAt: new Date().toISOString() }])
    try {
      const result = await window.aiEmployeeOS.conversation.send(conversationId, text)
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, id: result.messageId } : message))
      setActiveRequestId(result.requestId)
      onDataChanged()
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
      setTasks((current) => [created, ...current]); onDataChanged()
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

  const decideTool = async (actionId: string, decision: 'approve' | 'reject'): Promise<void> => {
    setTaskBusy(true); setError(undefined)
    try {
      const value = decision === 'approve' ? await window.aiEmployeeOS.task.approveTool(actionId) : await window.aiEmployeeOS.task.rejectTool(actionId)
      setTasks((current) => current.map((item) => item.id === value.id ? value : item))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '审批决定未进入 Runtime') } finally { setTaskBusy(false) }
  }

  return (
    <div className="workspace-page message-page">
      {conversationTasks.length > 0 && <div className="topic-bar" role="tablist" aria-label="会话内容视图"><button type="button" role="tab" aria-selected={activeView === 'conversation'} className={activeView === 'conversation' ? 'is-active' : ''} onClick={() => setActiveView('conversation')}><ChatBubble aria-hidden width={16} height={16} />对话</button><button type="button" role="tab" aria-selected={activeView === 'matter'} className={activeView === 'matter' ? 'is-active' : ''} onClick={() => setActiveView('matter')}><Page aria-hidden width={16} height={16} />事项 {conversationTasks.some((task) => task.state === 'draft' || task.state === 'needs_attention' || task.state === 'failed') && <span className="topic-bar__attention" aria-label="存在需要你处理的事项" />}</button></div>}
      {activeView === 'matter' ? <MatterIndex tasks={conversationTasks} onSelect={(task) => setSelectedMatter(task)} /> : <>
      <div className="message-scroll" role="tabpanel" aria-label="对话">
        <div className="message-canvas">
          {messages.length === 0 ? (
            <div className="runtime-empty-state">
              <span className="runtime-empty-state__mark" aria-hidden="true"><Sparks width={24} height={24} /></span>
              <h2 id="conversation-title">从一段对话开始</h2>
              <p>描述目标。总管会先判断是直接回答、归入已有事项，还是创建新事项。</p>
            </div>
          ) : (
            <div className="runtime-message-list" aria-live="polite"><div className="date-divider"><span>今天</span></div>{messages.map((message) => <MessageBlock key={message.id} message={message} />)}</div>
          )}

          {activeTask ? (
            <><MatterRouteNote title={activeTask.goal} mode={activeTask.state === 'draft' ? 'created' : 'linked'} busy={taskBusy} onOpenMatter={() => setSelectedMatter(activeTask)} onCreateMatter={() => void createTaskDraft()} onRequestChange={activeTask.state === 'running' && !activeTask.pendingChange ? () => void requestTaskChange() : undefined} /><MatterEvent task={activeTask} onOpen={() => setSelectedMatter(activeTask)} />
              {activeTask.pendingChange && <div className="change-card"><strong>待处理变更</strong><p>{String(activeTask.pendingChange.requestedDiff.goal ?? '需求已变化')}</p>{activeTask.state === 'needs_attention' ? <div><button type="button" onClick={() => void decideTaskChange(false)} disabled={taskBusy}>保持原事项</button><button type="button" onClick={() => void decideTaskChange(true)} disabled={taskBusy}>接受并启动新 Revision</button></div> : <small>将在当前节点完成并提交 Checkpoint 后暂停</small>}</div>}
              {activeTask.state === 'draft' && <section className="runtime-route-note"><Page aria-hidden width={16} height={16} /><span>事项草稿已生成，确认后将冻结执行团队与验收标准。</span><button type="button" onClick={() => void startTask()} disabled={taskBusy}>{taskBusy ? '正在冻结' : '确认并开始'}</button></section>}
              <ToolApprovalCard task={activeTask} onDecision={(actionId, decision) => void decideTool(actionId, decision)} onOpen={() => setSelectedMatter(activeTask)} /><DeliveryCard task={activeTask} onOpen={() => setSelectedMatter(activeTask)} />{activeTask.toolActions.some((item) => item.state === 'result_unknown') && <div className="boundary-note">存在结果未知的 Tool Action。需要在 Runtime 记录真实外部结果后才能继续，客户端不会猜测成功或失败。</div>}</>
          ) : null}
        </div>
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="composer__box">
          {draftAttachments.length > 0 && <div className="composer-attachment-tray"><MessageAttachmentGroup source="user" attachments={draftAttachments.map((file, index) => ({ id: `${file.name}:${file.lastModified}:${index}`, name: file.name, detail: fileDetail(file) }))} onRemove={(id) => setDraftAttachments((items) => items.filter((file, index) => `${file.name}:${file.lastModified}:${index}` !== id))} /></div>}
          <textarea id="supervisor-input" aria-label="发送消息" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="发送给总管，补充问题或事项信息" disabled={runtimeStatus.state !== 'connected' || sending} />
          <div className="composer__toolbar">
            <div className="composer__group"><label className="attachment-upload-button" title="从本地选择附件"><input type="file" multiple aria-label="添加附件" onChange={(event) => { setDraftAttachments((items) => [...items, ...Array.from(event.currentTarget.files ?? [])]); event.currentTarget.value = '' }} /><span className="icon-button" aria-hidden="true"><Plus width={19} height={19} /></span></label><button type="button" className="composer__control" aria-expanded={composerPanel === 'access'} aria-controls="composer-access-panel" onClick={() => setComposerPanel((panel) => panel === 'access' ? null : 'access')}><ShieldCheck aria-hidden width={17} height={17} /><span>受控访问</span></button></div>
            <div className="composer__group">
              <button type="button" className="composer__control" aria-expanded={composerPanel === 'model'} aria-controls="composer-model-panel" onClick={() => setComposerPanel((panel) => panel === 'model' ? null : 'model')}><Sparks aria-hidden width={17} height={17} /><span>deepseek-v4-pro</span><NavArrowDown aria-hidden width={15} height={15} /></button>
              <IconButton label="语音输入" icon={Microphone} onClick={() => setComposerPanel((panel) => panel === 'voice' ? null : 'voice')} />
              {sending && activeRequestId ? <button type="button" className="composer__control composer__cancel" onClick={cancel} disabled={cancelling}><Xmark aria-hidden width={16} height={16} />{cancelling ? '取消中' : '取消'}</button> : null}
              <button type="submit" aria-label="发送" className="composer__send" disabled={(!draft.trim() && !draftAttachments.length) || sending || runtimeStatus.state !== 'connected'}><ArrowUp aria-hidden width={19} height={19} /></button>
            </div>
          </div>
          {composerPanel && <div className={`composer-popover composer-popover--${composerPanel}`} id={`composer-${composerPanel}-panel`} role="dialog" aria-label={composerPanel === 'access' ? '受控访问说明' : composerPanel === 'model' ? '当前会话模型' : '语音输入说明'}>{composerPanel === 'access' ? <><strong>受控访问</strong><p>Tool、MCP 与目录权限取员工能力和当前任务 RunGrant 的交集；有副作用的动作仍需单次审批。</p><StatusLight state="success" label="最小授权" /></> : composerPanel === 'model' ? <><strong>当前会话模型</strong><div className="composer-popover__options">{providerStatus.models.filter((model) => model.modality === 'text').map((model) => <button type="button" key={`${model.provider}:${model.modelId}`} className={model.modelId === 'deepseek-v4-pro' ? 'is-active' : ''} onClick={() => setComposerPanel(null)}><span><b>{model.modelId}</b><small>{model.provider} · {model.verification === 'verified' ? '已验证' : '未验证'}</small></span>{model.modelId === 'deepseek-v4-pro' && <Check aria-hidden width={16} height={16} />}</button>)}</div><p>模型由当前 Runtime 会话固定；此处展示真实可用状态，不会静默切换。</p></> : <><strong>语音输入</strong><p>客户端尚未接入 macOS 麦克风权限与转写 Bridge，因此不会请求权限或伪造录音。入口交互已保留。</p><StatusLight state="muted" label="暂未开放" /></>}</div>}
        </div>
        {error && <small className="composer-error" role="alert">{error}</small>}
      </form>
      </>}
      <MatterDetailModal task={selectedMatter} onClose={() => setSelectedMatter(undefined)} />
    </div>
  )
}

export function App(): React.JSX.Element {
  const [activeId, setActiveId] = useState<ModuleId>('workbench')
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(initialStatus)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(initialProviderStatus)
  const [conversations, setConversations] = useState<ConversationSummaryView[]>([])
  const [conversationTasks, setConversationTasks] = useState<TaskDetailView[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState(readInitialConversationId)
  const [conversationQuery, setConversationQuery] = useState('')
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all')
  const [systemSection, setSystemSection] = useState<SystemSectionId>('profile')
  const [profile, setProfile] = useState<ClientProfile>(readClientProfile)
  const [readCounts, setReadCounts] = useState<Record<string, number>>(readConversationCounts)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>()
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeCreateRequest, setEmployeeCreateRequest] = useState(0)
  const [employeeEditRequest, setEmployeeEditRequest] = useState(0)
  const [resourceCatalog, setResourceCatalog] = useState<ResourceCatalogView>(emptyResourceCatalog)
  const [resourceKind, setResourceKind] = useState<ResourceKind>('skills')
  const [selectedResourceId, setSelectedResourceId] = useState<string>()
  const [resourceQuery, setResourceQuery] = useState('')
  const [resourceError, setResourceError] = useState<string>()
  const [probingResources, setProbingResources] = useState(false)
  const [resourceInfoOpen, setResourceInfoOpen] = useState(false)
  const activeModule = useMemo(() => modules.find((module) => module.id === activeId)!, [activeId])
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId)
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)
  const selectedResource = resourcesFor(resourceCatalog, resourceKind).find((item) => item.id === selectedResourceId) ?? resourcesFor(resourceCatalog, resourceKind)[0]
  const runtimeLabel = runtimeStatus.state === 'connected' ? 'Runtime 已连接' : runtimeStatus.state === 'connecting' ? '正在连接' : 'Runtime 未连接'
  const unreadCountFor = (conversation: ConversationSummaryView): number => Math.max(0, conversation.messageCount - (readCounts[conversation.id] ?? 0))
  const totalUnread = conversations.reduce((total, conversation) => total + unreadCountFor(conversation), 0)

  const refreshConversationData = async (): Promise<void> => {
    const [items, tasks] = await Promise.all([window.aiEmployeeOS.conversation.list(), window.aiEmployeeOS.task.list()])
    setConversationTasks(tasks)
    if (items.length > 0) {
      setConversations(items)
      setSelectedConversationId((current) => items.some((item) => item.id === current) ? current : items[0].id)
      return
    }
    const created = await window.aiEmployeeOS.conversation.create()
    setConversations([created])
    setSelectedConversationId(created.id)
  }

  useEffect(() => {
    let mounted = true
    window.aiEmployeeOS.runtime.getStatus().then((status) => {
      if (mounted) setRuntimeStatus(status)
    })
    window.aiEmployeeOS.provider.getStatus().then((status) => {
      if (mounted) setProviderStatus(status)
    })
    refreshConversationData().catch(() => undefined)
    window.aiEmployeeOS.employee.list().then((items) => { if (!mounted) return; setEmployees(items); setSelectedEmployeeId(items[0]?.id) }).catch(() => undefined)
    window.aiEmployeeOS.resource.list().then((catalog) => { if (!mounted) return; setResourceCatalog(catalog); setSelectedResourceId(catalog.skills[0]?.id) }).catch(() => setResourceError('资源目录读取失败'))
    const unsubscribe = window.aiEmployeeOS.runtime.onStatusChanged(setRuntimeStatus)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!selectedConversation) return
    try {
      if (window.localStorage.getItem('ai-employee-os.restore-session') !== 'false') window.localStorage.setItem('ai-employee-os.last-conversation', selectedConversation.id)
    } catch { /* local session preference is optional */ }
    setReadCounts((current) => {
      if ((current[selectedConversation.id] ?? 0) >= selectedConversation.messageCount) return current
      const next = { ...current, [selectedConversation.id]: selectedConversation.messageCount }
      try { window.localStorage.setItem('ai-employee-os.conversation-read-counts', JSON.stringify(next)) } catch { /* local identity state is optional */ }
      return next
    })
  }, [selectedConversation?.id, selectedConversation?.messageCount])

  const reconnect = async (): Promise<void> => {
    setRuntimeStatus(await window.aiEmployeeOS.runtime.reconnect())
    await refreshConversationData()
  }

  const createConversation = async (): Promise<void> => {
    const created = await window.aiEmployeeOS.conversation.create()
    setConversations((items) => [created, ...items])
    setSelectedConversationId(created.id)
    setConversationFilter('all')
  }

  const archiveConversation = async (conversationId: string): Promise<void> => {
    await window.aiEmployeeOS.conversation.archive(conversationId)
    const remaining = conversations.filter((item) => item.id !== conversationId)
    if (remaining.length > 0) {
      setConversations(remaining)
      if (selectedConversationId === conversationId) setSelectedConversationId(remaining[0].id)
      return
    }
    const created = await window.aiEmployeeOS.conversation.create()
    setConversations([created])
    setSelectedConversationId(created.id)
  }

  const probeResources = async (): Promise<void> => {
    setProbingResources(true); setResourceError(undefined)
    try { setResourceCatalog(await window.aiEmployeeOS.resource.probe()) } catch { setResourceError('数据源健康检查失败') } finally { setProbingResources(false) }
  }

  const visibleConversations = conversations.filter((conversation) => {
    if (!`${conversation.title} ${conversation.preview}`.toLocaleLowerCase().includes(conversationQuery.trim().toLocaleLowerCase())) return false
    const tasks = conversationTasks.filter((task) => task.conversationId === conversation.id)
    if (conversationFilter === 'attention') return tasks.some((task) => task.state === 'draft' || task.state === 'needs_attention' || task.state === 'failed')
    if (conversationFilter === 'unread') return unreadCountFor(conversation) > 0
    return true
  })

  const context = <ContextPane footer={activeId === 'settings' ? <div className="system-navigation__footer runtime-context-status"><StatusLight state={runtimeStatus.state === 'connected' ? 'success' : runtimeStatus.state === 'connecting' ? 'waiting' : 'danger'} label={runtimeLabel} breathing={runtimeStatus.state === 'connecting'} /><small>{runtimeStatus.message}</small></div> : undefined}>
    <SectionHeader title={activeModule.contextTitle} action={activeId === 'workbench' ? <IconButton label="新建会话" icon={Plus} onClick={createConversation} /> : activeId === 'team' ? <IconButton label="新建 Agent 员工" icon={Plus} onClick={() => setEmployeeCreateRequest((value) => value + 1)} /> : activeId === 'resources' ? <IconButton label="能力目录信息" icon={InfoCircle} onClick={() => setResourceInfoOpen(true)} /> : undefined} />
    {activeId === 'workbench' ? <>
      <SearchBox label="搜索会话" placeholder="搜索会话" value={conversationQuery} onChange={setConversationQuery} />
      <div className="filter-row" aria-label="消息筛选">{([['all', '全部'], ['attention', '待处理'], ['unread', '未读']] as const).map(([id, label]) => <button type="button" key={id} className={conversationFilter === id ? 'is-active' : ''} onClick={() => setConversationFilter(id)}>{label}</button>)}</div>
      <div className="context-scroll">{visibleConversations.map((conversation) => {
        const tasks = conversationTasks.filter((task) => task.conversationId === conversation.id)
        const attention = tasks.some((task) => task.state === 'draft' || task.state === 'needs_attention' || task.state === 'failed')
        const unread = unreadCountFor(conversation)
        return <div className="conversation-row" key={conversation.id}><ListRow title={conversation.title} subtitle={conversation.preview} meta={messageTime(conversation.updatedAt)} selected={selectedConversationId === conversation.id} avatar={<Avatar label={conversation.title} initials={conversation.title.slice(0, 1)} />} marker={unread > 0 ? <span className="unread-count">{unread}</span> : attention ? <span className="attention-dot" aria-label="待处理" /> : undefined} onClick={() => setSelectedConversationId(conversation.id)} /><IconButton label={`归档会话 ${conversation.title}`} icon={Trash} className="conversation-row__delete" onClick={() => archiveConversation(conversation.id)} /></div>
      })}</div>
    </> : activeId === 'team' ? <>
      <SearchBox label="搜索 Agent" placeholder="搜索 Agent" value={employeeQuery} onChange={setEmployeeQuery} />
      <div className="context-scroll context-scroll--flush">{employees.filter((employee) => `${employee.name} ${employee.role ?? ''}`.includes(employeeQuery.trim())).map((employee) => <ListRow key={employee.id} title={employee.name} subtitle={employee.role || '尚未填写职责'} selected={selectedEmployeeId === employee.id} avatar={<Avatar label={employee.name} initials={employee.name.slice(0, 1)} color="#c5b8e3" size="small" src={employee.avatarDataUrl} />} marker={<StatusLight state={employee.status === 'active' ? 'success' : employee.status === 'disabled' || employee.status === 'archived' ? 'muted' : 'waiting'} label={employeeStatusLabels[employee.status]} />} onClick={() => setSelectedEmployeeId(employee.id)} />)}</div>
    </> : activeId === 'resources' ? <>
      <SearchBox label="搜索能力" placeholder="搜索能力" value={resourceQuery} onChange={setResourceQuery} />
      <div className="filter-row capability-kind-switch">{([['skills', 'Skills'], ['tools', 'Tools']] as const).map(([id, label]) => <button type="button" key={id} className={resourceKind === id ? 'is-active' : ''} onClick={() => { setResourceKind(id); setSelectedResourceId(resourcesFor(resourceCatalog, id)[0]?.id) }}>{label}</button>)}</div>
      <div className="context-scroll context-scroll--flush">{resourcesFor(resourceCatalog, resourceKind).filter((item) => `${item.name} ${item.description}`.includes(resourceQuery.trim())).map((item) => <ListRow key={item.id} title={item.name} subtitle={`v${item.version} · ${item.available ? '可用' : '不可用'}`} selected={selectedResourceId === item.id} marker={<StatusLight state={item.available ? 'success' : 'danger'} label={item.available ? '可用' : '不可用'} />} onClick={() => setSelectedResourceId(item.id)} />)}</div>
    </> : <div className="system-navigation">{systemSections.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={systemSection === item.id ? 'is-active' : ''} onClick={() => setSystemSection(item.id)}><Icon aria-hidden width={18} height={18} /><span>{item.label}</span><NavArrowRight aria-hidden width={15} height={15} /></button> })}</div>}
  </ContextPane>

  const toolbarSupport = activeId === 'team' && selectedEmployee ? <StatusLight state={selectedEmployee.status === 'active' ? 'success' : selectedEmployee.status === 'disabled' || selectedEmployee.status === 'archived' ? 'muted' : 'waiting'} label={employeeStatusLabels[selectedEmployee.status]} breathing={selectedEmployee.status === 'active' || selectedEmployee.status === 'pending_test'} /> : activeId === 'resources' && selectedResource ? <StatusLight state={selectedResource.available ? 'success' : 'danger'} label={selectedResource.available ? '可用' : '不可用'} /> : undefined
  const toolbarTrailing = activeId === 'team' ? undefined : activeId === 'resources' ? <span className="quiet-meta">只读 {resourceKind === 'skills' ? 'Skill' : 'Tool'} 目录</span> : activeId === 'settings' ? <span className="header-description">系统设置保存在本机</span> : <button type="button" className={`runtime-status runtime-status--${runtimeStatus.state}`} onClick={reconnect} disabled={runtimeStatus.state === 'connecting'}><span className="status-dot" />{runtimeLabel}</button>

  return <IconoirProvider iconProps={{ strokeWidth: 1.5 }}><AppShell
    toolbar={<Toolbar title={activeId === 'workbench' ? selectedConversation?.title ?? '消息' : activeId === 'team' ? selectedEmployee?.name ?? 'Agent 员工' : activeId === 'resources' ? selectedResource?.name ?? '能力目录' : systemSections.find((item) => item.id === systemSection)?.label ?? '系统'} support={toolbarSupport} trailing={toolbarTrailing} />}
    rail={<Rail active={activeId} items={mainRailModules.map((item) => item.id === 'workbench' && totalUnread > 0 ? { ...item, marker: String(totalUnread) } : item)} footerItems={footerRailModules} userProfile={profile} onProfile={() => { setSystemSection('profile'); setActiveId('settings') }} onNavigate={setActiveId} />}
    context={context}
  >{activeId === 'workbench' ? selectedConversationId ? <Workbench runtimeStatus={runtimeStatus} providerStatus={providerStatus} conversationId={selectedConversationId} onDataChanged={() => { void refreshConversationData() }} /> : <div className="runtime-empty-state"><h2>正在读取会话</h2></div> : activeId === 'team' ? <TeamModule selectedEmployeeId={selectedEmployeeId} createRequest={employeeCreateRequest} editRequest={employeeEditRequest} onEmployeesChanged={(items) => { setEmployees(items); setSelectedEmployeeId((current) => current ?? items[0]?.id) }} onSelectEmployee={setSelectedEmployeeId} onEditEmployee={() => setEmployeeEditRequest((value) => value + 1)} /> : activeId === 'resources' ? <ResourceModule catalog={resourceCatalog} kind={resourceKind} selectedId={selectedResourceId} probing={probingResources} error={resourceError} onProbe={() => void probeResources()} onOpenEmployee={(employeeId) => { setSelectedEmployeeId(employeeId); setActiveId('team') }} /> : <SystemModule section={systemSection} providerStatus={providerStatus} runtimeStatus={runtimeStatus} resourceCatalog={resourceCatalog} onReconnect={reconnect} onProbeResources={probeResources} onProfileChange={setProfile} />}</AppShell><ClientModal open={resourceInfoOpen} title="能力目录信息" eyebrow={<span className="quiet-meta">只读目录</span>} size="medium" onClose={() => setResourceInfoOpen(false)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>Runtime 能力目录</h3><p>客户端只展示 Runtime 已注册的不可变 Skill 与 Tool 版本，不在本地复制或改写能力事实。</p></div><section><div className="content-section-title"><h3>当前目录</h3><span>{resourceCatalog.skills.length + resourceCatalog.tools.length} 项</span></div><div className="detail-data-list"><div className="detail-data-row"><span><strong>Skills</strong><small>结构化步骤与 Tool 依赖</small></span><em>{resourceCatalog.skills.length}</em></div><div className="detail-data-row"><span><strong>Tools</strong><small>副作用、权限与健康状态</small></span><em>{resourceCatalog.tools.length}</em></div><div className="detail-data-row"><span><strong>健康检查</strong><small>由 Runtime 数据源探测提供</small></span><em>{resourceCatalog.healthChecks.length}</em></div></div></section><div className="resource-boundary">运行中的事项始终使用已冻结的能力版本；目录更新不会静默覆盖历史执行事实。</div></div></ClientModal></IconoirProvider>
}
