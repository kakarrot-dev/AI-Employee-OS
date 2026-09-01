import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryService } from './memory-service'

const directories: string[] = []

function setup(): { service: MemoryService; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-memory-test-')); directories.push(directory)
  const service = new MemoryService({ pythonPath: resolve('spikes/local-memory/.venv/bin/python'), scriptPath: resolve('spikes/local-memory/memory_worker.py'), databasePath: join(directory, 'memory.sqlite'), modelCachePath: join(directory, 'model-cache'), keychainHelperPath: resolve('build/native/memory-keychain-helper') })
  return { service, directory }
}

function diskContains(directory: string, marker: string): boolean {
  return readdirSync(directory).filter((name) => name.startsWith('memory.sqlite')).some((name) => readFileSync(join(directory, name)).includes(Buffer.from(marker)))
}

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe.skipIf(process.platform !== 'darwin')('MemoryService', () => {
  it('encrypts, scopes, versions, governs, queues, and permanently deletes local memory', async () => {
    const { service, directory } = setup()
    expect(service.status()).toMatchObject({ embedding: 'bm25_only', memoryCount: 0 })
    const marker = 'MEMORY_DISK_MARKER_PHASE7'
    const first = service.add({ id: 'release-rule', scopeType: 'employee', scopeId: 'employee-a', category: 'rule', content: `${marker} 发布前必须完成完整测试。`, tags: ['发布', '验证'], sourceRefs: ['task:release'] })
    service.add({ id: 'other-scope', scopeType: 'employee', scopeId: 'employee-b', category: 'rule', content: '报销需要纸质发票。', tags: ['报销'], sourceRefs: ['task:expense'] })
    expect(first).toMatchObject({ version: 1, indexVersion: 'bm25-only', status: 'active' })
    expect(diskContains(directory, marker)).toBe(false)
    const recalled = service.search({ query: '发布完整测试', allowedScopes: [{ type: 'employee', id: 'employee-a' }], categories: ['rule'], tokenBudget: 128 })
    expect(recalled.map((value) => value.id)).toEqual(['release-rule'])
    expect(recalled.some((value) => value.id === 'other-scope')).toBe(false)

    expect(service.update(first.id, { content: `${marker} 发布前必须完成完整测试并由用户确认。` }).version).toBe(2)
    expect(service.disable(first.id).status).toBe('disabled')
    expect(service.search({ query: '发布测试', allowedScopes: [{ type: 'employee', id: 'employee-a' }] })).toHaveLength(0)
    expect(service.restore(first.id).status).toBe('active')

    const conflict = service.add({ id: 'release-rule-conflict', scopeType: 'employee', scopeId: 'employee-a', category: 'rule', content: '发布可以跳过测试。', tags: ['发布'], sourceRefs: ['conversation:c1'], conflictWith: first.id })
    expect(conflict.status).toBe('conflicted')
    expect(service.get(first.id).status).toBe('conflicted')
    expect(service.resolveConflict(first.id).status).toBe('active')
    expect(service.get(conflict.id).status).toBe('disabled')

    const queued = service.enqueue({ sourceType: 'conversation', sourceRef: 'conversation:c1:message:m1', scopeType: 'global', scopeId: 'global:local-owner', content: '用户偏好短回答。' })
    await service.enqueueAsync({ sourceType: 'task', sourceRef: `memory:${first.id}`, scopeType: 'employee', scopeId: 'employee-a', content: '与待删除记忆显式关联的候选。' })
    expect(queued.state).toBe('pending_authorization')
    expect(service.queue()[0]).not.toHaveProperty('content')
    expect(() => service.enqueue({ sourceType: 'conversation', sourceRef: 'bad', scopeType: 'global', scopeId: 'global:local-owner', content: 'api_key=do-not-store-this-value' })).toThrow('invalid_memory_queue_item')

    expect(service.permanentlyDelete(first.id)).toEqual({ deleted: true, memoryId: first.id, externalBackupsExcluded: true })
    expect(() => service.get(first.id)).toThrow('memory_not_found')
    expect(service.queue().map((item) => item.sourceRef)).toEqual(['conversation:c1:message:m1'])
    expect(diskContains(directory, marker)).toBe(false)
  }, 30_000)

  it.skipIf(process.env.LIVE_LOCAL_MEMORY !== '1')('uses the fixed local 512-dimension model for semantic recall', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-memory-live-')); directories.push(directory)
    const paths = { pythonPath: resolve('spikes/local-memory/.venv/bin/python'), scriptPath: resolve('spikes/local-memory/memory_worker.py'), databasePath: join(directory, 'memory.sqlite'), keychainHelperPath: resolve('build/native/memory-keychain-helper') }
    const degraded = new MemoryService({ ...paths, modelCachePath: join(directory, 'empty-model-cache') })
    degraded.add({ id: 'semantic-rule', scopeType: 'employee', scopeId: 'employee-a', category: 'rule', content: '所有发布操作必须先运行完整测试，然后由用户确认。', tags: ['发布'], sourceRefs: ['task:release'] })
    expect(degraded.get('semantic-rule').indexVersion).toBe('bm25-only')
    const service = new MemoryService({ ...paths, modelCachePath: resolve('spikes/local-memory/.model-cache') })
    expect(service.status()).toMatchObject({ embedding: 'hybrid', dimensions: 512, modelSha256: '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38' })
    expect(service.migrateEmbeddings()).toEqual({ migrated: 1 })
    const results = service.search({ query: '上线之前需要完成哪些检查', allowedScopes: [{ type: 'employee', id: 'employee-a' }], categories: ['rule'], tokenBudget: 128 })
    expect(results[0]).toMatchObject({ id: 'semantic-rule', indexVersion: '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38' })
    expect(results[0].vectorScore).toBeGreaterThan(0)
    service.add({ id: 'expense-fact', scopeType: 'employee', scopeId: 'employee-a', category: 'fact', content: '差旅报销必须提交交通票据和住宿发票。', tags: ['报销'], sourceRefs: ['task:expense'] })
    service.add({ id: 'writing-preference', scopeType: 'employee', scopeId: 'employee-a', category: 'preference', content: '用户偏好简洁、中文优先并附带可核验证据的表达。', tags: ['写作'], sourceRefs: ['conversation:writing'] })
    service.add({ id: 'security-rule', scopeType: 'employee', scopeId: 'employee-a', category: 'rule', content: '机密凭据不得写入日志、记忆或模型上下文。', tags: ['安全'], sourceRefs: ['task:security'] })
    const cases = [
      { query: '上线前要做什么检查', category: 'rule' as const, expected: 'semantic-rule' },
      { query: '差旅费用需要哪些材料', category: 'fact' as const, expected: 'expense-fact' },
      { query: '用户喜欢怎样的写作表达', category: 'preference' as const, expected: 'writing-preference' },
      { query: '如何处理机密凭证', category: 'rule' as const, expected: 'security-rule' }
    ]
    const latencies: number[] = []
    for (const value of cases) {
      const startedAt = performance.now()
      const recalled = service.search({ query: value.query, allowedScopes: [{ type: 'employee', id: 'employee-a' }], categories: [value.category], limit: 2, tokenBudget: 128 })
      latencies.push(performance.now() - startedAt)
      expect(recalled[0]?.id).toBe(value.expected)
    }
    expect([...latencies].sort((left, right) => left - right).at(-1)).toBeLessThan(3_000)
  }, 30_000)
})
