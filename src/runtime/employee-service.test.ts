import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { ResourceService } from './resource-service'

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

describe('EmployeeService', () => {
  it('installs the two requested specialist employees once with disjoint capabilities', () => {
    const { service, store } = setup()
    service.seedRequestedSpecialists(); service.seedRequestedSpecialists()
    const installed = service.list().filter((employee) => employee.id.startsWith('employee.'))
    expect(installed).toHaveLength(2)
    expect(installed.find((employee) => employee.id === 'employee.network-intelligence')).toMatchObject({ name: '网络情报员', status: 'active', capabilityVersionIds: ['capability.network-intelligence.v1'], activeCapabilityVersionIds: ['capability.network-intelligence.v1'] })
    expect(installed.find((employee) => employee.id === 'employee.document-writer')).toMatchObject({ name: '文档编写员', status: 'active', capabilityVersionIds: ['capability.local-document.v1'], activeCapabilityVersionIds: ['capability.local-document.v1'] })
    expect(service.detail('employee.network-intelligence').active?.systemPrompt).toContain('不得读取、创建或编辑本机文件')
    expect(service.detail('employee.document-writer').active?.systemPrompt).toContain('不得进行网络搜索')
    store.close()
  })

  it('persists the prototype identity fields in draft versions', () => {
    const { service, store } = setup()
    const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const created = service.create({ ...draft, avatarDataUrl, memoryScopes: [...draft.memoryScopes] })
    expect(created.draft).toMatchObject({ role: '文本验收', avatarDataUrl })
    expect(service.list()[0]).toMatchObject({ role: '文本验收', avatarDataUrl })
    const saved = service.saveDraft(created.employee.id, { ...draft, role: '报告验收', avatarDataUrl, memoryScopes: [...draft.memoryScopes] })
    expect(saved.draft).toMatchObject({ role: '报告验收', avatarDataUrl })
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
    const finished = service.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId, providerRequestId: 'upstream-1' })!
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
    const secondFinished = service.handleProviderEvent(secondRun.request.requestId, { type: 'completed', requestId: secondRun.request.requestId })!
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
    const created = service.create({ ...draft, capabilityVersionIds: ['capability.managed-research.v1'], memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '调研测试', prompt: '调研', acceptanceCriteria: '有来源' })
    expect(service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-request-2').request.modelId).toBe('deepseek-v4-pro')
    expect(service.capabilities().find((capability) => capability.id === 'capability.managed-research.v1')?.dependencies.every((dependency) => dependency.available)).toBe(true)
    store.close()
  })

  it('propagates a failed source health check into employee test gates', () => {
    const { service, kernel, store } = setup()
    const created = service.create({ ...draft, capabilityVersionIds: ['capability.managed-research.v1'], memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '调研测试', prompt: '调研', acceptanceCriteria: '有来源' })
    const checkedAt = new Date().toISOString()
    kernel.save({ entityType: 'SourceHealthCheck', entity: { schemaVersion: 1, id: 'health-failed', createdAt: checkedAt, checkedAt, adapterVersionId: 'rss.read@research-source/v1', status: 'unavailable', credentialStatus: 'not_required', latencyMs: 12, failureCode: 'ssrf_target_blocked' }, immutable: true }, 'resource.health_checked', {})
    expect(() => service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-request-health')).toThrow('capability_dependency_unavailable')
    expect(service.capabilities().find((capability) => capability.id === 'capability.managed-research.v1')?.dependencies.find((dependency) => dependency.versionId === 'rss.read@research-source/v1')).toMatchObject({ available: false, reason: 'ssrf_target_blocked' })
    store.close()
  })

  it('invalidates previously confirmed runs when a draft definition changes', () => {
    const { service, store } = setup()
    const created = service.create({ ...draft, memoryScopes: [...draft.memoryScopes] })
    const withCase = service.addTestCase(created.employee.id, { name: '旧测试', prompt: 'PASS', acceptanceCriteria: 'PASS', expectedContains: 'PASS' })
    const started = service.startTest(created.employee.id, withCase.testCases[0].id, 'provider-old-test')
    service.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
    const finished = service.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    service.confirmTest(created.employee.id, finished.id)
    service.saveDraft(created.employee.id, { ...draft, systemPrompt: '已经改变的 Prompt', memoryScopes: [...draft.memoryScopes] })
    expect(() => service.confirmTest(created.employee.id, finished.id)).toThrow('test_not_confirmable')
    expect(() => service.publish(created.employee.id)).toThrow('employee_version_not_tested')
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
