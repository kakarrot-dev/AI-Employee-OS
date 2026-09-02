import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolVersion } from './domain'
import { localDocumentRunner } from './local-document-runner'

const roots: string[] = []
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })

function tool(id: string): ToolVersion { return { schemaVersion: 1, id, createdAt: new Date().toISOString(), name: id, description: '', version: 1, source: 'mcp', inputSchema: {}, sideEffect: id.includes('.read@') ? 'none' : 'external_write', risk: id.includes('.read@') ? 'low' : 'medium', timeoutMs: 10_000, networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required' } }
const context = (root: string) => ({ actionId: 'action-1', signal: new AbortController().signal, grantedDirectories: [root] })

describe('localDocumentRunner', () => {
  it('creates, reads and uniquely edits a UTF-8 document inside the granted directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-doc-')); roots.push(root)
    const path = join(root, '报告.md')
    const created = await localDocumentRunner(tool('document.create@local-document/v1'), { path, content: '# 初稿\n\n旧结论' }, context(root))
    expect(created).toMatchObject({ path, bytesWritten: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    await expect(localDocumentRunner(tool('document.create@local-document/v1'), { path, content: '覆盖' }, context(root))).rejects.toThrow()
    const read = await localDocumentRunner(tool('document.read@local-document/v1'), { path }, context(root))
    expect(read.content).toContain('旧结论')
    const edited = await localDocumentRunner(tool('document.edit@local-document/v1'), { path, oldText: '旧结论', newText: '已核验结论' }, context(root))
    expect(edited).toMatchObject({ replacements: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(readFileSync(path, 'utf8')).toContain('已核验结论')
  })

  it('rejects traversal, ambiguous edits and symbolic links', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-doc-')); roots.push(root)
    const outside = mkdtempSync(join(tmpdir(), 'ai-employee-outside-')); roots.push(outside)
    const repeated = join(root, '重复.md'); writeFileSync(repeated, '相同\n相同')
    await expect(localDocumentRunner(tool('document.edit@local-document/v1'), { path: repeated, oldText: '相同', newText: '新' }, context(root))).rejects.toThrow('edit_conflict')
    await expect(localDocumentRunner(tool('document.create@local-document/v1'), { path: join(outside, '越界.md'), content: 'x' }, context(root))).rejects.toThrow('path_outside_authorized_directories')
    const target = join(outside, '秘密.md'); writeFileSync(target, 'secret')
    const link = join(root, '链接.md'); symlinkSync(target, link)
    await expect(localDocumentRunner(tool('document.read@local-document/v1'), { path: link }, context(root))).rejects.toThrow('path_outside_authorized_directories')
  })
})
