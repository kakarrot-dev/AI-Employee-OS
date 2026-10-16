import { Agent, Runner, RunState, ToolCallError, tool, type AgentInputItem, type Model, type ModelRequest, type ModelResponse } from '@openai/agents-core'
import { z } from 'zod'
import type { ProviderConversationInput, ProviderEvent, ProviderRequest } from '../provider/contract'
import type { Approval, Assignment, Checkpoint, EmployeeVersion, Run, ToolAction } from './domain'
import { sdkInputItems } from './employee-executor'
import type { EmployeeExecutorPorts } from './employee-executor'
import { renderHandoffEnvelope } from './handoff-contract'
import { RuntimeKernel } from './kernel'
import { SdkCheckpointStore, TEAM_EXECUTOR, actionDigest, sdkDigest, type SdkDispatchReceipt, type SdkExecutionState, type SdkToolReceipt, type StoredSdkState } from './sdk-checkpoints'
import { sdkDispatchResponse, sdkModelResponse } from './sdk-model-response'
import { TaskService } from './task-service'
import { ToolGateway } from './tool-gateway'
import { isRecoverableToolProposalError } from './tool-proposal-errors'

interface TeamSession {
  runId: string
  next?: ProviderRequest
  running: boolean
  tool?: SdkToolReceipt
  dispatch?: SdkDispatchReceipt
  state?: string
  history?: AgentInputItem[]
  replay: boolean
  replayDispatchUsed: boolean
  replayChildUsed: boolean
  currentAssignmentId?: string
  failure?: unknown
}

class RuntimeStop extends Error {}

/** The native parent/child graph is execution state; TaskService still chooses every legal next step. */
export class TeamExecutor {
  readonly checkpoints: SdkCheckpointStore
  private readonly sessions = new Map<string, TeamSession>()

  constructor(private readonly kernel: RuntimeKernel, private readonly tasks: TaskService, private readonly gateway: ToolGateway, private readonly ports: Pick<EmployeeExecutorPorts, 'execute' | 'event'> & { failed: (runId: string, code: string) => void }) {
    this.checkpoints = new SdkCheckpointStore(kernel)
  }

  private runForRequest(requestId: string): Run | undefined {
    const assignment = this.kernel.store.list<Assignment>('Assignment').find((item) => item.providerRequestId === requestId && item.state === 'running')
    const manager = this.kernel.store.list<Checkpoint>('Checkpoint').find((item) => item.phase === 'manager_review' && item.payload.requestId === requestId && item.payload.completed !== true)
    const runId = assignment?.runId ?? manager?.runId
    const run = runId && this.kernel.store.get<Run>('Run', runId)
    return run && run.employeeExecutor === TEAM_EXECUTOR ? run : undefined
  }

  submit(request: ProviderRequest): boolean {
    const run = this.runForRequest(request.requestId)
    if (!run) return false
    let session = this.sessions.get(run.id)
    if (!session) {
      const saved = this.checkpoints.latest(run.id)
      session = this.session(run.id, saved)
      this.sessions.set(run.id, session)
    }
    if (session.next && session.next.requestId !== request.requestId) throw new Error('duplicate_sdk_team_continuation')
    if (session.failure instanceof RuntimeStop) session.failure = undefined
    session.next = request
    this.save(session, session.state ? 'resuming' : 'running')
    if (!session.running) this.start(session)
    return true
  }

  private session(runId: string, saved?: StoredSdkState): TeamSession {
    return { runId, next: saved?.nextRequest, running: false, tool: saved?.tool, dispatch: saved?.dispatch, state: saved?.state, history: saved?.history, replay: Boolean(saved?.tool && !saved.state && ['prepared', 'resuming', 'waiting_result'].includes(saved.status)), replayDispatchUsed: false, replayChildUsed: false }
  }

  private save(session: TeamSession, status: SdkExecutionState['status'], reason?: string): StoredSdkState {
    return this.checkpoints.save(session.runId, { status, state: session.state, nextRequest: session.next, tool: session.tool, dispatch: session.dispatch, history: session.history, reason })
  }

  private start(session: TeamSession): void {
    session.running = true
    // Provider/tool I/O must start after the synchronous Runtime transaction commits.
    void Promise.resolve().then(() => this.drive(session)).catch((error: unknown) => {
      const failure = error instanceof ToolCallError ? error.error : error
      if (failure instanceof RuntimeStop) {
        if (this.kernel.store.get<Run>('Run', session.runId)?.state === 'failed') try { this.save(session, 'failed', 'runtime_stopped') } catch { /* Preserve invalid state for diagnosis. */ }
        return
      }
      const code = failure instanceof Error ? failure.message.split(':')[0] : 'sdk_team_failed'
      this.tasks.failRun(session.runId, code)
      try { this.save(session, 'failed', code) } catch { /* An invalid checkpoint stays invalid; Runtime failure is authoritative. */ }
      this.ports.failed(session.runId, code)
    }).finally(() => {
      session.running = false
      const run = this.kernel.store.get<Run>('Run', session.runId)
      if (run && ['succeeded', 'failed', 'cancelled'].includes(run.state)) this.sessions.delete(session.runId)
      else if (session.next && run?.state === 'running') this.start(session)
    })
  }

  private async childCall<T>(session: TeamSession, call: () => T | Promise<T>): Promise<T> {
    try { return await call() } catch (error) { if (!(error instanceof RuntimeStop)) session.failure = error; throw error }
  }

  private graph(session: TeamSession) {
    const detail = this.tasks.detailByRun(session.runId)
    const configuration = detail.run!.sdkSupervisor!
    const children = detail.employeeVersions.map((version) => {
      const model: Model = {
        getResponse: (request) => this.childCall(session, () => this.employeeModel(session, version, request)),
        async *getStreamedResponse() { throw new Error('sdk_stream_mode_unsupported') }
      }
      const proposal = tool({
        name: 'propose_tool_action', description: 'Submit one action to the existing Runtime gateway.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: true }, strict: false, errorFunction: null,
        needsApproval: async (_context, parameters) => this.childCall(session, () => this.prepareTool(session, version, parameters)),
        execute: async (parameters) => this.childCall(session, () => this.executeTool(session, version, parameters))
      })
      const child = new Agent({ name: `employee_${sdkDigest(version.id).slice(0, 20)}`, instructions: version.systemPrompt, model, tools: [proposal], modelSettings: { parallelToolCalls: false, retry: { maxRetries: 0 } } })
      return child.asTool({
        toolName: this.delegateName(version.id), toolDescription: `执行已冻结员工 ${version.name} 的当前 Runtime Assignment。`, parameters: z.object({ assignmentId: z.string() }),
        inputBuilder: ({ params }) => {
          const planned = session.replay && session.tool ? session.tool.request : session.next
          const assignment = this.kernel.store.get<Assignment>('Assignment', params.assignmentId)
          const current = this.tasks.detailByRun(session.runId)
          if (!assignment || assignment.runId !== session.runId || assignment.employeeVersionId !== version.id || assignment.state !== 'running' || current.task?.activeRunId !== session.runId || current.assignments.filter((item) => item.state === 'running').length !== 1 || current.assignments.some((item) => item.sequence < assignment.sequence && item.state !== 'succeeded') || !planned || typeof planned.input !== 'string' || (!session.replay && assignment.providerRequestId !== planned.requestId)) throw new Error('sdk_dispatch_outside_frozen_plan')
          session.currentAssignmentId = assignment.id
          return planned.input
        },
        customOutputExtractor: () => {
          const current = this.tasks.detailByRun(session.runId)
          const assignment = current.assignments.find((item) => item.id === session.currentAssignmentId)
          if (!assignment || assignment.state !== 'succeeded') return JSON.stringify({ assignmentId: assignment?.id, state: 'runtime_continuation_required' })
          const handoff = current.handoffs.find((item) => item.fromAssignmentId === assignment.id)
          if (!handoff?.envelope) throw new Error('sdk_verified_handoff_missing')
          return renderHandoffEnvelope(handoff.envelope, handoff.sha256, { supervisor: true })
        },
        runConfig: { tracingDisabled: true, modelProvider: { getModel: () => model } }, runOptions: { maxTurns: detail.revision!.budget.maxSteps }
      })
    })
    const model: Model = {
      getResponse: (request) => this.managerModel(session, request),
      async *getStreamedResponse() { throw new Error('sdk_stream_mode_unsupported') }
    }
    const root = new Agent({ name: `manager_${session.runId}`, instructions: configuration.systemPrompt, model, tools: children, modelSettings: { parallelToolCalls: false, retry: { maxRetries: 0 } } })
    return { root, model }
  }

  private delegateName(versionId: string): string { return `delegate_${sdkDigest(versionId).slice(0, 20)}` }

  private assertOperationBoundary(runId: string): void {
    const detail = this.tasks.detailByRun(runId)
    if (detail.task!.activeRunId !== runId || ['succeeded', 'failed', 'cancelled'].includes(detail.run!.state)) throw new RuntimeStop()
    if (this.tasks.pauseSdkExecutionAtBoundary(runId)) throw new RuntimeStop()
    this.checkpoints.assertGrantLive(runId)
  }

  private async managerModel(session: TeamSession, sdkRequest: ModelRequest): Promise<ModelResponse> {
    if (session.failure) throw session.failure
    if (session.replay && !session.replayDispatchUsed && session.dispatch) {
      session.replayDispatchUsed = true
      return sdkDispatchResponse(session.dispatch)
    }
    const planned = session.next
    if (!planned) throw new RuntimeStop()
    this.assertOperationBoundary(session.runId)
    if (!this.tasks.employeeExecutionContext(planned.requestId)) {
      session.next = undefined
      // TaskService's frozen review request already contains the complete evidence.
      // Root history can contain stale employee output or rejected review candidates.
      const input: ProviderConversationInput = { schemaVersion: 2, instructions: this.tasks.coordinatorReviewInstructions(session.runId), items: [{ type: 'message', role: 'user', content: String(planned.input) }], tools: [] }
      const request = this.tasks.bindCoordinatorReviewInput(session.runId, planned, input)
      let events: ProviderEvent[]
      try {
        events = await this.ports.execute(request, (event) => {
          if (event.type === 'usage') this.tasks.coordinatorUsage(session.runId, event)
          if (event.type !== 'completed' && event.type !== 'tool_proposal') this.ports.event(request.requestId, event)
        }, sdkRequest.signal)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'invalid_structured_output') throw error
        const recovery = this.tasks.handleProviderFailure(request.requestId, error.message)
        if (recovery?.request) {
          session.next = recovery.request
          this.save(session, 'running')
          return this.managerModel(session, sdkRequest)
        }
        if (recovery?.event === 'failed') this.ports.failed(session.runId, 'manager_review_format_failed')
        throw new RuntimeStop()
      }
      const completed = events.find((event) => event.type === 'completed')
      if (!completed) throw new Error('invalid_sdk_review_response')
      this.ports.event(request.requestId, completed)
      return sdkModelResponse(events, request.requestId)
    }
    const context = this.tasks.runtimeDispatchContext(session.runId, planned)
    session.dispatch = { source: 'runtime_frozen_plan', assignmentId: context.assignmentId, employeeVersionId: context.version.id, requestId: planned.requestId, callId: `runtime-dispatch-${planned.requestId}` }
    session.tool = undefined
    session.state = undefined
    this.save(session, 'running')
    return sdkDispatchResponse(session.dispatch)
  }

  private async employeeModel(session: TeamSession, version: EmployeeVersion, sdkRequest: ModelRequest): Promise<ModelResponse> {
    if (session.replay && !session.replayChildUsed && session.tool) {
      session.replayChildUsed = true
      return sdkModelResponse(session.tool.events, session.tool.request.requestId)
    }
    const planned = session.next
    if (!planned) throw new RuntimeStop()
    const context = this.tasks.employeeExecutionContext(planned.requestId)
    if (!context || context.runId !== session.runId || context.version.id !== version.id || context.assignmentId !== session.currentAssignmentId) throw new RuntimeStop()
    session.next = undefined
    this.assertOperationBoundary(session.runId)
    // Every SDK user turn here is a Runtime-generated policy/context request.
    // Replace superseded policy copies; retain every assistant call and tool result.
    const items = sdkInputItems(sdkRequest.input).filter((item) => item.type !== 'message' || item.role !== 'user')
    if (typeof planned.input !== 'string') throw new Error('invalid_sdk_employee_input')
    items.push({ type: 'message', role: 'user', content: planned.input })
    const detail = this.tasks.detailByRun(session.runId)
    const instructions = `${version.systemPrompt}\n[Runtime 冻结任务]\n${JSON.stringify({ goal: detail.revision!.goal, acceptanceCriteria: detail.revision!.acceptanceCriteria, authorizedDirectories: detail.revision!.resourceScope.directories })}`
    const request = this.tasks.bindEmployeeProviderInput(planned, { schemaVersion: 2, instructions, items, tools: planned.proposalTool ? [planned.proposalTool] : [] })
    const events = await this.ports.execute(request, (event) => {
      if (event.type === 'output_delta' || event.type === 'usage' || event.type === 'structured_result') this.ports.event(request.requestId, event)
    }, sdkRequest.signal)
    const completed = events.find((event) => event.type === 'completed')
    const proposals = events.filter((event) => event.type === 'tool_proposal')
    if (!completed || proposals.length > 1 || (completed.incomplete && proposals.length)) throw new Error('invalid_sdk_employee_response')
    if (proposals.length) {
      session.tool = { assignmentId: context.assignmentId, employeeVersionId: version.id, request: planned, events, proposal: proposals[0], completed, completedApplied: false }
      session.state = undefined
    } else this.ports.event(planned.requestId, completed)
    return sdkModelResponse(events, planned.requestId)
  }

  private checkedReceipt(session: TeamSession, version: EmployeeVersion, parameters: unknown): SdkToolReceipt {
    const receipt = session.tool
    if (!receipt || receipt.employeeVersionId !== version.id || receipt.assignmentId !== session.currentAssignmentId || sdkDigest(parameters) !== sdkDigest(receipt.proposal.arguments)) throw new Error('sdk_tool_call_binding_failed')
    return receipt
  }

  private prepareTool(session: TeamSession, version: EmployeeVersion, parameters: unknown): boolean {
    const receipt = this.checkedReceipt(session, version, parameters)
    if (receipt.rejectionCode) return false
    if (receipt.actionId) return Boolean(this.checkpoints.assertAction(receipt, session.runId).approvalId)
    this.assertOperationBoundary(session.runId)
    try {
      this.kernel.transaction(() => {
        if (!this.tasks.canAcceptToolProposal(receipt.request.requestId)) throw new Error('assignment_not_accepting_tool_proposal')
        const proposal = this.tasks.toolProposalContext(receipt.request.requestId, receipt.proposal)
        const action = this.gateway.prepare(proposal)
        this.tasks.attachToolAction(receipt.assignmentId, action.id)
        receipt.actionId = action.id
        receipt.actionSha256 = actionDigest(action)
        if (action.approvalId || ['blocked', 'result_unknown'].includes(action.state)) {
          this.ports.event(receipt.request.requestId, receipt.completed)
          receipt.completedApplied = true
        }
        this.save(session, 'prepared')
      })
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':')[0] : 'invalid_tool_proposal'
      if (!isRecoverableToolProposalError(code)) throw error
      this.kernel.transaction(() => {
        this.tasks.recordInvalidToolProposal(receipt.request.requestId, code)
        receipt.rejectionCode = code
        this.ports.event(receipt.request.requestId, receipt.completed)
        receipt.completedApplied = true
        this.save(session, 'running', code)
      })
      return false
    }
    const action = this.checkpoints.assertAction(receipt, session.runId)
    if (action.state === 'blocked') throw new RuntimeStop()
    return Boolean(action.approvalId)
  }

  private async executeTool(session: TeamSession, version: EmployeeVersion, parameters: unknown): Promise<string> {
    const receipt = this.checkedReceipt(session, version, parameters)
    if (receipt.rejectionCode) return JSON.stringify({ state: 'rejected', failureCode: receipt.rejectionCode })
    this.assertOperationBoundary(session.runId)
    let action = this.checkpoints.assertAction(receipt, session.runId)
    if (action.state === 'pending') action = await this.gateway.executePrepared(action.id, (updated) => this.actionCommitted(updated))
    if (action.state === 'result_unknown' && !receipt.completedApplied) this.kernel.transaction(() => {
      this.ports.event(receipt.request.requestId, receipt.completed)
      receipt.completedApplied = true
      this.save(session, 'waiting_result')
    })
    if (['running', 'pending', 'result_unknown', 'blocked'].includes(action.state)) throw new RuntimeStop()
    if (!receipt.completedApplied) this.kernel.transaction(() => {
      this.ports.event(receipt.request.requestId, receipt.completed)
      receipt.completedApplied = true
      this.save(session, 'running')
    })
    session.replay = false
    return JSON.stringify({ actionId: action.id, state: action.state, resultVerified: action.resultVerified ?? false, result: action.result ?? null, failureCode: action.failureCode })
  }

  /** Called inside Gateway's decision/start/result transaction. */
  actionCommitted(action: ToolAction): void {
    const run = this.kernel.store.get<Run>('Run', action.runId)
    if (run?.employeeExecutor !== TEAM_EXECUTOR) return
    const saved = this.checkpoints.latest(action.runId)
    if (!saved?.tool || saved.tool.actionId !== action.id) throw new Error('sdk_approval_binding_missing')
    this.checkpoints.assertAction(saved.tool, action.runId)
    this.checkpoints.save(action.runId, { ...saved, status: action.state === 'result_unknown' ? 'waiting_result' : action.state === 'blocked' ? 'rejected' : 'resuming' })
  }

  assertApprovalReady(actionId: string, approved = true): boolean {
    const action = this.kernel.store.get<ToolAction>('ToolAction', actionId)
    const run = action && this.kernel.store.get<Run>('Run', action.runId)
    if (run?.employeeExecutor !== TEAM_EXECUTOR) return false
    if (approved) this.checkpoints.assertGrantLive(run.id)
    const saved = this.checkpoints.latest(run.id)
    if (!saved?.state || saved.status !== 'suspended' || saved.tool?.actionId !== actionId || action?.state !== 'pending' || !action.approvalId) throw new Error('sdk_approval_not_ready')
    this.checkpoints.assertAction(saved.tool, run.id)
    return true
  }

  afterDecision(action: ToolAction): void {
    if (this.kernel.store.get<Run>('Run', action.runId)?.employeeExecutor !== TEAM_EXECUTOR) return
    if (action.state === 'blocked') {
      this.tasks.failRun(action.runId, 'approval_rejected')
      const session = this.sessions.get(action.runId) ?? this.session(action.runId, this.checkpoints.latest(action.runId))
      this.sessions.set(action.runId, session)
      if (!session.running) this.start(session)
    }
  }

  private async drive(session: TeamSession): Promise<void> {
    const { root, model } = this.graph(session)
    const runner = new Runner({ tracingDisabled: true, modelProvider: { getModel: () => model } })
    const detail = this.tasks.detailByRun(session.runId)
    const initial = JSON.stringify({ runId: session.runId, goal: detail.revision!.goal, employeeVersionIds: detail.revision!.employeeVersionIds, instruction: '只执行 Runtime 当前冻结的 Assignment 与后续审核。' })
    let input = session.state ? await RunState.fromString(root, session.state) : session.history ?? initial
    if (session.state && session.tool) {
      const state = input as Awaited<ReturnType<typeof RunState.fromString>>
      const action = this.checkpoints.assertAction(session.tool, session.runId)
      const interruption = state.getInterruptions().find((item) => item.rawItem.type === 'function_call' && item.rawItem.callId === session.tool!.proposal.callId)
      if (!interruption || interruption.rawItem.type !== 'function_call' || interruption.agent.name !== `employee_${sdkDigest(session.tool.employeeVersionId).slice(0, 20)}` || sdkDigest(JSON.parse(interruption.rawItem.arguments)) !== sdkDigest(session.tool.proposal.arguments)) throw new Error('sdk_approval_identity_failed')
      const approval = action.approvalId && this.kernel.store.get<Approval>('Approval', action.approvalId)
      if (approval && approval.decision === 'rejected') {
        state.reject(interruption)
        session.state = state.toString()
        session.next = undefined
        this.save(session, 'rejected', 'approval_rejected')
        return
      }
      else if (approval && approval.decision === 'approved' && ['succeeded', 'failed'].includes(action.state)) {
        this.assertOperationBoundary(session.runId)
        state.approve(interruption)
      } else return
      session.currentAssignmentId = session.tool.assignmentId
    }
    while (session.next || session.state || session.replay) {
      const result = await runner.run(root, input, { maxTurns: detail.revision!.budget.maxSteps })
      session.state = result.state.toString()
      session.history = result.history
      session.replay = false
      if (result.interruptions.length) {
        const receipt = session.tool
        if (result.interruptions.length !== 1 || !receipt?.actionId) throw new Error('sdk_unbound_interruption')
        const item = result.interruptions[0]
        if (item.rawItem.type !== 'function_call' || item.rawItem.callId !== receipt.proposal.callId) throw new Error('sdk_approval_identity_failed')
        this.save(session, 'suspended')
        return
      }
      session.state = undefined
      const run = this.kernel.store.get<Run>('Run', session.runId)!
      this.save(session, run.state === 'succeeded' ? 'completed' : run.state === 'failed' ? 'failed' : 'running')
      if (!session.next) return
      input = result.history
    }
  }

  /** Only SDK-owned runs are reconciled here; legacy recovery keeps its current path. */
  private discardInterruptedModelContext(runId: string): void {
    this.checkpoints.save(runId, { status: 'running' })
    this.sessions.delete(runId)
  }

  async recover(): Promise<Set<string>> {
    const handled = new Set<string>()
    for (const run of this.kernel.store.list<Run>('Run').filter((item) => item.employeeExecutor === TEAM_EXECUTOR && ['running', 'paused', 'pausing'].includes(item.state))) {
      try {
        for (const action of this.kernel.store.list<ToolAction>('ToolAction').filter((item) => item.runId === run.id && item.state === 'running')) {
          const unknown: ToolAction = { ...action, state: action.sideEffect === 'external_write' ? 'result_unknown' : 'failed', failureCode: 'process_interrupted', completedAt: new Date().toISOString(), resultVerified: action.sideEffect !== 'external_write' }
          this.kernel.save({ entityType: 'ToolAction', entity: unknown, immutable: false }, 'tool_action.reconciled_after_restart', { state: unknown.state })
        }
        let saved = this.checkpoints.latest(run.id)
        if (saved?.tool?.actionId) {
          const action = this.checkpoints.assertAction(saved.tool, run.id)
          const assignment = this.kernel.store.get<Assignment>('Assignment', action.assignmentId)!
          if (action.state === 'result_unknown' && !saved.tool.completedApplied && assignment.providerRequestId === saved.tool.request.requestId) {
            const receipt = saved.tool
            saved = this.kernel.transaction(() => {
              this.ports.event(receipt.request.requestId, receipt.completed)
              receipt.completedApplied = true
              return this.checkpoints.save(run.id, { ...saved!, status: 'waiting_result', tool: receipt })
            })
          }
        }
        this.tasks.pauseSdkExecutionAtBoundary(run.id)
        this.tasks.acknowledgeSdkApplicationRestart(run.id)
        if (!saved?.tool?.actionId || ['completed', 'failed'].includes(saved.status)) {
          if (saved) this.discardInterruptedModelContext(run.id)
          continue
        }
        handled.add(run.id)
        this.checkpoints.assertGrantLive(run.id)
        const action = this.checkpoints.assertAction(saved.tool, run.id)
        const session = this.session(run.id, saved)
        this.sessions.set(run.id, session)
        session.currentAssignmentId = saved.tool.assignmentId
        const assignment = this.kernel.store.get<Assignment>('Assignment', action.assignmentId)!
        if (assignment.state !== 'running') { this.discardInterruptedModelContext(run.id); handled.delete(run.id); continue }
        const nextAlreadySent = saved.nextRequest && this.kernel.store.list<Checkpoint>('Checkpoint').some((item) => item.phase === 'provider_step' && item.payload.requestId === saved.nextRequest!.requestId && item.payload.employeeExecutor === TEAM_EXECUTOR)
        if (['succeeded', 'failed'].includes(action.state) && saved.tool.completedApplied && (assignment.awaitingToolActionId !== action.id || nextAlreadySent)) {
          // An interrupted later model request is rebuilt from settled Runtime facts.
          // Its old native approval cannot authorize or repeat an earlier action.
          this.discardInterruptedModelContext(run.id)
          handled.delete(run.id)
          continue
        }
        if (action.state === 'result_unknown') {
          if (!saved.tool.completedApplied && assignment.providerRequestId === saved.tool.request.requestId) { this.ports.event(assignment.providerRequestId, saved.tool.completed); saved.tool.completedApplied = true }
          const current = this.kernel.store.get<Run>('Run', run.id)!
          if (current.state !== 'paused') this.kernel.save({ entityType: 'Run', entity: { ...current, state: 'paused' }, immutable: false }, 'run.paused_for_unknown_result', {})
          this.save(session, 'waiting_result')
          continue
        }
        if (saved.state && action.state === 'pending') continue
        if (action.state === 'blocked') { this.afterDecision(action); continue }
        if (['succeeded', 'failed'].includes(action.state) && saved.tool.completedApplied) {
          if (!assignment.providerRequestId) {
            const resumed = this.kernel.transaction(() => this.tasks.resumeAfterTool(action))
            session.next = resumed.request
          } else if (saved.nextRequest?.requestId === assignment.providerRequestId) session.next = saved.nextRequest
        }
        if (!saved.state) {
          session.replay = true
        }
        this.start(session)
      } catch (error) {
        handled.add(run.id)
        this.tasks.failRun(run.id, error instanceof Error ? error.message : 'sdk_recovery_failed')
      }
    }
    return handled
  }
}
