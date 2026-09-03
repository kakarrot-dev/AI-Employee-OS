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
  it('asks the model for a schema-validated semantic route over only usable employee versions', () => {
    const { router, store } = setup()
    const request = router.createRequest({ requestId: 'route-1', conversationId: 'conversation-1', sourceMessageId: 'message-1', text: '为我处理这件事', history: [], directories: [], attachments: [] })
    expect(request).toMatchObject({ provider: 'deepseek', modelId: 'deepseek-v4-pro', stream: false, outputSchema: { name: 'supervisor_route', strict: true } })
    expect(request.input).toContain('根据完整对话选择一种模式')
    expect(request.input).toContain('employee-version.network-intelligence.v2')
    expect(request.input).toContain('employee-version.document-writer.v2')
    const ids = ((request.outputSchema!.schema.properties as Record<string, any>).employeeVersionIds.items.enum as string[])
    expect(ids.sort()).toEqual(['employee-version.document-writer.v2', 'employee-version.network-intelligence.v2', 'employee-version.tender-analyst.v2'])
    store.close()
  })

  it('uses the configured supervisor model, prompt and only allowed global memory', () => {
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
    const request = router.createRequest({ requestId: 'route-config', conversationId: 'conversation-config', sourceMessageId: 'message-config', text: '处理事项', history: [], directories: [], attachments: [] })
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
      mode: 'create_task', response: '准备执行', goal: '调研学校最新新闻并整理成文档', acceptanceCriteria: ['新闻范围符合用户目标'], employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'], missingInputs: []
    })
    expect(result).toMatchObject({ mode: 'create_task', missingInputs: ['authorized_directory'], task: { draft: { conversationId: 'conversation-2', authorizationMode: 'full_access', employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'], resourceScope: { directories: [] } } } })
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

  it('routes uploaded customer files through the fixed analyst-to-writer chain even when the model chose a direct answer', () => {
    const { router, tasks, store } = setup()
    const attachment = { id: 'attachment-1', name: '客户需求.pdf', path: '/tmp/attachments/attachment-1/客户需求.pdf', mediaType: 'application/pdf', size: 2048, sha256: 'a'.repeat(64) }
    const result = router.applyDecision({ requestId: 'route-tender', conversationId: 'conversation-tender', sourceMessageId: 'message-tender', text: '分析并形成响应文件', history: [], directories: ['/tmp/attachments/attachment-1', '/tmp/output'], attachments: [attachment] }, {
      mode: 'direct_answer', response: '我可以直接回答。', goal: '', acceptanceCriteria: [], employeeVersionIds: [], missingInputs: []
    })
    expect(result).toMatchObject({
      mode: 'create_task',
      missingInputs: [],
      task: {
        draft: { attachments: [attachment], employeeVersionIds: ['employee-version.tender-analyst.v2', 'employee-version.document-writer.v2'] },
        revision: { attachments: [attachment] }
      }
    })
    expect(result.startRequest?.input).toContain('客户需求.pdf')
    expect(result.startRequest?.proposalTool?.parameters.properties).toMatchObject({ toolVersionId: { enum: ['tender.requirements.extract@document-analysis/v1'] }, parameters: { properties: { paths: expect.any(Object) } } })
    expect(tasks.toolProposalContext(result.startRequest!.requestId, { type: 'tool_proposal', requestId: result.startRequest!.requestId, callId: 'tender-call', name: 'propose_tool_action', arguments: { toolVersionId: 'tender.requirements.extract@document-analysis/v1', parameters: { paths: ['/tmp/model-invented.pdf'] } } })).toMatchObject({ parameters: { paths: [attachment.path] }, parameterSources: { paths: { kind: 'trusted_runtime' } } })
    expect(result.task?.draft.acceptanceCriteria).toContain('全部客户源文件均保留 SHA-256 与页码、幻灯片、工作表/单元格、段落或图片文字区域定位，并形成需求矩阵、强制项、冲突风险和待澄清清单')
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
