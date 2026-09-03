export const RUNTIME_SCHEMA_VERSION = 1 as const

export type EntityType =
  | 'SupervisorConfiguration'
  | 'Employee'
  | 'EmployeeVersion'
  | 'AgentCapabilityVersion'
  | 'TestCase'
  | 'SandboxTestRun'
  | 'Conversation'
  | 'Message'
  | 'Task'
  | 'TaskDraft'
  | 'TaskRevision'
  | 'ChangeRequest'
  | 'Run'
  | 'Assignment'
  | 'Handoff'
  | 'ToolAction'
  | 'Approval'
  | 'Artifact'
  | 'Evidence'
  | 'Delivery'
  | 'RunGrant'
  | 'BudgetLedgerEntry'
  | 'Checkpoint'
  | 'SkillVersion'
  | 'ToolVersion'
  | 'MCPVersion'
  | 'SourceAttempt'
  | 'ResearchBundle'
  | 'SourceHealthCheck'

export type TaskState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type RunState = 'created' | 'running' | 'pausing' | 'paused' | 'succeeded' | 'failed' | 'cancelled'
export type ToolActionState = 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'result_unknown' | 'cancelled'
export type ResearchSourceType = 'github_repository' | 'rss_atom' | 'agent_reach_web' | 'last30days' | 'opencli_social'
export type UiTaskState = 'draft' | 'pending' | 'running' | 'needs_attention' | 'succeeded' | 'failed' | 'cancelled'
export type AuthorizationMode = 'approval_required' | 'full_access'

interface VersionedEntity {
  schemaVersion: typeof RUNTIME_SCHEMA_VERSION
  id: string
  createdAt: string
}

export interface SupervisorConfiguration extends VersionedEntity {
  id: 'supervisor.local'
  updatedAt: string
  name: string
  avatarDataUrl?: string
  systemPrompt: string
  modelId: 'deepseek-v4-pro' | 'claude-sonnet-4.6'
  memoryScopes: Array<'global'>
}

export interface Employee extends VersionedEntity {
  name: string
  avatarDataUrl?: string
  activeVersionId?: string
  draftVersionId?: string
  disabled: boolean
  archived: boolean
}

export type EmployeeVersionState = 'draft' | 'tested' | 'active' | 'superseded'

export interface EmployeeVersion extends VersionedEntity {
  employeeId: string
  version: number
  state: EmployeeVersionState
  name: string
  role?: string
  description: string
  avatarDataUrl?: string
  systemPrompt: string
  modelId: 'deepseek-v4-pro' | 'claude-sonnet-4.6'
  capabilityVersionIds: string[]
  memoryScopes: Array<'global' | 'employee' | 'task'>
  testRunIds: string[]
  publishedAt?: string
}

export interface CapabilityDependency {
  kind: 'Skill' | 'Tool' | 'MCP' | 'Model'
  versionId: string
  available: boolean
  reason?: string
}

export interface AgentCapabilityVersion extends VersionedEntity {
  name: string
  description: string
  version: number
  skillVersionIds: string[]
  toolVersionIds: string[]
  mcpVersionIds: string[]
  requiredModelIds: string[]
  permissionRequirements: string[]
  dependencies: CapabilityDependency[]
}

export interface TestCase extends VersionedEntity {
  employeeId: string
  employeeVersionId: string
  name: string
  prompt: string
  acceptanceCriteria: string
  expectedContains?: string
}

export interface SandboxTestRun extends VersionedEntity {
  employeeId: string
  employeeVersionId: string
  testCaseId: string
  providerRequestId: string
  status: 'running' | 'evaluating' | 'completed' | 'failed'
  output: string
  evaluationProviderRequestId?: string
  evaluationText?: string
  evaluation?: { passed: boolean; summary: string; criteria: Array<{ id: 'task_acceptance' | 'role_scope' | 'truth_and_evidence' | 'output_actionability'; passed: boolean; reason: string }> }
  automaticPassed?: boolean
  userConfirmed: boolean
  failureCode?: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; source: 'provider_actual' }
  completedAt?: string
}

export interface Conversation extends VersionedEntity {
  title: string
  archived: boolean
}

export interface Message extends VersionedEntity {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageAttachmentReference[]
  provider?: 'deepseek' | 'poe'
  modelId?: string
  providerRequestId?: string
}

export interface MessageAttachmentReference {
  id: string
  name: string
  path: string
  mediaType: string
  size: number
  sha256: string
}

export interface BudgetSnapshot {
  maxInputTokens: number
  maxOutputTokens: number
  maxAmountUsdMicros: number
  maxSteps: number
}

export interface Task extends VersionedEntity {
  conversationId: string
  state: TaskState
  activeRevisionId?: string
  activeRunId?: string
}

export interface ResourceScope {
  directories: string[]
  toolVersionIds: string[]
  modelConfigIds: string[]
  memoryScopes: string[]
  /** Optional only for backward-compatible recovery of revisions created before Skill snapshots existed. */
  skillVersionIds?: string[]
  skillDigests?: Record<string, string>
}

export interface TaskDraft extends VersionedEntity {
  conversationId: string
  sourceMessageIds: string[]
  attachments: MessageAttachmentReference[]
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
  capabilityVersionIds: string[]
  modelConfigIds: string[]
  budget: BudgetSnapshot
  authorizationMode: AuthorizationMode
  resourceScope: ResourceScope
  revision: number
}

export interface TaskRevision extends VersionedEntity {
  taskId: string
  sourceDraftId: string
  revision: number
  frozen: true
  attachments: MessageAttachmentReference[]
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
  capabilityVersionIds: string[]
  modelConfigIds: string[]
  budget: BudgetSnapshot
  timeoutsMs: { firstToken: number; request: number; run: number }
  authorizationMode: AuthorizationMode
  resourceScope: ResourceScope
}

export interface ChangeRequest extends VersionedEntity {
  taskId: string
  sourceMessageId: string
  oldRunId: string
  requestedDiff: Record<string, unknown>
  safeStopEventId?: string
  decision: 'pending' | 'accepted' | 'rejected'
}

export interface Run extends VersionedEntity {
  taskId: string
  taskRevisionId: string
  runGrantId: string
  state: RunState
  supersedesRunId?: string
}

export interface Assignment extends VersionedEntity {
  runId: string
  sequence: number
  employeeVersionId: string
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  providerRequestId?: string
  output?: string
  summary?: string
  completedAt?: string
  toolActionIds?: string[]
  awaitingToolActionId?: string
  reworkOfAssignmentId?: string
  invalidToolProposalCount?: number
}

export interface Handoff extends VersionedEntity {
  runId: string
  fromAssignmentId: string
  toAssignmentId?: string
  toSupervisor: boolean
  input: Record<string, unknown>
  output: Record<string, unknown>
  artifactIds: string[]
  evidenceIds: string[]
  sha256: string
}

export interface ToolAction extends VersionedEntity {
  runId: string
  assignmentId: string
  toolVersionId: string
  idempotencyKey: string
  state: ToolActionState
  parameters: Record<string, unknown>
  parameterSources: Record<string, { kind: 'task_input' | 'trusted_runtime' | 'model_output' | 'untrusted_external_content'; sourceRef: string }>
  risk: 'low' | 'medium' | 'high'
  sideEffect: 'none' | 'external_read' | 'external_write'
  timeoutMs: number
  approvalId?: string
  startedAt?: string
  completedAt?: string
  result?: Record<string, unknown>
  failureCode?: string
  resultVerified?: boolean
}

export interface Approval extends VersionedEntity {
  runId: string
  toolActionId: string
  decision: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  decidedAt?: string
}

export interface SkillVersion extends VersionedEntity {
  name: string
  description: string
  version: number
  steps: string[]
  toolVersionIds: string[]
  instructionsMarkdown: string
  instructionDigest: string
  available: boolean
  reason?: string
}

export interface ToolVersion extends VersionedEntity {
  name: string
  description: string
  version: number
  source: 'built_in' | 'mcp'
  mcpVersionId?: string
  inputSchema: Record<string, unknown>
  sideEffect: 'none' | 'external_read' | 'external_write'
  risk: 'low' | 'medium' | 'high'
  timeoutMs: number
  networkOrigins: string[]
  available: boolean
  health: 'available' | 'degraded' | 'unavailable'
  credentialStatus: 'not_required' | 'configured' | 'missing'
  reason?: string
}

export interface MCPVersion extends VersionedEntity {
  name: string
  description: string
  version: number
  transport: 'built_in_runner' | 'stdio' | 'http'
  toolVersionIds: string[]
  credentialRequirement: 'none' | 'optional' | 'required'
  credentialStatus: 'not_required' | 'configured' | 'missing'
  health: 'available' | 'degraded' | 'unavailable'
  available: boolean
  reason?: string
}

export interface SourceAttempt extends VersionedEntity {
  researchBundleId: string
  toolActionId: string
  adapterVersionId: string
  sourceType: ResearchSourceType
  query: string
  url: string
  status: 'succeeded' | 'failed'
  fetchedAt: string
  httpStatus?: number
  failureCode?: string
  retryAfter?: string
  contentHash?: string
  truncated: boolean
}

export interface ResearchItem {
  sourceAttemptId: string
  sourceType: ResearchSourceType
  url: string
  title: string
  author?: string
  publishedAt?: string
  fetchedAt: string
  summary: string
  contentHash: string
  trust: 'untrusted_external_content'
  injectionSignals: string[]
}

export interface ResearchBundle extends VersionedEntity {
  taskId: string
  runId: string
  assignmentId: string
  employeeVersionId: string
  question: string
  queries: Array<{ adapterVersionId: string; query: string }>
  sourceAttemptIds: string[]
  items: ResearchItem[]
  claims: Array<{ statement: string; sourceItemIndexes: number[]; confidence: 'low' | 'medium' | 'high' }>
  conflicts: string[]
  informationGaps: string[]
  contentHash: string
  createdAt: string
}

export interface SourceHealthCheck extends VersionedEntity {
  adapterVersionId: string
  status: 'available' | 'degraded' | 'unavailable'
  credentialStatus: 'not_required' | 'configured' | 'missing'
  latencyMs: number
  checkedAt: string
  failureCode?: string
}

export interface Artifact extends VersionedEntity {
  runId: string
  version: number
  mediaType: string
  relativePath: string
  sha256: string
}

export interface Evidence extends VersionedEntity {
  runId: string
  version: number
  sourceType: string
  sourceRef: string
  capturedAt: string
  sha256: string
}

export interface Delivery extends VersionedEntity {
  taskId: string
  runId: string
  taskRevisionId: string
  artifactIds: string[]
  evidenceIds: string[]
  acceptanceResults: Array<{ criterion: string; passed: boolean; evidenceIds: string[] }>
  unresolvedIssues: string[]
}

export interface RunGrant extends VersionedEntity {
  runId: string
  expiresAt: string
  budget: BudgetSnapshot
  authorizationMode: AuthorizationMode
  resourceScope: ResourceScope
}

export interface BudgetLedgerEntry extends VersionedEntity {
  runId: string
  requestId: string
  provider: 'deepseek' | 'poe'
  modelId: string
  inputTokens: number
  outputTokens: number
  amountUsdMicros: number
  source: 'provider_actual' | 'provider_estimate'
}

export interface Checkpoint extends VersionedEntity {
  runId: string
  sequence: number
  assignmentId?: string
  workerThreadId: string
  phase: 'created' | 'memory_loaded' | 'tool_waiting' | 'employee_completed' | 'deep_agents_safe_pause' | 'manager_review' | 'manager_rework' | 'delivery_committed' | 'shutdown_requested' | 'safe_paused'
  nextNode?: 'employee' | 'manager' | 'delivery'
  committed: true
  unsettledToolActionIds: string[]
  payload: Record<string, unknown>
}

export type RuntimeEntity = SupervisorConfiguration | Employee | EmployeeVersion | AgentCapabilityVersion | TestCase | SandboxTestRun | Conversation | Message | Task | TaskDraft | TaskRevision | ChangeRequest | Run | Assignment | Handoff | ToolAction | Approval | Artifact | Evidence | Delivery | RunGrant | BudgetLedgerEntry | Checkpoint | SkillVersion | ToolVersion | MCPVersion | SourceAttempt | ResearchBundle | SourceHealthCheck

export interface EntityRecord<T extends RuntimeEntity = RuntimeEntity> {
  entityType: EntityType
  entity: T
  immutable: boolean
}

export interface AuditEvent<TPayload = unknown> {
  schemaVersion: typeof RUNTIME_SCHEMA_VERSION
  eventId: string
  occurredAt: string
  eventType: string
  aggregateType: EntityType | 'Runtime'
  aggregateId: string
  payload: TPayload
}

const entityTypes = new Set<EntityType>(['SupervisorConfiguration', 'Employee', 'EmployeeVersion', 'AgentCapabilityVersion', 'TestCase', 'SandboxTestRun', 'Conversation', 'Message', 'Task', 'TaskDraft', 'TaskRevision', 'ChangeRequest', 'Run', 'Assignment', 'Handoff', 'ToolAction', 'Approval', 'Artifact', 'Evidence', 'Delivery', 'RunGrant', 'BudgetLedgerEntry', 'Checkpoint', 'SkillVersion', 'ToolVersion', 'MCPVersion', 'SourceAttempt', 'ResearchBundle', 'SourceHealthCheck'])

export function assertEntityRecord(value: unknown): asserts value is EntityRecord {
  if (!value || typeof value !== 'object') throw new Error('invalid_entity_record')
  const record = value as Partial<EntityRecord>
  if (!record.entityType || !entityTypes.has(record.entityType)) throw new Error('unknown_entity_type')
  if (!record.entity || typeof record.entity !== 'object') throw new Error('invalid_entity')
  if (record.entity.schemaVersion !== RUNTIME_SCHEMA_VERSION) throw new Error('unsupported_schema_version')
  if (typeof record.entity.id !== 'string' || !record.entity.id) throw new Error('invalid_entity_id')
  if (typeof record.entity.createdAt !== 'string' || Number.isNaN(Date.parse(record.entity.createdAt))) throw new Error('invalid_created_at')
  if (typeof record.immutable !== 'boolean') throw new Error('invalid_immutable_flag')
  if (record.entityType === 'Run' && !['created', 'running', 'pausing', 'paused', 'succeeded', 'failed', 'cancelled'].includes(String((record.entity as Partial<Run>).state))) throw new Error('unknown_run_state')
  if (record.entityType === 'ToolAction' && !['pending', 'running', 'succeeded', 'failed', 'blocked', 'result_unknown', 'cancelled'].includes(String((record.entity as Partial<ToolAction>).state))) throw new Error('unknown_tool_action_state')
  if (record.entityType === 'Approval' && !['pending', 'approved', 'rejected'].includes(String((record.entity as Partial<Approval>).decision))) throw new Error('unknown_approval_decision')
  if (record.entityType === 'ChangeRequest' && !['pending', 'accepted', 'rejected'].includes(String((record.entity as Partial<ChangeRequest>).decision))) throw new Error('unknown_change_request_decision')
  if (record.entityType === 'EmployeeVersion' && !['draft', 'tested', 'active', 'superseded'].includes(String((record.entity as Partial<EmployeeVersion>).state))) throw new Error('unknown_employee_version_state')
  if (record.entityType === 'SandboxTestRun' && !['running', 'evaluating', 'completed', 'failed'].includes(String((record.entity as Partial<SandboxTestRun>).status))) throw new Error('unknown_test_run_state')
  if (record.entityType === 'Task' && !['pending', 'running', 'succeeded', 'failed', 'cancelled'].includes(String((record.entity as Partial<Task>).state))) throw new Error('unknown_task_state')
}
