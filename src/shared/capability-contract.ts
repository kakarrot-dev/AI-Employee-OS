export const RESEARCH_CAPABILITY_IDS = new Set([
  'capability.managed-research.v1',
  'capability.managed-research.v2',
  'capability.network-intelligence.v1',
  'capability.network-intelligence.v2'
])

export const LOCAL_DOCUMENT_CAPABILITY_IDS = new Set([
  'capability.local-document.v1',
  'capability.local-document.v2'
])

export const TENDER_ANALYSIS_CAPABILITY_IDS = new Set([
  'capability.tender-analysis.v1',
  'capability.tender-analysis.v2'
])

export const FEISHU_DOCUMENT_CAPABILITY_IDS = new Set([
  'capability.feishu-documents.v1',
  'capability.feishu-documents.v2'
])

export function hasResearchCapability(ids: readonly string[]): boolean {
  return ids.some((id) => RESEARCH_CAPABILITY_IDS.has(id))
}

export function hasLocalDocumentCapability(ids: readonly string[]): boolean {
  return ids.some((id) => LOCAL_DOCUMENT_CAPABILITY_IDS.has(id))
}

export function hasTenderAnalysisCapability(ids: readonly string[]): boolean {
  return ids.some((id) => TENDER_ANALYSIS_CAPABILITY_IDS.has(id))
}

export function hasFeishuDocumentCapability(ids: readonly string[]): boolean {
  return ids.some((id) => FEISHU_DOCUMENT_CAPABILITY_IDS.has(id))
}
