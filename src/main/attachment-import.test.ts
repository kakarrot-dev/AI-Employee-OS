import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { AttachmentImportService } from './attachment-import'

describe('AttachmentImportService', () => {
  it('copies an explicitly selected supported file into the managed intake root', () => {
    const root = mkdtempSync(join(tmpdir(), 'attachment-import-'))
    const source = join(root, '客户需求.pdf')
    writeFileSync(source, '%PDF-1.4 test')
    const service = new AttachmentImportService(join(root, 'managed'))
    const [attachment] = service.stage([source])
    expect(attachment).toMatchObject({ name: '客户需求.pdf', mediaType: 'application/pdf', size: 13 })
    expect(readFileSync(attachment.path, 'utf8')).toBe('%PDF-1.4 test')
    expect(service.resolve([attachment.id])).toEqual([attachment])
  })

  it('rejects unsupported formats before copying', () => {
    const root = mkdtempSync(join(tmpdir(), 'attachment-import-'))
    const source = join(root, 'script.sh')
    writeFileSync(source, 'echo unsafe')
    expect(() => new AttachmentImportService(join(root, 'managed')).stage([source])).toThrow('unsupported_attachment_type')
  })

  it('accepts image files for local OCR analysis', () => {
    const root = mkdtempSync(join(tmpdir(), 'attachment-import-'))
    const source = join(root, '现场要求.png')
    writeFileSync(source, Buffer.from('image'))
    const [attachment] = new AttachmentImportService(join(root, 'managed')).stage([source])
    expect(attachment).toMatchObject({ name: '现场要求.png', mediaType: 'image/png', size: 5 })
  })
})
