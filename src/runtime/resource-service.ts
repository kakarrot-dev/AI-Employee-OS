import { FEISHU_MEETING_SCOPES, FEISHU_MEETING_TOOL_IDS, MEETING_PARAMETER_NAMES, MEETING_PARAMETER_PROPERTIES } from '../shared/feishu-meeting-contract'
import { randomUUID } from 'node:crypto'
import type { MCPVersion, SkillVersion, SourceHealthCheck, ToolVersion } from './domain'
import { RuntimeKernel } from './kernel'
import { managedResearchRunner } from './managed-research-runner'
import { probeExternalIntelligenceTool } from './external-intelligence-runner'
import { BUILT_IN_SKILLS } from './builtin-contracts'
import { FEISHU_DOCUMENT_SCOPES, FEISHU_DOCUMENT_TOOL_IDS, type FeishuConnectionStatus } from '../shared/connection-contract'

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

const tenderDocumentMcp: MCPVersion = {
  schemaVersion: 1, id: 'mcp.tender-document-runner.v1', createdAt: now, name: '招投标文档解析 Runner',
  description: '在任务授权目录内只读解析 DOCX、PPTX、XLSX、PDF 与图片，并保留页、幻灯片、工作表/单元格、段落或文字区域定位。', version: 1,
  transport: 'built_in_runner', toolVersionIds: ['tender.requirements.extract@document-analysis/v1'],
  credentialRequirement: 'none', credentialStatus: 'not_required', health: 'available', available: true
}

const feishuDocumentsMcp: MCPVersion = {
  schemaVersion: 1, id: 'mcp.feishu-documents.v1', createdAt: '2026-09-04T00:00:00.000Z', name: '飞书文档只读连接',
  description: '凭证仅由 Main Process 从 macOS Keychain 读取；Runtime 只能请求搜索和读取新版文档纯文本。', version: 1,
  transport: 'built_in_runner', toolVersionIds: [FEISHU_DOCUMENT_TOOL_IDS.search, FEISHU_DOCUMENT_TOOL_IDS.read],
  credentialRequirement: 'required', credentialStatus: 'missing', health: 'degraded', available: true
}

const feishuWikiMcp: MCPVersion = {
  schemaVersion: 1, id: 'mcp.feishu-wiki.v1', createdAt: '2026-09-04T00:00:00.000Z', name: '飞书知识库只读连接',
  description: '凭证仅由 Main Process 从 macOS Keychain 读取；Runtime 只能枚举当前用户可访问的知识库空间与节点并生成可核验统计。', version: 1,
  transport: 'built_in_runner', toolVersionIds: [FEISHU_DOCUMENT_TOOL_IDS.wikiCount],
  credentialRequirement: 'required', credentialStatus: 'missing', health: 'degraded', available: true
}

const feishuMeetingsMcp: MCPVersion = { schemaVersion: 1, id: 'mcp.feishu-meetings.v1', createdAt: '2026-09-07T00:00:00.000Z', name: '飞书会议与邀请', description: '以连接用户身份搜索组织内联系人、创建会议号并发送邀请；不创建日历日程。', version: 1, transport: 'built_in_runner', toolVersionIds: Object.values(FEISHU_MEETING_TOOL_IDS), credentialRequirement: 'required', credentialStatus: 'missing', health: 'degraded', available: true }

const builtInMcps = [managedResearchMcp, externalIntelligenceMcp, localDocumentMcp, tenderDocumentMcp, feishuDocumentsMcp, feishuWikiMcp, feishuMeetingsMcp]

const builtInTools: ToolVersion[] = [
  ...Object.values(FEISHU_MEETING_TOOL_IDS).map((id): ToolVersion => ({
    schemaVersion: 1, id, createdAt: '2026-09-07T00:00:00.000Z', version: 1, source: 'mcp', mcpVersionId: feishuMeetingsMcp.id,
    name: id === FEISHU_MEETING_TOOL_IDS.search ? '搜索飞书联系人' : id === FEISHU_MEETING_TOOL_IDS.create ? '创建飞书会议' : '发送飞书会议邀请',
    description: id === FEISHU_MEETING_TOOL_IDS.search ? '按姓名搜索当前组织内联系人；不包含外部好友。' : id === FEISHU_MEETING_TOOL_IDS.create ? '确认主题、起止时间和邀请名单后创建会议号与链接；不创建日历日程。' : '确认后以当前用户身份向已选联系人发送会议邀请；发送不代表接受。',
    inputSchema: { type: 'object', additionalProperties: false, required: MEETING_PARAMETER_NAMES[id], properties: Object.fromEntries(Object.entries(MEETING_PARAMETER_PROPERTIES).filter(([key]) => MEETING_PARAMETER_NAMES[id].includes(key))) },
    sideEffect: id === FEISHU_MEETING_TOOL_IDS.search ? 'external_read' : 'external_write', risk: id === FEISHU_MEETING_TOOL_IDS.search ? 'low' : 'medium', timeoutMs: 30_000, networkOrigins: ['https://open.feishu.cn'], available: true, health: 'degraded', credentialStatus: 'missing', reason: '需开通飞书会议授权'
  })),
  {
    schemaVersion: 1, id: FEISHU_DOCUMENT_TOOL_IDS.search, createdAt: '2026-09-04T00:00:00.000Z', name: '搜索飞书文档', description: '以当前连接用户身份搜索其可访问的飞书文档，只返回标题、类型和文档 ID。', version: 1,
    source: 'mcp', mcpVersionId: feishuDocumentsMcp.id, inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 256 }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false },
    sideEffect: 'external_read', risk: 'low', timeoutMs: 30_000, networkOrigins: ['https://open.feishu.cn'], available: true, health: 'degraded', credentialStatus: 'missing', reason: '等待飞书连接状态'
  },
  {
    schemaVersion: 1, id: FEISHU_DOCUMENT_TOOL_IDS.read, createdAt: '2026-09-04T00:00:00.000Z', name: '读取飞书新版文档', description: '读取同一任务搜索结果中的一个飞书新版文档纯文本，并返回内容 Hash 与截断状态。', version: 1,
    source: 'mcp', mcpVersionId: feishuDocumentsMcp.id, inputSchema: { type: 'object', required: ['documentId'], properties: { documentId: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } }, additionalProperties: false },
    sideEffect: 'external_read', risk: 'low', timeoutMs: 30_000, networkOrigins: ['https://open.feishu.cn'], available: true, health: 'degraded', credentialStatus: 'missing', reason: '等待飞书连接状态'
  },
  {
    schemaVersion: 1, id: FEISHU_DOCUMENT_TOOL_IDS.wikiCount, createdAt: '2026-09-04T00:00:00.000Z', name: '统计飞书知识库文档', description: '枚举当前连接用户可访问的全部飞书知识库空间与节点，按实际文档资源去重统计并返回来源 ID 与 Hash。', version: 1,
    source: 'mcp', mcpVersionId: feishuWikiMcp.id, inputSchema: { type: 'object', required: ['scope'], properties: { scope: { type: 'string', enum: ['accessible_wiki_spaces'] } }, additionalProperties: false },
    sideEffect: 'external_read', risk: 'low', timeoutMs: 120_000, networkOrigins: ['https://open.feishu.cn'], available: true, health: 'degraded', credentialStatus: 'missing', reason: '等待飞书连接状态'
  },
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
    schemaVersion: 1, id: 'tender.requirements.extract@document-analysis/v1', createdAt: now, name: '提取招投标客户要求', description: '批量只读解析任务附件，并返回带原始文件定位和 SHA-256 的结构化内容。', version: 1,
    source: 'mcp', mcpVersionId: tenderDocumentMcp.id, inputSchema: { type: 'object', required: ['paths'], properties: { paths: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 4096 } } }, additionalProperties: false },
    sideEffect: 'none', risk: 'low', timeoutMs: 30_000, networkOrigins: [], available: true, health: 'available', credentialStatus: 'not_required'
  },
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

export class ResourceService {
  constructor(private readonly kernel: RuntimeKernel) {}

  seed(): void {
    for (const mcp of builtInMcps) if (!this.kernel.store.get<MCPVersion>('MCPVersion', mcp.id)) this.kernel.save({ entityType: 'MCPVersion', entity: mcp, immutable: true }, 'resource.mcp.seeded', {})
    for (const tool of builtInTools) if (!this.kernel.store.get<ToolVersion>('ToolVersion', tool.id)) this.kernel.save({ entityType: 'ToolVersion', entity: tool, immutable: true }, 'resource.tool.seeded', {})
    for (const skill of BUILT_IN_SKILLS) if (!this.kernel.store.get<SkillVersion>('SkillVersion', skill.id)) this.kernel.save({ entityType: 'SkillVersion', entity: skill, immutable: true }, 'resource.skill.seeded', { version: skill.version, instructionDigest: skill.instructionDigest })
  }

  list(): ResourceCatalog {
    const healthChecks = this.latestHealthChecks()
    const healthByTool = new Map(healthChecks.map((check) => [check.adapterVersionId, check]))
    const tools = this.kernel.store.list<ToolVersion>('ToolVersion').map((tool) => {
      const check = healthByTool.get(tool.id)
      return check ? { ...tool, health: check.status, credentialStatus: check.credentialStatus, available: tool.available && check.status === 'available', reason: check.status === 'available' ? undefined : check.failureCode ?? '数据源健康检查未通过' } : tool
    })
    const toolById = new Map(tools.map((tool) => [tool.id, tool]))
    const mcps = this.kernel.store.list<MCPVersion>('MCPVersion').map((mcp) => {
      const dependencies = mcp.toolVersionIds.map((id) => toolById.get(id))
      const available = mcp.available && dependencies.every((tool) => tool?.available)
      const credentialStatus = dependencies.some((tool) => tool?.credentialStatus === 'missing') ? 'missing' as const : mcp.credentialStatus === 'not_required' ? 'not_required' as const : 'configured' as const
      return { ...mcp, available, health: available ? 'available' as const : 'degraded' as const, credentialStatus, reason: available ? undefined : '至少一个数据源不可用' }
    })
    const latestSkills = new Map<string, SkillVersion>()
    for (const skill of this.kernel.store.list<SkillVersion>('SkillVersion')) {
      const current = latestSkills.get(skill.name)
      if (!current || skill.version > current.version) latestSkills.set(skill.name, skill)
    }
    return {
      skills: [...latestSkills.values()].map((skill) => { const available = skill.available && skill.toolVersionIds.every((id) => toolById.get(id)?.available); return { ...skill, available, reason: available ? undefined : '至少一个 Tool 依赖不可用' } }),
      tools,
      mcps,
      healthChecks
    }
  }

  async probe(): Promise<SourceHealthCheck[]> {
    // Health checks must be able to retry a source whose last check failed.
    // Normal task execution still uses tool() to enforce current availability.
    const probes: Array<{ tool: ToolVersion; parameters: Record<string, unknown> }> = [
      { tool: this.kernel.store.get<ToolVersion>('ToolVersion', 'github.repositories.search@research-source/v1')!, parameters: { query: 'deep agents', limit: 1 } },
      { tool: this.kernel.store.get<ToolVersion>('ToolVersion', 'rss.read@research-source/v1')!, parameters: { url: 'https://github.blog/feed/', limit: 1 } }
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

  updateFeishuConnection(status: FeishuConnectionStatus): ResourceCatalog {
    const checkedAt = status.checkedAt || new Date().toISOString()
    for (const [scopes, toolIds] of [[FEISHU_DOCUMENT_SCOPES, Object.values(FEISHU_DOCUMENT_TOOL_IDS)], [FEISHU_MEETING_SCOPES, Object.values(FEISHU_MEETING_TOOL_IDS)]] as const) {
      const scopesReady = scopes.every((scope) => status.scopes.includes(scope))
      const available = status.state === 'connected' && scopesReady
      const credentialStatus: SourceHealthCheck['credentialStatus'] = status.state === 'not_connected' ? 'missing' : 'configured'
      const failureCode = available ? undefined : status.state === 'not_connected' ? 'feishu_not_connected' : status.state === 'error' ? 'feishu_connection_error' : 'feishu_reauthorization_required'
      for (const adapterVersionId of toolIds) {
        const check: SourceHealthCheck = { schemaVersion: 1, id: randomUUID(), createdAt: checkedAt, adapterVersionId, status: available ? 'available' : 'unavailable', credentialStatus, latencyMs: 0, checkedAt, failureCode }
        this.kernel.save({ entityType: 'SourceHealthCheck', entity: check, immutable: true }, 'resource.connection_status_updated', { adapterVersionId, status: check.status, credentialStatus, failureCode })
      }
    }
    return this.list()
  }

  tool(id: string): ToolVersion {
    const tool = this.list().tools.find((value) => value.id === id)
    if (!tool || !tool.available || tool.health === 'unavailable' || tool.credentialStatus === 'missing') throw new Error('tool_unavailable')
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
