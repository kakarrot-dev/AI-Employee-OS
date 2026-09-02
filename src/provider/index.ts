import { DeepSeekAdapter } from './deepseek-adapter'
import { MacOSKeychainCredentialReader } from './keychain'
import { MODEL_ALLOWLIST } from './models'
import { requireModel, type AllowedModelId, type ProviderId } from './models'
import { PoeAdapter } from './poe-adapter'
import { PROVIDER_PROTOCOL_VERSION, parseProviderCommand, type ProviderHealth, type ProviderMessage } from './protocol'

const parentPort = process.parentPort
if (!parentPort) throw new Error('provider_requires_parent_port')

const keychainHelperPath = process.argv.find((argument) => argument.startsWith('--keychain-helper='))?.slice('--keychain-helper='.length)
if (!keychainHelperPath) throw new Error('provider_keychain_helper_required')
const credentials = new MacOSKeychainCredentialReader(keychainHelperPath)
const deepseek = new DeepSeekAdapter(credentials)
const poe = new PoeAdapter(credentials)
const controllers = new Map<string, AbortController>()
const verification = new Map(MODEL_ALLOWLIST.map((model) => [`${model.provider}:${model.modelId}`, model.verification] as const))

async function health(): Promise<ProviderHealth> {
  const [deepseekConfigured, poeConfigured] = await Promise.all([credentials.exists('deepseek'), credentials.exists('poe')])
  return {
    state: deepseekConfigured || poeConfigured ? 'ready' : 'degraded',
    credentialStatus: { deepseek: deepseekConfigured ? 'configured' : 'missing', poe: poeConfigured ? 'configured' : 'missing' },
    models: MODEL_ALLOWLIST.map((model) => ({ ...model, verification: verification.get(`${model.provider}:${model.modelId}`) ?? 'unverified' })),
    checkedAt: new Date().toISOString()
  }
}

async function verifyModel(provider: ProviderId, modelId: AllowedModelId, requestId: string): Promise<void> {
  const model = requireModel(provider, modelId)
  const adapter = provider === 'deepseek' ? deepseek : poe
  const input = model.modality === 'text' ? '只回复 OK' : model.modality === 'image' ? '生成一张纯白色方形测试图。' : '生成一段最短时长的纯白色视频。'
  const controller = new AbortController()
  controllers.set(requestId, controller)
  let hasResult = false
  let completed = false
  try {
    for await (const event of adapter.execute({ requestId, provider, modelId, input, maxOutputTokens: 4, stream: false }, controller.signal)) {
      if (event.type === 'output_delta' && event.delta.trim()) hasResult = true
      if (event.type === 'media_result' && (event.content.trim() || event.attachments.length)) hasResult = true
      if (event.type === 'completed') completed = true
    }
  } finally {
    controllers.delete(requestId)
  }
  if (!hasResult || !completed) throw new Error('invalid_response')
  verification.set(`${provider}:${modelId}`, 'verified')
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
    if (command.type === 'credential.configure') {
      await credentials.write(command.payload.provider, command.payload.credential)
      for (const model of MODEL_ALLOWLIST) if (model.provider === command.payload.provider) verification.set(`${model.provider}:${model.modelId}`, 'unverified')
      send({ schemaVersion: PROVIDER_PROTOCOL_VERSION, type: 'provider.response', requestId, ok: true, result: await health() })
      return
    }
    if (command.type === 'model.verify') {
      await verifyModel(command.payload.provider, command.payload.modelId, requestId)
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
