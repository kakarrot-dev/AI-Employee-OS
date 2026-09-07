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

    expect(content).toEqual({
      schemaVersion: 1,
      title: '阶段结果',
      summary: '已从 **1 个文件**中整理出 **1 个有效内容片段**，客户要求已完成归纳。\n\n已生成 **report.md**，可在最终交付区直接打开。'
    })
    expect(content.summary).not.toMatch(/Runtime|Tool|SHA|\/tmp/)
  })

  it('keeps raw research source rows out of the employee result body', () => {
    const researchBundle: ResearchBundle = {
      schemaVersion: 1, id: 'bundle', createdAt: assignment.createdAt, taskId: 'task', runId: 'run', assignmentId: assignment.id, employeeVersionId: assignment.employeeVersionId, question: '核验公开信息', queries: [], sourceAttemptIds: [],
      items: [{ sourceAttemptId: 'attempt', sourceType: 'agent_reach_web', url: 'https://example.com', title: '来源', fetchedAt: assignment.createdAt, summary: '摘要', contentHash: 'hash', trust: 'untrusted_external_content', injectionSignals: [] }],
      claims: [{ statement: 'https://example.com/news: Title: 某项目动态 URL: https://example.com/news Published: 2026-09-01 ' + '原始来源正文'.repeat(80) + '...', sourceItemIndexes: [0], confidence: 'high' }], conflicts: ['冲突'], informationGaps: ['缺口'], contentHash: 'bundle-hash'
    }

    expect(projectAssignmentChatContent({ assignment, actions: [], researchBundle })).toEqual({
      schemaVersion: 1,
      title: '公开信息研究结果',
      summary: '已核验 **1 个公开来源**，形成 **1 条结论**。'
    })
    expect(projectAssignmentChatContent({ assignment, actions: [], researchBundle }).summary).not.toMatch(/https?:|Title:|Published:|…|\.\.\./)
  })

  it('shows a complete explicit research conclusion without source blobs or character truncation', () => {
    const researchBundle: ResearchBundle = {
      schemaVersion: 1, id: 'bundle', createdAt: assignment.createdAt, taskId: 'task', runId: 'run', assignmentId: assignment.id, employeeVersionId: assignment.employeeVersionId, question: '核验公开信息', queries: [], sourceAttemptIds: [],
      items: Array.from({ length: 20 }, (_, index) => ({ sourceAttemptId: `attempt-${index}`, sourceType: 'agent_reach_web' as const, url: `https://example.com/${index}`, title: `来源 ${index}`, fetchedAt: assignment.createdAt, summary: '摘要', contentHash: `hash-${index}`, trust: 'untrusted_external_content' as const, injectionSignals: [] })),
      claims: Array.from({ length: 20 }, (_, index) => ({ statement: `https://example.com/${index}: Title: 原始来源 ${index} Published: 2026-09-01...`, sourceItemIndexes: [index], confidence: 'high' as const })), conflicts: [], informationGaps: [], contentHash: 'bundle-hash'
    }
    const result = projectAssignmentChatContent({ assignment: { ...assignment, output: '研究主题：AI 项目失败。覆盖通道：agent-reach。核心结论：失败主要来自目标不清、数据不足和缺少业务验收。 Runtime Tool 证据已保存。' }, actions: [], researchBundle })

    expect(result).toEqual({ schemaVersion: 1, title: '公开信息研究结果', summary: '失败主要来自目标不清、数据不足和缺少业务验收。' })
    expect(result.summary).not.toMatch(/https?:|Runtime|Tool|…|\.\.\./)
  })

  it('projects delivery verification without repeating the task goal or raw employee output', () => {
    const content = projectDeliveryChatContent({ summary: '验收通过。', acceptanceResults: [{ passed: true }, { passed: true }], artifactCount: 1, evidenceCount: 11, unresolvedIssues: [] })

    expect(content).toEqual({ schemaVersion: 1, title: '交付结果已完成', summary: '交付文件已生成，可直接打开查看。', metrics: undefined, detail: undefined })
  })

  it('surfaces key metrics from the generic delivery result contract without requiring disclosure', () => {
    const content = projectDeliveryChatContent({ result: { schemaVersion: 1, resultType: 'metric', headline: '知识库统计结果', summary: '当前可访问范围内共有 1 个空间、3 篇文档。', keyResults: [{ label: '知识库空间', value: '1', unit: '个', sourceRefs: ['tool_action:count'], evidenceIds: ['evidence'] }, { label: '文档总数', value: '3', unit: '篇', sourceRefs: ['tool_action:count'], evidenceIds: ['evidence'] }, { label: '枚举截断状态', value: 'false（未截断）', unit: '', sourceRefs: ['tool_action:count'], evidenceIds: ['evidence'] }], artifactIds: [], summarySourceAssignmentIds: ['assignment'], limitations: ['不包含个人文档库'] }, summary: '员工结果已经通过验收。', acceptanceResults: [{ passed: true }], artifactCount: 0, evidenceCount: 1, unresolvedIssues: [] })

    expect(content.summary).toBe('当前可访问的飞书知识库共 **1 个**，文档总数为 **3 篇**。')
    expect(content.metrics).toEqual([
      { label: '知识库空间', value: '1 个' },
      { label: '文档总数', value: '3 篇' }
    ])
    expect(content.detail).toEqual({ label: '查看结果边界', content: '不包含个人文档库' })
  })

  it('moves paths and hashes out of the delivery body because the file card owns file access', () => {
    const raw = '报告已保存到 /Users/example/Downloads/report.md，文件回读 SHA-256 为 ' + 'a'.repeat(64) + '，内容完整。'

    const content = projectDeliveryChatContent({ summary: raw, acceptanceResults: [{ passed: true }], artifactCount: 1, artifactNames: ['/Users/example/Downloads/report.md'], evidenceCount: 3, unresolvedIssues: [] })

    expect(content.summary).toBe('交付文件已生成，可直接打开查看。')
    expect(content.summary).not.toMatch(/Users|SHA-256/)
    expect(content.detail).toBeUndefined()
  })

  it('removes historical process narration instead of showing an incomplete employee monologue', () => {
    const content = projectAssignmentChatContent({ assignment: { ...assignment, summary: '我来查看授权目录中已有的文件和内容，确认当前文档状态。\n\n让我先读取授权目录下的相关文档。\n\n根据\n\n文件交付证据已经齐备（路径、内容、' }, actions: [] })

    expect(content.summary).toBe('当前阶段结果已提交。')
    expect(content.summary).not.toMatch(/我来|让我|根据|证据|路径/)
  })

  it('uses one concise sentence for file-only delivery while artifact cards own the files', () => {
    const content = projectDeliveryChatContent({ result: { schemaVersion: 1, resultType: 'file', headline: '郑州近期新闻整理', summary: '审核通过。目标文档已在授权目录，路径为 /Users/example/report.md。', keyResults: [], artifactIds: ['artifact'], summarySourceAssignmentIds: ['assignment'], limitations: [] }, summary: '审核通过。', acceptanceResults: [{ passed: true }], artifactCount: 1, artifactNames: ['/Users/example/report.md'], evidenceCount: 1, unresolvedIssues: [] })

    expect(content.summary).toBe('交付文件已生成，可直接打开查看。')
    expect(content.summary).not.toMatch(/审核|授权目录|Users/)
  })

  it('projects the first user-facing conclusion for legacy deliveries without a result contract', () => {
    const content = projectDeliveryChatContent({ summary: '员工结果已经通过验收。', legacySummaries: ['结论：当前授权范围内共有 3 篇文档。 Tool：example.count@local/v1；SHA-256：' + 'a'.repeat(64)], acceptanceResults: [{ passed: true }], artifactCount: 0, evidenceCount: 1, unresolvedIssues: [] })

    expect(content.summary).toBe('当前授权范围内共有 3 篇文档。')
    expect(content.summary).not.toMatch(/Tool|SHA-256/)
  })

  it('projects a verified Feishu count as a concise Markdown result without internal identifiers', () => {
    const count: ToolAction = { schemaVersion: 1, id: 'count', createdAt: assignment.createdAt, runId: 'run', assignmentId: assignment.id, toolVersionId: 'feishu.wiki.count@feishu-wiki/v1', idempotencyKey: 'count', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'low', sideEffect: 'external_read', timeoutMs: 1_000, resultVerified: true, result: { spaceCount: 1, totalDocuments: 3, documentRefs: [{ spaceId: 'space-internal', nodeToken: 'node-internal', documentId: 'doc-internal' }], enumerationSha256: 'a'.repeat(64), truncated: false } }

    const content = projectAssignmentChatContent({ assignment: { ...assignment, output: '结论：3 个文档。来源与证据：空间 ID：space-internal；SHA-256：' + 'a'.repeat(64) }, actions: [count] })

    expect(content).toEqual({ schemaVersion: 1, title: '飞书知识库统计结果', summary: '当前可访问的飞书知识库共有 **3 个文档**，分布在 **1 个空间**。\n\n> 统计范围不包含个人文档库。' })
    expect(content.summary).not.toMatch(/ID|SHA|Token|truncated/)
  })

  it('keeps a legacy research conclusion while removing channel and runtime narration', () => {
    const raw = '研究范围与结论摘要 研究主题：AI 项目失败案例。检索执行时间：2026-09-04。覆盖通道：agent-reach.search。核心结论：失败主要来自目标不清、数据不足和缺少业务验收。 Runtime Tool 证据已保存。'

    const content = projectDeliveryChatContent({ summary: '验收通过。', legacySummaries: [raw], acceptanceResults: [{ passed: true }], artifactCount: 0, evidenceCount: 1, unresolvedIssues: [] })

    expect(content.summary).toBe('失败主要来自目标不清、数据不足和缺少业务验收。')
    expect(content.summary).not.toMatch(/Runtime|Tool|通道|检索执行/)
  })
})

it('includes only verified meeting join URLs in the final delivery', () => {
  const action: ToolAction = { schemaVersion: 1, id: 'meeting', createdAt: assignment.createdAt, runId: 'run', assignmentId: assignment.id, toolVersionId: 'feishu.meetings.create@feishu-meetings/v1', idempotencyKey: 'meeting', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'medium', sideEffect: 'external_write', timeoutMs: 30000, resultVerified: true, result: { meetingNumber: '182742892', meetingUrl: 'https://vc.feishu.cn/j/182742892' } }
  const input = { summary: '会议已创建。\n- 入会链接：https://vc.feishu.cn/j/182742892', acceptanceResults: [{ passed: true }], artifactCount: 0, evidenceCount: 1, unresolvedIssues: [], actions: [action] }
  expect(projectDeliveryChatContent(input).summary).toContain('[https://vc.feishu.cn/j/182742892](https://vc.feishu.cn/j/182742892)')
  expect(projectDeliveryChatContent({ ...input, actions: [{ ...action, resultVerified: false }] }).summary).not.toContain('https://')
})
