import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRequest } from '../provider/contract'
import type { AgentCapabilityVersion, Employee, EmployeeVersion, RunGrant, ToolAction } from './domain'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { RuntimeStore } from './store'
import { TaskService } from './task-service'

const stores: RuntimeStore[] = [], directories: string[] = []
afterEach(() => { vi.useRealTimers(); for (const store of stores.splice(0)) store.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function setup(options: { sdk?: boolean; document?: string; maxSteps?: number; authorizationMode?: 'approval_required' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'manager-review-')); directories.push(directory)
  const database = join(directory, 'control.sqlite3'), store = new RuntimeStore(database); stores.push(store)
  const kernel = new RuntimeKernel(store), employees = new EmployeeService(kernel)
  new ResourceService(kernel).seed(); employees.seedCapabilities()
  const now = new Date().toISOString()
  const capability: AgentCapabilityVersion = { schemaVersion: 1, id: 'capability.review-fixture', createdAt: now, version: 1, name: 'review fixture', description: '', skillVersionIds: [], toolVersionIds: ['document.read@local-document/v1'], mcpVersionIds: [], requiredModelIds: ['claude-sonnet-4.6'], permissionRequirements: [], dependencies: [] }
  kernel.save({ entityType: 'AgentCapabilityVersion', entity: capability, immutable: true }, 'fixture', {})
  for (const id of ['reader', 'writer']) {
    const employee: Employee = { schemaVersion: 1, id, createdAt: now, name: id, activeVersionId: `version-${id}`, disabled: false, archived: false }
    const version: EmployeeVersion = { schemaVersion: 1, id: employee.activeVersionId!, createdAt: now, employeeId: id, version: 1, state: 'active', name: id, description: '', systemPrompt: '只根据证据汇总。', modelId: 'claude-sonnet-4.6', capabilityVersionIds: [capability.id], memoryScopes: [], testRunIds: [] }
    kernel.save({ entityType: 'Employee', entity: employee, immutable: false }, 'fixture', {})
    kernel.save({ entityType: 'EmployeeVersion', entity: version, immutable: true }, 'fixture', {})
  }
  let memoryCalls = 0
  const makeTasks = (k = kernel) => new TaskService(k, new EmployeeService(k), () => { memoryCalls++; return [] }, undefined, undefined, () => ({ name: '总管', systemPrompt: '只依据证据审核。', modelId: 'claude-sonnet-4.6', memoryScopes: ['global'] }), options.sdk ? 'openai-agents-team' : 'legacy')
  const tasks = makeTasks()
  const draft = tasks.createDraft({ conversationId: 'fixture', sourceMessageIds: ['source'], goal: '提取 amber_orchid 并给出文档结论', acceptanceCriteria: ['结论包含 amber_orchid'], employeeVersionIds: ['version-reader', 'version-writer'], authorizationMode: options.authorizationMode ?? 'full_access' })
  if (options.maxSteps) kernel.save({ entityType: 'TaskDraft', entity: { ...draft.draft, budget: { ...draft.draft.budget, maxSteps: options.maxSteps } }, immutable: false }, 'fixture', {})
  const started = tasks.confirmAndStart(draft.draft.id), runId = started.run!.id
  const action: ToolAction = { schemaVersion: 1, id: 'verified-read', createdAt: now, runId, assignmentId: started.assignments[0].id, toolVersionId: 'document.read@local-document/v1', idempotencyKey: 'read-once', state: 'succeeded', parameters: { path: '/fixture/source.md' }, parameterSources: {}, risk: 'low', sideEffect: 'external_read', timeoutMs: 1000, resultVerified: true, result: { content: options.document ?? 'amber_orchid', sha256: 'a'.repeat(64), path: '/fixture/source.md', bytes: 12 } }
  kernel.save({ entityType: 'ToolAction', entity: action, immutable: false }, 'fixture', {})
  kernel.save({ entityType: 'Assignment', entity: { ...started.assignments[0], toolActionIds: [action.id] }, immutable: false }, 'fixture', {})
  let request = started.request
  for (const output of ['提取结论 amber_orchid。', '已整理 amber_orchid 的短文档结论。']) {
    tasks.handleProviderEvent(request.requestId, { type: 'output_delta', requestId: request.requestId, delta: output })
    const result = tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })!
    if (result.request) request = result.request
  }
  const detail = () => tasks.detailByRun(runId)
  return { store, kernel, tasks, runId, database, detail, makeTasks, memoryCalls: () => memoryCalls }
}

function review(approved = true): any {
  return { approved, summary: '已核对结论。', criteria: [{ criterionIndex: 0, passed: approved, reason: approved ? '结论完整' : '正文缺少必要结论', evidenceTypes: ['tool_result', 'handoff'] }], deliveryResult: { resultType: 'text', headline: '文档结论', summary: '已提取 amber_orchid 并整理为简短结论。', keyResults: [], limitations: [] } }
}

function invalidDelivery(): any {
  const result = review()
  // Shape taken from the retained real Poe failure; source ID is bound to this fixture.
  result.deliveryResult.keyResults = [{ label: '文件写入与回读一致性', value: 'SHA-256 前后一致，bytes=240', unit: '', sourceIds: ['verified-read'] }]
  return result
}

function finish(tasks: TaskService, request: ProviderRequest, value: unknown) {
  tasks.handleProviderEvent(request.requestId, { type: 'structured_result', requestId: request.requestId, value })
  return tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })!
}

describe('manager format repair preserves completed work', () => {
  it.each([false, true])('reuses evidence and corrects the real failure without employee/tool rework (SDK: %s)', (sdk) => {
    const f = setup({ sdk }), request = f.tasks.beginManagerReview(f.runId), before = f.detail(), calls = f.memoryCalls()
    const repaired = finish(f.tasks, request, invalidDelivery())
    expect(repaired.request?.outputSchema?.name).toBe('manager_review')
    expect(repaired.detail.assignments).toEqual(before.assignments)
    expect(repaired.detail.toolActions).toEqual(before.toolActions)
    expect(f.memoryCalls()).toBe(calls)
    expect(repaired.request!.input).toContain('delivery_key_result_unverified')
    const delivered = finish(f.tasks, repaired.request!, review())
    expect(delivered.event).toBe('delivery_completed')
    expect(delivered.detail.assignments).toEqual(before.assignments)
    expect(delivered.detail.toolActions).toEqual(before.toolActions)
    expect(delivered.detail.checkpoints.some((c) => c.phase === 'manager_rework')).toBe(false)
  })

  it('fails after two correction requests without adding an assignment or tool action', () => {
    const f = setup(); let request = f.tasks.beginManagerReview(f.runId)
    for (let index = 0; index < 2; index++) request = finish(f.tasks, request, invalidDelivery()).request!
    const failed = finish(f.tasks, request, invalidDelivery())
    expect(failed.event).toBe('failed')
    expect(failed.detail.assignments).toHaveLength(2)
    expect(failed.detail.toolActions).toHaveLength(1)
    expect(failed.detail.delivery).toBeUndefined()
  })

  it('retains genuine business rejection and its bounded employee rework', () => {
    const f = setup(), request = f.tasks.beginManagerReview(f.runId)
    const rejected = finish(f.tasks, request, review(false))
    expect(rejected.detail.assignments).toHaveLength(3)
    expect(rejected.detail.assignments.at(-1)!.reworkOfAssignmentId).toBe(f.detail().assignments[1].id)
  })

  it('does not let a format correction turn an accepted business decision into employee rework', () => {
    const f = setup(), first = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, first, invalidDelivery()).request!
    const contradicted = finish(f.tasks, correction, review(false))
    expect(contradicted.request?.input).toContain('manager_review_decision_changed')
    expect(contradicted.detail.assignments).toHaveLength(2)
  })

  it('persists the bound evidence and remaining correction count across restart', () => {
    const f = setup({ sdk: true }), first = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, first, invalidDelivery()).request!
    const grant = f.store.get<RunGrant>('RunGrant', f.detail().run!.runGrantId)
    const reopened = new RuntimeStore(f.database); stores.push(reopened)
    const tasks = f.makeTasks(new RuntimeKernel(reopened)), calls = f.memoryCalls()
    const resumed = tasks.recoverPendingRequests()[0]
    expect(resumed.input).toBe(correction.input)
    expect(f.memoryCalls()).toBe(calls)
    const last = finish(tasks, resumed, invalidDelivery()).request!
    expect(finish(tasks, last, invalidDelivery()).event).toBe('failed')
    expect(tasks.detailByRun(f.runId).assignments).toHaveLength(2)
    expect(reopened.get('RunGrant', grant!.id)).toEqual(grant)
  })

  it('keeps a legacy Run grant and smaller step budget when recovering its frozen review', () => {
    const f = setup({ maxSteps: 8 }), request = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, request, invalidDelivery()).request!
    const before = f.detail(), grant = f.store.get('RunGrant', before.run!.runGrantId)
    const reopened = new RuntimeStore(f.database); stores.push(reopened)
    const tasks = f.makeTasks(new RuntimeKernel(reopened))
    expect(tasks.recoverPendingRequests()[0].input).toBe(correction.input)
    expect(tasks.detailByRun(f.runId).revision).toEqual(before.revision)
    expect(tasks.detailByRun(f.runId).run!.runGrantId).toBe(before.run!.runGrantId)
    expect(reopened.get('RunGrant', before.run!.runGrantId)).toEqual(grant)
  })

  it('does not upgrade a legacy approval grant during frozen manager correction', () => {
    const f = setup({ authorizationMode: 'approval_required' }), request = f.tasks.beginManagerReview(f.runId)
    finish(f.tasks, request, invalidDelivery())
    const grant = f.store.get('RunGrant', f.detail().run!.runGrantId)
    expect(f.tasks.recoverPendingRequests()).toHaveLength(1)
    expect(f.store.get('RunGrant', f.detail().run!.runGrantId)).toEqual(grant)
  })

  it.each([false, true])('records actual manager usage once for sdk=%s, including duplicate callback delivery', (sdk) => {
    const f = setup({ sdk }), request = f.tasks.beginManagerReview(f.runId)
    const event = { type: 'usage' as const, requestId: request.requestId, inputTokens: 19, outputTokens: 7, totalTokens: 26, source: 'provider_actual' as const }
    if (sdk) f.tasks.coordinatorUsage(f.runId, event)
    f.tasks.handleProviderEvent(request.requestId, event)
    f.tasks.handleProviderEvent(request.requestId, event)
    expect(f.store.list<any>('BudgetLedgerEntry').filter((row) => row.requestId === request.requestId)).toEqual([expect.objectContaining({ runId: f.runId, requestId: request.requestId, provider: request.provider, modelId: request.modelId, inputTokens: 19, outputTokens: 7, source: 'provider_actual' })])
  })

  it('rejects changed persisted evidence instead of silently making a new review context', () => {
    const f = setup(), first = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, first, invalidDelivery()).request!
    const action = f.detail().toolActions[0]
    f.kernel.save({ entityType: 'ToolAction', entity: { ...action, result: { content: 'changed' } }, immutable: false }, 'fixture.corrupted', {})
    const failed = finish(f.tasks, correction, review())
    expect(failed.event).toBe('failed')
    expect(failed.detail.delivery).toBeUndefined()
    expect(failed.detail.assignments).toHaveLength(2)
  })

  it.each([undefined, {}, { approved: true }, { ...review(), criteria: [] }, { ...review(), deliveryResult: {} }])('routes malformed manager output to manager-only repair', (value) => {
    const f = setup(), request = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, request, value)
    expect(correction.request?.outputSchema?.name).toBe('manager_review')
    expect(correction.detail.assignments).toHaveLength(2)
  })

  it('preserves the correction count and evidence after rejecting a plan change', () => {
    const f = setup({ sdk: true }), first = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, first, invalidDelivery()).request!, calls = f.memoryCalls()
    const change = f.tasks.requestChange(f.detail().task!.id, 'change', { goal: 'new goal' })
    expect(finish(f.tasks, correction, invalidDelivery()).event).toBe('needs_attention')
    const resumed = f.tasks.rejectChange(change.id).request!
    expect(resumed.input).toContain('2/2')
    expect(f.memoryCalls()).toBe(calls)
    expect(finish(f.tasks, resumed, invalidDelivery()).event).toBe('failed')
    expect(f.detail().assignments).toHaveLength(2)
  })

  it('keeps the bound correction across safe shutdown and restart', () => {
    const f = setup({ sdk: true }), first = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, first, invalidDelivery()).request!
    f.tasks.requestShutdown()
    expect(finish(f.tasks, correction, invalidDelivery()).event).toBe('needs_attention')
    f.tasks.acknowledgeSdkApplicationRestart(f.runId)
    const resumed = f.tasks.recoverPendingRequests()[0]
    expect(resumed.input).toContain('2/2')
    expect(finish(f.tasks, resumed, invalidDelivery()).event).toBe('failed')
  })

  it('reuses completed document audit batches during correction and restart', () => {
    const f = setup({ document: 'amber_orchid\n'.repeat(12_000) })
    let request = f.tasks.beginManagerReview(f.runId), batches = 0
    while (!request.outputSchema) {
      f.tasks.handleProviderEvent(request.requestId, { type: 'output_delta', requestId: request.requestId, delta: `文档审查批次 ${++batches}：结论完整。` })
      request = f.tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })!.request!
    }
    expect(batches).toBeGreaterThan(1)
    const correction = finish(f.tasks, request, invalidDelivery()).request!, calls = f.memoryCalls()
    expect(correction.outputSchema?.name).toBe('manager_review')
    const resumed = f.tasks.recoverPendingRequests()[0]
    expect(resumed.input).toBe(correction.input)
    expect(f.memoryCalls()).toBe(calls)
    expect(f.detail().checkpoints.filter((c) => c.phase === 'manager_review' && c.payload.documentBatch)).toHaveLength(batches)
    expect(finish(f.tasks, resumed, review()).event).toBe('delivery_completed')
  })

  it('continues only unfinished document audit batches after restart', () => {
    const f = setup({ document: 'amber_orchid\n'.repeat(12_000) })
    const first = f.tasks.beginManagerReview(f.runId)
    f.tasks.handleProviderEvent(first.requestId, { type: 'output_delta', requestId: first.requestId, delta: '第一批已经审核。' })
    const second = f.tasks.handleProviderEvent(first.requestId, { type: 'completed', requestId: first.requestId })!.request!
    const resumed = f.tasks.recoverPendingRequests()[0]
    expect(resumed.input).toBe(second.input)
    const cp = f.detail().checkpoints.findLast((c) => c.phase === 'manager_review')!
    expect((cp.payload.documentBatch as any).outputs).toEqual(['第一批已经审核。'])
  })

  it('does not replace a saved business approval with employee rework after a plan pause', () => {
    const f = setup({ sdk: true }), request = f.tasks.beginManagerReview(f.runId)
    const change = f.tasks.requestChange(f.detail().task!.id, 'change', { goal: 'new' })
    expect(finish(f.tasks, request, review()).event).toBe('needs_attention')
    const resumed = f.tasks.rejectChange(change.id).request!
    const corrected = finish(f.tasks, resumed, review(false))
    expect(corrected.request?.input).toContain('manager_review_decision_changed')
    expect(corrected.detail.assignments).toHaveLength(2)
  })

  it('rejects evidence changes between document audit batches before final context binding', () => {
    const f = setup({ document: 'amber_orchid\n'.repeat(12_000) }), request = f.tasks.beginManagerReview(f.runId)
    const action = f.detail().toolActions[0]
    f.kernel.save({ entityType: 'ToolAction', entity: { ...action, result: { content: 'changed' } }, immutable: false }, 'fixture.corrupted', {})
    f.tasks.handleProviderEvent(request.requestId, { type: 'output_delta', requestId: request.requestId, delta: '本批审核完成。' })
    expect(f.tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })!.event).toBe('failed')
    expect(f.detail().checkpoints.some((c) => c.payload.reviewContext)).toBe(false)
  })

  it('keeps the original step budget during correction', () => {
    const f = setup({ maxSteps: 4 }), first = f.tasks.beginManagerReview(f.runId)
    const correction = finish(f.tasks, first, invalidDelivery()).request!
    const failed = finish(f.tasks, correction, invalidDelivery())
    expect(failed.event).toBe('failed')
    expect(failed.detail.assignments).toHaveLength(2)
    expect(failed.detail.checkpoints.filter((c) => c.phase === 'provider_step')).toHaveLength(4)
    expect(failed.detail.revision!.budget.maxSteps).toBe(4)
  })

  it('does not issue another correction after the frozen grant deadline', () => {
    const f = setup(), first = f.tasks.beginManagerReview(f.runId)
    const grant = f.store.get<RunGrant>('RunGrant', f.detail().run!.runGrantId)!
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(grant.expiresAt) + 1)
    const failed = finish(f.tasks, first, invalidDelivery())
    expect(failed.event).toBe('failed')
    expect(failed.request).toBeUndefined()
    expect(failed.detail.assignments).toHaveLength(2)
  })
})
