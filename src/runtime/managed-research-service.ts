import { createHash, randomUUID } from 'node:crypto'
import type { Assignment, EmployeeVersion, ResearchBundle, ResearchItem, SourceAttempt, ToolAction } from './domain'
import { RuntimeKernel } from './kernel'
import { ToolGateway } from './tool-gateway'
import { hasResearchCapability } from './builtin-contracts'

export interface ManagedResearchInput {
  taskId: string
  runId: string
  assignmentId: string
  employeeVersionId: string
  question: string
  githubQuery: string
  feedUrl: string
  limit?: number
}

export interface ManagedResearchResult { actions: ToolAction[]; bundle?: ResearchBundle }

interface RunnerResult {
  adapterVersionId: string
  sourceType: ResearchItem['sourceType']
  query: string
  url: string
  status: 'succeeded' | 'failed'
  fetchedAt: string
  httpStatus?: number
  retryAfter?: string
  truncated: boolean
  items: Array<Omit<ResearchItem, 'sourceAttemptId'>>
}

export class ManagedResearchService {
  constructor(private readonly kernel: RuntimeKernel, private readonly gateway: ToolGateway) {}

  async run(input: ManagedResearchInput): Promise<ManagedResearchResult> {
    this.validateContext(input)
    const source = { kind: 'task_input' as const, sourceRef: `task:${input.taskId}` }
    const actions = await Promise.all([
      this.gateway.propose({ runId: input.runId, assignmentId: input.assignmentId, toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: input.githubQuery, limit: input.limit ?? 5 }, parameterSources: { query: source, limit: { kind: 'trusted_runtime', sourceRef: 'managed-research-limit' } } }),
      this.gateway.propose({ runId: input.runId, assignmentId: input.assignmentId, toolVersionId: 'rss.read@research-source/v1', parameters: { url: input.feedUrl, limit: input.limit ?? 5 }, parameterSources: { url: source, limit: { kind: 'trusted_runtime', sourceRef: 'managed-research-limit' } } })
    ])
    return { actions, bundle: actions.every((action) => ['succeeded', 'failed', 'blocked'].includes(action.state)) ? this.createBundle(input, actions) : undefined }
  }

  createBundle(input: ManagedResearchInput, actions: ToolAction[]): ResearchBundle {
    this.validateContext(input)
    if (actions.length < 2 || actions.some((action) => action.runId !== input.runId || action.assignmentId !== input.assignmentId || !['succeeded', 'failed', 'blocked'].includes(action.state))) throw new Error('research_actions_unsettled')
    const fingerprint = createHash('sha256').update(JSON.stringify({ runId: input.runId, assignmentId: input.assignmentId, question: input.question, actionIds: actions.map((action) => action.id).sort() })).digest('hex')
    const existing = this.kernel.store.list<ResearchBundle>('ResearchBundle').find((bundle) => bundle.id === fingerprint)
    if (existing) return existing
    const bundleId = fingerprint
    const attempts: SourceAttempt[] = []
    const items: ResearchItem[] = []
    for (const action of actions) {
      const result = action.result as unknown as RunnerResult | undefined
      const sourceType: ResearchItem['sourceType'] = result?.sourceType ?? (action.toolVersionId.startsWith('github') ? 'github_repository' : action.toolVersionId.startsWith('rss') ? 'rss_atom' : action.toolVersionId.startsWith('agent-reach') ? 'agent_reach_web' : action.toolVersionId.startsWith('last30days') ? 'last30days' : 'opencli_social')
      const attempt: SourceAttempt = {
        schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), researchBundleId: bundleId, toolActionId: action.id,
        adapterVersionId: action.toolVersionId, sourceType, query: result?.query ?? String(action.parameters.query ?? action.parameters.url ?? ''),
        url: result?.url ?? String(action.parameters.url ?? ''), status: action.state === 'succeeded' && result?.status === 'succeeded' ? 'succeeded' : 'failed',
        fetchedAt: result?.fetchedAt ?? action.completedAt ?? new Date().toISOString(), httpStatus: result?.httpStatus, failureCode: action.failureCode ?? (result?.status === 'failed' ? `http_${result.httpStatus ?? 'error'}` : undefined), retryAfter: result?.retryAfter,
        contentHash: result ? createHash('sha256').update(JSON.stringify(result.items)).digest('hex') : undefined, truncated: result?.truncated ?? false
      }
      attempts.push(attempt)
      for (const value of result?.items ?? []) items.push({ ...value, sourceAttemptId: attempt.id })
    }
    for (const attempt of attempts) this.kernel.save({ entityType: 'SourceAttempt', entity: attempt, immutable: true }, 'research.source_attempt.recorded', { status: attempt.status, adapterVersionId: attempt.adapterVersionId })
    const gaps = attempts.filter((attempt) => attempt.status === 'failed').map((attempt) => `${attempt.adapterVersionId} 获取失败：${attempt.failureCode ?? attempt.httpStatus ?? 'unknown'}`)
    if (items.length === 0) gaps.push('没有来源返回可保存条目')
    const claims = items.map((item, index) => ({ statement: `${item.title}：${item.summary}`, sourceItemIndexes: [index], confidence: 'low' as const }))
    const conflicts = items.flatMap((item, index) => items.slice(index + 1).filter((other) => item.title.trim().toLowerCase() === other.title.trim().toLowerCase() && item.contentHash !== other.contentHash).map((other) => `同名来源内容不一致：${item.title}（${item.sourceType} / ${other.sourceType}）`))
    const contentHash = createHash('sha256').update(JSON.stringify({ question: input.question, attempts: attempts.map(({ adapterVersionId, status, contentHash: hash }) => ({ adapterVersionId, status, hash })), items: items.map(({ contentHash: hash }) => hash), claims, conflicts, gaps })).digest('hex')
    const bundle: ResearchBundle = {
      schemaVersion: 1, id: bundleId, createdAt: new Date().toISOString(), taskId: input.taskId, runId: input.runId, assignmentId: input.assignmentId, employeeVersionId: input.employeeVersionId,
      question: input.question, queries: actions.map((action) => ({ adapterVersionId: action.toolVersionId, query: String(action.parameters.query ?? action.parameters.url ?? '') })),
      sourceAttemptIds: attempts.map((attempt) => attempt.id), items, claims, conflicts, informationGaps: gaps, contentHash
    }
    this.kernel.save({ entityType: 'ResearchBundle', entity: bundle, immutable: true }, 'research.bundle.created', { sourceAttemptIds: bundle.sourceAttemptIds, itemCount: items.length })
    return bundle
  }

  private validateContext(input: ManagedResearchInput): void {
    if (!input.question.trim() || input.question.length > 2_000) throw new Error('invalid_research_question')
    const assignment = this.kernel.store.get<Assignment>('Assignment', input.assignmentId)
    const employee = this.kernel.store.get<EmployeeVersion>('EmployeeVersion', input.employeeVersionId)
    if (!assignment || assignment.runId !== input.runId || assignment.employeeVersionId !== input.employeeVersionId || !employee) throw new Error('invalid_research_context')
    if (!hasResearchCapability(employee.capabilityVersionIds)) throw new Error('research_capability_not_granted')
  }
}
