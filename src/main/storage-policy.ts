import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIAGNOSTIC_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const DIAGNOSTIC_MAX_FILES = 20
const DIAGNOSTIC_MAX_BYTES = 20 * 1024 * 1024

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/(?:api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 1000)
}

export function maintainDiagnostics(userDataRoot: string, now = Date.now()): { kept: number; bytes: number } {
  const root = join(userDataRoot, 'diagnostics')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const entries = readdirSync(root).filter((name) => name.endsWith('.json')).map((name) => ({ path: join(root, name), stats: statSync(join(root, name)) })).sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)
  let bytes = 0
  let kept = 0
  for (const entry of entries) {
    const retain = now - entry.stats.mtimeMs <= DIAGNOSTIC_RETENTION_MS && kept < DIAGNOSTIC_MAX_FILES && bytes + entry.stats.size <= DIAGNOSTIC_MAX_BYTES
    if (!retain) rmSync(entry.path)
    else { kept += 1; bytes += entry.stats.size }
  }
  return { kept, bytes }
}

export function writeLocalDiagnostic(userDataRoot: string, source: string, error: unknown): string {
  maintainDiagnostics(userDataRoot)
  const root = join(userDataRoot, 'diagnostics')
  const id = randomUUID()
  const path = join(root, `${new Date().toISOString().replaceAll(':', '-')}-${id}.json`)
  const partial = `${path}.partial`
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  writeFileSync(partial, JSON.stringify({ schemaVersion: 1, id, occurredAt: new Date().toISOString(), source: redact(source), error: redact(message) }, null, 2) + '\n', { mode: 0o600 })
  renameSync(partial, path)
  maintainDiagnostics(userDataRoot)
  return path
}

export function storagePolicyStatus(userDataRoot: string): { diagnostics: { files: number; bytes: number; maxFiles: number; maxBytes: number; retentionDays: number }; modelCache: { bytes: number; softMaxBytes: number } } {
  const directoryBytes = (root: string): number => {
    if (!existsSync(root)) return 0
    return readdirSync(root, { withFileTypes: true }).reduce((sum, entry) => {
      const path = join(root, entry.name)
      return sum + (entry.isDirectory() ? directoryBytes(path) : entry.isFile() ? statSync(path).size : 0)
    }, 0)
  }
  const diagnostics = maintainDiagnostics(userDataRoot)
  return { diagnostics: { files: diagnostics.kept, bytes: diagnostics.bytes, maxFiles: DIAGNOSTIC_MAX_FILES, maxBytes: DIAGNOSTIC_MAX_BYTES, retentionDays: 14 }, modelCache: { bytes: directoryBytes(join(userDataRoot, 'memory/model-cache')), softMaxBytes: 512 * 1024 * 1024 } }
}
