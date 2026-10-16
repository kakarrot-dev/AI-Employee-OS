import { createHash, randomUUID } from 'node:crypto'
import type { AgentInputItem } from '@openai/agents-core'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import type { Assignment, Checkpoint, EmployeeVersion, Run, RunGrant, TaskRevision, ToolAction } from './domain'
import { canonicalHandoffJson, normalizeHandoffJsonValue } from './handoff-contract'
import { RuntimeKernel } from './kernel'

export const TEAM_EXECUTOR = 'openai-agents-ts-v2' as const
export const AGENTS_SDK_VERSION = '0.20.0' as const

export function sdkDigest(value: unknown): string {
  return createHash('sha256').update(canonicalHandoffJson(normalizeHandoffJsonValue(value))).digest('hex')
}

export function actionDigest(action: ToolAction): string {
  return sdkDigest({ id: action.id, runId: action.runId, assignmentId: action.assignmentId, toolVersionId: action.toolVersionId, parameters: action.parameters, parameterSources: action.parameterSources, idempotencyKey: action.idempotencyKey, approvalId: action.approvalId, sideEffect: action.sideEffect, timeoutMs: action.timeoutMs })
}

export interface SdkToolReceipt {
  assignmentId: string
  employeeVersionId: string
  request: ProviderRequest
  events: ProviderEvent[]
  proposal: Extract<ProviderEvent, { type: 'tool_proposal' }>
  completed: Extract<ProviderEvent, { type: 'completed' }>
  actionId?: string
  actionSha256?: string
  completedApplied: boolean
  rejectionCode?: string
}

interface ProviderDispatchReceipt {
  source?: 'provider'
  assignmentId: string
  request: ProviderRequest
  events: ProviderEvent[]
}

export interface RuntimeDispatchReceipt {
  source: 'runtime_frozen_plan'
  assignmentId: string
  employeeVersionId: string
  requestId: string
  callId: string
}

// Untagged receipts are the accepted paid dispatches written before phase 4B.
export type SdkDispatchReceipt = ProviderDispatchReceipt | RuntimeDispatchReceipt

export interface SdkExecutionState {
  status: 'running' | 'prepared' | 'suspended' | 'resuming' | 'waiting_result' | 'completed' | 'rejected' | 'failed'
  state?: string
  nextRequest?: ProviderRequest
  tool?: SdkToolReceipt
  dispatch?: SdkDispatchReceipt
  history?: AgentInputItem[]
  reason?: string
}

export interface StoredSdkState extends SdkExecutionState {
  checkpointId: string
  generation: number
  sdkVersion: typeof AGENTS_SDK_VERSION
  bindingSha256: string
}

/** Checkpoints carry execution context only. Runtime entities remain the authority. */
export class SdkCheckpointStore {
  constructor(private readonly kernel: RuntimeKernel) {}

  private binding(runId: string): { hash: string; graph: Array<{ parent: string; employeeVersionId: string; child: string }> } {
    const run = this.kernel.store.get<Run>('Run', runId)
    const grant = run && this.kernel.store.get<RunGrant>('RunGrant', run.runGrantId)
    const revision = run && this.kernel.store.get<TaskRevision>('TaskRevision', run.taskRevisionId)
    if (!run || run.employeeExecutor !== TEAM_EXECUTOR || !run.sdkSupervisor || !grant || !revision) throw new Error('invalid_sdk_run')
    const versions = revision.employeeVersionIds.map((id) => {
      const version = this.kernel.store.get<EmployeeVersion>('EmployeeVersion', id)
      if (!version) throw new Error('sdk_employee_version_missing')
      return { id, employeeId: version.employeeId, systemPrompt: version.systemPrompt, modelId: version.modelId, capabilityVersionIds: version.capabilityVersionIds, memoryScopes: version.memoryScopes }
    })
    const graph = versions.map((version) => ({ parent: `manager_${runId}`, employeeVersionId: version.id, child: `employee_${sdkDigest(version.id).slice(0, 20)}` }))
    return { hash: sdkDigest({ executor: TEAM_EXECUTOR, sdkVersion: AGENTS_SDK_VERSION, runId, taskId: run.taskId, revision, grant, supervisor: run.sdkSupervisor, versions, graph }), graph }
  }

  latest(runId: string, expectedCheckpointId?: string): StoredSdkState | undefined {
    const checkpoint = this.kernel.store.list<Checkpoint>('Checkpoint').filter((item) => item.runId === runId && item.phase === 'sdk_execution').sort((a, b) => b.sequence - a.sequence)[0]
    if (!checkpoint) {
      if (expectedCheckpointId) throw new Error('stale_sdk_checkpoint')
      return undefined
    }
    if (expectedCheckpointId && checkpoint.id !== expectedCheckpointId) throw new Error('stale_sdk_checkpoint')
    const { payloadSha256, ...payload } = checkpoint.payload
    if (payload.sdkVersion !== AGENTS_SDK_VERSION || payload.executor !== TEAM_EXECUTOR || payload.bindingSha256 !== this.binding(runId).hash || sdkDigest(payload) !== payloadSha256) throw new Error('sdk_checkpoint_integrity_failed')
    const state = payload.execution as SdkExecutionState
    if (!state || !Number.isSafeInteger(payload.generation)) throw new Error('invalid_sdk_checkpoint')
    this.assertDispatch(state, runId)
    if (state.tool?.actionId) this.assertAction(state.tool, runId)
    return { ...state, checkpointId: checkpoint.id, generation: Number(payload.generation), sdkVersion: AGENTS_SDK_VERSION, bindingSha256: String(payload.bindingSha256) }
  }

  save(runId: string, execution: SdkExecutionState): StoredSdkState {
    const existing = this.latest(runId), { hash, graph } = this.binding(runId)
    const previous = this.kernel.store.list<Checkpoint>('Checkpoint').filter((item) => item.runId === runId)
    const id = randomUUID(), generation = (existing?.generation ?? 0) + 1
    if (execution.tool?.actionId) this.assertAction(execution.tool, runId)
    this.assertDispatch(execution, runId)
    const { status, state, nextRequest, tool, dispatch, history, reason } = execution
    const payload = { schemaVersion: 1, executor: TEAM_EXECUTOR, sdkVersion: AGENTS_SDK_VERSION, bindingSha256: hash, generation, graph, execution: structuredClone({ status, state, nextRequest, tool, dispatch, history, reason }) }
    const checkpoint: Checkpoint = { schemaVersion: 1, id, createdAt: new Date().toISOString(), runId, sequence: Math.max(0, ...previous.map((item) => item.sequence)) + 1, assignmentId: execution.tool?.assignmentId, workerThreadId: `run:${runId}`, phase: 'sdk_execution', nextNode: 'manager', committed: true, unsettledToolActionIds: this.kernel.store.list<ToolAction>('ToolAction').filter((item) => item.runId === runId && ['pending', 'running', 'result_unknown'].includes(item.state)).map((item) => item.id), payload: { ...payload, payloadSha256: sdkDigest(payload) } }
    this.kernel.save({ entityType: 'Checkpoint', entity: checkpoint, immutable: true }, 'sdk.checkpoint_committed', { generation, status: execution.status, sdkVersion: AGENTS_SDK_VERSION })
    return { ...execution, checkpointId: id, generation, sdkVersion: AGENTS_SDK_VERSION, bindingSha256: hash }
  }

  assertAction(receipt: SdkToolReceipt, runId: string): ToolAction {
    const action = receipt.actionId && this.kernel.store.get<ToolAction>('ToolAction', receipt.actionId)
    const assignment = this.kernel.store.get<Assignment>('Assignment', receipt.assignmentId)
    if (!action || action.runId !== runId || action.assignmentId !== receipt.assignmentId || assignment?.runId !== runId || assignment.employeeVersionId !== receipt.employeeVersionId || actionDigest(action) !== receipt.actionSha256) throw new Error('sdk_action_binding_failed')
    return action
  }

  private assertDispatch(execution: SdkExecutionState, runId: string): void {
    const receipt = execution.dispatch
    if (!receipt) return
    const assignment = this.kernel.store.get<Assignment>('Assignment', receipt.assignmentId)
    const run = this.kernel.store.get<Run>('Run', runId)
    const revision = run && this.kernel.store.get<TaskRevision>('TaskRevision', run.taskRevisionId)
    if (!assignment || assignment.runId !== runId || !revision?.employeeVersionIds.includes(assignment.employeeVersionId) || (execution.tool && (execution.tool.assignmentId !== assignment.id || execution.tool.employeeVersionId !== assignment.employeeVersionId))) throw new Error('sdk_dispatch_binding_failed')
    if (receipt.source === 'runtime_frozen_plan') {
      const step = this.kernel.store.list<Checkpoint>('Checkpoint').find((item) => item.runId === runId && item.assignmentId === assignment.id && item.phase === 'provider_step' && item.payload.requestId === receipt.requestId)
      if (receipt.employeeVersionId !== assignment.employeeVersionId || receipt.callId !== `runtime-dispatch-${receipt.requestId}` || !step) throw new Error('sdk_dispatch_binding_failed')
    } else {
      if (!Array.isArray(receipt.events)) throw new Error('sdk_dispatch_binding_failed')
      const proposals = receipt.events.filter((event) => event.type === 'tool_proposal')
      if ((receipt.source !== undefined && receipt.source !== 'provider') || proposals.length !== 1 || proposals[0].name !== `delegate_${sdkDigest(assignment.employeeVersionId).slice(0, 20)}` || sdkDigest(proposals[0].arguments) !== sdkDigest({ assignmentId: assignment.id })) throw new Error('sdk_dispatch_binding_failed')
    }
  }

  assertGrantLive(runId: string): void {
    const run = this.kernel.store.get<Run>('Run', runId)
    const grant = run && this.kernel.store.get<RunGrant>('RunGrant', run.runGrantId)
    if (!run || !['running', 'paused'].includes(run.state)) throw new Error('invalid_tool_action_context')
    if (!grant || Date.parse(grant.expiresAt) <= Date.now()) throw new Error('run_grant_expired')
  }
}
