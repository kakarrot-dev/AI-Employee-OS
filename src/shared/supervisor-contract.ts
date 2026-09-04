import { avatarDataUrlError, EMPLOYEE_FIELD_LIMITS } from './employee-contract'

export const SUPERVISOR_ID = 'supervisor.local' as const

export const LEGACY_SUPERVISOR_PROMPT = '使用简体中文清晰沟通。先确认目标与完成标准，再选择最少且充分的员工完成工作。'

export const PROFESSIONAL_SUPERVISOR_PROMPT = `你是用户在 AI Employee OS 中的唯一工作入口和最终责任人。你的职责不是转述员工过程，而是把用户意图转化为可交付、可追踪、可恢复的工作。

工作原则：
1. 先识别用户真正要得到的结果、使用对象、时效和完成证据。低风险细节可采用最小合理假设；只有缺失信息会实质改变目标、权限、团队或交付物时才询问。
2. 可在当前对话中可靠完成且无需外部事实、文件、工具或持续状态的请求直接回答。需要外部信息、专业员工、受管文件动作或独立交付物时创建事项。
3. 组队时只选择完成目标所需的最少员工，并按依赖顺序安排。研究与文件写入必须由不同最小权限员工承担，不能用下游员工补做上游能力。
4. 将验收标准写成可观察结果：内容要求、来源/文件证据、边界条件和允许保留的未决问题。不得把“已调用模型”“员工说完成了”当作完成证据。
5. 审核时逐条对照验收标准、Runtime ToolResult、Handoff、Artifact 和 Evidence。事实、推断、建议与未知必须分开；证据不足就定向退回最早出错的员工。
6. 对用户只报告关键决策、需要确认的风险、当前阻塞和最终结果。避免堆叠 Runtime 术语、过程独白和重复免责声明。
7. 不扩大用户授权的目录、网络范围、预算或副作用。结果未知时暂停核实，绝不自动重放可能产生副作用的动作。`

export const SUPERVISOR_FIELD_LIMITS = Object.freeze({
  name: { min: 2, max: 20 },
  systemPrompt: { min: 10, max: 10_000 },
  avatarBytes: EMPLOYEE_FIELD_LIMITS.avatarBytes
})

export type SupervisorModelId = 'deepseek-v4-pro' | 'claude-sonnet-4.6'
export type SupervisorMemoryScope = 'global'

export interface SupervisorConfigInput {
  name: string
  avatarDataUrl?: string
  systemPrompt: string
  modelId: SupervisorModelId
  memoryScopes: SupervisorMemoryScope[]
}

export interface SupervisorConfigView extends SupervisorConfigInput {
  schemaVersion: 1
  id: typeof SUPERVISOR_ID
  createdAt: string
  updatedAt: string
}

export type SupervisorConfigField = 'configuration' | keyof SupervisorConfigInput

export interface SupervisorConfigIssue {
  field: SupervisorConfigField
  code: string
  message: string
}

export const DEFAULT_SUPERVISOR_CONFIG: SupervisorConfigInput = {
  name: '总管',
  systemPrompt: PROFESSIONAL_SUPERVISOR_PROMPT,
  modelId: 'deepseek-v4-pro',
  memoryScopes: ['global']
}

function textLength(value: string): number {
  return [...value.trim()].length
}

function textIssue(field: 'name' | 'systemPrompt', value: unknown, label: string, code: string): SupervisorConfigIssue | undefined {
  if (typeof value !== 'string' || !value.trim()) return { field, code, message: `请输入${label}` }
  const limits = SUPERVISOR_FIELD_LIMITS[field]
  const length = textLength(value)
  if (length < limits.min || length > limits.max) return { field, code, message: `${label}需为 ${limits.min}-${limits.max} 个字符` }
  if (field === 'name' && /[\r\n\t\u0000-\u001f\u007f]/u.test(value)) return { field, code, message: `${label}只能填写单行文字` }
  return undefined
}

export function validateSupervisorConfig(input: unknown): SupervisorConfigIssue[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [{ field: 'configuration', code: 'invalid_supervisor_configuration', message: '总管设置格式不正确' }]
  const value = input as Record<string, unknown>
  const issues = [
    textIssue('name', value.name, '总管名称', 'invalid_supervisor_name'),
    textIssue('systemPrompt', value.systemPrompt, 'System Prompt', 'invalid_supervisor_system_prompt')
  ].filter((issue): issue is SupervisorConfigIssue => Boolean(issue))
  const avatarError = avatarDataUrlError(value.avatarDataUrl, SUPERVISOR_FIELD_LIMITS.avatarBytes)
  if (avatarError) issues.push({ field: 'avatarDataUrl', code: 'invalid_supervisor_avatar', message: avatarError === 'size' ? '头像大小不能超过 2 MB' : '头像必须是 PNG、JPEG 或 WebP 图片' })
  if (!['deepseek-v4-pro', 'claude-sonnet-4.6'].includes(String(value.modelId))) issues.push({ field: 'modelId', code: 'supervisor_model_not_allowed', message: '请选择可用的运行模型' })
  if (!Array.isArray(value.memoryScopes) || value.memoryScopes.some((scope) => scope !== 'global') || new Set(value.memoryScopes).size !== value.memoryScopes.length) issues.push({ field: 'memoryScopes', code: 'invalid_supervisor_memory_scopes', message: '总管记忆范围配置不正确' })
  return issues
}

export function normalizeSupervisorConfig(input: SupervisorConfigInput): SupervisorConfigInput {
  return { ...input, name: input.name.trim(), systemPrompt: input.systemPrompt.trim(), memoryScopes: [...input.memoryScopes] }
}
