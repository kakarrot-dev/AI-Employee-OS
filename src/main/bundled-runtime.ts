import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

export interface BundledRuntimePaths {
  deepAgentPython: string
  deepAgentWorker: string
  memoryPython: string
  memoryWorker: string
  memoryKeychainHelper: string
}

function sha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex') }

function filesBelow(root: string): string[] {
  const output: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && !path.includes(`${join(root, '.locks')}/`)) output.push(path)
    }
  }
  visit(root)
  return output.sort()
}

function copyFileRecoverably(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  if (existsSync(destination) && statSync(source).size === statSync(destination).size && sha256(source) === sha256(destination)) return
  const partial = `${destination}.partial`
  if (existsSync(partial)) rmSync(partial)
  writeFileSync(partial, readFileSync(source), { mode: statSync(source).mode & 0o777 })
  renameSync(partial, destination)
}

export function initializeBundledModel(resourceRoot: string, userDataRoot: string, onProgress: (completed: number, total: number) => void = () => undefined): { installed: boolean; fileCount: number; modelSha256?: string } {
  const sourceRoot = join(resourceRoot, 'local-memory', 'model-cache')
  if (!existsSync(sourceRoot)) return { installed: false, fileCount: 0 }
  const destinationRoot = join(userDataRoot, 'memory', 'model-cache')
  const files = filesBelow(sourceRoot)
  files.forEach((source, index) => {
    copyFileRecoverably(source, join(destinationRoot, relative(sourceRoot, source)))
    onProgress(index + 1, files.length)
  })
  const model = files.find((path) => basename(path) === '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38')
  if (!model || sha256(join(destinationRoot, relative(sourceRoot, model))) !== '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38') throw new Error('bundled_embedding_hash_mismatch')
  const manifestPath = join(userDataRoot, 'runtime', 'initialization.json')
  mkdirSync(dirname(manifestPath), { recursive: true, mode: 0o700 })
  const partial = `${manifestPath}.partial`
  writeFileSync(partial, JSON.stringify({ schemaVersion: 1, state: 'ready', model: 'BAAI/bge-small-zh-v1.5', modelSha256: '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38', fileCount: files.length, completedAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
  renameSync(partial, manifestPath)
  return { installed: true, fileCount: files.length, modelSha256: '1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38' }
}

export function bundledRuntimePaths(appPath: string, resourcesPath: string, packaged: boolean): BundledRuntimePaths {
  if (!packaged) return {
    deepAgentPython: join(appPath, 'spikes/deep-agents/.venv/bin/python'),
    deepAgentWorker: join(appPath, 'spikes/deep-agents/formal_worker.py'),
    memoryPython: join(appPath, 'spikes/local-memory/.venv/bin/python'),
    memoryWorker: join(appPath, 'spikes/local-memory/memory_worker.py'),
    memoryKeychainHelper: join(appPath, 'build/native/memory-keychain-helper')
  }
  const root = join(resourcesPath, 'runtime')
  const paths = {
    deepAgentPython: join(root, 'deep-agents/python/bin/python3'),
    deepAgentWorker: join(root, 'deep-agents/formal_worker.py'),
    memoryPython: join(root, 'local-memory/python/bin/python3'),
    memoryWorker: join(root, 'local-memory/memory_worker.py'),
    memoryKeychainHelper: join(root, 'local-memory/bin/memory-keychain-helper')
  }
  for (const path of Object.values(paths)) {
    if (!existsSync(path)) throw new Error(`bundled_runtime_missing:${basename(path)}`)
  }
  chmodSync(paths.deepAgentPython, 0o755)
  chmodSync(paths.memoryPython, 0o755)
  chmodSync(paths.memoryKeychainHelper, 0o755)
  return paths
}
