import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { FEISHU_DOCUMENT_TOOL_IDS } from '../shared/connection-contract'
import { RuntimeStore } from './store'
import { managedResearchRunner } from './managed-research-runner'

vi.mock('./managed-research-runner', () => ({ managedResearchRunner: vi.fn() }))
vi.mock('./external-intelligence-runner', () => ({ probeExternalIntelligenceTool: () => ({ available: true }) }))

describe('ResourceService professional Skill packages', () => {
  afterEach(() => vi.useRealTimers())
  it('rechecks failed tools and restores dependent skills only after a successful probe', async () => {
    const store = new RuntimeStore(':memory:')
    const kernel = new RuntimeKernel(store)
    const service = new ResourceService(kernel)
    service.seed()
    for (const id of ['github.repositories.search@research-source/v1', 'rss.read@research-source/v1']) {
      kernel.save({ entityType: 'SourceHealthCheck', immutable: true, entity: {
        schemaVersion: 1, id: `failed:${id}`, createdAt: '2026-01-01T00:00:00.000Z',
        adapterVersionId: id, checkedAt: '2026-01-01T00:00:00.000Z', status: 'unavailable',
        credentialStatus: 'not_required', latencyMs: 0, failureCode: 'ssrf_target_blocked'
      } }, 'resource.health_checked', {})
    }
    expect(() => service.tool('github.repositories.search@research-source/v1')).toThrow('tool_unavailable')
    expect(service.list().skills.find((skill) => skill.id === 'skill.managed-research.v2')?.available).toBe(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T00:00:00.000Z'))
    vi.mocked(managedResearchRunner).mockResolvedValue({ status: 'failed', httpStatus: 503, items: [] })
    await service.probe()
    expect(() => service.tool('github.repositories.search@research-source/v1')).toThrow('tool_unavailable')
    vi.setSystemTime(new Date('2026-09-07T00:00:01.000Z'))
    vi.mocked(managedResearchRunner).mockResolvedValue({ status: 'succeeded', items: [{ title: 'Verified source' }] })
    await service.probe()
    expect(service.tool('github.repositories.search@research-source/v1').available).toBe(true)
    expect(service.list().skills.find((skill) => skill.id === 'skill.managed-research.v2')?.available).toBe(true)
    store.close()
  })

  it('installs real immutable SKILL.md contracts with verifiable digests', () => {
    const store = new RuntimeStore(':memory:')
    const service = new ResourceService(new RuntimeKernel(store))
    service.seed(); service.seed()

    const skills = service.list().skills
    expect(skills).toHaveLength(8)
    expect(skills.every((skill) => skill.version >= 1)).toBe(true)
    for (const skill of skills) {
      expect(skill.instructionsMarkdown).toContain('## 适用边界')
      expect(skill.instructionsMarkdown.length).toBeGreaterThan(300)
      expect(skill.instructionDigest).toBe(createHash('sha256').update(skill.instructionsMarkdown).digest('hex'))
      expect(skill.toolVersionIds.length).toBeGreaterThan(0)
    }
    expect(skills.find((skill) => skill.id === 'skill.local-document-operations.v2')?.instructionsMarkdown).toContain('## 失败与恢复')
    expect(store.list('SkillVersion')).toHaveLength(8)
    store.close()
  })

  it('activates Feishu tools only after a connected status with document and Wiki scopes', () => {
    const store = new RuntimeStore(':memory:')
    const service = new ResourceService(new RuntimeKernel(store))
    service.seed()
    expect(() => service.tool(FEISHU_DOCUMENT_TOOL_IDS.search)).toThrow('tool_unavailable')

    const catalog = service.updateFeishuConnection({ provider: 'feishu', state: 'connected', checkedAt: '2026-09-04T10:00:00.000Z', scopes: ['offline_access', 'search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'] })
    expect(catalog.tools.filter((tool) => Object.values(FEISHU_DOCUMENT_TOOL_IDS).includes(tool.id as typeof FEISHU_DOCUMENT_TOOL_IDS[keyof typeof FEISHU_DOCUMENT_TOOL_IDS])).every((tool) => tool.available && tool.credentialStatus === 'configured')).toBe(true)
    expect(catalog.mcps.find((mcp) => mcp.id === 'mcp.feishu-documents.v1')).toMatchObject({ available: true, health: 'available', credentialStatus: 'configured' })
    expect(catalog.mcps.find((mcp) => mcp.id === 'mcp.feishu-wiki.v1')).toMatchObject({ available: true, health: 'available', credentialStatus: 'configured' })
    expect(() => service.tool('feishu.meetings.create@feishu-meetings/v1')).toThrow('tool_unavailable')
    expect(service.tool(FEISHU_DOCUMENT_TOOL_IDS.read).id).toBe(FEISHU_DOCUMENT_TOOL_IDS.read)
    store.close()
  })
})
