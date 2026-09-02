import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResearchItem, ResearchSourceType, ToolVersion } from './domain'
import type { ToolRunner } from './tool-gateway'

const LAST30DAYS_SKILL = join(homedir(), '.codex/skills/last30days')

interface CommandResult { status: number; stdout: string; stderr: string }

function commandEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME
  }
}

function run(command: string, args: string[], signal: AbortSignal, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, env: commandEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    let bytes = 0
    const collect = (target: Buffer[], chunk: Buffer): void => {
      if (bytes >= 2_000_000) return
      const remaining = 2_000_000 - bytes
      target.push(chunk.subarray(0, remaining)); bytes += Math.min(chunk.length, remaining)
    }
    child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk))
    child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk))
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    const abort = (): void => { child.kill('SIGTERM') }
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true })
    child.once('error', reject)
    child.once('close', (status) => {
      clearTimeout(timer); signal.removeEventListener('abort', abort)
      resolve({ status: status ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') })
    })
  })
}

function injectionSignals(text: string): string[] {
  const signals: string[] = []
  if (/ignore\s+(all\s+)?previous\s+instructions?/i.test(text) || /忽略.{0,12}(指令|规则|限制)/.test(text)) signals.push('instruction_override')
  if (/system\s+prompt|rungrant/i.test(text)) signals.push('control_plane_reference')
  if (/(api[_-]?key|authorization|cookie|password|密钥|凭据)/i.test(text)) signals.push('sensitive_data_reference')
  return signals
}

function asItem(sourceType: ResearchSourceType, fetchedAt: string, value: { url: string; title?: string; summary?: string; author?: string; publishedAt?: string }): Omit<ResearchItem, 'sourceAttemptId'> {
  const title = (value.title || value.url).slice(0, 500)
  const summary = (value.summary || '').replaceAll(/\s+/g, ' ').trim().slice(0, 1_200)
  return { sourceType, url: value.url, title, summary, author: value.author?.slice(0, 200), publishedAt: value.publishedAt, fetchedAt, contentHash: createHash('sha256').update(`${title}\n${summary}\n${value.url}`).digest('hex'), trust: 'untrusted_external_content', injectionSignals: injectionSignals(`${title}\n${summary}`) }
}

function collectJsonItems(value: unknown, sourceType: ResearchSourceType, fetchedAt: string, limit: number): Array<Omit<ResearchItem, 'sourceAttemptId'>> {
  const found: Array<Omit<ResearchItem, 'sourceAttemptId'>> = []
  const seen = new Set<string>()
  const visit = (current: unknown): void => {
    if (found.length >= limit || !current) return
    if (Array.isArray(current)) { current.forEach(visit); return }
    if (typeof current !== 'object') return
    const record = current as Record<string, unknown>
    const url = [record.url, record.link, record.html_url, record.permalink].find((item) => typeof item === 'string' && /^https?:\/\//.test(item)) as string | undefined
    if (url && !seen.has(url)) {
      seen.add(url)
      const title = [record.title, record.name, record.full_name].find((item) => typeof item === 'string') as string | undefined
      const summary = [record.summary, record.description, record.content, record.text, record.snippet].find((item) => typeof item === 'string') as string | undefined
      found.push(asItem(sourceType, fetchedAt, { url, title, summary, author: typeof record.author === 'string' ? record.author : undefined, publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : typeof record.created_at === 'string' ? record.created_at : undefined }))
    }
    Object.values(record).forEach(visit)
  }
  visit(value)
  return found
}

function collectTextItems(text: string, sourceType: ResearchSourceType, fetchedAt: string, limit: number): Array<Omit<ResearchItem, 'sourceAttemptId'>> {
  const urls = [...text.matchAll(/https?:\/\/[^\s)\]}>"']+/g)].map((match) => match[0])
  return [...new Set(urls)].slice(0, limit).map((url) => asItem(sourceType, fetchedAt, { url, summary: text.slice(Math.max(0, text.indexOf(url) - 180), text.indexOf(url) + url.length + 420) }))
}

function normalize(stdout: string, sourceType: ResearchSourceType, fetchedAt: string, limit: number): Array<Omit<ResearchItem, 'sourceAttemptId'>> {
  try {
    const items = collectJsonItems(JSON.parse(stdout), sourceType, fetchedAt, limit)
    if (items.length) return items
  } catch { /* some CLIs emit text or YAML */ }
  return collectTextItems(stdout, sourceType, fetchedAt, limit)
}

async function runOpenCli(query: string, limit: number, signal: AbortSignal): Promise<CommandResult> {
  const commands = [
    ['reddit', 'search', query, '-f', 'json'],
    ['twitter', 'search', query, '-f', 'json'],
    ['xiaohongshu', 'search', query, '-f', 'json']
  ]
  const outputs: string[] = [], errors: string[] = []
  let success = 0
  for (const args of commands) {
    if (signal.aborted) break
    const result = await run('opencli', args, signal, 15_000)
    if (result.status === 0) { success += 1; outputs.push(result.stdout) } else errors.push(`${args[0]}:${result.stderr.slice(0, 300)}`)
  }
  return { status: success > 0 ? 0 : 1, stdout: `[${outputs.map((value) => { try { return JSON.stringify(JSON.parse(value)) } catch { return JSON.stringify({ text: value }) } }).join(',')}]`, stderr: errors.join('\n') }
}

export const externalIntelligenceRunner: ToolRunner = async (tool: ToolVersion, parameters, context) => {
  const query = String(parameters.query ?? '')
  const limit = Number(parameters.limit ?? 5)
  const fetchedAt = new Date().toISOString()
  let sourceType: ResearchSourceType, result: CommandResult, url: string
  if (tool.id === 'agent-reach.search@network-intelligence/v1') {
    sourceType = 'agent_reach_web'; url = 'https://github.com/Panniantong/Agent-Reach'
    const expression = `exa.web_search_exa(query: ${JSON.stringify(query)}, numResults: ${limit})`
    result = await run('mcporter', ['call', expression], context.signal, tool.timeoutMs)
  } else if (tool.id === 'last30days.research@network-intelligence/v1') {
    sourceType = 'last30days'; url = 'https://github.com/mvanhorn/last30days-skill'
    const temporary = mkdtempSync(join(tmpdir(), 'ai-employee-os-last30days-'))
    try {
      result = await run('python3', [join(LAST30DAYS_SKILL, 'scripts/last30days.py'), query, '--quick', '--emit', 'json', '--json-profile', 'agent', '--no-browser-cookies', '--save-dir', temporary], context.signal, tool.timeoutMs)
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  } else if (tool.id === 'opencli.social-search@network-intelligence/v1') {
    sourceType = 'opencli_social'; url = 'https://github.com/jackwener/OpenCLI'
    result = await runOpenCli(query, limit, context.signal)
  } else throw new Error('unsupported_external_intelligence_tool')
  const items = normalize(result.stdout, sourceType, fetchedAt, limit)
  return { adapterVersionId: tool.id, sourceType, query, url, status: result.status === 0 ? 'succeeded' : 'failed', fetchedAt, truncated: result.stdout.length >= 2_000_000, failureCode: result.status === 0 ? undefined : 'external_cli_failed', diagnostic: result.status === 0 ? undefined : result.stderr.slice(0, 1_000), items }
}

export function probeExternalIntelligenceTool(toolId: string): { available: boolean; failureCode?: string } {
  let command: string, args: string[]
  if (toolId.startsWith('agent-reach.')) { command = 'agent-reach'; args = ['--version'] }
  else if (toolId.startsWith('last30days.')) {
    if (!existsSync(join(LAST30DAYS_SKILL, 'scripts/last30days.py'))) return { available: false, failureCode: 'last30days_skill_missing' }
    command = 'python3'; args = [join(LAST30DAYS_SKILL, 'scripts/last30days.py'), '--diagnose']
  } else if (toolId.startsWith('opencli.')) { command = 'opencli'; args = ['doctor'] }
  else return { available: false, failureCode: 'unknown_external_tool' }
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15_000, shell: false, env: commandEnvironment(), maxBuffer: 1_000_000 })
  return result.status === 0 ? { available: true } : { available: false, failureCode: result.error ? 'dependency_missing' : 'dependency_health_failed' }
}
