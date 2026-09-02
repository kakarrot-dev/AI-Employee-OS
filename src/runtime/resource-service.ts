import { randomUUID } from 'node:crypto'
import type { MCPVersion, SkillVersion, SourceHealthCheck, ToolVersion } from './domain'
import { RuntimeKernel } from './kernel'
import { managedResearchRunner } from './managed-research-runner'
import { probeExternalIntelligenceTool } from './external-intelligence-runner'

export interface ResourceCatalog {
  skills: SkillVersion[]
  tools: ToolVersion[]
  mcps: MCPVersion[]
  healthChecks: SourceHealthCheck[]
}

const now = '2026-08-31T00:00:00.000Z'

const managedResearchMcp: MCPVersion = {
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

const externalIntelligenceMcp: MCPVersion = {
  schemaVersion: 1, id: 'mcp.external-intelligence-runner.v1', createdAt: now, name: '外部情报能力 Runner',
  description: '只允许调用已安装的 Agent-Reach、Last 30 Days 与 OpenCLI 固定只读命令；不提供任意 Shell。', version: 1,
  transport: 'built_in_runner', toolVersionIds: ['agent-reach.search@network-intelligence/v1', 'last30days.research@network-intelligence/v1', 'opencli.social-search@network-intelligence/v1'],
  credentialRequirement: 'optional', credentialStatus: 'configured', health: 'available', available: true
}

const localDocumentMcp: MCPVersion = {
  schemaVersion: 1, id: 'mcp.local-document-runner.v1', createdAt: now, name: '本机文档 Runner',
  description: '仅在任务 RunGrant 明确授权的目录内读取、独占创建和精确编辑 UTF-8 文档。', version: 1,
  transport: 'built_in_runner', toolVersionIds: ['document.read@local-document/v1', 'document.create@local-document/v1', 'document.edit@local-document/v1'],
  credentialRequirement: 'none', credentialStatus: 'not_required', health: 'available', available: true
}

const builtInMcps = [managedResearchMcp, externalIntelligenceMcp, localDocumentMcp]

const builtInTools: ToolVersion[] = [
  {
    schemaVersion: 1,
    id: 'github.repositories.search@research-source/v1',
    createdAt: now,
    name: 'GitHub 公开仓库搜索',
    description: '固定 GET https://api.github.com/search/repositories，只接受查询与条目上限。',
    version: 1,
    source: 'mcp',
    mcpVersionId: managedResearchMcp.id,
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
    mcpVersionId: managedResearchMcp.id,
    inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri', maxLength: 2048 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false },
    sideEffect: 'external_read',
    risk: 'low',
    timeoutMs: 15_000,
    networkOrigins: ['user_approved_public_https_feed'],
    available: true,
    health: 'available',
    credentialStatus: 'not_required'
  },
  ...[
    { id: 'agent-reach.search@network-intelligence/v1', name: 'Agent-Reach 全网搜索', description: '通过 Agent-Reach 配置的 Exa 通道执行公开网络语义搜索。', timeoutMs: 30_000 },
    { id: 'last30days.research@network-intelligence/v1', name: 'Last 30 Days 近期情报', description: '以快速模式检索最近 30 天的社区、视频、代码与网页信号。', timeoutMs: 120_000 },
    { id: 'opencli.social-search@network-intelligence/v1', name: 'OpenCLI 社交平台搜索', description: '通过已连接的 OpenCLI 对 Reddit、X 与小红书执行只读搜索；保留分平台失败。', timeoutMs: 60_000 }
  ].map(({ id, name, description, timeoutMs }): ToolVersion => ({
    schemaVersion: 1, id, createdAt: now, name, description, version: 1, source: 'mcp', mcpVersionId: externalIntelligenceMcp.id,
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 256 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false },
    sideEffect: 'external_read', risk: 'low', timeoutMs, networkOrigins: ['fixed_by_installed_skill'], available: true, health: 'available', credentialStatus: 'configured'
  })),
  {
    schemaVersion: 1, id: 'document.read@local-document/v1', createdAt: now, name: '查看本机文档', description: '读取任务已授权目录内单个不超过 1 MiB 的 UTF-8 文档。', version: 1,
    source: 'mcp', mcpVersionId: localDocumentMcp.id, inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string', minLength: 1, maxLength: 4096 } }, additionalProperties: false },
    sideEffect: 'none', risk: 'low', timeoutMs: 10_000, networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required'
  },
  {
    schemaVersion: 1, id: 'document.create@local-document/v1', createdAt: now, name: '写入新文档', description: '在任务已授权目录内独占创建 UTF-8 文档，不覆盖现有文件。', version: 1,
    source: 'mcp', mcpVersionId: localDocumentMcp.id, inputSchema: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string', minLength: 1, maxLength: 4096 }, content: { type: 'string', maxLength: 1048576 } }, additionalProperties: false },
    sideEffect: 'external_write', risk: 'medium', timeoutMs: 10_000, networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required'
  },
  {
    schemaVersion: 1, id: 'document.edit@local-document/v1', createdAt: now, name: '精确编辑文档', description: '仅当旧文本在授权文档中唯一匹配时进行原子替换。', version: 1,
    source: 'mcp', mcpVersionId: localDocumentMcp.id, inputSchema: { type: 'object', required: ['path', 'oldText', 'newText'], properties: { path: { type: 'string', minLength: 1, maxLength: 4096 }, oldText: { type: 'string', minLength: 1, maxLength: 1048576 }, newText: { type: 'string', maxLength: 1048576 } }, additionalProperties: false },
    sideEffect: 'external_write', risk: 'medium', timeoutMs: 10_000, networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required'
  }
]

const managedResearchSkill: SkillVersion = {
  schemaVersion: 1,
  id: 'skill.managed-research.v1',
  createdAt: now,
  name: '多源网络调研',
  description: '使用固定 GitHub REST 与 RSS/Atom 两类来源，保留失败来源、时间、Hash 与信息缺口。',
  version: 1,
  steps: ['拆分公开、非敏感查询', '分别提交 GitHub 与 RSS ToolAction Proposal', '保留 SourceAttempt 与非可信标记', '形成带来源的 ResearchBundle'],
  toolVersionIds: ['github.repositories.search@research-source/v1', 'rss.read@research-source/v1'],
  available: true
}

const builtInSkills: SkillVersion[] = [
  managedResearchSkill,
  { schemaVersion: 1, id: 'skill.agent-reach.v1', createdAt: now, name: 'Agent-Reach', description: '互联网能力路由与公开网页搜索。', version: 1, steps: ['运行依赖体检', '提交非敏感查询', '保留来源 URL 与失败通道'], toolVersionIds: ['agent-reach.search@network-intelligence/v1'], available: true },
  { schemaVersion: 1, id: 'skill.last30days.v1', createdAt: now, name: 'Last 30 Days', description: '汇总最近 30 天社区与网页信号。', version: 1, steps: ['读取已配置来源状态', '执行近期情报检索', '保留来源覆盖与缺口'], toolVersionIds: ['last30days.research@network-intelligence/v1'], available: true },
  { schemaVersion: 1, id: 'skill.opencli.v1', createdAt: now, name: 'OpenCLI', description: '复用已连接浏览器会话的只读平台 Adapter。', version: 1, steps: ['确认浏览器桥接', '调用固定只读 Adapter', '分平台记录成功与失败'], toolVersionIds: ['opencli.social-search@network-intelligence/v1'], available: true },
  { schemaVersion: 1, id: 'skill.local-document-operations.v1', createdAt: now, name: '本机文档操作', description: '在用户授权目录内查看、独占创建和精确编辑本机文档。', version: 1, steps: ['校验 RunGrant 授权目录', '查看或执行单次写入/编辑', '回读并记录 SHA-256'], toolVersionIds: ['document.read@local-document/v1', 'document.create@local-document/v1', 'document.edit@local-document/v1'], available: true }
]

export class ResourceService {
  constructor(private readonly kernel: RuntimeKernel) {}

  seed(): void {
    for (const mcp of builtInMcps) if (!this.kernel.store.get<MCPVersion>('MCPVersion', mcp.id)) this.kernel.save({ entityType: 'MCPVersion', entity: mcp, immutable: true }, 'resource.mcp.seeded', {})
    for (const tool of builtInTools) if (!this.kernel.store.get<ToolVersion>('ToolVersion', tool.id)) this.kernel.save({ entityType: 'ToolVersion', entity: tool, immutable: true }, 'resource.tool.seeded', {})
    for (const skill of builtInSkills) if (!this.kernel.store.get<SkillVersion>('SkillVersion', skill.id)) this.kernel.save({ entityType: 'SkillVersion', entity: skill, immutable: true }, 'resource.skill.seeded', {})
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
      skills: this.kernel.store.list<SkillVersion>('SkillVersion').map((skill) => { const available = skill.available && skill.toolVersionIds.every((id) => toolById.get(id)?.available); return { ...skill, available, reason: available ? undefined : '至少一个 Tool 依赖不可用' } }),
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
    for (const toolId of externalIntelligenceMcp.toolVersionIds) {
      const started = Date.now(), probe = probeExternalIntelligenceTool(toolId)
      const check: SourceHealthCheck = { schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), adapterVersionId: toolId, status: probe.available ? 'available' : 'unavailable', credentialStatus: 'configured', latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), failureCode: probe.failureCode }
      this.kernel.save({ entityType: 'SourceHealthCheck', entity: check, immutable: true }, 'resource.health_checked', { adapterVersionId: toolId, status: check.status, failureCode: check.failureCode })
      results.push(check)
    }
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
