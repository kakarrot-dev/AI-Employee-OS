import type { ResourceScope, RunGrant, RunState, TaskState, ToolActionState, UiTaskState } from './domain'

const taskTransitions: Record<TaskState, readonly TaskState[]> = {
  pending: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: []
}

const runTransitions: Record<RunState, readonly RunState[]> = {
  created: ['running', 'cancelled'],
  running: ['pausing', 'succeeded', 'failed', 'cancelled'],
  pausing: ['paused', 'failed', 'cancelled'],
  paused: ['running', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: []
}

const toolActionTransitions: Record<ToolActionState, readonly ToolActionState[]> = {
  pending: ['running', 'blocked', 'cancelled'],
  running: ['succeeded', 'failed', 'result_unknown', 'cancelled'],
  succeeded: [],
  failed: [],
  blocked: [],
  result_unknown: [],
  cancelled: []
}

function transition<TState extends string>(machine: Record<TState, readonly TState[]>, from: TState, to: TState): TState {
  if (!Object.hasOwn(machine, from) || !Object.hasOwn(machine, to)) throw new Error('unknown_state')
  if (!machine[from].includes(to)) throw new Error(`invalid_transition:${from}->${to}`)
  return to
}

export const transitionTask = (from: TaskState, to: TaskState): TaskState => transition(taskTransitions, from, to)
export const transitionRun = (from: RunState, to: RunState): RunState => transition(runTransitions, from, to)
export const transitionToolAction = (from: ToolActionState, to: ToolActionState): ToolActionState => transition(toolActionTransitions, from, to)

export function projectTaskState(input: { hasDraft: boolean; taskState?: TaskState; runState?: RunState; hasPendingApproval?: boolean; hasBlockedAction?: boolean; hasUnknownResult?: boolean }): UiTaskState {
  if (input.hasDraft && !input.taskState) return 'draft'
  if (!input.taskState || !input.runState) throw new Error('incomplete_projection_input')
  if (input.runState === 'paused' || input.hasPendingApproval || input.hasBlockedAction || input.hasUnknownResult) return 'needs_attention'
  if (input.taskState === 'pending' && input.runState === 'created') return 'pending'
  if (input.taskState === 'running' && ['running', 'pausing'].includes(input.runState)) return 'running'
  if (['succeeded', 'failed', 'cancelled'].includes(input.taskState)) return input.taskState as UiTaskState
  throw new Error('inconsistent_projection_state')
}

function isSubset(next: string[], current: string[]): boolean {
  const allowed = new Set(current)
  return next.every((item) => allowed.has(item))
}

function scopeDoesNotExpand(next: ResourceScope, current: ResourceScope): boolean {
  return isSubset(next.directories, current.directories)
    && isSubset(next.toolVersionIds, current.toolVersionIds)
    && isSubset(next.modelConfigIds, current.modelConfigIds)
    && isSubset(next.memoryScopes, current.memoryScopes)
}

export function assertRunGrantDoesNotExpand(current: RunGrant, next: RunGrant): void {
  if (current.runId !== next.runId) throw new Error('run_grant_run_mismatch')
  if (Date.parse(next.expiresAt) > Date.parse(current.expiresAt)) throw new Error('run_grant_expiry_expanded')
  if (!scopeDoesNotExpand(next.resourceScope, current.resourceScope)) throw new Error('run_grant_scope_expanded')
  const budgetKeys = ['maxInputTokens', 'maxOutputTokens', 'maxAmountUsdMicros', 'maxSteps'] as const
  if (budgetKeys.some((key) => next.budget[key] > current.budget[key])) throw new Error('run_grant_budget_expanded')
  if (current.authorizationMode === 'approval_required' && next.authorizationMode === 'full_access') throw new Error('run_grant_authorization_expanded')
}
