import { dirname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { ATTACHMENT_IPC, CONVERSATION_IPC, EMPLOYEE_IPC, EXPERT_GROUP_IPC, MEMORY_IPC, PROVIDER_IPC, RESOURCE_IPC, RUNTIME_IPC, SUPERVISOR_IPC, TASK_IPC, USAGE_IPC, type ConversationStreamEvent, type ConversationSummaryView, type EmployeeDraftInput, type EmployeeEvent, type ProviderStatus, type RuntimeStatus, type SupervisorConfigInput, type TaskDetailView, type TaskDraftInputView, type TaskEvent } from '../shared/runtime-contract'
import type { Conversation, Message, MessageAttachmentReference } from '../runtime/domain'
import type { MemoryCategoryView, MemoryScopeTypeView, MemoryStatusView, MemoryViewModel } from '../shared/memory-contract'
import type { FormalTaskDetail } from '../runtime/task-service'
import { projectTaskState } from '../runtime/state-machines'
import { projectAssignmentChatContent, projectDeliveryChatContent } from '../runtime/chat-content-projector'
import { normalizeMatterTitle } from '../shared/task-contract'
import { ProviderSupervisor, type ProviderSupervisorEvent } from './provider-supervisor'
import { RuntimeSupervisor, type RuntimeSupervisorEvent } from './runtime-supervisor'
import { createWindowOptions, isTrustedRendererUrl } from './window-security'
import { bundledRuntimePaths, initializeBundledModel } from './bundled-runtime'
import { maintainDiagnostics, writeLocalDiagnostic } from './storage-policy'
import { resolveArtifactFilePath } from './artifact-file-actions'
import { hasLocalDocumentCapability, hasTenderAnalysisCapability } from '../shared/capability-contract'
import { isChatContentView } from '../shared/chat-content-contract'
import { isDeliveryResultContract } from '../shared/delivery-result-contract'
import { AttachmentImportService, SUPPORTED_ATTACHMENT_EXTENSIONS } from './attachment-import'
import { CONNECTION_IPC } from '../shared/connection-contract'
import { FeishuConnectionService, MacOSKeychainFeishuCredentialStore } from './feishu-connection'

app.enableSandbox()

process.on('uncaughtExceptionMonitor', (error) => {
  if (app.isReady()) writeLocalDiagnostic(app.getPath('userData'), 'main.uncaught_exception', error)
})

let mainWindow: BrowserWindow | null = null
let runtimeSupervisor: RuntimeSupervisor | null = null
let providerSupervisor: ProviderSupervisor | null = null
let feishuConnection: FeishuConnectionService | null = null

async function syncFeishuRuntimeStatus(status: Awaited<ReturnType<FeishuConnectionService['getStatus']>>): Promise<void> {
  if (!runtimeSupervisor) return
  try { await runtimeSupervisor.updateFeishuStatus(status) } catch (error) { writeLocalDiagnostic(app.getPath('userData'), 'connection.feishu_runtime_sync_failed', error) }
}
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

function attachmentImports(): AttachmentImportService {
  return new AttachmentImportService(join(app.getPath('userData'), 'attachments'))
}

function fixedOutputDirectories(attachments: MessageAttachmentReference[] = []): string[] {
  return [...new Set([app.getPath('downloads'), ...attachments.map((attachment) => dirname(attachment.path))])]
}

function handleRuntimeEvent(event: RuntimeSupervisorEvent): void {
  if (event.type === 'starting') {
    publishRuntimeStatus({ state: 'connecting', checkedAt: new Date().toISOString(), message: '正在启动 Local Control Runtime' })
  } else if (event.type === 'ready') {
    publishRuntimeStatus({
      state: 'connected',
      checkedAt: event.health.checkedAt,
      message: `Schema v${event.health.schemaVersion} · Cursor ${event.health.lastEventSequence}`
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
  const state = projectTaskState({
    hasDraft: true,
    taskState: detail.task?.state,
    runState: detail.run?.state,
    hasPendingApproval: detail.toolActions.some((action) => action.state === 'pending'),
    hasBlockedAction: detail.toolActions.some((action) => action.state === 'blocked'),
    hasUnknownResult: detail.toolActions.some((action) => action.state === 'result_unknown')
  })
  const versions = new Map(detail.employeeVersions.map((version) => [version.id, version]))
  const identities = new Map(detail.employeeIdentities.map((identity) => [identity.id, identity]))
  const review = [...detail.checkpoints].reverse().find((checkpoint) => checkpoint.phase === 'manager_review')
  const reviewResult = review?.payload.result && typeof review.payload.result === 'object' && !Array.isArray(review.payload.result) ? review.payload.result as { summary?: unknown } : undefined
  const deliverySummary = typeof reviewResult?.summary === 'string' && reviewResult.summary.trim() ? reviewResult.summary.trim() : undefined
  return {
    id: detail.task?.id ?? detail.draft.id,
    conversationId: detail.draft.conversationId,
    createdAt: detail.task?.createdAt ?? detail.draft.createdAt,
    sourceMessageIds: [...detail.draft.sourceMessageIds],
    taskId: detail.task?.id,
    draftId: detail.draft.id,
    state,
    title: normalizeMatterTitle(detail.task?.title ?? detail.draft.title, detail.draft.goal),
    goal: detail.draft.goal,
    acceptanceCriteria: detail.draft.acceptanceCriteria,
    employeeVersionIds: detail.draft.employeeVersionIds,
    directories: detail.draft.resourceScope.directories,
    requiresDirectories: hasLocalDocumentCapability(detail.draft.capabilityVersionIds) || hasTenderAnalysisCapability(detail.draft.capabilityVersionIds),
    draftRevision: detail.draft.revision,
    frozenRevision: detail.revision?.revision,
    runId: detail.run?.id,
    runStartedAt: detail.run?.createdAt,
    runCompletedAt: detail.run && ['succeeded', 'failed', 'cancelled'].includes(detail.run.state)
      ? detail.delivery?.createdAt ?? detail.checkpoints.at(-1)?.createdAt ?? detail.assignments.map((assignment) => assignment.completedAt).filter((value): value is string => Boolean(value)).sort().at(-1)
      : undefined,
    assignments: detail.assignments.map((assignment) => {
      const { id, sequence, employeeVersionId, state: assignmentState, summary, createdAt, completedAt, reworkOfAssignmentId } = assignment
      const version = versions.get(employeeVersionId)
      const employeeId = version?.employeeId
      const identity = employeeId ? identities.get(employeeId) : undefined
      const content = (assignment.summary?.trim() || ['succeeded', 'failed', 'cancelled'].includes(assignment.state)) ? projectAssignmentChatContent({
        assignment,
        actions: detail.toolActions.filter((action) => action.assignmentId === assignment.id),
        researchBundle: detail.researchBundles.find((bundle) => bundle.assignmentId === assignment.id)
      }) : undefined
      return { id, sequence, employeeId, employeeVersionId, employeeName: identity?.name ?? version?.name, employeeRole: version?.role, avatarDataUrl: identity?.avatarDataUrl ?? version?.avatarDataUrl, createdAt, completedAt, reworkOfAssignmentId, state: assignmentState, content, summary: content?.summary ?? summary }
    }),
    timeline: detail.checkpoints.map(({ phase, assignmentId, nextNode, createdAt, payload }) => ({ phase, assignmentId, nextNode, createdAt, ...(phase === 'memory_loaded' ? { memoryRefs: (payload.recallReasons as Array<{ id: string; reason: string }> | undefined) ?? [] } : {}) })),
    delivery: detail.delivery ? (() => {
      const acceptanceResults = detail.delivery.acceptanceResults.map(({ criterion, passed }) => ({ criterion, passed }))
      const storedContent = isChatContentView(detail.delivery!.presentation) ? detail.delivery!.presentation : undefined
      const result = isDeliveryResultContract(detail.delivery!.result) ? detail.delivery!.result : undefined
      const content = projectDeliveryChatContent({ result, summary: deliverySummary ?? storedContent?.summary, legacySummaries: [...detail.assignments].reverse().flatMap((assignment) => [assignment.summary, assignment.output].filter((value): value is string => Boolean(value?.trim()))), acceptanceResults, artifactCount: detail.artifacts.length, artifactNames: detail.artifacts.map((artifact) => artifact.relativePath), evidenceCount: detail.evidence.length, unresolvedIssues: detail.delivery!.unresolvedIssues })
      return { id: detail.delivery!.id, content, summary: content.summary, createdAt: detail.delivery!.createdAt, acceptanceResults, artifacts: detail.artifacts.map(({ id, mediaType, relativePath, sha256 }) => ({ id, mediaType, relativePath, sha256 })), evidenceCount: detail.evidence.length, unresolvedIssues: detail.delivery!.unresolvedIssues }
    })() : undefined,
    researchBundles: detail.researchBundles.map(({ id, contentHash, items, claims, conflicts, informationGaps }) => ({ id, contentHash, sourceCount: items.length, claimCount: claims.length, conflicts, informationGaps })),
    pendingChange: detail.changeRequests.find((change) => change.decision === 'pending') ? (() => { const change = detail.changeRequests.find((item) => item.decision === 'pending')!; return { id: change.id, sourceMessageId: change.sourceMessageId, requestedDiff: change.requestedDiff } })() : undefined,
    toolActions: detail.toolActions.map(({ id, assignmentId, createdAt, completedAt, toolVersionId, state: actionState, parameters, risk, approvalId, failureCode }) => ({ id, assignmentId, createdAt, completedAt, toolVersionId, state: actionState, parameters, risk, approvalId, failureCode })),
    approvals: detail.approvals.map(({ id, toolActionId, decision }) => ({ id, toolActionId, decision }))
  }
}

function toConversationSummary(conversation: Conversation, messages: Message[], supervisorName = '总管'): ConversationSummaryView {
  const lastMessage = messages.at(-1)
  return {
    id: conversation.id,
    title: conversation.title,
    preview: lastMessage ? `${lastMessage.role === 'assistant' ? `${supervisorName}：` : '你：'}${lastMessage.content.replaceAll(/\s+/g, ' ').slice(0, 72)}` : '尚无消息',
    lastMessageRole: lastMessage?.role,
    lastMessageContent: lastMessage?.content.replaceAll(/\s+/g, ' ').slice(0, 72),
    updatedAt: lastMessage?.createdAt ?? conversation.createdAt,
    messageCount: messages.length
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

  ipcMain.handle(PROVIDER_IPC.configurePoe, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const credential = (value as { credential?: unknown })?.credential
    if (typeof credential !== 'string' || credential.trim().length < 8 || credential.length > 8192) throw new Error('credential_invalid')
    if (!providerSupervisor) throw new Error('provider_supervisor_unavailable')
    const health = await providerSupervisor.configureCredential('poe', credential)
    handleProviderEvent({ type: 'ready', health })
    return providerStatus
  })

  ipcMain.handle(PROVIDER_IPC.verifyPoeModel, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const modelId = (value as { modelId?: unknown })?.modelId
    if (modelId !== 'claude-sonnet-4.6' && modelId !== 'gpt-image-2' && modelId !== 'seedance-2.0') throw new Error('model_not_allowed')
    if (!providerSupervisor) throw new Error('provider_supervisor_unavailable')
    const health = await providerSupervisor.verifyModel('poe', modelId)
    handleProviderEvent({ type: 'ready', health })
    return providerStatus
  })

  ipcMain.handle(CONNECTION_IPC.getFeishuStatus, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!feishuConnection) throw new Error('feishu_connection_unavailable')
    const status = await feishuConnection.getStatus()
    await syncFeishuRuntimeStatus(status)
    return status
  })

  ipcMain.handle(CONNECTION_IPC.openFeishuDeveloperConsole, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!feishuConnection) throw new Error('feishu_connection_unavailable')
    await feishuConnection.openDeveloperConsole(value)
  })

  ipcMain.handle(CONNECTION_IPC.connectFeishu, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!feishuConnection) throw new Error('feishu_connection_unavailable')
    const status = await feishuConnection.connect(value)
    await syncFeishuRuntimeStatus(status)
    return status
  })

  ipcMain.handle(CONNECTION_IPC.cancelFeishuAuthorization, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!feishuConnection) throw new Error('feishu_connection_unavailable')
    const status = feishuConnection.cancelAuthorization()
    await syncFeishuRuntimeStatus(status)
    return status
  })

  ipcMain.handle(CONNECTION_IPC.disconnectFeishu, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!feishuConnection) throw new Error('feishu_connection_unavailable')
    const status = await feishuConnection.disconnect()
    await syncFeishuRuntimeStatus(status)
    return status
  })

  ipcMain.handle(CONVERSATION_IPC.list, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    const conversations = await runtimeSupervisor.conversationList()
    const supervisorName = (await runtimeSupervisor.supervisorGet()).name
    const summaries = await Promise.all(conversations.map(async (conversation) => toConversationSummary(conversation, await runtimeSupervisor!.conversationHistory(conversation.id), supervisorName)))
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  })

  ipcMain.handle(CONVERSATION_IPC.create, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    return toConversationSummary(await runtimeSupervisor.conversationCreate(randomUUID()), [])
  })

  ipcMain.handle(CONVERSATION_IPC.archive, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const conversationId = (value as { conversationId?: unknown })?.conversationId
    if (typeof conversationId !== 'string' || conversationId.length < 1 || conversationId.length > 128) throw new Error('invalid_conversation_id')
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    return runtimeSupervisor.conversationArchive(conversationId)
  })

  ipcMain.handle(ATTACHMENT_IPC.select, async (event) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!mainWindow) throw new Error('window_unavailable')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要分析的附件',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Word、PowerPoint、Excel、PDF、图片', extensions: SUPPORTED_ATTACHMENT_EXTENSIONS }]
    })
    if (result.canceled || !result.filePaths.length) return []
    return attachmentImports().stage(result.filePaths).map(({ id, name, mediaType, size, sha256 }) => ({ id, name, mediaType, size, sha256 }))
  })

  ipcMain.handle(ATTACHMENT_IPC.importDropped, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const paths = (value as { paths?: unknown })?.paths
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 8 || paths.some((path) => typeof path !== 'string' || path.length < 1 || path.length > 4_096 || !isAbsolute(path))) throw new Error('invalid_attachment_selection')
    return attachmentImports().stage(paths).map(({ id, name, mediaType, size, sha256 }) => ({ id, name, mediaType, size, sha256 }))
  })

  const attachmentIdFrom = (value: unknown): string => {
    const attachmentId = (value as { attachmentId?: unknown })?.attachmentId
    if (typeof attachmentId !== 'string' || attachmentId.length > 64) throw new Error('invalid_attachment_id')
    return attachmentId
  }
  ipcMain.handle(ATTACHMENT_IPC.open, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const result = await shell.openPath(attachmentImports().path(attachmentIdFrom(value)))
    if (result) throw new Error('attachment_open_failed')
    return { opened: true }
  })
  ipcMain.handle(ATTACHMENT_IPC.reveal, (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    shell.showItemInFolder(attachmentImports().path(attachmentIdFrom(value)))
    return { revealed: true }
  })

  ipcMain.handle(CONVERSATION_IPC.send, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    if (!value || typeof value !== 'object') throw new Error('invalid_conversation_request')
    const { conversationId, text, directories = [], attachmentIds = [] } = value as { conversationId?: unknown; text?: unknown; directories?: unknown; attachmentIds?: unknown }
    if (typeof conversationId !== 'string' || conversationId.length > 128 || typeof text !== 'string' || text.length < 1 || text.length > 100_000) throw new Error('invalid_conversation_request')
    if (!Array.isArray(directories) || directories.length > 16 || new Set(directories).size !== directories.length || directories.some((directory) => typeof directory !== 'string' || !directory.startsWith('/') || directory.length > 4_096)) throw new Error('invalid_conversation_directories')
    if (!Array.isArray(attachmentIds) || attachmentIds.some((id) => typeof id !== 'string')) throw new Error('invalid_attachment_ids')
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    const attachments = attachmentImports().resolve(attachmentIds)
    const messageId = randomUUID()
    const result = await runtimeSupervisor.sendConversation(conversationId, messageId, text, fixedOutputDirectories(attachments), attachments)
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
    return (await runtimeSupervisor.conversationHistory(conversationId)).map(({ id, role, content, attachments, createdAt, modelId }) => ({ id, role, content, attachments: attachments?.map(({ id: attachmentId, name, mediaType, size, sha256 }) => ({ id: attachmentId, name, mediaType, size, sha256 })), createdAt, modelId }))
  })

  ipcMain.handle(SUPERVISOR_IPC.get, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.supervisorGet() })
  ipcMain.handle(SUPERVISOR_IPC.update, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const input = (value as { input?: unknown })?.input; if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_supervisor_configuration'); return runtimeSupervisor.supervisorUpdate(input as SupervisorConfigInput) })

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
  ipcMain.handle(EXPERT_GROUP_IPC.list, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.expertGroupList() })
  ipcMain.handle(EXPERT_GROUP_IPC.archive, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const groupId = (value as { groupId?: unknown })?.groupId; if (typeof groupId !== 'string' || groupId.length < 1 || groupId.length > 128) throw new Error('invalid_expert_group_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.expertGroupArchive(groupId) })
  ipcMain.handle(TASK_IPC.list, async (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return (await runtimeSupervisor.taskList()).map(toTaskView) })
  ipcMain.handle(TASK_IPC.outputDirectory, (event) => { assertTrustedSender(event.senderFrame?.url); return app.getPath('downloads') })
  const artifactFileFrom = async (value: unknown): Promise<string> => {
    const { taskId, artifactId } = value as { taskId?: unknown; artifactId?: unknown }
    if (typeof taskId !== 'string' || taskId.length < 1 || taskId.length > 128) throw new Error('invalid_task_id')
    if (typeof artifactId !== 'string' || artifactId.length < 1 || artifactId.length > 128) throw new Error('invalid_artifact_id')
    if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable')
    const detail = (await runtimeSupervisor.taskList()).find((item) => item.task?.id === taskId || item.draft.id === taskId)
    if (!detail) throw new Error('task_not_found')
    const artifact = detail.artifacts.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('artifact_not_found')
    return resolveArtifactFilePath({ artifactPath: artifact.relativePath, exportDirectory: join(app.getPath('userData'), 'exports'), authorizedDirectories: detail.draft.resourceScope.directories })
  }
  ipcMain.handle(TASK_IPC.openArtifact, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    const result = await shell.openPath(await artifactFileFrom(value))
    if (result) throw new Error('artifact_open_failed')
    return { opened: true }
  })
  ipcMain.handle(TASK_IPC.revealArtifact, async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url)
    shell.showItemInFolder(await artifactFileFrom(value))
    return { revealed: true }
  })
  ipcMain.handle(TASK_IPC.createDraft, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const input = (value as { input: TaskDraftInputView }).input; return toTaskView(await runtimeSupervisor.taskCreateDraft({ ...input, directories: fixedOutputDirectories() })) })
  ipcMain.handle(TASK_IPC.updateDraft, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const draftId = (value as { draftId?: unknown }).draftId; if (typeof draftId !== 'string') throw new Error('invalid_task_draft_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const changes = (value as { changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds'> }).changes; return toTaskView(await runtimeSupervisor.taskUpdateDraft(draftId, { ...changes, directories: fixedOutputDirectories() })) })
  ipcMain.handle(TASK_IPC.start, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const draftId = (value as { draftId?: unknown }).draftId; if (typeof draftId !== 'string') throw new Error('invalid_task_draft_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskStart(draftId)) })
  ipcMain.handle(TASK_IPC.retry, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const taskId = (value as { taskId?: unknown }).taskId; if (typeof taskId !== 'string') throw new Error('invalid_task_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskRetry(taskId)) })
  ipcMain.handle(TASK_IPC.requestChange, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const { taskId, sourceMessageId, requestedDiff } = value as { taskId?: unknown; sourceMessageId?: unknown; requestedDiff?: unknown }; if (typeof taskId !== 'string' || typeof sourceMessageId !== 'string' || !requestedDiff || typeof requestedDiff !== 'object') throw new Error('invalid_change_request'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.taskRequestChange(taskId, sourceMessageId, requestedDiff as Record<string, unknown>) })
  ipcMain.handle(TASK_IPC.acceptChange, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const changeRequestId = (value as { changeRequestId?: unknown }).changeRequestId; if (typeof changeRequestId !== 'string') throw new Error('invalid_change_request_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); const changes = (value as { changes: Pick<TaskDraftInputView, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds'> }).changes; return toTaskView(await runtimeSupervisor.taskAcceptChange(changeRequestId, { ...changes, directories: fixedOutputDirectories() })) })
  ipcMain.handle(TASK_IPC.rejectChange, async (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); const changeRequestId = (value as { changeRequestId?: unknown }).changeRequestId; if (typeof changeRequestId !== 'string') throw new Error('invalid_change_request_id'); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return toTaskView(await runtimeSupervisor.taskRejectChange(changeRequestId)) })
  ipcMain.handle(RESOURCE_IPC.list, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.resourceList() })
  ipcMain.handle(RESOURCE_IPC.probe, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.resourceProbe() })
  ipcMain.handle(USAGE_IPC.summary, (event) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.usageSummary() })
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
  ipcMain.handle(MEMORY_IPC.acceptQueueItem, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryAcceptQueueItem(memoryIdFrom(value)) })
  ipcMain.handle(MEMORY_IPC.dismissQueueItem, (event, value: unknown) => { assertTrustedSender(event.senderFrame?.url); if (!runtimeSupervisor) throw new Error('runtime_supervisor_unavailable'); return runtimeSupervisor.memoryDismissQueueItem(memoryIdFrom(value)) })
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
  feishuConnection = new FeishuConnectionService(new MacOSKeychainFeishuCredentialStore(runtimePaths.providerKeychainHelper), (url) => shell.openExternal(url))
  if (app.isPackaged) {
    try {
      initializeBundledModel(join(process.resourcesPath, 'runtime'), app.getPath('userData'), (completed, total) => {
        publishRuntimeStatus({ state: 'connecting', checkedAt: new Date().toISOString(), message: `正在初始化本地 Embedding · ${completed}/${total}` })
      })
    } catch {
      publishRuntimeStatus({ state: 'connecting', checkedAt: new Date().toISOString(), message: 'Embedding 初始化未完成，将以 BM25 模式启动' })
    }
  }
  providerSupervisor = new ProviderSupervisor(join(__dirname, 'provider/index.js'), runtimePaths.providerKeychainHelper, handleProviderEvent)
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
    runtimePaths.imageTextExtractor,
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
    (event) => mainWindow?.webContents.send(TASK_IPC.event, event as TaskEvent),
    (toolVersionId, parameters) => {
      if (!feishuConnection) return Promise.reject(new Error('feishu_connection_unavailable'))
      return feishuConnection.executeDocumentTool(toolVersionId, parameters)
    }
  )
  try {
    await runtimeSupervisor.start()
    await syncFeishuRuntimeStatus(await feishuConnection.getStatus())
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
