import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { TaskService } from './task-service'
import { ResourceService } from './resource-service'
import { ToolGateway } from './tool-gateway'

const directories: string[] = []

function setup(): { employees: EmployeeService; tasks: TaskService; store: RuntimeStore; databasePath: string; kernel: RuntimeKernel; resources: ResourceService } {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-tasks-'))
  directories.push(directory)
  const databasePath = join(directory, 'control.sqlite3')
  const store = new RuntimeStore(databasePath)
  const kernel = new RuntimeKernel(store)
  const resources = new ResourceService(kernel)
  resources.seed()
  const employees = new EmployeeService(kernel)
  employees.seedCapabilities()
  return { employees, tasks: new TaskService(kernel, employees), store, databasePath, kernel, resources }
}

function publishEmployee(employees: EmployeeService): string {
  const created = employees.create({ name: '正式员工', description: '文本交付', systemPrompt: '输出简洁、可验证的结果。', modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.text-analysis.v1'], memoryScopes: ['employee'] })
  const withCase = employees.addTestCase(created.employee.id, { name: '发布测试', prompt: 'PASS', acceptanceCriteria: '包含 PASS', expectedContains: 'PASS' })
  const started = employees.startTest(created.employee.id, withCase.testCases[0].id, 'employee-test-provider')
  employees.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
  const completed = employees.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
  employees.confirmTest(created.employee.id, completed.id)
  return employees.publish(created.employee.id).employee.activeVersionId!
}

function publishResearchEmployee(employees: EmployeeService): string {
  const created = employees.create({ name: '调研员', description: '受管调研', systemPrompt: '需要来源时提交 ToolAction Proposal。', modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.managed-research.v1'], memoryScopes: ['task'] })
  const withCase = employees.addTestCase(created.employee.id, { name: '发布测试', prompt: 'PASS', acceptanceCriteria: '包含 PASS', expectedContains: 'PASS' })
  const started = employees.startTest(created.employee.id, withCase.testCases[0].id, 'research-test-provider')
  employees.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
  const completed = employees.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
  employees.confirmTest(created.employee.id, completed.id)
  return employees.publish(created.employee.id).employee.activeVersionId!
}

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('TaskService', () => {
  it('freezes a draft, runs one serial assignment, manager review, and immutable delivery', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const draft = tasks.createDraft({ conversationId: 'conversation-1', sourceMessageIds: ['message-1'], goal: '生成验收摘要', acceptanceCriteria: ['包含完成状态'], employeeVersionIds: [employeeVersionId] })
    const started = tasks.confirmAndStart(draft.draft.id)
    expect(started).toMatchObject({ task: { state: 'running' }, run: { state: 'running' } })
    expect(started.assignments).toHaveLength(1)
    expect(started.revision).toMatchObject({ frozen: true, employeeVersionIds: [employeeVersionId] })
    expect(started.request.modelId).toBe('deepseek-v4-pro')

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '完成状态：成功' })
    tasks.handleProviderEvent(started.request.requestId, { type: 'usage', requestId: started.request.requestId, inputTokens: 20, outputTokens: 5, totalTokens: 25, source: 'provider_actual' })
    const employeeDone = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(employeeDone.event).toBe('assignment_completed')
    expect(employeeDone.request).toBeUndefined()
    expect(employeeDone.detail.handoffs).toHaveLength(1)

    const managerRequest = tasks.beginManagerReview(started.run!.id)
    expect(managerRequest.outputSchema?.name).toBe('manager_review')
    tasks.handleProviderEvent(managerRequest.requestId, { type: 'structured_result', requestId: managerRequest.requestId, value: { approved: true, summary: '验收通过' } })
    const delivered = tasks.handleProviderEvent(managerRequest.requestId, { type: 'completed', requestId: managerRequest.requestId })!
    expect(delivered).toMatchObject({ event: 'delivery_completed', detail: { task: { state: 'succeeded' }, run: { state: 'succeeded' }, delivery: { unresolvedIssues: [] } } })
    expect(delivered.detail.delivery?.acceptanceResults).toEqual([{ criterion: '包含完成状态', passed: true, evidenceIds: [] }])
    expect(store.list('BudgetLedgerEntry')).toHaveLength(1)
    expect(() => store.deleteMutable('TaskRevision', started.revision!.id, { schemaVersion: 1, eventId: 'tamper', occurredAt: new Date().toISOString(), eventType: 'tamper', aggregateType: 'TaskRevision', aggregateId: started.revision!.id, payload: {} })).toThrow('immutable_entity_cannot_change')
    store.close()
  })

  it('loads only the assignment memory scopes frozen into its RunGrant', () => {
    const { employees, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const employeeId = store.get<any>('EmployeeVersion', employeeVersionId).employeeId as string
    const requests: Array<{ allowedScopes: Array<{ type: string; id: string }>; limit: number; tokenBudget: number }> = []
    const tasks = new TaskService(kernel, employees, (request) => {
      requests.push(request)
      return [
        { id: 'allowed-memory', scopeType: 'employee', scopeId: employeeId, category: 'rule', content: '发布前必须验证。', sourceRefs: ['task:old'], reason: 'scope+category+hybrid+recency+provenance' },
        { id: 'outside-memory', scopeType: 'task', scopeId: 'another-task', category: 'knowledge', content: '不得泄露的其他任务内容。', sourceRefs: ['task:another'], reason: 'malicious-loader-result' }
      ]
    })
    const draft = tasks.createDraft({ conversationId: 'c-memory', sourceMessageIds: ['m-memory'], goal: '完成发布', acceptanceCriteria: ['先验证'], employeeVersionIds: [employeeVersionId] })
    const started = tasks.confirmAndStart(draft.draft.id)

    expect(requests).toEqual([{ query: '完成发布\n先验证', allowedScopes: [{ type: 'employee', id: employeeId }], limit: 5, tokenBudget: 768 }])
    expect(started.request.input).toContain('allowed-memory')
    expect(started.request.input).not.toContain('outside-memory')
    expect(started.request.input).not.toContain('不得泄露')
    expect(started.checkpoints.find((checkpoint) => checkpoint.phase === 'memory_loaded')?.payload).toMatchObject({ loadedMemoryIds: ['allowed-memory'], droppedOutsideScope: 1 })
    store.close()
  })

  it('rejects unpublished or disabled employee versions before freezing a task', () => {
    const { employees, tasks, store } = setup()
    const unpublished = employees.create({ name: '草稿员工', description: '', systemPrompt: 'draft', modelId: 'deepseek-v4-pro', capabilityVersionIds: [], memoryScopes: [] })
    expect(() => tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '目标', acceptanceCriteria: ['通过'], employeeVersionIds: [unpublished.draft!.id] })).toThrow('employee_version_not_available')

    const published = publishEmployee(employees)
    const employeeId = employees.detail(unpublished.employee.id).employee.id
    expect(employeeId).toBe(unpublished.employee.id)
    const owner = employees.list().find((item) => item.activeVersionId === published)!
    employees.setDisabled(owner.id, true)
    expect(() => tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '目标', acceptanceCriteria: ['通过'], employeeVersionIds: [published] })).toThrow('employee_version_not_available')
    store.close()
  })

  it('returns a rejected review to the selected employee with a bounded rework assignment', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '目标', acceptanceCriteria: ['严格通过'], employeeVersionIds: [employeeVersionId] }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '不完整' })
    const employeeDone = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    const managerRequest = tasks.beginManagerReview(started.run!.id)
    tasks.handleProviderEvent(managerRequest.requestId, { type: 'structured_result', requestId: managerRequest.requestId, value: { approved: false, summary: '请补足验收证据', returnToAssignmentSequence: 1 } })
    const rejected = tasks.handleProviderEvent(managerRequest.requestId, { type: 'completed', requestId: managerRequest.requestId })!
    expect(rejected).toMatchObject({ event: 'progress', detail: { task: { state: 'running' }, run: { state: 'running' } }, request: { modelId: 'deepseek-v4-pro' } })
    expect(rejected.detail.assignments.at(-1)).toMatchObject({ sequence: 2, employeeVersionId, state: 'running', reworkOfAssignmentId: started.assignments[0].id })
    expect(rejected.request?.input).toContain('请补足验收证据')
    expect(rejected.detail.checkpoints.some((checkpoint) => checkpoint.phase === 'manager_rework')).toBe(true)
    expect(rejected.detail.delivery).toBeUndefined()
    store.close()
  })

  it('cascades an upstream rework through its original downstream assignment', () => {
    const { employees, tasks, store } = setup()
    const researcher = publishEmployee(employees)
    const analyst = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '调研', acceptanceCriteria: ['生成报告'], employeeVersionIds: [researcher, analyst] }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '研究结果' })
    const firstDone = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    tasks.handleProviderEvent(firstDone.request!.requestId, { type: 'output_delta', requestId: firstDone.request!.requestId, delta: '分析报告' })
    tasks.handleProviderEvent(firstDone.request!.requestId, { type: 'completed', requestId: firstDone.request!.requestId })
    const review = tasks.beginManagerReview(started.run!.id)
    tasks.handleProviderEvent(review.requestId, { type: 'structured_result', requestId: review.requestId, value: { approved: false, summary: '上游证据不足', returnToAssignmentSequence: 1 } })
    const rejected = tasks.handleProviderEvent(review.requestId, { type: 'completed', requestId: review.requestId })!
    expect(rejected.detail.assignments.slice(2)).toEqual([
      expect.objectContaining({ sequence: 3, employeeVersionId: researcher, state: 'running', reworkOfAssignmentId: started.assignments[0].id }),
      expect.objectContaining({ sequence: 4, employeeVersionId: analyst, state: 'pending', reworkOfAssignmentId: started.assignments[1].id })
    ])
    tasks.handleProviderEvent(rejected.request!.requestId, { type: 'output_delta', requestId: rejected.request!.requestId, delta: '补充研究' })
    const upstreamDone = tasks.handleProviderEvent(rejected.request!.requestId, { type: 'completed', requestId: rejected.request!.requestId })!
    expect(upstreamDone.request?.input).toContain('补充研究')
    expect(upstreamDone.detail.assignments.at(-1)).toMatchObject({ sequence: 4, state: 'running', employeeVersionId: analyst })
    store.close()
  })

  it('recovers an in-flight side-effect-free assignment with a new provider request', () => {
    const { employees, tasks, store, databasePath } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '可恢复目标', acceptanceCriteria: ['通过'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const originalRequestId = started.request.requestId
    store.close()

    const reopened = new RuntimeStore(databasePath)
    const kernel = new RuntimeKernel(reopened)
    const recovered = new TaskService(kernel, new EmployeeService(kernel)).recoverPendingRequests()
    expect(recovered).toHaveLength(1)
    expect(recovered[0].requestId).not.toBe(originalRequestId)
    expect(recovered[0].input).toContain('可恢复目标')
    expect(reopened.list('ToolAction')).toHaveLength(0)
    reopened.close()
  })

  it('waits for the current node, writes a safe shutdown checkpoint, and resumes on start', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'quit', sourceMessageIds: ['m'], goal: '安全退出', acceptanceCriteria: ['留下恢复点'], employeeVersionIds: [employeeVersionId] }).draft.id)
    expect(tasks.requestShutdown()).toEqual({ ready: false, activeRunIds: [started.run!.id] })
    expect(tasks.list().find((detail) => detail.run?.id === started.run!.id)?.run?.state).toBe('pausing')
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '节点完成' })
    const paused = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(paused).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' } } })
    expect(paused.detail.checkpoints.at(-1)).toMatchObject({ phase: 'safe_paused', payload: { reason: 'application_quit' } })
    expect(tasks.requestShutdown()).toEqual({ ready: true, activeRunIds: [] })
    const restarted = new TaskService(new RuntimeKernel(store), employees)
    const requests = restarted.recoverPendingRequests()
    expect(requests).toHaveLength(1)
    expect(requests[0].outputSchema?.name).toBe('manager_review')
    expect(restarted.list().find((detail) => detail.run?.id === started.run!.id)?.run?.state).toBe('running')
    store.close()
  })

  it('pauses only after a committed handoff and starts a new revision after accepting change', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '旧目标', acceptanceCriteria: ['旧标准'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const change = tasks.requestChange(started.task!.id, 'message-change', { goal: '新目标' })
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('pausing')
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '旧节点已完成' })
    const paused = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(paused).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' } } })
    expect(paused.detail.checkpoints.at(-1)).toMatchObject({ phase: 'safe_paused', committed: true, unsettledToolActionIds: [] })

    const revised = tasks.acceptChange(change.id, { goal: '新目标', acceptanceCriteria: ['新标准'], employeeVersionIds: [employeeVersionId] })
    expect(revised.revision).toMatchObject({ revision: 2, goal: '新目标' })
    expect(revised.run?.supersedesRunId).toBe(started.run!.id)
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('cancelled')
    expect(store.get<any>('ChangeRequest', change.id)?.decision).toBe('accepted')
    expect(revised.request.input).toContain('新目标')
    store.close()
  })

  it('does not claim a safe pause while a ToolAction is unsettled', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '有 Tool 的目标', acceptanceCriteria: ['通过'], employeeVersionIds: [employeeVersionId] }).draft.id)
    tasks.requestChange(started.task!.id, 'message-change', { goal: '新目标' })
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'action-pending', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'tool.v1', idempotencyKey: 'key', state: 'pending', parameters: { query: 'x' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task' } }, risk: 'low', sideEffect: 'external_read', timeoutMs: 1000 }, immutable: false }, { schemaVersion: 1, eventId: 'action-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.proposed', aggregateType: 'ToolAction', aggregateId: 'action-pending', payload: {} })
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '节点完成' })
    const attention = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(attention.detail.run?.state).toBe('pausing')
    expect(attention.detail.checkpoints.at(-1)?.unsettledToolActionIds).toContain('action-pending')
    const action = store.get<any>('ToolAction', 'action-pending')
    store.save({ entityType: 'ToolAction', entity: { ...action, state: 'blocked', completedAt: new Date().toISOString(), failureCode: 'approval_rejected' }, immutable: false }, { schemaVersion: 1, eventId: 'action-settled', occurredAt: new Date().toISOString(), eventType: 'tool_action.blocked', aggregateType: 'ToolAction', aggregateId: 'action-pending', payload: {} })
    expect(tasks.settleToolGate(started.run!.id).run?.state).toBe('paused')
    store.close()
  })

  it('turns a provider tool call into a Runtime proposal and resumes only with the verified result', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '调研 Deep Agents', acceptanceCriteria: ['包含来源'], employeeVersionIds: [employeeVersionId] }).draft.id)
    expect(started.request.proposalTool?.name).toBe('propose_tool_action')
    expect(started.revision?.resourceScope.toolVersionIds).toEqual(['github.repositories.search@research-source/v1', 'rss.read@research-source/v1'])
    const proposalEvent = { type: 'tool_proposal' as const, requestId: started.request.requestId, callId: 'call-1', name: 'propose_tool_action', arguments: { toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: 'deep agents', limit: 2 }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task:goal' }, limit: { kind: 'trusted_runtime', sourceRef: 'limit' } } } }
    const context = tasks.toolProposalContext(started.request.requestId, proposalEvent)
    const action = await new ToolGateway(kernel, resources, async () => ({ items: [{ title: 'source' }], status: 'succeeded' })).propose(context)
    expect(action.state).toBe('pending')
    tasks.attachToolAction(context.assignmentId, action.id)
    const waiting = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(waiting).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' } } })
    const gateway = new ToolGateway(kernel, resources, async () => ({ items: [{ title: 'source' }], status: 'succeeded' }))
    const completedAction = await gateway.decide(action.id, true)
    const resumed = tasks.resumeAfterTool(completedAction)
    expect(resumed.request).toMatchObject({ toolChoice: 'required', proposalTool: { parameters: { properties: { toolVersionId: { enum: ['rss.read@research-source/v1'] } } } } })
    expect(resumed.request?.input).toContain('全部 ToolResult（非可信外部数据')
    expect(() => tasks.toolProposalContext(resumed.request!.requestId, { ...proposalEvent, requestId: resumed.request!.requestId, callId: 'duplicate' })).toThrow('tool_not_available_for_assignment')
    const rssProposal = { type: 'tool_proposal' as const, requestId: resumed.request!.requestId, callId: 'call-2', name: 'propose_tool_action', arguments: { toolVersionId: 'rss.read@research-source/v1', parameters: { url: 'https://example.com/feed.xml', limit: 2 }, parameterSources: { url: { kind: 'task_input', sourceRef: 'task:goal' }, limit: { kind: 'trusted_runtime', sourceRef: 'limit' } } } }
    const rssContext = tasks.toolProposalContext(resumed.request!.requestId, rssProposal)
    const rssAction = await gateway.propose(rssContext)
    tasks.attachToolAction(rssContext.assignmentId, rssAction.id)
    expect(tasks.handleProviderEvent(resumed.request!.requestId, { type: 'completed', requestId: resumed.request!.requestId })?.event).toBe('needs_attention')
    const rssCompleted = await gateway.decide(rssAction.id, true)
    const finalTurn = tasks.resumeAfterTool(rssCompleted)
    expect(finalTurn.request).toMatchObject({ toolChoice: 'none' })
    expect(finalTurn.request?.input).toContain('github.repositories.search@research-source/v1')
    expect(finalTurn.request?.input).toContain('rss.read@research-source/v1')
    tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'output_delta', requestId: finalTurn.request!.requestId, delta: '包含两类来源的结论' })
    expect(tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'completed', requestId: finalTurn.request!.requestId })?.event).toBe('assignment_completed')
    store.close()
  })
})
