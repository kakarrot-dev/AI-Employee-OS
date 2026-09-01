import { describe, expect, it } from 'vitest'
import type { RunGrant } from './domain'
import { assertRunGrantDoesNotExpand, projectTaskState, transitionRun, transitionTask, transitionToolAction } from './state-machines'

describe('runtime state machines', () => {
  it('accepts only explicit transitions', () => {
    expect(transitionTask('pending', 'running')).toBe('running')
    expect(transitionRun('running', 'pausing')).toBe('pausing')
    expect(transitionRun('pausing', 'paused')).toBe('paused')
    expect(transitionToolAction('running', 'result_unknown')).toBe('result_unknown')
    expect(() => transitionTask('succeeded', 'running')).toThrow('invalid_transition')
    expect(() => transitionRun('created', 'succeeded')).toThrow('invalid_transition')
    expect(() => transitionToolAction('result_unknown', 'running')).toThrow('invalid_transition')
  })

  it('owns the only task UI projection', () => {
    expect(projectTaskState({ hasDraft: true })).toBe('draft')
    expect(projectTaskState({ hasDraft: false, taskState: 'pending', runState: 'created' })).toBe('pending')
    expect(projectTaskState({ hasDraft: false, taskState: 'running', runState: 'running' })).toBe('running')
    expect(projectTaskState({ hasDraft: false, taskState: 'running', runState: 'paused' })).toBe('needs_attention')
    expect(() => projectTaskState({ hasDraft: false, taskState: 'pending', runState: 'paused' })).not.toThrow()
    expect(() => projectTaskState({ hasDraft: false, taskState: 'pending', runState: 'running' })).toThrow('inconsistent_projection_state')
  })

  it('allows a RunGrant only to narrow', () => {
    const current: RunGrant = {
      schemaVersion: 1,
      id: 'grant-1',
      createdAt: '2026-08-31T00:00:00Z',
      runId: 'run-1',
      expiresAt: '2026-09-01T00:00:00Z',
      authorizationMode: 'approval_required',
      budget: { maxInputTokens: 100, maxOutputTokens: 50, maxAmountUsdMicros: 1000, maxSteps: 10 },
      resourceScope: { directories: ['/safe'], toolVersionIds: ['tool-1'], modelConfigIds: ['model-1'], memoryScopes: ['task'] }
    }
    const narrowed: RunGrant = { ...current, expiresAt: '2026-08-31T12:00:00Z', budget: { ...current.budget, maxSteps: 5 } }
    expect(() => assertRunGrantDoesNotExpand(current, narrowed)).not.toThrow()
    expect(() => assertRunGrantDoesNotExpand(current, { ...narrowed, resourceScope: { ...narrowed.resourceScope, directories: ['/safe', '/private'] } })).toThrow('run_grant_scope_expanded')
    expect(() => assertRunGrantDoesNotExpand(current, { ...narrowed, authorizationMode: 'full_access' })).toThrow('run_grant_authorization_expanded')
  })
})
