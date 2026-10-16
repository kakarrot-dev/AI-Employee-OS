import { isTeamsTool } from '../shared/teams-contract'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { SIDECAR_PROTOCOL_VERSION, parseRuntimeCommand, type RuntimeOutboundEvent, type RuntimeResponse } from '../shared/runtime-sidecar-protocol'
import type { BudgetLedgerEntry, Conversation, Message, MessageAttachmentReference, ToolAction } from './domain'
import { summarizeUsage } from './usage-service'
import { EmployeeService } from './employee-service'
import { ExpertGroupService } from './expert-group-service'
import { TaskService } from './task-service'
import { EmployeeExecutor } from './employee-executor'
import { TeamExecutor } from './team-executor'
import { isRecoverableToolProposalError } from './tool-proposal-errors'
import { SupervisorExecutor } from './supervisor-executor'
import { EmployeeProviderTransport } from './employee-provider-transport'
import type { ProviderEvent } from '../provider/contract'
import { ResourceService } from './resource-service'
import { ToolGateway } from './tool-gateway'
import { createToolRunner } from './tool-runner'
import { ManagedResearchService } from './managed-research-service'
import { DeliveryExporter } from './delivery-exporter'
import { MemoryService, type MemoryCategory, type MemoryStatus, type MemoryView } from './memory-service'
import { SupervisorRouter } from './supervisor-router'
import { SupervisorService } from './supervisor-service'
import { hasResearchCapability, hasTenderAnalysisCapability } from './builtin-contracts'
import { createAttachmentContentInspector } from './attachment-content-inspector'
import { nativeImageTextRecognizer } from './tender-document-runner'
import { normalizeHandoffJsonValue } from './handoff-contract'
import { FEISHU_TOOL_IDS, type FeishuToolId } from '../shared/connection-contract'
import type { ToolRunner } from './tool-gateway'

function databasePathFromArgs(): string {
  const argument = process.argv.find((value) => value.startsWith('--database='))
  if (!argument) throw new Error('missing_database_path')
  const databasePath = resolve(argument.slice('--database='.length))
  if (!databasePath.endsWith('.sqlite3')) throw new Error('invalid_database_path')
  return databasePath
}

function requiredPathArgument(name: string): string {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  if (!value) throw new Error(`missing_${name.replaceAll('-', '_')}`)
  return resolve(value)
}

const parentPort = process.parentPort
if (!parentPort) throw new Error('runtime_requires_parent_port')

const store = new RuntimeStore(databasePathFromArgs())
const kernel = new RuntimeKernel(store)
const resources = new ResourceService(kernel)
resources.seed()
const employees = new EmployeeService(kernel)
employees.seedCapabilities()
employees.seedRequestedSpecialists()
const expertGroups = new ExpertGroupService(kernel, employees)
expertGroups.seed()
const imageTextExtractorPath = requiredPathArgument('image-text-extractor')
const pendingConnectionTools = new Map<string, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void; detachAbort: () => void }>()
const connectionRunner: ToolRunner = async (tool, parameters, context) => {
  if (!isTeamsTool(tool.id) && !Object.values(FEISHU_TOOL_IDS).includes(tool.id as FeishuToolId)) throw new Error('unsupported_connection_tool')
  const requestId = context.actionId
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const onAbort = (): void => {
      pendingConnectionTools.delete(requestId)
      reject(new Error('tool_timeout'))
    }
    context.signal.addEventListener('abort', onAbort, { once: true })
    pendingConnectionTools.set(requestId, { resolve, reject, detachAbort: () => context.signal.removeEventListener('abort', onAbort) })
    if (isTeamsTool(tool.id)) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.teams.execute', requestId, toolVersionId: tool.id, parameters: structuredClone(parameters) })
    else emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.feishu.execute', requestId, toolVersionId: tool.id as FeishuToolId, parameters: structuredClone(parameters) })
  })
}
const toolGateway = new ToolGateway(kernel, resources, createToolRunner(imageTextExtractorPath, connectionRunner, connectionRunner))
const research = new ManagedResearchService(kernel, toolGateway)
const exportDirectory = requiredPathArgument('export-directory')
const memory = new MemoryService({ pythonPath: requiredPathArgument('memory-python'), scriptPath: requiredPathArgument('memory-script'), databasePath: requiredPathArgument('memory-database'), modelCachePath: requiredPathArgument('memory-model-cache'), keychainHelperPath: requiredPathArgument('memory-keychain-helper') })
const supervisor = new SupervisorService(kernel)
supervisor.seed()
const deliveryExporter = new DeliveryExporter(kernel, exportDirectory)
const tasks = new TaskService(kernel, employees, (request) => memory.search(request), ({ assignment, revision, version, output, actions }) => {
  if (hasTenderAnalysisCapability(version.capabilityVersionIds)) {
    const extraction = actions.find((action) => action.toolVersionId === 'tender.requirements.extract@document-analysis/v1' && action.state === 'succeeded' && action.resultVerified === true)
    const documents = Array.isArray(extraction?.result?.documents) ? extraction.result.documents as Array<Record<string, unknown>> : []
    const handoff = {
      schemaVersion: 1,
      type: 'TenderRequirementHandoff',
      taskRevisionId: revision.id,
      sourceEvidence: documents.map((document) => ({ name: document.name, path: document.path, format: document.format, sha256: document.sha256, sectionCount: Array.isArray(document.sections) ? document.sections.length : 0, truncated: document.truncated === true })),
      warnings: Array.isArray(extraction?.result?.warnings) ? extraction.result.warnings : [],
      analystSynthesis: output,
      sourceBodyIncluded: false
    }
    return { parts: [{ kind: 'data', name: '招投标需求交接', mediaType: 'application/json', schemaId: 'ai-employee-os/TenderRequirementHandoff/v1', value: normalizeHandoffJsonValue(handoff) }] }
  }
  if (!hasResearchCapability(version.capabilityVersionIds)) return { text: output }
  const bundle = research.createBundle({ taskId: revision.taskId, runId: assignment.runId, assignmentId: assignment.id, employeeVersionId: version.id, question: revision.goal, githubQuery: '', feedUrl: '' }, actions)
  const handoff = { schemaVersion: 1, type: 'ResearchHandoff', researchBundleId: bundle.id, contentHash: bundle.contentHash, question: bundle.question, claims: bundle.claims, conflicts: bundle.conflicts, informationGaps: bundle.informationGaps, sources: bundle.items.map((item, index) => ({ index, sourceType: item.sourceType, title: item.title, url: item.url, publishedAt: item.publishedAt, summary: item.summary, contentHash: item.contentHash, trust: item.trust, injectionSignals: item.injectionSignals })), researcherSynthesis: output }
  return { parts: [{ kind: 'data', name: '网络调研交接', mediaType: 'application/json', schemaId: 'ai-employee-os/ResearchHandoff/v1', value: normalizeHandoffJsonValue(handoff) }], researchBundleId: bundle.id }
}, (detail) => deliveryExporter.materialize(detail), () => supervisor.get(), 'openai-agents-team')
const supervisorRouter = new SupervisorRouter(employees, tasks, () => supervisor.get(), (request) => memory.search(request), createAttachmentContentInspector(nativeImageTextRecognizer(imageTextExtractorPath)), expertGroups)

function enqueueMemorySafely(input: Parameters<MemoryService['enqueueAsync']>[0]): void {
  void memory.enqueueAsync(input).catch(() => { /* memory processing must not fail the primary conversation or task */ })
}

const pendingConversations = new Map<string, {
  conversationId: string
  sourceMessageId: string
  assistantMessageId: string
  userText: string
  history: Message[]
  directories: string[]
  attachments: MessageAttachmentReference[]
  text: string
  provider: 'deepseek' | 'poe'
  modelId: string
  routeValue?: unknown
  providerRequestId?: string
}>()

function respond(response: RuntimeResponse): void {
  parentPort.postMessage(response)
}

function emit(event: RuntimeOutboundEvent): void {
  if (event.type === 'runtime.provider.execute' && (teamExecutor.submit(event.request) || employeeExecutor.submit(event.request) || (pendingConversations.has(event.request.requestId) && supervisorExecutor.submit(event.request)))) return
  parentPort.postMessage(event)
}

const employeeTransport = new EmployeeProviderTransport(
  (request) => parentPort.postMessage({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: request.requestId, request }),
  (providerRequestId) => parentPort.postMessage({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.cancel', requestId: randomUUID(), providerRequestId })
)
const employeeExecutor = new EmployeeExecutor(tasks, {
  execute: (request, onEvent, signal) => employeeTransport.execute(request, onEvent, signal),
  event: (requestId, event) => { applyTaskProviderEvent(requestId, event) },
  propose: applyTaskToolProposal,
  failed: (requestId, code) => { applyTaskProviderFailure(requestId, code) }
})
const teamExecutor = new TeamExecutor(kernel, tasks, toolGateway, {
  execute: (request, onEvent, signal) => employeeTransport.execute(request, onEvent, signal),
  event: (requestId, event) => { applyTaskProviderEvent(requestId, event) },
  failed: (runId) => {
    const detail = tasks.detailByRun(runId)
    emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: randomUUID(), event: { type: 'failed', taskId: detail.task!.id, runId } })
  }
})
const supervisorExecutor = new SupervisorExecutor({
  execute: (request, onEvent, signal) => employeeTransport.execute(request, onEvent, signal),
  event: applyConversationProviderEvent,
  validate: (value) => { supervisorRouter.validateDecision(value) },
  failed: (requestId, code) => {
    pendingConversations.delete(requestId)
    emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId, event: { type: 'failed', requestId, code } })
  }
})

async function applyTaskToolProposal(providerRequestId: string, providerEvent: Extract<ProviderEvent, { type: 'tool_proposal' }>): Promise<Record<string, unknown>> {
  if (!tasks.canAcceptToolProposal(providerRequestId)) {
    return { state: 'ignored' }
  }
  let proposal: ReturnType<TaskService['toolProposalContext']>
  let action: ToolAction
  try {
    proposal = tasks.toolProposalContext(providerRequestId, providerEvent)
    action = await toolGateway.propose(proposal)
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : 'invalid_tool_proposal'
    if (isRecoverableToolProposalError(code)) {
      const detail = tasks.recordInvalidToolProposal(providerRequestId, code)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: providerRequestId, event: { type: 'progress', taskId: detail.task!.id, runId: detail.run?.id } })
      return { state: 'rejected', failureCode: code }
    }
    throw error
  }
  const detail = tasks.attachToolAction(proposal.assignmentId, action.id)
  emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: providerRequestId, event: { type: ['pending', 'blocked', 'result_unknown'].includes(action.state) ? 'needs_attention' : 'progress', taskId: detail.task!.id, runId: detail.run?.id } })
  return { actionId: action.id, state: action.state, resultVerified: action.resultVerified ?? false, result: action.result ?? null, failureCode: action.failureCode }
}

function applyTaskProviderEvent(providerRequestId: string, providerEvent: ProviderEvent): boolean {
  const taskResult = tasks.handleProviderEvent(providerRequestId, providerEvent)
  if (!taskResult) return false
  if (taskResult.event === 'assignment_completed' && !taskResult.request && taskResult.detail.handoffs.at(-1)?.toSupervisor) {
    try {
      const managerRequest = tasks.beginManagerReview(taskResult.detail.run!.id)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: managerRequest.requestId, request: managerRequest })
    } catch (error) {
      const failed = tasks.failRun(taskResult.detail.run!.id, error instanceof Error ? error.message : 'handoff_validation_failed')
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: providerRequestId, event: { type: 'failed', taskId: failed.task!.id, runId: failed.run?.id } })
      return true
    }
  } else if (taskResult.request) {
    emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: taskResult.request.requestId, request: taskResult.request })
  }
  if (taskResult.event === 'delivery_completed') {
    const output = taskResult.detail.assignments.map((assignment) => assignment.output ?? '').filter(Boolean).join('\n')
    enqueueMemorySafely({ sourceType: 'task', sourceRef: `task:${taskResult.detail.task!.id}`, scopeType: 'task', scopeId: taskResult.detail.task!.id, content: `目标：${taskResult.detail.revision!.goal}\n结果：${output}`.slice(0, 50_000) })
  }
  emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: providerRequestId, event: { type: taskResult.event, taskId: taskResult.detail.task!.id, runId: taskResult.detail.run?.id } })
  return true
}

function applyTaskProviderFailure(providerRequestId: string, code: string): boolean {
  const taskResult = tasks.handleProviderFailure(providerRequestId, code)
  if (!taskResult) return false
  if (taskResult.request) {
    emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: taskResult.request.requestId, request: taskResult.request })
    emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: providerRequestId, event: { type: 'progress', taskId: taskResult.detail.task!.id, runId: taskResult.detail.run?.id } })
    return true
  }
  const output = taskResult.detail.assignments.map((assignment) => assignment.output ?? '').filter(Boolean).join('\n')
  enqueueMemorySafely({ sourceType: 'task', sourceRef: `task:${taskResult.detail.task!.id}`, scopeType: 'task', scopeId: taskResult.detail.task!.id, content: `任务失败经验：${code}\n${output}`.slice(0, 50_000) })
  emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: providerRequestId, event: { type: 'failed', taskId: taskResult.detail.task!.id, runId: taskResult.detail.run?.id } })

  return true
}


function applyConversationProviderEvent(providerRequestId: string, providerEvent: ProviderEvent): void {
  const pending = pendingConversations.get(providerRequestId)
  if (!pending) throw new Error('unknown_provider_request')
  if (providerEvent.type === 'output_delta') pending.text += providerEvent.delta
  if (providerEvent.type === 'structured_result') pending.routeValue = providerEvent.value
  if (providerEvent.type === 'completed') pending.providerRequestId = providerEvent.providerRequestId
  if (providerEvent.type === 'usage') {
    const ledger: BudgetLedgerEntry = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), runId: `conversation:${pending.conversationId}`, requestId: providerEvent.requestId, provider: pending.provider, modelId: pending.modelId, inputTokens: providerEvent.inputTokens, outputTokens: providerEvent.outputTokens, amountUsdMicros: 0, source: 'provider_actual' }
    kernel.save({ entityType: 'BudgetLedgerEntry', entity: ledger, immutable: true }, 'provider.usage.recorded', { inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens, source: ledger.source })
  }
  if (providerEvent.type === 'usage') emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: providerRequestId, event: { ...providerEvent, requestId: providerRequestId } })
  if (providerEvent.type === 'completed') {
    try {
      const route = supervisorRouter.applyDecision({ requestId: providerRequestId, conversationId: pending.conversationId, sourceMessageId: pending.sourceMessageId, text: pending.userText, history: pending.history, directories: pending.directories, attachments: pending.attachments }, pending.routeValue ?? JSON.parse(pending.text))
      const assistantMessage: Message = { schemaVersion: 1, id: pending.assistantMessageId, createdAt: new Date().toISOString(), conversationId: pending.conversationId, role: 'assistant', content: route.response, provider: pending.provider, modelId: pending.modelId, providerRequestId: pending.providerRequestId }
      kernel.save({ entityType: 'Message', entity: assistantMessage, immutable: true }, 'message.created', { role: 'assistant', provider: pending.provider, modelId: pending.modelId, routeMode: route.mode, taskDraftId: route.task?.draft.id, missingInputs: route.missingInputs })
      if (route.startRequest) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: route.startRequest.requestId, request: route.startRequest })
      enqueueMemorySafely({ sourceType: 'conversation', sourceRef: `conversation:${pending.conversationId}:message:${assistantMessage.id}`, scopeType: 'global', scopeId: 'global:local-owner', content: `${pending.userText}\n${assistantMessage.content}`.trim().slice(0, 50_000) })
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: providerRequestId, event: { type: 'output_delta', requestId: providerRequestId, delta: route.response } })
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: providerRequestId, event: { ...providerEvent, requestId: providerRequestId } })
    } catch (error) {
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: providerRequestId, event: { type: 'failed', requestId: providerRequestId, code: error instanceof Error ? error.message.split(':')[0] : 'invalid_supervisor_route' } })
    } finally {
      pendingConversations.delete(providerRequestId)
    }
  }
}

parentPort.on('message', async (event) => {
  let requestId = 'unknown'
  try {
    const command = parseRuntimeCommand(event.data)
    requestId = command.requestId
    if (command.type === 'teams.confirmation') {
      for (const result of tasks.updateTeamsConfirmation(command.payload.confirmation)) {
        if (result.request) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: result.request.requestId, request: result.request })
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId, event: { type: result.request ? 'progress' : 'needs_attention', taskId: result.detail.task!.id, runId: result.detail.run?.id } })
      }
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }
    if (command.type === 'connection.teams.status') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resources.updateTeamsConnection(command.payload.status) })
      return
    }
    if (command.type === 'connection.feishu.status') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resources.updateFeishuConnection(command.payload.status) })
      return
    }
    if (command.type === 'feishu.result' || command.type === 'feishu.failed' || command.type === 'teams.result' || command.type === 'teams.failed') {
      const pending = pendingConnectionTools.get(command.payload.toolRequestId)
      if (pending) {
        pendingConnectionTools.delete(command.payload.toolRequestId)
        pending.detachAbort()
        if (command.type === 'feishu.result' || command.type === 'teams.result') pending.resolve(command.payload.result)
        else pending.reject(new Error(command.payload.code))
      }
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }
    if (command.type === 'health') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: kernel.health() })
      return
    }
    if (command.type === 'recover') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: kernel.recover() })
      return
    }
    if (command.type === 'shutdown.prepare') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: tasks.requestShutdown() })
      return
    }
    if (command.type === 'events.after') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: store.eventsAfter(command.payload.sequence, command.payload.limit) })
      return
    }
    if (command.type === 'conversation.list') {
      const conversations = store.list<Conversation>('Conversation').filter((conversation) => !conversation.archived)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: conversations })
      return
    }
    if (command.type === 'conversation.create') {
      const existing = store.get<Conversation>('Conversation', command.payload.conversationId)
      if (existing) throw new Error('conversation_already_exists')
      const conversation: Conversation = { schemaVersion: 1, id: command.payload.conversationId, createdAt: new Date().toISOString(), title: '新会话', archived: false }
      kernel.save({ entityType: 'Conversation', entity: conversation, immutable: false }, 'conversation.created', {})
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: conversation })
      return
    }
    if (command.type === 'conversation.archive') {
      const conversation = store.get<Conversation>('Conversation', command.payload.conversationId)
      if (!conversation) throw new Error('conversation_not_found')
      kernel.save({ entityType: 'Conversation', entity: { ...conversation, archived: true }, immutable: false }, 'conversation.archived', {})
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { archived: true, conversationId: conversation.id } })
      return
    }
    if (command.type === 'conversation.history') {
      const messages = store.list<Message>('Message').filter((message) => message.conversationId === command.payload.conversationId)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: messages })
      return
    }
    if (command.type === 'supervisor.get') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: supervisor.get() })
      return
    }
    if (command.type === 'supervisor.update') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: supervisor.update(command.payload.input) })
      return
    }
    if (command.type === 'conversation.send') {
      const existingConversation = store.get<Conversation>('Conversation', command.payload.conversationId)
      if (!existingConversation) {
        const conversation: Conversation = { schemaVersion: 1, id: command.payload.conversationId, createdAt: new Date().toISOString(), title: command.payload.text.slice(0, 36), archived: false }
        kernel.save({ entityType: 'Conversation', entity: conversation, immutable: false }, 'conversation.created', {})
      } else if (existingConversation.title === '新会话') {
        kernel.save({ entityType: 'Conversation', entity: { ...existingConversation, title: command.payload.text.slice(0, 36) }, immutable: false }, 'conversation.titled', {})
      }
      const userMessage: Message = { schemaVersion: 1, id: command.payload.messageId, createdAt: new Date().toISOString(), conversationId: command.payload.conversationId, role: 'user', content: command.payload.text, attachments: command.payload.attachments.map((attachment) => ({ ...attachment })) }
      kernel.save({ entityType: 'Message', entity: userMessage, immutable: true }, 'message.created', { role: 'user' })
      const history = store.list<Message>('Message').filter((message) => message.conversationId === command.payload.conversationId && message.id !== userMessage.id)
      const routeInput = { requestId, conversationId: command.payload.conversationId, sourceMessageId: userMessage.id, text: command.payload.text, history, directories: command.payload.directories, attachments: command.payload.attachments }
      const supervisorRequest = await supervisorRouter.createRequest(routeInput)
      pendingConversations.set(requestId, { conversationId: routeInput.conversationId, sourceMessageId: routeInput.sourceMessageId, assistantMessageId: randomUUID(), userText: routeInput.text, history, directories: [...routeInput.directories], attachments: routeInput.attachments.map((attachment) => ({ ...attachment })), text: '', provider: supervisorRequest.provider, modelId: supervisorRequest.modelId })
      emit({
        schemaVersion: SIDECAR_PROTOCOL_VERSION,
        type: 'runtime.provider.execute',
        requestId,
        request: supervisorRequest
      })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }
    if (command.type === 'conversation.cancel') {
      if (!pendingConversations.has(command.payload.providerRequestId)) throw new Error('unknown_provider_request')
      if (!supervisorExecutor.cancel(command.payload.providerRequestId)) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.cancel', requestId, providerRequestId: command.payload.providerRequestId })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }
    if (command.type === 'employee.list') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.list() })
      return
    }
    if (command.type === 'employee.capabilities') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.capabilities() })
      return
    }
    if (command.type === 'employee.detail') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.detail(command.payload.employeeId) })
      return
    }
    if (command.type === 'employee.create') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.create(command.payload.input) })
      return
    }
    if (command.type === 'employee.begin_edit') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.beginEdit(command.payload.employeeId) })
      return
    }
    if (command.type === 'employee.save_draft') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.saveDraft(command.payload.employeeId, command.payload.input) })
      return
    }
    if (command.type === 'employee.test_case.add') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.addTestCase(command.payload.employeeId, command.payload.input) })
      return
    }
    if (command.type === 'employee.test.run') {
      const started = employees.startTest(command.payload.employeeId, command.payload.testCaseId, requestId)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId, request: started.request })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true, requestId, testRunId: started.run.id } })
      return
    }
    if (command.type === 'employee.test.confirm') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.confirmTest(command.payload.employeeId, command.payload.testRunId) })
      return
    }
    if (command.type === 'employee.publish') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.publish(command.payload.employeeId) })
      return
    }
    if (command.type === 'employee.rollback') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.rollback(command.payload.employeeId, command.payload.versionId) })
      return
    }
    if (command.type === 'employee.disable') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.setDisabled(command.payload.employeeId, command.payload.disabled) })
      return
    }
    if (command.type === 'employee.archive') {
      const result = employees.archive(command.payload.employeeId)
      expertGroups.archiveContainingEmployee(command.payload.employeeId)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result })
      return
    }
    if (command.type === 'employee.restore') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.restore(command.payload.employeeId) })
      return
    }
    if (command.type === 'employee.delete') {
      employees.deleteDraftEmployee(command.payload.employeeId)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }
    if (command.type === 'expert_group.list') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: expertGroups.list() })
      return
    }
    if (command.type === 'expert_group.archive') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: expertGroups.archive(command.payload.groupId) })
      return
    }
    if (command.type === 'task.list') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: tasks.list() })
      return
    }
    if (command.type === 'resource.list') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resources.list() })
      return
    }
    if (command.type === 'resource.probe') {
      await resources.probe()
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resources.list() })
      return
    }
    if (command.type === 'usage.summary') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: summarizeUsage(store.list<BudgetLedgerEntry>('BudgetLedgerEntry')) })
      return
    }
    if (command.type === 'memory.status') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.status() }); return }
    if (command.type === 'memory.model.download') { memory.downloadModel(); respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.status() }); return }
    if (command.type === 'memory.list') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.list(command.payload as { scopeType?: 'global' | 'employee' | 'task'; scopeId?: string; category?: MemoryCategory; status?: MemoryStatus }) }); return }
    if (command.type === 'memory.search') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.search({ ...command.payload, categories: command.payload.categories as MemoryCategory[] | undefined }) }); return }
    if (command.type === 'memory.update') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.update(command.payload.id, command.payload.changes as Partial<Pick<MemoryView, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags'>>) }); return }
    if (command.type === 'memory.disable') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.disable(command.payload.id) }); return }
    if (command.type === 'memory.restore') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.restore(command.payload.id) }); return }
    if (command.type === 'memory.resolve_conflict') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.resolveConflict(command.payload.chosenId) }); return }
    if (command.type === 'memory.delete') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.permanentlyDelete(command.payload.id) }); return }
    if (command.type === 'memory.queue.list') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.queue() }); return }
    if (command.type === 'memory.queue.accept') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.acceptQueueItem(command.payload.id) }); return }
    if (command.type === 'memory.queue.dismiss') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.dismissQueueItem(command.payload.id) }); return }
    if (command.type === 'memory.embeddings.migrate') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.migrateEmbeddings() }); return }
    if (command.type === 'tool.approve' || command.type === 'tool.reject' || command.type === 'tool.resolve_unknown') {
      let action: ToolAction
      try {
        if (command.type !== 'tool.resolve_unknown') teamExecutor.assertApprovalReady(command.payload.actionId, command.type === 'tool.approve')
        action = command.type === 'tool.resolve_unknown'
          ? kernel.transaction(() => {
            const resolved = toolGateway.resolveUnknown(command.payload.actionId, command.payload.outcome, command.payload.evidence)
            teamExecutor.actionCommitted(resolved)
            return resolved
          })
          : await toolGateway.decide(command.payload.actionId, command.type === 'tool.approve', (updated) => teamExecutor.actionCommitted(updated))
      } catch (error) {
        const code = error instanceof Error ? error.message.split(':')[0] : 'tool_decision_failed'
        if (command.type !== 'tool.approve' || code !== 'run_grant_expired') throw error
        const expiredAction = store.get<ToolAction>('ToolAction', command.payload.actionId)
        if (!expiredAction) throw new Error('tool_action_not_found')
        const detail = tasks.failRun(expiredAction.runId, code)
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId, event: { type: 'failed', taskId: detail.task!.id, runId: detail.run?.id } })
        respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: detail })
        return
      }
      const resumed = kernel.transaction(() => {
        teamExecutor.afterDecision(action)
        const result = tasks.resumeAfterTool(action)
        if (result.request) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: result.request.requestId, request: result.request })
        return result.request ? result : { detail: tasks.settleToolGate(action.runId) }
      })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resumed.detail })
      return
    }
    if (command.type === 'task.create_draft') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: tasks.createDraft(command.payload.input) })
      return
    }
    if (command.type === 'task.update_draft') {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: tasks.updateDraft(command.payload.draftId, command.payload.changes) })
      return
    }
    if (command.type === 'task.start') {
      const started = tasks.confirmAndStart(command.payload.draftId)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: started.request.requestId, request: started.request })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: started })
      return
    }
    if (command.type === 'task.retry') {
      const retried = tasks.retryFailedTask(command.payload.taskId)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: retried.request.requestId, request: retried.request })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: retried })
      return
    }
    if (command.type === 'task.request_change') {
      const change = tasks.requestChange(command.payload.taskId, command.payload.sourceMessageId, command.payload.requestedDiff)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true, changeRequestId: change.id } })
      return
    }
    if (command.type === 'task.accept_change') {
      const started = tasks.acceptChange(command.payload.changeRequestId, command.payload.changes)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: started.request.requestId, request: started.request })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: started })
      return
    }
    if (command.type === 'task.reject_change') {
      const resumed = tasks.rejectChange(command.payload.changeRequestId)
      if (resumed.request) {
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: resumed.request.requestId, request: resumed.request })
      }
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resumed.detail })
      return
    }
    if (command.type === 'provider.failed') {
      if (employeeTransport.fail(command.payload.providerRequestId, command.payload.code)) {
        respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
        return
      }
      if (pendingConversations.has(command.payload.providerRequestId)) {
        pendingConversations.delete(command.payload.providerRequestId)
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: command.payload.providerRequestId, event: { type: 'failed', requestId: command.payload.providerRequestId, code: command.payload.code } })
      } else {
        if (!applyTaskProviderFailure(command.payload.providerRequestId, command.payload.code)) {
          const testRun = employees.handleProviderFailure(command.payload.providerRequestId, command.payload.code)
          if (!testRun) throw new Error('unknown_provider_request')
          emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.employee.event', requestId: command.payload.providerRequestId, event: { type: 'test_failed', employeeId: testRun.employeeId, testRunId: testRun.id, code: command.payload.code } })
        }
      }
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    if (command.type !== 'provider.event') throw new Error('unexpected_command')
    if (employeeTransport.accept(command.payload.providerRequestId, command.payload.event)) {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    if (command.payload.event.type === 'tool_proposal') {
      await applyTaskToolProposal(command.payload.providerRequestId, command.payload.event)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    if (applyTaskProviderEvent(command.payload.providerRequestId, command.payload.event)) {
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    const employeeTestRun = employees.handleProviderEvent(command.payload.providerRequestId, command.payload.event)
    if (employeeTestRun) {
      if (employeeTestRun.nextRequest) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: employeeTestRun.nextRequest.requestId, request: employeeTestRun.nextRequest })
      const employeeEventType = employeeTestRun.status === 'completed' ? 'test_completed' : employeeTestRun.status === 'failed' ? 'test_failed' : 'test_progress'
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.employee.event', requestId: command.payload.providerRequestId, event: { type: employeeEventType, employeeId: employeeTestRun.employeeId, testRunId: employeeTestRun.id, code: employeeTestRun.failureCode } })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    applyConversationProviderEvent(command.payload.providerRequestId, command.payload.event)
    respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
  } catch (error) {
    const response: RuntimeResponse = {
      schemaVersion: SIDECAR_PROTOCOL_VERSION,
      requestId,
      ok: false,
      error: { code: error instanceof Error ? error.message.split(':')[0] : 'runtime_error', message: 'Runtime rejected the command' }
    }
    respond(response)
  }
})

tasks.reconcileFailedRunToolActions()
parentPort.postMessage({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.ready', health: kernel.recover() })
setTimeout(async () => {
  try {
    const sdkRecoveredRunIds = await teamExecutor.recover()
    for (const request of tasks.recoverPendingRequests(new Set(), sdkRecoveredRunIds)) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: request.requestId, request })
  } catch (error) {
    console.error('[startup-recovery]', error instanceof Error ? error.stack ?? error.message : String(error))
  }
}, 0)

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    store.close()
    process.exit(0)
  })
}
