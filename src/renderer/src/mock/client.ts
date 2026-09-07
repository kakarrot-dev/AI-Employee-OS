import type { AttachmentView, ConversationStreamEvent, EmployeeEvent, EmployeeSummary, TaskEvent } from '../../../shared/runtime-contract'
import { normalizeEmployeeDraft, validateEmployeeDraft } from '../../../shared/employee-contract'
import type { TaskDetailView } from '../../../shared/task-contract'
import { FEISHU_DOCUMENT_SCOPES } from '../../../shared/connection-contract'
import { capabilities, catalog, deliver, fixtures, id, makeEmployee, makeTask, timestamp, type MockState, type Scenario } from './fixtures'
export const MOCK_STORAGE_KEY = 'ai-employee-os.prototype.mock.v1'
export type PreviewFile = { name: string; text?: string; url?: string; location?: boolean }
type Options = { storage?: Pick<Storage, 'getItem' | 'setItem'>; preview?: (file: PreviewFile) => void; warn?: (message: string) => void; delay?: number }
export function createMockClient(options: Options = {}) {
  let state = fixtures()
  try { const saved = JSON.parse(options.storage?.getItem(MOCK_STORAGE_KEY) ?? 'null') as MockState | null; if (saved?.schema === 1 && Array.isArray(saved.employees) && Array.isArray(saved.tasks)) state = saved } catch { options.warn?.('演示存档不可用，已恢复示例数据。') }
  // No workers survive a closed prototype window. Make the recoverable state explicit.
  state.tasks.filter(t => t.state === 'running').forEach(t => { t.state = 'failed'; t.assignments.forEach(a => { if (a.state === 'running') a.state = 'failed' }) })
  let scenario: Scenario = 'success'
  const timings = options.delay ?? 1200
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const requests = new Map<string, { timers: ReturnType<typeof setTimeout>[]; taskId?: string }>()
  const convListeners = new Set<(event: ConversationStreamEvent) => void>()
  const taskListeners = new Set<(event: TaskEvent) => void>()
  const employeeListeners = new Set<(event: EmployeeEvent) => void>()
  const files = new Map<string, { view: AttachmentView; file: File; url: string }>()
  const clone = <T,>(value: T): T => structuredClone(value)
  const later = (callback: () => void, delay: number) => { const timer = setTimeout(() => { timers.delete(timer); callback() }, delay); timers.add(timer); return timer }
  const save = () => { try { options.storage?.setItem(MOCK_STORAGE_KEY, JSON.stringify(state)) } catch { options.warn?.('原型数据未保存：存储空间不足。请导出需要的内容后重置演示数据。') } }
  const subscribe = <T,>(listeners: Set<(event: T) => void>, listener: (event: T) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  const employee = (key: string) => { const e = state.employees.find(item => item.employee.id === key); if (!e) throw new Error('employee_not_found'); return e }
  const task = (key: string) => { const t = state.tasks.find(item => item.id === key || item.draftId === key || item.pendingChange?.id === key || item.toolActions.some(a => a.id === key || a.approvalId === key)); if (!t) throw new Error('task_not_found'); return t }
  const emitTask = (t: TaskDetailView, type: TaskEvent['type'] = 'progress') => { save(); taskListeners.forEach(listener => listener({ type, taskId: t.id, runId: t.runId })) }
  const summary = (): EmployeeSummary[] => state.employees.map(e => ({ id: e.employee.id, name: e.draft?.name ?? e.active?.name ?? e.employee.name, role: e.draft?.role ?? e.active?.role, avatarDataUrl: e.draft?.avatarDataUrl ?? e.active?.avatarDataUrl, status: e.status, activeVersionId: e.active?.id, draftVersionId: e.draft?.id, capabilityVersionIds: e.draft?.capabilityVersionIds ?? e.active?.capabilityVersionIds ?? [], activeCapabilityVersionIds: e.active?.capabilityVersionIds ?? [] }))
  const validate = (input: Parameters<Window['aiEmployeeOS']['employee']['create']>[0]) => { const issues = validateEmployeeDraft(input); if (issues.length) throw new Error(issues[0].code); if (!input.capabilityVersionIds.length) throw new Error('invalid_capabilities'); return normalizeEmployeeDraft(input) }
  const runtime = () => ({ state: 'connected' as const, checkedAt: timestamp(), message: '原型模式：前端 mock 数据，无后端服务' })
  function run(t: TaskDetailView, mode: Scenario = scenario): TaskDetailView {
    if (!state.employees.some(e => e.status === 'active')) throw new Error('没有可用员工，请先创建或恢复员工。')
    t.state = 'running'; t.runId = id('mock-run'); t.runStartedAt = timestamp(); t.delivery = undefined; t.assignments.forEach(a => { a.state = 'running' }); t.toolActions = []; t.approvals = []
    const runId = t.runId
    emitTask(t)
    later(() => {
      if (t.runId !== runId || t.state !== 'running') return
      if (mode === 'failure') { t.state = 'failed'; t.assignments.forEach(a => { a.state = 'failed' }); emitTask(t, 'failed'); return }
      if (mode === 'approval') { t.state = 'needs_attention'; const actionId = id('action'); const approvalId = id('approval'); t.toolActions = [{ id: actionId, toolVersionId: 'tool.document', state: 'blocked', parameters: { file: '原型交付示例.md' }, risk: 'medium', approvalId }]; t.approvals = [{ id: approvalId, toolActionId: actionId, decision: 'pending' }]; emitTask(t, 'needs_attention'); return }
      deliver(t); emitTask(t, 'delivery_completed')
    }, timings * 3)
    return clone(t)
  }
  async function importFiles(selected: File[]) {
    if (selected.length > 8) throw new Error('invalid_attachment_selection')
    if (selected.some(f => f.size > 25 * 1024 * 1024)) throw new Error('attachment_too_large')
    if ([...files.values()].reduce((n, f) => n + f.view.size, 0) + selected.reduce((n, f) => n + f.size, 0) > 60 * 1024 * 1024) throw new Error('attachments_too_large')
    return selected.map(file => { const key = id('attachment'); const view = { id: key, name: file.name, mediaType: file.type || 'application/octet-stream', size: file.size, sha256: 'mock-not-hashed' }; files.set(key, { view, file, url: URL.createObjectURL(file) }); return view })
  }
  function showArtifact(taskId: string, artifactId: string, location = false) {
    const t = task(taskId)
    if (!t.delivery?.artifacts.some(a => a.id === artifactId)) throw new Error('artifact_not_found')
    options.preview?.({ name: t.delivery.artifacts.find(a => a.id === artifactId)!.relativePath, location, text: `# ${t.title}\n\n> 客户端交互原型 · Mock 示例，不是真实 Agent 生成结果。\n\n## 工作目标\n${t.goal}\n\n## 示例交付\n- 工作摘要\n- 建议步骤\n- 待核验清单\n\n## 验收标准\n${t.acceptanceCriteria.map(c => `- ${c}`).join('\n')}\n` })
  }
  const client: Window['aiEmployeeOS'] = {
    runtime: { getStatus: async () => runtime(), reconnect: async () => runtime(), onStatusChanged: () => () => undefined },
    provider: { getStatus: async () => clone(state.provider), configurePoe: async () => { state.provider.credentialStatus.poe = 'configured'; save(); return clone(state.provider) }, verifyPoeModel: async modelId => { state.provider.models.forEach(m => { if (m.modelId === modelId) m.verification = 'verified' }); save(); return clone(state.provider) } },
    conversation: {
      list: async () => clone(state.conversations), history: async key => clone(state.messages[key] ?? []),
      create: async () => { const c = { id: id('conversation'), title: '新会话', preview: '尚无消息', updatedAt: timestamp(), messageCount: 0 }; state.conversations.unshift(c); state.messages[c.id] = []; save(); return clone(c) },
      archive: async key => { if (state.tasks.some(t => t.conversationId === key && t.state === 'running')) throw new Error('conversation_has_active_task'); state.conversations = state.conversations.filter(c => c.id !== key); delete state.messages[key]; state.tasks = state.tasks.filter(t => t.conversationId !== key); save(); return { archived: true, conversationId: key } },
      send: async (key, text, directories = [], attachmentIds = []) => {
        const c = state.conversations.find(c => c.id === key); if (!c) throw new Error('conversation_not_found')
        const messageId = id('message'); const requestId = id('request'); const mode = scenario
        state.messages[key].push({ id: messageId, role: 'user', content: text, createdAt: timestamp(), attachments: attachmentIds.map(key => files.get(key)?.view).filter((v): v is AttachmentView => !!v) })
        c.title = c.messageCount ? c.title : text.slice(0, 24); c.preview = text; c.updatedAt = timestamp(); c.messageCount++
        const active = state.tasks.find(t => t.conversationId === key && ['running', 'needs_attention'].includes(t.state))
        const answer = mode === 'chat' ? '这是直接回答的演示：我可以先帮你梳理问题、比较选项，再决定是否创建事项。当前不会调用模型。' : active ? '已收到补充要求，你可以把它提交为当前事项的变更，也可以创建独立事项。' : '已收到。我会先整理资料，再形成交付结果。事项已创建，请查看下方进度。'
        const req: { timers: ReturnType<typeof setTimeout>[]; taskId?: string } = { timers: [] }; requests.set(requestId, req)
        req.timers.push(later(() => { convListeners.forEach(l => l({ type: 'output_delta', requestId, delta: answer })) }, timings))
        req.timers.push(later(() => {
          state.messages[key]?.push({ id: `stream:${requestId}`, role: 'assistant', content: answer, createdAt: timestamp(), modelId: 'mock' }); c.preview = answer; c.messageCount++; c.updatedAt = timestamp()
          if (mode !== 'chat' && !active) { const t = makeTask(key, text, state.employees); t.sourceMessageIds = [messageId]; t.directories = directories; state.tasks.unshift(t); req.taskId = t.id; try { run(t, mode) } catch { t.state = 'failed'; emitTask(t, 'failed') } }
          save(); convListeners.forEach(l => l({ type: 'completed', requestId })); requests.delete(requestId)
        }, timings * 2))
        save(); return { accepted: true, requestId, messageId }
      },
      cancel: async key => { const request = requests.get(key); request?.timers.forEach(timer => { clearTimeout(timer); timers.delete(timer) }); requests.delete(key); convListeners.forEach(l => l({ type: 'completed', requestId: key })); return { accepted: true } },
      onEvent: listener => subscribe(convListeners, listener)
    },
    attachment: {
      select: () => new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '.doc,.docx,.ppt,.pptx,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.md,.txt'; input.addEventListener('change', () => { void importFiles(Array.from(input.files ?? [])).then(resolve).catch(e => { options.warn?.(String(e)); resolve([]) }) }, { once: true }); input.addEventListener('cancel', () => resolve([]), { once: true }); input.click() }),
      importDropped: importFiles,
      open: async key => { const f = files.get(key); if (!f) { options.preview?.({ name: '历史附件', text: '原型不会持久保存上传文件。窗口刷新后，请重新选择附件。' }); return { opened: true } }; options.preview?.({ name: f.view.name, url: f.url, text: /\.(md|txt|csv)$/i.test(f.view.name) ? await f.file.text() : undefined }); return { opened: true } },
      reveal: async key => { const f = files.get(key); options.preview?.({ name: f?.view.name ?? '历史附件', location: true, text: '附件仅在当前原型窗口中保留，没有写入业务工作目录。' }); return { revealed: true } }
    },
    supervisor: { get: async () => clone(state.supervisor), update: async input => { state.supervisor = { ...state.supervisor, ...input, updatedAt: timestamp() }; save(); return clone(state.supervisor) } },
    employee: {
      list: async () => clone(summary()), capabilities: async () => clone(capabilities), detail: async key => clone(employee(key)),
      create: async input => { const draft = validate(input); const e = makeEmployee(id('employee'), draft); state.employees.push(e); save(); return clone(e) },
      beginEdit: async key => { const e = employee(key); if (!e.draft) { e.draft = { ...clone(e.active!), id: id('version'), version: e.versions.length + 1, state: 'draft', testRunIds: [], createdAt: timestamp() }; e.employee.draftVersionId = e.draft.id } save(); return clone(e) },
      saveDraft: async (key, input) => { const e = employee(key); const draft = validate(input); if (!e.draft) await client.employee.beginEdit(key); Object.assign(e.draft!, draft); e.employee.name = draft.name; e.employee.avatarDataUrl = draft.avatarDataUrl; save(); return clone(e) },
      addTestCase: async (key, input) => { const e = employee(key); e.testCases.push({ ...input, schemaVersion: 1, id: id('case'), createdAt: timestamp(), employeeId: key, employeeVersionId: (e.draft ?? e.active)!.id }); save(); return clone(e) },
      runTest: async (key, caseId) => { const e = employee(key); const caseItem = e.testCases.find(c => c.id === caseId); if (!caseItem) throw new Error('test_case_not_found'); const testRunId = id('test'); const mode = scenario; e.testRuns.push({ schemaVersion: 1, id: testRunId, createdAt: timestamp(), employeeId: key, employeeVersionId: (e.draft ?? e.active)!.id, testCaseId: caseId, providerRequestId: 'mock', status: 'running', output: '', userConfirmed: false }); save(); later(() => { const test = e.testRuns.find(t => t.id === testRunId)!; test.status = mode === 'failure' ? 'failed' : 'completed'; test.output = '固定示例输出：已按测试要求完成资料整理。'; test.automaticPassed = mode !== 'failure'; test.completedAt = timestamp(); save(); employeeListeners.forEach(l => l({ type: mode === 'failure' ? 'test_failed' : 'test_completed', employeeId: key, testRunId })) }, timings); return { accepted: true, requestId: testRunId, testRunId } },
      confirmTest: async (key, runId) => { const e = employee(key); const test = e.testRuns.find(t => t.id === runId); if (!test || test.status !== 'completed') throw new Error('test_not_completed'); test.userConfirmed = true; save(); return clone(e) },
      publish: async key => { const e = employee(key); if (e.draft) { if (e.active) e.active.state = 'superseded'; e.active = { ...e.draft, state: 'active', publishedAt: timestamp() }; e.versions.push(e.active); e.employee.activeVersionId = e.active.id; e.employee.draftVersionId = undefined; e.draft = undefined } e.status = 'active'; save(); return clone(e) },
      rollback: async (key, versionId) => { const e = employee(key); const v = e.versions.find(v => v.id === versionId); if (!v) throw new Error('version_not_found'); e.active = clone(v); e.employee.activeVersionId = v.id; save(); return clone(e) },
      setDisabled: async (key, disabled) => { const e = employee(key); if (state.tasks.some(t => t.state === 'running' && t.assignments.some(a => a.employeeId === key))) throw new Error('employee_has_active_tasks'); e.employee.disabled = disabled; e.status = disabled ? 'disabled' : 'active'; save(); return clone(e) },
      archive: async key => { const e = employee(key); if (state.tasks.some(t => ['running', 'needs_attention'].includes(t.state) && t.assignments.some(a => a.employeeId === key))) throw new Error('employee_has_active_tasks'); e.status = 'archived'; e.employee.archived = true; state.groups.forEach(g => { if (g.members.some(m => m.employeeId === key)) g.status = 'archived' }); save(); return clone(e) },
      restore: async key => { const e = employee(key); e.status = 'active'; e.employee.archived = false; e.employee.disabled = false; save(); return clone(e) },
      deleteDraft: async key => { const e = employee(key); if (e.active) throw new Error('employee_delete_blocked'); state.employees = state.employees.filter(e => e.employee.id !== key); save(); return { accepted: true } },
      onEvent: listener => subscribe(employeeListeners, listener)
    },
    expertGroup: { list: async () => clone(state.groups.filter(g => g.status === 'active')), archive: async key => { const group = state.groups.find(g => g.id === key); if (!group) throw new Error('group_not_found'); group.status = 'archived'; save(); return clone(group) } },
    task: {
      list: async () => clone(state.tasks), outputDirectory: async () => '原型交付文件夹',
      openArtifact: async (key, artifactId) => { showArtifact(key, artifactId); return { opened: true } }, revealArtifact: async (key, artifactId) => { showArtifact(key, artifactId, true); return { revealed: true } },
      createDraft: async input => { const t = { ...makeTask(input.conversationId, input.goal, state.employees), ...input, directories: input.directories ?? [] }; state.tasks.unshift(t); save(); return clone(t) },
      updateDraft: async (key, changes) => { const t = task(key); if (t.state !== 'draft') throw new Error('draft_not_editable'); Object.assign(t, changes); t.draftRevision++; save(); return clone(t) },
      start: async key => run(task(key)), retry: async key => run(task(key), 'success'),
      requestChange: async (key, sourceMessageId, requestedDiff) => { const t = task(key); const changeRequestId = id('change'); t.pendingChange = { id: changeRequestId, sourceMessageId, requestedDiff }; t.state = 'needs_attention'; emitTask(t, 'needs_attention'); return { accepted: true, changeRequestId } },
      acceptChange: async (key, changes) => { const t = task(key); Object.assign(t, changes); t.pendingChange = undefined; t.draftRevision++; return run(t, 'success') },
      rejectChange: async key => { const t = task(key); t.pendingChange = undefined; return run(t, 'success') },
      approveTool: async key => { const t = task(key); t.approvals.forEach(a => a.decision = 'approved'); t.toolActions.forEach(a => a.state = 'succeeded'); deliver(t); emitTask(t, 'delivery_completed'); return clone(t) },
      rejectTool: async key => { const t = task(key); t.approvals.forEach(a => a.decision = 'rejected'); t.toolActions.forEach(a => a.state = 'cancelled'); t.state = 'cancelled'; emitTask(t); return clone(t) },
      resolveTool: async (key, outcome) => { const t = task(key); t.toolActions.forEach(a => a.state = outcome); if (outcome === 'succeeded') deliver(t); else t.state = 'failed'; emitTask(t); return clone(t) },
      onEvent: listener => subscribe(taskListeners, listener)
    },
    resource: { list: async () => clone(catalog), probe: async () => clone(catalog) },
    memory: {
      status: async () => ({ state: 'ready', model: 'mock-display-only', dimensions: 0, modelSha256: 'mock', embedding: 'bm25_only', memoryCount: state.memories.length, pendingQueueCount: state.queue.length, checkedAt: timestamp() }),
      downloadModel: async () => client.memory.status(), list: async filters => clone(state.memories.filter(m => !filters || Object.entries(filters).every(([key, value]) => !value || m[key as keyof typeof m] === value))),
      search: async input => clone(state.memories.filter(m => m.status === 'active' && m.content.includes(input.query) && input.allowedScopes.some(s => s.type === m.scopeType && s.id === m.scopeId)).map(m => ({ ...m, score: 1, vectorScore: 0, lexicalMatched: true, reason: '原型文字匹配', estimatedTokens: m.content.length }))),
      update: async (key, changes) => { const m = state.memories.find(m => m.id === key); if (!m) throw new Error('memory_not_found'); Object.assign(m, changes); m.version++; m.updatedAt = timestamp(); save(); return clone(m) },
      disable: async key => { const m = state.memories.find(m => m.id === key); if (!m) throw new Error('memory_not_found'); m.status = 'disabled'; save(); return clone(m) },
      restore: async key => { const m = state.memories.find(m => m.id === key); if (!m) throw new Error('memory_not_found'); m.status = 'active'; save(); return clone(m) },
      resolveConflict: async key => client.memory.restore(key),
      permanentlyDelete: async key => { state.memories = state.memories.filter(m => m.id !== key); save(); return { deleted: true, memoryId: key, externalBackupsExcluded: true } },
      queue: async () => clone(state.queue),
      acceptQueueItem: async key => { const q = state.queue.find(q => q.id === key); if (!q) throw new Error('queue_not_found'); const m = { id: id('memory'), scopeType: q.scopeType, scopeId: q.scopeId, category: 'preference' as const, version: 1, content: q.content, tags: [], sourceRefs: [q.sourceRef], indexVersion: 'mock', status: 'active' as const, createdAt: timestamp(), updatedAt: timestamp() }; state.memories.push(m); state.queue = state.queue.filter(q => q.id !== key); save(); return clone(m) },
      dismissQueueItem: async key => { state.queue = state.queue.filter(q => q.id !== key); save(); return { dismissed: true, queueId: key } }, migrateEmbeddings: async () => ({ migrated: state.memories.length })
    },
    usage: { summary: async () => ({ requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, amountUsdMicros: 0, checkedAt: timestamp(), models: [] }) },
    connection: {
      getFeishuStatus: async () => clone(state.connection), openFeishuDeveloperConsole: async () => options.preview?.({ name: '模拟应用控制台', text: '此处展示跳转第三方应用配置的交互。不打开真实控制台，不传输凭证。\n\n示例 App ID：cli_mock_demo\n示例 App Secret：mock-only' }),
      connectFeishu: async () => { state.connection = { provider: 'feishu', state: scenario === 'failure' ? 'error' : 'connected', appId: 'cli_mock_demo', checkedAt: timestamp(), scopes: [...FEISHU_DOCUMENT_SCOPES], message: scenario === 'failure' ? '模拟授权失败，可切换场景后重试。' : '模拟连接成功' }; save(); return clone(state.connection) },
      cancelFeishuAuthorization: async () => { state.connection = { provider: 'feishu', state: 'not_connected', checkedAt: timestamp(), scopes: [] }; save(); return clone(state.connection) },
      disconnectFeishu: async () => client.connection.cancelFeishuAuthorization()
    }
  }
  return { client, setScenario: (value: Scenario) => { scenario = value }, snapshot: () => clone(state), reset: () => { timers.forEach(clearTimeout); timers.clear(); requests.clear(); files.forEach(f => URL.revokeObjectURL(f.url)); files.clear(); state = fixtures(); save() }, dispose: () => { timers.forEach(clearTimeout); files.forEach(f => URL.revokeObjectURL(f.url)); convListeners.clear(); taskListeners.clear(); employeeListeners.clear() } }
}
