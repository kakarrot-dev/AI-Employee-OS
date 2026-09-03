import { describe, expect, it } from 'vitest'
import { hasLocalDocumentCapability, hasResearchCapability } from './capability-contract'

describe('capability contract', () => {
  it('keeps current and legacy capability versions routable', () => {
    expect(hasResearchCapability(['capability.network-intelligence.v2'])).toBe(true)
    expect(hasResearchCapability(['capability.managed-research.v1'])).toBe(true)
    expect(hasLocalDocumentCapability(['capability.local-document.v2'])).toBe(true)
    expect(hasLocalDocumentCapability(['capability.local-document.v1'])).toBe(true)
    expect(hasLocalDocumentCapability(['capability.text-analysis.v1'])).toBe(false)
  })
})
