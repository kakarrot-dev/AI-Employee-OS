import { isFeishuMeetingTool } from '../shared/feishu-meeting-contract'
import { closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Artifact, EmployeeVersion, Evidence, ResearchBundle, ToolAction } from './domain'
import type { FormalTaskDetail } from './task-service'
import { RuntimeKernel } from './kernel'
import { hasFeishuDocumentCapability, hasResearchCapability, hasTenderAnalysisCapability } from './builtin-contracts'
import { FEISHU_DOCUMENT_TOOL_IDS } from '../shared/connection-contract'

export interface DeliveryMaterialization { artifactIds: string[]; evidenceIds: string[]; unresolvedIssues: string[] }

function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }

function safeBaseName(goal: string): string {
  const value = goal.normalize('NFKC').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return value || 'research-report'
}

export class DeliveryExporter {
  private readonly root: string

  constructor(private readonly kernel: RuntimeKernel, exportDirectory: string) {
    this.root = resolve(exportDirectory)
    mkdirSync(this.root, { recursive: true, mode: 0o700 })
  }

  materialize(detail: FormalTaskDetail): DeliveryMaterialization {
    const bundle = this.kernel.store.list<ResearchBundle>('ResearchBundle').find((value) => value.runId === detail.run?.id)
    const timestamp = new Date().toISOString()
    const fileArtifacts = this.kernel.store.list<ToolAction>('ToolAction').filter((action) => action.runId === detail.run?.id && action.state === 'succeeded' && ['document.create@local-document/v1', 'document.edit@local-document/v1'].includes(action.toolVersionId)).flatMap((action): Artifact[] => {
      const path = action.result?.path
      if (typeof path !== 'string' || !existsSync(path)) return []
      const hash = sha256(readFileSync(path))
      if (typeof action.result?.sha256 === 'string' && action.result.sha256 !== hash) return []
      return [{ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, mediaType: typeof action.result?.mediaType === 'string' ? action.result.mediaType : 'text/plain', relativePath: path, sha256: hash }]
    })
    for (const artifact of fileArtifacts) this.kernel.save({ entityType: 'Artifact', entity: artifact, immutable: true }, 'artifact.file_action_verified', { path: artifact.relativePath, sha256: artifact.sha256 })
    const tenderActions = this.kernel.store.list<ToolAction>('ToolAction').filter((action) => action.runId === detail.run?.id && action.state === 'succeeded' && action.resultVerified === true && action.toolVersionId === 'tender.requirements.extract@document-analysis/v1' && Array.isArray(action.result?.documents))
    const tenderWarnings = tenderActions.flatMap((action) => Array.isArray(action.result?.warnings) ? action.result.warnings.filter((warning): warning is string => typeof warning === 'string') : [])
    const tenderEvidence = tenderActions.flatMap((action): Evidence[] => (action.result!.documents as Array<Record<string, unknown>>).flatMap((document) => {
      if (typeof document.path !== 'string' || typeof document.sha256 !== 'string' || typeof document.format !== 'string') return []
      return [{ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: `customer_${document.format}`, sourceRef: document.path, capturedAt: action.completedAt ?? timestamp, sha256: document.sha256 }]
    }))
    for (const item of tenderEvidence) this.kernel.save({ entityType: 'Evidence', entity: item, immutable: true }, 'evidence.customer_attachment_committed', { sourceType: item.sourceType, sourceRef: item.sourceRef, sha256: item.sha256 })
    const feishuEvidence = this.kernel.store.list<ToolAction>('ToolAction').filter((action) => action.runId === detail.run?.id && action.state === 'succeeded' && action.resultVerified === true).flatMap((action): Evidence[] => {
      if (isFeishuMeetingTool(action.toolVersionId) && typeof action.result?.responseSha256 === 'string') return [{ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: 'feishu_meeting', sourceRef: `feishu:meeting-action:${action.id}`, capturedAt: action.completedAt ?? timestamp, sha256: action.result.responseSha256 }]
      if (action.toolVersionId === FEISHU_DOCUMENT_TOOL_IDS.search && typeof action.result?.responseSha256 === 'string' && typeof action.result?.query === 'string') {
        return [{ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: 'feishu_document_search', sourceRef: `feishu:search:${sha256(action.result.query)}`, capturedAt: action.completedAt ?? timestamp, sha256: action.result.responseSha256 }]
      }
      if (action.toolVersionId === FEISHU_DOCUMENT_TOOL_IDS.read && typeof action.result?.contentSha256 === 'string' && typeof action.result?.documentId === 'string') {
        return [{ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: 'feishu_docx', sourceRef: `feishu:docx:${action.result.documentId}`, capturedAt: action.completedAt ?? timestamp, sha256: action.result.contentSha256 }]
      }
      if (action.toolVersionId === FEISHU_DOCUMENT_TOOL_IDS.wikiCount && typeof action.result?.enumerationSha256 === 'string' && action.result?.scope === 'accessible_wiki_spaces') {
        return [{ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: 'feishu_wiki_enumeration', sourceRef: 'feishu:wiki:accessible-spaces', capturedAt: action.completedAt ?? timestamp, sha256: action.result.enumerationSha256 }]
      }
      return []
    })
    for (const item of feishuEvidence) this.kernel.save({ entityType: 'Evidence', entity: item, immutable: true }, 'evidence.feishu_document_committed', { sourceType: item.sourceType, sourceRef: item.sourceRef, sha256: item.sha256 })
    if (!bundle) {
      const researchExpected = detail.assignments.some((assignment) => hasResearchCapability(this.kernel.store.get<EmployeeVersion>('EmployeeVersion', assignment.employeeVersionId)?.capabilityVersionIds ?? []))
      const tenderExpected = detail.assignments.some((assignment) => hasTenderAnalysisCapability(this.kernel.store.get<EmployeeVersion>('EmployeeVersion', assignment.employeeVersionId)?.capabilityVersionIds ?? []))
      const feishuExpected = detail.assignments.some((assignment) => hasFeishuDocumentCapability(this.kernel.store.get<EmployeeVersion>('EmployeeVersion', assignment.employeeVersionId)?.capabilityVersionIds ?? []))
      const unresolvedIssues = researchExpected ? ['没有可导出的 ResearchBundle'] : tenderExpected && tenderEvidence.length === 0 ? ['没有可导出的客户源文件证据'] : feishuExpected && feishuEvidence.length === 0 ? ['没有可导出的飞书文档证据'] : fileArtifacts.length || tenderEvidence.length || feishuEvidence.length ? tenderWarnings : ['没有经过 Runtime 验证的文档写入或编辑结果']
      return { artifactIds: fileArtifacts.map((artifact) => artifact.id), evidenceIds: [...tenderEvidence, ...feishuEvidence].map((item) => item.id), unresolvedIssues }
    }
    const evidence: Evidence[] = [...tenderEvidence, ...feishuEvidence, ...bundle.items.map((item) => ({ schemaVersion: 1 as const, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: item.sourceType, sourceRef: item.url, capturedAt: item.fetchedAt, sha256: item.contentHash }))]
    for (const item of evidence.slice(tenderEvidence.length + feishuEvidence.length)) this.kernel.save({ entityType: 'Evidence', entity: item, immutable: true }, 'evidence.committed', { sourceType: item.sourceType, sourceRef: item.sourceRef })
    if (fileArtifacts.length) return { artifactIds: fileArtifacts.map((artifact) => artifact.id), evidenceIds: evidence.map((item) => item.id), unresolvedIssues: [...tenderWarnings, ...bundle.informationGaps] }
    const finalOutput = detail.assignments.at(-1)?.output?.trim() || '未生成分析报告正文。'
    const sourceLines = bundle.items.map((item, index) => `${index + 1}. [${item.title}](${item.url}) · ${item.sourceType} · ${item.contentHash}`)
    const markdown = `${finalOutput}\n\n## 来源清单\n\n${sourceLines.length ? sourceLines.join('\n') : '没有成功来源。'}\n\n## 信息缺口\n\n${bundle.informationGaps.length ? bundle.informationGaps.map((value) => `- ${value}`).join('\n') : '- 无已记录缺口'}\n`
    const sourceJson = JSON.stringify({ schemaVersion: 1, researchBundleId: bundle.id, contentHash: bundle.contentHash, question: bundle.question, queries: bundle.queries, sourceAttempts: bundle.sourceAttemptIds, sources: bundle.items, claims: bundle.claims, conflicts: bundle.conflicts, informationGaps: bundle.informationGaps }, null, 2) + '\n'
    const pair = this.writePair(safeBaseName(detail.revision!.goal), markdown, sourceJson)
    const artifacts: Artifact[] = [
      { schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, mediaType: 'text/markdown', relativePath: relative(this.root, pair.markdownPath), sha256: sha256(readFileSync(pair.markdownPath)) },
      { schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, mediaType: 'application/json', relativePath: relative(this.root, pair.sourcePath), sha256: sha256(readFileSync(pair.sourcePath)) }
    ]
    for (const artifact of artifacts) this.kernel.save({ entityType: 'Artifact', entity: artifact, immutable: true }, 'artifact.exported', { relativePath: artifact.relativePath, sha256: artifact.sha256 })
    return { artifactIds: artifacts.map((artifact) => artifact.id), evidenceIds: evidence.map((item) => item.id), unresolvedIssues: [...tenderWarnings, ...bundle.informationGaps] }
  }

  private writePair(base: string, markdown: string, sourceJson: string): { markdownPath: string; sourcePath: string } {
    for (let index = 0; index < 10_000; index += 1) {
      const suffix = index === 0 ? '' : `_${index}`
      const markdownPath = join(this.root, `${base}${suffix}.md`)
      const sourcePath = join(this.root, `${base}${suffix}.sources.json`)
      const reservationPath = join(this.root, `.${base}${suffix}.reserve`)
      if (existsSync(markdownPath) || existsSync(sourcePath)) continue
      let reservation: number
      try { reservation = openSync(reservationPath, 'wx', 0o600) } catch { continue }
      closeSync(reservation)
      const markdownTemp = join(this.root, `.${basename(markdownPath)}.${randomUUID()}.tmp`)
      const sourceTemp = join(this.root, `.${basename(sourcePath)}.${randomUUID()}.tmp`)
      let linkedMarkdown = false
      let linkedSource = false
      try {
        writeFileSync(markdownTemp, markdown, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        writeFileSync(sourceTemp, sourceJson, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        linkSync(markdownTemp, markdownPath)
        linkedMarkdown = true
        linkSync(sourceTemp, sourcePath)
        linkedSource = true
        return { markdownPath, sourcePath }
      } catch (error) {
        if (linkedMarkdown && existsSync(markdownPath)) unlinkSync(markdownPath)
        if (linkedSource && existsSync(sourcePath)) unlinkSync(sourcePath)
        throw error
      } finally {
        if (existsSync(markdownTemp)) unlinkSync(markdownTemp)
        if (existsSync(sourceTemp)) unlinkSync(sourceTemp)
        if (existsSync(reservationPath)) unlinkSync(reservationPath)
      }
    }
    throw new Error('export_name_exhausted')
  }
}
