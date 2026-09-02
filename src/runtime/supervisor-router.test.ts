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
    const request = router.createRequest({ requestId: 'route-1', conversationId: 'conversation-1', sourceMessageId: 'message-1', text: '为我处理这件事', history: [], directories: [] })
    expect(request).toMatchObject({ provider: 'deepseek', modelId: 'deepseek-v4-pro', stream: false, outputSchema: { name: 'supervisor_route', strict: true } })
    expect(request.input).toContain('根据语义和完整对话')
    expect(request.input).toContain('employee-version.network-intelligence.v1')
    expect(request.input).toContain('employee-version.document-writer.v1')
    const ids = ((request.outputSchema!.schema.properties as Record<string, any>).employeeVersionIds.items.enum as string[])
    expect(ids.sort()).toEqual(['employee-version.document-writer.v1', 'employee-version.network-intelligence.v1'])
    store.close()
  })

  it('creates a network-to-document draft and derives the missing directory gate from capability facts', () => {
    const { router, tasks, store } = setup()
    const result = router.applyDecision({ requestId: 'route-2', conversationId: 'conversation-2', sourceMessageId: 'message-2', text: '用户原话', history: [], directories: [] }, {
      mode: 'create_task', response: '准备执行', goal: '调研学校最新新闻并整理成文档', acceptanceCriteria: ['新闻范围符合用户目标'], employeeVersionIds: ['employee-version.network-intelligence.v1', 'employee-version.document-writer.v1'], missingInputs: []
    })
    expect(result).toMatchObject({ mode: 'create_task', missingInputs: ['authorized_directory'], task: { draft: { conversationId: 'conversation-2', authorizationMode: 'full_access', employeeVersionIds: ['employee-version.network-intelligence.v1', 'employee-version.document-writer.v1'], resourceScope: { directories: [] } } } })
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
    const result = router.applyDecision({ requestId: 'route-auto', conversationId: 'conversation-auto', sourceMessageId: 'message-auto', text: '搜索近期行业新闻', history: [], directories: [] }, {
      mode: 'create_task', response: '准备执行', goal: '搜索近期行业新闻', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-version.network-intelligence.v1'], missingInputs: []
    })
    expect(result).toMatchObject({ mode: 'create_task', missingInputs: [], task: { task: { state: 'running' }, revision: { authorizationMode: 'full_access' }, run: { state: 'running' } } })
    expect(result.startRequest?.requestId).toBeTruthy()
    expect(result.response).toContain('已加入工作并开始执行')
    expect(store.list('Approval')).toHaveLength(0)
    store.close()
  })

  it('preserves a direct answer without creating task state', () => {
    const { router, store } = setup()
    const result = router.applyDecision({ requestId: 'route-3', conversationId: 'conversation-3', sourceMessageId: 'message-3', text: '解释概念', history: [], directories: [] }, {
      mode: 'direct_answer', response: '这是一个无需工具即可回答的概念。', goal: '', acceptanceCriteria: [], employeeVersionIds: [], missingInputs: []
    })
    expect(result).toEqual({ mode: 'direct_answer', response: '这是一个无需工具即可回答的概念。', missingInputs: [] })
    expect(store.list('TaskDraft')).toHaveLength(0)
    store.close()
  })

  it('rejects employee ids that are not active Runtime facts', () => {
    const { router, store } = setup()
    expect(() => router.applyDecision({ requestId: 'route-4', conversationId: 'conversation-4', sourceMessageId: 'message-4', text: '执行', history: [], directories: [] }, {
      mode: 'create_task', response: '准备执行', goal: '执行任务', acceptanceCriteria: ['完成'], employeeVersionIds: ['invented-version'], missingInputs: []
    })).toThrow('employee_version_not_found')
    expect(store.list('TaskDraft')).toHaveLength(0)
    store.close()
  })
})
