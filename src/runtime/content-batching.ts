import { createHash } from 'node:crypto'
import type { ExtractedDocument } from './tender-document-runner'

const MAX_BATCH_CHARACTERS = 24_000
// Reserve enough room for the system/skill contract plus a grounded continuation
// that can carry the current source batch again when an output limit is reached.
const INPUT_RESERVE_TOKENS = 12_000

export interface ContentBatch {
  index: number
  sha256: string
  content: string
}

export interface SourceManifest {
  sha256: string
  totalCharacters: number
  documents: Array<{ path: string; name: string; format: string; sha256: string; sectionCount: number; characterCount: number }>
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }

export function inputBatchCharacterBudget(maxInputTokens: number): number {
  if (!Number.isSafeInteger(maxInputTokens) || maxInputTokens < 2_000) throw new Error('input_token_budget_too_small')
  // One Unicode character is treated as one token. This intentionally
  // overestimates mixed Chinese input and reserves room for prompts/tools.
  return Math.min(MAX_BATCH_CHARACTERS, Math.max(1_000, maxInputTokens - INPUT_RESERVE_TOKENS))
}

export function createSourceManifest(documents: ExtractedDocument[]): SourceManifest {
  const manifest = {
    totalCharacters: documents.reduce((total, document) => total + document.sections.reduce((sum, section) => sum + section.text.length, 0), 0),
    documents: documents.map((document) => ({
      path: document.path,
      name: document.name,
      format: document.format,
      sha256: document.sha256,
      sectionCount: document.sections.length,
      characterCount: document.sections.reduce((sum, section) => sum + section.text.length, 0)
    }))
  }
  return { ...manifest, sha256: sha256(JSON.stringify(manifest)) }
}

function splitRecord(record: Record<string, unknown>, text: string, budget: number): string[] {
  const parts: string[] = []
  let offset = 0
  while (offset < text.length) {
    let low = 1, high = text.length - offset, size = 0
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const serialized = JSON.stringify({ ...record, characterOffset: offset, text: text.slice(offset, offset + middle) })
      if (serialized.length <= budget) { size = middle; low = middle + 1 } else high = middle - 1
    }
    if (size === 0) throw new Error('source_locator_exceeds_input_budget')
    parts.push(JSON.stringify({ ...record, characterOffset: offset, text: text.slice(offset, offset + size) }))
    offset += size
  }
  return parts
}

function packLines(lines: string[], budget: number): ContentBatch[] {
  const contents: string[] = []
  let current = ''
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line
    if (next.length <= budget) { current = next; continue }
    if (current) contents.push(current)
    current = line
  }
  if (current) contents.push(current)
  return contents.map((content, index) => ({ index, sha256: sha256(content), content }))
}

export function createTenderSourceBatches(documents: ExtractedDocument[], maxInputTokens: number): { manifest: SourceManifest; batches: ContentBatch[] } {
  if (!documents.length || documents.some((document) => document.truncated)) throw new Error('incomplete_source_manifest')
  const budget = inputBatchCharacterBudget(maxInputTokens)
  const manifest = createSourceManifest(documents)
  const lines = documents.flatMap((document, documentIndex) => document.sections.flatMap((section, sectionIndex) => splitRecord({
    documentIndex,
    documentName: document.name,
    documentSha256: document.sha256,
    sectionIndex,
    locator: section.locator
  }, section.text, budget)))
  if (!lines.length) throw new Error('empty_source_manifest')
  return { manifest, batches: packLines(lines, budget) }
}

export function createTextBatches(values: string[], maxInputTokens: number): ContentBatch[] {
  const budget = inputBatchCharacterBudget(maxInputTokens)
  const lines = values.flatMap((value, index) => splitRecord({ inputIndex: index }, value, budget))
  return packLines(lines, budget)
}
