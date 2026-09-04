import { describe, expect, it } from 'vitest'
import type { Assignment, ResearchBundle, ToolAction } from './domain'
import { createDeliveryResultContract } from './delivery-result'

const assignment: Assignment = { schemaVersion: 1, id: 'assignment', createdAt: '2026-09-04T00:00:00Z', runId: 'run', sequence: 1, employeeVersionId: 'employee', state: 'succeeded', output: '当前范围共有 3 篇文档。' }
const action: ToolAction = { schemaVersion: 1, id: 'count-action', createdAt: assignment.createdAt, runId: 'run', assignmentId: assignment.id, toolVersionId: 'example.count@local/v1', idempotencyKey: 'count', state: 'succeeded', parameters: {}, parameterSources: {}, risk: 'low', sideEffect: 'external_read', timeoutMs: 1_000, resultVerified: true, result: { total: 3 } }

describe('delivery result contract', () => {
  it('binds a metric candidate to verified tool and evidence identifiers', () => {
    const result = createDeliveryResultContract({ candidate: { resultType: 'metric', headline: '文档统计结果', summary: '当前授权范围内共有 3 篇文档。', keyResults: [{ label: '文档总数', value: '3', unit: '篇', sourceIds: [action.id] }], limitations: [] }, assignments: [assignment], actions: [action], researchBundles: [], artifactIds: [], evidenceIds: ['evidence'], unresolvedIssues: [] })

    expect(result).toMatchObject({ schemaVersion: 1, resultType: 'metric', summary: '当前授权范围内共有 3 篇文档。', keyResults: [{ label: '文档总数', value: '3', unit: '篇', sourceRefs: ['tool_action:count-action'], evidenceIds: ['evidence'] }] })
  })

  it('preserves lightweight Markdown in the user-visible result summary', () => {
    const result = createDeliveryResultContract({ candidate: { resultType: 'text', headline: '研究结果', summary: '确认两项关键问题：\n\n- 目标不清\n- 数据不足', keyResults: [], limitations: [] }, assignments: [assignment], actions: [], researchBundles: [], artifactIds: [], evidenceIds: [], unresolvedIssues: [] })

    expect(result.summary).toBe('确认两项关键问题：\n\n- 目标不清\n- 数据不足')
  })

  it('rejects generic completion copy and unverified metric values', () => {
    expect(() => createDeliveryResultContract({ candidate: { resultType: 'text', headline: '交付结果', summary: '验收通过。', keyResults: [], limitations: [] }, assignments: [assignment], actions: [action], researchBundles: [], artifactIds: [], evidenceIds: [], unresolvedIssues: [] })).toThrow('delivery_result_not_specific')
    expect(() => createDeliveryResultContract({ candidate: { resultType: 'metric', headline: '统计结果', summary: '当前共有 9 篇文档。', keyResults: [{ label: '文档总数', value: '9', unit: '篇', sourceIds: [action.id] }], limitations: [] }, assignments: [assignment], actions: [action], researchBundles: [], artifactIds: [], evidenceIds: [], unresolvedIssues: [] })).toThrow('delivery_key_result_unverified')
  })

  it('accepts evidence-equivalent numeric and boolean annotations without accepting changed values', () => {
    const annotatedAction: ToolAction = { ...action, result: { total: 3, truncated: false } }
    const result = createDeliveryResultContract({ candidate: { resultType: 'metric', headline: '文档统计结果', summary: '当前授权范围内共有 3 篇文档，枚举未截断。', keyResults: [{ label: '文档总数', value: '3 篇', unit: '', sourceIds: [annotatedAction.id] }, { label: '枚举截断状态', value: 'false（未截断）', unit: '', sourceIds: [annotatedAction.id] }], limitations: [] }, assignments: [assignment], actions: [annotatedAction], researchBundles: [], artifactIds: [], evidenceIds: ['evidence'], unresolvedIssues: [] })

    expect(result.keyResults.map(({ value }) => value)).toEqual(['3 篇', 'false（未截断）'])
    expect(() => createDeliveryResultContract({ candidate: { resultType: 'metric', headline: '文档统计结果', summary: '当前授权范围内共有 4 篇文档。', keyResults: [{ label: '文档总数', value: '4 篇', unit: '', sourceIds: [annotatedAction.id] }], limitations: [] }, assignments: [assignment], actions: [annotatedAction], researchBundles: [], artifactIds: [], evidenceIds: [], unresolvedIssues: [] })).toThrow('delivery_key_result_unverified')
  })

  it('derives file delivery type from verified artifacts instead of trusting the model label', () => {
    const result = createDeliveryResultContract({ candidate: { resultType: 'text', headline: '报告文件', summary: '已生成包含结论与来源说明的报告文件。', keyResults: [], limitations: [] }, assignments: [], actions: [], researchBundles: [], artifactIds: ['artifact'], evidenceIds: [], unresolvedIssues: [] })

    expect(result.resultType).toBe('file')
    expect(result.artifactIds).toEqual(['artifact'])
  })

  it('accepts research aggregate metrics through the same source contract', () => {
    const bundle: ResearchBundle = { schemaVersion: 1, id: 'bundle', createdAt: assignment.createdAt, taskId: 'task', runId: 'run', assignmentId: assignment.id, employeeVersionId: assignment.employeeVersionId, question: '研究', queries: [], sourceAttemptIds: [], items: [{ sourceAttemptId: 'attempt-1', sourceType: 'agent_reach_web', url: 'https://example.com/1', title: '来源一', fetchedAt: assignment.createdAt, summary: '一', contentHash: 'one', trust: 'untrusted_external_content', injectionSignals: [] }, { sourceAttemptId: 'attempt-2', sourceType: 'agent_reach_web', url: 'https://example.com/2', title: '来源二', fetchedAt: assignment.createdAt, summary: '二', contentHash: 'two', trust: 'untrusted_external_content', injectionSignals: [] }], claims: [], conflicts: [], informationGaps: [], contentHash: 'bundle-hash' }
    const result = createDeliveryResultContract({ candidate: { resultType: 'metric', headline: '研究结果', summary: '本次结论由 2 个公开来源支持。', keyResults: [{ label: '公开来源', value: '2', unit: '个', sourceIds: [bundle.id] }], limitations: [] }, assignments: [assignment], actions: [], researchBundles: [bundle], artifactIds: [], evidenceIds: ['evidence-1', 'evidence-2'], unresolvedIssues: [] })

    expect(result.keyResults[0].sourceRefs).toEqual(['research_bundle:bundle'])
  })
})
