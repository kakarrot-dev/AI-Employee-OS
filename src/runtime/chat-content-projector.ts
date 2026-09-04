import { basename } from 'node:path'
import type { ChatContentMetricView, ChatContentView } from '../shared/chat-content-contract'
import { toPlainChatDetail, toPlainTimelineSummary } from '../shared/chat-content-contract'
import type { Assignment, ResearchBundle, ToolAction } from './domain'

function metric(label: string, value: string | number): ChatContentMetricView {
  return { label, value: String(value) }
}

function detailFromOutput(output: string | undefined, summary: string, label = '查看阶段详情'): ChatContentView['detail'] {
  const content = toPlainChatDetail(output ?? '')
  return content && content !== summary ? { label, content } : undefined
}

export function projectAssignmentChatContent(input: { assignment: Assignment; actions: ToolAction[]; researchBundle?: ResearchBundle }): ChatContentView {
  const { assignment, actions, researchBundle } = input
  const outcomes: Array<{ title: string; summary: string; metrics: ChatContentMetricView[] }> = []
  const extraction = actions.find((action) => action.toolVersionId === 'tender.requirements.extract@document-analysis/v1' && action.state === 'succeeded' && action.resultVerified === true)
  if (extraction) {
    const documents = Array.isArray(extraction.result?.documents) ? extraction.result.documents as Array<Record<string, unknown>> : []
    const sections = documents.reduce((total, document) => total + (Array.isArray(document.sections) ? document.sections.length : 0), 0)
    const warnings = Array.isArray(extraction.result?.warnings) ? extraction.result.warnings.length : 0
    outcomes.push({ title: '客户材料解析完成', summary: '已完成源文件解析和内部需求交接；源文件正文不在会话中重复展示。', metrics: [metric('源文件', documents.length), metric('可追溯片段', sections), ...(warnings ? [metric('覆盖提示', warnings)] : [])] })
  }

  if (researchBundle) {
    const sourceCount = researchBundle.items.length
    const claimCount = researchBundle.claims.length
    const issueCount = researchBundle.conflicts.length + researchBundle.informationGaps.length
    const summary = sourceCount > 0
      ? `已完成公开信息交叉核验并形成 ${claimCount} 条可追溯结论${issueCount ? `；${issueCount} 项冲突或信息缺口已保留` : ''}。`
      : '已完成公开信息检索，但没有获得可作为事实依据的来源；信息缺口已保留。'
    outcomes.push({ title: '公开信息核验完成', summary, metrics: [metric('来源', sourceCount), metric('结论', claimCount), ...(issueCount ? [metric('冲突与缺口', issueCount)] : [])] })
  }

  const writes = actions.filter((action) => action.state === 'succeeded' && action.resultVerified === true && ['document.create@local-document/v1', 'document.edit@local-document/v1'].includes(action.toolVersionId))
  const verifiedWrite = writes.at(-1)
  if (verifiedWrite) {
    const path = typeof verifiedWrite.result?.path === 'string' ? verifiedWrite.result.path : undefined
    const verifiedRead = actions.some((action) => action.state === 'succeeded' && action.resultVerified === true && action.toolVersionId === 'document.read@local-document/v1' && action.result?.path === path && action.result?.sha256 === verifiedWrite.result?.sha256)
    const summary = verifiedRead ? '交付文件已生成，并通过同路径、同 SHA-256 回读校验。' : '交付文件已生成并完成 Runtime 写入校验。'
    outcomes.push({ title: '交付文件已生成', summary, metrics: [metric('交付文件', writes.length), metric('完整性', verifiedRead ? '已回读校验' : '已写入校验')] })
  }

  if (outcomes.length > 0) {
    const summary = outcomes.map((outcome) => outcome.summary).join(' ')
    const onlyDocumentOutcome = outcomes.length === 1 && verifiedWrite
    const path = typeof verifiedWrite?.result?.path === 'string' ? verifiedWrite.result.path : undefined
    return {
      schemaVersion: 1,
      title: outcomes.length === 1 ? outcomes[0].title : '阶段工作已完成',
      summary,
      metrics: outcomes.flatMap((outcome) => outcome.metrics),
      detail: onlyDocumentOutcome && path && !assignment.output?.trim()
        ? { label: '查看文件信息', content: `文件：${basename(path)}` }
        : detailFromOutput(assignment.output, summary, outcomes.some((outcome) => outcome.title === '公开信息核验完成') ? '查看研究说明' : outcomes.some((outcome) => outcome.title === '客户材料解析完成') ? '查看分析说明' : '查看阶段详情')
    }
  }

  const summary = toPlainTimelineSummary(assignment.summary || assignment.output || '') || '当前阶段已完成，结果已提交总管验收。'
  const title = assignment.state === 'succeeded' ? '阶段工作已完成' : assignment.state === 'failed' ? '阶段执行未完成' : assignment.state === 'cancelled' ? '阶段执行已取消' : '阶段状态已更新'
  return { schemaVersion: 1, title, summary, detail: detailFromOutput(assignment.output, summary) }
}

function isTechnicalSummary(value: string): boolean {
  return /(?:\bSHA-?256\b|\b(?:document|agent-reach|last30days|opencli)\.[\w-]+|@[\w-]+\/v\d+|(?:^|\s)(?:\/[\w.\-\p{L}]+){2,}|\b[a-f\d]{40,}\b)/iu.test(value)
}

export function projectDeliveryChatContent(input: { summary?: string; acceptanceResults: Array<{ passed: boolean }>; artifactCount: number; artifactNames?: string[]; evidenceCount: number; unresolvedIssues: string[] }): ChatContentView {
  const passed = input.acceptanceResults.filter((item) => item.passed).length
  const completed = passed === input.acceptanceResults.length
  const reviewSummary = toPlainTimelineSummary(input.summary ?? '', 1_200)
  const firstArtifactName = input.artifactNames?.map((name) => basename(name)).find(Boolean)
  const fallbackSummary = completed
    ? firstArtifactName ? `“${firstArtifactName}”已经通过验收，交付文件与来源证据均已保存。` : '员工结果已经通过验收，交付文件与来源证据均已保存。'
    : '部分完成要求尚未通过，请查看完整验收记录。'
  const summary = reviewSummary && !isTechnicalSummary(reviewSummary) ? toPlainTimelineSummary(reviewSummary, 320) : fallbackSummary
  const detailItems = [...input.unresolvedIssues, ...(reviewSummary && reviewSummary !== summary ? [reviewSummary] : [])]
  return {
    schemaVersion: 1,
    title: completed ? '交付结果已完成' : '交付结果需要处理',
    summary,
    metrics: [metric('完成要求', `${passed}/${input.acceptanceResults.length}`), metric('来源证据', input.evidenceCount), metric('交付文件', input.artifactCount)],
    detail: detailItems.length ? { label: input.unresolvedIssues.length ? '查看未决问题' : '查看验收说明', content: detailItems.join('；') } : undefined
  }
}
