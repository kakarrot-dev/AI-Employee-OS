export interface WorkspacePolicy {
  softLimitBytes: number
  hardLimitBytes: number
  deliveredRunRetentionDays: number
  diagnosticLogRetentionDays: number
}

export interface WorkspaceUsage {
  runId: string
  bytes: number
  runState: 'active' | 'delivered' | 'terminal_unresolved'
  deliveredAt?: string
}

export type WorkspaceQuotaDecision =
  | { action: 'continue'; reason: 'within_limit' }
  | { action: 'warn'; reason: 'soft_limit_reached' }
  | { action: 'safe_pause'; reason: 'hard_limit_reached' }

export function validateWorkspacePolicy(policy: WorkspacePolicy): void {
  if (!Number.isSafeInteger(policy.softLimitBytes) || policy.softLimitBytes <= 0) throw new Error('invalid_soft_limit')
  if (!Number.isSafeInteger(policy.hardLimitBytes) || policy.hardLimitBytes <= policy.softLimitBytes) throw new Error('invalid_hard_limit')
  if (!Number.isSafeInteger(policy.deliveredRunRetentionDays) || policy.deliveredRunRetentionDays < 1) throw new Error('invalid_run_retention')
  if (!Number.isSafeInteger(policy.diagnosticLogRetentionDays) || policy.diagnosticLogRetentionDays < 1) throw new Error('invalid_log_retention')
}

export function evaluateWorkspaceQuota(policy: WorkspacePolicy, usageBytes: number): WorkspaceQuotaDecision {
  validateWorkspacePolicy(policy)
  if (!Number.isSafeInteger(usageBytes) || usageBytes < 0) throw new Error('invalid_workspace_usage')
  if (usageBytes >= policy.hardLimitBytes) return { action: 'safe_pause', reason: 'hard_limit_reached' }
  if (usageBytes >= policy.softLimitBytes) return { action: 'warn', reason: 'soft_limit_reached' }
  return { action: 'continue', reason: 'within_limit' }
}

export function canPurgeRunWorkspace(policy: WorkspacePolicy, usage: WorkspaceUsage, now: Date): boolean {
  validateWorkspacePolicy(policy)
  if (usage.runState !== 'delivered' || !usage.deliveredAt) return false
  const deliveredAt = Date.parse(usage.deliveredAt)
  if (Number.isNaN(deliveredAt)) throw new Error('invalid_delivered_at')
  const ageMs = now.getTime() - deliveredAt
  return ageMs >= policy.deliveredRunRetentionDays * 86_400_000
}
