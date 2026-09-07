import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary } from './employee-contract'
import type { TaskDetailView, TaskDraftInputView, TaskEvent } from './task-contract'
import type { ResourceCatalogView } from './resource-contract'
import type { MemoryCategoryView, MemoryHealthView, MemoryQueueItemView, MemoryScopeTypeView, MemorySearchResultView, MemoryStatusView, MemoryViewModel } from './memory-contract'
import type { SupervisorConfigInput, SupervisorConfigView } from './supervisor-contract'
import type { UsageSummaryView } from './usage-contract'
import type { ExpertGroupView } from './expert-group-contract'

// Presentation contracts retained for the client mock adapter; no IPC transport.
export type RuntimeConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface RuntimeStatus {
  state: RuntimeConnectionState
  checkedAt: string
  message: string
}

export interface DomainEvent<TPayload = unknown> {
  schemaVersion: 1
  eventId: string
  occurredAt: string
  type: string
  payload: TPayload
}

export interface RuntimeBridge {
  getStatus(): Promise<RuntimeStatus>
  reconnect(): Promise<RuntimeStatus>
  onStatusChanged(listener: (status: RuntimeStatus) => void): () => void
}

export interface ExpertGroupBridge {
  list(): Promise<ExpertGroupView[]>
  archive(groupId: string): Promise<ExpertGroupView>
}

export interface ProviderModelStatus {
  provider: 'deepseek' | 'poe'
  modelId: string
  modality: 'text' | 'image' | 'video'
  verification: 'verified' | 'unverified'
}

export interface ProviderStatus {
  state: 'starting' | 'ready' | 'degraded' | 'stopped'
  credentialStatus: { deepseek: 'configured' | 'missing'; poe: 'configured' | 'missing' }
  models: ProviderModelStatus[]
  checkedAt: string
}

export interface ProviderBridge {
  getStatus(): Promise<ProviderStatus>
  configurePoe(credential: string): Promise<ProviderStatus>
  verifyPoeModel(modelId: 'claude-sonnet-4.6' | 'gpt-image-2' | 'seedance-2.0'): Promise<ProviderStatus>
}

export interface ResourceBridge {
  list(): Promise<ResourceCatalogView>
  probe(): Promise<ResourceCatalogView>
}

export interface MemoryBridge {
  status(): Promise<MemoryHealthView>
  downloadModel(): Promise<MemoryHealthView>
  list(filters?: { scopeType?: MemoryScopeTypeView; scopeId?: string; category?: MemoryCategoryView; status?: MemoryStatusView }): Promise<MemoryViewModel[]>
  search(input: { query: string; allowedScopes: Array<{ type: MemoryScopeTypeView; id: string }>; categories?: MemoryCategoryView[]; tags?: string[]; limit?: number; tokenBudget?: number }): Promise<MemorySearchResultView[]>
  update(id: string, changes: Partial<Pick<MemoryViewModel, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags'>>): Promise<MemoryViewModel>
  disable(id: string): Promise<MemoryViewModel>
  restore(id: string): Promise<MemoryViewModel>
  resolveConflict(chosenId: string): Promise<MemoryViewModel>
  permanentlyDelete(id: string): Promise<{ deleted: true; memoryId: string; externalBackupsExcluded: true }>
  queue(): Promise<MemoryQueueItemView[]>
  acceptQueueItem(id: string): Promise<MemoryViewModel>
  dismissQueueItem(id: string): Promise<{ dismissed: true; queueId: string }>
  migrateEmbeddings(): Promise<{ migrated: number }>
}

export interface UsageBridge {
  summary(): Promise<UsageSummaryView>
}

export interface ConversationMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AttachmentView[]
  createdAt: string
  modelId?: string
}

export interface AttachmentView {
  id: string
  name: string
  mediaType: string
  size: number
  sha256: string
}

export interface ConversationSummaryView {
  id: string
  title: string
  preview: string
  lastMessageRole?: 'user' | 'assistant'
  lastMessageContent?: string
  updatedAt: string
  messageCount: number
}

export type ConversationStreamEvent =
  | { type: 'output_delta'; requestId: string; delta: string }
  | { type: 'usage'; requestId: string; inputTokens: number; outputTokens: number; totalTokens: number; source: 'provider_actual' }
  | { type: 'completed'; requestId: string; providerRequestId?: string }
  | { type: 'failed'; requestId: string; code: string }

export interface ConversationBridge {
  list(): Promise<ConversationSummaryView[]>
  create(): Promise<ConversationSummaryView>
  archive(conversationId: string): Promise<{ archived: true; conversationId: string }>
  send(conversationId: string, text: string, directories?: string[], attachmentIds?: string[]): Promise<{ accepted: true; requestId: string; messageId: string }>
  cancel(requestId: string): Promise<{ accepted: true }>
  history(conversationId: string): Promise<ConversationMessageView[]>
  onEvent(listener: (event: ConversationStreamEvent) => void): () => void
}

export interface AttachmentBridge {
  select(): Promise<AttachmentView[]>
  importDropped(files: File[]): Promise<AttachmentView[]>
  open(attachmentId: string): Promise<{ opened: true }>
  reveal(attachmentId: string): Promise<{ revealed: true }>
}

export interface SupervisorBridge {
  get(): Promise<SupervisorConfigView>
  update(input: SupervisorConfigInput): Promise<SupervisorConfigView>
}

export interface EmployeeEvent {
  type: 'test_progress' | 'test_completed' | 'test_failed'
  employeeId: string
  testRunId: string
  code?: string
}

export interface EmployeeBridge {
  list(): Promise<EmployeeSummary[]>
  capabilities(): Promise<AgentCapabilityVersionView[]>
  detail(employeeId: string): Promise<EmployeeDetail>
  create(input: EmployeeDraftInput): Promise<EmployeeDetail>
  beginEdit(employeeId: string): Promise<EmployeeDetail>
  saveDraft(employeeId: string, input: EmployeeDraftInput): Promise<EmployeeDetail>
  addTestCase(employeeId: string, input: { name: string; prompt: string; acceptanceCriteria: string; expectedContains?: string }): Promise<EmployeeDetail>
  runTest(employeeId: string, testCaseId: string): Promise<{ accepted: true; requestId: string; testRunId: string }>
  confirmTest(employeeId: string, testRunId: string): Promise<EmployeeDetail>
  publish(employeeId: string): Promise<EmployeeDetail>
  rollback(employeeId: string, versionId: string): Promise<EmployeeDetail>
  setDisabled(employeeId: string, disabled: boolean): Promise<EmployeeDetail>
  archive(employeeId: string): Promise<EmployeeDetail>
  restore(employeeId: string): Promise<EmployeeDetail>
  deleteDraft(employeeId: string): Promise<{ accepted: true }>
  onEvent(listener: (event: EmployeeEvent) => void): () => void
}

export interface TaskBridge {
  list(): Promise<TaskDetailView[]>
  outputDirectory(): Promise<string>
  openArtifact(taskId: string, artifactId: string): Promise<{ opened: true }>
  revealArtifact(taskId: string, artifactId: string): Promise<{ revealed: true }>
  createDraft(input: TaskDraftInputView): Promise<TaskDetailView>
  updateDraft(draftId: string, changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'>): Promise<TaskDetailView>
  start(draftId: string): Promise<TaskDetailView>
  retry(taskId: string): Promise<TaskDetailView>
  requestChange(taskId: string, sourceMessageId: string, requestedDiff: Record<string, unknown>): Promise<{ accepted: true; changeRequestId: string }>
  acceptChange(changeRequestId: string, changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'>): Promise<TaskDetailView>
  rejectChange(changeRequestId: string): Promise<TaskDetailView>
  approveTool(actionId: string): Promise<TaskDetailView>
  rejectTool(actionId: string): Promise<TaskDetailView>
  resolveTool(actionId: string, outcome: 'succeeded' | 'failed', evidence: Record<string, unknown>): Promise<TaskDetailView>
  onEvent(listener: (event: TaskEvent) => void): () => void
}

export type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary } from './employee-contract'
export type { SupervisorConfigInput, SupervisorConfigView } from './supervisor-contract'
export type { TaskDetailView, TaskDraftInputView, TaskEvent } from './task-contract'
export type { ChatContentDetailView, ChatContentMetricView, ChatContentView } from './chat-content-contract'
