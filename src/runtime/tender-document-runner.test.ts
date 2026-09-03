import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { extractTenderDocuments } from './tender-document-runner'

const directories: string[] = []

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-tender-'))
  directories.push(directory)
  return directory
}

async function officeFixture(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, value] of Object.entries(entries)) zip.file(name, value)
  return zip.generateAsync({ type: 'nodebuffer' })
}

function pdfFixture(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length + 35} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body)
}

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('tender document runner', () => {
  it('extracts Word, PowerPoint, Excel, PDF and images with stable source locators and hashes', async () => {
    const root = workspace()
    const docx = join(root, '客户需求.docx')
    const pptx = join(root, '技术交流.pptx')
    const xlsx = join(root, '响应清单.xlsx')
    const pdf = join(root, '招标公告.pdf')
    const image = join(root, '现场照片.png')
    writeFileSync(docx, await officeFixture({ 'word/document.xml': '<w:document><w:body><w:p><w:tbl>结构标记</w:tbl><w:r><w:t>必须支持单点登录</w:t></w:r></w:p></w:body></w:document>' }))
    writeFileSync(pptx, await officeFixture({ 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>项目须在六月交付</a:t></a:r></a:p></p:sld>' }))
    writeFileSync(xlsx, await officeFixture({
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="需求表" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>等保三级</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="B2" t="s"><v>0</v></c></row></sheetData></worksheet>'
    }))
    writeFileSync(pdf, pdfFixture('Bid security is mandatory'))
    writeFileSync(image, Buffer.from('test-image-bytes'))

    const documents = await extractTenderDocuments([docx, pptx, xlsx, pdf, image], [root], async () => [{ text: '机房需保留双路供电', confidence: 0.98 }])
    expect(documents.map((document) => document.format)).toEqual(['word', 'powerpoint', 'excel', 'pdf', 'image'])
    expect(documents.map((document) => document.sections[0])).toEqual([
      { locator: '段落 1', text: '必须支持单点登录' },
      { locator: '幻灯片 1', text: '项目须在六月交付' },
      { locator: '需求表!B2', text: '等保三级' },
      { locator: '第 1 页', text: 'Bid security is mandatory' },
      { locator: '文字区域 1', text: '机房需保留双路供电' }
    ])
    expect(documents.every((document) => /^[a-f0-9]{64}$/.test(document.sha256))).toBe(true)
  })

  it('rejects files outside the frozen directory grant', async () => {
    const allowed = workspace(), outside = workspace()
    const path = join(outside, '客户需求.docx')
    writeFileSync(path, await officeFixture({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>需求</w:t></w:r></w:p></w:body></w:document>' }))
    await expect(extractTenderDocuments([path], [allowed])).rejects.toThrow('path_outside_authorized_directories')
  })
})
