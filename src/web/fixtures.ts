import catalog from './catalog.json'
import type { AgentCapabilityVersionView, EmployeeDetail } from '../shared/employee-contract'
import type { ExpertGroupView } from '../shared/expert-group-contract'
import type { ResourceCatalogView } from '../shared/resource-contract'
import type { ConversationMessageView, ConversationSummaryView, TaskDetailView } from '../shared/runtime-contract'

// Generated from main's built-in definitions, never from the user's database.
export const builtInCatalog = catalog as {
  employees: EmployeeDetail[]
  capabilities: AgentCapabilityVersionView[]
  resources: ResourceCatalogView
  groups: ExpertGroupView[]
}
export const previewDate = '2026-09-08T00:00:00.000Z'
export const previewConversation: ConversationSummaryView = {
  id: 'web-preview-conversation', title: '与总管的对话', preview: 'Web 演示：查看客户端各页面与交付详情', updatedAt: previewDate, messageCount: 2
}
export const previewHistory: ConversationMessageView[] = [
  { id: 'web-preview-request', role: 'user', content: '请展示专家协作和文档交付的页面效果。', createdAt: previewDate },
  { id: 'web-preview-response', role: 'assistant', content: '这里展示的是 **Web 演示数据**。你可以查看事项详情、专家资料、能力目录和连接设置，也可以新建会话或编辑专家草稿。\n\n页面、组件和样式直接复用 main 客户端；下方交付记录为界面示例，未执行真实任务。', createdAt: previewDate }
]
export const previewTask: TaskDetailView = {
  id: 'web-preview-task', taskId: 'web-preview-task', draftId: 'web-preview-draft', conversationId: previewConversation.id,
  createdAt: previewDate, sourceMessageIds: ['web-preview-request'], title: '专家协作与文档交付示例', state: 'succeeded',
  goal: '展示专家协作与文档交付页面（演示数据）', acceptanceCriteria: ['展示协作成员、交付结果和验收记录'],
  employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'],
  directories: [], draftRevision: 1, frozenRevision: 1, runId: 'web-preview-run', runStartedAt: previewDate, runCompletedAt: '2026-09-08T00:02:00.000Z',
  assignments: [
    { id: 'web-preview-research', sequence: 1, employeeId: 'employee.network-intelligence', employeeVersionId: 'employee-version.network-intelligence.v2', employeeName: '网络情报员', employeeRole: '公开网络情报搜集与核验', state: 'succeeded', content: { schemaVersion: 1, title: '资料整理示例', summary: '演示信息核验与交接的展示结构；未进行真实网络调研。' } },
    { id: 'web-preview-writing', sequence: 2, employeeId: 'employee.document-writer', employeeVersionId: 'employee-version.document-writer.v2', employeeName: '文档编写员', employeeRole: '证据驱动的文档编写', state: 'succeeded', content: { schemaVersion: 1, title: '文档交付示例', summary: '演示文档交付摘要；未创建本机文件。' } }
  ],
  timeline: [
    { phase: 'created', createdAt: previewDate },
    { phase: 'employee_completed', assignmentId: 'web-preview-research', createdAt: '2026-09-08T00:01:00.000Z' },
    { phase: 'employee_completed', assignmentId: 'web-preview-writing', createdAt: '2026-09-08T00:01:30.000Z' },
    { phase: 'delivery_committed', createdAt: '2026-09-08T00:02:00.000Z' }
  ],
  delivery: { id: 'web-preview-delivery', createdAt: '2026-09-08T00:02:00.000Z', content: { schemaVersion: 1, title: '文档交付示例', summary: '**演示记录**：展示结果摘要、成员分工、验收标准与文件列表。未调用模型或生成文件。', detail: { label: '示例说明', content: '此数据仅用于核对客户端和 Web 的显示一致性。' } }, acceptanceResults: [{ criterion: '展示协作成员、交付结果和验收记录', passed: true }], artifacts: [{ id: 'web-preview-artifact', mediaType: 'text/markdown', relativePath: '演示交付说明.md', sha256: 'demo-not-a-real-file' }], evidenceCount: 0, unresolvedIssues: ['演示数据，不构成真实任务完成证据'] },
  researchBundles: [], toolActions: [], approvals: []
}
