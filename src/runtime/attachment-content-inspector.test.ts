import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { createAttachmentContentInspector } from './attachment-content-inspector'

const directories: string[] = []

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('attachment content inspector', () => {
  it('extracts bounded content with locators and verifies the imported attachment hash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-attachment-routing-')); directories.push(root)
    const path = join(root, '普通会议纪要.docx')
    const zip = new JSZip().file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>产品周会纪要：讨论登录页面交互与下周排期</w:t></w:r></w:p></w:body></w:document>')
    const bytes = await zip.generateAsync({ type: 'nodebuffer' })
    writeFileSync(path, bytes)
    const attachment = { id: 'meeting-notes', name: '普通会议纪要.docx', path, mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }

    const [evidence] = await createAttachmentContentInspector()([attachment])

    expect(evidence).toMatchObject({ attachmentId: 'meeting-notes', trust: 'untrusted_customer_content', status: 'extracted', format: 'word', sections: [{ locator: '段落 1', text: '产品周会纪要：讨论登录页面交互与下周排期' }] })
  })

  it('does not expose content when the current file no longer matches the imported hash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-employee-os-attachment-routing-')); directories.push(root)
    const path = join(root, 'changed.docx')
    const zip = new JSZip().file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>已被替换的内容</w:t></w:r></w:p></w:body></w:document>')
    const bytes = await zip.generateAsync({ type: 'nodebuffer' })
    writeFileSync(path, bytes)

    const [evidence] = await createAttachmentContentInspector()([{ id: 'changed', name: 'changed.docx', path, mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: bytes.length, sha256: 'a'.repeat(64) }])

    expect(evidence).toMatchObject({ status: 'failed', failureCode: 'attachment_hash_mismatch' })
    expect(evidence.sections).toBeUndefined()
  })
})
