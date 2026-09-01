import { randomUUID } from 'node:crypto'
import type { MCPVersion, SkillVersion, SourceHealthCheck, ToolVersion } from './domain'
import { RuntimeKernel } from './kernel'
import { managedResearchRunner } from './managed-research-runner'

export interface ResourceCatalog {
  skills: SkillVersion[]
  tools: ToolVersion[]
  mcps: MCPVersion[]
  healthChecks: SourceHealthCheck[]
}

const now = '2026-08-31T00:00:00.000Z'

const builtInMcp: MCPVersion = {
  schemaVersion: 1,
  id: 'mcp.managed-research-runner.v1',
  createdAt: now,
  name: '受管网络调研 Runner',
  description: '应用内置、固定协议的只读网络来源 Runner；不执行 Agent Reach、Shell 或用户全局 CLI。',
  version: 1,
  transport: 'built_in_runner',
  toolVersionIds: ['github.repositories.search@research-source/v1', 'rss.read@research-source/v1'],
  credentialRequirement: 'optional',
  credentialStatus: 'not_required',
  health: 'available',
  available: true
}

const builtInTools: ToolVersion[] = [
  {
    schemaVersion: 1,
    id: 'github.repositories.search@research-source/v1',
    createdAt: now,
    name: 'GitHub 公开仓库搜索',
    description: '固定 GET https://api.github.com/search/repositories，只接受查询与条目上限。',
    version: 1,
    source: 'mcp',
    mcpVersionId: builtInMcp.id,
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 256 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false },
    sideEffect: 'external_read',
    risk: 'low',
    timeoutMs: 15_000,
    networkOrigins: ['https://api.github.com'],
    available: true,
    health: 'available',
    credentialStatus: 'not_required'
  },
  {
    schemaVersion: 1,
    id: 'rss.read@research-source/v1',
    createdAt: now,
    name: 'RSS/Atom Feed 读取',
    description: '只读取用户授权的公网 HTTPS Feed；每次重定向都重新校验目标。',
    version: 1,
    source: 'mcp',
    mcpVersionId: builtInMcp.id,
    inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri', maxLength: 2048 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false },
    sideEffect: 'external_read',
    risk: 'low',
    timeoutMs: 15_000,
    networkOrigins: ['user_approved_public_https_feed'],
    available: true,
    health: 'available',
    credentialStatus: 'not_required'
  }
]

const builtInSkill: SkillVersion = {
  schemaVersion: 1,
  id: 'skill.managed-research.v1',
  createdAt: now,
  name: '多源网络调研',
  description: '使用固定 GitHub REST 与 RSS/Atom 两类来源，保留失败来源、时间、Hash 与信息缺口。',
  version: 1,
  steps: ['拆分公开、非敏感查询', '分别提交 GitHub 与 RSS ToolAction Proposal', '保留 SourceAttempt 与非可信标记', '形成带来源的 ResearchBundle'],
  toolVersionIds: builtInTools.map((tool) => tool.id),
  available: true
}

export class ResourceService {
  constructor(private readonly kernel: RuntimeKernel) {}

  seed(): void {
    if (!this.kernel.store.get<MCPVersion>('MCPVersion', builtInMcp.id)) this.kernel.save({ entityType: 'MCPVersion', entity: builtInMcp, immutable: true }, 'resource.mcp.seeded', {})
    for (const tool of builtInTools) if (!this.kernel.store.get<ToolVersion>('ToolVersion', tool.id)) this.kernel.save({ entityType: 'ToolVersion', entity: tool, immutable: true }, 'resource.tool.seeded', {})
    if (!this.kernel.store.get<SkillVersion>('SkillVersion', builtInSkill.id)) this.kernel.save({ entityType: 'SkillVersion', entity: builtInSkill, immutable: true }, 'resource.skill.seeded', {})
  }

  list(): ResourceCatalog {
    const healthChecks = this.latestHealthChecks()
    const healthByTool = new Map(healthChecks.map((check) => [check.adapterVersionId, check]))
    const tools = this.kernel.store.list<ToolVersion>('ToolVersion').map((tool) => {
      const check = healthByTool.get(tool.id)
      return check ? { ...tool, health: check.status, available: tool.available && check.status === 'available', reason: check.status === 'available' ? undefined : check.failureCode ?? '数据源健康检查未通过' } : tool
    })
    const toolById = new Map(tools.map((tool) => [tool.id, tool]))
    const mcps = this.kernel.store.list<MCPVersion>('MCPVersion').map((mcp) => {
      const dependencies = mcp.toolVersionIds.map((id) => toolById.get(id))
      const available = mcp.available && dependencies.every((tool) => tool?.available)
      return { ...mcp, available, health: available ? mcp.health : 'degraded' as const, reason: available ? undefined : '至少一个数据源不可用' }
    })
    return {
      skills: this.kernel.store.list<SkillVersion>('SkillVersion'),
      tools,
      mcps,
      healthChecks
    }
  }

  async probe(): Promise<SourceHealthCheck[]> {
    const probes: Array<{ tool: ToolVersion; parameters: Record<string, unknown> }> = [
      { tool: this.tool('github.repositories.search@research-source/v1'), parameters: { query: 'deep agents', limit: 1 } },
      { tool: this.tool('rss.read@research-source/v1'), parameters: { url: 'https://github.blog/feed/', limit: 1 } }
    ]
    const results = await Promise.all(probes.map(async ({ tool, parameters }) => {
      const started = Date.now()
      let status: SourceHealthCheck['status'] = 'unavailable', failureCode: string | undefined
      try {
        const result = await managedResearchRunner(tool, parameters, { actionId: `health:${tool.id}`, signal: AbortSignal.timeout(Math.min(tool.timeoutMs, 15_000)) })
        status = result.status === 'succeeded' && Array.isArray(result.items) && result.items.length > 0 ? 'available' : 'degraded'
        if (status !== 'available') failureCode = `http_${String(result.httpStatus ?? 'empty')}`
      } catch (error) { failureCode = error instanceof Error ? error.message.split(':')[0] : 'health_probe_failed' }
      const check: SourceHealthCheck = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), adapterVersionId: tool.id, status, credentialStatus: tool.credentialStatus, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), failureCode }
      this.kernel.save({ entityType: 'SourceHealthCheck', entity: check, immutable: true }, 'resource.health_checked', { adapterVersionId: tool.id, status, failureCode })
      return check
    }))
    return results
  }

  tool(id: string): ToolVersion {
    const tool = this.kernel.store.get<ToolVersion>('ToolVersion', id)
    if (!tool || !tool.available || tool.health === 'unavailable') throw new Error('tool_unavailable')
    return tool
  }

  private latestHealthChecks(): SourceHealthCheck[] {
    const values = new Map<string, SourceHealthCheck>()
    for (const check of this.kernel.store.list<SourceHealthCheck>('SourceHealthCheck')) {
      const current = values.get(check.adapterVersionId)
      if (!current || Date.parse(check.checkedAt) > Date.parse(current.checkedAt)) values.set(check.adapterVersionId, check)
    }
    return [...values.values()]
  }
}
