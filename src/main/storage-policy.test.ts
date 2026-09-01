import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { maintainDiagnostics, writeLocalDiagnostic } from './storage-policy'

const roots: string[] = []
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })

describe('local diagnostics policy', () => {
  it('redacts secrets and removes expired diagnostics', () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-diagnostics-')); roots.push(root)
    const path = writeLocalDiagnostic(root, 'provider', new Error('Authorization: Bearer secret-token-value'))
    expect(readFileSync(path, 'utf8')).not.toContain('secret-token-value')
    const old = join(root, 'diagnostics/old.json'); writeFileSync(old, '{}'); utimesSync(old, new Date(0), new Date(0))
    expect(maintainDiagnostics(root).kept).toBe(1)
  })

  it('keeps at most twenty recent files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-diagnostics-')); roots.push(root)
    mkdirSync(join(root, 'diagnostics'), { recursive: true })
    for (let index = 0; index < 25; index += 1) writeFileSync(join(root, 'diagnostics', `${index}.json`), '{}')
    expect(maintainDiagnostics(root).kept).toBe(20)
  })
})
