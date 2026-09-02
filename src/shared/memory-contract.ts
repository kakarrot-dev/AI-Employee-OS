export type MemoryScopeTypeView = 'global' | 'employee' | 'task'
export type MemoryCategoryView = 'preference' | 'fact' | 'rule' | 'knowledge' | 'experience' | 'summary'
export type MemoryStatusView = 'active' | 'pending_verification' | 'conflicted' | 'disabled'

export interface MemoryViewModel {
  id: string; scopeType: MemoryScopeTypeView; scopeId: string; category: MemoryCategoryView; version: number; content: string; tags: string[]; sourceRefs: string[]; indexVersion: string; status: MemoryStatusView; conflictGroupId?: string; createdAt: string; updatedAt: string
}
export interface MemoryHealthView { state: 'ready'; model: string; dimensions: number; modelSha256: string; embedding: 'hybrid' | 'bm25_only'; memoryCount: number; pendingQueueCount: number; checkedAt: string }
export interface MemoryQueueItemView { id: string; sourceType: 'conversation' | 'task'; sourceRef: string; scopeType: MemoryScopeTypeView; scopeId: string; state: 'pending_authorization'; content: string; createdAt: string }
export interface MemorySearchResultView extends MemoryViewModel { score: number; vectorScore: number; lexicalMatched: boolean; reason: string; estimatedTokens: number }
