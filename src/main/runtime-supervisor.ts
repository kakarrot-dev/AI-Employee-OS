import { randomUUID } from 'node:crypto'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { RuntimeHealth } from '../runtime/kernel'
import type { Conversation, Message } from '../runtime/domain'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary } from '../shared/employee-contract'
import type { FormalTaskDetail, TaskDraftInput } from '../runtime/task-service'
import type { ResourceCatalog } from '../runtime/resource-service'
import type { MemoryCategory, MemoryHealth, MemoryQueueItem, MemoryScopeType, MemorySearchResult, MemoryStatus, MemoryView } from '../runtime/memory-service'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import type { SupervisorConfigInput, SupervisorConfigView } from '../shared/supervisor-contract'
import { SIDECAR_PROTOCOL_VERSION, type RuntimeCommand, type RuntimeOutboundEvent, type RuntimeReadyEvent, type RuntimeResponse } from '../shared/runtime-sidecar-protocol'

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export type RuntimeSupervisorEvent =
  | { type: 'starting' }
  | { type: 'ready'; health: RuntimeHealth }
  | { type: 'stopped'; reason: string }

export class RuntimeSupervisor {
  private child: UtilityProcess | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private readyPromise: Promise<RuntimeHealth> | null = null
  private resolveReady: ((health: RuntimeHealth) => void) | null = null
  private rejectReady: ((error: Error) => void) | null = null

  constructor(
    private readonly runtimeEntry: string,
    private readonly databasePath: string,
    private readonly deepAgentWorker: { pythonPath: string; scriptPath: string; checkpointDirectory: string },
    private readonly memoryWorker: { pythonPath: string; scriptPath: string; databasePath: string; modelCachePath: string; keychainHelperPath: string },
    private readonly exportDirectory: string,
    private readonly onEvent: (event: RuntimeSupervisorEvent) => void,
    private readonly onProviderExecute?: (request: ProviderRequest, onEvent: (event: ProviderEvent) => Promise<void>) => Promise<void>,
    private readonly onProviderCancel?: (providerRequestId: string) => Promise<{ cancelled: boolean }>,
    private readonly onConversationEvent?: (requestId: string, event: ProviderEvent | { type: 'failed'; requestId: string; code: string }) => void,
    private readonly onEmployeeEvent?: (event: { type: 'test_progress' | 'test_completed' | 'test_failed'; employeeId: string; testRunId: string; code?: string }) => void,
    private readonly onTaskEvent?: (event: { type: 'progress' | 'assignment_completed' | 'delivery_completed' | 'needs_attention' | 'failed'; taskId: string; runId?: string }) => void
  ) {}

  start(): Promise<RuntimeHealth> {
    if (this.readyPromise) return this.readyPromise
    this.onEvent({ type: 'starting' })
    this.readyPromise = new Promise<RuntimeHealth>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })

    const child = utilityProcess.fork(this.runtimeEntry, [`--database=${this.databasePath}`, `--worker-python=${this.deepAgentWorker.pythonPath}`, `--worker-script=${this.deepAgentWorker.scriptPath}`, `--checkpoint-directory=${this.deepAgentWorker.checkpointDirectory}`, `--memory-python=${this.memoryWorker.pythonPath}`, `--memory-script=${this.memoryWorker.scriptPath}`, `--memory-database=${this.memoryWorker.databasePath}`, `--memory-model-cache=${this.memoryWorker.modelCachePath}`, `--memory-keychain-helper=${this.memoryWorker.keychainHelperPath}`, `--export-directory=${this.exportDirectory}`], {
      serviceName: 'com.kakarrot.ai-employee-os.runtime',
      stdio: 'pipe'
    })
    this.child = child
    child.on('message', (message) => this.handleMessage(message))
    child.on('exit', (code) => this.handleExit(child, code))
    child.stderr?.on('data', () => undefined)
    return this.readyPromise
  }

  async restart(): Promise<RuntimeHealth> {
    this.stop('restart')
    return this.start()
  }

  health(): Promise<RuntimeHealth> {
    return this.request<RuntimeHealth>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'health', payload: {} })
  }

  sendConversation(conversationId: string, messageId: string, text: string, directories: string[] = []): Promise<{ accepted: true; requestId: string }> {
    const requestId = randomUUID()
    return this.request<{ accepted: true }>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, type: 'conversation.send', payload: { conversationId, messageId, text, directories } }, 5000).then((result) => ({ ...result, requestId }))
  }

  conversationHistory(conversationId: string): Promise<Message[]> {
    return this.request<Message[]>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'conversation.history', payload: { conversationId } })
  }

  conversationList(): Promise<Conversation[]> {
    return this.request<Conversation[]>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'conversation.list', payload: {} })
  }

  conversationCreate(conversationId: string): Promise<Conversation> {
    return this.request<Conversation>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'conversation.create', payload: { conversationId } })
  }

  conversationArchive(conversationId: string): Promise<{ archived: true; conversationId: string }> {
    return this.request<{ archived: true; conversationId: string }>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'conversation.archive', payload: { conversationId } })
  }

  cancelConversation(providerRequestId: string): Promise<{ accepted: true }> {
    return this.request<{ accepted: true }>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'conversation.cancel', payload: { providerRequestId } })
  }

  supervisorGet(): Promise<SupervisorConfigView> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'supervisor.get', payload: {} }) }
  supervisorUpdate(input: SupervisorConfigInput): Promise<SupervisorConfigView> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'supervisor.update', payload: { input } }) }

  employeeList(): Promise<EmployeeSummary[]> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.list', payload: {} }) }
  employeeCapabilities(): Promise<AgentCapabilityVersionView[]> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.capabilities', payload: {} }) }
  employeeDetail(employeeId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.detail', payload: { employeeId } }) }
  employeeCreate(input: EmployeeDraftInput): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.create', payload: { input } }) }
  employeeBeginEdit(employeeId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.begin_edit', payload: { employeeId } }) }
  employeeSaveDraft(employeeId: string, input: EmployeeDraftInput): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.save_draft', payload: { employeeId, input } }) }
  employeeAddTestCase(employeeId: string, input: { name: string; prompt: string; acceptanceCriteria: string; expectedContains?: string }): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.test_case.add', payload: { employeeId, input } }) }
  employeeRunTest(employeeId: string, testCaseId: string): Promise<{ accepted: true; requestId: string; testRunId: string }> { const requestId = randomUUID(); return this.request({ schemaVersion: 1, requestId, type: 'employee.test.run', payload: { employeeId, testCaseId } }, 5000) as Promise<{ accepted: true; requestId: string; testRunId: string }> }
  employeeConfirmTest(employeeId: string, testRunId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.test.confirm', payload: { employeeId, testRunId } }) }
  employeePublish(employeeId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.publish', payload: { employeeId } }) }
  employeeRollback(employeeId: string, versionId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.rollback', payload: { employeeId, versionId } }) }
  employeeSetDisabled(employeeId: string, disabled: boolean): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.disable', payload: { employeeId, disabled } }) }
  employeeArchive(employeeId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.archive', payload: { employeeId } }) }
  employeeRestore(employeeId: string): Promise<EmployeeDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.restore', payload: { employeeId } }) }
  employeeDeleteDraft(employeeId: string): Promise<{ accepted: true }> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'employee.delete', payload: { employeeId } }) }
  taskList(): Promise<FormalTaskDetail[]> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.list', payload: {} }) }
  taskCreateDraft(input: TaskDraftInput): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.create_draft', payload: { input } }) }
  taskUpdateDraft(draftId: string, changes: Pick<TaskDraftInput, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'>): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.update_draft', payload: { draftId, changes } }) }
  taskStart(draftId: string): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.start', payload: { draftId } }, 5000) }
  taskRequestChange(taskId: string, sourceMessageId: string, requestedDiff: Record<string, unknown>): Promise<{ accepted: true; changeRequestId: string }> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.request_change', payload: { taskId, sourceMessageId, requestedDiff } }) as Promise<{ accepted: true; changeRequestId: string }> }
  taskAcceptChange(changeRequestId: string, changes: Pick<TaskDraftInput, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'>): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.accept_change', payload: { changeRequestId, changes } }, 5000) }
  taskRejectChange(changeRequestId: string): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'task.reject_change', payload: { changeRequestId } }, 5000) }
  resourceList(): Promise<ResourceCatalog> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'resource.list', payload: {} }) }
  resourceProbe(): Promise<ResourceCatalog> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'resource.probe', payload: {} }, 35_000) }
  toolApprove(actionId: string): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'tool.approve', payload: { actionId } }, 135_000) }
  toolReject(actionId: string): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'tool.reject', payload: { actionId } }, 5000) }
  toolResolve(actionId: string, outcome: 'succeeded' | 'failed', evidence: Record<string, unknown>): Promise<FormalTaskDetail> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'tool.resolve_unknown', payload: { actionId, outcome, evidence } }, 5000) }
  memoryStatus(): Promise<MemoryHealth> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.status', payload: {} }, 15_000) }
  memoryDownloadModel(): Promise<MemoryHealth> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.model.download', payload: {} }, 190_000) }
  memoryList(filters: { scopeType?: MemoryScopeType; scopeId?: string; category?: string; status?: string }): Promise<MemoryView[]> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.list', payload: filters }) }
  memorySearch(input: { query: string; allowedScopes: Array<{ type: MemoryScopeType; id: string }>; categories?: string[]; tags?: string[]; limit?: number; tokenBudget?: number }): Promise<MemorySearchResult[]> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.search', payload: input }, 35_000) }
  memoryUpdate(id: string, changes: Partial<Pick<MemoryView, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags'>>): Promise<MemoryView> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.update', payload: { id, changes } }, 35_000) }
  memoryDisable(id: string): Promise<MemoryView> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.disable', payload: { id } }, 15_000) }
  memoryRestore(id: string): Promise<MemoryView> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.restore', payload: { id } }, 15_000) }
  memoryResolveConflict(chosenId: string): Promise<MemoryView> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.resolve_conflict', payload: { chosenId } }, 15_000) }
  memoryDelete(id: string): Promise<{ deleted: true; memoryId: string; externalBackupsExcluded: true }> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.delete', payload: { id } }, 35_000) }
  memoryQueue(): Promise<MemoryQueueItem[]> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.queue.list', payload: {} }, 15_000) }
  memoryMigrateEmbeddings(): Promise<{ migrated: number }> { return this.request({ schemaVersion: 1, requestId: randomUUID(), type: 'memory.embeddings.migrate', payload: {} }, 130_000) }

  async prepareForQuit(timeoutMs = 60_000): Promise<{ ready: boolean; activeRunIds: string[] }> {
    const deadline = Date.now() + timeoutMs
    let status = await this.request<{ ready: boolean; activeRunIds: string[] }>({ schemaVersion: 1, requestId: randomUUID(), type: 'shutdown.prepare', payload: {} }, 5000)
    while (!status.ready && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      status = await this.request<{ ready: boolean; activeRunIds: string[] }>({ schemaVersion: 1, requestId: randomUUID(), type: 'shutdown.prepare', payload: {} }, 5000)
    }
    return status
  }

  stop(reason = 'application_quit'): void {
    const child = this.child
    this.child = null
    this.readyPromise = null
    this.resolveReady = null
    this.rejectReady = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('runtime_stopped'))
    }
    this.pending.clear()
    child?.kill()
    if (child) this.onEvent({ type: 'stopped', reason })
  }

  private request<TResult>(command: RuntimeCommand, timeoutMs = 3000): Promise<TResult> {
    const child = this.child
    if (!child) return Promise.reject(new Error('runtime_not_started'))
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId)
        reject(new Error('runtime_request_timeout'))
      }, timeoutMs)
      this.pending.set(command.requestId, { resolve: resolve as (result: unknown) => void, reject, timer })
      child.postMessage(command)
    })
  }

  private handleMessage(message: unknown): void {
    if (this.isReadyEvent(message)) {
      this.resolveReady?.(message.health)
      this.resolveReady = null
      this.rejectReady = null
      this.onEvent({ type: 'ready', health: message.health })
      return
    }
    const outbound = message as Partial<RuntimeOutboundEvent>
    if (outbound.schemaVersion === SIDECAR_PROTOCOL_VERSION && outbound.type === 'runtime.provider.execute' && outbound.request && typeof outbound.requestId === 'string') {
      if (!this.onProviderExecute) {
        void this.sendProviderFailure(outbound.requestId, 'provider_unavailable')
        return
      }
      void this.onProviderExecute(outbound.request, (event) => this.sendProviderEvent(outbound.requestId!, event))
        .catch((error) => this.sendProviderFailure(outbound.requestId!, error instanceof Error ? error.message : 'provider_error'))
      return
    }
    if (outbound.schemaVersion === SIDECAR_PROTOCOL_VERSION && outbound.type === 'runtime.provider.cancel' && typeof outbound.providerRequestId === 'string') {
      if (!this.onProviderCancel) {
        void this.sendProviderFailure(outbound.providerRequestId, 'provider_unavailable')
        return
      }
      void this.onProviderCancel(outbound.providerRequestId).catch((error) => this.sendProviderFailure(outbound.providerRequestId!, error instanceof Error ? error.message : 'provider_error'))
      return
    }
    if (outbound.schemaVersion === SIDECAR_PROTOCOL_VERSION && outbound.type === 'runtime.conversation.event' && typeof outbound.requestId === 'string' && outbound.event) {
      this.onConversationEvent?.(outbound.requestId, outbound.event)
      return
    }
    if (outbound.schemaVersion === SIDECAR_PROTOCOL_VERSION && outbound.type === 'runtime.employee.event' && outbound.event) {
      this.onEmployeeEvent?.(outbound.event)
      return
    }
    if (outbound.schemaVersion === SIDECAR_PROTOCOL_VERSION && outbound.type === 'runtime.task.event' && outbound.event) {
      this.onTaskEvent?.(outbound.event)
      return
    }
    const response = message as Partial<RuntimeResponse>
    if (response.schemaVersion !== SIDECAR_PROTOCOL_VERSION || typeof response.requestId !== 'string') return
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(response.requestId)
    const fullResponse = response as RuntimeResponse
    if (fullResponse.ok) pending.resolve(fullResponse.result)
    else pending.reject(new Error(fullResponse.error.code))
  }

  private handleExit(child: UtilityProcess, code: number | null): void {
    if (this.child !== child) return
    this.child = null
    const error = new Error(`runtime_exit:${code ?? 'signal'}`)
    this.rejectReady?.(error)
    this.readyPromise = null
    this.resolveReady = null
    this.rejectReady = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.onEvent({ type: 'stopped', reason: error.message })
  }

  private isReadyEvent(message: unknown): message is RuntimeReadyEvent {
    if (!message || typeof message !== 'object') return false
    const event = message as Partial<RuntimeReadyEvent>
    return event.schemaVersion === SIDECAR_PROTOCOL_VERSION && event.type === 'runtime.ready' && Boolean(event.health)
  }

  private async sendProviderEvent(providerRequestId: string, event: ProviderEvent): Promise<void> {
    await this.request<{ accepted: true }>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'provider.event', payload: { providerRequestId, event } }, 135_000)
  }

  private async sendProviderFailure(providerRequestId: string, code: string): Promise<void> {
    await this.request<{ accepted: true }>({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId: randomUUID(), type: 'provider.failed', payload: { providerRequestId, code: code.split(':')[0] } }, 5000)
  }
}
