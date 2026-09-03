import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { MessageAttachmentReference } from '../runtime/domain'

const MAX_ATTACHMENT_COUNT = 8
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024

const mediaTypes = new Map([
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.heic', 'image/heic']
])

function safeName(value: string): string {
  const name = basename(value).normalize('NFC').replaceAll(/[\u0000-\u001f/\\:]/g, '_').trim()
  if (!name || name.length > 180) throw new Error('invalid_attachment_name')
  return name
}

function readManifest(root: string, attachmentId: string): MessageAttachmentReference {
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) throw new Error('invalid_attachment_id')
  const directory = resolve(root, attachmentId)
  if (!directory.startsWith(`${resolve(root)}/`)) throw new Error('invalid_attachment_id')
  const value = JSON.parse(readFileSync(join(directory, 'attachment.json'), 'utf8')) as Partial<MessageAttachmentReference>
  if (value.id !== attachmentId || typeof value.name !== 'string' || typeof value.path !== 'string' || typeof value.mediaType !== 'string' || typeof value.size !== 'number' || typeof value.sha256 !== 'string') throw new Error('invalid_attachment_manifest')
  const path = realpathSync(value.path)
  const realDirectory = realpathSync(directory)
  if (!path.startsWith(`${realDirectory}/`) || !statSync(path).isFile()) throw new Error('invalid_attachment_path')
  return { id: value.id, name: value.name, path, mediaType: value.mediaType, size: value.size, sha256: value.sha256 }
}

export class AttachmentImportService {
  constructor(private readonly root: string) {}

  stage(paths: string[]): MessageAttachmentReference[] {
    if (!paths.length || paths.length > MAX_ATTACHMENT_COUNT || new Set(paths).size !== paths.length) throw new Error('invalid_attachment_selection')
    const inspected = paths.map((inputPath) => {
      const source = realpathSync(inputPath)
      const stat = statSync(source)
      const extension = extname(source).toLowerCase()
      const mediaType = mediaTypes.get(extension)
      if (!stat.isFile() || !mediaType) throw new Error('unsupported_attachment_type')
      if (stat.size < 1 || stat.size > MAX_ATTACHMENT_BYTES) throw new Error('attachment_too_large')
      return { source, stat, mediaType, name: safeName(source) }
    })
    if (inspected.reduce((total, item) => total + item.stat.size, 0) > MAX_TOTAL_BYTES) throw new Error('attachments_too_large')
    mkdirSync(this.root, { recursive: true, mode: 0o700 })
    return inspected.map(({ source, stat, mediaType, name }) => {
      const id = randomUUID()
      const directory = join(this.root, id)
      mkdirSync(directory, { mode: 0o700 })
      const stagedPath = join(directory, name)
      copyFileSync(source, stagedPath)
      const path = realpathSync(stagedPath)
      const bytes = readFileSync(path)
      const attachment: MessageAttachmentReference = { id, name, path, mediaType, size: stat.size, sha256: createHash('sha256').update(bytes).digest('hex') }
      writeFileSync(join(directory, 'attachment.json'), JSON.stringify(attachment), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      return attachment
    })
  }

  resolve(ids: string[]): MessageAttachmentReference[] {
    if (ids.length > MAX_ATTACHMENT_COUNT || new Set(ids).size !== ids.length) throw new Error('invalid_attachment_ids')
    return ids.map((id) => readManifest(this.root, id))
  }

  path(attachmentId: string): string {
    return readManifest(this.root, attachmentId).path
  }
}

export const SUPPORTED_ATTACHMENT_EXTENSIONS = [...mediaTypes.keys()].map((extension) => extension.slice(1))
