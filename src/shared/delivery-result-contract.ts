export type DeliveryResultType = 'text' | 'metric' | 'file' | 'mixed'

export interface DeliveryKeyResult {
  label: string
  value: string
  unit: string
  sourceRefs: string[]
  evidenceIds: string[]
}

/**
 * Immutable, Runtime-validated result of a completed task.
 * Model output is only a candidate; Runtime binds trusted ToolAction,
 * Evidence and Artifact identifiers before this contract is committed.
 */
export interface DeliveryResultContract {
  schemaVersion: 1
  resultType: DeliveryResultType
  headline: string
  summary: string
  keyResults: DeliveryKeyResult[]
  artifactIds: string[]
  summarySourceAssignmentIds: string[]
  limitations: string[]
}

export function isDeliveryResultContract(value: unknown): value is DeliveryResultContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<DeliveryResultContract>
  if (candidate.schemaVersion !== 1 || !['text', 'metric', 'file', 'mixed'].includes(String(candidate.resultType))) return false
  if (typeof candidate.headline !== 'string' || !candidate.headline.trim() || typeof candidate.summary !== 'string' || !candidate.summary.trim()) return false
  if (!Array.isArray(candidate.keyResults) || candidate.keyResults.length > 6 || candidate.keyResults.some((item) => !item || typeof item.label !== 'string' || !item.label.trim() || typeof item.value !== 'string' || !item.value.trim() || typeof item.unit !== 'string' || !Array.isArray(item.sourceRefs) || item.sourceRefs.length === 0 || item.sourceRefs.some((ref) => typeof ref !== 'string' || !/^(?:tool_action|research_bundle):[^:]+$/.test(ref)) || !Array.isArray(item.evidenceIds) || item.evidenceIds.some((id) => typeof id !== 'string' || !id))) return false
  if (!Array.isArray(candidate.artifactIds) || candidate.artifactIds.some((id) => typeof id !== 'string' || !id)) return false
  if (!Array.isArray(candidate.summarySourceAssignmentIds) || candidate.summarySourceAssignmentIds.some((id) => typeof id !== 'string' || !id) || (candidate.summarySourceAssignmentIds.length === 0 && candidate.artifactIds.length === 0)) return false
  if (!Array.isArray(candidate.limitations) || candidate.limitations.some((item) => typeof item !== 'string' || !item.trim())) return false
  return true
}
