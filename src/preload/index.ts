import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { ATTACHMENT_IPC, CONVERSATION_IPC, EMPLOYEE_IPC, MEMORY_IPC, PROVIDER_IPC, RESOURCE_IPC, RUNTIME_IPC, SUPERVISOR_IPC, TASK_IPC, USAGE_IPC, type AttachmentBridge, type ConversationBridge, type ConversationStreamEvent, type EmployeeBridge, type EmployeeDraftInput, type EmployeeEvent, type MemoryBridge, type ProviderBridge, type ResourceBridge, type RuntimeBridge, type RuntimeStatus, type SupervisorBridge, type SupervisorConfigInput, type TaskBridge, type TaskDraftInputView, type TaskEvent, type UsageBridge } from '../shared/runtime-contract'
import type { MemoryCategoryView, MemoryScopeTypeView, MemoryStatusView, MemoryViewModel } from '../shared/memory-contract'
import type { MemorySearchResultView } from '../shared/memory-contract'

const runtimeBridge: RuntimeBridge = Object.freeze({
  getStatus: () => ipcRenderer.invoke(RUNTIME_IPC.getStatus),
  reconnect: () => ipcRenderer.invoke(RUNTIME_IPC.reconnect),
  onStatusChanged: (listener: (status: RuntimeStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: RuntimeStatus): void => listener(status)
    ipcRenderer.on(RUNTIME_IPC.statusChanged, handler)
    return () => ipcRenderer.removeListener(RUNTIME_IPC.statusChanged, handler)
  }
})

const providerBridge: ProviderBridge = Object.freeze({
  getStatus: () => ipcRenderer.invoke(PROVIDER_IPC.getStatus),
  configurePoe: (credential: string) => ipcRenderer.invoke(PROVIDER_IPC.configurePoe, { credential }),
  verifyPoeModel: (modelId: 'claude-sonnet-4.6' | 'gpt-image-2' | 'seedance-2.0') => ipcRenderer.invoke(PROVIDER_IPC.verifyPoeModel, { modelId })
})

const conversationBridge: ConversationBridge = Object.freeze({
  list: () => ipcRenderer.invoke(CONVERSATION_IPC.list),
  create: () => ipcRenderer.invoke(CONVERSATION_IPC.create),
  archive: (conversationId: string) => ipcRenderer.invoke(CONVERSATION_IPC.archive, { conversationId }),
  send: (conversationId: string, text: string, directories: string[] = [], attachmentIds: string[] = []) => ipcRenderer.invoke(CONVERSATION_IPC.send, { conversationId, text, directories, attachmentIds }),
  cancel: (requestId: string) => ipcRenderer.invoke(CONVERSATION_IPC.cancel, { requestId }),
  history: (conversationId: string) => ipcRenderer.invoke(CONVERSATION_IPC.history, { conversationId }),
  onEvent: (listener: (event: ConversationStreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: ConversationStreamEvent): void => listener(value)
    ipcRenderer.on(CONVERSATION_IPC.event, handler)
    return () => ipcRenderer.removeListener(CONVERSATION_IPC.event, handler)
  }
})

const attachmentBridge: AttachmentBridge = Object.freeze({
  select: () => ipcRenderer.invoke(ATTACHMENT_IPC.select),
  importDropped: (files: File[]) => ipcRenderer.invoke(ATTACHMENT_IPC.importDropped, { paths: files.map((file) => webUtils.getPathForFile(file)) }),
  open: (attachmentId: string) => ipcRenderer.invoke(ATTACHMENT_IPC.open, { attachmentId }),
  reveal: (attachmentId: string) => ipcRenderer.invoke(ATTACHMENT_IPC.reveal, { attachmentId })
})

const supervisorBridge: SupervisorBridge = Object.freeze({
  get: () => ipcRenderer.invoke(SUPERVISOR_IPC.get),
  update: (input: SupervisorConfigInput) => ipcRenderer.invoke(SUPERVISOR_IPC.update, { input })
})

const employeeBridge: EmployeeBridge = Object.freeze({
  list: () => ipcRenderer.invoke(EMPLOYEE_IPC.list),
  capabilities: () => ipcRenderer.invoke(EMPLOYEE_IPC.capabilities),
  detail: (employeeId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.detail, { employeeId }),
  create: (input: EmployeeDraftInput) => ipcRenderer.invoke(EMPLOYEE_IPC.create, { input }),
  beginEdit: (employeeId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.beginEdit, { employeeId }),
  saveDraft: (employeeId: string, input: EmployeeDraftInput) => ipcRenderer.invoke(EMPLOYEE_IPC.saveDraft, { employeeId, input }),
  addTestCase: (employeeId: string, input: { name: string; prompt: string; acceptanceCriteria: string; expectedContains?: string }) => ipcRenderer.invoke(EMPLOYEE_IPC.addTestCase, { employeeId, input }),
  runTest: (employeeId: string, testCaseId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.runTest, { employeeId, testCaseId }),
  confirmTest: (employeeId: string, testRunId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.confirmTest, { employeeId, testRunId }),
  publish: (employeeId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.publish, { employeeId }),
  rollback: (employeeId: string, versionId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.rollback, { employeeId, versionId }),
  setDisabled: (employeeId: string, disabled: boolean) => ipcRenderer.invoke(EMPLOYEE_IPC.setDisabled, { employeeId, disabled }),
  archive: (employeeId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.archive, { employeeId }),
  restore: (employeeId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.restore, { employeeId }),
  deleteDraft: (employeeId: string) => ipcRenderer.invoke(EMPLOYEE_IPC.deleteDraft, { employeeId }),
  onEvent: (listener: (event: EmployeeEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: EmployeeEvent): void => listener(value)
    ipcRenderer.on(EMPLOYEE_IPC.event, handler)
    return () => ipcRenderer.removeListener(EMPLOYEE_IPC.event, handler)
  }
})

const taskBridge: TaskBridge = Object.freeze({
  list: () => ipcRenderer.invoke(TASK_IPC.list),
  outputDirectory: () => ipcRenderer.invoke(TASK_IPC.outputDirectory),
  openArtifact: (taskId: string, artifactId: string) => ipcRenderer.invoke(TASK_IPC.openArtifact, { taskId, artifactId }),
  revealArtifact: (taskId: string, artifactId: string) => ipcRenderer.invoke(TASK_IPC.revealArtifact, { taskId, artifactId }),
  createDraft: (input: TaskDraftInputView) => ipcRenderer.invoke(TASK_IPC.createDraft, { input }),
  updateDraft: (draftId: string, changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'>) => ipcRenderer.invoke(TASK_IPC.updateDraft, { draftId, changes }),
  start: (draftId: string) => ipcRenderer.invoke(TASK_IPC.start, { draftId }),
  requestChange: (taskId: string, sourceMessageId: string, requestedDiff: Record<string, unknown>) => ipcRenderer.invoke(TASK_IPC.requestChange, { taskId, sourceMessageId, requestedDiff }),
  acceptChange: (changeRequestId: string, changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'>) => ipcRenderer.invoke(TASK_IPC.acceptChange, { changeRequestId, changes }),
  rejectChange: (changeRequestId: string) => ipcRenderer.invoke(TASK_IPC.rejectChange, { changeRequestId }),
  approveTool: (actionId: string) => ipcRenderer.invoke(TASK_IPC.approveTool, { actionId }),
  rejectTool: (actionId: string) => ipcRenderer.invoke(TASK_IPC.rejectTool, { actionId }),
  resolveTool: (actionId: string, outcome: 'succeeded' | 'failed', evidence: Record<string, unknown>) => ipcRenderer.invoke(TASK_IPC.resolveTool, { actionId, outcome, evidence }),
  onEvent: (listener: (event: TaskEvent) => void) => { const handler = (_event: Electron.IpcRendererEvent, value: TaskEvent): void => listener(value); ipcRenderer.on(TASK_IPC.event, handler); return () => ipcRenderer.removeListener(TASK_IPC.event, handler) }
})

const resourceBridge: ResourceBridge = Object.freeze({ list: () => ipcRenderer.invoke(RESOURCE_IPC.list), probe: () => ipcRenderer.invoke(RESOURCE_IPC.probe) })

const memoryBridge: MemoryBridge = Object.freeze({
  status: () => ipcRenderer.invoke(MEMORY_IPC.status), downloadModel: () => ipcRenderer.invoke(MEMORY_IPC.downloadModel),
  list: (filters?: { scopeType?: MemoryScopeTypeView; scopeId?: string; category?: MemoryCategoryView; status?: MemoryStatusView }) => ipcRenderer.invoke(MEMORY_IPC.list, filters ?? {}),
  search: (input: { query: string; allowedScopes: Array<{ type: MemoryScopeTypeView; id: string }>; categories?: MemoryCategoryView[]; tags?: string[]; limit?: number; tokenBudget?: number }): Promise<MemorySearchResultView[]> => ipcRenderer.invoke(MEMORY_IPC.search, input), update: (id: string, changes: Partial<Pick<MemoryViewModel, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags'>>) => ipcRenderer.invoke(MEMORY_IPC.update, { id, changes }),
  disable: (id: string) => ipcRenderer.invoke(MEMORY_IPC.disable, { id }), restore: (id: string) => ipcRenderer.invoke(MEMORY_IPC.restore, { id }), resolveConflict: (chosenId: string) => ipcRenderer.invoke(MEMORY_IPC.resolveConflict, { chosenId }),
  permanentlyDelete: (id: string) => ipcRenderer.invoke(MEMORY_IPC.permanentlyDelete, { id }), queue: () => ipcRenderer.invoke(MEMORY_IPC.queue),
  acceptQueueItem: (id: string) => ipcRenderer.invoke(MEMORY_IPC.acceptQueueItem, { id }), dismissQueueItem: (id: string) => ipcRenderer.invoke(MEMORY_IPC.dismissQueueItem, { id }),
  migrateEmbeddings: () => ipcRenderer.invoke(MEMORY_IPC.migrateEmbeddings)
})

const usageBridge: UsageBridge = Object.freeze({ summary: () => ipcRenderer.invoke(USAGE_IPC.summary) })

contextBridge.exposeInMainWorld('aiEmployeeOS', Object.freeze({ runtime: runtimeBridge, provider: providerBridge, conversation: conversationBridge, attachment: attachmentBridge, supervisor: supervisorBridge, employee: employeeBridge, task: taskBridge, resource: resourceBridge, memory: memoryBridge, usage: usageBridge }))
