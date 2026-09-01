import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { SIDECAR_PROTOCOL_VERSION, parseRuntimeCommand, type RuntimeOutboundEvent, type RuntimeResponse } from '../shared/runtime-sidecar-protocol'
import type { BudgetLedgerEntry, Conversation, Message, Run, RunGrant } from './domain'
import { EmployeeService } from './employee-service'
import { TaskService } from './task-service'
import { ResourceService } from './resource-service'
import { ToolGateway } from './tool-gateway'
import { managedResearchRunner } from './managed-research-runner'
import { ManagedResearchService } from './managed-research-service'
import { DeliveryExporter } from './delivery-exporter'
import { MemoryService, type MemoryCategory, type MemoryStatus, type MemoryView } from './memory-service'

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
const toolGateway = new ToolGateway(kernel, resources, managedResearchRunner)
const research = new ManagedResearchService(kernel, toolGateway)
const workerPython = requiredPathArgument('worker-python')
const workerScript = requiredPathArgument('worker-script')
const checkpointDirectory = requiredPathArgument('checkpoint-directory')
const exportDirectory = requiredPathArgument('export-directory')
const memory = new MemoryService({ pythonPath: requiredPathArgument('memory-python'), scriptPath: requiredPathArgument('memory-script'), databasePath: requiredPathArgument('memory-database'), modelCachePath: requiredPathArgument('memory-model-cache'), keychainHelperPath: requiredPathArgument('memory-keychain-helper') })
const deliveryExporter = new DeliveryExporter(kernel, exportDirectory)
const tasks = new TaskService(kernel, employees, (request) => memory.search(request), ({ assignment, revision, version, output, actions }) => {
  if (!version.capabilityVersionIds.includes('capability.managed-research.v1')) return { text: output }
  const bundle = research.createBundle({ taskId: revision.taskId, runId: assignment.runId, assignmentId: assignment.id, employeeVersionId: version.id, question: revision.goal, githubQuery: '', feedUrl: '' }, actions)
  const handoff = { schemaVersion: 1, type: 'ResearchHandoff', researchBundleId: bundle.id, contentHash: bundle.contentHash, question: bundle.question, claims: bundle.claims, conflicts: bundle.conflicts, informationGaps: bundle.informationGaps, sources: bundle.items.map((item, index) => ({ index, sourceType: item.sourceType, title: item.title, url: item.url, publishedAt: item.publishedAt, summary: item.summary, contentHash: item.contentHash, trust: item.trust, injectionSignals: item.injectionSignals })), researcherSynthesis: output }
  return { text: JSON.stringify(handoff), researchBundleId: bundle.id }
}, (detail) => deliveryExporter.materialize(detail))

function enqueueMemorySafely(input: Parameters<MemoryService['enqueueAsync']>[0]): void {
  void memory.enqueueAsync(input).catch(() => { /* memory processing must not fail the primary conversation or task */ })
}

function validateDeepAgentHandoff(runId: string, assignmentId: string, employeeOutput: string): Record<string, unknown> {
  const run = store.get<Run>('Run', runId)
  const grant = run && store.get<RunGrant>('RunGrant', run.runGrantId)
  if (!run || !grant) throw new Error('run_grant_not_found')
  const allowedToolVersionIds = [...grant.resourceScope.toolVersionIds].sort()
  const child = spawnSync(workerPython, [workerScript, 'handoff', checkpointDirectory], {
    input: JSON.stringify({ runId, assignmentId, employeeOutput, allowedToolVersionIds }),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1_000_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' }
  })
  if (child.error || child.status !== 0) throw new Error('deep_agents_worker_failed')
  const result = JSON.parse(child.stdout) as Record<string, unknown>
  const expectedEmployeeTools = allowedToolVersionIds.length > 0 ? '["propose_tool_action"]' : '[]'
  if (result.schemaVersion !== 1 || result.runId !== runId || result.assignmentId !== assignmentId || JSON.stringify(result.rootTools) !== '["task"]' || JSON.stringify(result.employeeTools) !== expectedEmployeeTools || JSON.stringify(result.allowedToolVersionIds) !== JSON.stringify(allowedToolVersionIds) || result.proposalOnly !== true || JSON.stringify(result.next) !== '["model"]') throw new Error('deep_agents_worker_contract_rejected')
  return result
}
const pendingConversations = new Map<string, { conversationId: string; assistantMessageId: string; text: string; providerRequestId?: string }>()

function respond(response: RuntimeResponse): void {
  parentPort.postMessage(response)
}

function emit(event: RuntimeOutboundEvent): void {
  parentPort.postMessage(event)
}

parentPort.on('message', async (event) => {
  let requestId = 'unknown'
  try {
    const command = parseRuntimeCommand(event.data)
    requestId = command.requestId
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
    if (command.type === 'conversation.history') {
      const messages = store.list<Message>('Message').filter((message) => message.conversationId === command.payload.conversationId)
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: messages })
      return
    }
    if (command.type === 'conversation.send') {
      const existingConversation = store.get<Conversation>('Conversation', command.payload.conversationId)
      if (!existingConversation) {
        const conversation: Conversation = { schemaVersion: 1, id: command.payload.conversationId, createdAt: new Date().toISOString(), title: command.payload.text.slice(0, 36), archived: false }
        kernel.save({ entityType: 'Conversation', entity: conversation, immutable: false }, 'conversation.created', {})
      }
      const userMessage: Message = { schemaVersion: 1, id: command.payload.messageId, createdAt: new Date().toISOString(), conversationId: command.payload.conversationId, role: 'user', content: command.payload.text }
      kernel.save({ entityType: 'Message', entity: userMessage, immutable: true }, 'message.created', { role: 'user' })
      pendingConversations.set(requestId, { conversationId: command.payload.conversationId, assistantMessageId: randomUUID(), text: '' })
      emit({
        schemaVersion: SIDECAR_PROTOCOL_VERSION,
        type: 'runtime.provider.execute',
        requestId,
        request: { requestId, provider: 'deepseek', modelId: 'deepseek-v4-pro', input: command.payload.text, maxOutputTokens: 512, stream: true }
      })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }
    if (command.type === 'conversation.cancel') {
      if (!pendingConversations.has(command.payload.providerRequestId)) throw new Error('unknown_provider_request')
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.cancel', requestId, providerRequestId: command.payload.providerRequestId })
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
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: employees.archive(command.payload.employeeId) })
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
    if (command.type === 'memory.embeddings.migrate') { respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: memory.migrateEmbeddings() }); return }
    if (command.type === 'tool.approve' || command.type === 'tool.reject' || command.type === 'tool.resolve_unknown') {
      const action = command.type === 'tool.resolve_unknown'
        ? toolGateway.resolveUnknown(command.payload.actionId, command.payload.outcome, command.payload.evidence)
        : await toolGateway.decide(command.payload.actionId, command.type === 'tool.approve')
      let resumed = tasks.resumeAfterTool(action)
      if (resumed.request) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: resumed.request.requestId, request: resumed.request })
      else resumed = { detail: tasks.settleToolGate(action.runId) }
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
        if (resumed.request.outputSchema?.name === 'manager_review' && !resumed.detail.checkpoints.some((checkpoint) => checkpoint.phase === 'deep_agents_safe_pause')) {
          try {
            const assignment = resumed.detail.assignments.at(-1)!
            const evidence = validateDeepAgentHandoff(resumed.detail.run!.id, assignment.id, assignment.output ?? '')
            tasks.recordWorkerCheckpoint(resumed.detail.run!.id, assignment.id, evidence)
          } catch (error) {
            const failed = tasks.failRun(resumed.detail.run!.id, error instanceof Error ? error.message : 'deep_agents_worker_failed')
            respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: failed })
            return
          }
        }
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: resumed.request.requestId, request: resumed.request })
      }
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: resumed.detail })
      return
    }
    if (command.type === 'provider.failed') {
      if (pendingConversations.has(command.payload.providerRequestId)) {
        pendingConversations.delete(command.payload.providerRequestId)
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: command.payload.providerRequestId, event: { type: 'failed', requestId: command.payload.providerRequestId, code: command.payload.code } })
      } else {
        const taskResult = tasks.handleProviderFailure(command.payload.providerRequestId, command.payload.code)
        if (taskResult) {
          const output = taskResult.detail.assignments.map((assignment) => assignment.output ?? '').filter(Boolean).join('\n')
          enqueueMemorySafely({ sourceType: 'task', sourceRef: `task:${taskResult.detail.task!.id}`, scopeType: 'task', scopeId: taskResult.detail.task!.id, content: `任务失败经验：${command.payload.code}\n${output}`.slice(0, 50_000) })
          emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: command.payload.providerRequestId, event: { type: 'failed', taskId: taskResult.detail.task!.id, runId: taskResult.detail.run?.id } })
        } else {
          const testRun = employees.handleProviderFailure(command.payload.providerRequestId, command.payload.code)
          if (!testRun) throw new Error('unknown_provider_request')
          emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.employee.event', requestId: command.payload.providerRequestId, event: { type: 'test_failed', employeeId: testRun.employeeId, testRunId: testRun.id, code: command.payload.code } })
        }
      }
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    if (command.type !== 'provider.event') throw new Error('unexpected_command')

    if (command.payload.event.type === 'tool_proposal') {
      const proposal = tasks.toolProposalContext(command.payload.providerRequestId, command.payload.event)
      const action = await toolGateway.propose(proposal)
      const detail = tasks.attachToolAction(proposal.assignmentId, action.id)
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: command.payload.providerRequestId, event: { type: ['pending', 'blocked', 'result_unknown'].includes(action.state) ? 'needs_attention' : 'progress', taskId: detail.task!.id, runId: detail.run?.id } })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    const taskResult = tasks.handleProviderEvent(command.payload.providerRequestId, command.payload.event)
    if (taskResult) {
      if (taskResult.event === 'assignment_completed' && !taskResult.request && taskResult.detail.handoffs.at(-1)?.toSupervisor) {
        try {
          const assignment = taskResult.detail.assignments.at(-1)!
          const evidence = validateDeepAgentHandoff(taskResult.detail.run!.id, assignment.id, assignment.output ?? '')
          tasks.recordWorkerCheckpoint(taskResult.detail.run!.id, assignment.id, evidence)
          const managerRequest = tasks.beginManagerReview(taskResult.detail.run!.id)
          emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: managerRequest.requestId, request: managerRequest })
        } catch (error) {
          const failed = tasks.failRun(taskResult.detail.run!.id, error instanceof Error ? error.message : 'deep_agents_worker_failed')
          emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: command.payload.providerRequestId, event: { type: 'failed', taskId: failed.task!.id, runId: failed.run?.id } })
          respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
          return
        }
      } else if (taskResult.request) {
        emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: taskResult.request.requestId, request: taskResult.request })
      }
      if (taskResult.event === 'delivery_completed') {
        const output = taskResult.detail.assignments.map((assignment) => assignment.output ?? '').filter(Boolean).join('\n')
        enqueueMemorySafely({ sourceType: 'task', sourceRef: `task:${taskResult.detail.task!.id}`, scopeType: 'task', scopeId: taskResult.detail.task!.id, content: `目标：${taskResult.detail.revision!.goal}\n结果：${output}`.slice(0, 50_000) })
      }
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.task.event', requestId: command.payload.providerRequestId, event: { type: taskResult.event, taskId: taskResult.detail.task!.id, runId: taskResult.detail.run?.id } })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    const employeeTestRun = employees.handleProviderEvent(command.payload.providerRequestId, command.payload.event)
    if (employeeTestRun) {
      emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.employee.event', requestId: command.payload.providerRequestId, event: { type: command.payload.event.type === 'completed' ? 'test_completed' : 'test_progress', employeeId: employeeTestRun.employeeId, testRunId: employeeTestRun.id } })
      respond({ schemaVersion: SIDECAR_PROTOCOL_VERSION, requestId, ok: true, result: { accepted: true } })
      return
    }

    const pending = pendingConversations.get(command.payload.providerRequestId)
    if (!pending) throw new Error('unknown_provider_request')
    const providerEvent = command.payload.event
    if (providerEvent.type === 'output_delta') pending.text += providerEvent.delta
    if (providerEvent.type === 'completed') pending.providerRequestId = providerEvent.providerRequestId
    if (providerEvent.type === 'usage') {
      const ledger: BudgetLedgerEntry = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), runId: `conversation:${pending.conversationId}`, requestId: command.payload.providerRequestId, provider: 'deepseek', modelId: 'deepseek-v4-pro', inputTokens: providerEvent.inputTokens, outputTokens: providerEvent.outputTokens, amountUsdMicros: 0, source: 'provider_actual' }
      kernel.save({ entityType: 'BudgetLedgerEntry', entity: ledger, immutable: true }, 'provider.usage.recorded', { inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens, source: ledger.source })
    }
    emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.conversation.event', requestId: command.payload.providerRequestId, event: providerEvent })
    if (providerEvent.type === 'completed') {
      const assistantMessage: Message = { schemaVersion: 1, id: pending.assistantMessageId, createdAt: new Date().toISOString(), conversationId: pending.conversationId, role: 'assistant', content: pending.text, provider: 'deepseek', modelId: 'deepseek-v4-pro', providerRequestId: pending.providerRequestId }
      kernel.save({ entityType: 'Message', entity: assistantMessage, immutable: true }, 'message.created', { role: 'assistant', provider: 'deepseek', modelId: 'deepseek-v4-pro' })
      const lastUser = store.list<Message>('Message').filter((message) => message.conversationId === pending.conversationId && message.role === 'user').at(-1)
      enqueueMemorySafely({ sourceType: 'conversation', sourceRef: `conversation:${pending.conversationId}:message:${assistantMessage.id}`, scopeType: 'global', scopeId: 'global:local-owner', content: `${lastUser?.content ?? ''}\n${assistantMessage.content}`.trim().slice(0, 50_000) })
      pendingConversations.delete(command.payload.providerRequestId)
    }
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

parentPort.postMessage({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.ready', health: kernel.recover() })
setTimeout(() => {
  for (const detail of tasks.pendingHarnessHandoffs()) {
    try {
      const assignment = detail.assignments.at(-1)!
      tasks.recordWorkerCheckpoint(detail.run!.id, assignment.id, validateDeepAgentHandoff(detail.run!.id, assignment.id, assignment.output ?? ''))
    } catch (error) {
      tasks.failRun(detail.run!.id, error instanceof Error ? error.message : 'deep_agents_worker_failed')
    }
  }
  for (const request of tasks.recoverPendingRequests()) emit({ schemaVersion: SIDECAR_PROTOCOL_VERSION, type: 'runtime.provider.execute', requestId: request.requestId, request })
}, 0)

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    store.close()
    process.exit(0)
  })
}
