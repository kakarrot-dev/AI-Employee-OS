export type ProviderId = 'deepseek' | 'poe'
export type ModelModality = 'text' | 'image' | 'video'

export interface ModelDefinition {
  provider: ProviderId
  modelId: string
  modality: ModelModality
  endpoint: '/responses' | '/chat/completions'
  streaming: boolean
  tools: boolean
  structuredOutput: boolean
  verification: 'verified' | 'unverified'
}

export const MODEL_ALLOWLIST = [
  { provider: 'deepseek', modelId: 'deepseek-v4-pro', modality: 'text', endpoint: '/responses', streaming: true, tools: true, structuredOutput: true, verification: 'verified' },
  { provider: 'poe', modelId: 'claude-sonnet-4.6', modality: 'text', endpoint: '/responses', streaming: true, tools: true, structuredOutput: true, verification: 'unverified' },
  { provider: 'poe', modelId: 'gpt-image-2', modality: 'image', endpoint: '/chat/completions', streaming: false, tools: false, structuredOutput: false, verification: 'unverified' },
  { provider: 'poe', modelId: 'seedance-2.0', modality: 'video', endpoint: '/chat/completions', streaming: false, tools: false, structuredOutput: false, verification: 'unverified' }
] as const satisfies readonly ModelDefinition[]

export type AllowedModelId = typeof MODEL_ALLOWLIST[number]['modelId']

export function requireModel(provider: ProviderId, modelId: string): ModelDefinition {
  const model = MODEL_ALLOWLIST.find((candidate) => candidate.provider === provider && candidate.modelId === modelId)
  if (!model) throw new Error('model_not_allowed')
  return model
}
