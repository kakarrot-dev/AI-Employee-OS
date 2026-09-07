import type { EmployeeDetail, EmployeeDraftInput } from '../../../shared/employee-contract'
import type { ConversationMessageView, ConversationSummaryView, ProviderStatus, AgentCapabilityVersionView } from '../../../shared/runtime-contract'
import type { TaskDetailView } from '../../../shared/task-contract'
import type { ResourceCatalogView } from '../../../shared/resource-contract'
import type { MemoryViewModel, MemoryQueueItemView } from '../../../shared/memory-contract'
import type { ExpertGroupView } from '../../../shared/expert-group-contract'
import { DEFAULT_SUPERVISOR_CONFIG, type SupervisorConfigView } from '../../../shared/supervisor-contract'
import type { FeishuConnectionStatus } from '../../../shared/connection-contract'
export const timestamp = () => new Date().toISOString()
export const id = (prefix: string) => `${prefix}.${crypto.randomUUID()}`
export type Scenario = 'success' | 'failure' | 'approval' | 'chat'
export interface MockState {
  schema: 1; employees: EmployeeDetail[]; groups: ExpertGroupView[]; conversations: ConversationSummaryView[]; messages: Record<string, ConversationMessageView[]>; tasks: TaskDetailView[]; supervisor: SupervisorConfigView; provider: ProviderStatus; memories: MemoryViewModel[]; queue: MemoryQueueItemView[]; connection: FeishuConnectionStatus
}
export const catalog: ResourceCatalogView = {
  skills: ['多源网络调研', '调研分析报告', '内容编辑'].map((name, i) => ({ id: `skill.${i}`, createdAt: timestamp(), name, description: ['收集公开资料，保留来源与信息缺口。', '根据证据形成结构化分析报告。', '按受众与渠道要求编辑内容。'][i], version: 1, steps: ['确认目标', '处理资料', '验收交付'], toolVersionIds: [i === 0 ? 'tool.search' : 'tool.document'], instructionsMarkdown: `# ${name}\n\n## 适用范围\n工作资料的整理与交付。\n\n## 操作步骤\n1. 确认目标与输入。\n2. 处理资料并保留信息缺口。\n3. 按验收标准交付。\n\n> 原型示例，不执行真实工具。`, instructionDigest: 'mock', available: true })),
  tools: ['search', 'document'].map((key, i) => ({ id: `tool.${key}`, createdAt: timestamp(), name: i ? '文档导出' : '公开资料搜索', description: i ? '保存示例交付文件。' : '展示公开资料搜索流程。', version: 1, sideEffect: i ? 'external_write' : 'external_read', risk: 'low', networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required' })), mcps: [], healthChecks: []
}
export const capabilities: AgentCapabilityVersionView[] = catalog.skills.map((skill, i) => ({ schemaVersion: 1, id: `capability.${i}`, createdAt: timestamp(), name: skill.name, description: skill.description, version: 1, skillVersionIds: [skill.id], toolVersionIds: skill.toolVersionIds, mcpVersionIds: [], requiredModelIds: [], permissionRequirements: ['仅演示当前事项资料读取与交付'], dependencies: [] }))
export function makeEmployee(employeeId: string, input: EmployeeDraftInput): EmployeeDetail {
  const version = { ...input, schemaVersion: 1 as const, id: `${employeeId}.v1`, employeeId, createdAt: timestamp(), version: 1, state: 'active' as const, testRunIds: [] }
  return { employee: { schemaVersion: 1, id: employeeId, createdAt: timestamp(), name: input.name, avatarDataUrl: input.avatarDataUrl, activeVersionId: version.id, disabled: false, archived: false }, status: 'active', active: version, versions: [version], testCases: [], testRuns: [], formalReferences: [] }
}
export function makeTask(conversationId: string, goal: string, employees: EmployeeDetail[], state: TaskDetailView['state'] = 'draft'): TaskDetailView {
  const taskId = id('task')
  const versions = employees.filter(e => e.status === 'active').slice(0, 2).map(e => e.active!).filter(Boolean)
  return { id: taskId, taskId, conversationId, createdAt: timestamp(), sourceMessageIds: [], draftId: `${taskId}.draft`, state, title: goal.slice(0, 28), goal, acceptanceCriteria: ['覆盖用户指定的工作范围', '保留信息缺口与待核验项', '形成可查看的交付结果'], employeeVersionIds: versions.map(e => e.id), directories: ['原型交付文件夹'], draftRevision: 1, assignments: versions.map((v, i) => ({ id: `${taskId}.assignment.${i}`, sequence: i + 1, employeeId: v.employeeId, employeeVersionId: v.id, employeeName: v.name, employeeRole: v.role, state: 'pending' })), timeline: [{ phase: 'created', createdAt: timestamp() }], researchBundles: [], toolActions: [], approvals: [] }
}
export function deliver(task: TaskDetailView): void {
  task.state = 'succeeded'; task.runCompletedAt = timestamp()
  task.assignments.forEach(a => { a.state = 'succeeded'; a.completedAt = timestamp(); a.summary = '示例工作内容已整理'; a.content = { schemaVersion: 1, title: a.employeeName ?? '员工', summary: '已完成资料整理并向总管提交示例结果。' } })
  task.timeline.push({ phase: 'employee_completed', assignmentId: task.assignments[0]?.id, createdAt: timestamp() })
  task.delivery = { id: id('delivery'), createdAt: timestamp(), content: { schemaVersion: 1, title: '交付结果', summary: `**${task.title}**\n\n已整理工作摘要、建议步骤与待核验清单。可打开示例文件查看交付形式。\n\n此内容为固定 mock 数据。`, metrics: [{ label: '交付文件', value: '1 份' }] }, acceptanceResults: task.acceptanceCriteria.map(criterion => ({ criterion, passed: true })), artifacts: [{ id: `${task.id}.artifact`, mediaType: 'text/markdown', relativePath: `${task.title}.md`, sha256: 'mock-artifact' }], evidenceCount: 0, unresolvedIssues: ['示例结果仅用于界面验收，不代表真实业务执行。'] }
}
export function fixtures(): MockState {
  const employees = [['network-intelligence', '网络情报员', '公开信息检索与核验'], ['document-writer', '文档编写员', '结构化文档撰写'], ['feishu-researcher', '飞书资料员', '知识库与文档检索'], ['tender-analyst', '招投标分析员', '需求分析与材料整理']].map(([key, name, role], i) => makeEmployee(`employee.${key}`, { name, role, description: `${role}，将用户提供的工作资料整理成可评审的结果。`, systemPrompt: `你是${name}。确认目标后处理资料，保留来源与信息缺口，依据验收标准向总管交付结果。`, modelId: 'deepseek-v4-pro', capabilityVersionIds: [capabilities[i === 1 ? 1 : 0].id], memoryScopes: ['global', 'employee'] }))
  const complete = makeTask('demo.complete', '东南亚市场研究报告', employees); deliver(complete)
  const failed = makeTask('demo.failed', '客户材料分析', employees, 'failed')
  const pending = makeTask('demo.approval', '内容发布前确认', employees, 'needs_attention')
  pending.toolActions = [{ id: 'demo.approval.action', toolVersionId: 'tool.document', state: 'blocked', parameters: { target: '示例发布文件' }, risk: 'medium', approvalId: 'demo.approval.request' }]
  pending.approvals = [{ id: 'demo.approval.request', toolActionId: 'demo.approval.action', decision: 'pending' }]
  const conversations = [['demo.welcome', '与总管的对话', '可以开始一项新的工作'], ['demo.complete', '东南亚市场研究', '研究报告已完成'], ['demo.failed', '客户材料分析', '执行失败，可重试'], ['demo.approval', '内容发布前确认', '等待你的确认']].map(([cid, title, preview]) => ({ id: cid, title, preview, updatedAt: timestamp(), messageCount: cid === 'demo.welcome' ? 0 : 2 }))
  const messages = Object.fromEntries(conversations.map(c => [c.id, c.id === 'demo.welcome' ? [] : [{ id: `${c.id}.user`, role: 'user' as const, content: `请帮我完成${c.title}。`, createdAt: timestamp() }, { id: `${c.id}.assistant`, role: 'assistant' as const, content: '已组织合适的员工处理，请查看事项进度和交付结果。', createdAt: timestamp() }]]))
  return { schema: 1, employees, groups: [{ id: 'expert-group.research', name: '调研专家团', description: '资料收集、核验与报告协作。', createdAt: timestamp(), status: 'active', members: employees.slice(0, 2).map(e => ({ employeeId: e.employee.id, employeeVersionId: e.active!.id, name: e.employee.name, role: e.active!.role, status: 'active' })) }], conversations, messages, tasks: [complete, failed, pending], supervisor: { ...DEFAULT_SUPERVISOR_CONFIG, schemaVersion: 1, id: 'supervisor.local', createdAt: timestamp(), updatedAt: timestamp() }, provider: { state: 'ready', checkedAt: timestamp(), credentialStatus: { deepseek: 'configured', poe: 'configured' }, models: [{ provider: 'deepseek', modelId: 'deepseek-v4-pro', modality: 'text', verification: 'verified' }, { provider: 'poe', modelId: 'claude-sonnet-4.6', modality: 'text', verification: 'verified' }, { provider: 'poe', modelId: 'gpt-image-2', modality: 'image', verification: 'verified' }] }, memories: [{ id: 'memory.preference', scopeType: 'global', scopeId: 'global', category: 'preference', version: 1, content: '使用简体中文，先给结论，再提供证据。', tags: ['沟通偏好'], sourceRefs: ['demo.welcome'], indexVersion: 'mock', status: 'active', createdAt: timestamp(), updatedAt: timestamp() }], queue: [{ id: 'queue.demo', sourceType: 'conversation', sourceRef: 'demo.welcome', scopeType: 'global', scopeId: 'global', state: 'pending_authorization', content: '汇报资料优先使用结构化提纲。', createdAt: timestamp() }], connection: { provider: 'feishu', state: 'not_connected', checkedAt: timestamp(), scopes: [] } }
}
