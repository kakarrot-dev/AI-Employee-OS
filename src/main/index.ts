import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain, Menu, session } from 'electron'
import { CONVERSATION_IPC, EMPLOYEE_IPC, MEMORY_IPC, PROVIDER_IPC, RESOURCE_IPC, RUNTIME_IPC, TASK_IPC, type ConversationStreamEvent, type EmployeeDraftInput, type EmployeeEvent, type ProviderStatus, type RuntimeStatus, type TaskDetailView, type TaskDraftInputView, type TaskEvent } from '../shared/runtime-contract'
import type { MemoryCategoryView, MemoryScopeTypeView, MemoryStatusView, MemoryViewModel } from '../shared/memory-contract'
import type { FormalTaskDetail } from '../runtime/task-service'
import { ProviderSupervisor, type ProviderSupervisorEvent } from './provider-supervisor'
import { RuntimeSupervisor, type RuntimeSupervisorEvent } from './runtime-supervisor'
import { createWindowOptions, isTrustedRendererUrl } from './window-security'
import { bundledRuntimePaths, initializeBundledModel } from './bundled-runtime'
import { maintainDiagnostics, writeLocalDiagnostic } from './storage-policy'

app.enableSandbox()

process.on('uncaughtExceptionMonitor', (error) => {
  if (app.isReady()) writeLocalDiagnostic(app.getPath('userData'), 'main.uncaught_exception', error)
})

let mainWindow: BrowserWindow | null = null
let runtimeSupervisor: RuntimeSupervisor | null = null
let providerSupervisor: ProviderSupervisor | null = null
let runtimeStatus: RuntimeStatus = {
  state: 'connecting',
  checkedAt: new Date().toISOString(),
  message: '正在启动 Local Control Runtime'
}
let providerStatus: ProviderStatus = {
  state: 'starting',
  credentialStatus: { deepseek: 'missing', poe: 'missing' },
  models: [],
  checkedAt: new Date().toISOString()
}

function assertTrustedSender(url: string | undefined): void {
  if (!url) throw new Error('missing_sender_frame')
  if (!isTrustedRendererUrl(url, process.env.ELECTRON_RENDERER_URL)) {
    throw new Error('untrusted_renderer')
  }
}

function publishRuntimeStatus(status: RuntimeStatus): void {
  runtimeStatus = status
  mainWindow?.webContents.send(RUNTIME_IPC.statusChanged, status)
}

function handleRuntimeEvent(event: RuntimeSupervisorEvent): void {
  if (event.type === 'starting') {
    publishRuntimeStatus({ state: 'connecting', checkedAt: new Date().toISOString(), message: '正在启动 Local Control Runtime' })
  } else if (event.type === 'ready') {
    publishRuntimeStatus({
      state: 'connected',
      checkedAt: event.health.checkedAt,
      message: `Runtime 已连接 · Schema v${event.health.schemaVersion} · Cursor ${event.health.lastEventSequence}`
    })
  } else {
    publishRuntimeStatus({ state: 'disconnected', checkedAt: new Date().toISOString(), message: 'Runtime 已停止，可重新连接' })
  }
}

function handleProviderEvent(event: ProviderSupervisorEvent): void {
  if (event.type === 'ready') {
    providerStatus = {
      state: event.health.state,
      credentialStatus: event.health.credentialStatus,
      models: event.health.models.map(({ provider, modelId, modality, verification }) => ({ provider, modelId, modality, verification })),
      checkedAt: event.health.checkedAt
    }
  } else {
    providerStatus = { ...providerStatus, state: 'stopped', checkedAt: new Date().toISOString() }
  }
}

function toTaskView(detail: FormalTaskDetail): TaskDetailView {
  const needsToolAttention = detail.toolActions.some((action) => action.state === 'pending' || action.state === 'blocked' || action.state === 'result_unknown')
  const state: TaskDetailView['state'] = detail.run?.state === 'paused' || detail.run?.state === 'pausing' || needsToolAttention ? 'needs_attention' : detail.task?.state ?? 'draft'
  return {
    id: detail.task?.id ?? detail.draft.id,
    taskId: detail.task?.id,
    draftId: detail.draft.id,
    state,
    goal: detail.draft.goal,
    acceptanceCriteria: detail.draft.acceptanceCriteria,
    employeeVersionIds: detail.draft.employeeVersionIds,
    draftRevision: detail.draft.revision,
    frozenRevision: detail.revision?.revision,
    runId: detail.run?.id,
    assignments: detail.assignments.map(({ id, sequence, employeeVersionId, state, output }) => ({ id, sequence, employeeVersionId, state, output })),
    timeline: detail.checkpoints.map(({ phase, nextNode, createdAt, payload }) => ({ phase, nextNode, createdAt, ...(phase === 'memory_loaded' ? { memoryRefs: (payload.recallReasons as Array<{ id: string; reason: string }> | undefined) ?? [] } : {}) })),
    delivery: detail.delivery ? { id: detail.delivery.id, acceptanceResults: detail.delivery.acceptanceResults.map(({ criterion, passed }) => ({ criterion, passed })), artifacts: detail.artifacts.map(({ id, mediaType, relativePath, sha256 }) => ({ id, mediaType, relativePath, sha256 })), evidenceCount: detail.evidence.length, unresolvedIssues: detail.delivery.unresolvedIssues } : undefined,
    researchBundles: detail.researchBundles.map(({ id, contentHash, items, claims, conflicts, informationGaps }) => ({ id, contentHash, sourceCount: items.length, claimCount: claims.length, conflicts, informationGaps })),
    pendingChange: detail.changeRequests.find((change) => change.decision === 'pending') ? (() => { const change = detail.changeRequests.find((item) => item.decision === 'pending')!; return { id: change.id, sourceMessageId: change.sourceMessageId, requestedDiff: change.requestedDiff } })() : undefined,
    toolActions: detail.toolActions.map(({ id, toolVersionId, state: actionState, parameters, risk, approvalId, failureCode }) => ({ id, toolVersionId, state: actionState, parameters, risk, approvalId, failureCode })),
    approvals: detail.approvals.map(({ id, toolActionId, decision }) => ({ id, toolActionId, decision }))
  }
}

function registerRuntimeIpc(): void {
  const employeeIdFrom = (value: unknown): string => {
    const employeeId = (value as { employeeId?: unknown })?.employeeId
    if (typeof employeeId !== 'string' || employeeId.length < 1 || employeeId.length > 128) throw new Error('invalid_employee_id')
    return employeeId
  }
  ipcMain.handle(RUNTIME_IPC.getStatus, (event) => {
    assertTrustedSender(event.senderFrame?.url)
    return runtimeStatus
  })

  ipcMain.handle(RUNTIME_IPC.reconnect, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    try {
      await runtimeSupervisor.restart()
      return runtimeStatus
    } catch {
      publishRuntimeStatus({ state: 'disconnected', checkedAt: new Date().toISOString(), message: 'Runtime 启动失败' })
      return runtimeStatus
    }
  })

  ipcMain.handle(PROVIDER_IPC.getStatus, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (providerSupervisor && providerStatus.state !== 'stopped') {
      try {
        const health = await providerSupervisor.health()
        handleProviderEvent({ type: 'ready', health })
      } catch {
        providerStatus = { ...providerStatus, state: 'stopped', checkedAt: new Date().toISOString() }
      }
    }
    return providerStatus
  })

  ipcMain.handle(CONVERSATION_IPC.send, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!value || typeof value !== 'object') throw new Error('invalid_conversation_request')
    const { conversationId, text } = value as { conversationId?: unknown; text?: unknown }
    if (typeof conversationId !== 'string' || conversationId.length > 128 || typeof text !== 'string' || text.length < 1 || text.length > 100_000) throw new Error('invalid_conversation_request')
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    const messageId = randomUUID()
    const result = await runtimeSupervisor.sendConversation(conversationId, messageId, text)
    return { ...result, messageId }
  })

  ipcMain.handle(CONVERSATION_IPC.cancel, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const requestId = (value as { requestId?: unknown })?.requestId
    if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 128) throw new Error('invalid_conversation_request_id')
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    return runtimeSupervisor.cancelConversation(requestId)
  })

  ipcMain.handle(CONVERSATION_IPC.history, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const conversationId = (value as { conversationId?: unknown })?.conversationId
    if (typeof conversationId !== 'string' || conversationId.length > 128) throw new Error('invalid_conversation_id')
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    return (await runtimeSupervisor.conversationHistory(conversationId)).map(({ id, role, content, createdAt, modelId }) => ({ id, role, content, createdAt, modelId }))
  })

  ipcMain.handle(EMPLOYEE_IPC.list, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeList() })
  ipcMain.handle(EMPLOYEE_IPC.capabilities, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeCapabilities() })
  ipcMain.handle(EMPLOYEE_IPC.detail, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeDetail(employeeIdFrom(value)) })
  ipcMain.handle(EMPLOYEE_IPC.create, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeCreate((value as { input: EmployeeDraftInput }).input) })
  ipcMain.handle(EMPLOYEE_IPC.beginEdit, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeBeginEdit(employeeIdFrom(value)) })
  ipcMain.handle(EMPLOYEE_IPC.saveDraft, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeSaveDraft(employeeIdFrom(value), (value as { input: EmployeeDraftInput }).input) })
  ipcMain.handle(EMPLOYEE_IPC.addTestCase, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeAddTestCase(employeeIdFrom(value), (value as { input: { name: string; prompt: string; acceptanceCriteria: string; expectedContains?: string } }).input) })
  ipcMain.handle(EMPLOYEE_IPC.runTest, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const testCaseId = (value as { testCaseId?: unknown }).testCaseId; if (typeof testCaseId !== 'string') throw new Error('invalid_test_case_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeRunTest(employeeIdFrom(value), testCaseId) })
  ipcMain.handle(EMPLOYEE_IPC.confirmTest, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const testRunId = (value as { testRunId?: unknown }).testRunId; if (typeof testRunId !== 'string') throw new Error('invalid_test_run_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeConfirmTest(employeeIdFrom(value), testRunId) })
  ipcMain.handle(EMPLOYEE_IPC.publish, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeePublish(employeeIdFrom(value)) })
  ipcMain.handle(EMPLOYEE_IPC.rollback, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const versionId = (value as { versionId?: unknown }).versionId; if (typeof versionId !== 'string') throw new Error('invalid_employee_version_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeRollback(employeeIdFrom(value), versionId) })
  ipcMain.handle(EMPLOYEE_IPC.setDisabled, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const disabled = (value as { disabled?: unknown }).disabled; if (typeof disabled !== 'boolean') throw new Error('invalid_disabled_state'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeSetDisabled(employeeIdFrom(value), disabled) })
  ipcMain.handle(EMPLOYEE_IPC.archive, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeArchive(employeeIdFrom(value)) })
  ipcMain.handle(EMPLOYEE_IPC.restore, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeRestore(employeeIdFrom(value)) })
  ipcMain.handle(EMPLOYEE_IPC.deleteDraft, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.employeeDeleteDraft(employeeIdFrom(value)) })
  ipcMain.handle(TASK_IPC.list, async (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return (await runtimeSupervisor.taskList()).map(toTaskView) })
  ipcMain.handle(TASK_IPC.createDraft, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskCreateDraft((value as { input: TaskDraftInputView }).input)) })
  ipcMain.handle(TASK_IPC.updateDraft, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const draftId = (value as { draftId?: unknown }).draftId; if (typeof draftId !== 'string') throw new Error('invalid_task_draft_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskUpdateDraft(draftId, (value as { changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds'> }).changes)) })
  ipcMain.handle(TASK_IPC.start, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const draftId = (value as { draftId?: unknown }).draftId; if (typeof draftId !== 'string') throw new Error('invalid_task_draft_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskStart(draftId)) })
  ipcMain.handle(TASK_IPC.requestChange, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const { taskId, sourceMessageId, requestedDiff } = value as { taskId?: unknown; sourceMessageId?: unknown; requestedDiff?: unknown }; if (typeof taskId !== 'string' || typeof sourceMessageId !== 'string' || !requestedDiff || typeof requestedDiff !== 'object') throw new Error('invalid_change_request'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.taskRequestChange(taskId, sourceMessageId, requestedDiff as Record<string, unknown>) })
  ipcMain.handle(TASK_IPC.acceptChange, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const changeRequestId = (value as { changeRequestId?: unknown }).changeRequestId; if (typeof changeRequestId !== 'string') throw new Error('invalid_change_request_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskAcceptChange(changeRequestId, (value as { changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds'> }).changes)) })
  ipcMain.handle(TASK_IPC.rejectChange, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const changeRequestId = (value as { changeRequestId?: unknown }).changeRequestId; if (typeof changeRequestId !== 'string') throw new Error('invalid_change_request_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskRejectChange(changeRequestId)) })
  ipcMain.handle(RESOURCE_IPC.list, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.resourceList() })
  ipcMain.handle(RESOURCE_IPC.probe, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.resourceProbe() })
  const actionIdFrom = (value: unknown): string => { const actionId = (value as { actionId?: unknown })?.actionId; if (typeof actionId !== 'string' || actionId.length > 128) throw new Error('invalid_tool_action_id'); return actionId }
  ipcMain.handle(TASK_IPC.approveTool, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.toolApprove(actionIdFrom(value))) })
  ipcMain.handle(TASK_IPC.rejectTool, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.toolReject(actionIdFrom(value))) })
  ipcMain.handle(TASK_IPC.resolveTool, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const outcome = (value as { outcome?: unknown }).outcome; const evidence = (value as { evidence?: unknown }).evidence; if (!['succeeded', 'failed'].includes(String(outcome)) || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('invalid_tool_resolution'); return toTaskView(await runtimeSupervisor.toolResolve(actionIdFrom(value), outcome as 'succeeded' | 'failed', evidence as Record<string, unknown>)) })
  const memoryIdFrom = (value: unknown, key: 'id' | 'chosenId' = 'id'): string => { const id = (value as Record<string, unknown>)?.[key]; if (typeof id !== 'string' || id.length < 1 || id.length > 128) throw new Error('invalid_memory_id'); return id }
  ipcMain.handle(MEMORY_IPC.status, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryStatus() })
  ipcMain.handle(MEMORY_IPC.downloadModel, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryDownloadModel() })
  ipcMain.handle(MEMORY_IPC.list, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const filters = value && typeof value === 'object' ? value as { scopeType?: MemoryScopeTypeView; scopeId?: string; category?: MemoryCategoryView; status?: MemoryStatusView } : {}; return runtimeSupervisor.memoryList(filters) })
  ipcMain.handle(MEMORY_IPC.search, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor || !value || typeof value !== 'object') throw new Error('invalid_memory_search'); return runtimeSupervisor.memorySearch(value as { query: string; allowedScopes: Array<{ type: MemoryScopeTypeView; id: string }>; categories?: string[]; tags?: string[]; limit?: number; tokenBudget?: number }) })
  ipcMain.handle(MEMORY_IPC.update, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const changes = (value as { changes?: unknown })?.changes; if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('invalid_memory_update'); return runtimeSupervisor.memoryUpdate(memoryIdFrom(value), changes as Partial<Pick<MemoryViewModel, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags'>>) })
  ipcMain.handle(MEMORY_IPC.disable, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryDisable(memoryIdFrom(value)) })
  ipcMain.handle(MEMORY_IPC.restore, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryRestore(memoryIdFrom(value)) })
  ipcMain.handle(MEMORY_IPC.resolveConflict, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryResolveConflict(memoryIdFrom(value, 'chosenId')) })
  ipcMain.handle(MEMORY_IPC.permanentlyDelete, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryDelete(memoryIdFrom(value)) })
  ipcMain.handle(MEMORY_IPC.queue, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryQueue() })
  ipcMain.handle(MEMORY_IPC.migrateEmbeddings, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryMigrateEmbeddings() })
}

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'AI Employee OS',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '显示', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow(): Promise<void> {
  const preloadPath = join(__dirname, '../preload/index.cjs')
  const window = new BrowserWindow(createWindowOptions(preloadPath))
  mainWindow = window

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, process.env.ELECTRON_RENDERER_URL)) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  maintainDiagnostics(app.getPath('userData'))
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const isDevRenderer = Boolean(process.env.ELECTRON_RENDERER_URL) && details.url.startsWith(process.env.ELECTRON_RENDERER_URL!)
    callback({ cancel: !isDevRenderer })
  })
  registerRuntimeIpc()
  createApplicationMenu()
  const runtimePaths = bundledRuntimePaths(app.getAppPath(), process.resourcesPath, app.isPackaged)
  if (app.isPackaged) {
    try {
      initializeBundledModel(join(process.resourcesPath, 'runtime'), app.getPath('userData'), (completed, total) => {
        publishRuntimeStatus({ state: 'connecting', checkedAt: new Date().toISOString(), message: `正在初始化本地 Embedding · ${completed}/${total}` })
      })
    } catch {
      publishRuntimeStatus({ state: 'connecting', checkedAt: new Date().toISOString(), message: 'Embedding 初始化未完成，将以 BM25 模式启动' })
    }
  }
  providerSupervisor = new ProviderSupervisor(join(__dirname, 'provider/index.js'), handleProviderEvent)
  try {
    await providerSupervisor.start()
  } catch {
    providerStatus = { ...providerStatus, state: 'stopped', checkedAt: new Date().toISOString() }
  }
  runtimeSupervisor = new RuntimeSupervisor(
    join(__dirname, 'runtime/index.js'),
    join(app.getPath('userData'), 'runtime', 'control.sqlite3'),
    { pythonPath: runtimePaths.deepAgentPython, scriptPath: runtimePaths.deepAgentWorker, checkpointDirectory: join(app.getPath('userData'), 'runtime', 'checkpoints') },
    { pythonPath: runtimePaths.memoryPython, scriptPath: runtimePaths.memoryWorker, databasePath: join(app.getPath('userData'), 'memory', 'memory.sqlite'), modelCachePath: join(app.getPath('userData'), 'memory', 'model-cache'), keychainHelperPath: runtimePaths.memoryKeychainHelper },
    join(app.getPath('userData'), 'exports'),
    handleRuntimeEvent,
    (request, onEvent) => {
      if (!providerSupervisor) return Promise.reject(new Error('provider_unavailable'))
      return providerSupervisor.execute(request, onEvent)
    },
    (providerRequestId) => {
      if (!providerSupervisor) return Promise.reject(new Error('provider_unavailable'))
      return providerSupervisor.cancel(providerRequestId)
    },
    (_requestId, event) => mainWindow?.webContents.send(CONVERSATION_IPC.event, event as ConversationStreamEvent),
    (event) => mainWindow?.webContents.send(EMPLOYEE_IPC.event, event as EmployeeEvent),
    (event) => mainWindow?.webContents.send(TASK_IPC.event, event as TaskEvent)
  )
  try {
    await runtimeSupervisor.start()
  } catch {
    publishRuntimeStatus({ state: 'disconnected', checkedAt: new Date().toISOString(), message: 'Runtime 启动失败' })
  }
  await createWindow()
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitPreparationStarted = false
let servicesStoppedForQuit = false
app.on('before-quit', (event) => {
  if (servicesStoppedForQuit) return
  event.preventDefault()
  if (quitPreparationStarted) return
  quitPreparationStarted = true
  void (async () => {
    try {
      const result = await runtimeSupervisor?.prepareForQuit()
      if (result && !result.ready) writeLocalDiagnostic(app.getPath('userData'), 'main.quit_timeout', new Error(`active_runs:${result.activeRunIds.length}`))
    } catch (error) {
      writeLocalDiagnostic(app.getPath('userData'), 'main.quit_prepare_failed', error)
    } finally {
      runtimeSupervisor?.stop()
      providerSupervisor?.stop()
      servicesStoppedForQuit = true
      app.quit()
    }
  })()
})
