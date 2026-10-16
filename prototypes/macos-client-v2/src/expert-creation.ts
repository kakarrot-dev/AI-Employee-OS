import capabilities from './expert-capabilities.json'

// Local prototype snapshot of web-admin ChatAgentWorkspace / ExpertExecutionFields.
// These options describe configuration; they do not connect models or execute tools.
export const expertModels = [
  { id: 'deepseek-v4', name: 'deepseek-v4', inputs: ['text'] },
  { id: 'glm-5.2', name: 'glm-5.2', inputs: ['text', 'image', 'audio'] }
]
export const expertCapabilities = capabilities
export const expertInputChoices = [
  { id: 'text', name: '文字', hint: '直接输入 / TXT / MD' },
  { id: 'document', name: '文档', hint: 'PDF、DOCX' },
  { id: 'spreadsheet', name: '表格', hint: 'Excel、CSV' },
  { id: 'image', name: '图片', hint: 'PNG、JPG' },
  { id: 'audio', name: '音频', hint: 'MP3、WAV、M4A' }
]
export const expertOutputChoices = [
  { id: 'text', name: '纯文本' }, { id: 'markdown', name: 'Markdown' },
  { id: 'document', name: 'Word 文档' }, { id: 'pdf', name: 'PDF' },
  { id: 'json', name: 'JSON' }, { id: 'table', name: '表格（CSV）' }
]
export const expertSections = [
  { id: 'basic', name: '基础与提示词' }, { id: 'model', name: '模型配置' },
  { id: 'capabilities', name: '执行能力' }, { id: 'io', name: '输入输出' }
] as const
export type ExpertSection = typeof expertSections[number]['id']
export interface ExpertCapabilityBinding { id: string; version: string; actions: string[] }
export interface ExpertDraft {
  name: string; description: string; prompt: string; opening: string; questions: string
  model: string; maxTokens: number; timeout: number; streaming: boolean; temperature: number; topP: number
  capabilities: ExpertCapabilityBinding[]; inputs: string[]; outputs: string[]
}
export function blankExpertDraft(): ExpertDraft {
  return { name: '', description: '', prompt: '', opening: '', questions: '', model: 'deepseek-v4', maxTokens: 4096, timeout: 90, streaming: true, temperature: 0.3, topP: 0.9, capabilities: [], inputs: ['text'], outputs: ['text'] }
}
export const expertQuestions = (draft: Pick<ExpertDraft, 'questions'>): string[] => draft.questions.split('\n').map(q => q.trim()).filter(Boolean)
export interface ExpertIssue { field: keyof ExpertDraft; section: ExpertSection; message: string }
export function expertDraftIssues(draft: ExpertDraft): ExpertIssue[] {
  const issues: ExpertIssue[] = []
  const add = (field: keyof ExpertDraft, section: ExpertSection, message: string): void => { issues.push({ field, section, message }) }
  if (draft.name.trim().length < 2 || draft.name.trim().length > 20) add('name', 'basic', draft.name.trim() ? '专家名称需为 2–20 个字符' : '请输入专家名称')
  if (!draft.description.trim() || draft.description.trim().length > 200) add('description', 'basic', '请填写不超过 200 字的专家简介')
  if (!draft.prompt.trim() || draft.prompt.trim().length > 8000) add('prompt', 'basic', '请填写不超过 8000 字的系统提示词')
  if (draft.opening.length > 200) add('opening', 'basic', '开场白不能超过 200 字')
  if (expertQuestions(draft).length > 4 || expertQuestions(draft).some(q => q.length > 80)) add('questions', 'basic', '推荐问题最多 4 条，每条不超过 80 字')
  const model = expertModels.find(m => m.id === draft.model)
  if (!model) add('model', 'model', '请选择可用的运行模型')
  if (!Number.isInteger(draft.maxTokens) || draft.maxTokens < 1 || draft.maxTokens > 32768) add('maxTokens', 'model', '最大输出 Token 须为 1–32768 的整数')
  if (!Number.isInteger(draft.timeout) || draft.timeout < 1 || draft.timeout > 120) add('timeout', 'model', '响应超时须为 1–120 秒的整数')
  if (!Number.isFinite(draft.temperature) || draft.temperature < 0 || draft.temperature > 1) add('temperature', 'model', '温度须为 0–1')
  if (!Number.isFinite(draft.topP) || draft.topP <= 0 || draft.topP > 1) add('topP', 'model', 'Top P 须大于 0 且不超过 1')
  if (draft.inputs.some(input => ['image', 'audio'].includes(input) && !model?.inputs.includes(input))) add('inputs', 'io', '图片或音频输入需要支持相应输入的多模态模型，请在模型配置中选择 glm-5.2')
  if (!draft.inputs.length) add('inputs', 'io', '至少选择一种输入格式')
  if (!draft.outputs.length) add('outputs', 'io', '至少选择一种输出格式')
  if (draft.capabilities.some(binding => {
    const capability = expertCapabilities.find(item => item.id === binding.id)
    return !capability || !capability.versions.includes(binding.version) || !binding.actions.length || binding.actions.some(id => !capability.actions.some(action => action.id === id))
  })) add('capabilities', 'capabilities', '每项执行能力至少选择一个可用操作')
  return issues
}
export function normalizeExpertDraft(draft: ExpertDraft): ExpertDraft {
  return { ...draft, name: draft.name.trim(), description: draft.description.trim(), prompt: draft.prompt.trim(), opening: draft.opening.trim(), questions: expertQuestions(draft).join('\n'), capabilities: draft.capabilities.map(c => ({ ...c, actions: [...c.actions] })), inputs: [...draft.inputs], outputs: [...draft.outputs] }
}
