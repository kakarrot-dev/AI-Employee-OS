export type EmployeeUiStatus = 'draft' | 'pending_test' | 'active' | 'disabled' | 'archived'

export const EMPLOYEE_FIELD_LIMITS = Object.freeze({
  name: { min: 2, max: 20 },
  role: { min: 2, max: 40 },
  description: { min: 10, max: 500 },
  systemPrompt: { min: 10, max: 10_000 },
  avatarBytes: 2_000_000
})

export type EmployeeDraftField = 'draft' | 'name' | 'role' | 'description' | 'avatarDataUrl' | 'systemPrompt' | 'modelId' | 'capabilityVersionIds' | 'memoryScopes'

export interface EmployeeDraftIssue {
  field: EmployeeDraftField
  code: string
  message: string
}

export interface EmployeeDraftInput {
  name: string
  role: string
  description: string
  avatarDataUrl?: string
  systemPrompt: string
  modelId: 'deepseek-v4-pro' | 'claude-sonnet-4.6'
  capabilityVersionIds: string[]
  memoryScopes: Array<'global' | 'employee' | 'task'>
}

function textLength(value: string): number {
  return [...value.trim()].length
}

function textIssue(field: 'name' | 'role' | 'description' | 'systemPrompt', value: unknown, label: string, code: string): EmployeeDraftIssue | undefined {
  const limits = EMPLOYEE_FIELD_LIMITS[field]
  if (typeof value !== 'string' || !value.trim()) return { field, code, message: `请输入${label}` }
  const length = textLength(value)
  if (length < limits.min || length > limits.max) return { field, code, message: `${label}需为 ${limits.min}–${limits.max} 个字符` }
  if ((field === 'name' || field === 'role') && /[\r\n\t\u0000-\u001f\u007f]/u.test(value)) return { field, code, message: `${label}只能填写单行文字` }
  return undefined
}

export function avatarDataUrlError(value: unknown, maxBytes = EMPLOYEE_FIELD_LIMITS.avatarBytes): 'format' | 'size' | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return 'format'
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value)
  if (!match) return 'format'
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0
  const bytes = Math.floor(match[2].length * 3 / 4) - padding
  return bytes > maxBytes ? 'size' : undefined
}

function avatarIssue(value: unknown): EmployeeDraftIssue | undefined {
  const error = avatarDataUrlError(value)
  if (!error) return undefined
  return { field: 'avatarDataUrl', code: 'invalid_employee_avatar', message: error === 'size' ? '头像大小不能超过 2 MB' : '头像必须是 PNG、JPEG 或 WebP 图片' }
}

export function validateEmployeeDraft(input: unknown): EmployeeDraftIssue[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [{ field: 'draft', code: 'invalid_employee_draft', message: '员工信息格式不正确' }]
  const value = input as Record<string, unknown>
  const issues = [
    textIssue('name', value.name, '员工名称', 'invalid_employee_name'),
    textIssue('role', value.role, '员工职责', 'invalid_employee_role'),
    textIssue('description', value.description, '职责说明', 'invalid_employee_description'),
    textIssue('systemPrompt', value.systemPrompt, 'System Prompt', 'invalid_system_prompt'),
    avatarIssue(value.avatarDataUrl)
  ].filter((issue): issue is EmployeeDraftIssue => Boolean(issue))

  if (!['deepseek-v4-pro', 'claude-sonnet-4.6'].includes(String(value.modelId))) issues.push({ field: 'modelId', code: 'model_not_allowed', message: '请选择可用的运行模型' })
  if (!Array.isArray(value.capabilityVersionIds) || value.capabilityVersionIds.some((id) => typeof id !== 'string') || new Set(value.capabilityVersionIds).size !== value.capabilityVersionIds.length) issues.push({ field: 'capabilityVersionIds', code: 'invalid_capabilities', message: '员工能力配置不正确' })
  if (!Array.isArray(value.memoryScopes) || value.memoryScopes.some((scope) => !['global', 'employee', 'task'].includes(String(scope))) || new Set(value.memoryScopes).size !== value.memoryScopes.length) issues.push({ field: 'memoryScopes', code: 'invalid_memory_scopes', message: '员工记忆范围配置不正确' })
  return issues
}

export function normalizeEmployeeDraft(input: EmployeeDraftInput): EmployeeDraftInput {
  return { ...input, name: input.name.trim(), role: input.role.trim(), description: input.description.trim(), systemPrompt: input.systemPrompt.trim() }
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
  avatarDataUrl?: string
  activeVersionId?: string
  draftVersionId?: string
  disabled: boolean
  archived: boolean
}

export interface EmployeeVersionView extends Omit<EmployeeDraftInput, 'role'> {
  role?: string
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
