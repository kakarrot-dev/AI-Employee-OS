import { meetingGroupView, type MeetingStore } from './meeting/store'
import { normalizeEmployeeDraft, validateEmployeeDraft, type EmployeeDetail, type EmployeeDraftInput, type EmployeeSummary } from '../shared/employee-contract'
import { DEFAULT_SUPERVISOR_CONFIG, normalizeSupervisorConfig, validateSupervisorConfig, type SupervisorConfigView } from '../shared/supervisor-contract'
import type { ConversationMessageView, ConversationStreamEvent, EmployeeEvent, ProviderStatus, RuntimeStatus } from '../shared/runtime-contract'
import type { MemoryViewModel } from '../shared/memory-contract'
import type { FeishuConnectionStatus } from '../shared/connection-contract'
import { builtInCatalog, previewConversation, previewDate, previewHistory, previewTask } from './fixtures'

export type WebClientBridge = Window['aiEmployeeOS']
const now = (): string => new Date().toISOString()
const id = (): string => `web-preview-${crypto.randomUUID()}`
const copy = <T,>(value: T): T => structuredClone(value)
const unavailable = async (): Promise<never> => { throw new Error('Web 演示未连接真实服务，请在桌面客户端执行此操作。') }

function events<T>() {
  const listeners = new Set<(event: T) => void>()
  return {
    subscribe(listener: (event: T) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    emit(event: T) { listeners.forEach((listener) => listener(copy(event))) }
  }
}

/** In-memory UI preview. No network, credentials, model calls or local file paths. */
export function createPreviewBridge(meetings?: MeetingStore): WebClientBridge {
  const catalog = copy(builtInCatalog)
  let employees = catalog.employees
  let groups = meetings ? [copy(meetingGroupView), ...catalog.groups] : catalog.groups
  let conversations = [copy(previewConversation)]
  const histories = new Map<string, ConversationMessageView[]>([[previewConversation.id, copy(previewHistory)]])
  const conversationEvents = events<ConversationStreamEvent & { conversationId?: string }>()
  const employeeEvents = events<EmployeeEvent>()
  const pendingReplies = new Map<string, { timer: ReturnType<typeof setTimeout>; conversationId: string }>()
  let supervisor: SupervisorConfigView = { schemaVersion: 1, id: 'supervisor.local', createdAt: previewDate, updatedAt: previewDate, ...copy(DEFAULT_SUPERVISOR_CONFIG) }
  const runtimeStatus = (): RuntimeStatus => ({ state: 'connected', checkedAt: now(), message: '已连接浏览器演示适配器，未连接本机 Runtime' })
  const providerStatus = (): ProviderStatus => ({ state: 'stopped', credentialStatus: { deepseek: 'missing', poe: 'missing' }, models: [
    { provider: 'deepseek', modelId: 'deepseek-v4-pro', modality: 'text', verification: 'unverified' },
    { provider: 'poe', modelId: 'claude-sonnet-4.6', modality: 'text', verification: 'unverified' },
    { provider: 'poe', modelId: 'gpt-image-2', modality: 'image', verification: 'unverified' },
    { provider: 'poe', modelId: 'seedance-2.0', modality: 'video', verification: 'unverified' }
  ], checkedAt: now() })
  const feishuStatus = (): FeishuConnectionStatus => ({ provider: 'feishu', state: 'not_connected', checkedAt: now(), scopes: [], message: 'Web 演示未连接飞书' })
  const requireEmployee = (employeeId: string): EmployeeDetail => {
    const detail = employees.find((item) => item.employee.id === employeeId)
    if (!detail) throw new Error('employee_not_found')
    return detail
  }
  const requireConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('conversation_not_found')
    return conversation
  }
  const summary = (detail: EmployeeDetail): EmployeeSummary => {
    const version = detail.draft ?? detail.active
    return { id: detail.employee.id, name: version?.name ?? detail.employee.name, role: version?.role, avatarDataUrl: version?.avatarDataUrl, status: detail.status, activeVersionId: detail.active?.id, draftVersionId: detail.draft?.id, capabilityVersionIds: [...(version?.capabilityVersionIds ?? [])], activeCapabilityVersionIds: [...(detail.active?.capabilityVersionIds ?? [])] }
  }
  const validateDraft = (input: EmployeeDraftInput): EmployeeDraftInput => {
    const issues = validateEmployeeDraft(input)
    if (issues.length) throw new Error(issues[0].code)
    if (input.capabilityVersionIds.some((capabilityId) => !catalog.capabilities.some((item) => item.id === capabilityId))) throw new Error('invalid_capabilities')
    return normalizeEmployeeDraft(copy(input))
  }
  const beginEdit = (employeeId: string): EmployeeDetail => {
    const detail = requireEmployee(employeeId)
    if (!detail.draft) {
      if (!detail.active) throw new Error('employee_version_not_found')
      detail.draft = { ...copy(detail.active), id: id(), version: Math.max(...detail.versions.map((version) => version.version)) + 1, state: 'draft', createdAt: now(), testRunIds: [], publishedAt: undefined }
      detail.versions.push(detail.draft)
      detail.employee.draftVersionId = detail.draft.id
    }
    return detail
  }
  let memories: MemoryViewModel[] = [{ id: 'web-preview-memory', scopeType: 'global', scopeId: 'global', category: 'rule', version: 1, content: '演示记忆：交付前核对来源和完成证据。', tags: ['演示', '验收'], sourceRefs: [], indexVersion: 'web-preview', status: 'active', createdAt: previewDate, updatedAt: previewDate }]
  const requireMemory = (memoryId: string): MemoryViewModel => {
    const item = memories.find((memory) => memory.id === memoryId)
    if (!item) throw new Error('memory_not_found')
    return item
  }
  return {
    runtime: { getStatus: async () => runtimeStatus(), reconnect: async () => runtimeStatus(), onStatusChanged: () => () => undefined },
    provider: { getStatus: async () => providerStatus(), configurePoe: unavailable, verifyPoeModel: unavailable },
    conversation: {
      list: async () => copy(conversations.map((value) => meetings?.summary(value) ?? value)),
      create: async () => {
        const value = { id: id(), title: '新会话', preview: '尚无消息', updatedAt: now(), messageCount: 0 }
        conversations.unshift(value); histories.set(value.id, []); return copy(value)
      },
      archive: async (conversationId) => {
        requireConversation(conversationId)
        for (const [requestId, pending] of pendingReplies) {
          if (pending.conversationId === conversationId) { clearTimeout(pending.timer); pendingReplies.delete(requestId) }
        }
        meetings?.archive(conversationId)
        conversations = conversations.filter((item) => item.id !== conversationId)
        return { archived: true, conversationId }
      },
      history: async (conversationId) => { requireConversation(conversationId); return copy(histories.get(conversationId) ?? []) },
      send: async (conversationId, text) => {
        const conversation = requireConversation(conversationId)
        if (!text.trim()) throw new Error('请输入消息')
        const requestId = id(), messageId = id()
        const messages = histories.get(conversationId)!
        messages.push({ id: messageId, role: 'user', content: text, createdAt: now() })
        if (!conversation.messageCount) conversation.title = text.trim().slice(0, 32)
        conversation.messageCount = messages.length
        conversation.preview = text; conversation.updatedAt = now()
        pendingReplies.set(requestId, { conversationId, timer: setTimeout(() => {
          pendingReplies.delete(requestId)
          const content = meetings?.get(conversationId) ? '消息已记入当前会话。本演示按已提交的会议表单继续执行；这条消息不会更改会议安排，也不会调用模型或发送到飞书。' : '这是 Web 演示回复，用于展示消息交互。你的输入已保留在当前预览中；未调用模型、执行任务或向外部服务发送内容。'
          messages.push({ id: `stream:${requestId}`, role: 'assistant', content, createdAt: now() })
          conversation.messageCount = messages.length; conversation.preview = content; conversation.updatedAt = now()
          conversationEvents.emit({ type: 'output_delta', requestId, conversationId, delta: content })
          conversationEvents.emit({ type: 'completed', requestId, conversationId })
        }, 400) })
        return { accepted: true, requestId, messageId }
      },
      cancel: async (requestId) => {
        const pending = pendingReplies.get(requestId)
        if (pending) { clearTimeout(pending.timer); pendingReplies.delete(requestId); conversationEvents.emit({ type: 'completed', requestId, conversationId: pending.conversationId }) }
        return { accepted: true }
      },
      onEvent: conversationEvents.subscribe
    },
    attachment: { select: unavailable, importDropped: unavailable, open: unavailable, reveal: unavailable },
    supervisor: {
      get: async () => copy(supervisor),
      update: async (input) => {
        const issues = validateSupervisorConfig(input)
        if (issues.length) throw new Error(issues[0].message)
        supervisor = { ...supervisor, ...normalizeSupervisorConfig(copy(input)), updatedAt: now() }; return copy(supervisor)
      }
    },
    employee: {
      list: async () => employees.map(summary), capabilities: async () => copy(catalog.capabilities), detail: async (employeeId) => copy(requireEmployee(employeeId)),
      create: async (input) => {
        const normalized = validateDraft(input), employeeId = id(), versionId = id()
        const draft = { ...normalized, schemaVersion: 1 as const, id: versionId, employeeId, createdAt: now(), version: 1, state: 'draft' as const, testRunIds: [] }
        const detail: EmployeeDetail = { employee: { schemaVersion: 1, id: employeeId, createdAt: now(), name: draft.name, avatarDataUrl: draft.avatarDataUrl, draftVersionId: versionId, disabled: false, archived: false }, status: 'draft', draft, versions: [draft], testCases: [], testRuns: [], formalReferences: [] }
        employees.push(detail); return copy(detail)
      },
      beginEdit: async (employeeId) => copy(beginEdit(employeeId)),
      saveDraft: async (employeeId, input) => {
        const normalized = validateDraft(input), detail = beginEdit(employeeId)
        Object.assign(detail.draft!, normalized, { state: 'draft', testRunIds: [] })
        detail.employee.name = normalized.name; detail.employee.avatarDataUrl = normalized.avatarDataUrl
        return copy(detail)
      },
      addTestCase: async (employeeId, input) => {
        const detail = beginEdit(employeeId)
        if (!input.name.trim() || !input.prompt.trim() || !input.acceptanceCriteria.trim()) throw new Error('请填写完整测试用例')
        detail.testCases.push({ ...copy(input), schemaVersion: 1, id: id(), createdAt: now(), employeeId, employeeVersionId: detail.draft!.id })
        return copy(detail)
      },
      // The browser preview must never fabricate a passed test or published version.
      runTest: unavailable, confirmTest: unavailable, publish: unavailable, rollback: unavailable,
      setDisabled: async (employeeId, disabled) => {
        const detail = requireEmployee(employeeId)
        detail.employee.disabled = disabled; detail.status = detail.employee.archived ? 'archived' : disabled ? 'disabled' : detail.active ? 'active' : 'draft'
        return copy(detail)
      },
      archive: async (employeeId) => { const detail = requireEmployee(employeeId); detail.employee.archived = true; detail.status = 'archived'; groups.filter((group) => group.members.some((member) => member.employeeId === employeeId)).forEach((group) => { group.status = 'archived' }); return copy(detail) },
      restore: async (employeeId) => { const detail = requireEmployee(employeeId); detail.employee.archived = false; detail.status = detail.employee.disabled ? 'disabled' : detail.active ? 'active' : 'draft'; return copy(detail) },
      deleteDraft: async (employeeId) => {
        const detail = requireEmployee(employeeId)
        if (detail.active || detail.formalReferences.length) throw new Error('employee_has_history')
        employees = employees.filter((item) => item.employee.id !== employeeId); return { accepted: true }
      },
      onEvent: employeeEvents.subscribe
    },
    expertGroup: {
      list: async () => copy(groups.filter((group) => group.status !== 'archived').map((group) => ({ ...group, members: group.members.map((member) => {
        const employee = employees.find((item) => item.employee.id === member.employeeId)
        return employee ? { ...member, name: employee.active?.name ?? employee.employee.name, status: employee.status } : group.id === meetingGroupView.id ? member : { ...member, status: 'archived' as const }
      }) }))),
      archive: async (groupId) => {
        const group = groups.find((item) => item.id === groupId)
        if (!group) throw new Error('expert_group_not_found')
        group.status = 'archived'; return copy(group)
      }
    },
    task: {
      list: async () => conversations.some((item) => item.id === previewConversation.id) ? [copy(previewTask)] : [],
      outputDirectory: async () => '', openArtifact: unavailable, revealArtifact: unavailable,
      createDraft: unavailable, updateDraft: unavailable, start: unavailable, retry: unavailable, requestChange: unavailable,
      acceptChange: unavailable, rejectChange: unavailable, approveTool: unavailable, rejectTool: unavailable, resolveTool: unavailable,
      onEvent: () => () => undefined
    },
    resource: { list: async () => copy(catalog.resources), probe: unavailable },
    memory: {
      status: async () => ({ state: 'ready', model: 'Web 演示（未加载 Embedding 模型）', dimensions: 512, modelSha256: 'preview', embedding: 'bm25_only', memoryCount: memories.length, pendingQueueCount: 0, checkedAt: now() }),
      list: async (filters) => copy(memories.filter((item) => !filters || Object.entries(filters).every(([key, value]) => value === undefined || item[key as keyof MemoryViewModel] === value))),
      search: unavailable, downloadModel: unavailable, migrateEmbeddings: unavailable,
      update: async (memoryId, changes) => { const item = requireMemory(memoryId); Object.assign(item, copy(changes), { version: item.version + 1, updatedAt: now() }); return copy(item) },
      disable: async (memoryId) => { const item = requireMemory(memoryId); item.status = 'disabled'; return copy(item) },
      restore: async (memoryId) => { const item = requireMemory(memoryId); item.status = 'active'; return copy(item) },
      resolveConflict: unavailable,
      permanentlyDelete: async (memoryId) => { requireMemory(memoryId); memories = memories.filter((item) => item.id !== memoryId); return { deleted: true, memoryId, externalBackupsExcluded: true } },
      queue: async () => [], acceptQueueItem: unavailable, dismissQueueItem: unavailable
    },
    usage: { summary: async () => ({ requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, amountUsdMicros: null, checkedAt: now(), models: [] }) },
    connection: { getFeishuStatus: async () => feishuStatus(), openFeishuDeveloperConsole: unavailable, connectFeishu: unavailable, cancelFeishuAuthorization: async () => feishuStatus(), disconnectFeishu: unavailable }
  }
}
