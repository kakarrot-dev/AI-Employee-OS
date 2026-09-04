import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChatBubble,
  Community,
  Eye,
  Group,
  InfoCircle,
  Link,
  Microphone,
  NavArrowDown,
  NavArrowLeft,
  Page,
  Plus,
  NavArrowRight,
  Settings,
  ShieldCheck,
  Sparks,
  Trash,
  UserPlus,
  Xmark
} from 'iconoir-react'
import type { AttachmentView, ConversationMessageView, ConversationSummaryView, EmployeeSummary, ProviderStatus, RuntimeStatus, TaskDetailView } from '../../shared/runtime-contract'
import { TeamModule } from './TeamModule'
import { employeeAvatarSrc, supervisorIdentity, userIdentity } from './employee-avatar'
import { employeeStatusBreathing, employeeStatusLabel, employeeStatusTone, isActiveEmployeeStatus } from './employee-status'
import { ResourceModule, resourcesFor, type ResourceKind } from './ResourceModule'
import { RecruitmentCatalog, type RecruitmentKind } from './RecruitmentCatalog'
import { ConnectionsCatalog, EMPTY_FEISHU_STATUS, FEISHU_CONNECTION_APPLICATION } from './ConnectionsCatalog'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import type { FeishuConnectionStatus } from '../../shared/connection-contract'
import type { ExpertGroupView } from '../../shared/expert-group-contract'
import { ExpertGroupAvatar } from './ExpertGroupAvatar'
import { DEFAULT_SUPERVISOR_CONFIG, type SupervisorConfigInput } from '../../shared/supervisor-contract'
import { AppShell, Avatar, ClientModal, ContextPane, DetailListMark, DetailNote, DetailPage, DetailSectionHeader, DetailState, DetailSummaryPanel, IconButton, ListRow, PersonAvatar, Rail, SearchBox, SectionHeader, StatusLight, SummaryList, SummaryListItem, Toolbar, type ClientIcon, type DetailTone, type PersonIdentity } from './components/client-ui'
import { ClientIconSystem } from './components/client-icon-system'
import { AgentActivityMessage, ChatContentBlock, ChatMessage, MarkdownMessage, MatterRouteNote, MatterTeamAvatars, MessageAttachmentGroup, StreamingMarkdownMessage, TimelineSummary, fileDetail } from './components/message-ui'
import { readClientProfile, SystemModule, systemSections, type ClientProfile, type SystemSectionId } from './SystemModule'
import { formatClientTimestamp, formatRunDuration } from './client-time'
import { ExpertGroupModule } from './ExpertGroupModule'

type ModuleId = 'workbench' | 'team' | 'resources' | 'connections' | 'settings'
type ComposerPanel = 'model' | 'voice' | null
type TeamView = 'directory' | 'recruitment'
type TeamDirectoryKind = 'experts' | 'groups'

function attachmentImportErrorMessage(reason: unknown): string {
  const code = reason instanceof Error ? reason.message : String(reason)
  if (code.includes('unsupported_attachment_type')) return '仅支持 Word、PowerPoint、Excel、PDF 或图片文件'
  if (code.includes('attachment_too_large')) return '单个附件不能超过 25 MB'
  if (code.includes('attachments_too_large')) return '附件总大小不能超过 60 MB'
  if (code.includes('invalid_attachment_selection')) return '每次最多上传 8 个有效文件'
  return '客户文件导入失败，请重试'
}

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
  { id: 'connections', label: '连接', icon: Link, title: '连接', contextTitle: '连接' },
  { id: 'settings', label: '系统', icon: Settings, title: '系统', contextTitle: '系统' }
]

const mainRailModules = modules.filter((module) => ['workbench', 'team', 'resources', 'connections'].includes(module.id))
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
const resourceCatalogRetryDelaysMs = [250, 750, 1_500, 3_000, 5_000] as const

function readConversationCounts(): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem('ai-employee-os.conversation-read-counts') ?? '{}') as Record<string, number> } catch { return {} }
}

function readInitialConversationId(): string {
  try {
    if (window.localStorage.getItem('ai-employee-os.restore-session') === 'false') return ''
    return window.localStorage.getItem('ai-employee-os.last-conversation') ?? ''
  } catch { return '' }
}

function taskStateLabel(state: TaskDetailView['state']): string {
  return ({ draft: '待确认', pending: '等待开始', running: '进行中', succeeded: '已完成', failed: '执行失败', cancelled: '已取消', needs_attention: '需要你处理' })[state]
}

function taskStateTone(state: TaskDetailView['state']): 'success' | 'danger' | 'active' | 'waiting' | 'muted' {
  if (state === 'succeeded') return 'success'
  if (state === 'failed' || state === 'needs_attention') return 'danger'
  if (state === 'running') return 'active'
  if (state === 'draft' || state === 'pending') return 'waiting'
  return 'muted'
}

type FriendlyMilestoneState = 'done' | 'active' | 'attention' | 'danger'

export interface FriendlyMilestone {
  key: string
  title: string
  description: string
  createdAt: string
  state: FriendlyMilestoneState
}

function assignmentName(task: TaskDetailView, assignmentId?: string): string {
  const assignment = task.assignments.find((item) => item.id === assignmentId)
  return assignment?.employeeName ?? (assignment ? `员工 ${assignment.sequence}` : '员工')
}

function terminalMilestone(task: TaskDetailView): Omit<FriendlyMilestone, 'state'> | undefined {
  const createdAt = task.delivery?.createdAt ?? task.timeline.at(-1)?.createdAt ?? task.createdAt ?? new Date(0).toISOString()
  if (task.state === 'succeeded') return { key: 'delivery-committed', title: '交付结果已保存', description: '任务结果、交付文件和验收记录均已保存。', createdAt }
  if (task.state === 'failed') return { key: 'task-failed', title: '本次执行未完成', description: '执行遇到问题，未能完成全部要求。', createdAt }
  if (task.state === 'cancelled') return { key: 'task-cancelled', title: '任务已取消', description: '本次任务已停止，不会继续执行。', createdAt }
  if (task.state === 'needs_attention') return { key: 'task-attention', title: '需要处理', description: '请查看待处理变更或结果核验信息，系统会同步最新状态。', createdAt }
  if (task.state === 'pending') return { key: 'task-pending', title: '等待开始', description: '任务已准备好，正在等待员工开始处理。', createdAt }
  if (task.state === 'running' && task.timeline.length === 0) return { key: 'task-running', title: '员工正在处理', description: '员工正在按完成要求推进任务。', createdAt }
  return undefined
}

export function buildFriendlyTimeline(task: TaskDetailView): FriendlyMilestone[] {
  const milestones: Array<Omit<FriendlyMilestone, 'state'>> = []
  const addOrUpdate = (milestone: Omit<FriendlyMilestone, 'state'>): void => {
    const existing = milestones.find((item) => item.key === milestone.key)
    if (existing) {
      existing.createdAt = milestone.createdAt
      existing.description = milestone.description
      return
    }
    milestones.push(milestone)
  }

  task.timeline.forEach((item, index) => {
    const assignment = task.assignments.find((candidate) => candidate.id === item.assignmentId)
    const employee = assignmentName(task, item.assignmentId)
    const copies: Record<string, Omit<FriendlyMilestone, 'state'>> = {
      created: { key: 'created', title: '任务已创建', description: '已确认任务目标和完成要求。', createdAt: item.createdAt },
      memory_loaded: { key: 'prepared', title: '工作资料已准备', description: '已准备本次工作需要的上下文和资料。', createdAt: item.createdAt },
      tool_waiting: { key: 'tool-waiting', title: '工具步骤等待处理', description: '该工具步骤没有自动完成，请以事项当前状态为准。', createdAt: item.createdAt },
      employee_completed: { key: `employee-completed-${item.assignmentId ?? index}`, title: `${employee}已完成`, description: assignment?.employeeRole ? `${assignment.employeeRole}的工作已完成，结果已交给下一阶段。` : '负责的工作已完成，结果已交给下一阶段。', createdAt: item.createdAt },
      deep_agents_safe_pause: { key: 'progress-saved', title: '执行进度已保存', description: '当前进度已安全保存，可以继续执行。', createdAt: item.createdAt },
      manager_review: { key: 'manager-review', title: '结果已检查', description: '总管已按完成要求检查员工提交的结果。', createdAt: item.createdAt },
      manager_rework: { key: 'manager-rework', title: '结果已补充完善', description: '员工已根据检查意见补充处理。', createdAt: item.createdAt },
      delivery_committed: { key: 'delivery-committed', title: '交付结果已保存', description: '任务结果、交付文件和验收记录均已保存。', createdAt: item.createdAt },
      shutdown_requested: { key: 'shutdown-requested', title: '正在保存进度', description: '系统正在保存当前进度并安全停止。', createdAt: item.createdAt },
      safe_paused: { key: 'safe-paused', title: '任务已暂停', description: '当前进度已保存，之后可以继续执行。', createdAt: item.createdAt }
    }
    const copy = copies[item.phase]
    if (copy && !(item.phase === 'deep_agents_safe_pause' && task.state === 'succeeded')) addOrUpdate(copy)
  })

  const terminal = terminalMilestone(task)
  if (terminal) addOrUpdate(terminal)

  return milestones.map((item, index) => ({
    ...item,
    state: index < milestones.length - 1 || task.state === 'succeeded' || task.state === 'cancelled'
      ? 'done'
      : task.state === 'failed' ? 'danger'
        : task.state === 'needs_attention' ? 'attention'
          : 'active'
  }))
}

function taskSummary(task: TaskDetailView): { title: string; description: string } {
  const artifacts = task.delivery?.artifacts.length ?? 0
  const evidence = task.delivery?.evidenceCount ?? 0
  if (task.state === 'succeeded') return { title: '所有完成要求均已通过', description: task.delivery ? `员工已完成处理，${artifacts} 个交付文件和 ${evidence} 条来源证据已保存。` : '员工已完成处理，任务结果已经保存。' }
  if (task.state === 'failed') return { title: '本次执行没有完成', description: '执行过程中遇到问题，请查看未解决事项后重新处理。' }
  if (task.state === 'needs_attention') return { title: '当前步骤需要处理', description: '请查看待处理变更或结果核验信息；状态变化后页面会自动更新。' }
  if (task.state === 'cancelled') return { title: '本次任务已取消', description: '任务已经停止，当前记录会继续保留。' }
  if (task.state === 'draft') return { title: '任务内容等待确认', description: '确认目标和完成要求后，员工才会开始执行。' }
  if (task.state === 'pending') return { title: '任务即将开始', description: '目标和完成要求已确认，正在等待员工开始处理。' }
  return { title: '员工正在处理', description: '任务正在按完成要求推进，最新进度会显示在下方。' }
}

function artifactTypeLabel(mediaType: string): string {
  if (mediaType.includes('markdown')) return 'Markdown 文档'
  if (mediaType.includes('plain')) return '文本文件'
  if (mediaType.includes('csv') || mediaType.includes('spreadsheet')) return '表格文件'
  if (mediaType.includes('pdf')) return 'PDF 文档'
  if (mediaType.includes('json')) return '数据文件'
  return '交付文件'
}

function artifactDisplayName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function assignmentStateLabel(state: TaskDetailView['assignments'][number]['state']): string {
  return ({ pending: '待开始', running: '处理中', succeeded: '已完成', failed: '未完成', cancelled: '已取消' })[state]
}

function taskUpdatedAt(task: TaskDetailView): string {
  return task.delivery?.createdAt ?? task.timeline.at(-1)?.createdAt ?? task.createdAt ?? new Date(0).toISOString()
}

export function coalesceMatterCards(tasks: TaskDetailView[]): TaskDetailView[] {
  const groups: Array<{ sources: Set<string>; tasks: TaskDetailView[] }> = []
  for (const task of tasks) {
    const sources = new Set(task.sourceMessageIds ?? [])
    const matching = groups.filter((group) => sources.size > 0 && [...sources].some((source) => group.sources.has(source)))
    if (matching.length === 0) {
      groups.push({ sources, tasks: [task] })
      continue
    }
    const primary = matching[0]
    primary.tasks.push(task)
    for (const source of sources) primary.sources.add(source)
    for (const group of matching.slice(1)) {
      for (const source of group.sources) primary.sources.add(source)
      primary.tasks.push(...group.tasks)
      groups.splice(groups.indexOf(group), 1)
    }
  }
  const isActive = (task: TaskDetailView): boolean => !['succeeded', 'failed', 'cancelled'].includes(task.state)
  return groups.map((group) => [...group.tasks].sort((left, right) => {
    if (isActive(left) !== isActive(right)) return isActive(left) ? -1 : 1
    const updated = Date.parse(taskUpdatedAt(right)) - Date.parse(taskUpdatedAt(left))
    if (updated !== 0) return updated
    return Date.parse(right.createdAt ?? new Date(0).toISOString()) - Date.parse(left.createdAt ?? new Date(0).toISOString())
  })[0])
}

export function selectActiveTask(tasks: TaskDetailView[]): TaskDetailView | undefined {
  return tasks.find((task) => !['succeeded', 'failed', 'cancelled'].includes(task.state)) ?? tasks[0]
}

export function identityAwareConversationPreview(conversation: ConversationSummaryView, userName: string, supervisorName: string): string {
  if (!conversation.lastMessageRole || conversation.lastMessageContent === undefined) return conversation.preview
  const name = conversation.lastMessageRole === 'user' ? userName.trim() || '本地用户' : supervisorName.trim() || '总管'
  return `${name}：${conversation.lastMessageContent}`
}

function MessageBlock({ message, user, supervisor, streamingActive = false }: { message: ConversationMessageView; user: PersonIdentity; supervisor: PersonIdentity; streamingActive?: boolean }): React.JSX.Element {
  const isUser = message.role === 'user'
  const identity = isUser ? user : supervisor
  const attachments = message.attachments?.map((attachment) => ({ id: attachment.id, name: attachment.name, detail: fileDetail(attachment) })) ?? []
  const isStreamingReply = !isUser && message.id.startsWith('stream:')
  return <ChatMessage source={isUser ? 'user' : 'agent'} name={identity.name} initials={identity.initials} color={identity.color} avatarSrc={identity.avatarSrc ?? undefined} time={formatClientTimestamp(message.createdAt)}>{isStreamingReply ? <StreamingMarkdownMessage active={streamingActive}>{message.content}</StreamingMarkdownMessage> : <MarkdownMessage>{message.content}</MarkdownMessage>}{attachments.length > 0 && <MessageAttachmentGroup source={isUser ? 'user' : 'agent'} embedded attachments={attachments} onOpen={(id) => void window.aiEmployeeOS.attachment.open(id)} onReveal={(id) => void window.aiEmployeeOS.attachment.reveal(id)} />}</ChatMessage>
}

const employeeColors = ['#9ebd79', '#d7b36a', '#85a9c7', '#bc91b1']

function TeamJoinedEvent({ task }: { task: TaskDetailView }): React.JSX.Element | null {
  if (!task.assignments.length) return null
  const originalAssignments = task.assignments.filter((assignment) => !assignment.reworkOfAssignmentId)
  const team = originalAssignments.map((assignment, index) => ({ id: assignment.id, name: assignment.employeeName ?? `员工 ${assignment.sequence}`, initials: (assignment.employeeName ?? String(assignment.sequence)).trim().slice(0, 1), color: employeeColors[index % employeeColors.length], src: employeeAvatarSrc({ employeeId: assignment.employeeId, avatarDataUrl: assignment.avatarDataUrl }) }))
  return <div className="team-joined-event" role="status"><Group aria-hidden /><MatterTeamAvatars team={team} /><span>加入工作</span><time>{formatClientTimestamp(originalAssignments[0]?.createdAt ?? task.createdAt ?? new Date().toISOString())}</time></div>
}

function EmployeeProgressMessage({ task, assignment }: { task: TaskDetailView; assignment: TaskDetailView['assignments'][number] }): React.JSX.Element | null {
  if (assignment.state === 'pending') return null
  const name = assignment.employeeName ?? `员工 ${assignment.sequence}`
  const waitingAction = task.toolActions.find((action) => action.assignmentId === assignment.id && ['blocked', 'result_unknown'].includes(action.state))
  const status = assignment.state === 'running'
    ? waitingAction ? '需要处理' : assignment.reworkOfAssignmentId ? '正在返工' : '正在执行'
    : assignment.state === 'succeeded' ? assignment.reworkOfAssignmentId ? '返工完成' : '阶段完成'
      : assignment.state === 'failed' ? '执行失败' : '已取消'
  const statusState = assignment.state === 'succeeded' ? 'success' : assignment.state === 'failed' ? 'danger' : assignment.state === 'cancelled' ? 'muted' : waitingAction ? 'waiting' : 'active'
  const fallbackTitle = assignment.state === 'succeeded' ? '阶段工作已完成' : assignment.state === 'failed' ? '阶段执行未完成' : assignment.state === 'cancelled' ? '阶段执行已取消' : waitingAction ? '阶段需要处理' : '阶段工作进行中'
  const content = assignment.summary?.trim() || (waitingAction
    ? '当前步骤需要核验实际结果后才能继续。'
    : assignment.state === 'running' ? `我已接手“${task.goal}”，正在执行当前阶段。`
      : assignment.state === 'failed' ? '当前阶段未能完成，详细失败原因已交给总管处理。'
        : '当前阶段已取消。')
  return <ChatMessage source="agent" variant="timeline" name={name} initials={name.trim().slice(0, 1)} color={employeeColors[(assignment.sequence - 1) % employeeColors.length]} avatarSrc={employeeAvatarSrc({ employeeId: assignment.employeeId, avatarDataUrl: assignment.avatarDataUrl })} time={formatClientTimestamp(assignment.completedAt ?? assignment.createdAt ?? task.createdAt ?? new Date().toISOString())} status={<StatusLight state={statusState} label={status} breathing={assignment.state === 'running' && !waitingAction} />}><TimelineSummary content={assignment.content} fallbackTitle={fallbackTitle}>{content}</TimelineSummary></ChatMessage>
}

function ManagerProgressEvent({ task, supervisor }: { task: TaskDetailView; supervisor: PersonIdentity }): React.JSX.Element | null {
  if (task.delivery) return null
  const checkpoint = [...task.timeline].reverse().find((item) => item.phase === 'manager_rework' || item.phase === 'manager_review')
  if (!checkpoint) return null
  const reworking = checkpoint.phase === 'manager_rework'
  return <div className="manager-progress-event" role="status"><PersonAvatar identity={supervisor} size="small" /><span><strong>{supervisor.name}</strong>{reworking ? '已完成阶段验收，正在安排员工补充处理。' : '正在根据验收标准审核员工结果。'}</span><time>{formatClientTimestamp(checkpoint.createdAt)}</time></div>
}

function TaskWorkTimeline({ task, supervisor }: { task: TaskDetailView; supervisor: PersonIdentity }): React.JSX.Element | null {
  if (!task.assignments.length) return null
  return <div className="task-work-timeline" aria-label="员工工作时间线"><TeamJoinedEvent task={task} />{task.assignments.map((assignment) => <EmployeeProgressMessage key={assignment.id} task={task} assignment={assignment} />)}<ManagerProgressEvent task={task} supervisor={supervisor} /></div>
}

function DeliveryMessage({ task, supervisor, onOpen, onOpenArtifact, onRevealArtifact }: { task: TaskDetailView; supervisor: PersonIdentity; onOpen: () => void; onOpenArtifact: (artifactId: string) => void; onRevealArtifact: (artifactId: string) => void }): React.JSX.Element | null {
  const delivery = task.delivery
  if (!delivery) return null
  const passed = delivery.acceptanceResults.filter((item) => item.passed).length
  const completed = passed === delivery.acceptanceResults.length
  const content = delivery.content ?? {
    schemaVersion: 1 as const,
    title: completed ? '交付结果已完成' : '交付结果需要处理',
    summary: completed ? delivery.artifacts.length ? '交付文件已生成。' : '结果已完成。' : '部分结果尚未满足要求。',
    ...(delivery.unresolvedIssues.length ? { detail: { label: '查看未决问题', content: delivery.unresolvedIssues.join('；') } } : {})
  }
  return <ChatMessage source="agent" variant="timeline" name={supervisor.name} initials={supervisor.initials} color={supervisor.color} avatarSrc={supervisor.avatarSrc ?? undefined} time={formatClientTimestamp(delivery.createdAt ?? task.timeline.at(-1)?.createdAt ?? new Date().toISOString())} status={<StatusLight state={completed ? 'success' : 'waiting'} label={completed ? '已交付' : '部分通过'} />}>
    <ChatContentBlock content={content} variant="delivery">
      <MessageAttachmentGroup source="agent" embedded attachments={delivery.artifacts.map((artifact) => ({ id: artifact.id, name: artifactDisplayName(artifact.relativePath), detail: artifactTypeLabel(artifact.mediaType) }))} onOpen={onOpenArtifact} onReveal={onRevealArtifact} />
      <button type="button" className="text-action" onClick={onOpen}>查看完整验收记录 <NavArrowRight aria-hidden /></button>
    </ChatContentBlock>
  </ChatMessage>
}

function MatterDetailModal({ task, retrying, onRetry, onClose }: { task?: TaskDetailView; retrying: boolean; onRetry: (task: TaskDetailView) => void; onClose: () => void }): React.JSX.Element {
  if (!task) return <ClientModal open={false} title="事项详情" size="medium" onClose={onClose}><div /></ClientModal>
  const summary = taskSummary(task)
  const milestones = buildFriendlyTimeline(task)
  const acceptanceResults = task.delivery?.acceptanceResults ?? task.acceptanceCriteria.map((criterion) => ({ criterion, passed: task.state === 'succeeded' }))
  const passedCount = acceptanceResults.filter((item) => item.passed).length
  const summaryTone = task.state === 'succeeded' ? 'success' : task.state === 'failed' || task.state === 'needs_attention' ? 'danger' : task.state === 'running' ? 'active' : 'waiting'
  const showExecutionProgress = task.state !== 'succeeded'
  return <ClientModal open title={task.title} eyebrow={<StatusLight state={summaryTone} label={taskStateLabel(task.state)} breathing={task.state === 'running'} />} size="medium" onClose={onClose}><div className="matter-detail-content detail-modal-content">
    <DetailSummaryPanel
      icon={task.state === 'succeeded' ? <ShieldCheck aria-hidden /> : <InfoCircle aria-hidden />}
      title={summary.title}
      description={summary.description}
      tone={summaryTone}
      metrics={task.delivery ? [
        { label: '完成要求', value: `${passedCount}/${acceptanceResults.length}` },
        { label: '来源证据', value: task.delivery.evidenceCount },
        { label: '交付文件', value: task.delivery.artifacts.length }
      ] : []}
    />

    <section className="matter-detail-goal">
      <DetailSectionHeader title="事项目标" description="执行与验收仍以完整目标为准" />
      <p>{task.goal}</p>
    </section>

    <section>
      <DetailSectionHeader title={task.delivery ? '验收结果' : '完成要求'} description={task.delivery ? '逐项核对最终交付是否满足事项目标' : '任务完成时需要满足以下要求'} meta={`${passedCount}/${acceptanceResults.length} 已通过`} />
      <SummaryList emptyMessage="当前事项没有设置完成要求。" variant="outlined">{acceptanceResults.map((item) => <SummaryListItem key={item.criterion} leading={<DetailListMark tone={item.passed ? 'success' : task.delivery ? 'danger' : 'waiting'}>{item.passed ? <Check aria-hidden /> : <InfoCircle aria-hidden />}</DetailListMark>} title={item.criterion} trailing={<DetailState tone={item.passed ? 'success' : task.delivery ? 'danger' : 'waiting'}>{item.passed ? '已通过' : task.delivery ? '未通过' : '待完成'}</DetailState>} />)}</SummaryList>
    </section>

    {showExecutionProgress && <section>
      <DetailSectionHeader title="执行进度" description="仅展示用户需要了解的关键阶段" meta={`${milestones.length} 个阶段`} />
      {milestones.length ? <div className="matter-progress-list">{milestones.map((item) => <div className={`matter-progress-item matter-progress-item--${item.state}`} key={item.key}><span className="matter-progress-item__marker">{item.state === 'done' ? <Check aria-hidden /> : null}</span><div><div className="matter-progress-item__title"><strong>{item.title}</strong><time>{formatClientTimestamp(item.createdAt)}</time></div><p>{item.description}</p></div></div>)}</div> : <p className="empty-state">任务尚未开始，开始后会在这里显示进度。</p>}
    </section>}

    <section>
      <DetailSectionHeader title="参与员工" description="负责完成本次任务的临时团队" meta={`${task.assignments.length} 位`} />
      <SummaryList emptyMessage="任务确认后会自动安排合适的员工。" variant="outlined">{task.assignments.map((item) => { const name = item.employeeName ?? `员工 ${item.sequence}`; const tone: DetailTone = item.state === 'succeeded' ? 'success' : item.state === 'failed' ? 'danger' : item.state === 'running' ? 'active' : 'muted'; return <SummaryListItem key={item.id} leading={<Avatar label={name} initials={name.slice(0, 1)} color={employeeColors[(item.sequence - 1) % employeeColors.length]} size="small" src={employeeAvatarSrc({ employeeId: item.employeeId, avatarDataUrl: item.avatarDataUrl })} />} title={name} subtitle={item.employeeRole ?? '任务协作'} trailing={<DetailState tone={tone}>{assignmentStateLabel(item.state)}</DetailState>} /> })}</SummaryList>
    </section>

    {task.delivery && <section>
      <DetailSectionHeader title="交付文件与证据" description="任务结果、交付文件和来源证据已保存，可在下方查看" meta={`${task.delivery.artifacts.length} 个文件`} />
      <SummaryList emptyMessage="本事项没有生成交付文件。" variant="outlined">{task.delivery.artifacts.map((item) => <SummaryListItem key={item.id} leading={<DetailListMark tone="success" shape="rounded"><Page aria-hidden /></DetailListMark>} title={item.relativePath} subtitle={artifactTypeLabel(item.mediaType)} trailing={<DetailState tone="muted">已保存</DetailState>} />)}</SummaryList>
      <DetailNote icon={<ShieldCheck aria-hidden />} tone="success">已保存 {task.delivery.evidenceCount} 条来源证据，可用于核对结果。</DetailNote>
      {task.delivery.unresolvedIssues.length > 0 && <div className="boundary-note">仍需注意：{task.delivery.unresolvedIssues.join('；')}</div>}
    </section>}
    {(task.state === 'failed' || task.state === 'succeeded') && <div className="detail-actions"><button type="button" className="button button--primary" disabled={retrying} onClick={() => onRetry(task)}>{retrying ? '正在重新执行' : task.state === 'failed' ? '按该事项原内容重试' : '按该事项原内容重新执行'}</button></div>}
  </div></ClientModal>
}

function MatterEvent({ task, onOpen, onAnchor }: { task: TaskDetailView; onOpen: () => void; onAnchor: (element: HTMLButtonElement | null) => void }): React.JSX.Element {
  const summary = taskSummary(task)
  const tone = taskStateTone(task.state)
  return (
    <button ref={onAnchor} type="button" className="matter-event message-stream-item" aria-label={`查看事项：${task.title}`} onClick={onOpen}>
      <span className="matter-event__body"><strong>{task.title}</strong><span>{summary.description}</span></span>
      <span className="matter-event__meta"><span className={`matter-event__state matter-event__state--${tone}`} aria-live="polite"><i aria-hidden />{taskStateLabel(task.state)}</span><span className="matter-event__time"><time>{formatClientTimestamp(taskUpdatedAt(task))}</time><NavArrowRight aria-hidden /></span></span>
    </button>
  )
}

function MatterSidebar({ tasks, collapsed, onLocate }: { tasks: TaskDetailView[]; collapsed: boolean; onLocate: (task: TaskDetailView) => void }): React.JSX.Element {
  const hasRunningTask = tasks.some((task) => task.state === 'running')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!hasRunningTask) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [hasRunningTask])
  const orderedTasks = [...tasks].sort((left, right) => new Date(taskUpdatedAt(right)).getTime() - new Date(taskUpdatedAt(left)).getTime())
  return (
    <aside className={`matter-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="当前会话事项">
      {!collapsed && <><div className="matter-sidebar__header"><span><strong>事项</strong><small>{tasks.length}</small></span></div><div className="matter-sidebar__list">{orderedTasks.map((task) => <button type="button" className="matter-sidebar__item" key={task.id} aria-label={`定位事项：${task.title}`} onClick={() => onLocate(task)}><span className={`matter-sidebar__status matter-sidebar__status--${task.state}`} aria-hidden /><span><strong>{task.title}</strong><small>{taskStateLabel(task.state)} · 运行 {formatRunDuration(task.runStartedAt, task.runCompletedAt, now)}</small></span></button>)}{tasks.length === 0 && <p className="matter-sidebar__empty">当前会话暂无事项</p>}</div></>}
    </aside>
  )
}

function Workbench({ runtimeStatus, providerStatus, conversationId, user, supervisor, matterSidebarCollapsed, initialDraft, onInitialDraftConsumed, onDataChanged }: { runtimeStatus: RuntimeStatus; providerStatus: ProviderStatus; conversationId: string; user: PersonIdentity; supervisor: PersonIdentity; matterSidebarCollapsed: boolean; initialDraft?: string; onInitialDraftConsumed?: () => void; onDataChanged: () => void }): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationMessageView[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingResponseStartedAt, setPendingResponseStartedAt] = useState<string>()
  const [activeRequestId, setActiveRequestId] = useState<string>()
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string>()
  const [tasks, setTasks] = useState<TaskDetailView[]>([])
  const [taskBusy, setTaskBusy] = useState(false)
  const [selectedMatterId, setSelectedMatterId] = useState<string>()
  const [composerPanel, setComposerPanel] = useState<ComposerPanel>(null)
  const [draftAttachments, setDraftAttachments] = useState<AttachmentView[]>([])
  const [isFileDragging, setIsFileDragging] = useState(false)
  const [authorizedDirectories, setAuthorizedDirectories] = useState<string[]>([])
  const matterAnchors = useRef(new Map<string, HTMLButtonElement>())
  const composerInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!initialDraft) return
    setDraft(initialDraft)
    const frame = window.requestAnimationFrame(() => composerInputRef.current?.focus())
    onInitialDraftConsumed?.()
    return () => window.cancelAnimationFrame(frame)
  }, [conversationId, initialDraft])

  useEffect(() => {
    let mounted = true
    let refreshingTasks = false
    const receiveTasks = (items: TaskDetailView[]): void => {
      if (!mounted) return
      setTasks(items)
    }
    setMessages([])
    setPendingResponseStartedAt(undefined)
    setActiveRequestId(undefined)
    setSelectedMatterId(undefined)
    setComposerPanel(null)
    setDraftAttachments([])
    window.aiEmployeeOS.task.outputDirectory().then((directory) => { if (mounted) setAuthorizedDirectories([directory]) }).catch(() => { if (mounted) setError('下载目录读取失败') })
    window.aiEmployeeOS.conversation.history(conversationId).then((history) => { if (mounted) setMessages(history) }).catch(() => { if (mounted) setError('历史对话读取失败') })
    const refreshTasks = (): void => {
      if (refreshingTasks) return
      refreshingTasks = true
      window.aiEmployeeOS.task.list().then(receiveTasks).catch(() => { /* 下一轮或 Runtime 事件会继续同步 */ }).finally(() => { refreshingTasks = false })
    }
    window.aiEmployeeOS.task.list().then(receiveTasks).catch(() => { if (mounted) setError('任务投影读取失败') })
    const unsubscribe = window.aiEmployeeOS.conversation.onEvent((event) => {
      if (event.type === 'output_delta') {
        setActiveRequestId(event.requestId)
        setMessages((current) => {
          const id = `stream:${event.requestId}`
          const existing = current.find((message) => message.id === id)
          if (existing) return current.map((message) => message.id === id ? { ...message, content: message.content + event.delta } : message)
          return [...current, { id, role: 'assistant', content: event.delta, createdAt: new Date().toISOString(), modelId: 'deepseek-v4-pro' }]
        })
      } else if (event.type === 'completed') {
        setSending(false)
        setPendingResponseStartedAt(undefined)
        setActiveRequestId(undefined)
        setCancelling(false)
        window.aiEmployeeOS.task.list().then(receiveTasks).catch(() => { if (mounted) setError('事项草稿读取失败') })
        onDataChanged()
      } else if (event.type === 'failed') {
        setSending(false)
        setPendingResponseStartedAt(undefined)
        setActiveRequestId(undefined)
        setCancelling(false)
        setError(`模型请求失败：${event.code}`)
      }
    })
    const unsubscribeTask = window.aiEmployeeOS.task.onEvent(refreshTasks)
    const unsubscribeEmployee = window.aiEmployeeOS.employee.onEvent(() => { window.aiEmployeeOS.task.list().then(receiveTasks) })
    const refreshOnFocus = (): void => refreshTasks()
    window.addEventListener('focus', refreshOnFocus)
    return () => { mounted = false; window.removeEventListener('focus', refreshOnFocus); unsubscribe(); unsubscribeTask(); unsubscribeEmployee() }
  }, [conversationId])

  const conversationTasks = coalesceMatterCards(tasks.filter((task) => task.conversationId === conversationId))
  const activeTask = selectActiveTask(conversationTasks)
  const selectedMatter = selectedMatterId ? tasks.find((task) => task.id === selectedMatterId) : undefined
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  const latestChangeMessage = activeTask ? [...messages].reverse().find((message) => message.role === 'user' && !(activeTask.sourceMessageIds ?? []).includes(message.id)) : undefined
  const activeRouteMode = activeTask && latestUserMessage && activeTask.sourceMessageIds?.length ? activeTask.sourceMessageIds.includes(latestUserMessage.id) ? 'created' : 'linked' : 'created'

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const text = draft.trim() || (draftAttachments.length ? '请先阅读这些附件的实际内容，再根据我的目标选择合适的员工处理。' : '')
    if ((!text && !draftAttachments.length) || sending || runtimeStatus.state !== 'connected') return
    setDraft('')
    setError(undefined)
    setSending(true)
    setPendingResponseStartedAt(new Date().toISOString())
    setActiveRequestId(undefined)
    const optimisticId = `local:${Date.now()}`
    const attachments = [...draftAttachments]
    setMessages((current) => [...current, { id: optimisticId, role: 'user', content: text, createdAt: new Date().toISOString(), attachments }])
    try {
      const directories = authorizedDirectories.length ? authorizedDirectories : [await window.aiEmployeeOS.task.outputDirectory()]
      const result = await window.aiEmployeeOS.conversation.send(conversationId, text, directories, attachments.map((attachment) => attachment.id))
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, id: result.messageId } : message))
      setDraftAttachments([])
      setActiveRequestId(result.requestId)
      onDataChanged()
    } catch {
      setSending(false)
      setPendingResponseStartedAt(undefined)
      setError('消息未进入 Runtime')
    }
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const selectAttachments = async (): Promise<void> => {
    setError(undefined)
    try {
      const selected = await window.aiEmployeeOS.attachment.select()
      setDraftAttachments((current) => [...new Map([...current, ...selected].map((attachment) => [attachment.id, attachment])).values()])
    } catch (reason) {
      setError(attachmentImportErrorMessage(reason))
    }
  }

  const importDroppedAttachments = async (files: File[]): Promise<void> => {
    if (!files.length) return
    setError(undefined)
    if (typeof window.aiEmployeeOS.attachment.importDropped !== 'function') {
      setError('附件上传组件已更新，请重启客户端后重试')
      return
    }
    try {
      const selected = await window.aiEmployeeOS.attachment.importDropped(files)
      setDraftAttachments((current) => [...new Map([...current, ...selected].map((attachment) => [attachment.id, attachment])).values()])
    } catch (reason) {
      setError(attachmentImportErrorMessage(reason))
    }
  }

  const isFileDrag = (event: React.DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files')

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
    if (!source || !activeTask) return
    setTaskBusy(true); setError(undefined)
    try {
      const directories = authorizedDirectories.length ? authorizedDirectories : [await window.aiEmployeeOS.task.outputDirectory()]
      const created = await window.aiEmployeeOS.task.createDraft({ conversationId, sourceMessageIds: [source.id], goal: source.content, acceptanceCriteria: activeTask.acceptanceCriteria, employeeVersionIds: activeTask.employeeVersionIds, directories, authorizationMode: 'full_access' })
      const value = created.requiresDirectories && created.directories.length === 0 ? created : await window.aiEmployeeOS.task.start(created.draftId)
      setTasks((current) => [value, ...current]); onDataChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '任务草稿创建失败') } finally { setTaskBusy(false) }
  }

  const retryTask = async (task = activeTask): Promise<void> => {
    if (!task?.taskId || !['failed', 'succeeded'].includes(task.state)) return
    setTaskBusy(true); setError(undefined)
    try {
      const retried = await window.aiEmployeeOS.task.retry(task.taskId)
      setTasks((current) => current.map((item) => item.taskId === retried.taskId ? retried : item))
      if (selectedMatterId === retried.taskId || selectedMatterId === retried.id) setSelectedMatterId(retried.id)
      onDataChanged()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setError(message.includes('retry_requires_external_write_review') || message.includes('unsettled_tool_action')
        ? '该事项存在结果未核实的写入操作，请先在事项详情中确认真实结果后再重试'
        : '事项重试失败，请稍后重试')
    } finally {
      setTaskBusy(false)
    }
  }

  const requestTaskChange = async (): Promise<void> => {
    const source = latestChangeMessage
    if (!activeTask?.taskId || !source) return
    setTaskBusy(true); setError(undefined)
    try { await window.aiEmployeeOS.task.requestChange(activeTask.taskId, source.id, { goal: source.content }); setTasks(await window.aiEmployeeOS.task.list()) } catch (reason) { setError(reason instanceof Error ? reason.message : '变更请求创建失败') } finally { setTaskBusy(false) }
  }

  const decideTaskChange = async (accepted: boolean): Promise<void> => {
    if (!activeTask?.pendingChange) return
    setTaskBusy(true); setError(undefined)
    try {
      const value = accepted ? await window.aiEmployeeOS.task.acceptChange(activeTask.pendingChange.id, { goal: String(activeTask.pendingChange.requestedDiff.goal ?? activeTask.goal), acceptanceCriteria: activeTask.acceptanceCriteria, employeeVersionIds: activeTask.employeeVersionIds, directories: activeTask.directories }) : await window.aiEmployeeOS.task.rejectChange(activeTask.pendingChange.id)
      setTasks((current) => current.map((item) => item.id === value.id ? value : item))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '变更决策失败') } finally { setTaskBusy(false) }
  }

  const performArtifactAction = async (taskId: string, artifactId: string, action: 'open' | 'reveal'): Promise<void> => {
    try {
      if (action === 'open') await window.aiEmployeeOS.task.openArtifact(taskId, artifactId)
      else await window.aiEmployeeOS.task.revealArtifact(taskId, artifactId)
    } catch {
      setError(action === 'open' ? '无法使用系统默认应用打开该文件' : '无法打开该文件所在文件夹')
    }
  }

  const startDraftInOutputDirectory = async (): Promise<void> => {
    if (activeTask?.state !== 'draft') return
    setTaskBusy(true); setError(undefined)
    try {
      const directory = authorizedDirectories[0] ?? await window.aiEmployeeOS.task.outputDirectory()
      const updated = await window.aiEmployeeOS.task.updateDraft(activeTask.draftId, { goal: activeTask.goal, acceptanceCriteria: activeTask.acceptanceCriteria, employeeVersionIds: activeTask.employeeVersionIds, directories: [directory] })
      const started = await window.aiEmployeeOS.task.start(updated.draftId)
      setTasks((current) => current.map((item) => item.draftId === started.draftId ? started : item))
    } catch { setError('事项未能使用下载目录启动') } finally { setTaskBusy(false) }
  }

  const locateMatter = (task: TaskDetailView): void => {
    const target = matterAnchors.current.get(task.id)
    if (!target) return
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
  }

  const activeStreamMessageId = activeRequestId ? `stream:${activeRequestId}` : undefined
  const hasActiveStreamMessage = activeStreamMessageId ? messages.some((message) => message.id === activeStreamMessageId) : false
  const showSupervisorThinking = sending && !hasActiveStreamMessage && Boolean(pendingResponseStartedAt)

  return (
    <div className="workspace-page message-page">
      <div className={`conversation-workspace${matterSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <div className="conversation-column">
      <div className="message-scroll" aria-label="对话">
        <div className="message-canvas">
          {messages.length === 0 ? (
            <div className="runtime-empty-state">
              <span className="runtime-empty-state__mark" aria-hidden="true"><Sparks /></span>
              <h2 id="conversation-title">从一段对话开始</h2>
              <p>描述目标。{supervisor.name}会先判断是直接回答、归入已有事项，还是创建新事项。</p>
            </div>
          ) : (
            <div className="runtime-message-list" aria-live="polite"><div className="date-divider"><span>今天</span></div>{messages.map((message) => <MessageBlock key={message.id} message={message} user={user} supervisor={supervisor} streamingActive={sending && message.id === activeStreamMessageId} />)}{showSupervisorThinking && pendingResponseStartedAt && <AgentActivityMessage activity={{ state: 'thinking', agent: { name: supervisor.name, initials: supervisor.initials, color: supervisor.color, avatarSrc: supervisor.avatarSrc ?? undefined }, time: formatClientTimestamp(pendingResponseStartedAt) }} />}</div>
          )}

          {activeTask ? (
            <><MatterRouteNote title={activeTask.title} mode={activeRouteMode} busy={taskBusy} onOpenMatter={() => setSelectedMatterId(activeTask.id)} onCreateMatter={() => void createTaskDraft()} onRequestChange={activeTask.state === 'running' && !activeTask.pendingChange && latestChangeMessage ? () => void requestTaskChange() : undefined} />{conversationTasks.map((task) => <MatterEvent key={task.id} task={task} onOpen={() => setSelectedMatterId(task.id)} onAnchor={(element) => { if (element) matterAnchors.current.set(task.id, element); else matterAnchors.current.delete(task.id) }} />)}<TaskWorkTimeline task={activeTask} supervisor={supervisor} />
              {activeTask.pendingChange && <div className="change-card message-stream-item"><strong>待处理变更</strong><p>{String(activeTask.pendingChange.requestedDiff.goal ?? '需求已变化')}</p>{activeTask.state === 'needs_attention' ? <div><button type="button" onClick={() => void decideTaskChange(false)} disabled={taskBusy}>保持原事项</button><button type="button" onClick={() => void decideTaskChange(true)} disabled={taskBusy}>接受并启动新 Revision</button></div> : <small>将在当前节点完成并提交 Checkpoint 后暂停</small>}</div>}
              {activeTask.state === 'failed' && <section className="runtime-route-note message-stream-item"><Page aria-hidden /><span>本次执行已失败；未完成的只读 Tool 已安全终止，结果未知的写入操作需要先核验。</span><button type="button" onClick={() => void retryTask()} disabled={taskBusy}>{taskBusy ? '正在重试' : '按原事项重试'}</button></section>}
              {activeTask.state === 'draft' && <section className="runtime-route-note message-stream-item"><Page aria-hidden /><span>{activeTask.requiresDirectories && activeTask.directories.length === 0 ? '该事项尚未绑定固定下载目录。' : '事项已生成，Runtime 正在自动启动员工。'}</span>{activeTask.requiresDirectories && activeTask.directories.length === 0 && <button type="button" onClick={() => void startDraftInOutputDirectory()} disabled={taskBusy}>{taskBusy ? '正在启动' : '使用下载文件夹并开始'}</button>}</section>}
              <DeliveryMessage task={activeTask} supervisor={supervisor} onOpen={() => setSelectedMatterId(activeTask.id)} onOpenArtifact={(artifactId) => void performArtifactAction(activeTask.id, artifactId, 'open')} onRevealArtifact={(artifactId) => void performArtifactAction(activeTask.id, artifactId, 'reveal')} />{activeTask.toolActions.some((item) => item.state === 'result_unknown') && <div className="boundary-note message-stream-item">存在结果未知的 Tool Action。需要在 Runtime 记录真实外部结果后才能继续，客户端不会猜测成功或失败。</div>}</>
          ) : null}
        </div>
      </div>
      <form className="composer" onSubmit={submit} onDragEnter={(event) => { if (!isFileDrag(event)) return; event.preventDefault(); setIsFileDragging(true) }} onDragOver={(event) => { if (!isFileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFileDragging(false) }} onDrop={(event) => { if (!isFileDrag(event)) return; event.preventDefault(); setIsFileDragging(false); void importDroppedAttachments(Array.from(event.dataTransfer.files)) }}>
        <div className={`composer__box${isFileDragging ? ' is-file-dragging' : ''}`}>
          {isFileDragging && <div className="composer-drop-zone" role="status"><Page aria-hidden /><span><strong>松开以上传文件</strong><small>Word、PowerPoint、Excel、PDF 或图片</small></span></div>}
          {draftAttachments.length > 0 && <div className="composer-attachment-tray"><MessageAttachmentGroup source="user" attachments={draftAttachments.map((attachment) => ({ id: attachment.id, name: attachment.name, detail: fileDetail(attachment) }))} onRemove={(id) => setDraftAttachments((items) => items.filter((attachment) => attachment.id !== id))} /></div>}
          <textarea ref={composerInputRef} id="supervisor-input" aria-label="发送消息" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={`发送给${supervisor.name}，补充问题或事项信息`} disabled={runtimeStatus.state !== 'connected' || sending} />
          <div className="composer__toolbar">
            <div className="composer__group"><button type="button" className="attachment-upload-button icon-button" aria-label="添加附件" title="选择 Word、PowerPoint、Excel、PDF 或图片附件" onClick={() => void selectAttachments()}><Plus aria-hidden /></button></div>
            <div className="composer__group">
              <button type="button" className="composer__control" aria-expanded={composerPanel === 'model'} aria-controls="composer-model-panel" onClick={() => setComposerPanel((panel) => panel === 'model' ? null : 'model')}><Sparks aria-hidden /><span>deepseek-v4-pro</span><NavArrowDown aria-hidden /></button>
              <IconButton label="语音输入" icon={Microphone} onClick={() => setComposerPanel((panel) => panel === 'voice' ? null : 'voice')} />
              {sending && activeRequestId ? <button type="button" className="composer__control composer__cancel" onClick={cancel} disabled={cancelling}><Xmark aria-hidden />{cancelling ? '取消中' : '取消'}</button> : null}
              <button type="submit" aria-label="发送" className="composer__send" disabled={(!draft.trim() && !draftAttachments.length) || sending || runtimeStatus.state !== 'connected'}><ArrowUp aria-hidden /></button>
            </div>
          </div>
          {composerPanel && <div className={`composer-popover composer-popover--${composerPanel}`} id={`composer-${composerPanel}-panel`} role="dialog" aria-label={composerPanel === 'model' ? '当前会话模型' : '语音输入说明'}>{composerPanel === 'model' ? <><strong>当前会话模型</strong><div className="composer-popover__options">{providerStatus.models.filter((model) => model.modality === 'text').map((model) => <button type="button" key={`${model.provider}:${model.modelId}`} className={model.modelId === 'deepseek-v4-pro' ? 'is-active' : ''} onClick={() => setComposerPanel(null)}><span><b>{model.modelId}</b><small>{model.provider} · {model.verification === 'verified' ? '已验证' : '未验证'}</small></span>{model.modelId === 'deepseek-v4-pro' && <Check aria-hidden />}</button>)}</div><p>模型由当前 Runtime 会话固定；此处展示真实可用状态，不会静默切换。</p></> : <><strong>语音输入</strong><p>客户端尚未接入 macOS 麦克风权限与转写 Bridge，因此不会请求权限或伪造录音。入口交互已保留。</p><StatusLight state="muted" label="暂未开放" /></>}</div>}
        </div>
        {error && <small className="composer-error" role="alert">{error}</small>}
      </form>
      </div>
      <MatterSidebar tasks={conversationTasks} collapsed={matterSidebarCollapsed} onLocate={locateMatter} />
      </div>
      <MatterDetailModal task={selectedMatter} retrying={taskBusy} onRetry={(task) => void retryTask(task)} onClose={() => setSelectedMatterId(undefined)} />
    </div>
  )
}

export function App(): React.JSX.Element {
  const [activeId, setActiveId] = useState<ModuleId>('workbench')
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(initialStatus)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(initialProviderStatus)
  const [conversations, setConversations] = useState<ConversationSummaryView[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState(readInitialConversationId)
  const [conversationQuery, setConversationQuery] = useState('')
  const [systemSection, setSystemSection] = useState<SystemSectionId>('profile')
  const [profile, setProfile] = useState<ClientProfile>(readClientProfile)
  const [supervisor, setSupervisor] = useState<SupervisorConfigInput>({ ...DEFAULT_SUPERVISOR_CONFIG, memoryScopes: [...DEFAULT_SUPERVISOR_CONFIG.memoryScopes] })
  const [readCounts, setReadCounts] = useState<Record<string, number>>(readConversationCounts)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [expertGroups, setExpertGroups] = useState<ExpertGroupView[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>()
  const [selectedExpertGroupId, setSelectedExpertGroupId] = useState<string>()
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeCreateRequest, setEmployeeCreateRequest] = useState(0)
  const [employeeEditRequest, setEmployeeEditRequest] = useState(0)
  const [agentEntryOpen, setAgentEntryOpen] = useState(false)
  const [teamView, setTeamView] = useState<TeamView>('directory')
  const [teamDirectoryKind, setTeamDirectoryKind] = useState<TeamDirectoryKind>('experts')
  const [recruitmentKind, setRecruitmentKind] = useState<RecruitmentKind>('experts')
  const [conversationDraftSeed, setConversationDraftSeed] = useState<{ conversationId: string; text: string }>()
  const [resourceCatalog, setResourceCatalog] = useState<ResourceCatalogView>(emptyResourceCatalog)
  const [resourceKind, setResourceKind] = useState<ResourceKind>('skills')
  const [selectedResourceId, setSelectedResourceId] = useState<string>()
  const [resourceQuery, setResourceQuery] = useState('')
  const [resourceError, setResourceError] = useState<string>()
  const [resourceCatalogLoading, setResourceCatalogLoading] = useState(false)
  const [probingResources, setProbingResources] = useState(false)
  const [resourceInfoOpen, setResourceInfoOpen] = useState(false)
  const [feishuStatus, setFeishuStatus] = useState<FeishuConnectionStatus>(EMPTY_FEISHU_STATUS)
  const [connectionStatusLoading, setConnectionStatusLoading] = useState(true)
  const [connectionModalOpen, setConnectionModalOpen] = useState(false)
  const [contextCollapsed, setContextCollapsed] = useState(false)
  const [matterSidebarCollapsed, setMatterSidebarCollapsed] = useState(false)
  const resourceCatalogRef = useRef<ResourceCatalogView>(emptyResourceCatalog)
  const runtimeCatalogRefreshRef = useRef<Promise<void> | null>(null)
  const runtimeCatalogRetryRef = useRef<number | null>(null)
  const runtimeCatalogRetryAttemptRef = useRef(0)
  const runtimeConnectedRef = useRef(false)
  const mountedRef = useRef(true)
  const activeModule = useMemo(() => modules.find((module) => module.id === activeId)!, [activeId])
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId)
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)
  const selectedExpertGroup = expertGroups.find((group) => group.id === selectedExpertGroupId) ?? expertGroups[0]
  const selectedResource = resourcesFor(resourceCatalog, resourceKind).find((item) => item.id === selectedResourceId) ?? resourcesFor(resourceCatalog, resourceKind)[0]
  const runtimeLabel = runtimeStatus.state === 'connecting' ? '正在连接' : '重新连接'
  const unreadCountFor = (conversation: ConversationSummaryView): number => Math.max(0, conversation.messageCount - (readCounts[conversation.id] ?? 0))
  const totalUnread = conversations.reduce((total, conversation) => total + unreadCountFor(conversation), 0)

  const refreshConversationData = async (): Promise<void> => {
    const items = await window.aiEmployeeOS.conversation.list()
    if (items.length > 0) {
      setConversations(items)
      setSelectedConversationId((current) => items.some((item) => item.id === current) ? current : items[0].id)
      return
    }
    const created = await window.aiEmployeeOS.conversation.create()
    setConversations([created])
    setSelectedConversationId(created.id)
  }

  const refreshRuntimeCatalogs = (mounted: () => boolean): Promise<void> => {
    if (runtimeCatalogRefreshRef.current) return runtimeCatalogRefreshRef.current
    const hasCatalog = resourceCatalogRef.current.skills.length > 0 || resourceCatalogRef.current.tools.length > 0
    if (!hasCatalog) setResourceCatalogLoading(true)
    const refresh = Promise.allSettled([
      window.aiEmployeeOS.employee.list(),
      window.aiEmployeeOS.expertGroup.list(),
      window.aiEmployeeOS.resource.list()
    ]).then(([employeeResult, expertGroupResult, resourceResult]) => {
      if (!mounted()) return
      if (employeeResult.status === 'fulfilled') {
        const activeEmployees = employeeResult.value.filter((employee) => employee.status !== 'archived')
        setEmployees(activeEmployees)
        setSelectedEmployeeId((current) => current && activeEmployees.some((employee) => employee.id === current) ? current : activeEmployees[0]?.id)
      }
      if (expertGroupResult.status === 'fulfilled') {
        setExpertGroups(expertGroupResult.value)
        setSelectedExpertGroupId((current) => current && expertGroupResult.value.some((group) => group.id === current) ? current : expertGroupResult.value[0]?.id)
      }
      if (resourceResult.status === 'fulfilled') {
        const catalog = resourceResult.value
        if (runtimeCatalogRetryRef.current !== null) window.clearTimeout(runtimeCatalogRetryRef.current)
        runtimeCatalogRetryRef.current = null
        runtimeCatalogRetryAttemptRef.current = 0
        resourceCatalogRef.current = catalog
        setResourceCatalog(catalog)
        setSelectedResourceId((current) => current && [...catalog.skills, ...catalog.tools].some((resource) => resource.id === current) ? current : catalog.skills[0]?.id ?? catalog.tools[0]?.id)
        setResourceCatalogLoading(false)
        setResourceError(undefined)
      } else if (resourceCatalogRef.current.skills.length === 0 && resourceCatalogRef.current.tools.length === 0 && runtimeCatalogRetryRef.current === null) {
        setResourceError(undefined)
        const attempt = runtimeCatalogRetryAttemptRef.current
        const delay = resourceCatalogRetryDelaysMs[Math.min(attempt, resourceCatalogRetryDelaysMs.length - 1)]
        runtimeCatalogRetryAttemptRef.current = attempt + 1
        runtimeCatalogRetryRef.current = window.setTimeout(() => {
          runtimeCatalogRetryRef.current = null
          if (mounted() && runtimeConnectedRef.current) void refreshRuntimeCatalogs(mounted)
        }, delay)
      }
    }).finally(() => {
      if (runtimeCatalogRefreshRef.current === refresh) runtimeCatalogRefreshRef.current = null
    })
    runtimeCatalogRefreshRef.current = refresh
    return refresh
  }

  useEffect(() => {
    let mounted = true
    mountedRef.current = true
    const handleRuntimeStatus = (status: RuntimeStatus): void => {
      if (!mounted) return
      setRuntimeStatus(status)
      runtimeConnectedRef.current = status.state === 'connected'
      if (status.state === 'connected') void refreshRuntimeCatalogs(() => mounted)
      else {
        if (runtimeCatalogRetryRef.current !== null) window.clearTimeout(runtimeCatalogRetryRef.current)
        runtimeCatalogRetryRef.current = null
        runtimeCatalogRetryAttemptRef.current = 0
        if (resourceCatalogRef.current.skills.length === 0 && resourceCatalogRef.current.tools.length === 0) setResourceCatalogLoading(false)
      }
    }
    window.aiEmployeeOS.runtime.getStatus().then(handleRuntimeStatus)
    window.aiEmployeeOS.provider.getStatus().then((status) => {
      if (mounted) setProviderStatus(status)
    })
    window.aiEmployeeOS.supervisor.get().then((value) => { if (mounted) setSupervisor({ name: value.name, avatarDataUrl: value.avatarDataUrl, systemPrompt: value.systemPrompt, modelId: value.modelId, memoryScopes: [...value.memoryScopes] }) }).catch(() => undefined)
    window.aiEmployeeOS.connection.getFeishuStatus()
      .then((value) => { if (mounted) setFeishuStatus(value) })
      .catch(() => { if (mounted) setFeishuStatus({ ...EMPTY_FEISHU_STATUS, state: 'error', checkedAt: new Date().toISOString(), message: '无法读取飞书连接状态' }) })
      .finally(() => { if (mounted) setConnectionStatusLoading(false) })
    refreshConversationData().catch(() => undefined)
    const unsubscribe = window.aiEmployeeOS.runtime.onStatusChanged(handleRuntimeStatus)
    return () => {
      mounted = false
      mountedRef.current = false
      if (runtimeCatalogRetryRef.current !== null) window.clearTimeout(runtimeCatalogRetryRef.current)
      runtimeCatalogRetryRef.current = null
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
  }

  const enterRecruitmentConversation = async (name: string, kind: 'expert' | 'group'): Promise<void> => {
    const created = await window.aiEmployeeOS.conversation.create()
    setConversations((items) => [created, ...items])
    setSelectedConversationId(created.id)
    setConversationDraftSeed({ conversationId: created.id, text: `请调用${name}${kind === 'group' ? '协作处理' : '处理'}：` })
    setActiveId('workbench')
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
    try {
      const catalog = await window.aiEmployeeOS.resource.probe()
      resourceCatalogRef.current = catalog
      setResourceCatalog(catalog)
    } catch { setResourceError('数据源健康检查失败') } finally { setProbingResources(false) }
  }

  const handleFeishuStatusChange = (status: FeishuConnectionStatus): void => {
    setFeishuStatus(status)
    void refreshRuntimeCatalogs(() => mountedRef.current)
  }

  const visibleConversations = conversations.filter((conversation) => {
    if (!`${conversation.title} ${identityAwareConversationPreview(conversation, profile.name, supervisor.name)}`.toLocaleLowerCase().includes(conversationQuery.trim().toLocaleLowerCase())) return false
    return true
  })

  const context = <ContextPane>
    <SectionHeader title={activeModule.contextTitle} action={activeId === 'workbench' ? <IconButton label="新建会话" icon={Plus} onClick={createConversation} /> : activeId === 'team' && teamView === 'directory' ? <IconButton label="招募" icon={Plus} onClick={() => { if (teamDirectoryKind === 'groups') { setRecruitmentKind('groups'); setTeamView('recruitment') } else setAgentEntryOpen(true) }} /> : activeId === 'resources' ? <IconButton label="能力目录信息" icon={InfoCircle} onClick={() => setResourceInfoOpen(true)} /> : undefined} />
    {activeId === 'workbench' ? <>
      <SearchBox label="搜索会话" placeholder="搜索会话" value={conversationQuery} onChange={setConversationQuery} />
      <div className="context-scroll">{visibleConversations.map((conversation) => {
        const unread = unreadCountFor(conversation)
        return <div className="conversation-row" key={conversation.id}><ListRow title={conversation.title} subtitle={identityAwareConversationPreview(conversation, profile.name, supervisor.name)} meta={formatClientTimestamp(conversation.updatedAt)} selected={selectedConversationId === conversation.id} identity="text" marker={unread > 0 ? <span className="unread-dot" aria-label="未读消息" /> : undefined} onClick={() => setSelectedConversationId(conversation.id)} /><IconButton label={`归档会话 ${conversation.title}`} icon={Trash} className="conversation-row__delete" onClick={() => archiveConversation(conversation.id)} /></div>
      })}</div>
    </> : activeId === 'team' ? <>
      <SearchBox label={teamDirectoryKind === 'experts' ? '搜索专家' : '搜索专家团'} placeholder={teamDirectoryKind === 'experts' ? '搜索专家' : '搜索专家团'} value={employeeQuery} onChange={setEmployeeQuery} />
      <div className="filter-row capability-kind-switch" role="tablist" aria-label="通讯录类型">{([['experts', '专家'], ['groups', '专家团']] as const).map(([id, label]) => <button type="button" role="tab" id={`team-${id}-tab`} aria-controls="team-directory-panel" aria-selected={teamDirectoryKind === id} key={id} className={teamDirectoryKind === id ? 'is-active' : ''} onClick={() => { setTeamDirectoryKind(id); setTeamView('directory'); setEmployeeQuery('') }}>{label}</button>)}</div>
      <div className="context-scroll context-scroll--flush" role="tabpanel" id="team-directory-panel" aria-labelledby={`team-${teamDirectoryKind}-tab`}>{teamDirectoryKind === 'experts'
        ? employees.filter((employee) => `${employee.name} ${employee.role ?? ''}`.includes(employeeQuery.trim())).map((employee) => <ListRow key={employee.id} title={employee.name} subtitle={employee.role || '尚未填写职责'} selected={teamView === 'directory' && selectedEmployeeId === employee.id} avatar={<Avatar label={employee.name} initials={employee.name.slice(0, 1)} color="#c5b8e3" size="small" src={employeeAvatarSrc({ employeeId: employee.id, avatarDataUrl: employee.avatarDataUrl })} />} marker={<StatusLight state={employeeStatusTone(employee.status)} label={employeeStatusLabel(employee.status)} />} onClick={() => { setSelectedEmployeeId(employee.id); setTeamView('directory') }} />)
        : expertGroups.filter((group) => `${group.name} ${group.description} ${group.members.map((member) => member.name).join(' ')}`.includes(employeeQuery.trim())).map((group) => <ListRow key={group.id} title={group.name} subtitle={`${group.members.length} 位专家`} selected={teamView === 'directory' && selectedExpertGroup?.id === group.id} avatar={<ExpertGroupAvatar name={group.name} members={group.members} size="small" />} marker={<StatusLight state="success" label="可调用" />} onClick={() => { setSelectedExpertGroupId(group.id); setTeamView('directory') }} />)}{teamDirectoryKind === 'groups' && expertGroups.length === 0 && <p className="context-list-empty">暂无已招募专家团</p>}</div>
    </> : activeId === 'resources' ? <>
      <SearchBox label="搜索能力" placeholder="搜索能力" value={resourceQuery} onChange={setResourceQuery} />
      <div className="filter-row capability-kind-switch">{([['skills', 'Skills'], ['tools', 'Tools']] as const).map(([id, label]) => <button type="button" key={id} className={resourceKind === id ? 'is-active' : ''} onClick={() => { setResourceKind(id); setSelectedResourceId(resourcesFor(resourceCatalog, id)[0]?.id) }}>{label}</button>)}</div>
      <div className="context-scroll context-scroll--flush">{resourcesFor(resourceCatalog, resourceKind).filter((item) => `${item.name} ${item.description}`.includes(resourceQuery.trim())).map((item) => <ListRow key={item.id} title={item.name} subtitle={`v${item.version} · ${item.available ? '可用' : '不可用'}`} selected={selectedResourceId === item.id} marker={<StatusLight state={item.available ? 'success' : 'danger'} label={item.available ? '可用' : '不可用'} />} onClick={() => setSelectedResourceId(item.id)} />)}</div>
    </> : activeId === 'connections' ? <div className="context-scroll context-scroll--flush" aria-label="已连接应用">
      {connectionStatusLoading ? <p className="context-list-empty" role="status">正在读取连接状态</p> : feishuStatus.state === 'connected' ? <ListRow title={FEISHU_CONNECTION_APPLICATION.name} subtitle={FEISHU_CONNECTION_APPLICATION.description} selected={connectionModalOpen} avatar={<span className="connection-context-logo" role="img" aria-label="飞书官方图标"><img alt="" src={FEISHU_CONNECTION_APPLICATION.icon} /></span>} marker={<StatusLight state="success" label="已连接" />} onClick={() => setConnectionModalOpen(true)} /> : <p className="context-list-empty">暂无已连接应用</p>}
    </div> : <div className="system-navigation">{systemSections.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={systemSection === item.id ? 'is-active' : ''} onClick={() => setSystemSection(item.id)}><Icon aria-hidden /><span>{item.label}</span><NavArrowRight aria-hidden /></button> })}</div>}
  </ContextPane>

  const toolbarSupport = activeId === 'team' && teamView === 'directory' && teamDirectoryKind === 'experts' && selectedEmployee ? <StatusLight state={employeeStatusTone(selectedEmployee.status)} label={employeeStatusLabel(selectedEmployee.status)} breathing={employeeStatusBreathing(selectedEmployee.status)} /> : activeId === 'resources' && selectedResource ? <StatusLight state={selectedResource.available ? 'success' : 'danger'} label={selectedResource.available ? '可用' : '不可用'} /> : undefined
  const toolbarTrailing = activeId === 'workbench'
    ? <>{runtimeStatus.state !== 'connected' && <button type="button" className={`runtime-status runtime-status--${runtimeStatus.state}`} onClick={reconnect} disabled={runtimeStatus.state === 'connecting'}><span className="status-dot" />{runtimeLabel}</button>}<IconButton label={matterSidebarCollapsed ? '展开事项边栏' : '折叠事项边栏'} icon={matterSidebarCollapsed ? NavArrowLeft : NavArrowRight} className={`matter-toolbar-toggle${matterSidebarCollapsed ? '' : ' is-active'}`} onClick={() => setMatterSidebarCollapsed((value) => !value)} /></>
    : activeId === 'resources'
      ? <span className="quiet-meta">只读 {resourceKind === 'skills' ? 'Skill' : 'Tool'} 目录</span>
      : undefined

  return <ClientIconSystem><AppShell
    contextCollapsed={contextCollapsed}
    toolbar={<Toolbar title={activeId === 'workbench' ? selectedConversation?.title ?? '消息' : activeId === 'team' ? teamView === 'recruitment' ? '招募员工' : teamDirectoryKind === 'groups' ? selectedExpertGroup?.name ?? '专家团' : selectedEmployee?.name ?? 'Agent 员工' : activeId === 'resources' ? selectedResource?.name ?? '能力目录' : activeId === 'connections' ? '连接' : systemSections.find((item) => item.id === systemSection)?.label ?? '系统'} icon={activeModule.icon} navigation={<IconButton label={contextCollapsed ? '展开左侧栏' : '折叠左侧栏'} icon={contextCollapsed ? NavArrowRight : NavArrowLeft} onClick={() => setContextCollapsed((value) => !value)} />} support={toolbarSupport} trailing={toolbarTrailing} />}
    rail={<Rail active={activeId} items={mainRailModules.map((item) => item.id === 'workbench' && totalUnread > 0 ? { ...item, marker: String(totalUnread) } : item)} footerItems={footerRailModules} userProfile={profile} onProfile={() => { setConnectionModalOpen(false); setSystemSection('profile'); setActiveId('settings') }} onNavigate={(id) => { if (id !== 'connections') setConnectionModalOpen(false); setActiveId(id) }} />}
    context={context}
  >{activeId === 'workbench' ? selectedConversationId ? <Workbench runtimeStatus={runtimeStatus} providerStatus={providerStatus} conversationId={selectedConversationId} user={userIdentity(profile.name, profile.avatarUrl)} supervisor={supervisorIdentity(supervisor)} matterSidebarCollapsed={matterSidebarCollapsed} initialDraft={conversationDraftSeed?.conversationId === selectedConversationId ? conversationDraftSeed.text : undefined} onInitialDraftConsumed={() => setConversationDraftSeed(undefined)} onDataChanged={() => { void refreshConversationData() }} /> : <div className="runtime-empty-state"><h2>正在读取会话</h2></div> : activeId === 'team' ? teamView === 'recruitment' ? <RecruitmentCatalog employees={employees} expertGroups={expertGroups} skills={resourceCatalog.skills} initialKind={recruitmentKind} onEnterConversation={enterRecruitmentConversation} /> : teamDirectoryKind === 'groups' ? <ExpertGroupModule group={selectedExpertGroup} onGroupsChanged={(items) => { setExpertGroups(items); setSelectedExpertGroupId(items[0]?.id) }} /> : <TeamModule selectedEmployeeId={selectedEmployeeId} skills={resourceCatalog.skills} providerStatus={providerStatus} createRequest={employeeCreateRequest} editRequest={employeeEditRequest} onEmployeesChanged={(items) => { setEmployees(items); setSelectedEmployeeId((current) => current && items.some((employee) => employee.id === current) ? current : items[0]?.id) }} onSelectEmployee={setSelectedEmployeeId} onEditEmployee={() => setEmployeeEditRequest((value) => value + 1)} /> : activeId === 'resources' ? <ResourceModule catalog={resourceCatalog} kind={resourceKind} selectedId={selectedResourceId} loading={resourceCatalogLoading} probing={probingResources} error={resourceError} onProbe={() => void probeResources()} onOpenEmployee={(employeeId) => { setSelectedEmployeeId(employeeId); setTeamDirectoryKind('experts'); setTeamView('directory'); setActiveId('team') }} /> : activeId === 'connections' ? <ConnectionsCatalog feishuStatus={feishuStatus} loading={connectionStatusLoading} modalOpen={connectionModalOpen} onModalOpenChange={setConnectionModalOpen} onStatusChange={handleFeishuStatusChange} /> : <SystemModule section={systemSection} providerStatus={providerStatus} runtimeStatus={runtimeStatus} resourceCatalog={resourceCatalog} supervisor={supervisor} onReconnect={reconnect} onProbeResources={probeResources} onProfileChange={setProfile} onSupervisorChange={setSupervisor} onProviderStatusChange={setProviderStatus} />}</AppShell><ClientModal open={agentEntryOpen} title="招募" size="small" onClose={() => setAgentEntryOpen(false)}><div className="agent-entry-choice"><p>选择专家加入方式</p><div className="agent-entry-choice__options"><button type="button" onClick={() => { setAgentEntryOpen(false); setRecruitmentKind('experts'); setTeamView('recruitment') }}><span className="agent-entry-choice__icon"><Community aria-hidden /></span><span><strong>招募专家</strong><small>浏览专家与专家团候选目录</small></span><NavArrowRight aria-hidden /></button><button type="button" onClick={() => { setAgentEntryOpen(false); setTeamDirectoryKind('experts'); setTeamView('directory'); setEmployeeCreateRequest((value) => value + 1) }}><span className="agent-entry-choice__icon"><UserPlus aria-hidden /></span><span><strong>创建专家</strong><small>自定义身份、提示词、模型与能力</small></span><NavArrowRight aria-hidden /></button></div></div></ClientModal><ClientModal open={resourceInfoOpen} title="能力目录信息" eyebrow={<span className="quiet-meta">只读目录</span>} size="medium" onClose={() => setResourceInfoOpen(false)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>Runtime 能力目录</h3><p>客户端只展示 Runtime 已注册的不可变 Skill 与 Tool 版本，不在本地复制或改写能力事实。</p></div><section><div className="content-section-title"><h3>当前目录</h3><span>{resourceCatalog.skills.length + resourceCatalog.tools.length} 项</span></div><div className="detail-data-list"><div className="detail-data-row"><span><strong>Skills</strong><small>结构化步骤与 Tool 依赖</small></span><em>{resourceCatalog.skills.length}</em></div><div className="detail-data-row"><span><strong>Tools</strong><small>副作用、权限与健康状态</small></span><em>{resourceCatalog.tools.length}</em></div><div className="detail-data-row"><span><strong>健康检查</strong><small>由 Runtime 数据源探测提供</small></span><em>{resourceCatalog.healthChecks.length}</em></div></div></section><div className="resource-boundary">运行中的事项始终使用已冻结的能力版本；目录更新不会静默覆盖历史执行事实。</div></div></ClientModal></ClientIconSystem>
}
