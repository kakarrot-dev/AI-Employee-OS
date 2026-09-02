import { randomUUID } from 'node:crypto'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import type { AllowedModelId } from '../provider/models'
import type { EmployeeDetail, EmployeeDraftInput, EmployeeSummary, EmployeeUiStatus } from '../shared/employee-contract'
import type { AgentCapabilityVersion, Assignment, Employee, EmployeeVersion, MCPVersion, SandboxTestRun, SkillVersion, SourceHealthCheck, TestCase, ToolVersion } from './domain'
import { RuntimeKernel } from './kernel'

export interface TestStartResult {
  request: ProviderRequest
  run: SandboxTestRun
}

const BUILT_IN_CAPABILITIES: AgentCapabilityVersion[] = [
  {
    schemaVersion: 1,
    id: 'capability.text-analysis.v1',
    createdAt: '2026-08-31T00:00:00.000Z',
    name: '文本分析与结构化表达',
    description: '在无外部副作用的边界内分析文本并生成结构化结果。',
    version: 1,
    skillVersionIds: [],
    toolVersionIds: [],
    mcpVersionIds: [],
    requiredModelIds: ['deepseek-v4-pro', 'claude-sonnet-4.6'],
    permissionRequirements: [],
    dependencies: []
  },
  {
    schemaVersion: 1,
    id: 'capability.managed-research.v1',
    createdAt: '2026-08-31T00:00:00.000Z',
    name: '受管网络调研',
    description: '通过受管 GitHub 与 RSS 数据源生成带来源的调研结果。',
    version: 1,
    skillVersionIds: ['skill.managed-research.v1'],
    toolVersionIds: ['github.repositories.search@research-source/v1', 'rss.read@research-source/v1'],
    mcpVersionIds: [],
    requiredModelIds: ['deepseek-v4-pro', 'claude-sonnet-4.6'],
    permissionRequirements: ['network.research'],
    dependencies: [
      { kind: 'Tool', versionId: 'github.repositories.search@research-source/v1', available: true },
      { kind: 'Tool', versionId: 'rss.read@research-source/v1', available: true },
      { kind: 'MCP', versionId: 'mcp.managed-research-runner.v1', available: true }
    ]
  }
]

export class EmployeeService {
  constructor(private readonly kernel: RuntimeKernel) {}

  seedCapabilities(): void {
    for (const capability of BUILT_IN_CAPABILITIES) {
      if (this.kernel.store.get<AgentCapabilityVersion>('AgentCapabilityVersion', capability.id)) continue
      this.kernel.save({ entityType: 'AgentCapabilityVersion', entity: capability, immutable: true }, 'agent_capability.installed', { version: capability.version })
    }
  }

  capabilities(): AgentCapabilityVersion[] {
    return this.kernel.store.list<AgentCapabilityVersion>('AgentCapabilityVersion').map((capability) => this.resolveCapability(capability))
  }

  list(): EmployeeSummary[] {
    return this.kernel.store.list<Employee>('Employee').map((employee) => {
      const currentVersionId = employee.draftVersionId ?? employee.activeVersionId
      const currentVersion = currentVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', currentVersionId) : undefined
      return {
        id: employee.id,
        name: employee.name,
        role: currentVersion?.role,
        avatarDataUrl: currentVersion?.avatarDataUrl,
        status: this.status(employee),
        activeVersionId: employee.activeVersionId,
        draftVersionId: employee.draftVersionId
      }
    })
  }

  detail(employeeId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    const versions = this.versions(employeeId)
    const versionIds = new Set(versions.map((version) => version.id))
    return {
      employee,
      status: this.status(employee),
      draft: employee.draftVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', employee.draftVersionId) : undefined,
      active: employee.activeVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', employee.activeVersionId) : undefined,
      versions,
      testCases: this.kernel.store.list<TestCase>('TestCase').filter((testCase) => versionIds.has(testCase.employeeVersionId)),
      testRuns: this.kernel.store.list<SandboxTestRun>('SandboxTestRun').filter((run) => versionIds.has(run.employeeVersionId)),
      formalReferences: this.kernel.store.list<Assignment>('Assignment').filter((assignment) => versionIds.has(assignment.employeeVersionId)).map((assignment) => ({ assignmentId: assignment.id, runId: assignment.runId, employeeVersionId: assignment.employeeVersionId }))
    }
  }

  create(input: EmployeeDraftInput): EmployeeDetail {
    this.validateDraft(input)
    const now = new Date().toISOString()
    const employeeId = randomUUID()
    const versionId = randomUUID()
    const version: EmployeeVersion = { schemaVersion: 1, id: versionId, createdAt: now, employeeId, version: 1, state: 'draft', ...input, testRunIds: [] }
    const employee: Employee = { schemaVersion: 1, id: employeeId, createdAt: now, name: input.name, draftVersionId: versionId, disabled: false, archived: false }
    this.kernel.save({ entityType: 'Employee', entity: employee, immutable: false }, 'employee.created', { draftVersionId: versionId })
    this.kernel.save({ entityType: 'EmployeeVersion', entity: version, immutable: false }, 'employee_version.draft_created', { employeeId, version: 1 })
    return this.detail(employeeId)
  }

  beginEdit(employeeId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    if (employee.archived) throw new Error('employee_archived')
    if (employee.draftVersionId) return this.detail(employeeId)
    if (!employee.activeVersionId) throw new Error('active_version_not_found')
    const active = this.requireVersion(employee.activeVersionId)
    const draft: EmployeeVersion = { ...active, id: randomUUID(), createdAt: new Date().toISOString(), version: Math.max(...this.versions(employeeId).map((version) => version.version)) + 1, state: 'draft', testRunIds: [], publishedAt: undefined }
    this.kernel.save({ entityType: 'EmployeeVersion', entity: draft, immutable: false }, 'employee_version.draft_created', { employeeId, version: draft.version, sourceVersionId: active.id })
    this.saveEmployee({ ...employee, draftVersionId: draft.id }, 'employee.draft_attached', { draftVersionId: draft.id })
    return this.detail(employeeId)
  }

  saveDraft(employeeId: string, input: EmployeeDraftInput): EmployeeDetail {
    this.validateDraft(input)
    let employee = this.requireEmployee(employeeId)
    if (!employee.draftVersionId) {
      this.beginEdit(employeeId)
      employee = this.requireEmployee(employeeId)
    }
    const current = this.requireVersion(employee.draftVersionId!)
    if (!['draft', 'tested'].includes(current.state)) throw new Error('version_not_editable')
    const updated: EmployeeVersion = { ...current, ...input, state: 'draft', testRunIds: [] }
    this.kernel.save({ entityType: 'EmployeeVersion', entity: updated, immutable: false }, 'employee_version.draft_saved', { employeeId, version: updated.version, testsInvalidated: current.testRunIds.length > 0 })
    this.saveEmployee({ ...employee, name: input.name }, 'employee.updated', { draftVersionId: updated.id })
    return this.detail(employeeId)
  }

  addTestCase(employeeId: string, input: { name: string; prompt: string; acceptanceCriteria: string; expectedContains?: string }): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    if (!employee.draftVersionId) throw new Error('draft_version_not_found')
    for (const value of [input.name, input.prompt, input.acceptanceCriteria]) if (typeof value !== 'string' || !value.trim()) throw new Error('invalid_test_case')
    if (input.prompt.length > 20_000 || input.acceptanceCriteria.length > 2_000 || (input.expectedContains?.length ?? 0) > 500) throw new Error('invalid_test_case')
    const testCase: TestCase = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), employeeId, employeeVersionId: employee.draftVersionId, name: input.name.trim(), prompt: input.prompt, acceptanceCriteria: input.acceptanceCriteria, expectedContains: input.expectedContains?.trim() || undefined }
    this.kernel.save({ entityType: 'TestCase', entity: testCase, immutable: false }, 'employee_test_case.created', { employeeId, employeeVersionId: employee.draftVersionId })
    return this.detail(employeeId)
  }

  startTest(employeeId: string, testCaseId: string, providerRequestId: string): TestStartResult {
    const employee = this.requireEmployee(employeeId)
    if (!employee.draftVersionId) throw new Error('draft_version_not_found')
    const version = this.requireVersion(employee.draftVersionId)
    this.assertDependenciesAvailable(version)
    const testCase = this.kernel.store.get<TestCase>('TestCase', testCaseId)
    if (!testCase || testCase.employeeVersionId !== version.id) throw new Error('test_case_not_found')
    const run: SandboxTestRun = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), employeeId, employeeVersionId: version.id, testCaseId, providerRequestId, status: 'running', output: '', userConfirmed: false }
    this.kernel.save({ entityType: 'SandboxTestRun', entity: run, immutable: false }, 'employee_test.started', { employeeId, employeeVersionId: version.id, testCaseId })
    this.kernel.save({ entityType: 'EmployeeVersion', entity: { ...version, state: 'draft', testRunIds: [...version.testRunIds, run.id] }, immutable: false }, 'employee_version.test_attached', { testRunId: run.id })
    return {
      run,
      request: { requestId: providerRequestId, provider: version.modelId === 'deepseek-v4-pro' ? 'deepseek' : 'poe', modelId: version.modelId as AllowedModelId, input: `${version.systemPrompt}\n\n[Sandbox Test]\n${testCase.prompt}`, maxOutputTokens: 512, stream: true }
    }
  }

  handleProviderEvent(providerRequestId: string, event: ProviderEvent): SandboxTestRun | undefined {
    const run = this.findRunByProviderRequest(providerRequestId)
    if (!run) return undefined
    if (event.type === 'output_delta') run.output += event.delta
    if (event.type === 'structured_result') run.output += JSON.stringify(event.value)
    if (event.type === 'usage') run.usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens, source: event.source }
    if (event.type === 'completed') {
      const testCase = this.kernel.store.get<TestCase>('TestCase', run.testCaseId)
      run.status = 'completed'
      run.completedAt = new Date().toISOString()
      run.automaticPassed = Boolean(run.output.trim()) && (!testCase?.expectedContains || run.output.includes(testCase.expectedContains))
    }
    this.kernel.save({ entityType: 'SandboxTestRun', entity: run, immutable: false }, event.type === 'completed' ? 'employee_test.completed' : 'employee_test.progressed', { eventType: event.type, employeeVersionId: run.employeeVersionId })
    return run
  }

  handleProviderFailure(providerRequestId: string, code: string): SandboxTestRun | undefined {
    const run = this.findRunByProviderRequest(providerRequestId)
    if (!run) return undefined
    const failed: SandboxTestRun = { ...run, status: 'failed', failureCode: code, automaticPassed: false, completedAt: new Date().toISOString() }
    this.kernel.save({ entityType: 'SandboxTestRun', entity: failed, immutable: false }, 'employee_test.failed', { code, employeeVersionId: run.employeeVersionId })
    return failed
  }

  confirmTest(employeeId: string, testRunId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    if (!employee.draftVersionId) throw new Error('draft_version_not_found')
    const version = this.requireVersion(employee.draftVersionId)
    const run = this.kernel.store.get<SandboxTestRun>('SandboxTestRun', testRunId)
    if (!run || run.employeeVersionId !== version.id || !version.testRunIds.includes(run.id) || run.status !== 'completed' || !run.automaticPassed) throw new Error('test_not_confirmable')
    this.kernel.save({ entityType: 'SandboxTestRun', entity: { ...run, userConfirmed: true }, immutable: false }, 'employee_test.confirmed', { employeeId, employeeVersionId: version.id })
    this.kernel.save({ entityType: 'EmployeeVersion', entity: { ...version, state: 'tested' }, immutable: false }, 'employee_version.tested', { testRunId })
    return this.detail(employeeId)
  }

  publish(employeeId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    if (!employee.draftVersionId) throw new Error('draft_version_not_found')
    const version = this.requireVersion(employee.draftVersionId)
    this.assertDependenciesAvailable(version)
    const confirmed = this.kernel.store.list<SandboxTestRun>('SandboxTestRun').some((run) => version.testRunIds.includes(run.id) && run.userConfirmed && run.automaticPassed)
    if (version.state !== 'tested' || !confirmed) throw new Error('employee_version_not_tested')
    const published: EmployeeVersion = { ...version, state: 'active', publishedAt: new Date().toISOString() }
    this.kernel.save({ entityType: 'EmployeeVersion', entity: published, immutable: true }, 'employee_version.published', { employeeId, version: version.version })
    this.saveEmployee({ ...employee, activeVersionId: version.id, draftVersionId: undefined, disabled: false }, 'employee.published', { activeVersionId: version.id })
    return this.detail(employeeId)
  }

  rollback(employeeId: string, versionId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    const version = this.requireVersion(versionId)
    if (version.employeeId !== employeeId || !version.publishedAt) throw new Error('version_not_published')
    this.assertDependenciesAvailable(version)
    const confirmed = this.kernel.store.list<SandboxTestRun>('SandboxTestRun').some((run) => version.testRunIds.includes(run.id) && run.userConfirmed && run.automaticPassed)
    if (!confirmed) throw new Error('version_not_tested')
    this.saveEmployee({ ...employee, activeVersionId: version.id, disabled: false, archived: false }, 'employee.rolled_back', { activeVersionId: version.id })
    return this.detail(employeeId)
  }

  setDisabled(employeeId: string, disabled: boolean): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    if (employee.archived && !disabled) throw new Error('employee_archived')
    this.saveEmployee({ ...employee, disabled }, disabled ? 'employee.disabled' : 'employee.enabled', {})
    return this.detail(employeeId)
  }

  archive(employeeId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    this.saveEmployee({ ...employee, archived: true, disabled: true }, 'employee.archived', {})
    return this.detail(employeeId)
  }

  restore(employeeId: string): EmployeeDetail {
    const employee = this.requireEmployee(employeeId)
    this.saveEmployee({ ...employee, archived: false, disabled: true }, 'employee.restored', { retestRequired: true })
    if (!employee.draftVersionId && employee.activeVersionId) this.beginEdit(employeeId)
    return this.detail(employeeId)
  }

  deleteDraftEmployee(employeeId: string): void {
    const detail = this.detail(employeeId)
    if (detail.employee.activeVersionId || detail.formalReferences.length > 0) throw new Error('employee_has_history')
    for (const run of detail.testRuns) this.kernel.deleteMutable('SandboxTestRun', run.id, 'employee_test.deleted', { employeeId })
    for (const testCase of detail.testCases) this.kernel.deleteMutable('TestCase', testCase.id, 'employee_test_case.deleted', { employeeId })
    for (const version of detail.versions) this.kernel.deleteMutable('EmployeeVersion', version.id, 'employee_version.deleted', { employeeId })
    this.kernel.deleteMutable('Employee', employeeId, 'employee.deleted', {})
  }

  assertVersionUsable(versionId: string): EmployeeVersion {
    const version = this.requireVersion(versionId)
    const employee = this.requireEmployee(version.employeeId)
    if (employee.archived || employee.disabled || employee.activeVersionId !== versionId) throw new Error('employee_version_not_available')
    this.assertDependenciesAvailable(version)
    return version
  }

  private status(employee: Employee): EmployeeUiStatus {
    if (employee.archived) return 'archived'
    if (employee.disabled) return 'disabled'
    if (employee.activeVersionId && employee.draftVersionId) return 'pending_changes'
    if (employee.activeVersionId) return 'active'
    if (!employee.draftVersionId) return 'draft'
    const draft = this.kernel.store.get<EmployeeVersion>('EmployeeVersion', employee.draftVersionId)
    const hasTestCase = this.kernel.store.list<TestCase>('TestCase').some((testCase) => testCase.employeeVersionId === employee.draftVersionId)
    return draft?.state === 'tested' ? 'pending_test' : hasTestCase ? 'pending_test' : 'draft'
  }

  private validateDraft(input: EmployeeDraftInput): void {
    if (!input || typeof input !== 'object') throw new Error('invalid_employee_draft')
    if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 80) throw new Error('invalid_employee_name')
    if (input.role !== undefined && (typeof input.role !== 'string' || input.role.length > 120)) throw new Error('invalid_employee_role')
    if (typeof input.description !== 'string' || input.description.length > 2_000) throw new Error('invalid_employee_description')
    if (input.avatarDataUrl !== undefined && (typeof input.avatarDataUrl !== 'string' || input.avatarDataUrl.length > 3_000_000 || !/^data:image\/(png|jpeg|webp);base64,/.test(input.avatarDataUrl))) throw new Error('invalid_employee_avatar')
    if (typeof input.systemPrompt !== 'string' || input.systemPrompt.trim().length < 1 || input.systemPrompt.length > 50_000) throw new Error('invalid_system_prompt')
    if (!['deepseek-v4-pro', 'claude-sonnet-4.6'].includes(input.modelId)) throw new Error('model_not_allowed')
    if (!Array.isArray(input.capabilityVersionIds) || new Set(input.capabilityVersionIds).size !== input.capabilityVersionIds.length) throw new Error('invalid_capabilities')
    for (const capabilityId of input.capabilityVersionIds) if (!this.kernel.store.get<AgentCapabilityVersion>('AgentCapabilityVersion', capabilityId)) throw new Error('capability_not_found')
    if (!Array.isArray(input.memoryScopes) || input.memoryScopes.some((scope) => !['global', 'employee', 'task'].includes(scope))) throw new Error('invalid_memory_scopes')
  }

  private assertDependenciesAvailable(version: EmployeeVersion): void {
    for (const capabilityId of version.capabilityVersionIds) {
      const stored = this.kernel.store.get<AgentCapabilityVersion>('AgentCapabilityVersion', capabilityId)
      const capability = stored && this.resolveCapability(stored)
      if (!capability || capability.dependencies.some((dependency) => !dependency.available)) throw new Error('capability_dependency_unavailable')
      if (capability.requiredModelIds.length > 0 && !capability.requiredModelIds.includes(version.modelId)) throw new Error('capability_model_incompatible')
    }
  }

  private resolveCapability(capability: AgentCapabilityVersion): AgentCapabilityVersion {
    return {
      ...capability,
      dependencies: capability.dependencies.map((dependency) => {
        if (dependency.kind === 'Model') return { ...dependency, available: ['deepseek-v4-pro', 'claude-sonnet-4.6'].includes(dependency.versionId), reason: undefined }
        if (dependency.kind === 'Tool') {
          const resource = this.kernel.store.get<ToolVersion>('ToolVersion', dependency.versionId)
          const check = this.kernel.store.list<SourceHealthCheck>('SourceHealthCheck').filter((value) => value.adapterVersionId === dependency.versionId).sort((left, right) => Date.parse(right.checkedAt) - Date.parse(left.checkedAt))[0]
          const available = Boolean(resource?.available && resource.health !== 'unavailable' && (!check || check.status === 'available'))
          return { ...dependency, available, reason: check && check.status !== 'available' ? check.failureCode ?? '数据源健康检查未通过' : resource?.reason ?? (resource ? undefined : 'Tool 未安装') }
        }
        if (dependency.kind === 'MCP') { const resource = this.kernel.store.get<MCPVersion>('MCPVersion', dependency.versionId); return { ...dependency, available: Boolean(resource?.available && resource.health !== 'unavailable' && resource.credentialStatus !== 'missing'), reason: resource?.reason ?? (resource ? undefined : 'MCP 未安装') } }
        const resource = this.kernel.store.get<SkillVersion>('SkillVersion', dependency.versionId)
        return { ...dependency, available: Boolean(resource?.available), reason: resource?.reason ?? (resource ? undefined : 'Skill 未安装') }
      })
    }
  }

  private requireEmployee(employeeId: string): Employee {
    const employee = this.kernel.store.get<Employee>('Employee', employeeId)
    if (!employee) throw new Error('employee_not_found')
    return employee
  }

  private requireVersion(versionId: string): EmployeeVersion {
    const version = this.kernel.store.get<EmployeeVersion>('EmployeeVersion', versionId)
    if (!version) throw new Error('employee_version_not_found')
    return version
  }

  private versions(employeeId: string): EmployeeVersion[] {
    return this.kernel.store.list<EmployeeVersion>('EmployeeVersion').filter((version) => version.employeeId === employeeId).sort((left, right) => right.version - left.version)
  }

  private saveEmployee(employee: Employee, eventType: string, payload: unknown): void {
    this.kernel.save({ entityType: 'Employee', entity: employee, immutable: false }, eventType, payload)
  }

  private findRunByProviderRequest(providerRequestId: string): SandboxTestRun | undefined {
    return this.kernel.store.list<SandboxTestRun>('SandboxTestRun').find((run) => run.providerRequestId === providerRequestId && run.status === 'running')
  }
}
