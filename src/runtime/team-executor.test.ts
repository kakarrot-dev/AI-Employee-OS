import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConversationInput, ProviderEvent, ProviderRequest } from '../provider/contract'
import type { AgentCapabilityVersion, Employee, EmployeeVersion, RunGrant, ToolAction, ToolVersion } from './domain'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { RuntimeStore } from './store'
import { TaskService } from './task-service'
import { TeamExecutor } from './team-executor'
import { ToolGateway, type ToolRunner } from './tool-gateway'
import { DEFAULT_SUPERVISOR_CONFIG } from '../shared/supervisor-contract'
import { sdkDigest } from './sdk-checkpoints'
import { sdkDispatchResponse } from './sdk-model-response'

const directories: string[] = [], stores: RuntimeStore[] = []
afterEach(() => { vi.restoreAllMocks(); for (const store of stores.splice(0)) store.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const writeId = 'fixture.write.v1', readId = 'fixture.read.v1'

function response(request: ProviderRequest, value: { text?: string; json?: unknown; call?: { name: string; arguments: Record<string, unknown> } }): ProviderEvent[] {
  return [
    ...(value.text ? [{ type: 'output_delta' as const, requestId: request.requestId, delta: value.text }] : []),
    ...(value.json ? [{ type: 'structured_result' as const, requestId: request.requestId, value: value.json }] : []),
    { type: 'usage', requestId: request.requestId, inputTokens: 10, outputTokens: 4, totalTokens: 14, source: 'provider_actual' },
    ...(value.call ? [{ type: 'tool_proposal' as const, requestId: request.requestId, callId: `call-${request.requestId}`, ...value.call }] : []),
    { type: 'completed', requestId: request.requestId, providerRequestId: `response-${request.requestId}` }
  ]
}

function setup(options: { approval?: boolean; members?: number; maxSteps?: number; database?: string; runner?: ToolRunner; script?: (request: ProviderRequest) => ProviderEvent[]; managerFault?: 'semantic' | 'invalid_json' } = {}) {
  const directory = options.database ? undefined : mkdtempSync(join(tmpdir(), 'team-sdk-'))
  if (directory) directories.push(directory)
  const database = options.database ?? join(directory!, 'control.sqlite3')
  const store = new RuntimeStore(database); stores.push(store)
  const kernel = new RuntimeKernel(store), resources = new ResourceService(kernel); resources.seed()
  const employees = new EmployeeService(kernel); employees.seedCapabilities()
  const now = new Date().toISOString()
  const members = options.members ?? 2
  if (!options.database) for (let i = 0; i < members; i++) {
    const toolId = i ? writeId : readId
    const tool: ToolVersion = { schemaVersion: 1, id: toolId, createdAt: now, version: 1, name: toolId, description: 'Local deterministic SDK fixture', source: 'built_in', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false }, sideEffect: i ? 'external_write' : 'external_read', risk: i ? 'high' : 'low', timeoutMs: 1000, networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required' }
    const capability: AgentCapabilityVersion = { schemaVersion: 1, id: `fixture.cap.${i}`, createdAt: now, version: 1, name: `fixture-${i}`, description: '', skillVersionIds: [], toolVersionIds: [toolId], mcpVersionIds: [], requiredModelIds: ['claude-sonnet-4.6'], permissionRequirements: [], dependencies: [] }
    const employee: Employee = { schemaVersion: 1, id: `fixture.employee.${i}`, createdAt: now, name: `员工${i}`, activeVersionId: `fixture.version.${i}`, archived: false, disabled: false }
    const version: EmployeeVersion = { schemaVersion: 1, id: employee.activeVersionId!, createdAt: now, employeeId: employee.id, version: 1, state: 'active', name: employee.name, description: '', systemPrompt: '只完成冻结的当前任务，不扩大权限。', modelId: 'claude-sonnet-4.6', capabilityVersionIds: [capability.id], memoryScopes: [], testRunIds: [] }
    kernel.save({ entityType: 'ToolVersion', entity: tool, immutable: true }, 'fixture', {})
    kernel.save({ entityType: 'AgentCapabilityVersion', entity: capability, immutable: true }, 'fixture', {})
    kernel.save({ entityType: 'Employee', entity: employee, immutable: false }, 'fixture', {})
    kernel.save({ entityType: 'EmployeeVersion', entity: version, immutable: true }, 'fixture', {})
  }
  const tasks = new TaskService(kernel, employees, undefined, undefined, undefined, () => ({ ...DEFAULT_SUPERVISOR_CONFIG, memoryScopes: [], modelId: 'claude-sonnet-4.6' }), 'openai-agents-team')
  const runner = vi.fn<ToolRunner>(options.runner ?? (async (_tool, parameters) => ({ value: parameters.value })))
  const gateway = new ToolGateway(kernel, resources, runner)
  const requests: ProviderRequest[] = [], failures: string[] = []
  const script = options.script ?? ((request: ProviderRequest) => {
    const input = request.input as ProviderConversationInput
    if (request.outputSchema?.name === 'manager_review') {
      const count = (request.outputSchema.schema.properties as any).criteria.minItems
      if (options.managerFault === 'semantic' && requests.filter((r) => r.outputSchema?.name === 'manager_review').length === 1) return response(request, { json: { approved: true, summary: '已核验', criteria: Array.from({ length: count }, (_, criterionIndex) => ({ criterionIndex, passed: true, reason: '证据满足', evidenceTypes: ['employee_output'] })), deliveryResult: { resultType: 'text', headline: '交付结果', summary: '已完成冻结任务', keyResults: [{ label: '校验结果', value: '无匹配指标', unit: '', sourceIds: ['nonexistent-receipt'] }], limitations: [] } } })
      return response(request, { json: { approved: true, summary: '已核验', criteria: Array.from({ length: count }, (_, criterionIndex) => ({ criterionIndex, passed: true, reason: '证据满足', evidenceTypes: ['employee_output'] })), deliveryResult: { resultType: 'text', headline: '交付结果', summary: '已完成冻结任务', keyResults: [], limitations: [] } } })
    }
    if (input.tools!.length) {
      const context = tasks.employeeExecutionContext(request.requestId)!
      const toolVersionId = context.version.id.endsWith('.0') ? readId : writeId
      return response(request, { call: { name: 'propose_tool_action', arguments: { toolVersionId, parameters: { value: 'verified fixture' } } } })
    }
    return response(request, { text: '已根据工具证据完成，并交接给下一位员工。' })
  })
  const executor: TeamExecutor = new TeamExecutor(kernel, tasks, gateway, {
    execute: async (request, onEvent) => {
      requests.push(request)
      if (options.managerFault === 'invalid_json' && request.outputSchema?.name === 'manager_review' && requests.filter((r) => r.outputSchema?.name === 'manager_review').length === 1) {
        onEvent({ type: 'usage', requestId: request.requestId, inputTokens: 10, outputTokens: 4, totalTokens: 14, source: 'provider_actual' })
        throw new Error('invalid_structured_output')
      }
      const events = script(request); for (const event of events) onEvent(event); return events
    },
    event: (requestId, event) => {
      const result = tasks.handleProviderEvent(requestId, event)
      if (result?.request) executor.submit(result.request)
      else if (result?.event === 'assignment_completed' && result.detail.handoffs.at(-1)?.toSupervisor) executor.submit(tasks.beginManagerReview(result.detail.run!.id))
    },
    failed: (_runId, code) => { failures.push(code) }
  })
  let started: ReturnType<TaskService['confirmAndStart']> | undefined
  if (!options.database) {
    const draft = tasks.createDraft({ conversationId: 'fixture', sourceMessageIds: ['fixture-message'], goal: '员工按序读取并汇总 fixture。', acceptanceCriteria: ['给出已核验结论'], employeeVersionIds: Array.from({ length: members }, (_, i) => `fixture.version.${i}`), authorizationMode: options.approval ? 'approval_required' : 'full_access' })
    if (options.maxSteps) kernel.save({ entityType: 'TaskDraft', entity: { ...draft.draft, budget: { ...draft.draft.budget, maxSteps: options.maxSteps } }, immutable: false }, 'fixture.budget', {})
    started = tasks.confirmAndStart(draft.draft.id)
  }
  const runId = started?.run!.id ?? tasks.list()[0].run!.id
  const detail = () => tasks.detailByRun(runId)
  const decide = async (approved: boolean) => {
    const action = detail().toolActions.find((item) => item.state === 'pending')!
    executor.assertApprovalReady(action.id, approved)
    const updated = await gateway.decide(action.id, approved, (item) => executor.actionCommitted(item))
    kernel.transaction(() => {
      executor.afterDecision(updated)
      const resumed = tasks.resumeAfterTool(updated)
      if (resumed.request) executor.submit(resumed.request)
    })
    return updated
  }
  const suspended = async () => vi.waitFor(() => expect(executor.checkpoints.latest(runId)?.status).toBe('suspended'))
  const complete = async () => vi.waitFor(() => { expect(failures).toEqual([]); expect(detail().run?.state).toBe('succeeded') })
  return { database, store, kernel, tasks, gateway, runner, executor, requests, failures, started, runId, detail, decide, suspended, complete }
}

describe('SDK parent/employee graph under Runtime authority', () => {
  it('advances frozen assignments without any paid dispatch request or ledger entry', async () => {
    const f = setup(); f.executor.submit(f.started!.request); await f.complete()
    expect(f.requests.filter((request) => (request.input as ProviderConversationInput).tools?.some((tool) => tool.name.startsWith('delegate_')))).toEqual([])
    expect(f.detail().checkpoints.filter((item) => item.phase === 'provider_step' && item.payload.stage === 'manager_dispatch')).toEqual([])
    expect(f.requests).toHaveLength(5)
    expect(f.store.list('BudgetLedgerEntry')).toHaveLength(5)
    expect(f.runner.mock.calls.map(([tool]) => tool.id)).toEqual([readId, writeId])
    expect(f.executor.checkpoints.latest(f.runId)?.dispatch).toMatchObject({ source: 'runtime_frozen_plan', assignmentId: f.detail().assignments[1].id, employeeVersionId: 'fixture.version.1' })
  })

  it.each(['semantic', 'invalid_json'] as const)('repairs manager %s failures within the real SDK loop without redoing employee tools', async (managerFault) => {
    const f = setup({ managerFault }); f.executor.submit(f.started!.request); await f.complete()
    expect(f.runner).toHaveBeenCalledTimes(2)
    expect(f.detail().assignments).toHaveLength(2)
    expect(f.detail().toolActions).toHaveLength(2)
    const reviews = f.requests.filter((r) => r.outputSchema?.name === 'manager_review')
    expect(reviews).toHaveLength(2)
    expect(reviews.every((r) => (r.input as ProviderConversationInput).items.length === 1)).toBe(true)
    expect(f.detail().checkpoints.some((c) => c.phase === 'manager_rework')).toBe(false)
    expect(f.detail().checkpoints.filter((c) => c.phase === 'provider_step' && c.payload.stage === 'manager_format_correction')).toHaveLength(1)
    expect(f.store.list<any>('BudgetLedgerEntry').filter((entry) => reviews.some((r) => r.requestId === entry.requestId))).toHaveLength(2)
  })

  it('dispatches two frozen employees in order and charges manager + children to the same Run', async () => {
    const f = setup(); f.executor.submit(f.started!.request); await f.complete()
    expect(f.detail().assignments.map((item) => item.state)).toEqual(['succeeded', 'succeeded'])
    expect(f.runner.mock.calls.map(([tool]) => tool.id)).toEqual([readId, writeId])
    expect(f.detail().handoffs).toHaveLength(2)
    expect(f.detail().delivery).toBeDefined()
    expect(f.requests).toHaveLength(5) // 4 employee + 1 manager review; Runtime dispatch is free.
    expect(f.store.list('BudgetLedgerEntry')).toHaveLength(5)
    expect(f.detail().checkpoints.filter((item) => item.phase === 'provider_step')).toHaveLength(5)
    const secondInput = f.requests[2].input as ProviderConversationInput
    expect(JSON.stringify(secondInput)).toContain('HandoffEnvelope')
    expect(f.executor.checkpoints.latest(f.runId)?.status).toBe('completed')
  })

  it('persists a native nested interruption before accepting approval and resumes each action once', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const snapshot = f.executor.checkpoints.latest(f.runId)!
    expect(snapshot.state).toBeTruthy()
    expect(snapshot.tool?.completedApplied).toBe(true)
    expect(f.requests).toHaveLength(1)
    expect(f.runner).not.toHaveBeenCalled()
    expect(f.detail().assignments[1].state).toBe('pending')
    const oldId = snapshot.checkpointId
    const first = await f.decide(true)
    await vi.waitFor(() => expect(f.detail().toolActions).toHaveLength(2)); await f.suspended()
    await expect(f.gateway.decide(first.id, true)).rejects.toThrow('tool_action_not_awaiting_approval')
    expect(() => f.executor.checkpoints.latest(f.runId, oldId)).toThrow('stale_sdk_checkpoint')
    await f.decide(true); await f.complete()
    expect(f.runner).toHaveBeenCalledTimes(2)
    expect(f.detail().approvals.map((item) => item.decision)).toEqual(['approved', 'approved'])
  })

  it('recreates the frozen SDK graph after restart without model calls while approval is pending', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const before = f.detail(), grantBefore = f.store.list('RunGrant'), snapshot = f.executor.checkpoints.latest(f.runId)!
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    expect(await restored.executor.recover()).toContain(f.runId)
    expect(restored.requests).toHaveLength(0)
    expect(restored.detail().approvals[0].id).toBe(before.approvals[0].id)
    expect(restored.executor.checkpoints.latest(f.runId)?.checkpointId).toBe(snapshot.checkpointId)
    await restored.decide(true)
    await vi.waitFor(() => expect(restored.detail().toolActions).toHaveLength(2)); await restored.suspended()
    await restored.decide(true); await restored.complete()
    expect(restored.runner).toHaveBeenCalledTimes(2)
    expect(restored.detail().revision?.authorizationMode).toBe('approval_required')
    expect(restored.store.list('RunGrant')).toEqual(grantBefore)
  })

  it('maps rejection into the native state and never executes or starts downstream employees', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    await f.decide(false)
    await vi.waitFor(() => expect(f.executor.checkpoints.latest(f.runId)?.status).toBe('rejected'))
    expect(f.runner).not.toHaveBeenCalled()
    expect(f.requests).toHaveLength(1)
    expect(f.detail().run?.state).toBe('failed')
    expect(f.detail().delivery).toBeUndefined()
  })

  it('does not execute an expired grant or restore a different approval snapshot', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const grant = f.store.list<RunGrant>('RunGrant')[0]
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(grant.expiresAt) + 1)
    expect(() => f.executor.assertApprovalReady(f.detail().toolActions[0].id)).toThrow('run_grant_expired')
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('rejects corrupted state before resuming a tool', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const cp = f.detail().checkpoints.filter((item) => item.phase === 'sdk_execution').at(-1)!
    // Simulate disk corruption, bypassing the immutable application API.
    f.store.database.exec('DROP TRIGGER immutable_entity_no_update')
    f.store.database.prepare('UPDATE entity_records SET payload_json = ? WHERE entity_type = ? AND entity_id = ?').run(JSON.stringify({ ...cp, payload: { ...cp.payload, execution: { status: 'resuming', state: 'tampered' } } }), 'Checkpoint', cp.id)
    expect(() => f.executor.assertApprovalReady(f.detail().toolActions[0].id)).toThrow('sdk_checkpoint_integrity_failed')
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('applies the shared Provider budget to actual calls while Runtime dispatch uses no steps', async () => {
    const f = setup({ maxSteps: 2 }); f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.detail().run?.state).toBe('failed'))
    expect(f.detail().assignments[0].state).toBe('succeeded')
    expect(f.detail().assignments[1].summary).toContain('run_step_budget_exhausted')
    expect(f.requests).toHaveLength(2)
    expect(f.detail().checkpoints.filter((item) => item.phase === 'provider_step')).toHaveLength(2)
    expect(f.detail().delivery).toBeUndefined()
  })

  it.each(['runtime', 'untagged_provider'] as const)('reconstructs the prepare-before-RunState window from %s receipts without charging or calling the model again', async (source) => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const prepared = f.detail().checkpoints.filter((item) => item.phase === 'sdk_execution' && (item.payload.execution as any).status === 'prepared').at(-1)!
    f.store.database.exec('DROP TRIGGER immutable_entity_no_delete')
    for (const cp of f.detail().checkpoints.filter((item) => item.phase === 'sdk_execution' && item.sequence > prepared.sequence)) f.store.database.prepare('DELETE FROM entity_records WHERE entity_type = ? AND entity_id = ?').run('Checkpoint', cp.id)
    if (source === 'untagged_provider') {
      const saved = f.executor.checkpoints.latest(f.runId)!, assignment = f.detail().assignments[0]
      const name = `delegate_${sdkDigest(assignment.employeeVersionId).slice(0, 20)}`
      const request: ProviderRequest = { ...f.started!.request, requestId: `historical-dispatch-${assignment.id}`, input: { schemaVersion: 2, items: [], tools: [{ name, description: 'Historical paid dispatch fixture', parameters: { type: 'object', properties: { assignmentId: { type: 'string', const: assignment.id } }, required: ['assignmentId'], additionalProperties: false } }] } }
      const events = response(request, { call: { name, arguments: { assignmentId: assignment.id } } })
      const step = f.detail().checkpoints.find((item) => item.phase === 'provider_step')!
      f.kernel.save({ entityType: 'Checkpoint', entity: { ...step, id: request.requestId, assignmentId: undefined, sequence: Math.max(...f.detail().checkpoints.map((item) => item.sequence)) + 1, payload: { ...step.payload, requestId: request.requestId, stage: 'manager_dispatch' } }, immutable: true }, 'fixture.historical_dispatch', {})
      f.tasks.coordinatorUsage(f.runId, events.find((event) => event.type === 'usage')!)
      f.executor.checkpoints.save(f.runId, { ...saved, dispatch: { assignmentId: assignment.id, request, events } })
      expect(f.executor.checkpoints.latest(f.runId)!.dispatch!.source).toBeUndefined()
    }
    const ledgerBefore = f.store.list('BudgetLedgerEntry')
    const dispatchBefore = f.executor.checkpoints.latest(f.runId)!.dispatch!
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    await restored.executor.recover(); await restored.suspended()
    expect(restored.requests).toHaveLength(0)
    expect(restored.runner).not.toHaveBeenCalled()
    expect(restored.store.list('BudgetLedgerEntry')).toEqual(ledgerBefore)
    expect(restored.detail().approvals).toHaveLength(1)
    expect(restored.executor.checkpoints.latest(f.runId)!.state).toContain(sdkDispatchResponse(dispatchBefore).output[0].type === 'function_call' ? (sdkDispatchResponse(dispatchBefore).output[0] as { callId: string }).callId : '')
    await restored.decide(true)
    await vi.waitFor(() => expect(restored.detail().toolActions).toHaveLength(2)); await restored.suspended()
    await restored.decide(true); await restored.complete()
    expect(restored.runner).toHaveBeenCalledTimes(2)
  })

  it('rolls back prepared actions, approval and assignment when the durable receipt cannot commit', async () => {
    const f = setup({ approval: true })
    const save = f.executor.checkpoints.save.bind(f.executor.checkpoints)
    vi.spyOn(f.executor.checkpoints, 'save').mockImplementation((runId, state) => {
      if (state.status === 'prepared') throw new Error('injected_checkpoint_failure')
      return save(runId, state)
    })
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.detail().run?.state).toBe('failed'))
    expect(f.detail().toolActions).toEqual([])
    expect(f.detail().approvals).toEqual([])
    expect(f.detail().assignments[0].awaitingToolActionId).toBeUndefined()
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('commits Runtime dispatch before child I/O and fails closed if that receipt cannot commit', async () => {
    const f = setup(), save = f.executor.checkpoints.save.bind(f.executor.checkpoints)
    vi.spyOn(f.executor.checkpoints, 'save').mockImplementation((runId, state) => {
      if (state.dispatch?.source === 'runtime_frozen_plan' && !state.tool) throw new Error('injected_dispatch_commit_failure')
      return save(runId, state)
    })
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.failures).toContain('injected_dispatch_commit_failure'))
    expect(f.requests).toEqual([]); expect(f.runner).not.toHaveBeenCalled()
    expect(f.detail().run?.state).toBe('failed')
  })

  it('commits approval, running reservation and SDK checkpoint together before external I/O', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const action = f.detail().toolActions[0]
    await expect(f.gateway.decide(action.id, true, () => { throw new Error('injected_decision_failure') })).rejects.toThrow('injected_decision_failure')
    expect(f.detail().toolActions[0].state).toBe('pending')
    expect(f.detail().approvals[0].decision).toBe('pending')
    expect(f.runner).not.toHaveBeenCalled()
    f.runner.mockImplementation(async (_tool, parameters) => {
      expect(f.store.database.isTransaction).toBe(false)
      expect(f.detail().toolActions.find((item) => item.id === action.id)?.state).toBe('running')
      expect(f.detail().approvals[0].decision).toBe('approved')
      expect(f.executor.checkpoints.latest(f.runId)?.status).toBe('resuming')
      return { value: parameters.value }
    })
    await f.decide(true)
    await vi.waitFor(() => expect(f.detail().toolActions).toHaveLength(2)); await f.suspended()
  })

  it('does not retry an uncertain write after restart; a verified resolution only returns the saved result', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended(); await f.decide(true)
    await vi.waitFor(() => expect(f.detail().toolActions).toHaveLength(2)); await f.suspended()
    const write = f.detail().toolActions[1]
    // Model the durable point after approval/start and process death before result commit.
    f.kernel.transaction(() => {
      const approval = f.detail().approvals.find((item) => item.toolActionId === write.id)!
      f.kernel.save({ entityType: 'Approval', entity: { ...approval, decision: 'approved', decidedAt: new Date().toISOString() }, immutable: false }, 'fixture.approved', {})
      const running: ToolAction = { ...write, state: 'running', startedAt: new Date().toISOString() }
      f.kernel.save({ entityType: 'ToolAction', entity: running, immutable: false }, 'fixture.started', {})
      f.executor.actionCommitted(running)
    })
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    await restored.executor.recover()
    expect(restored.detail().toolActions[1].state).toBe('result_unknown')
    expect(restored.requests).toHaveLength(0)
    expect(restored.runner).not.toHaveBeenCalled()
    const settled = restored.kernel.transaction(() => {
      const action = restored.gateway.resolveUnknown(write.id, 'succeeded', { verified: true, value: 'verified fixture' })
      restored.executor.actionCommitted(action)
      const next = restored.tasks.resumeAfterTool(action)
      if (next.request) restored.executor.submit(next.request)
      return action
    })
    expect(settled.state).toBe('succeeded'); await restored.complete()
    expect(restored.runner).not.toHaveBeenCalled()
    expect(restored.detail().toolActions).toHaveLength(2)
  })

  it('fails a tool proposed by the wrong employee before Gateway preparation', async () => {
    const f = setup()
    f.executor['ports'].execute = async (request, onEvent) => {
      f.requests.push(request)
      const input = request.input as ProviderConversationInput, definition = input.tools![0]
      const events = definition.name.startsWith('delegate_')
        ? response(request, { call: { name: definition.name, arguments: { assignmentId: (definition.parameters.properties as any).assignmentId.const } } })
        : response(request, { call: { name: 'propose_tool_action', arguments: { toolVersionId: writeId, parameters: { value: 'outside employee scope' } } } })
      for (const event of events) onEvent(event)
      return events
    }
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.detail().run?.state).toBe('failed'))
    expect(f.detail().assignments[0].invalidToolProposalCount).toBe(3)
    expect(f.runner).not.toHaveBeenCalled(); expect(f.detail().toolActions).toEqual([])
  })

  it('preserves pending approvals and the exact grant through application shutdown', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const grant = f.store.list('RunGrant'), approval = f.detail().approvals[0]
    expect(f.tasks.requestShutdown().ready).toBe(true)
    expect(f.store.list('RunGrant')).toEqual(grant)
    expect(f.detail().approvals[0]).toEqual(approval)
    expect(f.detail().run?.state).toBe('paused')
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('pauses a live full-access uncertain write and resumes after manual settlement without restart or repeated write', async () => {
    const f = setup({ runner: async (tool, parameters) => { if (tool.id === writeId) throw new Error('tool_timeout'); return { value: parameters.value } } })
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.executor.checkpoints.latest(f.runId)?.status).toBe('waiting_result'))
    const write = f.detail().toolActions.find((item) => item.toolVersionId === writeId)!
    expect(write.state).toBe('result_unknown')
    expect(f.detail().run?.state).toBe('paused')
    expect(f.detail().assignments[1].providerRequestId).toBeUndefined()
    expect(f.runner).toHaveBeenCalledTimes(2)
    f.kernel.transaction(() => {
      const action = f.gateway.resolveUnknown(write.id, 'succeeded', { verified: true, value: 'verified fixture' })
      f.executor.actionCommitted(action)
      const resumed = f.tasks.resumeAfterTool(action)
      if (resumed.request) f.executor.submit(resumed.request)
    })
    await f.complete(); expect(f.runner).toHaveBeenCalledTimes(2)
  })

  it('cancels before the first employee response without dispatching downstream', async () => {
    const f = setup()
    const execute = f.executor['ports'].execute
    f.executor['ports'].execute = async (request, event, signal) => {
      if ((request.input as ProviderConversationInput).tools?.[0]?.name === 'propose_tool_action') throw new Error('cancelled')
      return execute(request, event, signal)
    }
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.failures).toContain('cancelled'))
    expect(f.detail().run?.state).toBe('failed')
    expect(f.detail().assignments[1].state).toBe('pending')
    expect(f.detail().delivery).toBeUndefined()
    expect(f.runner).not.toHaveBeenCalled()
  })

  it.each(['multiple_running', 'unfinished_predecessor', 'unfrozen_version', 'other_run', 'stale_request', 'altered_input'] as const)('rejects %s before Runtime dispatch can enter a child or call a provider', (fault) => {
    const f = setup(), request = structuredClone(f.started!.request), assignment = f.detail().assignments[0]
    expect(f.tasks.runtimeDispatchContext(f.runId, request).assignmentId).toBe(assignment.id)
    if (fault === 'multiple_running') f.kernel.save({ entityType: 'Assignment', entity: { ...f.detail().assignments[1], state: 'running', providerRequestId: 'ambiguous' }, immutable: false }, 'fixture', {})
    if (fault === 'unfinished_predecessor') f.kernel.save({ entityType: 'Assignment', entity: { ...assignment, sequence: 3 }, immutable: false }, 'fixture', {})
    if (fault === 'unfrozen_version') {
      const version = { ...f.detail().employeeVersions[0], id: 'unfrozen-version' }
      f.kernel.save({ entityType: 'EmployeeVersion', entity: version, immutable: true }, 'fixture', {})
      f.kernel.save({ entityType: 'Assignment', entity: { ...assignment, employeeVersionId: version.id }, immutable: false }, 'fixture', {})
    }
    if (fault === 'other_run') {
      const other = f.tasks.createDraft({ conversationId: 'other', sourceMessageIds: ['other'], goal: '其他任务', acceptanceCriteria: ['核验'], employeeVersionIds: ['fixture.version.0'] })
      Object.assign(request, f.tasks.confirmAndStart(other.draft.id).request)
    }
    if (fault === 'stale_request') request.requestId = 'obsolete-request'
    if (fault === 'altered_input') request.input += '\nInjected policy'
    expect(() => f.tasks.runtimeDispatchContext(f.runId, request)).toThrow('invalid_sdk_dispatch')
    expect(f.requests).toEqual([]); expect(f.runner).not.toHaveBeenCalled()
  })

  it('keeps Runtime control usage at zero and rejects cross-assignment or request dispatch receipts', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const saved = f.executor.checkpoints.latest(f.runId)!, dispatch = saved.dispatch!
    expect(dispatch.source).toBe('runtime_frozen_plan')
    const control = sdkDispatchResponse(dispatch)
    expect(control.usage).toMatchObject({ requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    expect(control.output).toHaveLength(1)
    for (const changed of [{ assignmentId: f.detail().assignments[1].id }, { employeeVersionId: 'fixture.version.1' }, { requestId: 'other-request' }, { callId: 'other-call' }]) {
      expect(() => f.executor.checkpoints.save(f.runId, { ...saved, dispatch: { ...dispatch, ...changed } })).toThrow('sdk_dispatch_binding_failed')
    }
    expect(f.executor.checkpoints.latest(f.runId)!.checkpointId).toBe(saved.checkpointId)
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('keeps simultaneous Run graphs, receipts and handoffs isolated', async () => {
    const f = setup()
    const other = f.tasks.createDraft({ conversationId: 'other', sourceMessageIds: ['other-message'], goal: '另一项独立受控任务', acceptanceCriteria: ['给出已核验结论'], employeeVersionIds: ['fixture.version.0', 'fixture.version.1'] })
    const second = f.tasks.confirmAndStart(other.draft.id)
    f.executor.submit(f.started!.request); f.executor.submit(second.request)
    await f.complete(); await vi.waitFor(() => expect(f.tasks.detailByRun(second.run!.id).run?.state).toBe('succeeded'))
    expect(f.runner).toHaveBeenCalledTimes(4)
    const left = f.executor.checkpoints.latest(f.runId)!, right = f.executor.checkpoints.latest(second.run!.id)!
    expect(left.bindingSha256).not.toBe(right.bindingSha256)
    const secondAssignments = f.tasks.detailByRun(second.run!.id).assignments.map((item) => item.id)
    expect(JSON.stringify(left.history)).not.toContain(secondAssignments[0])
    expect(f.detail().handoffs.every((item) => item.runId === f.runId)).toBe(true)
  })

  it('rebuilds an interrupted first model request without accepting its obsolete continuation ID', async () => {
    const f = setup()
    f.executor['ports'].execute = async (request) => { f.requests.push(request); return new Promise(() => {}) }
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.requests).toHaveLength(1))
    const oldRequest = f.started!.request.requestId
    expect(f.executor.checkpoints.latest(f.runId)?.tool).toBeUndefined()
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    const handled = await restored.executor.recover()
    const recovered = restored.tasks.recoverPendingRequests(new Set(), handled)
    expect(recovered).toHaveLength(1)
    expect(recovered[0].requestId).not.toBe(oldRequest)
    expect(() => restored.executor.submit(recovered[0])).not.toThrow()
    await restored.complete()
    expect(restored.runner).toHaveBeenCalledTimes(2)
  })

  it('carries frozen acceptance on every child call without accumulating superseded Runtime policy messages', async () => {
    const f = setup(); f.executor.submit(f.started!.request); await f.complete()
    const employeeCalls = f.requests.filter((request) => !request.outputSchema && !(request.input as ProviderConversationInput).tools?.[0]?.name.startsWith('delegate_'))
    for (const request of employeeCalls) {
      const input = request.input as ProviderConversationInput
      expect(input.instructions).toContain('给出已核验结论')
      expect(input.items.filter((item) => item.type === 'message' && item.role === 'user')).toHaveLength(1)
    }
    expect((employeeCalls[1].input as ProviderConversationInput).items.some((item) => item.type === 'function_call_result')).toBe(true)
  })

  it('safely pauses at a model boundary on application shutdown instead of failing a valid grant', async () => {
    const f = setup()
    const execute = f.executor['ports'].execute
    let release!: () => void
    f.executor['ports'].execute = async (request, event, signal) => {
      await new Promise<void>((resolve) => { release = resolve })
      return execute(request, event, signal)
    }
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(release).toBeDefined())
    expect(f.tasks.requestShutdown().ready).toBe(false)
    expect(f.detail().run?.state).toBe('pausing')
    release()
    await vi.waitFor(() => expect(f.detail().run?.state).toBe('paused'))
    expect(f.tasks.requestShutdown().ready).toBe(true)
    expect(f.failures).toEqual([]); expect(f.runner).not.toHaveBeenCalled()
    expect(f.detail().assignments[0].providerRequestId).toBeUndefined()
  })

  it('retries a rejected SDK task with its frozen employees, approval mode and budget', async () => {
    const f = setup({ approval: true, maxSteps: 8 }); f.executor.submit(f.started!.request); await f.suspended(); await f.decide(false)
    await vi.waitFor(() => expect(f.executor.checkpoints.latest(f.runId)?.status).toBe('rejected'))
    const previous = f.detail(), version = previous.employeeVersions[0]
    const replacement = { ...version, id: 'fixture.replacement', version: 2, capabilityVersionIds: ['fixture.cap.1'] }
    const employee = f.store.get<Employee>('Employee', version.employeeId)!
    f.kernel.save({ entityType: 'EmployeeVersion', entity: replacement, immutable: true }, 'fixture.new_version', {})
    f.kernel.save({ entityType: 'Employee', entity: { ...employee, activeVersionId: replacement.id }, immutable: false }, 'fixture.new_version', {})
    const retried = f.tasks.retryFailedTask(previous.task!.id)
    expect(retried.revision?.id).toBe(previous.revision?.id)
    expect(retried.revision?.budget.maxSteps).toBe(8)
    expect(retried.revision?.authorizationMode).toBe('approval_required')
    expect(retried.revision?.employeeVersionIds).toEqual(previous.revision?.employeeVersionIds)
    expect(f.store.get<RunGrant>('RunGrant', retried.run!.runGrantId)?.authorizationMode).toBe('approval_required')
    expect(retried.run?.sdkSupervisor).toEqual(previous.run?.sdkSupervisor)
    expect(f.tasks.detailByRun(f.runId).run?.id).toBe(f.runId)
    f.tasks.failRun(f.runId, 'late_old_run_failure')
    expect(f.tasks.detailByTask(previous.task!.id).task?.state).toBe('running')
    f.executor.submit(retried.request)
    await vi.waitFor(() => expect(f.executor.checkpoints.latest(retried.run!.id)?.status).toBe('suspended'))
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('recovers a shutdown crash during a running write as unknown instead of failing or retrying it', async () => {
    const f = setup({ runner: async (tool) => tool.id === writeId ? new Promise(() => {}) : { value: 'verified fixture' } })
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.detail().toolActions.find((item) => item.toolVersionId === writeId)?.state).toBe('running'))
    expect(f.tasks.requestShutdown().ready).toBe(false)
    expect(f.detail().run?.state).toBe('pausing')
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    await restored.executor.recover()
    expect(restored.detail().run?.state).toBe('paused')
    expect(restored.detail().toolActions.find((item) => item.toolVersionId === writeId)?.state).toBe('result_unknown')
    expect(restored.executor.checkpoints.latest(f.runId)?.status).toBe('waiting_result')
    expect(restored.requests).toEqual([]); expect(restored.runner).not.toHaveBeenCalled()
    expect(restored.failures).toEqual([])
    const write = restored.detail().toolActions.find((item) => item.toolVersionId === writeId)!
    restored.kernel.transaction(() => {
      const action = restored.gateway.resolveUnknown(write.id, 'succeeded', { verified: true, value: 'verified fixture' })
      restored.executor.actionCommitted(action)
      const resumed = restored.tasks.resumeAfterTool(action)
      if (resumed.request) restored.executor.submit(resumed.request)
    })
    await restored.complete()
    expect(restored.runner).not.toHaveBeenCalled()
    expect(restored.detail().checkpoints.find((item) => item.phase === 'shutdown_requested')?.payload.consumedAt).toBeTruthy()
  })

  it.each(['next_employee', 'after_tool_model'])('discards interrupted model context at %s without rerunning a completed action', async (boundary) => {
    const f = setup()
    const execute = f.executor['ports'].execute
    f.executor['ports'].execute = async (request, event, signal) => {
      const input = request.input as ProviderConversationInput
      const pause = boundary === 'next_employee'
        ? f.tasks.employeeExecutionContext(request.requestId)?.version.id === 'fixture.version.1' && f.detail().assignments[0].state === 'succeeded'
        : !request.outputSchema && !input.tools?.length
      if (pause) { f.requests.push(request); return new Promise(() => {}) }
      return execute(request, event, signal)
    }
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.requests.at(-1)?.requestId).toBe(f.detail().assignments.find((item) => item.state === 'running')?.providerRequestId))
    await vi.waitFor(() => expect(f.requests).toHaveLength(boundary === 'next_employee' ? 3 : 2))
    expect(f.runner).toHaveBeenCalledTimes(1)
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    const handled = await restored.executor.recover()
    for (const request of restored.tasks.recoverPendingRequests(new Set(), handled)) expect(() => restored.executor.submit(request)).not.toThrow()
    await restored.complete()
    expect(restored.runner).toHaveBeenCalledTimes(1)
    expect(restored.runner.mock.calls[0][0].id).toBe(writeId)
  })

  it('recovers a committed rejection even if the process died before the RPC resumed the SDK', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const stateBefore = f.executor.checkpoints.latest(f.runId)?.state
    await f.gateway.decide(f.detail().toolActions[0].id, false, (action) => f.executor.actionCommitted(action))
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    await restored.executor.recover()
    await vi.waitFor(() => expect(restored.detail().run?.state).toBe('failed'))
    await vi.waitFor(() => expect(restored.executor.checkpoints.latest(f.runId)?.state).not.toBe(stateBefore))
    expect(restored.requests).toEqual([]); expect(restored.runner).not.toHaveBeenCalled()
  })

  it('rejects changed action parameters before approval without invoking the gateway runner', async () => {
    const f = setup({ approval: true }); f.executor.submit(f.started!.request); await f.suspended()
    const action = f.detail().toolActions[0]
    f.kernel.save({ entityType: 'ToolAction', entity: { ...action, parameters: { value: 'changed after approval request' } }, immutable: false }, 'fixture.tampered', {})
    expect(() => f.executor.assertApprovalReady(action.id)).toThrow('sdk_action_binding_failed')
    expect(f.runner).not.toHaveBeenCalled()
  })

  it('resumes a full-access prepared action after shutdown without losing its completion correlation', async () => {
    const f = setup()
    vi.spyOn(f.gateway, 'executePrepared').mockImplementation(async () => new Promise(() => {}))
    f.executor.submit(f.started!.request)
    await vi.waitFor(() => expect(f.executor.checkpoints.latest(f.runId)?.status).toBe('prepared'))
    expect(f.detail().toolActions[0].state).toBe('pending')
    f.tasks.requestShutdown()
    f.store.close(); stores.splice(stores.indexOf(f.store), 1)
    const restored = setup({ database: f.database })
    const handled = await restored.executor.recover()
    for (const request of restored.tasks.recoverPendingRequests(new Set(), handled)) restored.executor.submit(request)
    await restored.complete()
    expect(restored.runner).toHaveBeenCalledTimes(2)
    expect(restored.detail().toolActions).toHaveLength(2)
  })
})
