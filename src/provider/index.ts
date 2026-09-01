import { DeepSeekAdapter } from './deepseek-adapter'
import { MacOSKeychainCredentialReader } from './keychain'
import { MODEL_ALLOWLIST } from './models'
import { PoeAdapter } from './poe-adapter'
import { PROVIDER_PROTOCOL_VERSION, parseProviderCommand, type ProviderHealth, type ProviderMessage } from './protocol'

const parentPort = process.parentPort
if (!parentPort) throw new Error('provider_requires_parent_port')

const credentials = new MacOSKeychainCredentialReader()
const deepseek = new DeepSeekAdapter(credentials)
const poe = new PoeAdapter(credentials)
const controllers = new Map<string, AbortController>()

async function health(): Promise<ProviderHealth> {
  const [deepseekConfigured, poeConfigured] = await Promise.all([credentials.exists('deepseek'), credentials.exists('poe')])
  return {
    state: deepseekConfigured || poeConfigured ? 'ready' : 'degraded',
    credentialStatus: { deepseek: deepseekConfigured ? 'configured' : 'missing', poe: poeConfigured ? 'configured' : 'missing' },
    models: MODEL_ALLOWLIST.map((model) => ({ ...model })),
    checkedAt: new Date().toISOString()
  }
}

function send(message: ProviderMessage): void {
  parentPort.postMessage(message)
}

parentPort.on('message', async (event) => {
  let requestId = 'unknown'
  try {
    const command = parseProviderCommand(event.data)
    requestId = command.requestId
    if (command.type === 'health') {
      send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.response', requestId, ok: true, result: await health() })
      return
    }
    if (command.type === 'cancel') {
      const controller = controllers.get(command.payload.providerRequestId)
      controller?.abort()
      send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.response', requestId, ok: true, result: { cancelled: Boolean(controller) } })
      return
    }

    const controller = new AbortController()
    controllers.set(requestId, controller)
    send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.response', requestId, ok: true, result: { accepted: true } })
    try {
      const adapter = command.payload.provider === 'deepseek' ? deepseek : poe
      for await (const providerEvent of adapter.execute(command.payload, controller.signal)) {
        send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.event', requestId, event: providerEvent })
      }
    } finally {
      controllers.delete(requestId)
    }
  } catch (error) {
    const failure = error as { code?: string; retryable?: boolean; httpStatus?: number }
    const code = error instanceof Error ? (error.name === 'AbortError' ? 'cancelled' : error.message.split(':')[0]) : failure.code ?? 'provider_error'
    send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.response', requestId, ok: false, error: { code, retryable: Boolean(failure.retryable), httpStatus: failure.httpStatus } })
  }
})

send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.ready', health: await health() })

process.once('SIGTERM', () => {
  for (const controller of controllers.values()) controller.abort()
  process.exit(0)
})
