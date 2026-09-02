import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { ToolRunner } from './tool-gateway'

const MAX_DOCUMENT_BYTES = 1_048_576

function within(root: string, target: string): boolean {
  const value = relative(root, target)
  return value === '' || (!value.startsWith('..') && !isAbsolute(value))
}

function authorizedPath(path: unknown, roots: string[], existing: boolean): string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0') || path.length > 4_096) throw new Error('invalid_file_path')
  const target = resolve(path)
  const normalizedRoots = roots.map((root) => realpathSync(resolve(root)))
  if (!normalizedRoots.length) throw new Error('authorized_directory_required')
  const checked = existing ? realpathSync(target) : resolve(realpathSync(dirname(target)), target.split('/').at(-1)!)
  if (!normalizedRoots.some((root) => within(root, checked))) throw new Error('path_outside_authorized_directories')
  if (existing && lstatSync(target).isSymbolicLink()) throw new Error('symbolic_link_blocked')
  return target
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_DOCUMENT_BYTES) throw new Error(`invalid_${name}`)
  return value
}

export const localDocumentRunner: ToolRunner = async (tool, parameters, context) => {
  const roots = context.grantedDirectories ?? []
  if (tool.id === 'document.read@local-document/v1') {
    const path = authorizedPath(parameters.path, roots, true)
    const stat = statSync(path)
    if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) throw new Error('document_not_readable')
    const content = readFileSync(path, 'utf8')
    return { path, content, bytes: stat.size, sha256: createHash('sha256').update(content).digest('hex'), mediaType: 'text/plain' }
  }
  if (tool.id === 'document.create@local-document/v1') {
    const path = authorizedPath(parameters.path, roots, false)
    const content = text(parameters.content, 'document_content')
    const descriptor = openSync(path, 'wx', 0o600)
    try { writeFileSync(descriptor, content, 'utf8') } finally { closeSync(descriptor) }
    const verified = readFileSync(path)
    return { path, bytesWritten: verified.length, sha256: createHash('sha256').update(verified).digest('hex'), mediaType: 'text/plain' }
  }
  if (tool.id === 'document.edit@local-document/v1') {
    const path = authorizedPath(parameters.path, roots, true)
    const oldText = text(parameters.oldText, 'old_text'), newText = text(parameters.newText, 'new_text')
    if (!oldText) throw new Error('invalid_old_text')
    const current = readFileSync(path, 'utf8')
    if (Buffer.byteLength(current) > MAX_DOCUMENT_BYTES) throw new Error('document_too_large')
    const first = current.indexOf(oldText)
    if (first < 0 || current.indexOf(oldText, first + oldText.length) >= 0) throw new Error('edit_conflict')
    const updated = current.slice(0, first) + newText + current.slice(first + oldText.length)
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, updated, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      renameSync(temporary, path)
    } finally { if (existsSync(temporary)) unlinkSync(temporary) }
    const verified = readFileSync(path)
    return { path, replacements: 1, bytesWritten: verified.length, sha256: createHash('sha256').update(verified).digest('hex'), mediaType: 'text/plain' }
  }
  throw new Error('unsupported_local_document_tool')
}
