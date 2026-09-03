export interface ResourceCatalogView {
  skills: Array<{ id: string; createdAt: string; name: string; description: string; version: number; steps: string[]; toolVersionIds: string[]; instructionsMarkdown: string; instructionDigest: string; available: boolean; reason?: string }>
  tools: Array<{ id: string; createdAt: string; name: string; description: string; version: number; sideEffect: 'none' | 'external_read' | 'external_write'; risk: 'low' | 'medium' | 'high'; networkOrigins: string[]; available: boolean; health: 'available' | 'degraded' | 'unavailable'; credentialStatus: 'not_required' | 'configured' | 'missing'; reason?: string }>
  mcps: Array<{ id: string; createdAt: string; name: string; description: string; version: number; toolVersionIds: string[]; available: boolean; health: 'available' | 'degraded' | 'unavailable'; credentialStatus: 'not_required' | 'configured' | 'missing'; reason?: string }>
  healthChecks: Array<{ id: string; adapterVersionId: string; status: 'available' | 'degraded' | 'unavailable'; credentialStatus: 'not_required' | 'configured' | 'missing'; latencyMs: number; checkedAt: string; failureCode?: string }>
}
