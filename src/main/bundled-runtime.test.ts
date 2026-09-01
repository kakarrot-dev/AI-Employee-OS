import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeBundledModel } from './bundled-runtime'

const roots: string[] = []
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })

describe('bundled runtime initialization', () => {
  it('recovers partial model installation without replacing verified files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-init-')); roots.push(root)
    const resources = join(root, 'resources/runtime')
    const cache = join(resources, 'local-memory/model-cache/models/files')
    mkdirSync(cache, { recursive: true })
    const model = Buffer.from('fixed-model')
    const expected = createHash('sha256').update(model).digest('hex')
    expect(expected).not.toBe('1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38')
    writeFileSync(join(cache, '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38'), model)
    expect(() => initializeBundledModel(resources, join(root, 'user-data'))).toThrow('bundled_embedding_hash_mismatch')
    expect(readFileSync(join(root, 'user-data/memory/model-cache/models/files/1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38'))).toEqual(model)
  })
})
