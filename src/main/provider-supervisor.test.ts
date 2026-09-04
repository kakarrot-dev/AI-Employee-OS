import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderSupervisor } from './provider-supervisor'

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }))

function setup() {
  const child = { postMessage: vi.fn(), kill: vi.fn() }
  const supervisor = new ProviderSupervisor('/provider.js', '/keychain-helper', vi.fn())
  ;(supervisor as unknown as { child: typeof child }).child = child
  return { child, supervisor }
}

describe('ProviderSupervisor execution timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'))
  })

  afterEach(() => vi.useRealTimers())

  it('treats provider events as activity and does not cut off an active stream', async () => {
    const { supervisor } = setup()
    const requestId = 'active-stream'
    const promise = supervisor.execute({ requestId, provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'work', maxOutputTokens: 4096, stream: true, executionTimeouts: { firstEventMs: 30_000, idleMs: 120_000, deadlineAt: '2026-09-03T00:10:00.000Z' } }, vi.fn().mockResolvedValue(undefined))

    await vi.advanceTimersByTimeAsync(29_000)
    ;(supervisor as any).handleMessage({ schemaVersion: 1, type: 'provider.event', requestId, event: { type: 'output_delta', requestId, delta: 'A' } })
    await vi.advanceTimersByTimeAsync(119_000)
    expect((supervisor as any).executions.has(requestId)).toBe(true)
    ;(supervisor as any).handleMessage({ schemaVersion: 1, type: 'provider.event', requestId, event: { type: 'output_delta', requestId, delta: 'B' } })
    await vi.advanceTimersByTimeAsync(119_000)
    expect((supervisor as any).executions.has(requestId)).toBe(true)
    ;(supervisor as any).handleMessage({ schemaVersion: 1, type: 'provider.event', requestId, event: { type: 'completed', requestId, providerRequestId: 'provider-1' } })

    await expect(promise).resolves.toBeUndefined()
  })

  it('keeps the absolute run deadline even while the provider remains active', async () => {
    const { child, supervisor } = setup()
    const requestId = 'run-deadline'
    const promise = supervisor.execute({ requestId, provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'work', maxOutputTokens: 4096, stream: true, executionTimeouts: { firstEventMs: 30_000, idleMs: 120_000, deadlineAt: '2026-09-03T00:04:10.000Z' } }, vi.fn().mockResolvedValue(undefined))
    const rejection = expect(promise).rejects.toThrow('provider_execution_timeout')

    for (let elapsed = 20_000; elapsed < 240_000; elapsed += 20_000) {
      await vi.advanceTimersByTimeAsync(20_000)
      ;(supervisor as any).handleMessage({ schemaVersion: 1, type: 'provider.event', requestId, event: { type: 'output_delta', requestId, delta: '.' } })
    }
    await vi.advanceTimersByTimeAsync(30_000)

    await rejection
    expect(child.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel', payload: { providerRequestId: requestId } }))
  })

  it('does not apply the idle timeout while completed events drain through a slow persistence chain', async () => {
    const { supervisor } = setup()
    const requestId = 'slow-completion-drain'
    const onEvent = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 250)) })
    const promise = supervisor.execute({ requestId, provider: 'deepseek', modelId: 'deepseek-v4-pro', input: 'work', maxOutputTokens: 4096, stream: true, executionTimeouts: { firstEventMs: 30_000, idleMs: 100, deadlineAt: '2026-09-03T00:10:00.000Z' } }, onEvent)

    ;(supervisor as any).handleMessage({ schemaVersion: 1, type: 'provider.event', requestId, event: { type: 'completed', requestId, providerRequestId: 'provider-complete' } })
    await vi.advanceTimersByTimeAsync(249)
    expect((supervisor as any).executions.has(requestId)).toBe(true)
    await vi.advanceTimersByTimeAsync(1)

    await expect(promise).resolves.toBeUndefined()
  })
})
