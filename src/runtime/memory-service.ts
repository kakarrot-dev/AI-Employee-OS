import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export type MemoryScopeType = 'global' | 'employee' | 'task'
export type MemoryCategory = 'preference' | 'fact' | 'rule' | 'knowledge' | 'experience' | 'summary'
export type MemoryStatus = 'active' | 'pending_verification' | 'conflicted' | 'disabled'

export interface MemoryView {
  id: string
  scopeType: MemoryScopeType
  scopeId: string
  category: MemoryCategory
  version: number
  content: string
  tags: string[]
  sourceRefs: string[]
  indexVersion: string
  status: MemoryStatus
  conflictGroupId?: string
  createdAt: string
  updatedAt: string
}

export interface MemoryHealth {
  state: 'ready'
  model: string
  dimensions: number
  modelSha256: string
  embedding: 'hybrid' | 'bm25_only'
  memoryCount: number
  pendingQueueCount: number
  checkedAt: string
}

export interface MemoryQueueItem { id: string; sourceType: 'conversation' | 'task'; sourceRef: string; scopeType: MemoryScopeType; scopeId: string; state: 'pending_authorization'; content: string; createdAt: string }
export interface MemorySearchResult extends MemoryView { score: number; vectorScore: number; lexicalMatched: boolean; reason: string; estimatedTokens: number }

export class MemoryService {
  private readonly pythonPath: string
  private readonly scriptPath: string
  private readonly databasePath: string
  private readonly modelCachePath: string
  private readonly keychainHelperPath: string

  constructor(paths: { pythonPath: string; scriptPath: string; databasePath: string; modelCachePath: string; keychainHelperPath: string }) {
    this.pythonPath = resolve(paths.pythonPath); this.scriptPath = resolve(paths.scriptPath); this.databasePath = resolve(paths.databasePath); this.modelCachePath = resolve(paths.modelCachePath); this.keychainHelperPath = resolve(paths.keychainHelperPath)
  }

  status(): MemoryHealth { return this.call('status', {}) as MemoryHealth }
  downloadModel(): { state: 'ready'; model: string; dimensions: number; modelSha256: string } { return this.call('download', {}, 180_000, true) as { state: 'ready'; model: string; dimensions: number; modelSha256: string } }
  list(filters: Partial<Pick<MemoryView, 'scopeType' | 'scopeId' | 'category' | 'status'>> = {}): MemoryView[] { return this.call('list', filters) as MemoryView[] }
  get(id: string): MemoryView { return this.call('get', { id }) as MemoryView }
  add(input: Pick<MemoryView, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags' | 'sourceRefs'> & { id?: string; status?: MemoryStatus; conflictWith?: string }): MemoryView { return this.call('add', input, 30_000) as MemoryView }
  update(id: string, changes: Partial<Pick<MemoryView, 'scopeType' | 'scopeId' | 'category' | 'content' | 'tags'>>): MemoryView { return this.call('update', { id, changes }, 30_000) as MemoryView }
  disable(id: string): MemoryView { return this.call('disable', { id }) as MemoryView }
  restore(id: string): MemoryView { return this.call('restore', { id }) as MemoryView }
  resolveConflict(chosenId: string): MemoryView { return this.call('resolve_conflict', { chosenId }) as MemoryView }
  search(input: { query: string; allowedScopes: Array<{ type: MemoryScopeType; id: string }>; categories?: MemoryCategory[]; tags?: string[]; limit?: number; tokenBudget?: number }): MemorySearchResult[] { return this.call('search', input, 30_000) as MemorySearchResult[] }
  enqueue(input: { sourceType: 'conversation' | 'task'; sourceRef: string; scopeType: MemoryScopeType; scopeId: string; content: string }): MemoryQueueItem { return this.call('enqueue', input) as MemoryQueueItem }
  enqueueAsync(input: { sourceType: 'conversation' | 'task'; sourceRef: string; scopeType: MemoryScopeType; scopeId: string; content: string }): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.pythonPath, [this.scriptPath, 'command', this.databasePath, this.modelCachePath, this.keychainHelperPath, 'enqueue'], { env: this.workerEnvironment(false), stdio: ['pipe', 'ignore', 'ignore'] })
      const timer = setTimeout(() => { child.kill(); reject(new Error('memory_worker_timeout')) }, 15_000)
      child.once('error', () => { clearTimeout(timer); reject(new Error('memory_worker_failed')) })
      child.once('close', (code) => { clearTimeout(timer); if (code === 0) resolvePromise(); else reject(new Error('memory_worker_failed')) })
      child.stdin.end(JSON.stringify(input))
    })
  }
  queue(): MemoryQueueItem[] { return this.call('queue_list', {}) as MemoryQueueItem[] }
  acceptQueueItem(id: string): MemoryView { return this.call('queue_accept', { id }, 30_000) as MemoryView }
  dismissQueueItem(id: string): { dismissed: true; queueId: string } { return this.call('queue_dismiss', { id }) as { dismissed: true; queueId: string } }
  migrateEmbeddings(): { migrated: number } { return this.call('migrate_embeddings', {}, 120_000) as { migrated: number } }
  permanentlyDelete(id: string): { deleted: true; memoryId: string; externalBackupsExcluded: true } { return this.call('delete', { id }, 30_000) as { deleted: true; memoryId: string; externalBackupsExcluded: true } }

  private call(operation: string, payload: unknown, timeout = 15_000, allowNetwork = false): unknown {
    const child = spawnSync(this.pythonPath, [this.scriptPath, 'command', this.databasePath, this.modelCachePath, this.keychainHelperPath, operation], {
      input: JSON.stringify(payload), encoding: 'utf8', timeout, maxBuffer: 4_000_000,
      env: this.workerEnvironment(allowNetwork)
    })
    if (child.error || child.status !== 0) {
      try { const parsed = JSON.parse(child.stderr.trim()) as { error?: string }; throw new Error(parsed.error ?? 'memory_worker_failed') } catch (error) { if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error; throw new Error('memory_worker_failed') }
    }
    try { return JSON.parse(child.stdout) } catch { throw new Error('invalid_memory_worker_response') }
  }

  private workerEnvironment(allowNetwork: boolean): NodeJS.ProcessEnv {
    const networkEnvironment = Object.fromEntries(
      ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE']
        .map((name) => [name, process.env[name]])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
    return { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', ...(allowNetwork ? networkEnvironment : { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }) }
  }
}
