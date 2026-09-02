import { describe, expect, it } from 'vitest'
import type { BudgetLedgerEntry } from './domain'
import { summarizeUsage } from './usage-service'

describe('usage summary', () => {
  it('aggregates actual provider usage by model without inventing an amount', () => {
    const entries: BudgetLedgerEntry[] = [
      { schemaVersion: 1, id: 'usage-1', createdAt: '2026-09-02T01:00:00Z', runId: 'run-1', requestId: 'request-1', provider: 'deepseek', modelId: 'deepseek-v4-pro', inputTokens: 120, outputTokens: 30, amountUsdMicros: 0, source: 'provider_actual' },
      { schemaVersion: 1, id: 'usage-2', createdAt: '2026-09-02T02:00:00Z', runId: 'run-2', requestId: 'request-2', provider: 'deepseek', modelId: 'deepseek-v4-pro', inputTokens: 80, outputTokens: 20, amountUsdMicros: 0, source: 'provider_actual' },
      { schemaVersion: 1, id: 'usage-3', createdAt: '2026-09-02T03:00:00Z', runId: 'run-3', requestId: 'request-3', provider: 'poe', modelId: 'claude-sonnet-4.6', inputTokens: 40, outputTokens: 10, amountUsdMicros: 0, source: 'provider_actual' }
    ]

    expect(summarizeUsage(entries, '2026-09-02T04:00:00Z')).toEqual({
      requestCount: 3,
      inputTokens: 240,
      outputTokens: 60,
      totalTokens: 300,
      amountUsdMicros: null,
      checkedAt: '2026-09-02T04:00:00Z',
      models: [
        { provider: 'deepseek', modelId: 'deepseek-v4-pro', requestCount: 2, inputTokens: 200, outputTokens: 50, totalTokens: 250 },
        { provider: 'poe', modelId: 'claude-sonnet-4.6', requestCount: 1, inputTokens: 40, outputTokens: 10, totalTokens: 50 }
      ]
    })
  })
})
