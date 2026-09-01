import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import type { ResearchItem, ToolVersion } from './domain'
import type { ToolRunner } from './tool-gateway'

const MAX_BODY_BYTES = 1_000_000
const MAX_REDIRECTS = 3

interface HttpResult { status: number; headers: Record<string, string>; body: string; url: string; truncated: boolean }

function isForbiddenAddress(address: string): boolean {
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true
  const mapped = address.startsWith('::ffff:') ? address.slice(7) : address
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(mapped)) return false
  const [a, b] = mapped.split('.').map(Number)
  if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true
  if (a === 198 && (b === 18 || b === 19)) return process.env.AI_EMPLOYEE_OS_APPROVED_PROXY_VIRTUAL_DNS !== '1'
  return false
}

async function resolvePublic(hostname: string): Promise<string> {
  if (hostname.toLowerCase() === 'localhost') throw new Error('ssrf_target_blocked')
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isForbiddenAddress(address))) throw new Error('ssrf_target_blocked')
  return addresses[0].address
}

async function getHttps(urlText: string, signal: AbortSignal, redirects = 0): Promise<HttpResult> {
  const url = new URL(urlText)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('invalid_https_target')
  const address = await resolvePublic(url.hostname)
  const result = await new Promise<HttpResult>((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:', hostname: url.hostname, servername: url.hostname, path: `${url.pathname}${url.search}`, method: 'GET',
      headers: { Accept: 'application/vnd.github+json, application/atom+xml, application/rss+xml, application/xml, text/xml', 'Accept-Encoding': 'identity', 'User-Agent': 'AI-Employee-OS/0.1' },
      lookup: ((_hostname: string, options: { all?: boolean }, callback: (...values: unknown[]) => void) => {
        const family = isIP(address) as 4 | 6
        if (options.all) callback(null, [{ address, family }])
        else callback(null, address, family)
      }) as never
    }, (response) => {
      const chunks: Buffer[] = []
      let bytes = 0
      let truncated = false
      response.on('data', (chunk: Buffer) => {
        if (bytes >= MAX_BODY_BYTES) { truncated = true; return }
        const remaining = MAX_BODY_BYTES - bytes
        chunks.push(chunk.subarray(0, remaining)); bytes += Math.min(chunk.length, remaining)
        if (chunk.length > remaining) truncated = true
      })
      response.on('end', () => {
        const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value ?? '')]))
        resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8'), url: url.toString(), truncated })
      })
    })
    request.on('error', reject)
    const abort = (): void => { request.destroy(new Error('tool_timeout')) }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    request.end()
  })
  if ([301, 302, 303, 307, 308].includes(result.status)) {
    if (redirects >= MAX_REDIRECTS) throw new Error('too_many_redirects')
    const location = result.headers.location
    if (!location) throw new Error('invalid_redirect')
    return getHttps(new URL(location, url).toString(), signal, redirects + 1)
  }
  return result
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

function tag(block: string, name: string): string | undefined {
  return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]
}

function injectionSignals(text: string): string[] {
  const signals: string[] = []
  if (/ignore\s+(all\s+)?previous\s+instructions?/i.test(text) || /忽略.{0,12}(指令|规则|限制)/.test(text)) signals.push('instruction_override')
  if (/system\s+prompt|rungrant/i.test(text)) signals.push('control_plane_reference')
  if (/(api[_-]?key|authorization|cookie|password|密钥|凭据)/i.test(text)) signals.push('sensitive_data_request')
  return signals
}

function item(base: Omit<ResearchItem, 'sourceAttemptId'>): Omit<ResearchItem, 'sourceAttemptId'> { return base }

function parseGithub(body: string, fetchedAt: string, limit: number): Array<Omit<ResearchItem, 'sourceAttemptId'>> {
  const parsed = JSON.parse(body) as { items?: Array<{ html_url?: string; full_name?: string; owner?: { login?: string }; updated_at?: string; description?: string }> }
  return (parsed.items ?? []).slice(0, limit).flatMap((entry) => {
    if (!entry.html_url || !entry.full_name) return []
    const summary = String(entry.description ?? '').slice(0, 800)
    return [item({ sourceType: 'github_repository', url: entry.html_url, title: entry.full_name, author: entry.owner?.login, publishedAt: entry.updated_at, fetchedAt, summary, contentHash: createHash('sha256').update(`${entry.full_name}\n${summary}\n${entry.html_url}`).digest('hex'), trust: 'untrusted_external_content', injectionSignals: injectionSignals(`${entry.full_name}\n${summary}`) })]
  })
}

function parseFeed(body: string, fetchedAt: string, limit: number): Array<Omit<ResearchItem, 'sourceAttemptId'>> {
  const blocks = [...body.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0, limit).map((match) => match[2])
  return blocks.flatMap((block) => {
    const title = decodeXml(tag(block, 'title') ?? '')
    const linkTag = tag(block, 'link')
    const linkAttr = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]
    const url = decodeXml(linkAttr ?? linkTag ?? '')
    if (!title || !url) return []
    const summary = decodeXml(tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content') ?? '').slice(0, 800)
    const author = decodeXml(tag(block, 'author') ?? tag(block, 'dc:creator') ?? '') || undefined
    const publishedAt = decodeXml(tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? '') || undefined
    return [item({ sourceType: 'rss_atom', url, title, author, publishedAt, fetchedAt, summary, contentHash: createHash('sha256').update(`${title}\n${summary}\n${url}`).digest('hex'), trust: 'untrusted_external_content', injectionSignals: injectionSignals(`${title}\n${summary}`) })]
  })
}

async function getWithOneRetry(url: string, signal: AbortSignal): Promise<HttpResult> {
  try { return await getHttps(url, signal) } catch (error) {
    if (signal.aborted) throw error
    return getHttps(url, signal)
  }
}

export const managedResearchRunner: ToolRunner = async (tool: ToolVersion, parameters, context) => {
  const fetchedAt = new Date().toISOString()
  const limit = Number(parameters.limit ?? 5)
  let query: string
  let url: string
  if (tool.id === 'github.repositories.search@research-source/v1') {
    query = String(parameters.query)
    url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`
  } else if (tool.id === 'rss.read@research-source/v1') {
    query = String(parameters.url)
    url = query
  } else throw new Error('unsupported_tool_runner')
  const response = await getWithOneRetry(url, context.signal)
  if (response.status < 200 || response.status >= 300) return { adapterVersionId: tool.id, sourceType: tool.id.startsWith('github') ? 'github_repository' : 'rss_atom', query, url: response.url, status: 'failed', httpStatus: response.status, retryAfter: response.headers['retry-after'], fetchedAt, truncated: response.truncated, items: [] }
  const items = tool.id.startsWith('github') ? parseGithub(response.body, fetchedAt, limit) : parseFeed(response.body, fetchedAt, limit)
  return { adapterVersionId: tool.id, sourceType: tool.id.startsWith('github') ? 'github_repository' : 'rss_atom', query, url: response.url, status: 'succeeded', httpStatus: response.status, fetchedAt, truncated: response.truncated, items }
}
