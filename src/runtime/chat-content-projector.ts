import { basename } from 'node:path'
import type { ChatContentMetricView, ChatContentView } from '../shared/chat-content-contract'
import { toPlainTimelineSummary, toResultMarkdown } from '../shared/chat-content-contract'
import type { DeliveryResultContract } from '../shared/delivery-result-contract'
import type { Assignment, ResearchBundle, ToolAction } from './domain'

function metric(label: string, value: string | number): ChatContentMetricView {
  return { label, value: String(value) }
}

const TECHNICAL_BOUNDARY = /(?:Runtime|\bTool\b|ToolResult|ToolAction|Tool Action|EEXIST|externalclifailed|SHA-?256|https?:\/\/|\bwww\.|\b(?:Title|URL|Published)\s*:|(?:document|agent-reach|last30days|opencli)\.[\w-]+|@[\w-]+\/v\d+|checkpoint|provider|检索执行时间|覆盖通道|来源与证据|(?:document|space|node)Id\b|(?:空间|文档|来源)?\s*ID(?=\s|[：:(（])|nodeToken\s*[：:=]|(?:access\s+)?token\s*[：:=]|truncated\s*[：:=]|(?:^|\s)(?:\/[\w.\-\p{L}]+){2,})/iu
const LONG_INTERNAL_IDENTIFIER = /\b(?:[a-f\d]{40,}|[A-Za-z0-9_-]{28,})\b/u
const INTERNAL_METRIC = /(?:完成要求|来源证据|交付文件|截断|SHA|Hash|哈希|完整性|校验|状态|Token|\bID\b)/iu
const PROCESS_NARRATION = /^(?:我来|让我|我将|我要|我需要|首先|先(?:查看|读取|检查|确认)|接下来|正在|根据|文件交付证据|为确保|为了确认)/u
const TRUNCATED_FRAGMENT = /(?:…|\.\.\.)\s*$/u

/**
 * Employee output remains available to the Runtime for handoff and audit. This
 * projection is intentionally narrower: only result copy enters the chat body.
 */
function userVisibleResultMarkdown(value: string | undefined, maxLength = 420): string {
  const markdown = toResultMarkdown(value ?? '', Number.MAX_SAFE_INTEGER)
    .replace(/^\s*(?:#{1,6}\s*)?(?:阶段工作已完成|交付结果已完成|交付结果|完成摘要)\s*[：:]?\s*/u, '')
  if (!markdown) return ''

  const coreConclusion = /(?:核心结论|最终结论)\s*[：:]\s*/gu
  let source = markdown
  for (const match of markdown.matchAll(coreConclusion)) source = markdown.slice((match.index ?? 0) + match[0].length)

  const blocks: string[] = []
  for (const rawBlock of source.split(/\n+/)) {
    if (rawBlock.includes('|')) continue
    const prefixMatch = /^\s*((?:[-+*]|\d+[.)]|>)\s+)?/u.exec(rawBlock)
    const prefix = prefixMatch?.[1] ?? ''
    let block = rawBlock.slice(prefixMatch?.[0].length ?? 0)
      .replace(/^\s*#{1,6}\s*/u, '')
      .replaceAll('**', '')
      .replace(/^\s*(?:结论|结果|内容摘要|研究任务)\s*[：:]\s*/u, '')
      .trim()
    if (/^(?:研究范围与)?结论摘要$/u.test(block)) continue
    if (PROCESS_NARRATION.test(block) || TRUNCATED_FRAGMENT.test(block)) continue
    const boundaryIndex = block.search(TECHNICAL_BOUNDARY)
    if (boundaryIndex === 0) continue
    if (boundaryIndex > 0) block = block.slice(0, boundaryIndex).replace(/[，,；;：:]\s*$/u, '').trim()
    if (!block || PROCESS_NARRATION.test(block) || TRUNCATED_FRAGMENT.test(block) || /[到至为于见]\s*$/u.test(block)) continue
    for (const sentence of block.split(/(?<=[。！？!?])\s*/u)) {
      const clean = sentence.trim()
      if (!clean || PROCESS_NARRATION.test(clean) || TRUNCATED_FRAGMENT.test(clean) || TECHNICAL_BOUNDARY.test(clean) || LONG_INTERNAL_IDENTIFIER.test(clean)) continue
      blocks.push(`${prefix}${clean}`.trim())
      if (blocks.length >= 4) break
    }
    if (blocks.length >= 4) break
  }
  const selected: string[] = []
  let characterCount = 0
  for (const block of blocks) {
    const length = [...block].length
    const separatorLength = selected.length > 0 ? 2 : 0
    if (length > maxLength) continue
    if (characterCount + separatorLength + length > maxLength) break
    selected.push(block)
    characterCount += separatorLength + length
  }
  return toResultMarkdown(selected.join('\n\n'), Number.MAX_SAFE_INTEGER)
}

export function projectAssignmentChatContent(input: { assignment: Assignment; actions: ToolAction[]; researchBundle?: ResearchBundle }): ChatContentView {
  const { assignment, actions, researchBundle } = input
  const outcomes: Array<{ title: string; summary: string }> = []
  const extraction = actions.find((action) => action.toolVersionId === 'tender.requirements.extract@document-analysis/v1' && action.state === 'succeeded' && action.resultVerified === true)
  if (extraction) {
    const documents = Array.isArray(extraction.result?.documents) ? extraction.result.documents as Array<Record<string, unknown>> : []
    const sections = documents.reduce((total, document) => total + (Array.isArray(document.sections) ? document.sections.length : 0), 0)
    outcomes.push({ title: '客户材料分析结果', summary: `已从 **${documents.length} 个文件**中整理出 **${sections} 个有效内容片段**，客户要求已完成归纳。` })
  }

  if (researchBundle) {
    const sourceCount = researchBundle.items.length
    const claimCount = researchBundle.claims.length
    const hasExplicitConclusion = /(?:核心结论|最终结论)\s*[：:]/u.test(assignment.output ?? '')
    const conclusion = hasExplicitConclusion ? userVisibleResultMarkdown(assignment.output, 360) : ''
    const summary = sourceCount > 0
      ? conclusion || `已核验 **${sourceCount} 个公开来源**，形成 **${claimCount} 条结论**。`
      : '暂未找到足以支持结论的公开信息。'
    outcomes.push({ title: '公开信息研究结果', summary })
  }

  const wikiCount = actions.find((action) => action.toolVersionId === 'feishu.wiki.count@feishu-wiki/v1' && action.state === 'succeeded' && action.resultVerified === true && Number.isSafeInteger(action.result?.spaceCount) && Number.isSafeInteger(action.result?.totalDocuments))
  if (wikiCount) {
    const spaceCount = Number(wikiCount.result?.spaceCount)
    const totalDocuments = Number(wikiCount.result?.totalDocuments)
    outcomes.push({ title: '飞书知识库统计结果', summary: `当前可访问的飞书知识库共有 **${totalDocuments} 个文档**，分布在 **${spaceCount} 个空间**。\n\n> 统计范围不包含个人文档库。` })
  }

  const writes = actions.filter((action) => action.state === 'succeeded' && action.resultVerified === true && ['document.create@local-document/v1', 'document.edit@local-document/v1'].includes(action.toolVersionId))
  const verifiedWrite = writes.at(-1)
  if (verifiedWrite) {
    const path = typeof verifiedWrite.result?.path === 'string' ? verifiedWrite.result.path : undefined
    const fileName = path ? basename(path) : '交付文件'
    outcomes.push({ title: '文件已生成', summary: `已生成 **${fileName}**，可在最终交付区直接打开。` })
  }

  if (outcomes.length > 0) {
    return {
      schemaVersion: 1,
      title: outcomes.length === 1 ? outcomes[0].title : '阶段结果',
      summary: outcomes.map((outcome) => outcome.summary).join('\n\n')
    }
  }

  const summary = userVisibleResultMarkdown(assignment.summary || assignment.output) || (assignment.state === 'succeeded' ? '当前阶段结果已提交。' : '当前阶段未能形成可交付结果。')
  const title = assignment.state === 'succeeded' ? '阶段工作已完成' : assignment.state === 'failed' ? '阶段执行未完成' : assignment.state === 'cancelled' ? '阶段执行已取消' : '阶段状态已更新'
  return { schemaVersion: 1, title, summary }
}

function isGenericCompletion(value: string): boolean {
  const normalized = value.replace(/[“”'"。，；;！!\s]/g, '')
  return /^(?:员工)?结果(?:已经|已)?通过验收(?:交付文件与来源证据均已保存)?$/.test(normalized)
    || /^(?:本次)?(?:执行|任务|交付)(?:已经|已)?完成$/.test(normalized)
    || /^验收通过$/.test(normalized)
}

function firstLegacyOutcome(values: string[] | undefined): string | undefined {
  for (const value of values ?? []) {
    const result = userVisibleResultMarkdown(value, 320)
    const plain = toPlainTimelineSummary(result, 320)
    if (result && !isGenericCompletion(plain)) return result
  }
  return undefined
}

export function projectDeliveryChatContent(input: { result?: DeliveryResultContract; summary?: string; legacySummaries?: string[]; acceptanceResults: Array<{ passed: boolean }>; artifactCount: number; artifactNames?: string[]; evidenceCount: number; unresolvedIssues: string[] }): ChatContentView {
  const passed = input.acceptanceResults.filter((item) => item.passed).length
  const completed = passed === input.acceptanceResults.length
  const reviewSummary = toPlainTimelineSummary(input.summary ?? '', 1_200)
  const firstArtifactName = input.artifactNames?.map((name) => basename(name)).find(Boolean)
  const fallbackSummary = completed
    ? firstArtifactName ? '交付文件已生成。' : '结果已完成。'
    : '部分结果尚未满足要求。'
  const reviewOutcome = reviewSummary && !isGenericCompletion(reviewSummary) ? userVisibleResultMarkdown(reviewSummary, 320) : undefined
  const documentCount = input.result?.keyResults.find((item) => /文档.*(?:总数|数量)|(?:总数|数量).*文档/u.test(item.label))
  const spaceCount = input.result?.keyResults.find((item) => /(?:知识库)?空间(?:总数|数量|数)?|(?:总数|数量|数).*(?:知识库)?空间/u.test(item.label))
  const isKnowledgeBaseCount = Boolean(documentCount && spaceCount && /飞书|知识库/u.test(`${input.result?.headline ?? ''} ${input.result?.summary ?? ''}`))
  const isFileOnlyDelivery = input.artifactCount > 0 && (!input.result || input.result.resultType === 'file')
  const resultSummary = isFileOnlyDelivery
    ? '交付文件已生成，可直接打开查看。'
    : isKnowledgeBaseCount
    ? `当前可访问的飞书知识库共 **${spaceCount!.value}${spaceCount!.unit ? ` ${spaceCount!.unit}` : ''}**，文档总数为 **${documentCount!.value}${documentCount!.unit ? ` ${documentCount!.unit}` : ''}**。`
    : userVisibleResultMarkdown(input.result?.summary, 500)
  const summary = resultSummary || reviewOutcome || firstLegacyOutcome(input.legacySummaries) || fallbackSummary
  const detailItems = [...(input.result?.limitations ?? []), ...input.unresolvedIssues]
    .map((item) => userVisibleResultMarkdown(item, 240))
    .filter(Boolean)
  const resultMetrics = input.result?.keyResults.flatMap((item) => {
    const label = toPlainTimelineSummary(item.label, 40)
    const value = userVisibleResultMarkdown(item.value, 120)
    if (!label || !value || INTERNAL_METRIC.test(label) || TECHNICAL_BOUNDARY.test(value) || LONG_INTERNAL_IDENTIFIER.test(value)) return []
    return [metric(label, `${value}${item.unit ? ` ${item.unit}` : ''}`)]
  }) ?? []
  const plainTitle = toPlainTimelineSummary(input.result?.headline ?? '', 80)
  const resultTitle = plainTitle && !TECHNICAL_BOUNDARY.test(plainTitle) && !LONG_INTERNAL_IDENTIFIER.test(plainTitle) ? plainTitle : ''
  return {
    schemaVersion: 1,
    title: resultTitle || (completed ? '交付结果已完成' : '交付结果需要处理'),
    summary,
    metrics: resultMetrics.length ? resultMetrics : undefined,
    detail: detailItems.length ? { label: input.unresolvedIssues.length ? '查看限制与未决问题' : '查看结果边界', content: detailItems.join('\n\n') } : undefined
  }
}
