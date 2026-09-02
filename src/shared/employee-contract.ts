export type EmployeeUiStatus = 'draft' | 'pending_test' | 'active' | 'disabled' | 'archived' | 'pending_changes'

export interface EmployeeDraftInput {
  name: string
  role?: string
  description: string
  avatarDataUrl?: string
  systemPrompt: string
  modelId: 'deepseek-v4-pro' | 'claude-sonnet-4.6'
  capabilityVersionIds: string[]
  memoryScopes: Array<'global' | 'employee' | 'task'>
}

export interface EmployeeSummary {
  id: string
  name: string
  role?: string
  avatarDataUrl?: string
  status: EmployeeUiStatus
  activeVersionId?: string
  draftVersionId?: string
  capabilityVersionIds: string[]
  activeCapabilityVersionIds: string[]
}

export interface EmployeeView {
  schemaVersion: 1
  id: string
  createdAt: string
  name: string
  activeVersionId?: string
  draftVersionId?: string
  disabled: boolean
  archived: boolean
}

export interface EmployeeVersionView extends EmployeeDraftInput {
  schemaVersion: 1
  id: string
  createdAt: string
  employeeId: string
  version: number
  state: 'draft' | 'tested' | 'active' | 'superseded'
  testRunIds: string[]
  publishedAt?: string
}

export interface TestCaseView {
  schemaVersion: 1
  id: string
  createdAt: string
  employeeId: string
  employeeVersionId: string
  name: string
  prompt: string
  acceptanceCriteria: string
  expectedContains?: string
}

export interface SandboxTestRunView {
  schemaVersion: 1
  id: string
  createdAt: string
  employeeId: string
  employeeVersionId: string
  testCaseId: string
  providerRequestId: string
  status: 'running' | 'completed' | 'failed'
  output: string
  automaticPassed?: boolean
  userConfirmed: boolean
  failureCode?: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; source: 'provider_actual' }
  completedAt?: string
}

export interface AgentCapabilityVersionView {
  schemaVersion: 1
  id: string
  createdAt: string
  name: string
  description: string
  version: number
  skillVersionIds: string[]
  toolVersionIds: string[]
  mcpVersionIds: string[]
  requiredModelIds: string[]
  permissionRequirements: string[]
  dependencies: Array<{ kind: 'Skill' | 'Tool' | 'MCP' | 'Model'; versionId: string; available: boolean; reason?: string }>
}

export interface EmployeeDetail {
  employee: EmployeeView
  status: EmployeeUiStatus
  draft?: EmployeeVersionView
  active?: EmployeeVersionView
  versions: EmployeeVersionView[]
  testCases: TestCaseView[]
  testRuns: SandboxTestRunView[]
  formalReferences: Array<{ assignmentId: string; runId: string; employeeVersionId: string }>
}
