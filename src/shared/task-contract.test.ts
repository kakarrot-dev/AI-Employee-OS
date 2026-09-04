import { describe, expect, it } from 'vitest'
import { isChatContentView, toPlainChatDetail } from './chat-content-contract'
import { deriveMatterTitle, MATTER_TITLE_MAX_CHARACTERS, normalizeMatterTitle, toPlainTimelineSummary } from './task-contract'

describe('task presentation contract', () => {
  it('projects markdown worker output into bounded plain timeline text', () => {
    const markdown = '## 研究范围与结论摘要\n\n**研究任务：** 交叉核验客户背景。\n\n| 通道 | 查询 | 结果 |\n| --- | --- | --- |\n| agent-reach.search | 郑州工商学院 | 5 条 |'

    const summary = toPlainTimelineSummary(markdown)

    expect(summary).toBe('研究范围与结论摘要 研究任务： 交叉核验客户背景。 通道；查询；结果 agent-reach.search；郑州工商学院；5 条')
    expect(summary).not.toMatch(/[#*|]/)
  })

  it('truncates by visible characters without returning an incomplete markdown token', () => {
    expect(toPlainTimelineSummary('**重要结论：**' + '证据'.repeat(20), 12)).toBe('重要结论：证据证据证据证…')
  })

  it('cleans table separators from legacy summaries whose markdown lines were already flattened', () => {
    const legacy = '## 研究范围 **研究任务：** 核验。 | 通道 | 结果 | |---|---| | agent-reach.search | 5 条 |'

    expect(toPlainTimelineSummary(legacy)).toBe('研究范围 研究任务： 核验。；通道；结果；agent-reach.search；5 条')
  })

  it('accepts only complete versioned chat content payloads', () => {
    expect(isChatContentView({ schemaVersion: 1, title: '阶段完成', summary: '已形成结果。', metrics: [{ label: '来源', value: '3' }], detail: { label: '查看详情', content: '完整说明' } })).toBe(true)
    expect(isChatContentView({ schemaVersion: 1, title: '', summary: '已形成结果。' })).toBe(false)
    expect(isChatContentView({ schemaVersion: 2, title: '阶段完成', summary: '已形成结果。' })).toBe(false)
    expect(isChatContentView({ schemaVersion: 1, title: '阶段完成', summary: '已形成结果。', metrics: [{ label: '来源' }] })).toBe(false)
  })

  it('preserves meaningful line boundaries in expanded chat details', () => {
    const markdown = '## 研究范围\n\n**结论：** 已完成核验。\n\n- 保留来源\n- 标记缺口\n\n| 通道 | 结果 |\n| --- | --- |\n| web | 5 条 |'

    expect(toPlainChatDetail(markdown)).toBe('研究范围\n\n结论： 已完成核验。\n\n• 保留来源\n• 标记缺口\n\n通道 · 结果\nweb · 5 条')
  })

  it('keeps a concise matter title separate from the complete execution goal', () => {
    const goal = '生成一份针对《郑州工商学院预建设工作流梳理.docx》的结构化分析报告，包括客户需求、公开信息核验、冲突风险及待澄清问题。'

    expect(normalizeMatterTitle('郑州工商学院工作流分析', goal)).toBe('郑州工商学院工作流分析')
    expect(deriveMatterTitle(goal)).toBe('郑州工商学院预建设工作流梳理结构化分析报告')
    expect([...deriveMatterTitle('生成一份' + '很长的事项名称'.repeat(20))]).toHaveLength(MATTER_TITLE_MAX_CHARACTERS)
    expect(goal).toContain('公开信息核验、冲突风险及待澄清问题')
  })
})
