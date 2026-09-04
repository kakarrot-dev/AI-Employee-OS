import { createHash } from 'node:crypto'

export type HandoffJsonPrimitive = string | number | boolean | null
export type HandoffJsonValue = HandoffJsonPrimitive | HandoffJsonValue[] | { [key: string]: HandoffJsonValue }

export type HandoffPart =
  | { kind: 'text'; name?: string; mediaType: 'text/plain' | 'text/markdown'; text: string }
  | { kind: 'data'; name?: string; mediaType: 'application/json'; schemaId?: string; value: HandoffJsonValue }
  | { kind: 'artifact_ref'; artifactId: string; name?: string; mediaType?: string; sha256?: string }
  | { kind: 'evidence_ref'; evidenceId: string; name?: string; sha256?: string }
  | { kind: 'error'; code: string; message: string; retryable: boolean; details?: HandoffJsonValue }
  | { kind: 'extension'; namespace: string; mediaType: string; value: HandoffJsonValue }

export interface AgentHandoffEnvelope {
  schemaVersion: 1
  type: 'AgentHandoffEnvelope'
  runId: string
  taskRevisionId: string
  producer: { assignmentId: string; employeeVersionId: string }
  audience: { assignmentIds: string[]; supervisor: boolean }
  summary?: string
  parts: HandoffPart[]
}

const MAX_PARTS = 64
const MAX_INLINE_BYTES = 512 * 1024
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

function assertNonEmpty(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code)
}

function assertJsonValue(value: unknown, path: string, ancestors = new Set<object>()): asserts value is HandoffJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`handoff_non_json_value:${path}`)
    return
  }
  if (typeof value !== 'object') throw new Error(`handoff_non_json_value:${path}`)
  if (ancestors.has(value)) throw new Error(`handoff_cyclic_value:${path}`)
  const nextAncestors = new Set(ancestors).add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, nextAncestors))
    return
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`handoff_non_plain_object:${path}`)
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key) throw new Error(`handoff_empty_key:${path}`)
    assertJsonValue(item, `${path}.${key}`, nextAncestors)
  }
}

export function canonicalHandoffJson(value: HandoffJsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalHandoffJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalHandoffJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function normalizeHandoffJsonValue(value: unknown): HandoffJsonValue {
  let encoded: string | undefined
  try {
    encoded = JSON.stringify(value)
  } catch {
    throw new Error('handoff_non_json_value:root')
  }
  if (encoded === undefined) throw new Error('handoff_non_json_value:root')
  const normalized: unknown = JSON.parse(encoded)
  assertJsonValue(normalized, 'root')
  return normalized
}

function validatePart(part: HandoffPart, index: number): void {
  if (!part || typeof part !== 'object') throw new Error(`handoff_invalid_part:${index}`)
  if ('name' in part && part.name !== undefined && (typeof part.name !== 'string' || !part.name.trim())) throw new Error(`handoff_invalid_part_name:${index}`)
  switch (part.kind) {
    case 'text':
      if (!['text/plain', 'text/markdown'].includes(part.mediaType) || typeof part.text !== 'string') throw new Error(`handoff_invalid_text_part:${index}`)
      return
    case 'data':
      if (part.mediaType !== 'application/json') throw new Error(`handoff_invalid_data_media_type:${index}`)
      if (part.schemaId !== undefined) assertNonEmpty(part.schemaId, `handoff_invalid_schema_id:${index}`)
      assertJsonValue(part.value, `parts[${index}].value`)
      return
    case 'artifact_ref':
      assertNonEmpty(part.artifactId, `handoff_invalid_artifact_ref:${index}`)
      if (part.sha256 !== undefined && !SHA256_PATTERN.test(part.sha256)) throw new Error(`handoff_invalid_artifact_hash:${index}`)
      return
    case 'evidence_ref':
      assertNonEmpty(part.evidenceId, `handoff_invalid_evidence_ref:${index}`)
      if (part.sha256 !== undefined && !SHA256_PATTERN.test(part.sha256)) throw new Error(`handoff_invalid_evidence_hash:${index}`)
      return
    case 'error':
      assertNonEmpty(part.code, `handoff_invalid_error_code:${index}`)
      assertNonEmpty(part.message, `handoff_invalid_error_message:${index}`)
      if (typeof part.retryable !== 'boolean') throw new Error(`handoff_invalid_error_retryable:${index}`)
      if (part.details !== undefined) assertJsonValue(part.details, `parts[${index}].details`)
      return
    case 'extension':
      if (!/^[a-z0-9][a-z0-9._/-]*$/u.test(part.namespace)) throw new Error(`handoff_invalid_extension_namespace:${index}`)
      assertNonEmpty(part.mediaType, `handoff_invalid_extension_media_type:${index}`)
      assertJsonValue(part.value, `parts[${index}].value`)
      return
    default:
      throw new Error(`handoff_unknown_part_kind:${index}`)
  }
}

export function validateHandoffEnvelope(envelope: AgentHandoffEnvelope): void {
  if (envelope.schemaVersion !== 1 || envelope.type !== 'AgentHandoffEnvelope') throw new Error('handoff_unsupported_schema')
  assertNonEmpty(envelope.runId, 'handoff_missing_run_id')
  assertNonEmpty(envelope.taskRevisionId, 'handoff_missing_task_revision_id')
  assertNonEmpty(envelope.producer?.assignmentId, 'handoff_missing_producer_assignment')
  assertNonEmpty(envelope.producer?.employeeVersionId, 'handoff_missing_producer_employee')
  if (!Array.isArray(envelope.audience?.assignmentIds) || envelope.audience.assignmentIds.some((id) => typeof id !== 'string' || !id.trim()) || new Set(envelope.audience.assignmentIds).size !== envelope.audience.assignmentIds.length || typeof envelope.audience.supervisor !== 'boolean') throw new Error('handoff_invalid_audience')
  if (envelope.summary !== undefined && (typeof envelope.summary !== 'string' || !envelope.summary.trim())) throw new Error('handoff_invalid_summary')
  if (!Array.isArray(envelope.parts) || envelope.parts.length === 0 || envelope.parts.length > MAX_PARTS) throw new Error('handoff_invalid_parts')
  envelope.parts.forEach(validatePart)
  assertJsonValue(envelope, 'envelope')
  if (Buffer.byteLength(canonicalHandoffJson(envelope as unknown as HandoffJsonValue), 'utf8') > MAX_INLINE_BYTES) throw new Error('handoff_payload_too_large')
}

export function createHandoffEnvelope(input: Omit<AgentHandoffEnvelope, 'schemaVersion' | 'type'>): { envelope: AgentHandoffEnvelope; sha256: string } {
  const envelope: AgentHandoffEnvelope = {
    schemaVersion: 1,
    type: 'AgentHandoffEnvelope',
    ...input,
    audience: { assignmentIds: [...input.audience.assignmentIds], supervisor: input.audience.supervisor },
    parts: input.parts.map((part) => ({ ...part }))
  }
  validateHandoffEnvelope(envelope)
  return { envelope, sha256: createHash('sha256').update(canonicalHandoffJson(envelope as unknown as HandoffJsonValue)).digest('hex') }
}

export function verifyHandoffEnvelope(envelope: AgentHandoffEnvelope, sha256: string): void {
  validateHandoffEnvelope(envelope)
  if (!SHA256_PATTERN.test(sha256) || createHash('sha256').update(canonicalHandoffJson(envelope as unknown as HandoffJsonValue)).digest('hex') !== sha256) throw new Error('handoff_integrity_failed')
}

export function assertHandoffAudience(envelope: AgentHandoffEnvelope, recipient: { assignmentId?: string; supervisor?: boolean }): void {
  if (recipient.supervisor === true && envelope.audience.supervisor) return
  if (recipient.assignmentId && envelope.audience.assignmentIds.includes(recipient.assignmentId)) return
  throw new Error('handoff_recipient_not_authorized')
}

export function renderHandoffEnvelope(envelope: AgentHandoffEnvelope, sha256: string, recipient: { assignmentId?: string; supervisor?: boolean }): string {
  verifyHandoffEnvelope(envelope, sha256)
  assertHandoffAudience(envelope, recipient)
  return canonicalHandoffJson(envelope as unknown as HandoffJsonValue)
}
