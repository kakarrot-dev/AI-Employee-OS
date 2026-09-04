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
import { FEISHU_DOCUMENT_TOOL_IDS } from '../shared/connection-contract'

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

  it('commits Feishu search and document hashes as evidence without exporting source content', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-feishu-export-')); directories.push(directory)
    const store = new RuntimeStore(join(directory, 'control.sqlite3'))
    const kernel = new RuntimeKernel(store)
    const timestamp = new Date().toISOString()
    kernel.save({ entityType: 'EmployeeVersion', entity: { schemaVersion: 1, id: 'employee-version.feishu-researcher.v1', createdAt: timestamp, employeeId: 'employee.feishu-researcher', version: 1, state: 'active', name: '飞书资料员', description: '', systemPrompt: '', modelId: 'deepseek-v4-pro', capabilityVersionIds: ['capability.feishu-documents.v1'], memoryScopes: [], testRunIds: [], publishedAt: timestamp }, immutable: true }, 'seed', {})
    kernel.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'search', createdAt: timestamp, runId: 'run-feishu', assignmentId: 'assignment-feishu', toolVersionId: FEISHU_DOCUMENT_TOOL_IDS.search, idempotencyKey: 'search', state: 'succeeded', parameters: { query: '项目周报' }, parameterSources: { query: { kind: 'task_input', sourceRef: 'task' } }, risk: 'low', sideEffect: 'external_read', timeoutMs: 15_000, completedAt: timestamp, resultVerified: true, result: { query: '项目周报', items: [{ documentId: 'doccnDocument123' }], responseSha256: 'a'.repeat(64) } }, immutable: false }, 'seed', {})
    kernel.save({ entityType: 'ToolAction', entity: { schemaVersion: 1, id: 'read', createdAt: timestamp, runId: 'run-feishu', assignmentId: 'assignment-feishu', toolVersionId: FEISHU_DOCUMENT_TOOL_IDS.read, idempotencyKey: 'read', state: 'succeeded', parameters: { documentId: 'doccnDocument123' }, parameterSources: { documentId: { kind: 'untrusted_external_content', sourceRef: 'tool:search' } }, risk: 'low', sideEffect: 'external_read', timeoutMs: 15_000, completedAt: timestamp, resultVerified: true, result: { documentId: 'doccnDocument123', content: '内部正文不应被导出', contentSha256: 'b'.repeat(64), truncated: false } }, immutable: false }, 'seed', {})
    const detail = { run: { id: 'run-feishu' }, assignments: [{ id: 'assignment-feishu', employeeVersionId: 'employee-version.feishu-researcher.v1', output: '结论' }] } as FormalTaskDetail

    const result = new DeliveryExporter(kernel, join(directory, 'exports')).materialize(detail)

    expect(result).toMatchObject({ artifactIds: [], unresolvedIssues: [] })
    expect(result.evidenceIds).toHaveLength(2)
    expect(store.list<any>('Evidence').map((item) => ({ sourceType: item.sourceType, sourceRef: item.sourceRef, sha256: item.sha256 }))).toEqual(expect.arrayContaining([
      { sourceType: 'feishu_document_search', sourceRef: expect.stringMatching(/^feishu:search:[a-f0-9]{64}$/), sha256: 'a'.repeat(64) },
      { sourceType: 'feishu_docx', sourceRef: 'feishu:docx:doccnDocument123', sha256: 'b'.repeat(64) }
    ]))
    expect(readdirSync(join(directory, 'exports'))).toEqual([])
    store.close()
  })
})
