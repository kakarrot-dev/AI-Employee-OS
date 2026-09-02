import { createHash, randomUUID } from 'node:crypto'
import type { Approval, Assignment, Run, RunGrant, ToolAction, ToolVersion } from './domain'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'

export interface ToolProposal {
  runId: string
  assignmentId: string
  toolVersionId: string
  parameters: Record<string, unknown>
  parameterSources: ToolAction['parameterSources']
}

export type ToolRunner = (tool: ToolVersion, parameters: Record<string, unknown>, context: { actionId: string; signal: AbortSignal; grantedDirectories?: string[] }) => Promise<Record<string, unknown>>

const injectionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /system\s+prompt/i,
  /rungrant/i,
  /读取.{0,12}(密钥|凭据|本地文件|记忆)/,
  /忽略.{0,12}(指令|规则|限制)/
]

const sensitivePatterns = [
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:api[_-]?key|authorization|cookie|password)\s*[:=]/i,
  /\/Users\/[^/]+\//
]

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function allText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(allText)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(allText)
  return []
}

function decodedVariants(value: string): string[] {
  const variants = [value]
  try { variants.push(decodeURIComponent(value)) } catch { /* invalid percent encoding is checked as raw text */ }
  if (value.length >= 20 && value.length <= 4096 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
    try { variants.push(Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')) } catch { /* invalid base64 remains raw */ }
  }
  return variants
}

export class ToolGateway {
  constructor(private readonly kernel: RuntimeKernel, private readonly resources: ResourceService, private readonly runner: ToolRunner) {}

  async propose(proposal: ToolProposal): Promise<ToolAction> {
    const { run, grant, assignment, tool } = this.validateProposal(proposal)
    const idempotencyKey = createHash('sha256').update(canonical({ runId: run.id, assignmentId: assignment.id, toolVersionId: tool.id, parameters: proposal.parameters })).digest('hex')
    const existing = this.kernel.store.list<ToolAction>('ToolAction').find((action) => action.idempotencyKey === idempotencyKey)
    if (existing) return existing
    const now = new Date().toISOString()
    const action: ToolAction = {
      schemaVersion: 1, id: randomUUID(), createdAt: now, runId: run.id, assignmentId: assignment.id, toolVersionId: tool.id, idempotencyKey,
      state: 'pending', parameters: structuredClone(proposal.parameters), parameterSources: structuredClone(proposal.parameterSources), risk: tool.risk,
      sideEffect: tool.sideEffect, timeoutMs: tool.timeoutMs
    }
    const blocked = this.blockReason(action)
    if (blocked) {
      const result = { ...action, state: 'blocked' as const, failureCode: blocked, completedAt: now, resultVerified: false }
      this.kernel.save({ entityType: 'ToolAction', entity: result, immutable: false }, 'tool_action.blocked', { code: blocked })
      return result
    }
    this.kernel.save({ entityType: 'ToolAction', entity: action, immutable: false }, 'tool_action.proposed', { toolVersionId: tool.id, idempotencyKey })
    if (grant.authorizationMode === 'approval_required') {
      const approval: Approval = { schemaVersion: 1, id: randomUUID(), createdAt: now, requestedAt: now, runId: run.id, toolActionId: action.id, decision: 'pending' }
      this.kernel.save({ entityType: 'Approval', entity: approval, immutable: false }, 'approval.requested', { toolActionId: action.id })
      const awaiting = { ...action, approvalId: approval.id }
      this.kernel.save({ entityType: 'ToolAction', entity: awaiting, immutable: false }, 'tool_action.awaiting_approval', { approvalId: approval.id })
      return awaiting
    }
    return this.execute(action.id)
  }

  async decide(actionId: string, approved: boolean): Promise<ToolAction> {
    const action = this.requireAction(actionId)
    if (action.state !== 'pending' || !action.approvalId) throw new Error('tool_action_not_awaiting_approval')
    const approval = this.kernel.store.get<Approval>('Approval', action.approvalId)
    if (!approval || approval.decision !== 'pending') throw new Error('approval_not_pending')
    if (approved) this.assertActionAuthorized(action)
    const now = new Date().toISOString()
    this.kernel.save({ entityType: 'Approval', entity: { ...approval, decision: approved ? 'approved' : 'rejected', decidedAt: now }, immutable: false }, approved ? 'approval.approved' : 'approval.rejected', { toolActionId: action.id })
    if (!approved) {
      const rejected = { ...action, state: 'blocked' as const, completedAt: now, failureCode: 'approval_rejected', resultVerified: false }
      this.kernel.save({ entityType: 'ToolAction', entity: rejected, immutable: false }, 'tool_action.blocked', { code: 'approval_rejected' })
      return rejected
    }
    return this.execute(action.id)
  }

  resolveUnknown(actionId: string, outcome: 'succeeded' | 'failed', evidence: Record<string, unknown>): ToolAction {
    const action = this.requireAction(actionId)
    if (action.state !== 'result_unknown') throw new Error('tool_action_not_result_unknown')
    if (!Object.keys(evidence).length) throw new Error('manual_evidence_required')
    const resolved: ToolAction = { ...action, state: outcome, completedAt: new Date().toISOString(), result: { manualVerification: evidence }, resultVerified: true, failureCode: outcome === 'failed' ? 'manually_verified_failed' : undefined }
    this.kernel.save({ entityType: 'ToolAction', entity: resolved, immutable: false }, 'tool_action.result_resolved', { outcome })
    return resolved
  }

  private async execute(actionId: string): Promise<ToolAction> {
    const action = this.requireAction(actionId)
    if (action.state !== 'pending') return action
    this.assertActionAuthorized(action)
    const tool = this.resources.tool(action.toolVersionId)
    const running: ToolAction = { ...action, state: 'running', startedAt: new Date().toISOString() }
    this.kernel.save({ entityType: 'ToolAction', entity: running, immutable: false }, 'tool_action.started', {})
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), action.timeoutMs)
    try {
      const grant = this.requireGrantForAction(action)
      const result = await this.runner(tool, structuredClone(action.parameters), { actionId: action.id, signal: controller.signal, grantedDirectories: [...grant.resourceScope.directories] })
      if (controller.signal.aborted) throw new Error('tool_timeout')
      const completed: ToolAction = { ...running, state: 'succeeded', completedAt: new Date().toISOString(), result, resultVerified: true }
      this.kernel.save({ entityType: 'ToolAction', entity: completed, immutable: false }, 'tool_action.succeeded', {})
      return completed
    } catch (error) {
      const code = controller.signal.aborted ? 'tool_timeout' : error instanceof Error ? error.message.split(':')[0] : 'tool_failed'
      const uncertain = code === 'tool_timeout' && tool.sideEffect === 'external_write'
      const failed: ToolAction = { ...running, state: uncertain ? 'result_unknown' : 'failed', completedAt: new Date().toISOString(), failureCode: code, resultVerified: !uncertain }
      this.kernel.save({ entityType: 'ToolAction', entity: failed, immutable: false }, uncertain ? 'tool_action.result_unknown' : 'tool_action.failed', { code })
      return failed
    } finally {
      clearTimeout(timer)
    }
  }

  private validateProposal(proposal: ToolProposal): { run: Run; grant: RunGrant; assignment: Assignment; tool: ToolVersion } {
    const run = this.kernel.store.get<Run>('Run', proposal.runId)
    const assignment = this.kernel.store.get<Assignment>('Assignment', proposal.assignmentId)
    if (!run || !assignment || assignment.runId !== run.id || !['running', 'paused'].includes(run.state)) throw new Error('invalid_tool_action_context')
    const grant = this.kernel.store.get<RunGrant>('RunGrant', run.runGrantId)
    if (!grant || Date.parse(grant.expiresAt) <= Date.now()) throw new Error('run_grant_expired')
    const tool = this.resources.tool(proposal.toolVersionId)
    if (!grant.resourceScope.toolVersionIds.includes(tool.id)) throw new Error('tool_outside_run_grant')
    this.validateParameters(tool, proposal.parameters, proposal.parameterSources)
    return { run, grant, assignment, tool }
  }

  private validateParameters(tool: ToolVersion, parameters: Record<string, unknown>, sources: ToolAction['parameterSources']): void {
    const keys = Object.keys(parameters)
    if (!keys.length || keys.some((key) => !sources[key])) throw new Error('parameter_source_required')
    for (const source of Object.values(sources)) if (!source || !['task_input', 'trusted_runtime', 'model_output', 'untrusted_external_content'].includes(source.kind) || typeof source.sourceRef !== 'string' || source.sourceRef.length < 1 || source.sourceRef.length > 512) throw new Error('invalid_parameter_source')
    if (tool.id.startsWith('github.repositories.search') || tool.id.startsWith('agent-reach.') || tool.id.startsWith('last30days.') || tool.id.startsWith('opencli.')) {
      if (keys.some((key) => !['query', 'limit'].includes(key)) || typeof parameters.query !== 'string' || parameters.query.length < 1 || parameters.query.length > 256) throw new Error('invalid_tool_parameters')
    } else if (tool.id.startsWith('rss.read')) {
      if (keys.some((key) => !['url', 'limit'].includes(key)) || typeof parameters.url !== 'string' || parameters.url.length > 2048) throw new Error('invalid_tool_parameters')
    } else if (tool.id === 'document.read@local-document/v1') {
      if (keys.length !== 1 || typeof parameters.path !== 'string') throw new Error('invalid_tool_parameters')
    } else if (tool.id === 'document.create@local-document/v1') {
      if (keys.some((key) => !['path', 'content'].includes(key)) || typeof parameters.path !== 'string' || typeof parameters.content !== 'string') throw new Error('invalid_tool_parameters')
    } else if (tool.id === 'document.edit@local-document/v1') {
      if (keys.some((key) => !['path', 'oldText', 'newText'].includes(key)) || typeof parameters.path !== 'string' || typeof parameters.oldText !== 'string' || typeof parameters.newText !== 'string') throw new Error('invalid_tool_parameters')
    }
    if (parameters.limit !== undefined && (!Number.isSafeInteger(parameters.limit) || Number(parameters.limit) < 1 || Number(parameters.limit) > 10)) throw new Error('invalid_tool_parameters')
  }

  private blockReason(action: ToolAction): string | undefined {
    const text = allText(action.parameters).flatMap(decodedVariants)
    if (!action.toolVersionId.startsWith('document.') && text.some((value) => sensitivePatterns.some((pattern) => pattern.test(value)))) return 'sensitive_egress_blocked'
    if (action.toolVersionId.startsWith('document.') && Object.values(action.parameterSources).some((source) => source.kind === 'untrusted_external_content')) return 'untrusted_file_parameter_blocked'
    for (const [key, source] of Object.entries(action.parameterSources)) {
      if (!action.toolVersionId.startsWith('document.') && ['model_output', 'untrusted_external_content'].includes(source.kind) && injectionPatterns.some((pattern) => pattern.test(String(action.parameters[key] ?? '')))) return 'prompt_injection_blocked'
    }
    return undefined
  }

  private requireAction(id: string): ToolAction {
    const action = this.kernel.store.get<ToolAction>('ToolAction', id)
    if (!action) throw new Error('tool_action_not_found')
    return action
  }

  private assertActionAuthorized(action: ToolAction): void {
    const run = this.kernel.store.get<Run>('Run', action.runId)
    const grant = run && this.kernel.store.get<RunGrant>('RunGrant', run.runGrantId)
    if (!run || !grant || !['running', 'paused', 'pausing'].includes(run.state)) throw new Error('invalid_tool_action_context')
    if (Date.parse(grant.expiresAt) <= Date.now()) throw new Error('run_grant_expired')
    if (!grant.resourceScope.toolVersionIds.includes(action.toolVersionId)) throw new Error('tool_outside_run_grant')
  }

  private requireGrantForAction(action: ToolAction): RunGrant {
    const run = this.kernel.store.get<Run>('Run', action.runId)
    const grant = run && this.kernel.store.get<RunGrant>('RunGrant', run.runGrantId)
    if (!run || !grant || Date.parse(grant.expiresAt) <= Date.now()) throw new Error('run_grant_expired')
    return grant
  }
}
