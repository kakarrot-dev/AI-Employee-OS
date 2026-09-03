import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { ToolRunner } from './tool-gateway'

const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const MAX_EXTRACTED_CHARACTERS = 32_000

interface ExtractedSection { locator: string; text: string }
export interface ExtractedDocument { path: string; name: string; format: 'word' | 'powerpoint' | 'excel' | 'pdf' | 'image'; sha256: string; sections: ExtractedSection[]; truncated: boolean }
export type ImageTextRecognizer = (path: string) => Promise<Array<{ text: string; confidence?: number }>>

function within(root: string, target: string): boolean {
  const value = relative(root, target)
  return value === '' || (!value.startsWith('..') && !isAbsolute(value))
}

function authorizedFile(path: unknown, roots: string[]): string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0') || path.length > 4_096) throw new Error('invalid_file_path')
  const target = realpathSync(resolve(path))
  if (!roots.map((root) => realpathSync(resolve(root))).some((root) => within(root, target))) throw new Error('path_outside_authorized_directories')
  if (lstatSync(target).isSymbolicLink()) throw new Error('symbolic_link_blocked')
  const stat = statSync(target)
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SOURCE_BYTES) throw new Error('document_not_readable')
  return target
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function tagText(xml: string, tagPattern = '[aw]:t'): string {
  return [...xml.matchAll(new RegExp(`<${tagPattern}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagPattern}>`, 'g'))].map((match) => decodeXml(match[1])).join('').replaceAll(/\s+/g, ' ').trim()
}

function limitSections(sections: ExtractedSection[], limit: number): { sections: ExtractedSection[]; truncated: boolean } {
  const output: ExtractedSection[] = []
  let used = 0
  for (const section of sections) {
    const remaining = limit - used
    if (remaining <= 0) return { sections: output, truncated: true }
    const text = section.text.slice(0, remaining)
    if (text) output.push({ ...section, text })
    used += text.length
    if (text.length < section.text.length) return { sections: output, truncated: true }
  }
  return { sections: output, truncated: false }
}

async function extractWord(path: string, bytes: Buffer, limit: number): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(bytes)
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('invalid_docx')
  const xml = await entry.async('text')
  const sections = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match, index) => ({ locator: `段落 ${index + 1}`, text: tagText(match[1], 'w:t') })).filter((item) => item.text)
  const limited = limitSections(sections, limit)
  return { path, name: path.split('/').at(-1)!, format: 'word', sha256: createHash('sha256').update(bytes).digest('hex'), ...limited }
}

async function extractPowerPoint(path: string, bytes: Buffer, limit: number): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(bytes)
  const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
  if (!slideNames.length) throw new Error('invalid_pptx')
  const sections: ExtractedSection[] = []
  for (const [index, name] of slideNames.entries()) {
    const xml = await zip.file(name)!.async('text')
    const text = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map((match) => tagText(match[1], 'a:t')).filter(Boolean).join(' | ')
    if (text) sections.push({ locator: `幻灯片 ${index + 1}`, text })
    const notes = zip.file(`ppt/notesSlides/notesSlide${index + 1}.xml`)
    if (notes) {
      const notesXml = await notes.async('text')
      const notesText = [...notesXml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map((match) => tagText(match[1], 'a:t')).filter(Boolean).join(' | ')
      if (notesText) sections.push({ locator: `幻灯片 ${index + 1} 备注`, text: notesText })
    }
  }
  const limited = limitSections(sections, limit)
  return { path, name: path.split('/').at(-1)!, format: 'powerpoint', sha256: createHash('sha256').update(bytes).digest('hex'), ...limited }
}

async function extractExcel(path: string, bytes: Buffer, limit: number): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(bytes)
  const workbook = zip.file('xl/workbook.xml'), relationships = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbook || !relationships) throw new Error('invalid_xlsx')
  const [workbookXml, relationshipXml, sharedXml] = await Promise.all([workbook.async('text'), relationships.async('text'), zip.file('xl/sharedStrings.xml')?.async('text') ?? ''])
  const sharedStrings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => tagText(match[1], '(?:t|r:t)'))
  const targets = new Map([...relationshipXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>(?:<\/Relationship>)?/g)].map((match) => [match[1], match[2]]))
  const sheets = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*(?:r:id|id)="([^"]+)"[^>]*\/?>(?:<\/sheet>)?/g)].map((match) => ({ name: decodeXml(match[1]), target: targets.get(match[2]) }))
  const sections: ExtractedSection[] = []
  for (const sheet of sheets) {
    if (!sheet.target) continue
    const entry = zip.file(`xl/${sheet.target.replace(/^\//, '')}`)
    if (!entry) continue
    const xml = await entry.async('text')
    for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const cell = /\br="([^"]+)"/.exec(match[1])?.[1]
      if (!cell) continue
      const type = /\bt="([^"]+)"/.exec(match[1])?.[1]
      const raw = /<v>([\s\S]*?)<\/v>/.exec(match[2])?.[1]
      const inline = tagText(match[2], '(?:t|is:t)')
      const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(match[2])?.[1]
      const value = type === 's' && raw !== undefined ? sharedStrings[Number(raw)] ?? raw : inline || (raw === undefined ? '' : decodeXml(raw))
      const text = `${formula ? `=${decodeXml(formula)} → ` : ''}${value}`.trim()
      if (text) sections.push({ locator: `${sheet.name}!${cell}`, text })
    }
  }
  const limited = limitSections(sections, limit)
  return { path, name: path.split('/').at(-1)!, format: 'excel', sha256: createHash('sha256').update(bytes).digest('hex'), ...limited }
}

async function extractPdf(path: string, bytes: Buffer, limit: number): Promise<ExtractedDocument> {
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('invalid_pdf')
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const loadingTask = getDocument({ data: new Uint8Array(bytes) })
  const pdf = await loadingTask.promise
  const sections: ExtractedSection[] = []
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').replaceAll(/\s+/g, ' ').trim()
      if (text) sections.push({ locator: `第 ${pageNumber} 页`, text })
    }
  } finally { await loadingTask.destroy() }
  const limited = limitSections(sections, limit)
  return { path, name: path.split('/').at(-1)!, format: 'pdf', sha256: createHash('sha256').update(bytes).digest('hex'), ...limited }
}

async function extractImage(path: string, bytes: Buffer, limit: number, recognizeImage: ImageTextRecognizer): Promise<ExtractedDocument> {
  const recognized = await recognizeImage(path)
  const sections = recognized.map((item, index) => ({ locator: `文字区域 ${index + 1}`, text: item.text.replaceAll(/\s+/g, ' ').trim() })).filter((item) => item.text)
  const limited = limitSections(sections, limit)
  return { path, name: path.split('/').at(-1)!, format: 'image', sha256: createHash('sha256').update(bytes).digest('hex'), ...limited }
}

export function nativeImageTextRecognizer(helperPath: string): ImageTextRecognizer {
  return async (path) => {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(helperPath, [path], { encoding: 'utf8', timeout: 25_000, maxBuffer: 4 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'zh_CN.UTF-8' } }, (error, value) => error ? reject(new Error('image_ocr_failed')) : resolve(value))
    })
    const parsed = JSON.parse(stdout) as { schemaVersion?: unknown; lines?: unknown }
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.lines)) throw new Error('image_ocr_invalid_result')
    return parsed.lines.map((line) => {
      if (!line || typeof line !== 'object' || typeof (line as { text?: unknown }).text !== 'string') throw new Error('image_ocr_invalid_result')
      const value = line as { text: string; confidence?: unknown }
      return { text: value.text, ...(typeof value.confidence === 'number' ? { confidence: value.confidence } : {}) }
    })
  }
}

export async function extractTenderDocuments(paths: string[], roots: string[], recognizeImage?: ImageTextRecognizer): Promise<ExtractedDocument[]> {
  if (!paths.length || paths.length > 8 || new Set(paths).size !== paths.length) throw new Error('invalid_tender_documents')
  const perDocumentLimit = Math.max(4_000, Math.floor(MAX_EXTRACTED_CHARACTERS / paths.length))
  return Promise.all(paths.map(async (inputPath) => {
    const path = authorizedFile(inputPath, roots)
    const bytes = readFileSync(path)
    const extension = extname(path).toLowerCase()
    if (extension === '.docx') return extractWord(path, bytes, perDocumentLimit)
    if (extension === '.pptx') return extractPowerPoint(path, bytes, perDocumentLimit)
    if (extension === '.xlsx') return extractExcel(path, bytes, perDocumentLimit)
    if (extension === '.pdf') return extractPdf(path, bytes, perDocumentLimit)
    if (['.png', '.jpg', '.jpeg', '.webp', '.heic'].includes(extension)) {
      if (!recognizeImage) throw new Error('image_ocr_unavailable')
      return extractImage(path, bytes, perDocumentLimit, recognizeImage)
    }
    throw new Error('unsupported_attachment_type')
  }))
}

export function createTenderDocumentRunner(recognizeImage?: ImageTextRecognizer): ToolRunner {
  return async (tool, parameters, context) => {
    if (tool.id !== 'tender.requirements.extract@document-analysis/v1') throw new Error('unsupported_tender_document_tool')
    if (!Array.isArray(parameters.paths) || parameters.paths.some((path) => typeof path !== 'string')) throw new Error('invalid_tender_documents')
    const documents = await extractTenderDocuments(parameters.paths, context.grantedDirectories ?? [], recognizeImage)
    return {
      status: 'succeeded',
      documents,
      totalCharacters: documents.reduce((total, document) => total + document.sections.reduce((sum, section) => sum + section.text.length, 0), 0),
      warnings: documents.flatMap((document) => [
        ...(document.truncated ? [`${document.name} 内容超过单次分析上限，已保留可定位内容；未覆盖部分必须标记为待澄清`] : []),
        ...(document.sections.length === 0 ? [`${document.name} 没有识别到可分析文本`] : [])
      ])
    }
  }
}
