export interface TaskDraftInputView {
  conversationId: string
  sourceMessageIds: string[]
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
}

export interface TaskDetailView {
  id: string
  conversationId: string
  taskId?: string
  draftId: string
  state: 'draft' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'needs_attention'
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
  draftRevision: number
  frozenRevision?: number
  runId?: string
  assignments: Array<{ id: string; sequence: number; employeeVersionId: string; state: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'; output?: string }>
  timeline: Array<{ phase: string; nextNode?: string; createdAt: string; memoryRefs?: Array<{ id: string; reason: string }> }>
  delivery?: { id: string; acceptanceResults: Array<{ criterion: string; passed: boolean }>; artifacts: Array<{ id: string; mediaType: string; relativePath: string; sha256: string }>; evidenceCount: number; unresolvedIssues: string[] }
  researchBundles: Array<{ id: string; contentHash: string; sourceCount: number; claimCount: number; conflicts: string[]; informationGaps: string[] }>
  pendingChange?: { id: string; sourceMessageId: string; requestedDiff: Record<string, unknown> }
  toolActions: Array<{ id: string; toolVersionId: string; state: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'result_unknown' | 'cancelled'; parameters: Record<string, unknown>; risk: 'low' | 'medium' | 'high'; approvalId?: string; failureCode?: string }>
  approvals: Array<{ id: string; toolActionId: string; decision: 'pending' | 'approved' | 'rejected' }>
}

export interface TaskEvent {
  type: 'progress' | 'assignment_completed' | 'delivery_completed' | 'needs_attention' | 'failed'
  taskId: string
  runId?: string
}
