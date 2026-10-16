import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import type { Artifact, Checkpoint, Employee, EmployeeVersion, Evidence, Handoff, RunGrant, ToolAction } from './domain'
import { serializeProviderInput } from '../provider/contract'
import { createHandoffEnvelope } from './handoff-contract'
import { validateRuntimeHandoffs } from './handoff-validation'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { RuntimeStore } from './store'
import { TaskService, type FormalTaskDetail } from './task-service'

const stores: RuntimeStore[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close() })

function setup(executor: 'legacy' | 'openai-agents' | 'openai-agents-team' = 'openai-agents-team', pauseAfterFirst = false, maxSteps?: number) {
  const store = new RuntimeStore(':memory:'); stores.push(store)
  const kernel = new RuntimeKernel(store), employees = new EmployeeService(kernel)
  new ResourceService(kernel).seed(); employees.seedCapabilities()
  const ids = executor === 'openai-agents' ? ['v0'] : ['v0', 'v1']
  for (const id of ids) {
    const employee: Employee = { schemaVersion: 1, id: `employee-${id}`, createdAt: new Date().toISOString(), name: id, activeVersionId: id, archived: false, disabled: false }
    const version: EmployeeVersion = { schemaVersion: 1, id, createdAt: employee.createdAt, employeeId: employee.id, version: 1, state: 'active', name: id, description: 'handoff fixture', systemPrompt: 'Return a grounded answer.', modelId: 'claude-sonnet-4.6', capabilityVersionIds: ['capability.text-analysis.v1'], memoryScopes: [], testRunIds: [] }
    kernel.save({ entityType: 'Employee', entity: employee, immutable: false }, 'fixture', {})
    kernel.save({ entityType: 'EmployeeVersion', entity: version, immutable: true }, 'fixture', {})
  }
  const tasks = new TaskService(kernel, employees, undefined, undefined, undefined, () => ({ name: '总管', systemPrompt: '按证据审核。', modelId: 'claude-sonnet-4.6', memoryScopes: [] }), executor)
  const draft = tasks.createDraft({ conversationId: 'fixture', sourceMessageIds: ['message'], goal: '按序分析并汇总', acceptanceCriteria: ['结论完整'], employeeVersionIds: ids, authorizationMode: 'full_access' })
  if (maxSteps) kernel.save({ entityType: 'TaskDraft', entity: { ...draft.draft, budget: { ...draft.draft.budget, maxSteps } }, immutable: false }, 'fixture.budget', {})
  const started = tasks.confirmAndStart(draft.draft.id), runId = started.run!.id
  let request = started.request
  for (const id of ids) {
    if (pauseAfterFirst) tasks.requestChange(started.task!.id, 'change', { goal: 'new' })
    tasks.handleProviderEvent(request.requestId, { type: 'output_delta', requestId: request.requestId, delta: `${id} 已完成分析。` })
    const result = tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })!
    if (result.request) request = result.request
    if (pauseAfterFirst) break
  }
  const detail = () => tasks.detailByRun(runId)
  const grant = store.get<RunGrant>('RunGrant', started.run!.runGrantId)!
  return { store, kernel, tasks, runId, detail, grant }
}

function rehash(handoff: Handoff): void {
  const { schemaVersion: _schema, type: _type, ...input } = handoff.envelope!
  const rebuilt = createHandoffEnvelope(input)
  handoff.envelope = rebuilt.envelope; handoff.sha256 = rebuilt.sha256
}

describe('SDK Runtime handoff validation', () => {
  it('validates legacy Run handoffs in Runtime without requiring any worker', () => {
    const f = setup('legacy'), before = f.detail().handoffs
    f.tasks.recordHandoffCheckpoint(f.runId)
    expect(f.detail().checkpoints.some((item) => item.phase === 'handoff_validated')).toBe(true)
    expect(f.detail().checkpoints.some((item) => item.phase === 'deep_agents_safe_pause')).toBe(false)
    expect(f.detail().handoffs).toEqual(before)
    expect(f.detail().run!.employeeExecutor).toBeUndefined()
  })

  it.each(['openai-agents', 'openai-agents-team'] as const)('validates and records %s without worker evidence; repeated recovery is idempotent', (executor) => {
    const f = setup(executor)
    f.tasks.recordHandoffCheckpoint(f.runId)
    f.tasks.recordHandoffCheckpoint(f.runId)
    const checkpoints = f.detail().checkpoints.filter((item) => item.phase === 'handoff_validated')
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0].payload.validation).toMatchObject({ validator: 'runtime-handoff-v1', runId: f.runId, runGrantId: f.grant.id, handoffs: f.detail().handoffs.map((h) => expect.objectContaining({ id: h.id, sha256: h.sha256 })) })
    expect(f.detail().checkpoints.some((item) => item.phase === 'deep_agents_safe_pause')).toBe(false)
    expect(f.detail().delivery).toBeUndefined()
  })

  it.each([
    ['handoff_missing', (d: FormalTaskDetail) => { d.handoffs.pop() }],
    ['handoff_integrity_failed', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.summary = '篡改' }],
    ['handoff_binding_failed', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.runId = 'other-run'; rehash(d.handoffs[0]) }],
    ['handoff_binding_failed', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.taskRevisionId = 'other-revision'; rehash(d.handoffs[0]) }],
    ['handoff_binding_failed', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.producer.employeeVersionId = 'other-employee'; rehash(d.handoffs[0]) }],
    ['handoff_recipient_not_authorized', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.audience.assignmentIds = ['outside-assignment']; rehash(d.handoffs[0]) }],
    ['handoff_recipient_not_authorized', (d: FormalTaskDetail) => { d.handoffs.at(-1)!.envelope!.audience.supervisor = false; rehash(d.handoffs.at(-1)!) }],
    ['handoff_assignment_incomplete', (d: FormalTaskDetail) => { d.assignments[0].state = 'running' }],
    ['handoff_employee_not_authorized', (d: FormalTaskDetail) => { d.assignments[0].employeeVersionId = 'outside-employee' }],
    ['handoff_evidence_not_found', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.parts.push({ kind: 'evidence_ref', evidenceId: 'missing' }); d.handoffs[0].evidenceIds.push('missing'); rehash(d.handoffs[0]) }],
    ['handoff_artifact_not_found', (d: FormalTaskDetail) => { d.handoffs[0].envelope!.parts.push({ kind: 'artifact_ref', artifactId: 'missing' }); d.handoffs[0].artifactIds.push('missing'); rehash(d.handoffs[0]) }]
  ] as const)('rejects %s before checkpoint or manager review', (code, mutate) => {
    const f = setup(), detail = f.detail(); mutate(detail)
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow(code)
    expect(f.detail().checkpoints.some((item) => item.phase === 'handoff_validated' || item.phase === 'manager_review')).toBe(false)
  })

  it('rejects unsettled tools and actions outside the frozen grant', () => {
    const f = setup(), detail = f.detail()
    const action = { id: 'action', runId: f.runId, assignmentId: detail.assignments[0].id, toolVersionId: 'outside-tool', state: 'pending' } as ToolAction
    detail.toolActions.push(action); detail.assignments[0].toolActionIds = [action.id]
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('handoff_unsettled_tool_action')
    action.state = 'succeeded'; action.resultVerified = true
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('tool_outside_run_grant')
  })

  it.each(['openai-agents-team', 'legacy'] as const)('revalidates %s historical worker records without rewriting them', (executor) => {
    const f = setup(executor), before = f.detail()
    const checkpoint: Checkpoint = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), runId: f.runId, sequence: Math.max(...before.checkpoints.map((item) => item.sequence)) + 1, assignmentId: before.assignments.at(-1)!.id, workerThreadId: f.runId, phase: 'deep_agents_safe_pause', nextNode: 'manager', committed: true, unsettledToolActionIds: [], payload: { deepAgents: { historical: true } } }
    f.kernel.save({ entityType: 'Checkpoint', entity: checkpoint, immutable: true }, 'fixture.historical_worker', {})
    const requests = f.tasks.recoverPendingRequests()
    expect(requests).toHaveLength(1)
    expect(f.detail().checkpoints.find((item) => item.id === checkpoint.id)).toEqual(checkpoint)
    expect(f.detail().checkpoints.filter((item) => item.phase === 'handoff_validated')).toHaveLength(1)
    expect(f.detail().handoffs).toEqual(before.handoffs)
    expect(f.detail().run!.runGrantId).toBe(before.run!.runGrantId)
  })

  it('accepts unchanged historical text only on legacy Runs and verifies its recipients and references', () => {
    const f = setup('legacy'), detail = f.detail()
    for (const handoff of detail.handoffs) {
      delete handoff.envelope
      handoff.input = { goal: detail.revision!.goal }
      handoff.output = { text: 'Historical saved employee output.' }
      handoff.sha256 = createHash('sha256').update(String(handoff.output.text)).digest('hex')
    }
    const before = structuredClone(detail.handoffs)
    expect(validateRuntimeHandoffs(detail, f.grant).executor).toBe('legacy-runtime')
    expect(detail.handoffs).toEqual(before)
    detail.handoffs[0].output!.text = 'corrupted'
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('handoff_integrity_failed')
    detail.handoffs = structuredClone(before)
    detail.handoffs[0].toAssignmentId = 'outside-run'
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('handoff_recipient_not_authorized')
    detail.handoffs = structuredClone(before)
    detail.handoffs[0].artifactIds = ['unknown']
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('handoff_artifact_not_found')
    detail.handoffs = structuredClone(before)
    detail.handoffs[0].evidenceIds = ['unknown']
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('handoff_evidence_not_found')
    detail.handoffs = structuredClone(before)
    detail.run!.employeeExecutor = 'openai-agents-ts-v2'
    expect(() => validateRuntimeHandoffs(detail, f.grant)).toThrow('handoff_envelope_required')
  })

  it('recovers a small-budget legacy Run without invalidating frozen typed handoffs', () => {
    const f = setup('legacy', false, 8), before = f.detail()
    expect(f.tasks.recoverPendingRequests()).toHaveLength(1)
    const after = f.detail()
    expect(after.revision).toEqual(before.revision)
    expect(after.run!.runGrantId).toBe(before.run!.runGrantId)
    expect(after.handoffs).toEqual(before.handoffs)
    expect(after.checkpoints.some((item) => item.phase === 'handoff_validated')).toBe(true)
    expect(after.revision!.budget.maxSteps).toBe(8)
  })

  it('accepts structured parts and same-run verified references, and rejects changed referenced evidence', () => {
    const f = setup(), d = f.detail(), h = d.handoffs[0]
    d.artifacts.push({ id: 'artifact', runId: f.runId, sha256: 'a'.repeat(64) } as Artifact)
    d.evidence.push({ id: 'evidence', runId: f.runId, sha256: 'b'.repeat(64) } as Evidence)
    h.envelope!.parts = [{ kind: 'data', mediaType: 'application/json', value: { marker: 'amber_orchid' } }, { kind: 'artifact_ref', artifactId: 'artifact', sha256: 'a'.repeat(64) }, { kind: 'evidence_ref', evidenceId: 'evidence', sha256: 'b'.repeat(64) }]
    h.artifactIds = ['artifact']; h.evidenceIds = ['evidence']; rehash(h)
    // A projector may provide structured content without an upstream text output.
    d.assignments[0].output = undefined
    expect(() => validateRuntimeHandoffs(d, f.grant)).not.toThrow()
    d.evidence[0].sha256 = 'c'.repeat(64)
    expect(() => validateRuntimeHandoffs(d, f.grant)).toThrow('handoff_evidence_integrity_failed')
  })

  it('keeps historical Teams receipt reuse under the existing task ancestry policy', () => {
    const f = setup(), d = f.detail()
    d.toolActions.push({ id: 'ancestor-receipt', runId: 'previous-run', state: 'succeeded' } as ToolAction)
    expect(validateRuntimeHandoffs(d, f.grant).toolActions).toEqual([])
  })

  it('validates at the manager entry before either short or batched document review', () => {
    const f = setup(), d = f.detail(), assignment = d.assignments.at(-1)!
    const action: ToolAction = { schemaVersion: 1, id: 'read', createdAt: new Date().toISOString(), runId: f.runId, assignmentId: assignment.id, toolVersionId: 'document.read@local-document/v1', idempotencyKey: 'read', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'low', sideEffect: 'external_read', timeoutMs: 1000, resultVerified: true, result: { content: 'x'.repeat(200_000) } }
    f.kernel.save({ entityType: 'ToolAction', entity: action, immutable: false }, 'fixture', {})
    f.kernel.save({ entityType: 'Assignment', entity: { ...assignment, toolActionIds: [action.id] }, immutable: false }, 'fixture', {})
    expect(() => f.tasks.beginManagerReview(f.runId)).toThrow('tool_outside_run_grant')
    expect(f.detail().checkpoints.some((c) => c.phase === 'manager_review')).toBe(false)
  })

  it('validates SDK v1 safe-shutdown recovery before it creates the manager request', () => {
    const f = setup('openai-agents')
    f.tasks.requestShutdown()
    expect(f.detail().run!.state).toBe('paused')
    const requests = f.tasks.recoverPendingRequests()
    expect(requests).toHaveLength(1)
    expect(f.detail().checkpoints.some((c) => c.phase === 'handoff_validated')).toBe(true)
    expect(f.detail().checkpoints.some((c) => c.phase === 'deep_agents_safe_pause')).toBe(false)
  })

  it('validates SDK handoffs when a paused plan change is rejected', () => {
    const f = setup()
    const change = f.tasks.requestChange(f.detail().task!.id, 'change', { goal: 'new' })
    f.tasks.settleToolGate(f.runId)
    expect(f.detail().run!.state).toBe('paused')
    f.tasks.rejectChange(change.id)
    expect(f.detail().checkpoints.some((c) => c.phase === 'handoff_validated')).toBe(true)
  })

  it('retains the verified envelope when a rejected change resumes the downstream employee', () => {
    const f = setup('openai-agents-team', true)
    const resumed = f.tasks.rejectChange(f.detail().changeRequests[0].id)
    expect(serializeProviderInput(resumed.request!.input)).toContain('AgentHandoffEnvelope')
    expect(serializeProviderInput(resumed.request!.input)).toContain(f.detail().handoffs[0].sha256)
  })

  it.each([false, true])('fails closed on corrupt persisted handoffs when rejecting a change (pending employee: %s)', (pending) => {
    const f = setup('openai-agents-team', pending)
    const change = pending ? f.detail().changeRequests[0] : f.tasks.requestChange(f.detail().task!.id, 'change', { goal: 'new' })
    if (!pending) f.tasks.settleToolGate(f.runId)
    // Deliberate corruption of the in-memory fixture; production Handoffs stay immutable.
    const handoff = f.detail().handoffs[0]; handoff.envelope!.summary = 'corrupted'
    f.store.database.exec('DROP TRIGGER immutable_entity_no_update')
    f.store.database.prepare('UPDATE entity_records SET payload_json=? WHERE entity_type=? AND entity_id=?').run(JSON.stringify(handoff), 'Handoff', handoff.id)
    const resumed = f.tasks.rejectChange(change.id)
    expect(resumed.request).toBeUndefined()
    expect(resumed.detail.run!.state).toBe('failed')
    expect(resumed.detail.task!.state).toBe('failed')
    expect(resumed.detail.checkpoints.some((c) => c.phase === 'manager_review')).toBe(false)
  })

  it('validates a new rework batch, preserving old audiences and checkpoint evidence', () => {
    const f = setup(), request = f.tasks.beginManagerReview(f.runId)
    const original = f.detail().checkpoints.find((c) => c.phase === 'handoff_validated')!
    f.tasks.handleProviderEvent(request.requestId, { type: 'structured_result', requestId: request.requestId, value: { approved: false, summary: '补充结论', criteria: [{ criterionIndex: 0, passed: false, reason: '补充结论', evidenceTypes: ['employee_output'] }], returnToAssignmentSequence: 2, deliveryResult: { resultType: 'text', headline: '待补充', summary: '待补充结论', keyResults: [], limitations: [] } } })
    f.tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })
    // Rebuilding after interruption must honor the original recipient's lineage.
    const resumed = f.tasks.recoverPendingRequests()[0]
    expect(serializeProviderInput(resumed.input)).toContain('AgentHandoffEnvelope')
    f.tasks.handleProviderEvent(resumed.requestId, { type: 'output_delta', requestId: resumed.requestId, delta: '补充后的完整结论。' })
    f.tasks.handleProviderEvent(resumed.requestId, { type: 'completed', requestId: resumed.requestId })
    f.tasks.beginManagerReview(f.runId)
    const checkpoints = f.detail().checkpoints.filter((c) => c.phase === 'handoff_validated')
    expect(checkpoints).toHaveLength(2)
    expect(checkpoints[0]).toEqual(original)
    expect(checkpoints[1].assignmentId).toBe(f.detail().assignments.at(-1)!.id)
  })
})
