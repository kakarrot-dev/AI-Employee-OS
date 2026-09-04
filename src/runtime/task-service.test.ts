import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import { TaskService, type AssignmentHandoffProjection } from './task-service'
import { ResourceService } from './resource-service'
import { ToolGateway } from './tool-gateway'
import { localDocumentRunner } from './local-document-runner'
import { FEISHU_DOCUMENT_TOOL_IDS } from '../shared/connection-contract'

const directories: string[] = []

function setup(): { employees: EmployeeService; tasks: TaskService; store: RuntimeStore; databasePath: string; kernel: RuntimeKernel; resources: ResourceService } {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-tasks-'))
  directories.push(directory)
  const databasePath = join(directory, 'control.sqlite3')
  const store = new RuntimeStore(databasePath)
  const kernel = new RuntimeKernel(store)
  const resources = new ResourceService(kernel)
  resources.seed()
  const employees = new EmployeeService(kernel)
  employees.seedCapabilities()
  return { employees, tasks: new TaskService(kernel, employees), store, databasePath, kernel, resources }
}

function managerReview(criteriaCount: number, approved: boolean, summary: string, returnToAssignmentSequence?: number): Record<string, unknown> {
  return { approved, summary, criteria: Array.from({ length: criteriaCount }, (_, criterionIndex) => ({ criterionIndex, passed: approved, reason: approved ? 'Runtime 证据满足该项标准' : summary, evidenceTypes: ['employee_output'] })), deliveryResult: { resultType: 'text', headline: '交付结果', summary: approved ? '已交付满足任务目标的文本结果。' : '当前结果尚未满足任务目标。', keyResults: [], limitations: [] }, ...(returnToAssignmentSequence ? { returnToAssignmentSequence } : {}) }
}

function completeEmployeeTest(employees: EmployeeService, candidateRequestId: string) {
  const evaluating = employees.handleProviderEvent(candidateRequestId, { type: 'completed', requestId: candidateRequestId })!
  const requestId = evaluating.nextRequest!.requestId
  employees.handleProviderEvent(requestId, { type: 'structured_result', requestId, value: { passed: true, summary: '发布门禁通过。', criteria: [
    { id: 'task_acceptance', passed: true, reason: '满足目标。' },
    { id: 'role_scope', passed: true, reason: '遵守边界。' },
    { id: 'truth_and_evidence', passed: true, reason: '未伪造证据。' },
    { id: 'output_actionability', passed: true, reason: '输出可用。' }
  ] } })
  return employees.handleProviderEvent(requestId, { type: 'completed', requestId })!
}

function publishEmployee(employees: EmployeeService): string {
  const created = employees.create({ name: '正式员工', role: '受控文本交付', description: '负责输出结构清晰且可以验证的文本结果。', systemPrompt: '输出简洁、可验证的结果。', modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.text-analysis.v1'], memoryScopes: ['employee'] })
  const withCase = employees.addTestCase(created.employee.id, { name: '发布测试', prompt: 'PASS', acceptanceCriteria: '包含 PASS', expectedContains: 'PASS' })
  const started = employees.startTest(created.employee.id, withCase.testCases[0].id, 'employee-test-provider')
  employees.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
  const completed = completeEmployeeTest(employees, started.request.requestId)
  employees.confirmTest(created.employee.id, completed.id)
  return employees.publish(created.employee.id).employee.activeVersionId!
}

function publishResearchEmployee(employees: EmployeeService): string {
  const created = employees.create({ name: '调研员', role: '受管网络调研', description: '负责在任务授权范围内检索并核验公开来源。', systemPrompt: '需要来源时提交 ToolAction Proposal。', modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.managed-research.v2'], memoryScopes: ['task'] })
  const withCase = employees.addTestCase(created.employee.id, { name: '发布测试', prompt: 'PASS', acceptanceCriteria: '包含 PASS', expectedContains: 'PASS' })
  const started = employees.startTest(created.employee.id, withCase.testCases[0].id, 'research-test-provider')
  employees.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: 'PASS' })
  const completed = completeEmployeeTest(employees, started.request.requestId)
  employees.confirmTest(created.employee.id, completed.id)
  return employees.publish(created.employee.id).employee.activeVersionId!
}

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('TaskService', () => {
  it('inherits managed attachments from the immutable source message when a client creates a draft', () => {
    const { employees, tasks, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const attachment = { id: 'source-attachment', name: '会议纪要.pdf', path: '/tmp/managed/source-attachment/会议纪要.pdf', mediaType: 'application/pdf', size: 2048, sha256: 'a'.repeat(64) }
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'source-message', createdAt: new Date().toISOString(), conversationId: 'source-conversation', role: 'user', content: '分析附件', attachments: [attachment] }, immutable: true }, 'message.created', { role: 'user' })

    const draft = tasks.createDraft({ conversationId: 'source-conversation', sourceMessageIds: ['source-message'], goal: '分析附件', acceptanceCriteria: ['结论可验证'], employeeVersionIds: [employeeVersionId] })

    expect(draft.draft.attachments).toEqual([attachment])
    expect(draft.draft.authorizationMode).toBe('full_access')
    store.close()
  })

  it('freezes the requested network-to-document team and authorized directories', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-authorized-')); directories.push(root)
    const draft = tasks.createDraft({ conversationId: 'specialists', sourceMessageIds: ['message-specialists'], goal: '调研后写入报告', acceptanceCriteria: ['保留来源', '文件可回读'], employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'], directories: [root] })
    const started = tasks.confirmAndStart(draft.draft.id)
    expect(started.revision?.resourceScope.directories).toEqual([root])
    expect(started.assignments.map((assignment) => assignment.employeeVersionId)).toEqual(['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'])
    expect(started.employeeVersions.map((version) => version.name)).toEqual(['网络情报员', '文档编写员'])
    expect(started.employeeIdentities.map((identity) => identity.name)).toEqual(['网络情报员', '文档编写员'])
    expect(started.revision?.resourceScope.skillVersionIds).toEqual(['skill.agent-reach.v2', 'skill.last30days.v2', 'skill.opencli.v2', 'skill.local-document-operations.v2'])
    expect(Object.values(started.revision?.resourceScope.skillDigests ?? {}).every((digest) => /^[a-f0-9]{64}$/.test(digest))).toBe(true)
    expect(started.request.input).toContain('# Agent-Reach 公开网页研究')
    expect(started.request.input).toContain('# Last 30 Days 近期信号研究')
    expect(started.request.input).not.toContain('# 本机文档操作')
    expect(started.request).toMatchObject({ toolChoice: 'required', proposalTool: { parameters: { properties: { toolVersionId: { enum: ['agent-reach.search@network-intelligence/v1', 'last30days.research@network-intelligence/v1', 'opencli.social-search@network-intelligence/v1'] } } } } })
    expect(started.request.proposalTool?.parameters).toMatchObject({ required: ['toolVersionId', 'parameters'] })
    expect(started.request.proposalTool?.parameters.properties).not.toHaveProperty('parameterSources')
    expect(started.request.input).toContain(`授权目录：${root}`)
    expect(started.request.executionTimeouts).toMatchObject({ firstEventMs: 120_000, idleMs: 600_000, deadlineAt: started.run ? expect.any(String) : undefined })

    const network = employees.detail('employee.network-intelligence').active!
    const avatarDataUrl = 'data:image/png;base64,aWRlbnRpdHk='
    employees.saveDraft('employee.network-intelligence', { name: '网络洞察员', role: network.role ?? '', description: network.description, avatarDataUrl, systemPrompt: network.systemPrompt, modelId: network.modelId, capabilityVersionIds: [...network.capabilityVersionIds], memoryScopes: [...network.memoryScopes] })
    const refreshed = tasks.detailByTask(started.task!.id)
    expect(refreshed.employeeIdentities[0]).toEqual({ id: 'employee.network-intelligence', name: '网络洞察员', avatarDataUrl })
    expect(refreshed.employeeVersions[0].name).toBe('网络情报员')
    store.close()
  })

  it('rejects a task when its frozen Skill digest is changed before start', () => {
    const { employees, tasks, store, kernel } = setup()
    employees.seedRequestedSpecialists()
    const draft = tasks.createDraft({ conversationId: 'skill-digest', sourceMessageIds: ['message-skill-digest'], goal: '调研公开信息', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-version.network-intelligence.v2'] })
    kernel.save({ entityType: 'TaskDraft', entity: { ...draft.draft, resourceScope: { ...draft.draft.resourceScope, skillDigests: { ...draft.draft.resourceScope.skillDigests, 'skill.agent-reach.v2': 'tampered' } } }, immutable: false }, 'test.skill_tampered', {})
    expect(() => tasks.confirmAndStart(draft.draft.id)).toThrow('skill_snapshot_mismatch')
    expect(store.list('Task')).toHaveLength(0)
    store.close()
  })

  it('does not start a local-document assignment before a directory is authorized', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const draft = tasks.createDraft({ conversationId: 'document-gate', sourceMessageIds: ['message-document-gate'], goal: '写入报告', acceptanceCriteria: ['文件可回读'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [] })
    expect(() => tasks.confirmAndStart(draft.draft.id)).toThrow('task_directory_required')
    expect(store.list('Task')).toHaveLength(0)
    expect(store.list('Assignment')).toHaveLength(0)
    store.close()
  })

  it('retries invalid provider tool arguments inside the same assignment instead of failing the run', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-invalid-tool-retry-')); directories.push(root)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'invalid-tool-retry', sourceMessageIds: ['message'], goal: '写入报告', acceptanceCriteria: ['文件可回读'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [root] }).draft.id)

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '# 完整报告' })
    const proposalTurn = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    const retried = tasks.handleProviderFailure(proposalTurn.request!.requestId, 'invalid_tool_arguments')!

    expect(retried).toMatchObject({ event: 'progress', detail: { run: { state: 'running' }, task: { state: 'running' } }, request: { toolChoice: 'required' } })
    expect(retried.detail.assignments).toHaveLength(1)
    expect(retried.detail.assignments[0]).toMatchObject({ id: started.assignments[0].id, state: 'running', invalidToolProposalCount: 1 })
    expect(retried.request?.input).toContain('document.create=path')
    store.close()
  })

  it('stops the tender workflow before writing when extraction fails', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-tender-failure-')); directories.push(root)
    const attachment = { id: 'attachment-failed', name: '客户要求.pdf', path: join(root, '客户要求.pdf'), mediaType: 'application/pdf', size: 100, sha256: 'a'.repeat(64) }
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'tender-failure', sourceMessageIds: ['message'], goal: '分析并形成响应文件', acceptanceCriteria: ['全部文件可追溯'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], attachments: [attachment], directories: [root], authorizationMode: 'full_access' }).draft.id)
    const gateway = new ToolGateway(kernel, resources, async () => { throw new Error('invalid_pdf') })
    const context = tasks.toolProposalContext(started.request.requestId, { type: 'tool_proposal', requestId: started.request.requestId, callId: 'extract', name: 'propose_tool_action', arguments: { toolVersionId: 'tender.requirements.extract@document-analysis/v1', parameters: { paths: [attachment.path] } } })
    const action = await gateway.propose(context); tasks.attachToolAction(context.assignmentId, action.id)
    const failed = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(failed).toMatchObject({ event: 'failed', detail: { task: { state: 'failed' }, run: { state: 'failed' }, assignments: [{ state: 'failed' }, { state: 'pending' }, { state: 'pending' }] } })
    expect(failed.detail.assignments[0].summary).toContain('已停止下游编写')
    store.close()
  })

  it('keeps extracted source text internal and exposes only a concise assignment summary', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-tender-summary-')); directories.push(root)
    const attachment = { id: 'attachment-ok', name: '客户要求.docx', path: join(root, '客户要求.docx'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100, sha256: 'b'.repeat(64) }
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'tender-summary', sourceMessageIds: ['message'], goal: '分析并形成响应文件', acceptanceCriteria: ['全部文件可追溯'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], attachments: [attachment], directories: [root], authorizationMode: 'full_access' }).draft.id)
    const gateway = new ToolGateway(kernel, resources, async () => ({ status: 'succeeded', documents: [{ path: attachment.path, name: attachment.name, format: 'word', sha256: attachment.sha256, sections: [{ locator: '段落 1', text: '这是不应在会话时间线中重写的客户原文' }], truncated: false }], totalCharacters: 20, warnings: [] }))
    const context = tasks.toolProposalContext(started.request.requestId, { type: 'tool_proposal', requestId: started.request.requestId, callId: 'extract', name: 'propose_tool_action', arguments: { toolVersionId: 'tender.requirements.extract@document-analysis/v1', parameters: { paths: [attachment.path] } } })
    const action = await gateway.propose(context); tasks.attachToolAction(context.assignmentId, action.id)
    const afterTool = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(afterTool.request?.input).toContain('完整内容分批契约')
    expect(afterTool.request?.input).toContain('进入本管线前已拒绝任何 truncated=true 的文档')
    expect(afterTool.request?.input).toContain('批次结束只表示后续内容在下一批')
    expect(afterTool.request?.maxOutputTokens).toBe(2_048)
    tasks.handleProviderEvent(afterTool.request!.requestId, { type: 'output_delta', requestId: afterTool.request!.requestId, delta: '已归纳为一项可追溯需求。' })
    const continuedBatch = tasks.handleProviderEvent(afterTool.request!.requestId, { type: 'completed', requestId: afterTool.request!.requestId, incomplete: true })!
    expect(continuedBatch.request?.input).toContain('[来源批次连续生成契约]')
    expect(continuedBatch.request?.input).toContain('这是不应在会话时间线中重写的客户原文')
    expect(continuedBatch.request?.input).toContain('当前原始批次 SHA-256')
    tasks.handleProviderEvent(continuedBatch.request!.requestId, { type: 'output_delta', requestId: continuedBatch.request!.requestId, delta: '补充来源定位。' })
    const completed = tasks.handleProviderEvent(continuedBatch.request!.requestId, { type: 'completed', requestId: continuedBatch.request!.requestId })!
    expect(completed.detail.assignments[0].output).toContain('TenderRequirementHandoffFragment 1/1')
    expect(completed.detail.checkpoints.some((checkpoint) => checkpoint.phase === 'source_batch' && checkpoint.payload.deterministicFragmentAssembly === true)).toBe(true)
    expect(completed.detail.assignments[0]).toMatchObject({
      summary: '已从 **1 个文件**中整理出 **1 个有效内容片段**，客户要求已完成归纳。',
      presentation: {
        schemaVersion: 1,
        title: '客户材料分析结果'
      }
    })
    expect(completed.detail.assignments[0].presentation).not.toHaveProperty('detail')
    expect(completed.request?.input).not.toContain('这是不应在会话时间线中重写的客户原文')
    const review = tasks.beginManagerReview(started.run!.id)
    expect(review.input).toContain('完整 Manifest 和 source_batch 检查点')
    expect(review.input).not.toContain('这是不应在会话时间线中重写的客户原文')
    store.close()
  })

  it('normalizes a batch-local truncation claim after Runtime verified a complete source', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-source-contradiction-')); directories.push(root)
    const attachment = { id: 'complete-source', name: '完整文件.pdf', path: join(root, '完整文件.pdf'), mediaType: 'application/pdf', size: 100, sha256: 'c'.repeat(64) }
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'source-contradiction', sourceMessageIds: ['message'], goal: '分析完整文件', acceptanceCriteria: ['不得误报截断'], employeeVersionIds: ['employee-version.tender-analyst.v2'], attachments: [attachment], directories: [root], authorizationMode: 'full_access' }).draft.id)
    const gateway = new ToolGateway(kernel, resources, async () => ({ status: 'succeeded', documents: [{ path: attachment.path, name: attachment.name, format: 'pdf', sha256: attachment.sha256, sections: [{ locator: '第 1 页', text: '完整正文' }], truncated: false }], totalCharacters: 4, warnings: [] }))
    const context = tasks.toolProposalContext(started.request.requestId, { type: 'tool_proposal', requestId: started.request.requestId, callId: 'extract', name: 'propose_tool_action', arguments: { toolVersionId: 'tender.requirements.extract@document-analysis/v1', parameters: { paths: [attachment.path] } } })
    const action = await gateway.propose(context); tasks.attachToolAction(context.assignmentId, action.id)
    const batch = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    tasks.handleProviderEvent(batch.request!.requestId, { type: 'output_delta', requestId: batch.request!.requestId, delta: 'PDF 第 1 页读取截断，第 1 页之后内容可能缺失。\n第48页第17条后直接跳到第23条，内容缺失，须确认是否存在缺页；未读取内容不得视为已覆盖。\n第42页文本截断，后续第43页续载，但中间是否存在未覆盖页或遗漏条款需核对。' })
    const completed = tasks.handleProviderEvent(batch.request!.requestId, { type: 'completed', requestId: batch.request!.requestId })!
    expect(completed.detail.assignments[0]).toMatchObject({ state: 'succeeded' })
    expect(completed.detail.assignments[0].output).toContain('PDF 第 1 页读取批次边界')
    expect(completed.detail.assignments[0].output).toContain('待后续批次核验')
    expect(completed.detail.assignments[0].output).toContain('原文未列示相应内容，须确认是否为原文编号遗漏；原文未列示内容不得视为已覆盖')
    expect(completed.detail.assignments[0].output).toContain('第42页文本批次边界，后续第43页续载，但应按相邻页连续语义核对是否存在原文遗漏条款')
    expect(completed.detail.checkpoints.some((checkpoint) => checkpoint.payload.event === 'integrity_normalized')).toBe(true)
    store.close()
  })

  it('finishes a document assignment after create and read evidence even if the model repeats an unavailable Tool', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-document-finish-')); directories.push(root)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'document-finish', sourceMessageIds: ['message-document-finish'], goal: '把上游新闻整理成文档', acceptanceCriteria: ['文件可回读'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [root], authorizationMode: 'full_access' }).draft.id)
    const gateway = new ToolGateway(kernel, resources, async (tool) => tool.id.startsWith('document.create') ? { path: join(root, 'report.md'), sha256: 'verified-hash' } : { path: join(root, 'report.md'), sha256: 'verified-hash', content: '# report' })

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '# report' })
    const createTurn = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    const createEvent = { type: 'tool_proposal' as const, requestId: createTurn.request!.requestId, callId: 'create', name: 'propose_tool_action', arguments: { toolVersionId: 'document.create@local-document/v1', parameters: { path: 'report.md' } } }
    const createContext = tasks.toolProposalContext(createTurn.request!.requestId, createEvent)
    expect(createContext.parameters).toEqual({ path: join(root, 'report.md'), content: '# report' })
    expect(createContext.parameterSources.path).toMatchObject({ kind: 'trusted_runtime', sourceRef: expect.stringContaining('authorized_directory') })
    const created = await gateway.propose(createContext); tasks.attachToolAction(createContext.assignmentId, created.id)
    const afterCreate = tasks.handleProviderEvent(createTurn.request!.requestId, { type: 'completed', requestId: createTurn.request!.requestId })!

    const requiresRead = tasks.handleProviderEvent(afterCreate.request!.requestId, { type: 'completed', requestId: afterCreate.request!.requestId })!
    expect(requiresRead.request).toMatchObject({ toolChoice: 'required', proposalTool: { parameters: { properties: { toolVersionId: { enum: ['document.read@local-document/v1'] } } } } })

    const readEvent = { type: 'tool_proposal' as const, requestId: requiresRead.request!.requestId, callId: 'read', name: 'propose_tool_action', arguments: { toolVersionId: 'document.read@local-document/v1', parameters: { path: '' } } }
    const readContext = tasks.toolProposalContext(requiresRead.request!.requestId, readEvent)
    expect(readContext).toMatchObject({ parameters: { path: join(root, 'report.md') }, parameterSources: { path: { kind: 'trusted_runtime' } } })
    const read = await gateway.propose(readContext); tasks.attachToolAction(readContext.assignmentId, read.id)
    const finalTurn = tasks.handleProviderEvent(requiresRead.request!.requestId, { type: 'completed', requestId: requiresRead.request!.requestId })!

    expect(finalTurn.request?.input).toContain('网络检索已由上游情报员工完成并通过 Handoff 提供')
    expect(finalTurn.request?.input).toContain('不得重复申请已执行或不在此列表中的 Tool')
    expect(finalTurn.request?.input).toContain('文件名与操作入口由文件卡片展示')
    expect(finalTurn.request?.input).not.toContain('直接输出完成摘要、路径和 SHA-256')
    expect(finalTurn.request).toMatchObject({ toolChoice: 'auto', proposalTool: { parameters: { properties: { toolVersionId: { enum: ['document.edit@local-document/v1'] } } } } })
    expect(() => tasks.toolProposalContext(finalTurn.request!.requestId, { ...readEvent, requestId: finalTurn.request!.requestId, callId: 'duplicate-read' })).toThrow('tool_not_available_for_assignment')
    tasks.recordInvalidToolProposal(finalTurn.request!.requestId, 'tool_not_available_for_assignment')
    const completed = tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'completed', requestId: finalTurn.request!.requestId })!
    expect(completed).toMatchObject({ event: 'assignment_completed', detail: { assignments: [{ state: 'succeeded', invalidToolProposalCount: 1 }] } })
    expect(completed.detail.assignments[0].presentation).toEqual({ schemaVersion: 1, title: '文件已生成', summary: '已生成 **report.md**，可在最终交付区直接打开。' })
    const managerRequest = tasks.beginManagerReview(started.run!.id)
    expect(managerRequest.input).toContain('Runtime Tool 证据中的 succeeded、resultVerified、path、content、bytes 和 sha256 是系统事实')
    expect(managerRequest.input).toContain('verified-hash')
    expect(managerRequest.input).toContain('# report')
    store.close()
  })

  it('recovers an exclusive-create conflict through trusted read, exact edit, and post-write readback', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-document-existing-')); directories.push(root)
    const path = join(root, 'report.md')
    writeFileSync(path, '# 旧占位报告\n', 'utf8')
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'document-existing', sourceMessageIds: ['message'], goal: '更新已有报告', acceptanceCriteria: ['文件可回读'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [root], authorizationMode: 'full_access' }).draft.id)
    const gateway = new ToolGateway(kernel, resources, localDocumentRunner)

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '# 新报告\n有效内容\n' })
    const createTurn = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    const createContext = tasks.toolProposalContext(createTurn.request!.requestId, { type: 'tool_proposal', requestId: createTurn.request!.requestId, callId: 'create-existing', name: 'propose_tool_action', arguments: { toolVersionId: 'document.create@local-document/v1', parameters: { path } } })
    const create = await gateway.propose(createContext); tasks.attachToolAction(createContext.assignmentId, create.id)
    expect(create).toMatchObject({ state: 'failed', failureCode: 'EEXIST' })
    const afterCreate = tasks.handleProviderEvent(createTurn.request!.requestId, { type: 'completed', requestId: createTurn.request!.requestId })!
    const requiresExistingRead = tasks.handleProviderEvent(afterCreate.request!.requestId, { type: 'completed', requestId: afterCreate.request!.requestId })!
    expect(requiresExistingRead.request?.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: ['document.read@local-document/v1'] } })

    const readContext = tasks.toolProposalContext(requiresExistingRead.request!.requestId, { type: 'tool_proposal', requestId: requiresExistingRead.request!.requestId, callId: 'read-existing', name: 'propose_tool_action', arguments: { toolVersionId: 'document.read@local-document/v1', parameters: { path: '' } } })
    expect(readContext).toMatchObject({ parameters: { path }, parameterSources: { path: { kind: 'trusted_runtime' } } })
    const existingRead = await gateway.propose(readContext); tasks.attachToolAction(readContext.assignmentId, existingRead.id)
    const afterExistingRead = tasks.handleProviderEvent(requiresExistingRead.request!.requestId, { type: 'completed', requestId: requiresExistingRead.request!.requestId })!

    const editContext = tasks.toolProposalContext(afterExistingRead.request!.requestId, { type: 'tool_proposal', requestId: afterExistingRead.request!.requestId, callId: 'edit-existing', name: 'propose_tool_action', arguments: { toolVersionId: 'document.edit@local-document/v1', parameters: { path: '' } } })
    expect(editContext).toMatchObject({ parameters: { path, oldText: '# 旧占位报告\n', newText: '# 新报告\n有效内容\n' }, parameterSources: { path: { kind: 'trusted_runtime' }, oldText: { kind: 'trusted_runtime' }, newText: { kind: 'model_output' } } })
    const edit = await gateway.propose(editContext); tasks.attachToolAction(editContext.assignmentId, edit.id)
    const afterEdit = tasks.handleProviderEvent(afterExistingRead.request!.requestId, { type: 'completed', requestId: afterExistingRead.request!.requestId })!
    const requiresVerificationRead = tasks.handleProviderEvent(afterEdit.request!.requestId, { type: 'completed', requestId: afterEdit.request!.requestId })!
    expect(requiresVerificationRead.request?.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: ['document.read@local-document/v1'] } })

    const verifyContext = tasks.toolProposalContext(requiresVerificationRead.request!.requestId, { type: 'tool_proposal', requestId: requiresVerificationRead.request!.requestId, callId: 'verify-edit', name: 'propose_tool_action', arguments: { toolVersionId: 'document.read@local-document/v1', parameters: { path: '' } } })
    const verifiedRead = await gateway.propose(verifyContext); tasks.attachToolAction(verifyContext.assignmentId, verifiedRead.id)
    const finalTurn = tasks.handleProviderEvent(requiresVerificationRead.request!.requestId, { type: 'completed', requestId: requiresVerificationRead.request!.requestId })!
    const completed = tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'completed', requestId: finalTurn.request!.requestId })!
    expect(completed).toMatchObject({ event: 'assignment_completed', detail: { assignments: [{ state: 'succeeded' }] } })
    expect(completed.detail.toolActions.filter((action) => action.toolVersionId === 'document.read@local-document/v1')).toHaveLength(2)
    const review = tasks.beginManagerReview(started.run!.id)
    expect(review.input.split('# 新报告\\n有效内容\\n')).toHaveLength(2)
    store.close()
  })

  it('does not let a document assignment complete without a verified write action', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-document-required-')); directories.push(root)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'document-required', sourceMessageIds: ['message'], goal: '生成报告', acceptanceCriteria: ['文件可回读'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [root], authorizationMode: 'full_access' }).draft.id)

    const requiresWrite = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!

    expect(requiresWrite).toMatchObject({ event: 'failed', detail: { assignments: [{ state: 'failed', summary: '文档正文草稿为空，未执行文件写入。' }] } })
    store.close()
  })

  it('continues token-limited document output without committing a truncated draft', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-document-continuation-')); directories.push(root)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'document-continuation', sourceMessageIds: ['message'], goal: '生成长报告', acceptanceCriteria: ['正文完整'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [root], authorizationMode: 'full_access' }).draft.id)

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '第一段' })
    const continued = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId, incomplete: true })!
    expect(continued).toMatchObject({ event: 'progress', request: { toolChoice: 'none' } })
    expect(continued.request?.input).toContain('连续生成契约')
    expect(continued.detail.assignments[0]).toMatchObject({ state: 'running', output: '第一段', continuationCount: 1 })

    tasks.handleProviderEvent(continued.request!.requestId, { type: 'output_delta', requestId: continued.request!.requestId, delta: '第一段第二段' })
    const proposal = tasks.handleProviderEvent(continued.request!.requestId, { type: 'completed', requestId: continued.request!.requestId })!
    expect(proposal.detail.assignments[0]).toMatchObject({ draftContent: '第一段第二段', state: 'running' })
    expect(proposal.request).toMatchObject({ toolChoice: 'required', proposalTool: { parameters: { properties: { parameters: { properties: { path: expect.any(Object) } } } } } })
    store.close()
  })

  it('batches an oversized cumulative handoff before the document employee writes the draft', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const upstream = publishEmployee(employees)
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-handoff-batches-')); directories.push(root)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'handoff-batches', sourceMessageIds: ['message'], goal: '依据全部上游资料生成报告', acceptanceCriteria: ['不得丢失上游事实', '文件可回读'], employeeVersionIds: [upstream, 'employee-version.document-writer.v2'], directories: [root], authorizationMode: 'full_access' }).draft.id)
    const largeHandoff = '独有事实与来源URL。'.repeat(4_000)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: largeHandoff })
    let turn = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!

    expect(turn.request?.input).toContain('用途：assignment_context')
    expect(turn.detail.assignments[1].sourceBatchState).toMatchObject({ purpose: 'assignment_context', phase: 'map' })
    expect(turn.detail.assignments[1].sourceBatchState!.sourceCharacterCount).toBeGreaterThanOrEqual(largeHandoff.length)
    for (let guard = 0; guard < 12 && !turn.request!.input.includes('CompressedHandoffContext'); guard += 1) {
      tasks.handleProviderEvent(turn.request!.requestId, { type: 'output_delta', requestId: turn.request!.requestId, delta: `## 范围\n- 批次 ${guard + 1}\n## 关键事实\n- 批次 ${guard + 1} 关键事实\n## 强制与否决项\n- 无\n## 标段与交付物\n- 无\n## 日期与阈值\n- 无\n## 来源\n- https://example.com\n## 冲突\n- 无\n## 未知项\n- 外部信息待核验\n## 下游写作约束\n- 无` })
      turn = tasks.handleProviderEvent(turn.request!.requestId, { type: 'completed', requestId: turn.request!.requestId, ...(guard === 0 ? { incomplete: true } : {}) })!
    }
    const writing = turn
    expect(writing.request).toMatchObject({ toolChoice: 'none' })
    expect(writing.request?.input).toContain('CompressedHandoffContext')
    expect(writing.request?.input).toContain('权威工作上下文')
    expect(writing.request?.input).toContain('不得声称未收到原文或 Handoff')
    expect(writing.detail.assignments[1]).toMatchObject({ contextEnvelope: { purpose: 'assignment_context', sourceCharacterCount: expect.any(Number), summary: expect.stringContaining('CompressedHandoffContextSummary'), sourceRefs: [expect.objectContaining({ handoffId: expect.any(String), sha256: expect.any(String) })] } })
    expect(writing.detail.assignments[1].draftContent).toBeUndefined()
    expect(writing.detail.assignments[1].sourceBatchState).toBeUndefined()
    expect(writing.detail.checkpoints.some((checkpoint) => checkpoint.payload.event === 'context_fragment_capped')).toBe(true)

    tasks.handleProviderEvent(writing.request!.requestId, { type: 'output_delta', requestId: writing.request!.requestId, delta: '# 完整交付文档\n第一段' })
    const continued = tasks.handleProviderEvent(writing.request!.requestId, { type: 'completed', requestId: writing.request!.requestId, incomplete: true })!
    expect(continued.request?.input).toContain('[持久活动上下文]')
    expect(continued.request?.input).toContain('CompressedHandoffContext')
    tasks.handleProviderEvent(continued.request!.requestId, { type: 'output_delta', requestId: continued.request!.requestId, delta: '\n第二段' })
    const proposal = tasks.handleProviderEvent(continued.request!.requestId, { type: 'completed', requestId: continued.request!.requestId })!
    expect(proposal.detail.assignments[1]).toMatchObject({ draftContent: '# 完整交付文档\n第一段\n第二段', contextEnvelope: { purpose: 'assignment_context' } })
    expect(proposal.detail.assignments[1].sourceBatchState).toBeUndefined()
    expect(proposal.request).toMatchObject({ toolChoice: 'required' })
    store.close()
  })

  it('freezes a draft, runs one serial assignment, manager review, and immutable delivery', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const draft = tasks.createDraft({ conversationId: 'conversation-1', sourceMessageIds: ['message-1'], goal: '生成验收摘要', acceptanceCriteria: ['包含完成状态'], employeeVersionIds: [employeeVersionId] })
    const started = tasks.confirmAndStart(draft.draft.id)
    expect(started).toMatchObject({ task: { state: 'running' }, run: { state: 'running' } })
    expect(started.assignments).toHaveLength(1)
    expect(started.revision).toMatchObject({ frozen: true, employeeVersionIds: [employeeVersionId] })
    expect(started.request.modelId).toBe('deepseek-v4-pro')

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '完成状态：成功' })
    tasks.handleProviderEvent(started.request.requestId, { type: 'usage', requestId: started.request.requestId, inputTokens: 20, outputTokens: 5, totalTokens: 25, source: 'provider_actual' })
    const employeeDone = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(employeeDone.event).toBe('assignment_completed')
    expect(employeeDone.request).toBeUndefined()
    expect(employeeDone.detail.handoffs).toHaveLength(1)

    const managerRequest = tasks.beginManagerReview(started.run!.id)
    expect(managerRequest.outputSchema?.name).toBe('manager_review')
    expect(managerRequest.maxOutputTokens).toBe(4_096)
    tasks.handleProviderEvent(managerRequest.requestId, { type: 'structured_result', requestId: managerRequest.requestId, value: managerReview(1, true, '验收通过') })
    const delivered = tasks.handleProviderEvent(managerRequest.requestId, { type: 'completed', requestId: managerRequest.requestId })!
    expect(delivered).toMatchObject({ event: 'delivery_completed', detail: { task: { state: 'succeeded' }, run: { state: 'succeeded' }, delivery: { unresolvedIssues: [] } } })
    expect(delivered.detail.delivery?.acceptanceResults).toEqual([{ criterion: '包含完成状态', passed: true, evidenceIds: [] }])
    expect(delivered.detail.delivery?.result).toMatchObject({ schemaVersion: 1, resultType: 'text', headline: '交付结果', summary: '已交付满足任务目标的文本结果。' })
    expect(delivered.detail.delivery?.presentation).toEqual({ schemaVersion: 1, title: '交付结果', summary: '已交付满足任务目标的文本结果。', metrics: undefined, detail: undefined })
    expect(store.list('BudgetLedgerEntry')).toHaveLength(1)
    expect(() => store.deleteMutable('TaskRevision', started.revision!.id, { schemaVersion: 1, eventId: 'tamper', occurredAt: new Date().toISOString(), eventType: 'tamper', aggregateType: 'TaskRevision', aggregateId: started.revision!.id, payload: {} })).toThrow('immutable_entity_cannot_change')
    const rerun = tasks.retryFailedTask(started.task!.id)
    expect(rerun.task).toMatchObject({ id: started.task!.id, state: 'running', activeRunId: rerun.run!.id })
    expect(rerun.run).toMatchObject({ state: 'running', supersedesRunId: started.run!.id })
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('succeeded')
    expect(tasks.list().filter((detail) => detail.task?.id === started.task!.id)).toHaveLength(1)
    store.close()
  })

  it('stores only non-technical result copy for markdown employee output', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'plain-timeline-summary', sourceMessageIds: ['message'], goal: '生成研究摘要', acceptanceCriteria: ['摘要可读'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const markdown = '## 研究范围与结论摘要\n\n**研究任务：** 交叉核验客户背景。\n\n| 通道 | 查询 | 结果 |\n| --- | --- | --- |\n| agent-reach.search | 郑州工商学院 | 5 条 |'

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: markdown })
    const completed = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!

    expect(completed.detail.assignments[0].summary).toBe('交叉核验客户背景。')
    expect(completed.detail.assignments[0].summary).not.toMatch(/agent-reach|通道|Tool|Runtime|[#*|]/)
    expect(completed.detail.assignments[0].presentation).toMatchObject({ schemaVersion: 1, title: '阶段工作已完成', summary: completed.detail.assignments[0].summary })
    store.close()
  })

  it('compacts an oversized handoff before any downstream specialist, not only the document employee', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const upstream = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'network-handoff-batches', sourceMessageIds: ['message'], goal: '先整理事实再做网络核验', acceptanceCriteria: ['上下文不超预算'], employeeVersionIds: [upstream, 'employee-version.network-intelligence.v2'] }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '中文事实与来源定位。'.repeat(4_000) })
    const next = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(next.request?.input).toContain('用途：assignment_context')
    expect(next.detail.assignments[1].sourceBatchState).toMatchObject({ purpose: 'assignment_context', phase: 'map' })
    store.close()
  })

  it('does not accept a document completion claim without a verified file action', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-evidence-gate-')); directories.push(root)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'evidence-gate', sourceMessageIds: ['message'], goal: '创建报告文件', acceptanceCriteria: ['文件已写入并可核验'], employeeVersionIds: ['employee-version.document-writer.v2'], directories: [root], authorizationMode: 'full_access' }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '报告已经写入，可以交付。' })
    tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })
    const review = tasks.beginManagerReview(started.run!.id)
    tasks.handleProviderEvent(review.requestId, { type: 'structured_result', requestId: review.requestId, value: managerReview(1, true, '验收通过') })
    const rejected = tasks.handleProviderEvent(review.requestId, { type: 'completed', requestId: review.requestId })!
    expect(rejected).toMatchObject({ event: 'progress', detail: { delivery: undefined, run: { state: 'running' } } })
    expect(rejected.request?.input).toContain('Runtime 证据门禁未通过：文档任务没有经过 Runtime 核验的写入或编辑结果')
    store.close()
  })

  it('uses the saved supervisor model, prompt, identity, and bounded global memory for review', () => {
    const { employees, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const memoryRequests: Array<{ allowedScopes: Array<{ type: string; id: string }> }> = []
    const tasks = new TaskService(
      kernel,
      employees,
      (request) => {
        memoryRequests.push(request)
        return [
          { id: 'global-memory', scopeType: 'global', scopeId: 'global:local-owner', category: 'rule', content: '交付前核对完成证据。', sourceRefs: ['user:confirmed'], reason: 'scope+category+hybrid+recency+provenance' },
          { id: 'outside-memory', scopeType: 'task', scopeId: 'other-task', category: 'knowledge', content: '其他任务内容', sourceRefs: ['task:other'], reason: 'malicious-loader-result' }
        ]
      },
      undefined,
      undefined,
      () => ({ name: '任务总管', systemPrompt: '使用简体中文，并优先核对验收证据。', modelId: 'claude-sonnet-4.6', memoryScopes: ['global'] })
    )
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'supervisor-review', sourceMessageIds: ['message'], goal: '生成结果', acceptanceCriteria: ['证据完整'], employeeVersionIds: [employeeVersionId] }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '结果与证据' })
    tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })

    const review = tasks.beginManagerReview(started.run!.id)

    expect(review).toMatchObject({ provider: 'poe', modelId: 'claude-sonnet-4.6' })
    expect(review.input).toContain('总管名称：任务总管')
    expect(review.input).toContain('使用简体中文，并优先核对验收证据。')
    expect(review.input).toContain('global-memory')
    expect(review.input).not.toContain('outside-memory')
    expect(review.input).not.toContain('其他任务内容')
    expect(memoryRequests.at(-1)?.allowedScopes).toEqual([{ type: 'global', id: 'global:local-owner' }])
    store.close()
  })

  it('loads only the assignment memory scopes frozen into its RunGrant', () => {
    const { employees, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const employeeId = store.get<any>('EmployeeVersion', employeeVersionId).employeeId as string
    const requests: Array<{ allowedScopes: Array<{ type: string; id: string }>; limit: number; tokenBudget: number }> = []
    const tasks = new TaskService(kernel, employees, (request) => {
      requests.push(request)
      return [
        { id: 'allowed-memory', scopeType: 'employee', scopeId: employeeId, category: 'rule', content: '发布前必须验证。', sourceRefs: ['task:old'], reason: 'scope+category+hybrid+recency+provenance' },
        { id: 'outside-memory', scopeType: 'task', scopeId: 'another-task', category: 'knowledge', content: '不得泄露的其他任务内容。', sourceRefs: ['task:another'], reason: 'malicious-loader-result' }
      ]
    })
    const draft = tasks.createDraft({ conversationId: 'c-memory', sourceMessageIds: ['m-memory'], goal: '完成发布', acceptanceCriteria: ['先验证'], employeeVersionIds: [employeeVersionId] })
    const started = tasks.confirmAndStart(draft.draft.id)

    expect(requests).toEqual([{ query: '完成发布\n先验证', allowedScopes: [{ type: 'employee', id: employeeId }], limit: 5, tokenBudget: 768 }])
    expect(started.request.input).toContain('allowed-memory')
    expect(started.request.input).not.toContain('outside-memory')
    expect(started.request.input).not.toContain('不得泄露')
    expect(started.checkpoints.find((checkpoint) => checkpoint.phase === 'memory_loaded')?.payload).toMatchObject({ loadedMemoryIds: ['allowed-memory'], droppedOutsideScope: 1 })
    store.close()
  })

  it('rejects unpublished or disabled employee versions before freezing a task', () => {
    const { employees, tasks, store } = setup()
    const unpublished = employees.create({ name: '草稿员工', role: '草稿状态验证', description: '用于验证未发布员工不能进入正式任务。', systemPrompt: '只用于验证未发布员工不能进入正式任务。', modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.text-analysis.v1'], memoryScopes: [] })
    expect(() => tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '目标', acceptanceCriteria: ['通过'], employeeVersionIds: [unpublished.draft!.id] })).toThrow('employee_version_not_available')

    const published = publishEmployee(employees)
    const employeeId = employees.detail(unpublished.employee.id).employee.id
    expect(employeeId).toBe(unpublished.employee.id)
    const owner = employees.list().find((item) => item.activeVersionId === published)!
    employees.setDisabled(owner.id, true)
    expect(() => tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '目标', acceptanceCriteria: ['通过'], employeeVersionIds: [published] })).toThrow('employee_version_not_available')
    store.close()
  })

  it('returns a rejected review to the selected employee with a bounded rework assignment', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '目标', acceptanceCriteria: ['严格通过'], employeeVersionIds: [employeeVersionId] }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '不完整' })
    const employeeDone = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    const managerRequest = tasks.beginManagerReview(started.run!.id)
    tasks.handleProviderEvent(managerRequest.requestId, { type: 'structured_result', requestId: managerRequest.requestId, value: managerReview(1, false, '请补足验收证据', 1) })
    const rejected = tasks.handleProviderEvent(managerRequest.requestId, { type: 'completed', requestId: managerRequest.requestId })!
    expect(rejected).toMatchObject({ event: 'progress', detail: { task: { state: 'running' }, run: { state: 'running' } }, request: { modelId: 'deepseek-v4-pro' } })
    expect(rejected.detail.assignments.at(-1)).toMatchObject({ sequence: 2, employeeVersionId, state: 'running', reworkOfAssignmentId: started.assignments[0].id })
    expect(rejected.request?.input).toContain('请补足验收证据')
    expect(rejected.detail.checkpoints.some((checkpoint) => checkpoint.phase === 'manager_rework')).toBe(true)
    expect(rejected.detail.delivery).toBeUndefined()
    store.close()
  })

  it('cascades an upstream rework through its original downstream assignment', () => {
    const { employees, tasks, store } = setup()
    const researcher = publishEmployee(employees)
    const analyst = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '调研', acceptanceCriteria: ['生成报告'], employeeVersionIds: [researcher, analyst] }).draft.id)
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '研究结果' })
    const firstDone = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    tasks.handleProviderEvent(firstDone.request!.requestId, { type: 'output_delta', requestId: firstDone.request!.requestId, delta: '分析报告' })
    tasks.handleProviderEvent(firstDone.request!.requestId, { type: 'completed', requestId: firstDone.request!.requestId })
    const review = tasks.beginManagerReview(started.run!.id)
    tasks.handleProviderEvent(review.requestId, { type: 'structured_result', requestId: review.requestId, value: managerReview(1, false, '上游证据不足', 1) })
    const rejected = tasks.handleProviderEvent(review.requestId, { type: 'completed', requestId: review.requestId })!
    expect(rejected.detail.assignments.slice(2)).toEqual([
      expect.objectContaining({ sequence: 3, employeeVersionId: researcher, state: 'running', reworkOfAssignmentId: started.assignments[0].id }),
      expect.objectContaining({ sequence: 4, employeeVersionId: analyst, state: 'pending', reworkOfAssignmentId: started.assignments[1].id })
    ])
    tasks.handleProviderEvent(rejected.request!.requestId, { type: 'output_delta', requestId: rejected.request!.requestId, delta: '补充研究' })
    const upstreamDone = tasks.handleProviderEvent(rejected.request!.requestId, { type: 'completed', requestId: rejected.request!.requestId })!
    expect(upstreamDone.request?.input).toContain('补充研究')
    expect(upstreamDone.request?.input).not.toContain('研究结果')
    expect(upstreamDone.request?.input).not.toContain('分析报告')
    expect(upstreamDone.detail.assignments.at(-1)).toMatchObject({ sequence: 4, state: 'running', employeeVersionId: analyst })
    store.close()
  })

  it('passes every verified upstream handoff to the final employee instead of only the immediately previous one', () => {
    const { employees, tasks, store } = setup()
    const first = publishEmployee(employees)
    const second = publishEmployee(employees)
    const third = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'cumulative-handoff', sourceMessageIds: ['message'], goal: '三阶段交付', acceptanceCriteria: ['上游证据不丢失'], employeeVersionIds: [first, second, third] }).draft.id)

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '第一阶段招投标需求矩阵' })
    const secondStarted = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    tasks.handleProviderEvent(secondStarted.request!.requestId, { type: 'output_delta', requestId: secondStarted.request!.requestId, delta: '第二阶段网络来源结论' })
    const thirdStarted = tasks.handleProviderEvent(secondStarted.request!.requestId, { type: 'completed', requestId: secondStarted.request!.requestId })!

    expect(thirdStarted.request?.input).toContain('[已核验上游累计交接]')
    expect(thirdStarted.request?.input).toContain('AgentHandoffEnvelope')
    expect(thirdStarted.request?.input).toContain('第一阶段招投标需求矩阵')
    expect(thirdStarted.request?.input).toContain('第二阶段网络来源结论')
    expect(thirdStarted.detail.handoffs.every((handoff) => handoff.envelope?.audience.assignmentIds.includes(thirdStarted.detail.assignments[2].id))).toBe(true)
    store.close()
  })

  it('passes structured and extension results without flattening them into employee text', () => {
    const { employees, store, kernel } = setup()
    const first = publishEmployee(employees)
    const second = publishEmployee(employees)
    const tasks = new TaskService(kernel, employees, () => [], (): AssignmentHandoffProjection => ({
      summary: '结构化计算结果',
      parts: [
        { kind: 'data', mediaType: 'application/json', schemaId: 'example/Calculation/v1', value: { total: 42, rows: [{ key: 'alpha', score: 0.9 }] } },
        { kind: 'extension', namespace: 'com.example/model-output', mediaType: 'application/vnd.example.result+json', value: { labels: ['A', 'B'] } }
      ]
    }))
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'typed-handoff', sourceMessageIds: ['message'], goal: '传递结构化结果', acceptanceCriteria: ['结构保持不变'], employeeVersionIds: [first, second] }).draft.id)

    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '这段原始文本不应替代结构化载荷' })
    const next = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!

    expect(next.detail.handoffs[0]).toMatchObject({
      envelope: {
        schemaVersion: 1,
        type: 'AgentHandoffEnvelope',
        parts: [
          { kind: 'data', schemaId: 'example/Calculation/v1', value: { total: 42 } },
          { kind: 'extension', namespace: 'com.example/model-output', value: { labels: ['A', 'B'] } }
        ]
      }
    })
    expect(next.request?.input).toContain('"total":42')
    expect(next.request?.input).toContain('com.example/model-output')
    expect(next.request?.input).not.toContain('这段原始文本不应替代结构化载荷')
    store.close()
  })

  it('recovers an in-flight side-effect-free assignment with a new provider request', () => {
    const { employees, tasks, store, databasePath } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '可恢复目标', acceptanceCriteria: ['通过'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const originalRequestId = started.request.requestId
    store.close()

    const reopened = new RuntimeStore(databasePath)
    const kernel = new RuntimeKernel(reopened)
    const recovered = new TaskService(kernel, new EmployeeService(kernel)).recoverPendingRequests()
    expect(recovered).toHaveLength(1)
    expect(recovered[0].requestId).not.toBe(originalRequestId)
    expect(recovered[0].input).toContain('可恢复目标')
    expect(reopened.list('ToolAction')).toHaveLength(0)
    reopened.close()
  })

  it('upgrades a legacy in-flight step budget through a new immutable revision and grant before recovery', () => {
    const { employees, tasks, store, databasePath, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const created = tasks.createDraft({ conversationId: 'legacy-budget', sourceMessageIds: ['m'], goal: '完整处理长内容', acceptanceCriteria: ['不得截断'], employeeVersionIds: [employeeVersionId] })
    kernel.save({ entityType: 'TaskDraft', entity: { ...created.draft, budget: { ...created.draft.budget, maxSteps: 8 } }, immutable: false }, 'test.legacy_budget', {})
    const started = tasks.confirmAndStart(created.draft.id)
    store.close()

    const reopened = new RuntimeStore(databasePath)
    const recoveredTasks = new TaskService(new RuntimeKernel(reopened), new EmployeeService(new RuntimeKernel(reopened)))
    const requests = recoveredTasks.recoverPendingRequests()
    const detail = recoveredTasks.detailByTask(started.task!.id)
    expect(requests).toHaveLength(1)
    expect(detail.run?.id).toBe(started.run!.id)
    expect(detail.revision).toMatchObject({ revision: 2, budget: { maxSteps: 64 } })
    expect(detail.revision?.id).not.toBe(started.revision!.id)
    expect(reopened.get<any>('RunGrant', detail.run!.runGrantId)?.budget.maxSteps).toBe(64)
    expect(reopened.get<any>('TaskRevision', started.revision!.id)?.budget.maxSteps).toBe(8)
    reopened.close()
  })

  it('waits for the current node, writes a safe shutdown checkpoint, and resumes on start', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'quit', sourceMessageIds: ['m'], goal: '安全退出', acceptanceCriteria: ['留下恢复点'], employeeVersionIds: [employeeVersionId] }).draft.id)
    expect(tasks.requestShutdown()).toEqual({ ready: false, activeRunIds: [started.run!.id] })
    expect(tasks.list().find((detail) => detail.run?.id === started.run!.id)?.run?.state).toBe('pausing')
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '节点完成' })
    const paused = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(paused).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' } } })
    expect(paused.detail.checkpoints.at(-1)).toMatchObject({ phase: 'safe_paused', payload: { reason: 'application_quit' } })
    expect(tasks.requestShutdown()).toEqual({ ready: true, activeRunIds: [] })
    const restarted = new TaskService(new RuntimeKernel(store), employees)
    const requests = restarted.recoverPendingRequests()
    expect(requests).toHaveLength(1)
    expect(requests[0].outputSchema?.name).toBe('manager_review')
    expect(restarted.list().find((detail) => detail.run?.id === started.run!.id)?.run?.state).toBe('running')
    store.close()
  })

  it('pauses only after a committed handoff and starts a new revision after accepting change', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '旧目标', acceptanceCriteria: ['旧标准'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const change = tasks.requestChange(started.task!.id, 'message-change', { goal: '新目标' })
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('pausing')
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '旧节点已完成' })
    const paused = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(paused).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' } } })
    expect(paused.detail.checkpoints.at(-1)).toMatchObject({ phase: 'safe_paused', committed: true, unsettledToolActionIds: [] })

    const revised = tasks.acceptChange(change.id, { goal: '新目标', acceptanceCriteria: ['新标准'], employeeVersionIds: [employeeVersionId] })
    expect(revised.revision).toMatchObject({ revision: 2, goal: '新目标' })
    expect(revised.run?.supersedesRunId).toBe(started.run!.id)
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('cancelled')
    expect(store.get<any>('ChangeRequest', change.id)?.decision).toBe('accepted')
    expect(revised.request.input).toContain('新目标')
    store.close()
  })

  it('recovers an interrupted change request as a safe pause instead of restarting the superseded assignment', () => {
    const { employees, tasks, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'change-restart', sourceMessageIds: ['message'], goal: '旧目标', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const change = tasks.requestChange(started.task!.id, 'message-change', { goal: '新目标' })

    const restarted = new TaskService(kernel, employees)
    expect(restarted.recoverPendingRequests()).toEqual([])
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('paused')
    expect(store.get<any>('Assignment', started.assignments[0].id)?.state).toBe('cancelled')

    const revised = restarted.acceptChange(change.id, { goal: '新目标', acceptanceCriteria: ['新标准'], employeeVersionIds: [employeeVersionId] })
    expect(revised.revision).toMatchObject({ revision: 2, goal: '新目标' })
    expect(revised.run?.supersedesRunId).toBe(started.run!.id)
    store.close()
  })

  it('does not replace the canonical task goal when the original source message is reused as a change', () => {
    const { employees, tasks, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const canonicalGoal = '生成一份带引用定位的结构化分析报告'
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'canonical-goal', sourceMessageIds: ['source-message'], goal: canonicalGoal, acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId] }).draft.id)
    const change = tasks.requestChange(started.task!.id, 'source-message', { goal: '帮我分析这个资料' })
    const restarted = new TaskService(kernel, employees)
    restarted.recoverPendingRequests()

    const revised = restarted.acceptChange(change.id, { goal: '帮我分析这个资料', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId] })
    expect(revised.revision?.goal).toBe(canonicalGoal)
    expect(revised.draft.goal).toBe(canonicalGoal)
    store.close()
  })

  it('enforces tender analysis, network research, then document writing as one ordered workflow', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const normalized = tasks.normalizeEmployeeVersionIds(['employee-version.document-writer.v2', 'employee-version.tender-analyst.v2'])
    expect(normalized).toEqual(['employee-version.tender-analyst.v2', 'employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'])

    const draft = tasks.createDraft({ conversationId: 'three-specialists', sourceMessageIds: ['message'], goal: '分析招标材料并生成报告', acceptanceCriteria: ['引用可追溯'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], directories: ['/tmp'] })
    expect(draft.draft.employeeVersionIds).toEqual(normalized)
    expect(draft.draft.acceptanceCriteria).toContain('网络结论保留来源、发布时间、冲突与信息缺口')
    store.close()
  })

  it('retries a failed task from the frozen revision without losing attachments or employee order', () => {
    const { employees, tasks, store } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-retry-')); directories.push(root)
    const attachment = { id: 'customer-doc', name: '客户需求.docx', path: join(root, '客户需求.docx'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 2048, sha256: 'a'.repeat(64) }
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'retry', sourceMessageIds: ['message-retry'], goal: '分析客户文件', acceptanceCriteria: ['保留原文定位', '形成交付文档'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], attachments: [attachment], directories: [root], authorizationMode: 'full_access' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')

    const retried = tasks.retryFailedTask(started.task!.id)

    expect(retried.task).toMatchObject({ id: started.task!.id, state: 'running', activeRevisionId: started.revision!.id, activeRunId: retried.run!.id })
    expect(retried.run).toMatchObject({ state: 'running', taskRevisionId: started.revision!.id, supersedesRunId: started.run!.id })
    expect(retried.revision).toEqual(started.revision)
    expect(retried.revision?.timeoutsMs.run).toBe(2_400_000)
    expect(Date.parse(store.get<any>('RunGrant', retried.run!.runGrantId).expiresAt) - Date.parse(retried.run!.createdAt)).toBeGreaterThanOrEqual(2_399_000)
    expect(retried.revision?.attachments).toEqual([attachment])
    expect(retried.revision?.acceptanceCriteria).toEqual(['保留原文定位', '形成交付文档', '网络结论保留来源、发布时间、冲突与信息缺口'])
    expect(retried.assignments.map((assignment) => assignment.employeeVersionId)).toEqual(['employee-version.tender-analyst.v2', 'employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'])
    expect(retried.request.input).toContain('客户需求.docx')
    expect(retried.request.executionTimeouts).toMatchObject({ firstEventMs: 120_000, idleMs: 600_000 })
    expect(retried.checkpoints[0].payload).toMatchObject({ retryOfRunId: started.run!.id })
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('failed')
    expect(tasks.list().filter((detail) => detail.task?.id === started.task!.id)).toHaveLength(1)
    store.close()
  })

  it('upgrades a legacy approval-required retry through a new immutable full-access revision', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'legacy-retry-policy', sourceMessageIds: ['message'], goal: '生成结果', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId], authorizationMode: 'approval_required' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')

    const retried = tasks.retryFailedTask(started.task!.id)

    expect(retried.revision).toMatchObject({ revision: 2, authorizationMode: 'full_access' })
    expect(retried.revision?.id).not.toBe(started.revision?.id)
    expect(retried.run).toMatchObject({ taskRevisionId: retried.revision?.id, supersedesRunId: started.run!.id })
    expect(store.get<any>('RunGrant', retried.run!.runGrantId)).toMatchObject({ authorizationMode: 'full_access' })
    expect(store.get<any>('TaskRevision', started.revision!.id)).toMatchObject({ authorizationMode: 'approval_required' })
    store.close()
  })

  it('supersedes an active legacy approval run before startup recovery', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const legacyDraft = tasks.createDraft({ conversationId: 'legacy-active-policy', sourceMessageIds: ['message'], goal: '调研公开信息', acceptanceCriteria: ['保留来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'approval_required' }).draft
    kernel.save({ entityType: 'TaskDraft', entity: { ...legacyDraft, resourceScope: { ...legacyDraft.resourceScope, skillVersionIds: undefined, skillDigests: undefined } }, immutable: false }, 'test.legacy_draft_without_skill_snapshot', {})
    const started = tasks.confirmAndStart(legacyDraft.id)
    const proposal = { type: 'tool_proposal' as const, requestId: started.request.requestId, callId: 'legacy-call', name: 'propose_tool_action', arguments: { toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: 'agents' } } }
    const context = tasks.toolProposalContext(started.request.requestId, proposal)
    const action = await new ToolGateway(kernel, resources, async () => ({ status: 'succeeded', items: [] })).propose(context)
    tasks.attachToolAction(context.assignmentId, action.id)
    const waiting = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(waiting.detail.run?.state).toBe('paused')

    const [migration] = tasks.migrateLegacyAuthorizationRuns()
    const migrated = tasks.detailByTask(started.task!.id)

    expect(migration).toMatchObject({ runId: migrated.run?.id, request: { requestId: expect.any(String) } })
    expect(migrated.revision).toMatchObject({ revision: 2, authorizationMode: 'full_access' })
    expect(migrated.revision?.resourceScope.skillVersionIds).toEqual(['skill.managed-research.v2'])
    expect(migrated.revision?.resourceScope.skillDigests?.['skill.managed-research.v2']).toMatch(/^[a-f0-9]{64}$/)
    expect(migrated.run).toMatchObject({ state: 'running', supersedesRunId: started.run!.id })
    expect(store.get<any>('RunGrant', migrated.run!.runGrantId)).toMatchObject({ authorizationMode: 'full_access' })
    expect(store.get<any>('Run', started.run!.id)).toMatchObject({ state: 'cancelled' })
    expect(store.get<any>('ToolAction', action.id)).toMatchObject({ state: 'cancelled', failureCode: 'authorization_policy_superseded' })
    expect(store.get<any>('Approval', action.approvalId!)).toMatchObject({ decision: 'rejected' })
    expect(tasks.recoverPendingRequests(new Set([migration.request.requestId]))).toEqual([])
    expect(tasks.migrateLegacyAuthorizationRuns()).toEqual([])
    store.close()
  })

  it('repairs a legacy retry from the uniquely referenced source message without creating a new Task', () => {
    const { employees, tasks, store, kernel } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-source-repair-')); directories.push(root)
    const attachment = { id: 'source-doc', name: '郑州工商学院预建设工作流梳理.docx', path: join(root, '郑州工商学院预建设工作流梳理.docx'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 23_367, sha256: 'b'.repeat(64) }
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'message-original', createdAt: new Date().toISOString(), conversationId: 'legacy-retry', role: 'user', content: '为我分析这个客户资料', attachments: [attachment] }, immutable: true }, 'message.created', { role: 'user' })
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'message-followup', createdAt: new Date().toISOString(), conversationId: 'legacy-retry', role: 'user', content: '让网络情报员介入进来', attachments: [] }, immutable: true }, 'message.created', { role: 'user' })
    const started = tasks.confirmAndStart(tasks.createDraft({
      conversationId: 'legacy-retry', sourceMessageIds: ['message-followup'],
      goal: '生成一份针对《郑州工商学院预建设工作流梳理.docx》的结构化分析报告',
      acceptanceCriteria: ['形成需求矩阵'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'],
      attachments: [], directories: [root], authorizationMode: 'full_access'
    }).draft.id)
    tasks.failRun(started.run!.id, 'tender_attachments_required')

    const retried = tasks.retryFailedTask(started.task!.id)

    expect(retried.task?.id).toBe(started.task!.id)
    expect(retried.draft.sourceMessageIds).toEqual(expect.arrayContaining(['message-original', 'message-followup']))
    expect(retried.revision?.attachments).toEqual([attachment])
    expect(retried.request.input).toContain('郑州工商学院预建设工作流梳理.docx')
    expect(tasks.list().filter((detail) => detail.task?.id === started.task!.id)).toHaveLength(1)
    store.close()
  })

  it('applies a follow-up to a failed Task as a new revision while retaining sources and attachments', () => {
    const { employees, tasks, store, kernel } = setup()
    employees.seedRequestedSpecialists()
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-terminal-change-')); directories.push(root)
    const attachment = { id: 'customer-source', name: '客户材料.docx', path: join(root, '客户材料.docx'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 4096, sha256: 'c'.repeat(64) }
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'message-source', createdAt: new Date().toISOString(), conversationId: 'terminal-change', role: 'user', content: '分析客户材料', attachments: [attachment] }, immutable: true }, 'message.created', { role: 'user' })
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'message-change', createdAt: new Date().toISOString(), conversationId: 'terminal-change', role: 'user', content: '让网络情报员介入', attachments: [] }, immutable: true }, 'message.created', { role: 'user' })
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'terminal-change', sourceMessageIds: ['message-source'], goal: '分析客户材料并形成报告', acceptanceCriteria: ['可追溯'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], attachments: [attachment], directories: [root], authorizationMode: 'full_access' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')

    const change = tasks.requestChange(started.task!.id, 'message-change', { employeeVersionIds: started.draft.employeeVersionIds })
    const revised = tasks.acceptChange(change.id, { goal: started.draft.goal, acceptanceCriteria: started.draft.acceptanceCriteria, employeeVersionIds: started.draft.employeeVersionIds })

    expect(revised.task?.id).toBe(started.task!.id)
    expect(revised.run?.supersedesRunId).toBe(started.run!.id)
    expect(revised.draft.sourceMessageIds).toEqual(['message-source', 'message-change'])
    expect(revised.revision?.attachments).toEqual([attachment])
    expect(store.get<any>('Run', started.run!.id)?.state).toBe('failed')
    store.close()
  })

  it('allows retry after verified local document writes but keeps the same Task', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'retry-created-document', sourceMessageIds: ['message'], title: '失败事项恢复', goal: '恢复失败事项', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId], authorizationMode: 'full_access' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'verified-create', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'document.create@local-document/v1', idempotencyKey: 'verified-create', state: 'succeeded', parameters: { path: '/tmp/report.md', content: 'draft' }, parameterSources: { path: { kind: 'task_input', sourceRef: 'task' }, content: { kind: 'model_output', sourceRef: 'provider' } }, risk: 'medium', sideEffect: 'external_write', timeoutMs: 10_000, resultVerified: true, completedAt: new Date().toISOString() }, immutable: false }, { schemaVersion: 1, eventId: 'verified-create-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.succeeded', aggregateType: 'ToolAction', aggregateId: 'verified-create', payload: {} })
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'verified-edit', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'document.edit@local-document/v1', idempotencyKey: 'verified-edit', state: 'succeeded', parameters: { path: '/tmp/report.md', oldText: 'draft', newText: 'final' }, parameterSources: { path: { kind: 'trusted_runtime', sourceRef: 'read:path' }, oldText: { kind: 'trusted_runtime', sourceRef: 'read:content' }, newText: { kind: 'model_output', sourceRef: 'provider' } }, risk: 'medium', sideEffect: 'external_write', timeoutMs: 10_000, resultVerified: true, completedAt: new Date().toISOString() }, immutable: false }, { schemaVersion: 1, eventId: 'verified-edit-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.succeeded', aggregateType: 'ToolAction', aggregateId: 'verified-edit', payload: {} })

    const retried = tasks.retryFailedTask(started.task!.id)

    expect(retried.task).toMatchObject({ id: started.task!.id, title: '失败事项恢复', state: 'running' })
    expect(retried.draft.title).toBe('失败事项恢复')
    expect(retried.run?.supersedesRunId).toBe(started.run!.id)
    store.close()
  })

  it('rejects creating a second matter for the same source message', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    tasks.createDraft({ conversationId: 'one-card', sourceMessageIds: ['message'], goal: '原事项', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId] })

    expect(() => tasks.createDraft({ conversationId: 'one-card', sourceMessageIds: ['message'], goal: '重复事项', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId] })).toThrow('matter_already_exists_for_source')
    store.close()
  })

  it('reconciles a legacy running read action before retrying a failed Run', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'retry-stale-read', sourceMessageIds: ['message'], goal: '恢复失败事项', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId], authorizationMode: 'full_access' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'legacy-running-read', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'last30days.research@network-intelligence/v1', idempotencyKey: 'legacy-read', state: 'running', parameters: { query: 'agents' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task' } }, risk: 'low', sideEffect: 'external_read', timeoutMs: 120_000, startedAt: new Date().toISOString() }, immutable: false }, { schemaVersion: 1, eventId: 'legacy-running-read-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.started', aggregateType: 'ToolAction', aggregateId: 'legacy-running-read', payload: {} })

    const retried = tasks.retryFailedTask(started.task!.id)

    expect(retried.run).toMatchObject({ state: 'running', supersedesRunId: started.run!.id })
    expect(store.get<any>('ToolAction', 'legacy-running-read')).toMatchObject({ state: 'cancelled', failureCode: 'run_failed_during_tool_execution', resultVerified: false })
    store.close()
  })

  it('reconciles stale ToolActions from failed Runs once during Runtime startup', () => {
    const { employees, tasks, store, kernel } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'startup-reconciliation', sourceMessageIds: ['message'], goal: '恢复失败事项', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId], authorizationMode: 'full_access' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'startup-running-read', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'last30days.research@network-intelligence/v1', idempotencyKey: 'startup-read', state: 'running', parameters: { query: 'agents' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task' } }, risk: 'low', sideEffect: 'external_read', timeoutMs: 120_000, startedAt: new Date().toISOString() }, immutable: false }, { schemaVersion: 1, eventId: 'startup-running-read-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.started', aggregateType: 'ToolAction', aggregateId: 'startup-running-read', payload: {} })
    const restarted = new TaskService(kernel, employees)

    expect(restarted.reconcileFailedRunToolActions()).toBe(1)
    expect(restarted.reconcileFailedRunToolActions()).toBe(0)
    expect(store.get<any>('ToolAction', 'startup-running-read')).toMatchObject({ state: 'cancelled', failureCode: 'run_failed_during_tool_execution' })
    store.close()
  })

  it('keeps an interrupted external write result unknown and blocks automatic retry', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'retry-unknown-write', sourceMessageIds: ['message'], goal: '恢复失败事项', acceptanceCriteria: ['完成'], employeeVersionIds: [employeeVersionId], authorizationMode: 'full_access' }).draft.id)
    tasks.failRun(started.run!.id, 'provider_execution_timeout')
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'legacy-running-write', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'document.create@local-document/v1', idempotencyKey: 'legacy-write', state: 'running', parameters: { path: '/tmp/report.md', content: 'draft' }, parameterSources: { path: { kind: 'task_input', sourceRef: 'task' }, content: { kind: 'model_output', sourceRef: 'provider' } }, risk: 'medium', sideEffect: 'external_write', timeoutMs: 10_000, startedAt: new Date().toISOString() }, immutable: false }, { schemaVersion: 1, eventId: 'legacy-running-write-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.started', aggregateType: 'ToolAction', aggregateId: 'legacy-running-write', payload: {} })

    expect(() => tasks.retryFailedTask(started.task!.id)).toThrow('unsettled_tool_action')
    expect(store.get<any>('ToolAction', 'legacy-running-write')).toMatchObject({ state: 'result_unknown', failureCode: 'run_failed_during_external_write', resultVerified: false })
    store.close()
  })

  it('does not claim a safe pause while a ToolAction is unsettled', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '有 Tool 的目标', acceptanceCriteria: ['通过'], employeeVersionIds: [employeeVersionId] }).draft.id)
    tasks.requestChange(started.task!.id, 'message-change', { goal: '新目标' })
    store.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'action-pending', createdAt: new Date().toISOString(), runId: started.run!.id, assignmentId: started.assignments[0].id, toolVersionId: 'tool.v1', idempotencyKey: 'key', state: 'pending', parameters: { query: 'x' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task' } }, risk: 'low', sideEffect: 'external_read', timeoutMs: 1000 }, immutable: false }, { schemaVersion: 1, eventId: 'action-event', occurredAt: new Date().toISOString(), eventType: 'tool_action.proposed', aggregateType: 'ToolAction', aggregateId: 'action-pending', payload: {} })
    tasks.handleProviderEvent(started.request.requestId, { type: 'output_delta', requestId: started.request.requestId, delta: '节点完成' })
    const attention = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(attention.detail.run?.state).toBe('pausing')
    expect(attention.detail.checkpoints.at(-1)?.unsettledToolActionIds).toContain('action-pending')
    const action = store.get<any>('ToolAction', 'action-pending')
    store.save({ entityType: 'ToolAction', entity: { ...action, state: 'blocked', completedAt: new Date().toISOString(), failureCode: 'approval_rejected' }, immutable: false }, { schemaVersion: 1, eventId: 'action-settled', occurredAt: new Date().toISOString(), eventType: 'tool_action.blocked', aggregateType: 'ToolAction', aggregateId: 'action-pending', payload: {} })
    expect(tasks.settleToolGate(started.run!.id).run?.state).toBe('paused')
    store.close()
  })

  it('turns a provider tool call into a Runtime proposal and resumes only with the verified result', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'c', sourceMessageIds: ['m'], goal: '调研 Deep Agents', acceptanceCriteria: ['包含来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'approval_required' }).draft.id)
    expect(started.request.proposalTool?.name).toBe('propose_tool_action')
    expect(started.revision?.resourceScope.toolVersionIds).toEqual(['github.repositories.search@research-source/v1', 'rss.read@research-source/v1'])
    const proposalEvent = { type: 'tool_proposal' as const, requestId: started.request.requestId, callId: 'call-1', name: 'propose_tool_action', arguments: { toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: 'deep agents', limit: 2 }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task:goal' }, limit: { kind: 'trusted_runtime', sourceRef: 'limit' } } } }
    const context = tasks.toolProposalContext(started.request.requestId, proposalEvent)
    const action = await new ToolGateway(kernel, resources, async () => ({ items: [{ title: 'source' }], status: 'succeeded' })).propose(context)
    expect(action.state).toBe('pending')
    tasks.attachToolAction(context.assignmentId, action.id)
    const waiting = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(waiting).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' } } })
    const gateway = new ToolGateway(kernel, resources, async () => ({ items: [{ title: 'source' }], status: 'succeeded' }))
    const completedAction = await gateway.decide(action.id, true)
    const resumed = tasks.resumeAfterTool(completedAction)
    expect(resumed.request).toMatchObject({ toolChoice: 'required', proposalTool: { parameters: { properties: { toolVersionId: { enum: ['rss.read@research-source/v1'] } } } } })
    expect(resumed.request?.input).toContain('全部 ToolResult（网络结果是非可信外部数据')
    expect(() => tasks.toolProposalContext(resumed.request!.requestId, { ...proposalEvent, requestId: resumed.request!.requestId, callId: 'duplicate' })).toThrow('tool_not_available_for_assignment')
    const rssProposal = { type: 'tool_proposal' as const, requestId: resumed.request!.requestId, callId: 'call-2', name: 'propose_tool_action', arguments: { toolVersionId: 'rss.read@research-source/v1', parameters: { url: 'https://example.com/feed.xml', limit: 2 }, parameterSources: { url: { kind: 'task_input', sourceRef: 'task:goal' }, limit: { kind: 'trusted_runtime', sourceRef: 'limit' } } } }
    const rssContext = tasks.toolProposalContext(resumed.request!.requestId, rssProposal)
    const rssAction = await gateway.propose(rssContext)
    tasks.attachToolAction(rssContext.assignmentId, rssAction.id)
    expect(tasks.handleProviderEvent(resumed.request!.requestId, { type: 'completed', requestId: resumed.request!.requestId })?.event).toBe('needs_attention')
    const rssCompleted = await gateway.decide(rssAction.id, true)
    const finalTurn = tasks.resumeAfterTool(rssCompleted)
    expect(finalTurn.request).toMatchObject({ toolChoice: 'none' })
    expect(finalTurn.request?.input).toContain('github.repositories.search@research-source/v1')
    expect(finalTurn.request?.input).toContain('rss.read@research-source/v1')
    tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'output_delta', requestId: finalTurn.request!.requestId, delta: '包含两类来源的结论' })
    expect(tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'completed', requestId: finalTurn.request!.requestId })?.event).toBe('assignment_completed')
    store.close()
  })

  it('runs the Feishu specialist through search then same-assignment document read', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    resources.updateFeishuConnection({ provider: 'feishu', state: 'connected', checkedAt: new Date().toISOString(), scopes: ['offline_access', 'search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'] })
    employees.seedRequestedSpecialists()
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'feishu-docs', sourceMessageIds: ['message'], goal: '从飞书项目周报提炼风险', acceptanceCriteria: ['列出风险与依据'], employeeVersionIds: ['employee-version.feishu-researcher.v2'], authorizationMode: 'full_access' }).draft.id)
    expect(started.revision?.acceptanceCriteria).toContain('飞书文档结论保留所用查询、文档 ID、内容 SHA-256、截断状态与未覆盖边界')
    expect(started.request.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: [FEISHU_DOCUMENT_TOOL_IDS.search] } })
    const gateway = new ToolGateway(kernel, resources, async (tool) => tool.id === FEISHU_DOCUMENT_TOOL_IDS.search
      ? { status: 'succeeded', query: '项目周报', items: [{ documentId: 'doccnDocument123', documentType: 'docx', title: '项目周报' }], responseSha256: 'a'.repeat(64), trust: 'untrusted_external_content' }
      : { status: 'succeeded', documentId: 'doccnDocument123', content: '风险：交付延期。', contentSha256: 'b'.repeat(64), truncated: false, trust: 'untrusted_external_content' })

    const searchContext = tasks.toolProposalContext(started.request.requestId, { type: 'tool_proposal', requestId: started.request.requestId, callId: 'search', name: 'propose_tool_action', arguments: { toolVersionId: FEISHU_DOCUMENT_TOOL_IDS.search, parameters: { query: '项目周报' } } })
    const search = await gateway.propose(searchContext)
    tasks.attachToolAction(searchContext.assignmentId, search.id)
    const readTurn = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(readTurn.request?.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: [FEISHU_DOCUMENT_TOOL_IDS.read] } })

    const readContext = tasks.toolProposalContext(readTurn.request!.requestId, { type: 'tool_proposal', requestId: readTurn.request!.requestId, callId: 'read', name: 'propose_tool_action', arguments: { toolVersionId: FEISHU_DOCUMENT_TOOL_IDS.read, parameters: { documentId: 'doccnDocument123' } } })
    expect(readContext.parameterSources.documentId).toMatchObject({ kind: 'untrusted_external_content', sourceRef: `tool_action:${search.id}:result.items.documentId` })
    const read = await gateway.propose(readContext)
    tasks.attachToolAction(readContext.assignmentId, read.id)
    const finalTurn = tasks.handleProviderEvent(readTurn.request!.requestId, { type: 'completed', requestId: readTurn.request!.requestId })!
    expect(finalTurn.request).toMatchObject({ toolChoice: 'none' })
    tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'output_delta', requestId: finalTurn.request!.requestId, delta: '结论：存在交付延期风险。来源：项目周报，doccnDocument123，SHA-256 已保留。' })
    expect(tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'completed', requestId: finalTurn.request!.requestId })?.event).toBe('assignment_completed')
    store.close()
  })

  it('uses the Wiki enumeration tool instead of keyword search for a knowledge-base count', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    resources.updateFeishuConnection({ provider: 'feishu', state: 'connected', checkedAt: new Date().toISOString(), scopes: ['offline_access', 'search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'] })
    employees.seedRequestedSpecialists()
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'feishu-wiki-count', sourceMessageIds: ['message'], goal: '看下我的飞书知识库里有几篇文档', acceptanceCriteria: ['统计全部可访问知识库文档数量并提供来源证据'], employeeVersionIds: ['employee-version.feishu-researcher.v2'], authorizationMode: 'full_access' }).draft.id)
    expect(started.revision?.acceptanceCriteria).toContain('飞书知识库统计保留枚举范围、空间与文档数量、文档引用 ID、枚举 SHA-256、截断状态与未覆盖边界；不要求读取正文或提供内容 SHA-256')
    expect(started.revision?.acceptanceCriteria.some((criterion) => criterion.includes('内容 SHA-256') && !criterion.includes('不要求读取正文'))).toBe(false)
    expect(started.request.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: [FEISHU_DOCUMENT_TOOL_IDS.wikiCount] } })

    const gateway = new ToolGateway(kernel, resources, async () => ({ status: 'succeeded', scope: 'accessible_wiki_spaces', coverage: 'all_accessible_wiki_spaces_excluding_my_document_library', spaceCount: 1, totalDocuments: 2, spaces: [{ spaceId: 'space-1', documentCount: 2, enumerationSha256: 'a'.repeat(64) }], documentRefs: [{ spaceId: 'space-1', nodeToken: 'node-1', documentType: 'docx', documentId: 'doc-1' }, { spaceId: 'space-1', nodeToken: 'node-2', documentType: 'sheet', documentId: 'sheet-1' }], enumerationSha256: 'b'.repeat(64), responseSha256: 'c'.repeat(64), truncated: false }))
    const context = tasks.toolProposalContext(started.request.requestId, { type: 'tool_proposal', requestId: started.request.requestId, callId: 'count', name: 'propose_tool_action', arguments: { toolVersionId: FEISHU_DOCUMENT_TOOL_IDS.wikiCount, parameters: { scope: 'accessible_wiki_spaces' } } })
    expect(context.parameterSources.scope).toMatchObject({ kind: 'trusted_runtime' })
    const action = await gateway.propose(context)
    tasks.attachToolAction(context.assignmentId, action.id)
    const finalTurn = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(finalTurn.request).toMatchObject({ toolChoice: 'none' })
    expect(finalTurn.request?.input).toContain('"totalDocuments":2')
    expect(finalTurn.request?.input).toContain('用户可见摘要不得写思考、计划、执行过程')
    tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'output_delta', requestId: finalTurn.request!.requestId, delta: '当前可访问的 1 个知识库包含 2 篇去重文档；不包含我的文档库。来源 ID 与枚举 SHA-256 已保留。' })
    const assignmentDone = tasks.handleProviderEvent(finalTurn.request!.requestId, { type: 'completed', requestId: finalTurn.request!.requestId })!
    expect(assignmentDone.event).toBe('assignment_completed')
    const deliveryTasks = new TaskService(kernel, employees, () => [], ({ output }) => ({ parts: [{ kind: 'text', mediaType: 'text/plain', text: output }] }), () => ({ artifactIds: [], evidenceIds: ['evidence-feishu-count'], unresolvedIssues: [] }))
    const managerRequest = deliveryTasks.beginManagerReview(started.run!.id)
    expect(managerRequest.input).toContain('[用户可见交付正文契约]')
    expect(managerRequest.input).toContain('keyResults 只保留用户关心的业务结果指标')
    const criteria = assignmentDone.detail.revision!.acceptanceCriteria.map((_, criterionIndex) => ({ criterionIndex, passed: true, reason: 'Runtime Tool 证据满足该项标准', evidenceTypes: ['tool_result'] }))
    deliveryTasks.handleProviderEvent(managerRequest.requestId, { type: 'structured_result', requestId: managerRequest.requestId, value: {
      approved: true,
      summary: '知识库计数与 Runtime 证据一致。',
      criteria,
      deliveryResult: {
        resultType: 'metric',
        headline: '当前可访问飞书知识库共有 2 篇文档',
        summary: '当前用户可访问的 1 个飞书知识库空间中共有 2 篇去重文档，枚举未截断。',
        keyResults: [
          { label: '文档总数', value: '2 篇', unit: '', sourceIds: [action.id] },
          { label: '知识库空间数', value: '1', unit: '个', sourceIds: [action.id] },
          { label: '枚举截断状态', value: 'false（未截断）', unit: '', sourceIds: [action.id] }
        ],
        limitations: ['不包含我的文档库。']
      }
    } })
    const delivered = deliveryTasks.handleProviderEvent(managerRequest.requestId, { type: 'completed', requestId: managerRequest.requestId })!
    expect(delivered).toMatchObject({ event: 'delivery_completed', detail: { task: { state: 'succeeded' }, delivery: { result: { summary: '当前用户可访问的 1 个飞书知识库空间中共有 2 篇去重文档，枚举未截断。', keyResults: [{ label: '文档总数', value: '2 篇' }, { label: '知识库空间数', value: '1', unit: '个' }, { label: '枚举截断状态', value: 'false（未截断）' }] } } } })
    store.close()
  })

  it('records model proposal provenance in Runtime when the provider returns only Tool parameters', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'runtime-provenance', sourceMessageIds: ['message'], goal: '调研郑州近期公开新闻', acceptanceCriteria: ['保留来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'approval_required' }).draft.id)
    const proposalEvent = { type: 'tool_proposal' as const, requestId: started.request.requestId, callId: 'call-runtime-provenance', name: 'propose_tool_action', arguments: { toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: '郑州近期公开新闻', limit: 5 } } }

    const context = tasks.toolProposalContext(started.request.requestId, proposalEvent)
    expect(context.parameterSources).toEqual({
      query: { kind: 'model_output', sourceRef: `provider_request:${started.request.requestId}` },
      limit: { kind: 'model_output', sourceRef: `provider_request:${started.request.requestId}` }
    })
    const action = await new ToolGateway(kernel, resources, async () => ({ status: 'succeeded', items: [] })).propose(context)
    expect(action).toMatchObject({ state: 'pending', parameterSources: context.parameterSources })
    store.close()
  })

  it('defers additional proposals from the same provider turn before creating orphan actions', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'multi-proposal', sourceMessageIds: ['message'], goal: '调研多个来源', acceptanceCriteria: ['保留来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'approval_required' }).draft.id)
    const gateway = new ToolGateway(kernel, resources, async () => ({ status: 'succeeded', items: [] }))
    const firstEvent = { type: 'tool_proposal' as const, requestId: started.request.requestId, callId: 'call-first', name: 'propose_tool_action', arguments: { toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: 'agents' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task:goal' } } } }
    expect(tasks.canAcceptToolProposal(started.request.requestId)).toBe(true)
    const firstContext = tasks.toolProposalContext(started.request.requestId, firstEvent)
    const firstAction = await gateway.propose(firstContext)
    tasks.attachToolAction(firstContext.assignmentId, firstAction.id)

    expect(tasks.canAcceptToolProposal(started.request.requestId)).toBe(false)
    expect(store.list('ToolAction')).toHaveLength(1)
    expect(store.list('Approval')).toHaveLength(1)
    const waiting = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(waiting).toMatchObject({ event: 'needs_attention', detail: { run: { state: 'paused' }, task: { state: 'running' } } })
    expect(waiting.detail.assignments[0]).toMatchObject({ state: 'running', awaitingToolActionId: firstAction.id })
    store.close()
  })

  it('invalidates pending approvals when an expired RunGrant fails before tool approval', async () => {
    const { employees, tasks, store, kernel, resources } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'failed-approval', sourceMessageIds: ['message'], goal: '调研', acceptanceCriteria: ['保留来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'approval_required' }).draft.id)
    const event = { type: 'tool_proposal' as const, requestId: started.request.requestId, callId: 'call', name: 'propose_tool_action', arguments: { toolVersionId: 'github.repositories.search@research-source/v1', parameters: { query: 'agents' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task:goal' } } } }
    const context = tasks.toolProposalContext(started.request.requestId, event)
    const action = await new ToolGateway(kernel, resources, async () => ({ status: 'succeeded' })).propose(context)
    tasks.attachToolAction(context.assignmentId, action.id)

    const failed = tasks.failRun(started.run!.id, 'run_grant_expired')
    expect(failed).toMatchObject({ run: { state: 'failed' }, task: { state: 'failed' } })
    expect(store.get<any>('ToolAction', action.id)).toMatchObject({ state: 'blocked', failureCode: 'run_failed_before_approval' })
    expect(store.get<any>('Approval', action.approvalId!)?.decision).toBe('rejected')
    store.close()
  })

  it('retries a rejected Tool proposal instead of failing the task immediately', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    const started = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'invalid-proposal', sourceMessageIds: ['message'], goal: '调研', acceptanceCriteria: ['保留来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'full_access' }).draft.id)
    tasks.recordInvalidToolProposal(started.request.requestId, 'invalid_tool_parameters')
    const retried = tasks.handleProviderEvent(started.request.requestId, { type: 'completed', requestId: started.request.requestId })!
    expect(retried).toMatchObject({ event: 'progress', detail: { task: { state: 'running' }, assignments: [{ state: 'running', invalidToolProposalCount: 1 }] } })
    expect(retried.request?.requestId).not.toBe(started.request.requestId)
    expect(retried.request?.input).toContain('字段契约')
    store.close()
  })

  it('fails deterministically after three invalid Tool proposals', () => {
    const { employees, tasks, store } = setup()
    const employeeVersionId = publishResearchEmployee(employees)
    let request = tasks.confirmAndStart(tasks.createDraft({ conversationId: 'invalid-proposal-limit', sourceMessageIds: ['message'], goal: '调研', acceptanceCriteria: ['保留来源'], employeeVersionIds: [employeeVersionId], authorizationMode: 'full_access' }).draft.id).request
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      tasks.recordInvalidToolProposal(request.requestId, 'invalid_tool_parameters')
      const result = tasks.handleProviderEvent(request.requestId, { type: 'completed', requestId: request.requestId })!
      if (attempt < 3) request = result.request!
      else expect(result).toMatchObject({ event: 'failed', detail: { task: { state: 'failed' }, run: { state: 'failed' } } })
    }
    store.close()
  })
})
