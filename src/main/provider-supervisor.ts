import { randomUUID } from 'node:crypto'
import { utilityProcess, type UtilityProcess } from 'electron'
import { PROVIDER_PROTOCOL_VERSION, type ProviderCommand, type ProviderHealth, type ProviderMessage } from '../provider/protocol'
import type { ProviderEvent, ProviderRequest } from '../provider/contract'

interface PendingHealth {
  resolve: (health: ProviderHealth) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface PendingExecution {
  onEvent: (event: ProviderEvent) => Promise<void>
  chain: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export type ProviderSupervisorEvent =
  | { type: 'ready'; health: ProviderHealth }
  | { type: 'stopped'; reason: string }

export class ProviderSupervisor {
  private child: UtilityProcess | null = null
  private readonly pending = new Map<string, PendingHealth>()
  private readonly executions = new Map<string, PendingExecution>()
  private readyPromise: Promise<ProviderHealth> | null = null

  constructor(private readonly providerEntry: string, private readonly onEvent: (event: ProviderSupervisorEvent) => void) {}

  start(): Promise<ProviderHealth> {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = new Promise((resolve, reject) => {
      const child = utilityProcess.fork(this.providerEntry, [], { serviceName: 'com.kakarrot.ai-employee-os.provider', stdio: 'pipe' })
      this.child = child
      const timer = setTimeout(() => reject(new Error('provider_start_timeout')), 5000)
      const onMessage = (message: unknown): void => {
        const event = message as Partial<ProviderMessage>
        if (event.schemaVersion === PROVIDER_PROTOCOL_VERSION && event.type === 'provider.ready') {
          clearTimeout(timer)
          child.removeListener('message', onMessage)
          child.on('message', (nextMessage) => this.handleMessage(nextMessage))
          const health = (event as Extract<ProviderMessage, { type: 'provider.ready' }>).health
          this.onEvent({ type: 'ready', health })
          resolve(health)
        }
      }
      child.on('message', onMessage)
      child.on('exit', (code) => this.handleExit(child, code))
      child.stderr?.on('data', () => undefined)
    })
    return this.readyPromise
  }

  health(): Promise<ProviderHealth> {
    const requestId = randomUUID()
    return this.request<ProviderHealth>({ schemaVersion: PROVIDER_PROTOCOL_VERSION, requestId, type: 'health', payload: {} })
  }

  cancel(providerRequestId: string): Promise<{ cancelled: boolean }> {
    const requestId = randomUUID()
    return this.request<{ cancelled: boolean }>({ schemaVersion: PROVIDER_PROTOCOL_VERSION, requestId, type: 'cancel', payload: { providerRequestId } })
  }

  execute(request: ProviderRequest, onEvent: (event: ProviderEvent) => Promise<void>): Promise<void> {
    if (!this.child) return Promise.reject(new Error('provider_not_started'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.executions.delete(request.requestId)
        reject(new Error('provider_execution_timeout'))
      }, 120_000)
      this.executions.set(request.requestId, { onEvent, chain: Promise.resolve(), resolve, reject, timer })
      this.child!.postMessage({ schemaVersion: PROVIDER_PROTOCOL_VERSION, requestId: request.requestId, type: 'execute', payload: request } satisfies ProviderCommand)
    })
  }

  stop(): void {
    const child = this.child
    this.child = null
    this.readyPromise = null
    child?.kill()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('provider_stopped'))
    }
    this.pending.clear()
    for (const execution of this.executions.values()) {
      clearTimeout(execution.timer)
      execution.reject(new Error('provider_stopped'))
    }
    this.executions.clear()
  }

  private request<TResult>(command: ProviderCommand): Promise<TResult> {
    if (!this.child) return Promise.reject(new Error('provider_not_started'))
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(command.requestId); reject(new Error('provider_request_timeout')) }, 3000)
      this.pending.set(command.requestId, { resolve: resolve as (health: ProviderHealth) => void, reject, timer })
      this.child!.postMessage(command)
    })
  }

  private handleMessage(message: unknown): void {
    const providerEvent = message as Partial<Extract<ProviderMessage, { type: 'provider.event' }>>
    if (providerEvent.schemaVersion === PROVIDER_PROTOCOL_VERSION && providerEvent.type === 'provider.event' && typeof providerEvent.requestId === 'string' && providerEvent.event) {
      const execution = this.executions.get(providerEvent.requestId)
      if (!execution) return
      execution.chain = execution.chain.then(() => execution.onEvent(providerEvent.event!))
      void execution.chain.catch(() => undefined)
      if (providerEvent.event.type === 'completed') {
        void execution.chain.then(() => {
          clearTimeout(execution.timer)
          this.executions.delete(providerEvent.requestId!)
          execution.resolve()
        }).catch((error) => {
          clearTimeout(execution.timer)
          this.executions.delete(providerEvent.requestId!)
          execution.reject(error instanceof Error ? error : new Error('provider_event_rejected'))
        })
      }
      return
    }
    const response = message as Partial<Extract<ProviderMessage, { type: 'provider.response' }>>
    if (response.schemaVersion !== PROVIDER_PROTOCOL_VERSION || response.type !== 'provider.response' || typeof response.requestId !== 'string') return
    const execution = this.executions.get(response.requestId)
    if (execution) {
      if (!response.ok) {
        clearTimeout(execution.timer)
        this.executions.delete(response.requestId)
        execution.reject(new Error((response as Extract<ProviderMessage, { type: 'provider.response'; ok: false }>).error.code))
      }
      return
    }
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(response.requestId)
    if (response.ok) pending.resolve(response.result as ProviderHealth)
    else pending.reject(new Error((response as Extract<ProviderMessage, { type: 'provider.response'; ok: false }>).error.code))
  }

  private handleExit(child: UtilityProcess, code: number | null): void {
    if (this.child !== child) return
    this.child = null
    this.readyPromise = null
    this.onEvent({ type: 'stopped', reason: `provider_exit:${code ?? 'signal'}` })
    for (const execution of this.executions.values()) {
      clearTimeout(execution.timer)
      execution.reject(new Error(`provider_exit:${code ?? 'signal'}`))
    }
    this.executions.clear()
  }
}
