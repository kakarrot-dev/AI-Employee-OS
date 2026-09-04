export interface ChatContentMetricView {
  label: string
  value: string
}

export interface ChatContentDetailView {
  label: string
  content: string
}

/**
 * Presentation-safe content shared by Runtime, Main and Renderer.
 * Raw model output and tool payloads must be projected into this contract
 * before they enter the chat timeline.
 */
export interface ChatContentView {
  schemaVersion: 1
  title: string
  summary: string
  metrics?: ChatContentMetricView[]
  detail?: ChatContentDetailView
}

export function isChatContentView(value: unknown): value is ChatContentView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<ChatContentView>
  if (candidate.schemaVersion !== 1 || typeof candidate.title !== 'string' || !candidate.title.trim() || typeof candidate.summary !== 'string' || !candidate.summary.trim()) return false
  if (candidate.metrics !== undefined && (!Array.isArray(candidate.metrics) || candidate.metrics.length > 8 || candidate.metrics.some((item) => !item || typeof item.label !== 'string' || !item.label.trim() || typeof item.value !== 'string' || !item.value.trim()))) return false
  if (candidate.detail !== undefined && (!candidate.detail || typeof candidate.detail.label !== 'string' || !candidate.detail.label.trim() || typeof candidate.detail.content !== 'string' || !candidate.detail.content.trim())) return false
  return true
}

export function toPlainTimelineSummary(value: string, maxLength = 280): string {
  const plain = value
    .replaceAll('\r\n', '\n')
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, ' ')
    .replace(/(^|[\s|])(?::?-{3,}:?)(?=$|[\s|])/g, '$1')
    .replace(/^\s*\||\|\s*$/gm, '')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/(\*\*|__|~~)([\s\S]*?)\1/g, '$2')
    .replace(/([*_])([^*_\n]+)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+#{1,6}\s+/g, ' ')
    .replace(/\s*\|\s*/g, '；')
    .replace(/；{2,}/g, '；')
    .replaceAll(/\s+/g, ' ')
    .replace(/^；|；$/g, '')
    .trim()
  const characters = [...plain]
  const limit = Math.max(1, Math.floor(maxLength))
  return characters.length > limit ? `${characters.slice(0, limit).join('').trimEnd()}…` : plain
}

/**
 * Keeps lightweight Markdown for user-facing result copy while normalizing the
 * model's formatting. Audit payloads and file references are rendered by their
 * own UI contracts, so images, raw HTML and code fences do not belong here.
 */
export function toResultMarkdown(value: string, maxLength = 600): string {
  const markdown = value
    .replaceAll('\r\n', '\n')
    .replace(/^[ \t]*```[^\n]*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const characters = [...markdown]
  const limit = Math.max(1, Math.floor(maxLength))
  return characters.length > limit ? `${characters.slice(0, limit).join('').trimEnd()}…` : markdown
}

export function toPlainChatDetail(value: string, maxLength = 1_200): string {
  const lines = value
    .replaceAll('\r\n', '\n')
    .replace(/^[ \t]*```[^\n]*$/gm, '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]+/gm, '• ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/(\*\*|__|~~)([\s\S]*?)\1/g, '$2')
    .replace(/([*_])([^*_\n]+)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .split('\n')
    .map((line) => {
      if (/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/.test(line)) return null
      return line.trim().replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' · ').replace(/[ \t]+/g, ' ').trim()
    })
    .filter((line): line is string => line !== null)
  const plain = lines
    .filter((line, index) => line || (index > 0 && Boolean(lines[index - 1]) && index < lines.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const characters = [...plain]
  const limit = Math.max(1, Math.floor(maxLength))
  return characters.length > limit ? `${characters.slice(0, limit).join('').trimEnd()}…` : plain
}

export function legacyChatContent(summary: string, title = '阶段工作已完成'): ChatContentView {
  return { schemaVersion: 1, title, summary: toPlainTimelineSummary(summary) || '当前阶段没有可展示的摘要。' }
}
