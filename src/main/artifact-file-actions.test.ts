import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveArtifactFilePath } from './artifact-file-actions'

function fixture(): { root: string; exports: string; authorized: string; outside: string } {
  const root = mkdtempSync(join(tmpdir(), 'ai-employee-artifact-'))
  const exports = join(root, 'exports')
  const authorized = join(root, 'authorized')
  const outside = join(root, 'outside')
  for (const directory of [exports, authorized, outside]) mkdirSync(directory)
  return { root, exports, authorized, outside }
}

describe('artifact file actions', () => {
  it('resolves Runtime exports and authorized absolute documents', () => {
    const paths = fixture()
    const exported = join(paths.exports, 'report.md')
    const document = join(paths.authorized, 'brief.txt')
    writeFileSync(exported, 'report')
    writeFileSync(document, 'brief')
    expect(resolveArtifactFilePath({ artifactPath: 'report.md', exportDirectory: paths.exports, authorizedDirectories: [] })).toBe(realpathSync(exported))
    expect(resolveArtifactFilePath({ artifactPath: document, exportDirectory: paths.exports, authorizedDirectories: [paths.authorized] })).toBe(realpathSync(document))
  })

  it('rejects traversal, unauthorized files and symlink escapes', () => {
    const paths = fixture()
    const outsideFile = join(paths.outside, 'private.txt')
    writeFileSync(outsideFile, 'private')
    symlinkSync(outsideFile, join(paths.exports, 'escaped.txt'))
    expect(() => resolveArtifactFilePath({ artifactPath: '../outside/private.txt', exportDirectory: paths.exports, authorizedDirectories: [] })).toThrow('artifact_path_outside_exports')
    expect(() => resolveArtifactFilePath({ artifactPath: outsideFile, exportDirectory: paths.exports, authorizedDirectories: [paths.authorized] })).toThrow('artifact_target_outside_scope')
    expect(() => resolveArtifactFilePath({ artifactPath: 'escaped.txt', exportDirectory: paths.exports, authorizedDirectories: [] })).toThrow('artifact_target_outside_exports')
  })
})
