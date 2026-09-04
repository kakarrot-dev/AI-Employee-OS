import { toPlainTimelineSummary, toResultMarkdown } from '../shared/chat-content-contract'
import type { DeliveryResultContract, DeliveryResultType } from '../shared/delivery-result-contract'
import type { Assignment, ResearchBundle, ToolAction } from './domain'

export interface DeliveryResultCandidate {
  resultType: DeliveryResultType
  headline: string
  summary: string
  keyResults: Array<{ label: string; value: string; unit: string; sourceIds: string[] }>
  limitations: string[]
}

function isGenericCompletion(value: string): boolean {
  const normalized = value.replace(/[“”'"。，；;！!\s]/g, '')
  return /^(?:员工)?结果(?:已经|已)?通过验收(?:交付文件与来源证据均已保存)?$/.test(normalized)
    || /^(?:本次)?(?:执行|任务|交付)(?:已经|已)?完成$/.test(normalized)
    || /^验收通过$/.test(normalized)
}

function primitiveMatchesValue(value: string | number | boolean, expected: string): boolean {
  const normalized = expected.trim()
  if (String(value).trim() === normalized) return true
  if (typeof value === 'boolean') {
    const match = /^(true|false)\s*(?:[（(][^）)]{1,40}[）)])?$/iu.exec(normalized)
    return Boolean(match && (match[1].toLocaleLowerCase() === 'true') === value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const match = /^([-+]?\d+(?:\.\d+)?)\s*(?:[\p{L}\p{Script=Han}%‰]+)?\s*(?:[（(][^）)]{1,40}[）)])?$/u.exec(normalized)
    return Boolean(match && Number(match[1]) === value)
  }
  return false
}

function resultContainsValue(value: unknown, expected: string): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return primitiveMatchesValue(value, expected)
  if (Array.isArray(value)) return value.some((item) => resultContainsValue(item, expected))
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => resultContainsValue(item, expected))
  return false
}

export function validateDeliveryResultCandidate(candidate: DeliveryResultCandidate, actions: ToolAction[], researchBundles: ResearchBundle[]): void {
  const headline = toPlainTimelineSummary(candidate.headline, 80)
  const summary = toPlainTimelineSummary(candidate.summary, 500)
  if (!headline || !summary || isGenericCompletion(summary)) throw new Error('delivery_result_not_specific')
  if (!Array.isArray(candidate.keyResults) || candidate.keyResults.length > 6) throw new Error('invalid_delivery_key_results')
  const trustedActions = new Map(actions.filter((action) => action.state === 'succeeded' && action.resultVerified === true).map((action) => [action.id, action]))
  const trustedBundles = new Map(researchBundles.filter((bundle) => bundle.items.length > 0).map((bundle) => [bundle.id, bundle]))
  for (const item of candidate.keyResults) {
    const label = toPlainTimelineSummary(item.label, 40)
    const value = toPlainTimelineSummary(item.value, 120)
    if (!label || !value || typeof item.unit !== 'string' || !Array.isArray(item.sourceIds) || item.sourceIds.length === 0) throw new Error('delivery_key_result_missing_source')
    const sourceIds = [...new Set(item.sourceIds)]
    if (sourceIds.some((id) => !trustedActions.has(id) && !trustedBundles.has(id))) throw new Error('delivery_key_result_unverified')
    const matched = sourceIds.some((id) => {
      const action = trustedActions.get(id)
      if (action) return resultContainsValue(action.result, value)
      const bundle = trustedBundles.get(id)
      return Boolean(bundle && resultContainsValue({ sourceCount: bundle.items.length, claimCount: bundle.claims.length, conflictCount: bundle.conflicts.length, informationGapCount: bundle.informationGaps.length, claims: bundle.claims }, value))
    })
    if (!matched) throw new Error('delivery_key_result_unverified')
  }
}

export function createDeliveryResultContract(input: {
  candidate: DeliveryResultCandidate
  assignments: Assignment[]
  actions: ToolAction[]
  researchBundles: ResearchBundle[]
  artifactIds: string[]
  evidenceIds: string[]
  unresolvedIssues: string[]
}): DeliveryResultContract {
  validateDeliveryResultCandidate(input.candidate, input.actions, input.researchBundles)
  const headline = toPlainTimelineSummary(input.candidate.headline, 80)
  const summary = toResultMarkdown(input.candidate.summary, 500)
  const trustedActions = new Map(input.actions.filter((action) => action.state === 'succeeded' && action.resultVerified === true).map((action) => [action.id, action]))
  const trustedBundleIds = new Set(input.researchBundles.filter((bundle) => bundle.items.length > 0).map((bundle) => bundle.id))
  const keyResults = input.candidate.keyResults.map((item) => {
    const label = toPlainTimelineSummary(item.label, 40)
    const value = toPlainTimelineSummary(item.value, 120)
    const unit = toPlainTimelineSummary(item.unit, 24)
    if (!label || !value || !Array.isArray(item.sourceIds) || item.sourceIds.length === 0) throw new Error('delivery_key_result_missing_source')
    const sourceRefs = [...new Set(item.sourceIds)].map((id) => trustedActions.has(id) ? `tool_action:${id}` : trustedBundleIds.has(id) ? `research_bundle:${id}` : '')
    if (sourceRefs.some((ref) => !ref)) throw new Error('delivery_key_result_unverified')
    return { label, value, unit, sourceRefs, evidenceIds: [...input.evidenceIds] }
  })
  const summarySourceAssignmentIds = input.assignments.filter((assignment) => assignment.state === 'succeeded' && Boolean(assignment.output?.trim() || assignment.summary?.trim())).map((assignment) => assignment.id)
  if (summarySourceAssignmentIds.length === 0 && input.artifactIds.length === 0) throw new Error('delivery_summary_source_missing')
  const resultType: DeliveryResultType = input.artifactIds.length > 0
    ? keyResults.length > 0 ? 'mixed' : 'file'
    : keyResults.length > 0 ? 'metric' : 'text'
  return {
    schemaVersion: 1,
    resultType,
    headline,
    summary,
    keyResults,
    artifactIds: [...input.artifactIds],
    summarySourceAssignmentIds,
    limitations: [...new Set([...input.candidate.limitations.map((item) => toPlainTimelineSummary(item, 240)).filter(Boolean), ...input.unresolvedIssues])]
  }
}
