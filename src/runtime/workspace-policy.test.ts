import { describe, expect, it } from 'vitest'
import { canPurgeRunWorkspace, evaluateWorkspaceQuota, type WorkspacePolicy } from './workspace-policy'

const policy: WorkspacePolicy = {
  softLimitBytes: 100,
  hardLimitBytes: 150,
  deliveredRunRetentionDays: 30,
  diagnosticLogRetentionDays: 14
}

describe('run workspace governance', () => {
  it('warns at the soft limit and safely pauses at the hard limit', () => {
    expect(evaluateWorkspaceQuota(policy, 99).action).toBe('continue')
    expect(evaluateWorkspaceQuota(policy, 100).action).toBe('warn')
    expect(evaluateWorkspaceQuota(policy, 150).action).toBe('safe_pause')
  })

  it('never purges active or unresolved runs', () => {
    const now = new Date('2026-08-31T00:00:00Z')
    expect(canPurgeRunWorkspace(policy, { runId: '1', bytes: 1, runState: 'active' }, now)).toBe(false)
    expect(canPurgeRunWorkspace(policy, { runId: '2', bytes: 1, runState: 'terminal_unresolved' }, now)).toBe(false)
    expect(canPurgeRunWorkspace(policy, { runId: '3', bytes: 1, runState: 'delivered', deliveredAt: '2026-08-01T00:00:00Z' }, now)).toBe(true)
  })
})
