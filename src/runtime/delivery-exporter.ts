import { closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Artifact, Evidence, ResearchBundle } from './domain'
import type { FormalTaskDetail } from './task-service'
import { RuntimeKernel } from './kernel'

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
    if (!bundle) {
      const researchExpected = detail.assignments.some((assignment) => this.kernel.store.get<any>('EmployeeVersion', assignment.employeeVersionId)?.capabilityVersionIds?.includes('capability.managed-research.v1'))
      return { artifactIds: [], evidenceIds: [], unresolvedIssues: researchExpected ? ['没有可导出的 ResearchBundle'] : [] }
    }
    const finalOutput = detail.assignments.at(-1)?.output?.trim() || '未生成分析报告正文。'
    const sourceLines = bundle.items.map((item, index) => `${index + 1}. [${item.title}](${item.url}) · ${item.sourceType} · ${item.contentHash}`)
    const markdown = `${finalOutput}\n\n## 来源清单\n\n${sourceLines.length ? sourceLines.join('\n') : '没有成功来源。'}\n\n## 信息缺口\n\n${bundle.informationGaps.length ? bundle.informationGaps.map((value) => `- ${value}`).join('\n') : '- 无已记录缺口'}\n`
    const sourceJson = JSON.stringify({ schemaVersion: 1, researchBundleId: bundle.id, contentHash: bundle.contentHash, question: bundle.question, queries: bundle.queries, sourceAttempts: bundle.sourceAttemptIds, sources: bundle.items, claims: bundle.claims, conflicts: bundle.conflicts, informationGaps: bundle.informationGaps }, null, 2) + '\n'
    const pair = this.writePair(safeBaseName(detail.revision!.goal), markdown, sourceJson)
    const timestamp = new Date().toISOString()
    const artifacts: Artifact[] = [
      { schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, mediaType: 'text/markdown', relativePath: relative(this.root, pair.markdownPath), sha256: sha256(readFileSync(pair.markdownPath)) },
      { schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, mediaType: 'application/json', relativePath: relative(this.root, pair.sourcePath), sha256: sha256(readFileSync(pair.sourcePath)) }
    ]
    const evidence: Evidence[] = bundle.items.map((item) => ({ schemaVersion: 1, id: randomUUID(), createdAt: timestamp, runId: detail.run!.id, version: 1, sourceType: item.sourceType, sourceRef: item.url, capturedAt: item.fetchedAt, sha256: item.contentHash }))
    for (const artifact of artifacts) this.kernel.save({ entityType: 'Artifact', entity: artifact, immutable: true }, 'artifact.exported', { relativePath: artifact.relativePath, sha256: artifact.sha256 })
    for (const item of evidence) this.kernel.save({ entityType: 'Evidence', entity: item, immutable: true }, 'evidence.committed', { sourceType: item.sourceType, sourceRef: item.sourceRef })
    return { artifactIds: artifacts.map((artifact) => artifact.id), evidenceIds: evidence.map((item) => item.id), unresolvedIssues: [...bundle.informationGaps] }
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
