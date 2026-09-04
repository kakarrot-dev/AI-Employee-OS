import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { FEISHU_DOCUMENT_TOOL_IDS } from '../shared/connection-contract'
import { RuntimeStore } from './store'

describe('ResourceService professional Skill packages', () => {
  it('installs real immutable SKILL.md contracts with verifiable digests', () => {
    const store = new RuntimeStore(':memory:')
    const service = new ResourceService(new RuntimeKernel(store))
    service.seed(); service.seed()

    const skills = service.list().skills
    expect(skills).toHaveLength(7)
    expect(skills.every((skill) => skill.version >= 1)).toBe(true)
    for (const skill of skills) {
      expect(skill.instructionsMarkdown).toContain('## 适用边界')
      expect(skill.instructionsMarkdown.length).toBeGreaterThan(300)
      expect(skill.instructionDigest).toBe(createHash('sha256').update(skill.instructionsMarkdown).digest('hex'))
      expect(skill.toolVersionIds.length).toBeGreaterThan(0)
    }
    expect(skills.find((skill) => skill.id === 'skill.local-document-operations.v2')?.instructionsMarkdown).toContain('## 失败与恢复')
    expect(store.list('SkillVersion')).toHaveLength(7)
    store.close()
  })

  it('activates Feishu tools only after a connected status with document and Wiki scopes', () => {
    const store = new RuntimeStore(':memory:')
    const service = new ResourceService(new RuntimeKernel(store))
    service.seed()
    expect(() => service.tool(FEISHU_DOCUMENT_TOOL_IDS.search)).toThrow('tool_unavailable')

    const catalog = service.updateFeishuConnection({ provider: 'feishu', state: 'connected', checkedAt: '2026-09-04T10:00:00.000Z', scopes: ['offline_access', 'search:docs:read', 'docx:document:readonly', 'wiki:wiki:readonly'] })
    expect(catalog.tools.filter((tool) => tool.id.startsWith('feishu.')).every((tool) => tool.available && tool.credentialStatus === 'configured')).toBe(true)
    expect(catalog.mcps.find((mcp) => mcp.id === 'mcp.feishu-documents.v1')).toMatchObject({ available: true, health: 'available', credentialStatus: 'configured' })
    expect(catalog.mcps.find((mcp) => mcp.id === 'mcp.feishu-wiki.v1')).toMatchObject({ available: true, health: 'available', credentialStatus: 'configured' })
    expect(service.tool(FEISHU_DOCUMENT_TOOL_IDS.read).id).toBe(FEISHU_DOCUMENT_TOOL_IDS.read)
    store.close()
  })
})
