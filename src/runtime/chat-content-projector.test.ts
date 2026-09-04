import { describe, expect, it } from 'vitest'
import type { Assignment, ResearchBundle, ToolAction } from './domain'
import { projectAssignmentChatContent, projectDeliveryChatContent } from './chat-content-projector'

const assignment: Assignment = { schemaVersion: 1, id: 'assignment', createdAt: '2026-09-04T00:00:00Z', runId: 'run', sequence: 1, employeeVersionId: 'employee-version', state: 'succeeded', output: '## 研究说明\n\n完成交叉核验。' }

describe('chat content projector', () => {
  it('projects evidence from multiple tools into one employee-agnostic content contract', () => {
    const actions: ToolAction[] = [
      { schemaVersion: 1, id: 'extract', createdAt: assignment.createdAt, runId: 'run', assignmentId: assignment.id, toolVersionId: 'tender.requirements.extract@document-analysis/v1', idempotencyKey: 'extract', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'low', sideEffect: 'external_read', timeoutMs: 1_000, resultVerified: true, result: { documents: [{ sections: [{ text: '需求' }] }], warnings: [] } },
      { schemaVersion: 1, id: 'write', createdAt: assignment.createdAt, runId: 'run', assignmentId: assignment.id, toolVersionId: 'document.create@local-document/v1', idempotencyKey: 'write', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'medium', sideEffect: 'external_write', timeoutMs: 1_000, resultVerified: true, result: { path: '/tmp/report.md', sha256: 'abc' } },
      { schemaVersion: 1, id: 'read', createdAt: assignment.createdAt, runId: 'run', assignmentId: assignment.id, toolVersionId: 'document.read@local-document/v1', idempotencyKey: 'read', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'low', sideEffect: 'external_read', timeoutMs: 1_000, resultVerified: true, result: { path: '/tmp/report.md', sha256: 'abc' } }
    ]

    const content = projectAssignmentChatContent({ assignment, actions })

    expect(content).toMatchObject({
      schemaVersion: 1,
      title: '阶段工作已完成',
      metrics: [
        { label: '源文件', value: '1' },
        { label: '可追溯片段', value: '1' },
        { label: '交付文件', value: '1' },
        { label: '完整性', value: '已回读校验' }
      ],
      detail: { content: '研究说明\n\n完成交叉核验。' }
    })
  })

  it('uses verified research facts instead of exposing a flattened query log as the summary', () => {
    const researchBundle: ResearchBundle = {
      schemaVersion: 1, id: 'bundle', createdAt: assignment.createdAt, taskId: 'task', runId: 'run', assignmentId: assignment.id, employeeVersionId: assignment.employeeVersionId, question: '核验公开信息', queries: [], sourceAttemptIds: [],
      items: [{ sourceAttemptId: 'attempt', sourceType: 'agent_reach_web', url: 'https://example.com', title: '来源', fetchedAt: assignment.createdAt, summary: '摘要', contentHash: 'hash', trust: 'untrusted_external_content', injectionSignals: [] }],
      claims: [{ statement: '结论', sourceItemIndexes: [0], confidence: 'high' }], conflicts: ['冲突'], informationGaps: ['缺口'], contentHash: 'bundle-hash'
    }

    expect(projectAssignmentChatContent({ assignment, actions: [], researchBundle })).toMatchObject({
      title: '公开信息核验完成',
      summary: '已完成公开信息交叉核验并形成 1 条可追溯结论；2 项冲突或信息缺口已保留。',
      metrics: [{ label: '来源', value: '1' }, { label: '结论', value: '1' }, { label: '冲突与缺口', value: '2' }]
    })
  })

  it('projects delivery verification without repeating the task goal or raw employee output', () => {
    const content = projectDeliveryChatContent({ summary: '验收通过。', acceptanceResults: [{ passed: true }, { passed: true }], artifactCount: 1, evidenceCount: 11, unresolvedIssues: [] })

    expect(content).toEqual({ schemaVersion: 1, title: '交付结果已完成', summary: '验收通过。', metrics: [{ label: '完成要求', value: '2/2' }, { label: '来源证据', value: '11' }, { label: '交付文件', value: '1' }], detail: undefined })
  })

  it('moves paths and hashes out of the delivery summary while preserving them in disclosure', () => {
    const raw = '报告已保存到 /Users/example/Downloads/report.md，文件回读 SHA-256 为 ' + 'a'.repeat(64) + '，内容完整。'

    const content = projectDeliveryChatContent({ summary: raw, acceptanceResults: [{ passed: true }], artifactCount: 1, artifactNames: ['/Users/example/Downloads/report.md'], evidenceCount: 3, unresolvedIssues: [] })

    expect(content.summary).toBe('“report.md”已经通过验收，交付文件与来源证据均已保存。')
    expect(content.summary).not.toMatch(/Users|SHA-256/)
    expect(content.detail).toEqual({ label: '查看验收说明', content: raw })
  })
})
