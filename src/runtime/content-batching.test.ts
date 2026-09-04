import { describe, expect, it } from 'vitest'
import { createSourceManifest, createTenderSourceBatches, createTextBatches, inputBatchCharacterBudget } from './content-batching'
import type { ExtractedDocument } from './tender-document-runner'

describe('content batching contract', () => {
  it('creates a complete multi-file manifest and token-aware batches without dropping source text', () => {
    const documents: ExtractedDocument[] = [
      { path: '/tmp/a.docx', name: 'a.docx', format: 'word', sha256: 'a'.repeat(64), truncated: false, sections: [{ locator: '段落 1', text: '甲'.repeat(8_000) }, { locator: '段落 2', text: '乙'.repeat(8_000) }] },
      { path: '/tmp/b.pdf', name: 'b.pdf', format: 'pdf', sha256: 'b'.repeat(64), truncated: false, sections: [{ locator: '第 1 页', text: '丙'.repeat(8_000) }] }
    ]
    const { manifest, batches } = createTenderSourceBatches(documents, 10_000)
    expect(manifest).toEqual(createSourceManifest(documents))
    expect(manifest.totalCharacters).toBe(24_000)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.every((batch) => batch.content.length <= inputBatchCharacterBudget(10_000))).toBe(true)
    const recovered = batches.flatMap((batch) => batch.content.split('\n')).map((line) => JSON.parse(line) as { text: string }).map((item) => item.text).join('')
    expect(recovered).toBe('甲'.repeat(8_000) + '乙'.repeat(8_000) + '丙'.repeat(8_000))
  })

  it('partitions long intermediate outputs for recursive reduction', () => {
    const values = ['摘要甲'.repeat(4_000), '摘要乙'.repeat(4_000)]
    const batches = createTextBatches(values, 10_000)
    expect(batches.length).toBeGreaterThan(1)
    const recovered = batches.flatMap((batch) => batch.content.split('\n')).map((line) => JSON.parse(line) as { text: string }).map((item) => item.text).join('')
    expect(recovered).toBe(values.join(''))
  })

  it('rejects a source marked as truncated instead of treating partial content as complete', () => {
    expect(() => createTenderSourceBatches([{ path: '/tmp/a', name: 'a', format: 'word', sha256: 'a'.repeat(64), truncated: true, sections: [{ locator: 'x', text: 'partial' }] }], 10_000)).toThrow('incomplete_source_manifest')
  })
})
