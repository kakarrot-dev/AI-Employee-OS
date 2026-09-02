import { avatarDataUrlError, EMPLOYEE_FIELD_LIMITS } from './employee-contract'

export const SUPERVISOR_ID = 'supervisor.local' as const

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
  systemPrompt: '使用简体中文清晰沟通。先确认目标与完成标准，再选择最少且充分的员工完成工作。',
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
