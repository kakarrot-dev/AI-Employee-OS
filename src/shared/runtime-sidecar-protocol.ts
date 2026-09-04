import type { RuntimeHealth } from '../runtime/kernel'
import type { StoredAuditEvent } from '../runtime/store'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import type { Conversation, Message, MessageAttachmentReference } from '../runtime/domain'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary } from './employee-contract'
import type { FormalTaskDetail, TaskDraftInput } from '../runtime/task-service'
import type { ResourceCatalog } from '../runtime/resource-service'
import type { MemoryHealth, MemoryQueueItem, MemorySearchResult, MemoryView } from '../runtime/memory-service'
import type { SupervisorConfigInput, SupervisorConfigView } from './supervisor-contract'
import type { UsageSummaryView } from './usage-contract'

export const SIDECAR_PROTOCOL_VERSION = 1 as const

export type RuntimeCommand =
  | { schemaVersion: 1; requestId: string; type: 'health'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'recover'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'shutdown.prepare'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'events.after'; payload: { sequence: number; limit: number } }
  | { schemaVersion: 1; requestId: string; type: 'conversation.list'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'conversation.create'; payload: { conversationId: string } }
  | { schemaVersion: 1; requestId: string; type: 'conversation.archive'; payload: { conversationId: string } }
  | { schemaVersion: 1; requestId: string; type: 'conversation.send'; payload: { conversationId: string; messageId: string; text: string; directories: string[]; attachments: MessageAttachmentReference[] } }
  | { schemaVersion: 1; requestId: string; type: 'conversation.history'; payload: { conversationId: string } }
  | { schemaVersion: 1; requestId: string; type: 'conversation.cancel'; payload: { providerRequestId: string } }
  | { schemaVersion: 1; requestId: string; type: 'supervisor.get'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'supervisor.update'; payload: { input: SupervisorConfigInput } }
  | { schemaVersion: 1; requestId: string; type: 'employee.list'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'employee.capabilities'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'employee.detail'; payload: { employeeId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.create'; payload: { input: EmployeeDraftInput } }
  | { schemaVersion: 1; requestId: string; type: 'employee.begin_edit'; payload: { employeeId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.save_draft'; payload: { employeeId: string; input: EmployeeDraftInput } }
  | { schemaVersion: 1; requestId: string; type: 'employee.test_case.add'; payload: { employeeId: string; input: { name: string; prompt: string; acceptanceCriteria: string; expectedContains?: string } } }
  | { schemaVersion: 1; requestId: string; type: 'employee.test.run'; payload: { employeeId: string; testCaseId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.test.confirm'; payload: { employeeId: string; testRunId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.publish'; payload: { employeeId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.rollback'; payload: { employeeId: string; versionId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.disable'; payload: { employeeId: string; disabled: boolean } }
  | { schemaVersion: 1; requestId: string; type: 'employee.archive'; payload: { employeeId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.restore'; payload: { employeeId: string } }
  | { schemaVersion: 1; requestId: string; type: 'employee.delete'; payload: { employeeId: string } }
  | { schemaVersion: 1; requestId: string; type: 'task.list'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'task.create_draft'; payload: { input: TaskDraftInput } }
  | { schemaVersion: 1; requestId: string; type: 'task.update_draft'; payload: { draftId: string; changes: Pick<TaskDraftInput, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'> } }
  | { schemaVersion: 1; requestId: string; type: 'task.start'; payload: { draftId: string } }
  | { schemaVersion: 1; requestId: string; type: 'task.retry'; payload: { taskId: string } }
  | { schemaVersion: 1; requestId: string; type: 'task.request_change'; payload: { taskId: string; sourceMessageId: string; requestedDiff: Record<string, unknown> } }
  | { schemaVersion: 1; requestId: string; type: 'task.accept_change'; payload: { changeRequestId: string; changes: Pick<TaskDraftInput, 'goal' | 'acceptanceCriteria' | 'employeeVersionIds' | 'directories'> } }
  | { schemaVersion: 1; requestId: string; type: 'task.reject_change'; payload: { changeRequestId: string } }
  | { schemaVersion: 1; requestId: string; type: 'resource.list'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'resource.probe'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'usage.summary'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'tool.approve'; payload: { actionId: string } }
  | { schemaVersion: 1; requestId: string; type: 'tool.reject'; payload: { actionId: string } }
  | { schemaVersion: 1; requestId: string; type: 'tool.resolve_unknown'; payload: { actionId: string; outcome: 'succeeded' | 'failed'; evidence: Record<string, unknown> } }
  | { schemaVersion: 1; requestId: string; type: 'memory.status' | 'memory.model.download' | 'memory.queue.list' | 'memory.embeddings.migrate'; payload: Record<string, never> }
  | { schemaVersion: 1; requestId: string; type: 'memory.list'; payload: { scopeType?: 'global' | 'employee' | 'task'; scopeId?: string; category?: string; status?: string } }
  | { schemaVersion: 1; requestId: string; type: 'memory.search'; payload: { query: string; allowedScopes: Array<{ type: 'global' | 'employee' | 'task'; id: string }>; categories?: string[]; tags?: string[]; limit?: number; tokenBudget?: number } }
  | { schemaVersion: 1; requestId: string; type: 'memory.update'; payload: { id: string; changes: Record<string, unknown> } }
  | { schemaVersion: 1; requestId: string; type: 'memory.disable' | 'memory.restore' | 'memory.delete'; payload: { id: string } }
  | { schemaVersion: 1; requestId: string; type: 'memory.queue.accept' | 'memory.queue.dismiss'; payload: { id: string } }
  | { schemaVersion: 1; requestId: string; type: 'memory.resolve_conflict'; payload: { chosenId: string } }
  | { schemaVersion: 1; requestId: string; type: 'provider.event'; payload: { providerRequestId: string; event: ProviderEvent } }
  | { schemaVersion: 1; requestId: string; type: 'provider.failed'; payload: { providerRequestId: string; code: string } }

export type RuntimeCommandResult = RuntimeHealth | StoredAuditEvent[] | Conversation | Conversation[] | Message[] | SupervisorConfigView | EmployeeSummary[] | EmployeeDetail | AgentCapabilityVersionView[] | FormalTaskDetail | FormalTaskDetail[] | ResourceCatalog | MemoryHealth | MemoryView | MemoryView[] | MemorySearchResult[] | MemoryQueueItem[] | UsageSummaryView | { migrated: number } | { deleted: true; memoryId: string; externalBackupsExcluded: true } | { dismissed: true; queueId: string } | { archived: true; conversationId: string } | { ready: boolean; activeRunIds: string[] } | { accepted: true; requestId?: string; testRunId?: string; changeRequestId?: string }

export type RuntimeResponse =
  | { schemaVersion: 1; requestId: string; ok: true; result: RuntimeCommandResult }
  | { schemaVersion: 1; requestId: string; ok: false; error: { code: string; message: string } }

export interface RuntimeReadyEvent {
  schemaVersion: 1
  type: 'runtime.ready'
  health: RuntimeHealth
}

export type RuntimeOutboundEvent =
  | { schemaVersion: 1; type: 'runtime.provider.execute'; requestId: string; request: ProviderRequest }
  | { schemaVersion: 1; type: 'runtime.provider.cancel'; requestId: string; providerRequestId: string }
  | { schemaVersion: 1; type: 'runtime.conversation.event'; requestId: string; event: ProviderEvent | { type: 'failed'; requestId: string; code: string } }
  | { schemaVersion: 1; type: 'runtime.employee.event'; requestId: string; event: { type: 'test_progress' | 'test_completed' | 'test_failed'; employeeId: string; testRunId: string; code?: string } }
  | { schemaVersion: 1; type: 'runtime.task.event'; requestId: string; event: { type: 'progress' | 'assignment_completed' | 'delivery_completed' | 'needs_attention' | 'failed'; taskId: string; runId?: string } }

export function parseRuntimeCommand(value: unknown): RuntimeCommand {
  if (!value || typeof value !== 'object') throw new Error('invalid_command')
  const command = value as Partial<RuntimeCommand>
  if (command.schemaVersion !== SIDECAR_PROTOCOL_VERSION) throw new Error('unsupported_schema_version')
  if (typeof command.requestId !== 'string' || !command.requestId) throw new Error('invalid_request_id')
  if (!['health', 'recover', 'shutdown.prepare', 'events.after', 'conversation.list', 'conversation.create', 'conversation.archive', 'conversation.send', 'conversation.history', 'conversation.cancel', 'supervisor.get', 'supervisor.update', 'employee.list', 'employee.capabilities', 'employee.detail', 'employee.create', 'employee.begin_edit', 'employee.save_draft', 'employee.test_case.add', 'employee.test.run', 'employee.test.confirm', 'employee.publish', 'employee.rollback', 'employee.disable', 'employee.archive', 'employee.restore', 'employee.delete', 'task.list', 'task.create_draft', 'task.update_draft', 'task.start', 'task.retry', 'task.request_change', 'task.accept_change', 'task.reject_change', 'resource.list', 'resource.probe', 'usage.summary', 'tool.approve', 'tool.reject', 'tool.resolve_unknown', 'memory.status', 'memory.model.download', 'memory.list', 'memory.search', 'memory.update', 'memory.disable', 'memory.restore', 'memory.resolve_conflict', 'memory.delete', 'memory.queue.list', 'memory.queue.accept', 'memory.queue.dismiss', 'memory.embeddings.migrate', 'provider.event', 'provider.failed'].includes(String(command.type))) throw new Error('unknown_command')
  if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) throw new Error('invalid_payload')
  if (command.type === 'events.after') {
    const payload = command.payload as { sequence?: unknown; limit?: unknown }
    if (!Number.isSafeInteger(payload.sequence) || Number(payload.sequence) < 0) throw new Error('invalid_event_sequence')
    if (!Number.isSafeInteger(payload.limit) || Number(payload.limit) < 1 || Number(payload.limit) > 500) throw new Error('invalid_event_limit')
  } else if (command.type === 'health' || command.type === 'recover' || command.type === 'shutdown.prepare' || command.type === 'conversation.list' || command.type === 'supervisor.get' || command.type === 'employee.list' || command.type === 'employee.capabilities' || command.type === 'task.list' || command.type === 'resource.list' || command.type === 'resource.probe' || command.type === 'usage.summary' || command.type === 'memory.status' || command.type === 'memory.model.download' || command.type === 'memory.queue.list' || command.type === 'memory.embeddings.migrate') {
    if (Object.keys(command.payload).length !== 0) throw new Error('unexpected_payload')
  } else if (command.type === 'conversation.create' || command.type === 'conversation.archive') {
    if (typeof (command.payload as { conversationId?: unknown }).conversationId !== 'string') throw new Error('invalid_conversation_id')
  } else if (command.type === 'conversation.send') {
    const payload = command.payload as { conversationId?: unknown; messageId?: unknown; text?: unknown; directories?: unknown; attachments?: unknown }
    if (typeof payload.conversationId !== 'string' || typeof payload.messageId !== 'string' || typeof payload.text !== 'string' || payload.text.length < 1 || payload.text.length > 100_000) throw new Error('invalid_conversation_message')
    if (!Array.isArray(payload.directories) || payload.directories.length > 16 || new Set(payload.directories).size !== payload.directories.length || payload.directories.some((directory) => typeof directory !== 'string' || !directory.startsWith('/') || directory.length > 4_096)) throw new Error('invalid_conversation_directories')
    if (!Array.isArray(payload.attachments) || payload.attachments.length > 8 || payload.attachments.some((attachment) => {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return true
      const item = attachment as Record<string, unknown>
      return typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.path !== 'string' || !item.path.startsWith('/') || typeof item.mediaType !== 'string' || typeof item.size !== 'number' || item.size < 1 || item.size > 25 * 1024 * 1024 || typeof item.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(item.sha256)
    })) throw new Error('invalid_conversation_attachments')
  } else if (command.type === 'conversation.history') {
    if (typeof (command.payload as { conversationId?: unknown }).conversationId !== 'string') throw new Error('invalid_conversation_id')
  } else if (command.type === 'conversation.cancel') {
    if (typeof (command.payload as { providerRequestId?: unknown }).providerRequestId !== 'string') throw new Error('invalid_provider_request_id')
  } else if (command.type === 'supervisor.update') {
    if (!(command.payload as { input?: unknown }).input || typeof (command.payload as { input?: unknown }).input !== 'object' || Array.isArray((command.payload as { input?: unknown }).input)) throw new Error('invalid_supervisor_configuration')
  } else if (String(command.type).startsWith('employee.')) {
    if (command.type === 'employee.create') {
      if (!(command.payload as { input?: unknown }).input || typeof (command.payload as { input?: unknown }).input !== 'object') throw new Error('invalid_employee_input')
    } else {
      if (typeof (command.payload as { employeeId?: unknown }).employeeId !== 'string') throw new Error('invalid_employee_id')
    }
  } else if (String(command.type).startsWith('task.')) {
    if (command.type === 'task.create_draft') {
      if (!(command.payload as { input?: unknown }).input || typeof (command.payload as { input?: unknown }).input !== 'object') throw new Error('invalid_task_input')
    } else if ((command.type === 'task.update_draft' || command.type === 'task.start') && typeof (command.payload as { draftId?: unknown }).draftId !== 'string') throw new Error('invalid_task_draft_id')
    else if (command.type === 'task.retry' && typeof (command.payload as { taskId?: unknown }).taskId !== 'string') throw new Error('invalid_task_id')
  } else if (String(command.type).startsWith('tool.')) {
    const payload = command.payload as { actionId?: unknown; outcome?: unknown; evidence?: unknown }
    if (typeof payload.actionId !== 'string') throw new Error('invalid_tool_action_id')
    if (command.type === 'tool.resolve_unknown' && (!['succeeded', 'failed'].includes(String(payload.outcome)) || !payload.evidence || typeof payload.evidence !== 'object' || Array.isArray(payload.evidence))) throw new Error('invalid_tool_resolution')
  } else if (String(command.type).startsWith('memory.')) {
    const payload = command.payload as Record<string, unknown>
    const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128
    const scopeTypes = ['global', 'employee', 'task']
    const categories = ['preference', 'fact', 'rule', 'knowledge', 'experience', 'summary']
    const statuses = ['active', 'pending_verification', 'conflicted', 'disabled']
    if (command.type === 'memory.list') {
      if (Object.keys(payload).some((key) => !['scopeType', 'scopeId', 'category', 'status'].includes(key)) || (payload.scopeType !== undefined && !scopeTypes.includes(String(payload.scopeType))) || (payload.scopeId !== undefined && !validId(payload.scopeId)) || (payload.category !== undefined && !categories.includes(String(payload.category))) || (payload.status !== undefined && !statuses.includes(String(payload.status)))) throw new Error('invalid_memory_filters')
    }
    if (command.type === 'memory.search') {
      const scopes = payload.allowedScopes
      if (typeof payload.query !== 'string' || payload.query.length < 1 || payload.query.length > 20_000 || !Array.isArray(scopes) || scopes.length < 1 || scopes.length > 16 || scopes.some((scope) => !scope || typeof scope !== 'object' || !scopeTypes.includes(String((scope as Record<string, unknown>).type)) || !validId((scope as Record<string, unknown>).id))) throw new Error('invalid_memory_search')
      if (payload.categories !== undefined && (!Array.isArray(payload.categories) || payload.categories.some((category) => !categories.includes(String(category))))) throw new Error('invalid_memory_search')
      if (payload.tags !== undefined && (!Array.isArray(payload.tags) || payload.tags.length > 32 || payload.tags.some((tag) => typeof tag !== 'string' || tag.length > 128))) throw new Error('invalid_memory_search')
      if (payload.limit !== undefined && (!Number.isSafeInteger(payload.limit) || Number(payload.limit) < 1 || Number(payload.limit) > 20)) throw new Error('invalid_memory_search')
      if (payload.tokenBudget !== undefined && (!Number.isSafeInteger(payload.tokenBudget) || Number(payload.tokenBudget) < 32 || Number(payload.tokenBudget) > 8192)) throw new Error('invalid_memory_search')
    }
    if (command.type === 'memory.update') {
      const changes = payload.changes as Record<string, unknown> | undefined
      if (!validId(payload.id) || !changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some((key) => !['scopeType', 'scopeId', 'category', 'content', 'tags'].includes(key))) throw new Error('invalid_memory_update')
    }
    if (['memory.disable', 'memory.restore', 'memory.delete'].includes(String(command.type)) && !validId(payload.id)) throw new Error('invalid_memory_id')
    if (['memory.queue.accept', 'memory.queue.dismiss'].includes(String(command.type)) && !validId(payload.id)) throw new Error('invalid_memory_queue_id')
    if (command.type === 'memory.resolve_conflict' && !validId(payload.chosenId)) throw new Error('invalid_memory_id')
  } else if (command.type === 'provider.event' || command.type === 'provider.failed') {
    if (typeof (command.payload as { providerRequestId?: unknown }).providerRequestId !== 'string') throw new Error('invalid_provider_request_id')
  } else {
    throw new Error('unexpected_payload')
  }
  return command as RuntimeCommand
}
