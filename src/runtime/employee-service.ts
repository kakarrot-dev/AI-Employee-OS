import { createHash, randomUUID } from 'node:crypto'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'
import type { AllowedModelId } from '../provider/models'
import { normalizeEmployeeDraft, validateEmployeeDraft, type EmployeeDetail, type EmployeeDraftInput, type EmployeeSummary, type EmployeeUiStatus } from '../shared/employee-contract'
import type { AgentCapabilityVersion, Assignment, Employee, EmployeeVersion, MCPVersion, SandboxTestRun, SkillVersion, SourceHealthCheck, TestCase, ToolVersion } from './domain'
import { RuntimeKernel } from './kernel'
import { DOCUMENT_EMPLOYEE_PROMPT, LEGACY_DOCUMENT_EMPLOYEE_PROMPT, LEGACY_NETWORK_EMPLOYEE_PROMPT, NETWORK_EMPLOYEE_PROMPT } from './builtin-contracts'

export interface TestStartResult {
  request: ProviderRequest
  run: SandboxTestRun
}

export type TestProviderProgress = SandboxTestRun & { nextRequest?: ProviderRequest }

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
    id: 'capability.managed-research.v2',
    createdAt: '2026-08-31T00:00:00.000Z',
    name: '受管网络调研',
    description: '通过受管 GitHub 与 RSS 数据源生成带来源的调研结果。',
    version: 2,
    skillVersionIds: ['skill.managed-research.v2'],
    toolVersionIds: ['github.repositories.search@research-source/v1', 'rss.read@research-source/v1'],
    mcpVersionIds: [],
    requiredModelIds: ['deepseek-v4-pro', 'claude-sonnet-4.6'],
    permissionRequirements: ['network.research'],
    dependencies: [
      { kind: 'Skill', versionId: 'skill.managed-research.v2', available: true },
      { kind: 'Tool', versionId: 'github.repositories.search@research-source/v1', available: true },
      { kind: 'Tool', versionId: 'rss.read@research-source/v1', available: true },
      { kind: 'MCP', versionId: 'mcp.managed-research-runner.v1', available: true }
    ]
  },
  {
    schemaVersion: 1,
    id: 'capability.network-intelligence.v2',
    createdAt: '2026-09-02T00:00:00.000Z',
    name: '网络情报采集',
    description: '使用 Agent-Reach、Last 30 Days 与 OpenCLI 搜集近期公开网络情报并保留来源与失败通道。',
    version: 2,
    skillVersionIds: ['skill.agent-reach.v2', 'skill.last30days.v2', 'skill.opencli.v2'],
    toolVersionIds: ['agent-reach.search@network-intelligence/v1', 'last30days.research@network-intelligence/v1', 'opencli.social-search@network-intelligence/v1'],
    mcpVersionIds: ['mcp.external-intelligence-runner.v1'],
    requiredModelIds: ['deepseek-v4-pro', 'claude-sonnet-4.6'],
    permissionRequirements: ['network.research'],
    dependencies: [
      { kind: 'Skill', versionId: 'skill.agent-reach.v2', available: true },
      { kind: 'Skill', versionId: 'skill.last30days.v2', available: true },
      { kind: 'Skill', versionId: 'skill.opencli.v2', available: true },
      { kind: 'Tool', versionId: 'agent-reach.search@network-intelligence/v1', available: true },
      { kind: 'Tool', versionId: 'last30days.research@network-intelligence/v1', available: true },
      { kind: 'Tool', versionId: 'opencli.social-search@network-intelligence/v1', available: true },
      { kind: 'MCP', versionId: 'mcp.external-intelligence-runner.v1', available: true }
    ]
  },
  {
    schemaVersion: 1,
    id: 'capability.local-document.v2',
    createdAt: '2026-09-02T00:00:00.000Z',
    name: '本机文档编写',
    description: '在任务明确授权的本机目录内查看、独占创建和精确编辑 UTF-8 文档。',
    version: 2,
    skillVersionIds: ['skill.local-document-operations.v2'],
    toolVersionIds: ['document.read@local-document/v1', 'document.create@local-document/v1', 'document.edit@local-document/v1'],
    mcpVersionIds: ['mcp.local-document-runner.v1'],
    requiredModelIds: ['deepseek-v4-pro', 'claude-sonnet-4.6'],
    permissionRequirements: ['filesystem.read', 'filesystem.write'],
    dependencies: [
      { kind: 'Skill', versionId: 'skill.local-document-operations.v2', available: true },
      { kind: 'Tool', versionId: 'document.read@local-document/v1', available: true },
      { kind: 'Tool', versionId: 'document.create@local-document/v1', available: true },
      { kind: 'Tool', versionId: 'document.edit@local-document/v1', available: true },
      { kind: 'MCP', versionId: 'mcp.local-document-runner.v1', available: true }
    ]
  }
]

const SPECIALIST_EMPLOYEES: Array<{ employee: Employee; version: EmployeeVersion }> = [
  {
    employee: { schemaVersion: 1, id: 'employee.network-intelligence', createdAt: '2026-09-02T00:00:00.000Z', name: '网络情报员', activeVersionId: 'employee-version.network-intelligence.v2', disabled: false, archived: false },
    version: {
      schemaVersion: 1, id: 'employee-version.network-intelligence.v2', createdAt: '2026-09-02T00:00:00.000Z', employeeId: 'employee.network-intelligence', version: 2, state: 'active', name: '网络情报员', role: '公开网络情报搜集、交叉核验与证据交接',
      description: '设计跨来源查询，区分事实、推断、冲突与未知，形成可供下游复核的 ResearchHandoff；不读取或修改本机文档。',
      systemPrompt: NETWORK_EMPLOYEE_PROMPT,
      modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.network-intelligence.v2'], memoryScopes: ['employee', 'task'], testRunIds: [], publishedAt: '2026-09-02T00:00:00.000Z'
    }
  },
  {
    employee: { schemaVersion: 1, id: 'employee.document-writer', createdAt: '2026-09-02T00:00:00.000Z', name: '文档编写员', activeVersionId: 'employee-version.document-writer.v2', disabled: false, archived: false },
    version: {
      schemaVersion: 1, id: 'employee-version.document-writer.v2', createdAt: '2026-09-02T00:00:00.000Z', employeeId: 'employee.document-writer', version: 2, state: 'active', name: '文档编写员', role: '证据驱动的本机文档编写与精确编辑',
      description: '将用户要求和已核验 Handoff 转化为结构清晰、证据可追溯、文件可回读的交付物；不访问网络。',
      systemPrompt: DOCUMENT_EMPLOYEE_PROMPT,
      modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.local-document.v2'], memoryScopes: ['employee', 'task'], testRunIds: [], publishedAt: '2026-09-02T00:00:00.000Z'
    }
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

  seedRequestedSpecialists(): void {
    for (const { employee, version } of SPECIALIST_EMPLOYEES) {
      if (!this.kernel.store.get<EmployeeVersion>('EmployeeVersion', version.id)) this.kernel.save({ entityType: 'EmployeeVersion', entity: version, immutable: true }, 'employee_version.profile_installed', { employeeId: employee.id, capabilityVersionIds: version.capabilityVersionIds })
      const current = this.kernel.store.get<Employee>('Employee', employee.id)
      if (!current) this.kernel.save({ entityType: 'Employee', entity: employee, immutable: false }, 'employee.profile_installed', { activeVersionId: version.id })
      else {
        const currentIdentityVersionId = current.draftVersionId ?? current.activeVersionId
        const currentIdentityVersion = currentIdentityVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', currentIdentityVersionId) : undefined
        const identity = current.avatarDataUrl === undefined && currentIdentityVersion?.avatarDataUrl ? { ...current, avatarDataUrl: currentIdentityVersion.avatarDataUrl } : current
        if (current.draftVersionId) this.upgradeUntouchedBuiltInDraft(current.draftVersionId, version)
        if (!current.activeVersionId || current.activeVersionId === version.id.replace('.v2', '.v1')) this.kernel.save({ entityType: 'Employee', entity: { ...identity, activeVersionId: version.id }, immutable: false }, 'employee.profile_upgraded', { previousVersionId: current.activeVersionId, activeVersionId: version.id, draftPreserved: Boolean(current.draftVersionId), identityPreserved: Boolean(identity.avatarDataUrl) })
        else if (identity !== current) this.kernel.save({ entityType: 'Employee', entity: identity, immutable: false }, 'employee.identity_migrated', { sourceVersionId: currentIdentityVersionId })
      }
    }
  }

  private upgradeUntouchedBuiltInDraft(draftVersionId: string, builtInVersion: EmployeeVersion): void {
    const draft = this.kernel.store.get<EmployeeVersion>('EmployeeVersion', draftVersionId)
    if (!draft || draft.state !== 'draft' || draft.employeeId !== builtInVersion.employeeId) return
    const legacyPrompt = builtInVersion.employeeId === 'employee.network-intelligence' ? LEGACY_NETWORK_EMPLOYEE_PROMPT : builtInVersion.employeeId === 'employee.document-writer' ? LEGACY_DOCUMENT_EMPLOYEE_PROMPT : undefined
    if (!legacyPrompt || draft.systemPrompt !== legacyPrompt) return
    const upgraded: EmployeeVersion = {
      ...draft,
      version: Math.max(draft.version, builtInVersion.version + 1),
      role: builtInVersion.role,
      description: builtInVersion.description,
      systemPrompt: builtInVersion.systemPrompt,
      capabilityVersionIds: [...builtInVersion.capabilityVersionIds],
      state: 'draft',
      testRunIds: []
    }
    this.kernel.save({ entityType: 'EmployeeVersion', entity: upgraded, immutable: false }, 'employee_version.legacy_draft_upgraded', { employeeId: draft.employeeId, previousVersion: draft.version, version: upgraded.version, testsInvalidated: draft.testRunIds.length > 0 })
  }

  capabilities(): AgentCapabilityVersion[] {
    const latest = new Map<string, AgentCapabilityVersion>()
    for (const capability of this.kernel.store.list<AgentCapabilityVersion>('AgentCapabilityVersion')) {
      const current = latest.get(capability.name)
      if (!current || capability.version > current.version) latest.set(capability.name, capability)
    }
    return [...latest.values()].map((capability) => this.resolveCapability(capability))
  }

  list(): EmployeeSummary[] {
    return this.kernel.store.list<Employee>('Employee').map((employee) => {
      const currentVersionId = employee.draftVersionId ?? employee.activeVersionId
      const currentVersion = currentVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', currentVersionId) : undefined
      const activeVersion = employee.activeVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', employee.activeVersionId) : undefined
      return {
        id: employee.id,
        name: employee.name,
        role: currentVersion?.role,
        avatarDataUrl: employee.avatarDataUrl ?? currentVersion?.avatarDataUrl,
        status: this.status(employee),
        activeVersionId: employee.activeVersionId,
        draftVersionId: employee.draftVersionId,
        capabilityVersionIds: currentVersion?.capabilityVersionIds ?? [],
        activeCapabilityVersionIds: activeVersion?.capabilityVersionIds ?? []
      }
    })
  }

  identity(employeeId: string): { id: string; name: string; avatarDataUrl?: string } {
    const employee = this.requireEmployee(employeeId)
    const currentVersionId = employee.draftVersionId ?? employee.activeVersionId
    const currentVersion = currentVersionId ? this.kernel.store.get<EmployeeVersion>('EmployeeVersion', currentVersionId) : undefined
    return { id: employee.id, name: employee.name, avatarDataUrl: employee.avatarDataUrl ?? currentVersion?.avatarDataUrl }
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
    input = this.validateDraft(input)
    const now = new Date().toISOString()
    const employeeId = randomUUID()
    const versionId = randomUUID()
    const version: EmployeeVersion = { schemaVersion: 1, id: versionId, createdAt: now, employeeId, version: 1, state: 'draft', ...input, testRunIds: [] }
    const employee: Employee = { schemaVersion: 1, id: employeeId, createdAt: now, name: input.name, avatarDataUrl: input.avatarDataUrl, draftVersionId: versionId, disabled: false, archived: false }
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
    input = this.validateDraft(input)
    let employee = this.requireEmployee(employeeId)
    if (!employee.draftVersionId) {
      this.beginEdit(employeeId)
      employee = this.requireEmployee(employeeId)
    }
    const current = this.requireVersion(employee.draftVersionId!)
    if (!['draft', 'tested'].includes(current.state)) throw new Error('version_not_editable')
    const updated: EmployeeVersion = { ...current, ...input, state: 'draft', testRunIds: [] }
    this.kernel.save({ entityType: 'EmployeeVersion', entity: updated, immutable: false }, 'employee_version.draft_saved', { employeeId, version: updated.version, testsInvalidated: current.testRunIds.length > 0 })
    this.saveEmployee({ ...employee, name: input.name, avatarDataUrl: input.avatarDataUrl }, 'employee.updated', { draftVersionId: updated.id, identityUpdated: true })
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
      request: { requestId: providerRequestId, provider: version.modelId === 'deepseek-v4-pro' ? 'deepseek' : 'poe', modelId: version.modelId as AllowedModelId, input: `${version.systemPrompt}\n\n${this.testSkillContext(version)}\n[Sandbox Test]\n测试输入：${testCase.prompt}\n验收标准：${testCase.acceptanceCriteria}\nSandbox 不执行真实 Tool 或副作用。若完成任务需要 Tool，应说明会提交的精确动作、所需证据和失败边界，不得伪造已经执行的结果。直接给出可供评审的测试输出，不要写过程独白。`, maxOutputTokens: 1_024, stream: true, toolChoice: 'none' }
    }
  }

  handleProviderEvent(providerRequestId: string, event: ProviderEvent): TestProviderProgress | undefined {
    const run = this.findRunByProviderRequest(providerRequestId)
    if (!run) return undefined
    const evaluating = run.evaluationProviderRequestId === providerRequestId
    if (evaluating && event.type === 'output_delta') run.evaluationText = (run.evaluationText ?? '') + event.delta
    else if (event.type === 'output_delta') run.output += event.delta
    if (evaluating && event.type === 'structured_result') run.evaluation = this.normalizeTestEvaluation(event.value)
    else if (event.type === 'structured_result') run.output += JSON.stringify(event.value)
    if (event.type === 'usage') run.usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens, source: event.source }
    if (event.type === 'completed') {
      const testCase = this.kernel.store.get<TestCase>('TestCase', run.testCaseId)
      if (!testCase) throw new Error('test_case_not_found')
      if (!evaluating) {
        if (!run.output.trim()) {
          const failed: SandboxTestRun = { ...run, status: 'failed', automaticPassed: false, failureCode: 'empty_test_output', completedAt: new Date().toISOString() }
          this.kernel.save({ entityType: 'SandboxTestRun', entity: failed, immutable: false }, 'employee_test.failed', { code: failed.failureCode, employeeVersionId: run.employeeVersionId })
          return failed
        }
        const evaluationProviderRequestId = randomUUID()
        const evaluatingRun: SandboxTestRun = { ...run, status: 'evaluating', evaluationProviderRequestId, evaluationText: '' }
        this.kernel.save({ entityType: 'SandboxTestRun', entity: evaluatingRun, immutable: false }, 'employee_test.evaluation_started', { employeeVersionId: run.employeeVersionId, testCaseId: run.testCaseId })
        return { ...evaluatingRun, nextRequest: this.testEvaluationRequest(evaluatingRun, testCase, evaluationProviderRequestId) }
      }
      const evaluation = run.evaluation ?? this.normalizeTestEvaluation(this.parseJson(run.evaluationText ?? ''))
      run.evaluation = evaluation
      run.status = 'completed'
      run.completedAt = new Date().toISOString()
      run.automaticPassed = Boolean(evaluation?.passed && evaluation.criteria.every((criterion) => criterion.passed) && (!testCase.expectedContains || run.output.includes(testCase.expectedContains)))
      if (!evaluation) run.failureCode = 'invalid_test_evaluation'
    }
    this.kernel.save({ entityType: 'SandboxTestRun', entity: run, immutable: false }, event.type === 'completed' ? 'employee_test.completed' : 'employee_test.progressed', { eventType: event.type, phase: evaluating ? 'evaluation' : 'candidate', employeeVersionId: run.employeeVersionId })
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
    if (employee.activeVersionId) return 'active'
    if (!employee.draftVersionId) return 'draft'
    const draft = this.kernel.store.get<EmployeeVersion>('EmployeeVersion', employee.draftVersionId)
    const hasTestCase = this.kernel.store.list<TestCase>('TestCase').some((testCase) => testCase.employeeVersionId === employee.draftVersionId)
    return draft?.state === 'tested' ? 'pending_test' : hasTestCase ? 'pending_test' : 'draft'
  }

  private validateDraft(input: EmployeeDraftInput): EmployeeDraftInput {
    const issue = validateEmployeeDraft(input)[0]
    if (issue) throw new Error(issue.code)
    const normalized = normalizeEmployeeDraft(input)
    if (!Array.isArray(normalized.capabilityVersionIds)) throw new Error('invalid_capabilities')
    for (const capabilityId of normalized.capabilityVersionIds) if (!this.kernel.store.get<AgentCapabilityVersion>('AgentCapabilityVersion', capabilityId)) throw new Error('capability_not_found')
    return normalized
  }

  private assertDependenciesAvailable(version: EmployeeVersion): void {
    for (const capabilityId of version.capabilityVersionIds) {
      const stored = this.kernel.store.get<AgentCapabilityVersion>('AgentCapabilityVersion', capabilityId)
      const capability = stored && this.resolveCapability(stored)
      if (!capability || capability.dependencies.some((dependency) => !dependency.available)) throw new Error('capability_dependency_unavailable')
      if (capability.requiredModelIds.length > 0 && !capability.requiredModelIds.includes(version.modelId)) throw new Error('capability_model_incompatible')
    }
  }

  private testSkillContext(version: EmployeeVersion): string {
    const skillIds = [...new Set(version.capabilityVersionIds.flatMap((id) => this.kernel.store.get<AgentCapabilityVersion>('AgentCapabilityVersion', id)?.skillVersionIds ?? []))]
    if (!skillIds.length) return '[测试 Skill]\n当前员工没有绑定 Skill。'
    const skills = skillIds.map((id) => {
      const skill = this.kernel.store.get<SkillVersion>('SkillVersion', id)
      if (!skill?.available) throw new Error('skill_not_executable')
      return skill
    })
    return `[测试 Skill]\n${skills.map((skill) => {
      const instructions = skill.instructionsMarkdown || `# ${skill.name}\n\n${skill.description}\n\n${skill.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
      const digest = skill.instructionDigest || createHash('sha256').update(instructions).digest('hex')
      return `--- ${skill.name} v${skill.version} · SHA-256 ${digest} ---\n${instructions}`
    }).join('\n')}`
  }

  private testEvaluationRequest(run: SandboxTestRun, testCase: TestCase, requestId: string): ProviderRequest {
    const version = this.requireVersion(run.employeeVersionId)
    const criteriaIds = ['task_acceptance', 'role_scope', 'truth_and_evidence', 'output_actionability'] as const
    return {
      requestId,
      provider: version.modelId === 'deepseek-v4-pro' ? 'deepseek' : 'poe',
      modelId: version.modelId as AllowedModelId,
      input: `你是独立的员工发布评测器，只评估候选输出，不续写任务。必须严格返回 JSON Schema。\n\n员工职责：${version.role ?? version.description}\n员工 System Prompt：${version.systemPrompt}\n${this.testSkillContext(version)}\n\n测试输入：${testCase.prompt}\n验收标准：${testCase.acceptanceCriteria}\n候选输出：${run.output}\n\n逐项判断：task_acceptance=是否实际满足测试目标；role_scope=是否遵守员工、Skill 和权限边界；truth_and_evidence=是否区分事实、推断、未知且未伪造 Tool/来源/文件完成；output_actionability=是否清晰、具体、可供用户或下游继续使用。任一项失败则 passed=false。不要因为语言流畅而放宽证据要求。`,
      maxOutputTokens: 1_024,
      stream: false,
      toolChoice: 'none',
      outputSchema: {
        name: 'employee_test_evaluation',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            passed: { type: 'boolean' },
            summary: { type: 'string', minLength: 1, maxLength: 1_000 },
            criteria: {
              type: 'array',
              minItems: criteriaIds.length,
              maxItems: criteriaIds.length,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', enum: criteriaIds },
                  passed: { type: 'boolean' },
                  reason: { type: 'string', minLength: 1, maxLength: 500 }
                },
                required: ['id', 'passed', 'reason']
              }
            }
          },
          required: ['passed', 'summary', 'criteria']
        }
      }
    }
  }

  private normalizeTestEvaluation(value: unknown): SandboxTestRun['evaluation'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const candidate = value as NonNullable<SandboxTestRun['evaluation']>
    const expected = new Set(['task_acceptance', 'role_scope', 'truth_and_evidence', 'output_actionability'])
    if (typeof candidate.passed !== 'boolean' || typeof candidate.summary !== 'string' || !candidate.summary.trim() || !Array.isArray(candidate.criteria) || candidate.criteria.length !== expected.size) return undefined
    const found = new Set<string>()
    for (const criterion of candidate.criteria) {
      if (!criterion || typeof criterion !== 'object' || !expected.has(criterion.id) || found.has(criterion.id) || typeof criterion.passed !== 'boolean' || typeof criterion.reason !== 'string' || !criterion.reason.trim()) return undefined
      found.add(criterion.id)
    }
    return { passed: candidate.passed && candidate.criteria.every((criterion) => criterion.passed), summary: candidate.summary.trim(), criteria: candidate.criteria.map((criterion) => ({ ...criterion, reason: criterion.reason.trim() })) }
  }

  private parseJson(value: string): unknown { try { return JSON.parse(value) } catch { return undefined } }

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
    return this.kernel.store.list<SandboxTestRun>('SandboxTestRun').find((run) => (run.providerRequestId === providerRequestId && run.status === 'running') || (run.evaluationProviderRequestId === providerRequestId && run.status === 'evaluating'))
  }
}
