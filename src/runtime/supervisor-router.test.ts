import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { RuntimeStore } from './store'
import { SupervisorRouter } from './supervisor-router'
import { TaskService } from './task-service'

const directories: string[] = []

function setup(): { router: SupervisorRouter; tasks: TaskService; store: RuntimeStore } {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-router-'))
  directories.push(directory)
  const store = new RuntimeStore(join(directory, 'control.sqlite3'))
  const kernel = new RuntimeKernel(store)
  const resources = new ResourceService(kernel)
  resources.seed()
  const employees = new EmployeeService(kernel)
  employees.seedCapabilities()
  employees.seedRequestedSpecialists()
  const tasks = new TaskService(kernel, employees)
  return { router: new SupervisorRouter(employees, tasks), tasks, store }
}

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('SupervisorRouter', () => {
  it('asks the model for a schema-validated semantic route over only usable employee versions', async () => {
    const { router, store } = setup()
    const request = await router.createRequest({ requestId: 'route-1', conversationId: 'conversation-1', sourceMessageId: 'message-1', text: '为我处理这件事', history: [], directories: [], attachments: [] })
    expect(request).toMatchObject({ provider: 'deepseek', modelId: 'deepseek-v4-pro', stream: false, outputSchema: { name: 'supervisor_route', strict: true } })
    expect(request.input).toContain('根据完整对话选择一种模式')
    expect(request.input).toContain('title 是事项短名称')
    expect(request.input).toContain('employee-version.network-intelligence.v2')
    expect(request.input).toContain('employee-version.document-writer.v2')
    const ids = ((request.outputSchema!.schema.properties as Record<string, any>).employeeVersionIds.items.enum as string[])
    expect(ids.sort()).toEqual(['employee-version.document-writer.v2', 'employee-version.network-intelligence.v2', 'employee-version.tender-analyst.v2'])
    expect(request.outputSchema!.schema.required).toContain('title')
    store.close()
  })

  it('uses the configured supervisor model, prompt and only allowed global memory', async () => {
    const { tasks, store } = setup()
    const resources = new ResourceService(new RuntimeKernel(store))
    const employees = new EmployeeService(new RuntimeKernel(store))
    const router = new SupervisorRouter(employees, tasks, () => ({ name: '任务总管', systemPrompt: '优先核对目标和证据，再组织员工。', modelId: 'claude-sonnet-4.6', memoryScopes: ['global'] }), () => [
      { id: 'memory-global', scopeType: 'global', scopeId: 'global:local-owner', category: 'preference', content: '回答使用简体中文', sourceRefs: [], reason: 'scope_match' },
      { id: 'memory-other', scopeType: 'task', scopeId: 'task-other', category: 'fact', content: '不应注入', sourceRefs: [], reason: 'outside_scope' }
    ])
    resources.seed()
    employees.seedCapabilities()
    employees.seedRequestedSpecialists()
    const request = await router.createRequest({ requestId: 'route-config', conversationId: 'conversation-config', sourceMessageId: 'message-config', text: '处理事项', history: [], directories: [], attachments: [] })
    expect(request).toMatchObject({ provider: 'poe', modelId: 'claude-sonnet-4.6' })
    expect(request.input).toContain('名称：任务总管')
    expect(request.input).toContain('优先核对目标和证据')
    expect(request.input).toContain('memory-global')
    expect(request.input).not.toContain('memory-other')
    store.close()
  })

  it('creates a network-to-document draft and derives the missing directory gate from capability facts', () => {
    const { router, tasks, store } = setup()
    const result = router.applyDecision({ requestId: 'route-2', conversationId: 'conversation-2', sourceMessageId: 'message-2', text: '用户原话', history: [], directories: [], attachments: [] }, {
      mode: 'create_task', response: '准备执行', title: '学校新闻调研文档', goal: '调研学校最新新闻并整理成文档', acceptanceCriteria: ['新闻范围符合用户目标'], employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'], missingInputs: []
    })
    expect(result).toMatchObject({ mode: 'create_task', missingInputs: ['authorized_directory'], task: { draft: { title: '学校新闻调研文档', conversationId: 'conversation-2', authorizationMode: 'full_access', employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'], resourceScope: { directories: [] } } } })
    expect(result.startRequest).toBeUndefined()
    expect(result.response).toContain('已识别为需要员工协作的事项')
    expect(result.response).toContain('受控访问')
    expect(result.response).toContain('将自动开始')
    expect(result.task?.draft.acceptanceCriteria).toContain('网络结论保留来源、发布时间、冲突与信息缺口')
    expect(result.task?.draft.acceptanceCriteria).toContain('目标文档已在授权目录内写入或编辑，并以回读 SHA-256 作为完成证据')
    expect(() => tasks.confirmAndStart(result.task!.draft.id)).toThrow('task_directory_required')
    store.close()
  })

  it('starts a frozen-scope auto-execution task immediately when no required input is missing', () => {
    const { router, store } = setup()
    const result = router.applyDecision({ requestId: 'route-auto', conversationId: 'conversation-auto', sourceMessageId: 'message-auto', text: '搜索近期行业新闻', history: [], directories: [], attachments: [] }, {
      mode: 'create_task', response: '准备执行', goal: '搜索近期行业新闻', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-version.network-intelligence.v2'], missingInputs: []
    })
    expect(result).toMatchObject({ mode: 'create_task', missingInputs: [], task: { task: { state: 'running' }, revision: { authorizationMode: 'full_access' }, run: { state: 'running' } } })
    expect(result.startRequest?.requestId).toBeTruthy()
    expect(result.response).toContain('已加入工作并开始执行')
    expect(store.list('Approval')).toHaveLength(0)
    store.close()
  })

  it('links repeated routing of one source message to the original matter instead of creating another card', () => {
    const { router, tasks, store } = setup()
    const input = { requestId: 'route-once', conversationId: 'conversation-once', sourceMessageId: 'message-once', text: '搜索近期行业新闻', history: [], directories: [], attachments: [] }
    const decision = { mode: 'create_task', response: '准备执行', goal: '搜索近期行业新闻', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-version.network-intelligence.v2'], missingInputs: [] }
    const first = router.applyDecision(input, decision)
    tasks.failRun(first.task!.run!.id, 'provider_execution_timeout')

    const repeated = router.applyDecision(input, decision)

    expect(repeated.task?.task?.id).toBe(first.task?.task?.id)
    expect(repeated.startRequest).toBeUndefined()
    expect(repeated.response).toContain('不会重复创建')
    expect(tasks.list().filter((detail) => detail.draft.sourceMessageIds.includes('message-once'))).toHaveLength(1)
    store.close()
  })

  it('routes a follow-up employee change into the same failed Task and retains the original attachment', () => {
    const { router, tasks, store } = setup()
    const kernel = new RuntimeKernel(store)
    const attachment = { id: 'attachment-source', name: '客户资料.docx', path: '/tmp/attachments/attachment-source/客户资料.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 4096, sha256: 'd'.repeat(64) }
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'message-source', createdAt: new Date().toISOString(), conversationId: 'conversation-change', role: 'user', content: '分析客户资料', attachments: [attachment] }, immutable: true }, 'message.created', { role: 'user' })
    kernel.save({ entityType: 'Message', entity: { schemaVersion: 1, id: 'message-followup', createdAt: new Date().toISOString(), conversationId: 'conversation-change', role: 'user', content: '让网络情报员介入进来', attachments: [] }, immutable: true }, 'message.created', { role: 'user' })
    const first = router.applyDecision({ requestId: 'route-source', conversationId: 'conversation-change', sourceMessageId: 'message-source', text: '分析客户资料', history: [], directories: ['/tmp'], attachments: [attachment] }, {
      mode: 'create_task', response: '准备执行', title: '客户资料分析报告', goal: '分析客户资料并形成报告', acceptanceCriteria: ['引用可追溯'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], missingInputs: []
    })
    tasks.failRun(first.task!.run!.id, 'provider_execution_timeout')

    const changed = router.applyDecision({ requestId: 'route-followup', conversationId: 'conversation-change', sourceMessageId: 'message-followup', text: '让网络情报员介入进来', history: [], directories: ['/tmp'], attachments: [] }, {
      mode: 'change_task', targetTaskId: first.task!.task!.id, response: '调整团队', title: '不应覆盖原事项名称', goal: first.task!.draft.goal, acceptanceCriteria: first.task!.draft.acceptanceCriteria, employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'], missingInputs: []
    })

    expect(changed).toMatchObject({ mode: 'change_task', task: { task: { id: first.task!.task!.id, title: '客户资料分析报告', state: 'running' }, draft: { title: '客户资料分析报告', sourceMessageIds: ['message-source', 'message-followup'], attachments: [attachment] } } })
    expect(changed.startRequest?.requestId).toBeTruthy()
    expect(store.list('Task')).toHaveLength(1)
    store.close()
  })

  it('uses extracted attachment content as untrusted routing evidence instead of treating attachment presence as tender intent', async () => {
    const { tasks, store } = setup()
    const resources = new ResourceService(new RuntimeKernel(store))
    const employees = new EmployeeService(new RuntimeKernel(store))
    resources.seed(); employees.seedCapabilities(); employees.seedRequestedSpecialists()
    const router = new SupervisorRouter(employees, tasks, undefined, undefined, async () => [{ attachmentId: 'attachment-1', name: '普通会议纪要.pdf', mediaType: 'application/pdf', sha256: 'a'.repeat(64), trust: 'untrusted_customer_content', status: 'extracted', format: 'pdf', sections: [{ locator: '第 1 页', text: '产品周会纪要：讨论登录页面交互与下周排期，不涉及采购、招标或投标。' }], truncated: false }])
    const attachment = { id: 'attachment-1', name: '普通会议纪要.pdf', path: '/tmp/attachments/attachment-1/普通会议纪要.pdf', mediaType: 'application/pdf', size: 2048, sha256: 'a'.repeat(64) }

    const request = await router.createRequest({ requestId: 'route-content', conversationId: 'conversation-content', sourceMessageId: 'message-content', text: '总结一下', history: [], directories: [], attachments: [attachment] })

    expect(request.input).toContain('产品周会纪要')
    expect(request.input).toContain('untrusted_customer_content')
    expect(request.input).toContain('附件存在、文件名、扩展名和媒体类型都不能单独决定员工')
    expect(request.input).not.toContain('只要 customerAttachments 非空')
    store.close()
  })

  it('preserves a direct answer for a non-tender attachment when the semantic route does not need employees', () => {
    const { router, store } = setup()
    const attachment = { id: 'attachment-1', name: '普通会议纪要.pdf', path: '/tmp/attachments/attachment-1/普通会议纪要.pdf', mediaType: 'application/pdf', size: 2048, sha256: 'a'.repeat(64) }
    const result = router.applyDecision({ requestId: 'route-direct-file', conversationId: 'conversation-direct-file', sourceMessageId: 'message-direct-file', text: '这份纪要讨论了什么', history: [], directories: [], attachments: [attachment] }, {
      mode: 'direct_answer', response: '这是一份产品周会纪要。', goal: '', acceptanceCriteria: [], employeeVersionIds: [], missingInputs: []
    })
    expect(result).toEqual({ mode: 'direct_answer', response: '这是一份产品周会纪要。', missingInputs: [] })
    expect(store.list('TaskDraft')).toHaveLength(0)
    store.close()
  })

  it('uses the tender analyst only when the semantic decision selects that capability from attachment content', () => {
    const { router, tasks, store } = setup()
    const attachment = { id: 'attachment-1', name: '客户需求.pdf', path: '/tmp/attachments/attachment-1/客户需求.pdf', mediaType: 'application/pdf', size: 2048, sha256: 'a'.repeat(64) }
    const result = router.applyDecision({ requestId: 'route-tender', conversationId: 'conversation-tender', sourceMessageId: 'message-tender', text: '分析并形成响应文件', history: [], directories: ['/tmp/attachments/attachment-1', '/tmp/output'], attachments: [attachment] }, {
      mode: 'create_task', response: '准备执行。', goal: '提取招标强制条款并形成响应文件', acceptanceCriteria: ['强制条款可追溯'], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'], missingInputs: []
    })
    expect(result).toMatchObject({
      mode: 'create_task',
      missingInputs: [],
      task: {
        draft: { attachments: [attachment], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'] },
        revision: { attachments: [attachment] }
      }
    })
    expect(result.response).toContain('招投标分析员 → 网络情报员 → 文档编写员')
    expect(result.startRequest?.input).toContain('客户需求.pdf')
    expect(result.startRequest?.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: ['tender.requirements.extract@document-analysis/v1'] }, parameters: { properties: { paths: expect.any(Object) } } })
    expect(tasks.toolProposalContext(result.startRequest!.requestId, { type: 'tool_proposal', requestId: result.startRequest!.requestId, callId: 'tender-call', name: 'propose_tool_action', arguments: { toolVersionId: 'tender.requirements.extract@document-analysis/v1', parameters: { paths: ['/tmp/model-invented.pdf'] } } })).toMatchObject({ parameters: { paths: [attachment.path] }, parameterSources: { paths: { kind: 'trusted_runtime' } } })
    expect(result.task?.draft.acceptanceCriteria).toContain('全部客户源文件均保留 SHA-256 与页码、幻灯片、工作表/单元格、段落或图片文字区域定位，并形成需求矩阵、强制项、冲突风险和待澄清清单')
    expect(result.task?.draft.acceptanceCriteria).toContain('网络结论保留来源、发布时间、冲突与信息缺口')
    store.close()
  })

  it('preserves a direct answer without creating task state', () => {
    const { router, store } = setup()
    const result = router.applyDecision({ requestId: 'route-3', conversationId: 'conversation-3', sourceMessageId: 'message-3', text: '解释概念', history: [], directories: [], attachments: [] }, {
      mode: 'direct_answer', response: '这是一个无需工具即可回答的概念。', goal: '', acceptanceCriteria: [], employeeVersionIds: [], missingInputs: []
    })
    expect(result).toEqual({ mode: 'direct_answer', response: '这是一个无需工具即可回答的概念。', missingInputs: [] })
    expect(store.list('TaskDraft')).toHaveLength(0)
    store.close()
  })

  it('rejects employee ids that are not active Runtime facts', () => {
    const { router, store } = setup()
    expect(() => router.applyDecision({ requestId: 'route-4', conversationId: 'conversation-4', sourceMessageId: 'message-4', text: '执行', history: [], directories: [], attachments: [] }, {
      mode: 'create_task', response: '准备执行', goal: '执行任务', acceptanceCriteria: ['完成'], employeeVersionIds: ['invented-version'], missingInputs: []
    })).toThrow('employee_version_not_found')
    expect(store.list('TaskDraft')).toHaveLength(0)
    store.close()
  })
})
