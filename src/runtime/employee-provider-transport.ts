import type { ProviderEvent, ProviderRequest } from '../provider/contract'

interface PendingRequest {
  events: ProviderEvent[]
  onEvent: (event: ProviderEvent) => void
  resolve: (events: ProviderEvent[]) => void
  reject: (error: Error) => void
  detachAbort: () => void
}

/** Uses the existing Main -> Provider process boundary; this process never receives credentials. */
export class EmployeeProviderTransport {
  private readonly pending = new Map<string, PendingRequest>()

  constructor(private readonly send: (request: ProviderRequest) => void, private readonly cancel: (requestId: string) => void) {}

  execute(request: ProviderRequest, onEvent: (event: ProviderEvent) => void, signal?: AbortSignal): Promise<ProviderEvent[]> {
    if (signal?.aborted) return Promise.reject(new Error('cancelled'))
    if (this.pending.has(request.requestId)) return Promise.reject(new Error('duplicate_provider_request'))
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.cancel(request.requestId)
        this.fail(request.requestId, 'cancelled')
      }
      this.pending.set(request.requestId, { events: [], onEvent, resolve, reject, detachAbort: () => signal?.removeEventListener('abort', abort) })
      signal?.addEventListener('abort', abort, { once: true })
      try { this.send(request) } catch { this.fail(request.requestId, 'provider_transport_failed') }
    })
  }

  accept(requestId: string, event: ProviderEvent): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    try {
      if (event.requestId !== requestId) throw new Error('provider_request_mismatch')
      pending.events.push(event)
      pending.onEvent(event)
      if (event.type === 'completed') {
        this.pending.delete(requestId)
        pending.detachAbort()
        pending.resolve(pending.events)
      }
    } catch (error) {
      this.cancel(requestId)
      this.fail(requestId, error instanceof Error ? error.message : 'employee_provider_event_failed')
    }
    return true
  }

  fail(requestId: string, code: string): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    this.pending.delete(requestId)
    pending.detachAbort()
    pending.reject(new Error(code))
    return true
  }
}
