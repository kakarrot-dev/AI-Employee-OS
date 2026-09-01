import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeliveryExporter } from './delivery-exporter'
import type { ResearchBundle } from './domain'
import { RuntimeKernel } from './kernel'
import { RuntimeStore } from './store'
import type { FormalTaskDetail } from './task-service'

const directories: string[] = []
afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('DeliveryExporter', () => {
  it('atomically exports Markdown and JSON with hashes and collision suffixes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-export-')); directories.push(directory)
    const store = new RuntimeStore(join(directory, 'control.sqlite3'))
    const kernel = new RuntimeKernel(store)
    const contentHash = createHash('sha256').update('source').digest('hex')
    const bundle: ResearchBundle = { schemaVersion: 1, id: 'bundle-1', createdAt: new Date().toISOString(), taskId: 'task-1', runId: 'run-1', assignmentId: 'assignment-1', employeeVersionId: 'employee-version-1', question: 'Agent 趋势', queries: [{ adapterVersionId: 'github.repositories.search@research-source/v1', query: 'agents' }], sourceAttemptIds: ['attempt-1'], items: [{ sourceAttemptId: 'attempt-1', sourceType: 'github_repository', url: 'https://github.com/example/agent', title: 'example/agent', fetchedAt: new Date().toISOString(), summary: '公开摘要', contentHash, trust: 'untrusted_external_content', injectionSignals: [] }], claims: [{ statement: '存在公开 Agent 项目', sourceItemIndexes: [0], confidence: 'low' }], conflicts: [], informationGaps: [], contentHash: createHash('sha256').update('bundle').digest('hex') }
    kernel.save({ entityType: 'ResearchBundle', entity: bundle, immutable: true }, 'research.bundle.created', {})
    const detail = { task: { id: 'task-1' }, run: { id: 'run-1' }, revision: { goal: 'Agent 趋势报告', acceptanceCriteria: ['包含来源'] }, assignments: [{ output: '# 第一版\n\n结论。' }] } as FormalTaskDetail
    const exporter = new DeliveryExporter(kernel, join(directory, 'exports'))

    const first = exporter.materialize(detail)
    detail.assignments[0].output = '# 第二版\n\n新结论。'
    const second = exporter.materialize(detail)
    const files = readdirSync(join(directory, 'exports')).sort()

    expect(files).toEqual(['Agent-趋势报告.md', 'Agent-趋势报告.sources.json', 'Agent-趋势报告_1.md', 'Agent-趋势报告_1.sources.json'])
    expect(readFileSync(join(directory, 'exports', 'Agent-趋势报告.md'), 'utf8')).toContain('第一版')
    expect(readFileSync(join(directory, 'exports', 'Agent-趋势报告_1.md'), 'utf8')).toContain('第二版')
    expect(JSON.parse(readFileSync(join(directory, 'exports', 'Agent-趋势报告.sources.json'), 'utf8'))).toMatchObject({ researchBundleId: 'bundle-1', sources: [{ contentHash }] })
    expect(first.artifactIds).toHaveLength(2); expect(first.evidenceIds).toHaveLength(1)
    expect(second.artifactIds).toHaveLength(2); expect(new Set([...first.artifactIds, ...second.artifactIds]).size).toBe(4)
    expect(store.list('Artifact')).toHaveLength(4); expect(store.list('Evidence')).toHaveLength(2)
    store.close()
  })
})
