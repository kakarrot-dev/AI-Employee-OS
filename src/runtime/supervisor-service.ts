import { DEFAULT_SUPERVISOR_CONFIG, LEGACY_SUPERVISOR_PROMPT, normalizeSupervisorConfig, PROFESSIONAL_SUPERVISOR_PROMPT, SUPERVISOR_ID, validateSupervisorConfig, type SupervisorConfigInput, type SupervisorConfigView } from '../shared/supervisor-contract'
import type { SupervisorConfiguration } from './domain'
import { RuntimeKernel } from './kernel'

export class SupervisorService {
  constructor(private readonly kernel: RuntimeKernel) {}

  seed(): SupervisorConfigView {
    const current = this.kernel.store.get<SupervisorConfiguration>('SupervisorConfiguration', SUPERVISOR_ID)
    if (current) {
      if (current.systemPrompt === LEGACY_SUPERVISOR_PROMPT) {
        const upgraded: SupervisorConfiguration = { ...current, systemPrompt: PROFESSIONAL_SUPERVISOR_PROMPT, updatedAt: new Date().toISOString() }
        this.kernel.save({ entityType: 'SupervisorConfiguration', entity: upgraded, immutable: false }, 'supervisor_configuration.prompt_upgraded', { previousPrompt: 'legacy_default', promptVersion: 2 })
        return upgraded
      }
      return current
    }
    const now = new Date().toISOString()
    const configuration: SupervisorConfiguration = { schemaVersion: 1, id: SUPERVISOR_ID, createdAt: now, updatedAt: now, ...DEFAULT_SUPERVISOR_CONFIG, memoryScopes: [...DEFAULT_SUPERVISOR_CONFIG.memoryScopes] }
    this.kernel.save({ entityType: 'SupervisorConfiguration', entity: configuration, immutable: false }, 'supervisor_configuration.seeded', { modelId: configuration.modelId, memoryScopes: configuration.memoryScopes })
    return configuration
  }

  get(): SupervisorConfigView {
    return this.kernel.store.get<SupervisorConfiguration>('SupervisorConfiguration', SUPERVISOR_ID) ?? this.seed()
  }

  update(input: SupervisorConfigInput): SupervisorConfigView {
    const issue = validateSupervisorConfig(input)[0]
    if (issue) throw new Error(issue.code)
    const current = this.get()
    const normalized = normalizeSupervisorConfig(input)
    const next: SupervisorConfiguration = { ...current, ...normalized, memoryScopes: [...normalized.memoryScopes], updatedAt: new Date().toISOString() }
    this.kernel.save({ entityType: 'SupervisorConfiguration', entity: next, immutable: false }, 'supervisor_configuration.updated', { modelId: next.modelId, memoryScopes: next.memoryScopes, avatarUpdated: next.avatarDataUrl !== current.avatarDataUrl })
    return next
  }
}
