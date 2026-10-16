import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bundledRuntimePaths, initializeBundledModel } from './bundled-runtime'

const roots: string[] = []
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })

describe('bundled runtime initialization', () => {
  it('starts without DeepAgents assets and exposes only the memory and tool paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-sdk-assets-')); roots.push(root)
    const paths = ['local-memory/python/bin/python3', 'local-memory/memory_worker.py', 'local-memory/bin/memory-keychain-helper', 'local-memory/bin/provider-keychain-helper', 'local-memory/bin/image-text-extractor']
    for (const path of paths) {
      const target = join(root, 'runtime', path)
      mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, 'fixture')
    }
    const resolved = bundledRuntimePaths('/app', root, true)
    expect(Object.keys(resolved).sort()).toEqual(['memoryPython', 'memoryWorker', 'memoryKeychainHelper', 'providerKeychainHelper', 'imageTextExtractor'].sort())
    expect(Object.values(bundledRuntimePaths('/app', root, false)).some((path) => path.includes('deep-agents'))).toBe(false)
    rmSync(join(root, 'runtime/local-memory/memory_worker.py'))
    expect(() => bundledRuntimePaths('/app', root, true)).toThrow('bundled_runtime_missing:memory_worker.py')
  })

  it('rejects a corrupt source model before writing into the user model cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-init-')); roots.push(root)
    const resources = join(root, 'resources/runtime')
    const cache = join(resources, 'local-memory/model-cache/models/files')
    mkdirSync(cache, { recursive: true })
    const model = Buffer.from('fixed-model')
    const expected = createHash('sha256').update(model).digest('hex')
    expect(expected).not.toBe('1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38')
    writeFileSync(join(cache, 'model_optimized.onnx'), model)
    expect(() => initializeBundledModel(resources, join(root, 'user-data'))).toThrow('bundled_embedding_hash_mismatch')
    expect(existsSync(join(root, 'user-data/memory/model-cache'))).toBe(false)
    expect(existsSync(join(root, 'user-data/runtime/initialization.json'))).toBe(false)
  })
})
