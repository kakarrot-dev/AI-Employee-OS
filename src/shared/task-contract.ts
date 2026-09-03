export interface TaskDraftInputView {
  conversationId: string
  sourceMessageIds: string[]
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
  directories?: string[]
  authorizationMode?: 'approval_required' | 'full_access'
}

export interface TaskDetailView {
  id: string
  conversationId: string
  createdAt?: string
  sourceMessageIds?: string[]
  taskId?: string
  draftId: string
  state: 'draft' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'needs_attention'
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
  directories: string[]
  requiresDirectories?: boolean
  draftRevision: number
  frozenRevision?: number
  runId?: string
  assignments: Array<{ id: string; sequence: number; employeeId?: string; employeeVersionId: string; employeeName?: string; employeeRole?: string; avatarDataUrl?: string; createdAt?: string; completedAt?: string; reworkOfAssignmentId?: string; state: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'; summary?: string; /** @deprecated Runtime no longer projects full employee output to clients. */ output?: string }>
  timeline: Array<{ phase: string; assignmentId?: string; nextNode?: string; createdAt: string; memoryRefs?: Array<{ id: string; reason: string }> }>
  delivery?: { id: string; summary?: string; result?: string; createdAt?: string; acceptanceResults: Array<{ criterion: string; passed: boolean }>; artifacts: Array<{ id: string; mediaType: string; relativePath: string; sha256: string }>; evidenceCount: number; unresolvedIssues: string[] }
  researchBundles: Array<{ id: string; contentHash: string; sourceCount: number; claimCount: number; conflicts: string[]; informationGaps: string[] }>
  pendingChange?: { id: string; sourceMessageId: string; requestedDiff: Record<string, unknown> }
  toolActions: Array<{ id: string; assignmentId?: string; createdAt?: string; completedAt?: string; toolVersionId: string; state: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'result_unknown' | 'cancelled'; parameters: Record<string, unknown>; risk: 'low' | 'medium' | 'high'; approvalId?: string; failureCode?: string }>
  approvals: Array<{ id: string; toolActionId: string; decision: 'pending' | 'approved' | 'rejected' }>
}

export interface TaskEvent {
  type: 'progress' | 'assignment_completed' | 'delivery_completed' | 'needs_attention' | 'failed'
  taskId: string
  runId?: string
}
