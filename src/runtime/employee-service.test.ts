import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { ResourceService } from './resource-service'
import { LEGACY_NETWORK_EMPLOYEE_PROMPT, NETWORK_EMPLOYEE_PROMPT } from './builtin-contracts'

const directories: string[] = []

function setup(): { service: EmployeeService; kernel: RuntimeKernel; store: RuntimeStore } {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-employees-'))
  directories.push(directory)
  const store = new RuntimeStore(join(directory, 'control.sqlite3'))
  const kernel = new RuntimeKernel(store)
  new ResourceService(kernel).seed()
  const service = new EmployeeService(kernel)
  service.seedCapabilities()
  return { service, kernel, store }
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

const draft = {
  name: '验收员工',
  role: '文本验收',
  description: '只负责文本结果的结构与验收检查。',
  systemPrompt: '你是一个严格遵循验收标准的员工。',
  modelId: 'deepseek-v4-pro' as const,
  capabilityVersionIds: ['capability.text-analysis.v1'],
  memoryScopes: ['employee'] as const
}

const passingEvaluation = {
  passed: true,
  summary: '候选输出满足发布门禁。',
  criteria: [
    { id: 'task_acceptance', passed: true, reason: '满足测试目标。' },
    { id: 'role_scope', passed: true, reason: '未越过员工与权限边界。' },
    { id: 'truth_and_evidence', passed: true, reason: '未伪造 Tool、来源或文件结果。' },
    { id: 'output_actionability', passed: true, reason: '输出可以继续使用。' }
  ]
}

function completePassingEvaluation(service: EmployeeService, candidateRequestId: string) {
  const evaluating = service.handleProviderEvent(candidateRequestId, { type: 'completed', requestId: candidateRequestId })!
  expect(evaluating.status).toBe('evaluating')
  expect(evaluating.automaticPassed).toBeUndefined()
  expect(evaluating.nextRequest?.outputSchema?.name).toBe('employee_test_evaluation')
  const evaluationRequestId = evaluating.nextRequest!.requestId
  service.handleProviderEvent(evaluationRequestId, { type: 'structured_result', requestId: evaluationRequestId, value: passingEvaluation })
  return service.handleProviderEvent(evaluationRequestId, { type: 'completed', requestId: evaluationRequestId })!
}

describe('EmployeeService', () => {
  it('installs the requested specialist employees once with disjoint capabilities', () => {
    const { service, store } = setup()
    service.seedRequestedSpecialists(); service.seedRequestedSpecialists()
    const installed = service.list().filter((employee) => employee.id.startsWith('employee.'))
    expect(installed).toHaveLength(4)
    expect(installed.find((employee) => employee.id === 'employee.network-intelligence')).toMatchObject({ name: '网络情报员', status: 'active', capabilityVersionIds: ['capability.network-intelligence.v2'], activeCapabilityVersionIds: ['capability.network-intelligence.v2'] })
    expect(installed.find((employee) => employee.id === 'employee.document-writer')).toMatchObject({ name: '文档编写员', status: 'active', capabilityVersionIds: ['capability.local-document.v2'], activeCapabilityVersionIds: ['capability.local-document.v2'] })
    expect(installed.find((employee) => employee.id === 'employee.tender-analyst')).toMatchObject({ name: '招投标分析员', status: 'active', capabilityVersionIds: ['capability.tender-analysis.v2'], activeCapabilityVersionIds: ['capability.tender-analysis.v2'] })
    expect(installed.find((employee) => employee.id === 'employee.feishu-researcher')).toMatchObject({ name: '飞书资料员', status: 'active', capabilityVersionIds: ['capability.feishu-documents.v2'], activeCapabilityVersionIds: ['capability.feishu-documents.v2'] })
    expect(service.detail('employee.network-intelligence').active?.systemPrompt).toContain('主张与来源的对应关系')
    expect(service.detail('employee.document-writer').active?.systemPrompt).toContain('逐条核对验收标准')
    expect(service.detail('employee.tender-analyst').active?.systemPrompt).toContain('需求矩阵')
    expect(service.detail('employee.feishu-researcher').active?.systemPrompt).toContain('不得发送消息')
    store.close()
  })

  it('makes the Feishu specialist callable only while the read-only connection dependencies are available', () => {
    const { service, kernel, store } = setup()
    service.seedRequestedSpecialists()
    expect(() => service.assertVersionUsable('employee-version.feishu-researcher.v2')).toThrow('capability_dependency_unavailable')

    new ResourceService(kernel).updateFeishuConnection({ provider: 'feishu', state: 'connected', checkedAt: '2026-09-04T10:00:00.000Z', scopes: ['offline_access', 'search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'] })
    expect(service.assertVersionUsable('employee-version.feishu-researcher.v2')).toMatchObject({ name: '飞书资料员' })

    new ResourceService(kernel).updateFeishuConnection({ provider: 'feishu', state: 'reauthorization_required', checkedAt: '2026-09-04T10:05:00.000Z', scopes: ['offline_access'] })
    expect(() => service.assertVersionUsable('employee-version.feishu-researcher.v2')).toThrow('capability_dependency_unavailable')
    store.close()
  })

  it('upgrades a legacy built-in active version while preserving an existing user draft', () => {
    const { service, kernel, store } = setup()
    const legacyAvatarDataUrl = 'data:image/png;base64,bGVnYWN5'
    const legacyVersion = { schemaVersion: 1 as const, id: 'employee-version.network-intelligence.v1', createdAt: '2026-09-01T00:00:00.000Z', employeeId: 'employee.network-intelligence', version: 1, state: 'active' as const, name: '网络情报员', role: '公开网络情报搜集与核验', description: '旧版内置员工定义。', avatarDataUrl: legacyAvatarDataUrl, systemPrompt: '旧版默认提示词。', modelId: 'deepseek-v4-pro' as const, capabilityVersionIds: [], memoryScopes: ['task' as const], testRunIds: [], publishedAt: '2026-09-01T00:00:00.000Z' }
    const userDraft = { ...legacyVersion, id: 'user-preserved-draft', version: 2, state: 'draft' as const, systemPrompt: '用户正在编辑的草稿。', publishedAt: undefined }
    kernel.save({ entityType: 'EmployeeVersion', entity: legacyVersion, immutable: true }, 'legacy.version', {})
    kernel.save({ entityType: 'EmployeeVersion', entity: userDraft, immutable: false }, 'user.draft', {})
    kernel.save({ entityType: 'Employee', entity: { schemaVersion: 1, id: 'employee.network-intelligence', createdAt: legacyVersion.createdAt, name: '网络情报员', activeVersionId: legacyVersion.id, draftVersionId: userDraft.id, disabled: false, archived: false }, immutable: false }, 'legacy.employee', {})

    service.seedRequestedSpecialists()

    expect(service.detail('employee.network-intelligence').employee).toMatchObject({ activeVersionId: 'employee-version.network-intelligence.v2', draftVersionId: userDraft.id, avatarDataUrl: legacyAvatarDataUrl })
    expect(service.detail('employee.network-intelligence').active?.systemPrompt).toContain('主张与来源的对应关系')
    expect(service.detail('employee.network-intelligence').draft?.systemPrompt).toBe('用户正在编辑的草稿。')
    store.close()
  })

  it('upgrades only an untouched legacy built-in draft and invalidates its old tests', () => {
    const { service, kernel, store } = setup()
    const createdAt = '2026-09-01T00:00:00.000Z'
    const legacyVersion = { schemaVersion: 1 as const, id: 'employee-version.network-intelligence.v1', createdAt, employeeId: 'employee.network-intelligence', version: 1, state: 'active' as const, name: '网络情报员', role: '公开网络情报搜集与核验', description: '旧版内置员工定义。', systemPrompt: LEGACY_NETWORK_EMPLOYEE_PROMPT, modelId: 'deepseek-v4-pro' as const, capabilityVersionIds: ['capability.network-intelligence.v1'], memoryScopes: ['task' as const], testRunIds: [], publishedAt: createdAt }
    const untouchedDraft = { ...legacyVersion, id: 'legacy-built-in-draft', version: 2, state: 'draft' as const, testRunIds: ['legacy-test-run'], publishedAt: undefined }
    kernel.save({ entityType: 'EmployeeVersion', entity: legacyVersion, immutable: true }, 'legacy.version', {})
    kernel.save({ entityType: 'EmployeeVersion', entity: untouchedDraft, immutable: false }, 'legacy.draft', {})
    kernel.save({ entityType: 'Employee', entity: { schemaVersion: 1, id: 'employee.network-intelligence', createdAt, name: '网络情报员', activeVersionId: legacyVersion.id, draftVersionId: untouchedDraft.id, disabled: false, archived: false }, immutable: false }, 'legacy.employee', {})

    service.seedRequestedSpecialists()

    const detail = service.detail('employee.network-intelligence')
    expect(detail.employee).toMatchObject({ activeVersionId: 'employee-version.network-intelligence.v2', draftVersionId: untouchedDraft.id })
    expect(detail.draft).toMatchObject({ version: 3, systemPrompt: NETWORK_EMPLOYEE_PROMPT, role: '公开网络情报搜集、交叉核验与证据交接', capabilityVersionIds: ['capability.network-intelligence.v2'], testRunIds: [] })
    store.close()
  })

  it('persists the prototype identity fields in draft versions', () => {
    const { service, store } = setup()
    const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const created = service.create({ ...draft, avatarDataUrl, memoryScopes: [...draft.memoryScopes] })
    expect(created.employee).toMatchObject({ name: '验收员工', avatarDataUrl })
    expect(created.draft).toMatchObject({ role: '文本验收', avatarDataUrl })
    expect(service.list()[0]).toMatchObject({ role: '文本验收', avatarDataUrl })
    const updatedAvatarDataUrl = 'data:image/png;base64,aWRlbnRpdHk='
    const saved = service.saveDraft(created.employee.id, { ...draft, name: '身份员工', role: '报告验收', avatarDataUrl: updatedAvatarDataUrl, memoryScopes: [...draft.memoryScopes] })
    expect(saved.employee).toMatchObject({ name: '身份员工', avatarDataUrl: updatedAvatarDataUrl })
    expect(saved.draft).toMatchObject({ name: '身份员工', role: '报告验收', avatarDataUrl: updatedAvatarDataUrl })
    expect(service.identity(created.employee.id)).toEqual({ id: created.employee.id, name: '身份员工', avatarDataUrl: updatedAvatarDataUrl })
    store.close()
  })

  it('requires a confirmed Sandbox test before publishing and preserves old versions', () => {
    const { service, store } = setup()
    const created = service.create({ ...draft, memoryScopes: [...draft.memoryScopes] })
    expect(() => service.publish(created.employee.id)).toThrow('employee_version_not_tested')

    const withCase = service.addTestCase(created.employee.id, { name: '标记测试', prompt: '只输出 PASS', acceptanceCriteria: '包含 PASS', expectedContains: 'PASS' })
    const testCase = withCase.testCases[0]
    const started = service.startTest(created.employee.id, testCase.id, 'provider-request-1')
    service.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
    service.handleProviderEvent(started.request.requestId, { type: 'usage', requestId: started.request.requestId, inputTokens: 10, outputTokens: 1, totalTokens: 11, source: 'provider_actual' })
    const finished = completePassingEvaluation(service, started.request.requestId)
    expect(finished).toMatchObject({ status: 'completed', automaticPassed: true, userConfirmed: false })

    service.confirmTest(created.employee.id, finished.id)
    const published = service.publish(created.employee.id)
    expect(published).toMatchObject({ status: 'active', employee: { activeVersionId: created.draft!.id } })
    expect(published.employee.draftVersionId).toBeUndefined()

    const editing = service.beginEdit(created.employee.id)
    expect(editing.draft?.version).toBe(2)
    expect(editing.active?.id).toBe(created.draft?.id)
    expect(service.list().find((employee) => employee.id === created.employee.id)).toMatchObject({ status: 'active', activeVersionId: created.draft?.id, activeCapabilityVersionIds: ['capability.text-analysis.v1'] })
    expect(() => store.deleteMutable('EmployeeVersion', created.draft!.id, { schemaVersion: 1, eventId: 'x', occurredAt: new Date().toISOString(), eventType: 'tamper', aggregateType: 'EmployeeVersion', aggregateId: created.draft!.id, payload: {} })).toThrow('immutable_entity_cannot_change')

    service.saveDraft(created.employee.id, { ...draft, name: '验收员工 v2', memoryScopes: [...draft.memoryScopes] })
    const secondCase = service.addTestCase(created.employee.id, { name: 'v2 测试', prompt: '只输出 V2', acceptanceCriteria: '包含 V2', expectedContains: 'V2' }).testCases.find((item) => item.employeeVersionId === editing.draft!.id)!
    const secondRun = service.startTest(created.employee.id, secondCase.id, 'provider-request-v2')
    service.handleProviderEvent(secondRun.request.requestId, { type: 'output_delta', requestId: secondRun.request.requestId, delta: 'V2' })
    const secondFinished = completePassingEvaluation(service, secondRun.request.requestId)
    service.confirmTest(created.employee.id, secondFinished.id)
    const secondPublished = service.publish(created.employee.id)
    expect(secondPublished.active?.name).toBe('验收员工 v2')
    expect(secondPublished.versions).toHaveLength(2)
    expect(service.rollback(created.employee.id, created.draft!.id).employee.activeVersionId).toBe(created.draft!.id)
    expect(service.assertVersionUsable(created.draft!.id).name).toBe('验收员工')
    service.setDisabled(created.employee.id, true)
    expect(() => service.assertVersionUsable(created.draft!.id)).toThrow('employee_version_not_available')
    store.close()
  })

  it('restores archived employees as disabled drafts that require another test', () => {
    const { service, store } = setup()
    const created = service.create({ ...draft, memoryScopes: [...draft.memoryScopes] })
    const archived = service.archive(created.employee.id)
    expect(archived.status).toBe('archived')
    const restored = service.restore(created.employee.id)
    expect(restored).toMatchObject({ status: 'disabled', employee: { disabled: true, archived: false } })
    store.close()
  })

  it('exposes the Phase 6 managed-research capability after its built-in dependencies are available', () => {
    const { service, store } = setup()
    const created = service.create({ ...draft, capabilityVersionIds: ['capability.managed-research.v2'], memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '调研测试', prompt: '调研', acceptanceCriteria: '有来源' })
    const request = service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-request-2').request
    expect(request).toMatchObject({ modelId: 'deepseek-v4-pro', toolChoice: 'none' })
    expect(request.input).toContain('# 受管多源研究')
    expect(request.input).toContain('验收标准：有来源')
    expect(request.input).toContain('不得伪造已经执行的结果')
    expect(service.capabilities().find((capability) => capability.id === 'capability.managed-research.v2')?.dependencies.every((dependency) => dependency.available)).toBe(true)
    store.close()
  })

  it('propagates a failed source health check into employee test gates', () => {
    const { service, kernel, store } = setup()
    const created = service.create({ ...draft, capabilityVersionIds: ['capability.managed-research.v2'], memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '调研测试', prompt: '调研', acceptanceCriteria: '有来源' })
    const checkedAt = new Date().toISOString()
    kernel.save({ entityType: 'SourceHealthCheck', entity: { schemaVersion: 1, id: 'health-failed', createdAt: checkedAt, checkedAt, adapterVersionId: 'rss.read@research-source/v1', status: 'unavailable', credentialStatus: 'not_required', latencyMs: 12, failureCode: 'ssrf_target_blocked' }, immutable: true }, 'resource.health_checked', {})
    expect(() => service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-request-health')).toThrow('capability_dependency_unavailable')
    expect(service.capabilities().find((capability) => capability.id === 'capability.managed-research.v2')?.dependencies.find((dependency) => dependency.versionId === 'rss.read@research-source/v1')).toMatchObject({ available: false, reason: 'ssrf_target_blocked' })
    store.close()
  })

  it('invalidates previously confirmed runs when a draft definition changes', () => {
    const { service, store } = setup()
    const created = service.create({ ...draft, memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '旧测试', prompt: 'PASS', acceptanceCriteria: 'PASS', expectedContains: 'PASS' })
    const started = service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-old-test')
    service.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
    const finished = completePassingEvaluation(service, started.request.requestId)
    service.confirmTest(created.employee.id, finished.id)
    service.saveDraft(created.employee.id, { ...draft, systemPrompt: '已经改变的 Prompt', memoryScopes: [...draft.memoryScopes] })
    expect(() => service.confirmTest(created.employee.id, finished.id)).toThrow('test_not_confirmable')
    expect(() => service.publish(created.employee.id)).toThrow('employee_version_not_tested')
    store.close()
  })

  it('rejects fluent output when the structured evaluator finds a truth or evidence failure', () => {
    const { service, store } = setup()
    const created = service.create({ ...draft, memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '证据测试', prompt: '说明执行结果', acceptanceCriteria: '不得伪造执行结果' })
    const started = service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-evidence-test')
    service.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '已经成功执行并生成了文件。' })
    const evaluating = service.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    const evaluationRequestId = evaluating.nextRequest!.requestId
    service.handleProviderEvent(evaluationRequestId, { type: 'structured_result', requestId: evaluationRequestId, value: { ...passingEvaluation, passed: false, summary: '候选输出伪造了文件执行结果。', criteria: passingEvaluation.criteria.map((criterion) => criterion.id === 'truth_and_evidence' ? { ...criterion, passed: false, reason: 'Sandbox 未执行 Tool，却声称已经生成文件。' } : criterion) } })
    const finished = service.handleProviderEvent(evaluationRequestId, { type: 'completed', requestId: evaluationRequestId })!
    expect(finished).toMatchObject({ status: 'completed', automaticPassed: false, evaluation: { passed: false } })
    expect(() => service.confirmTest(created.employee.id, finished.id)).toThrow('test_not_confirmable')
    store.close()
  })

  it('physically deletes only never-published drafts without formal references', () => {
    const { service, kernel, store } = setup()
    const first = service.create({ ...draft, name: '可删除', memoryScopes: [...draft.memoryScopes] })
    service.deleteDraftEmployee(first.employee.id)
    expect(service.list()).toHaveLength(0)

    const referenced = service.create({ ...draft, name: '已引用', memoryScopes: [...draft.memoryScopes] })
    kernel.save({ entityType: 'Assignment', entity: { schemaVersion: 1, id: 'assignment-1', createdAt: new Date().toISOString(), runId: 'run-1', sequence: 1, employeeVersionId: referenced.draft!.id, state: 'pending' }, immutable: false }, 'assignment.created', {})
    expect(() => service.deleteDraftEmployee(referenced.employee.id)).toThrow('employee_has_history')
    expect(service.detail(referenced.employee.id).formalReferences).toHaveLength(1)
    store.close()
  })
})
