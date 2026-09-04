import { dirname } from 'node:path'
import type { MessageAttachmentReference } from './domain'
import { extractDocument, type ImageTextRecognizer } from './tender-document-runner'

export interface AttachmentContentEvidence {
  attachmentId: string
  name: string
  mediaType: string
  sha256: string
  trust: 'untrusted_customer_content'
  status: 'extracted' | 'failed'
  format?: 'word' | 'powerpoint' | 'excel' | 'pdf' | 'image'
  sections?: Array<{ locator: string; text: string }>
  truncated?: boolean
  failureCode?: string
}

export type AttachmentContentInspector = (attachments: MessageAttachmentReference[]) => Promise<AttachmentContentEvidence[]>

export function createAttachmentContentInspector(recognizeImage?: ImageTextRecognizer): AttachmentContentInspector {
  return async (attachments) => {
    if (!attachments.length) return []
    const perAttachmentLimit = Math.max(2_000, Math.floor(24_000 / attachments.length))
    return Promise.all(attachments.map(async (attachment): Promise<AttachmentContentEvidence> => {
      try {
        const document = await extractDocument(attachment.path, [dirname(attachment.path)], recognizeImage, perAttachmentLimit)
        if (document.sha256 !== attachment.sha256) throw new Error('attachment_hash_mismatch')
        return { attachmentId: attachment.id, name: attachment.name, mediaType: attachment.mediaType, sha256: attachment.sha256, trust: 'untrusted_customer_content', status: 'extracted', format: document.format, sections: document.sections, truncated: document.truncated }
      } catch (error) {
        const failureCode = error instanceof Error ? error.message.split(':')[0] : 'attachment_content_unavailable'
        return { attachmentId: attachment.id, name: attachment.name, mediaType: attachment.mediaType, sha256: attachment.sha256, trust: 'untrusted_customer_content', status: 'failed', failureCode }
      }
    }))
  }
}
