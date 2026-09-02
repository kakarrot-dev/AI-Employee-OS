export interface UsageModelSummaryView {
  provider: 'deepseek' | 'poe'
  modelId: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface UsageSummaryView {
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  amountUsdMicros: number | null
  checkedAt: string
  models: UsageModelSummaryView[]
}
