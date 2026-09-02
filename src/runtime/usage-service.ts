import type { UsageModelSummaryView, UsageSummaryView } from '../shared/usage-contract'
import type { BudgetLedgerEntry } from './domain'

export function summarizeUsage(entries: BudgetLedgerEntry[], checkedAt = new Date().toISOString()): UsageSummaryView {
  const models = new Map<string, UsageModelSummaryView>()
  let inputTokens = 0
  let outputTokens = 0
  let amountUsdMicros = 0
  let hasPricedUsage = false

  for (const entry of entries) {
    inputTokens += entry.inputTokens
    outputTokens += entry.outputTokens
    if (entry.amountUsdMicros > 0) {
      amountUsdMicros += entry.amountUsdMicros
      hasPricedUsage = true
    }
    const key = `${entry.provider}:${entry.modelId}`
    const current = models.get(key) ?? { provider: entry.provider, modelId: entry.modelId, requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    current.requestCount += 1
    current.inputTokens += entry.inputTokens
    current.outputTokens += entry.outputTokens
    current.totalTokens += entry.inputTokens + entry.outputTokens
    models.set(key, current)
  }

  return {
    requestCount: entries.length,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    amountUsdMicros: hasPricedUsage ? amountUsdMicros : null,
    checkedAt,
    models: [...models.values()].sort((left, right) => right.totalTokens - left.totalTokens || left.modelId.localeCompare(right.modelId))
  }
}
