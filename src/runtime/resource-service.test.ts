import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { RuntimeStore } from './store'

describe('ResourceService professional Skill packages', () => {
  it('installs real immutable v2 SKILL.md contracts with verifiable digests', () => {
    const store = new RuntimeStore(':memory:')
    const service = new ResourceService(new RuntimeKernel(store))
    service.seed(); service.seed()

    const skills = service.list().skills
    expect(skills).toHaveLength(5)
    expect(skills.every((skill) => skill.version === 2)).toBe(true)
    for (const skill of skills) {
      expect(skill.instructionsMarkdown).toContain('## 适用边界')
      expect(skill.instructionsMarkdown.length).toBeGreaterThan(300)
      expect(skill.instructionDigest).toBe(createHash('sha256').update(skill.instructionsMarkdown).digest('hex'))
      expect(skill.toolVersionIds.length).toBeGreaterThan(0)
    }
    expect(skills.find((skill) => skill.id === 'skill.local-document-operations.v2')?.instructionsMarkdown).toContain('## 失败与恢复')
    expect(store.list('SkillVersion')).toHaveLength(5)
    store.close()
  })
})
