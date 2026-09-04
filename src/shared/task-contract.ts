import { toPlainTimelineSummary, type ChatContentView } from './chat-content-contract'

export const MATTER_TITLE_MAX_CHARACTERS = 32

function trimMatterTitle(value: string): string {
  const characters = [...value]
  return characters.length > MATTER_TITLE_MAX_CHARACTERS
    ? characters.slice(0, MATTER_TITLE_MAX_CHARACTERS).join('').trimEnd()
    : value
}

export function deriveMatterTitle(goal: string): string {
  const plain = toPlainTimelineSummary(goal, 20_000)
  const quotedTarget = plain.match(/[《“"]([^》”"]{2,160})[》”"]/)?.[1]
    ?.replace(/\.(?:docx?|pdf|pptx?|xlsx?|md|txt)$/iu, '')
    .trim()
  const deliverable = plain.match(/结构化分析报告|分析报告|调研报告|研究报告|投标响应(?:文件)?|响应文件|实施方案|解决方案|汇报材料|演示文稿|数据表|文档/iu)?.[0]
  if (quotedTarget) {
    const composed = deliverable && !quotedTarget.includes(deliverable) ? `${quotedTarget}${deliverable}` : quotedTarget
    return trimMatterTitle(composed)
  }
  const concise = plain
    .split(/[，。；!?！？]/u, 1)[0]
    .replace(/^(?:请|麻烦|帮我|为我|需要)?(?:生成|产出|创建|整理|制作)(?:一份|一个)?/u, '')
    .replace(/^针对/u, '')
    .replace(/^的/u, '')
    .trim()
  return trimMatterTitle(concise || plain || '未命名事项')
}

export function normalizeMatterTitle(value: string | undefined, goal: string): string {
  const candidate = toPlainTimelineSummary(value ?? '', 200)
    .replace(/^[《“"']+|[》”"'。；，,]+$/gu, '')
    .trim()
  if (!candidate || [...candidate].length > MATTER_TITLE_MAX_CHARACTERS) return deriveMatterTitle(goal)
  return candidate
}

export interface TaskDraftInputView {
  conversationId: string
  sourceMessageIds: string[]
  title?: string
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
  title: string
  goal: string
  acceptanceCriteria: string[]
  employeeVersionIds: string[]
  directories: string[]
  requiresDirectories?: boolean
  draftRevision: number
  frozenRevision?: number
  runId?: string
  assignments: Array<{ id: string; sequence: number; employeeId?: string; employeeVersionId: string; employeeName?: string; employeeRole?: string; avatarDataUrl?: string; createdAt?: string; completedAt?: string; reworkOfAssignmentId?: string; state: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'; content?: ChatContentView; summary?: string; /** @deprecated Runtime no longer projects full employee output to clients. */ output?: string }>
  timeline: Array<{ phase: string; assignmentId?: string; nextNode?: string; createdAt: string; memoryRefs?: Array<{ id: string; reason: string }> }>
  delivery?: { id: string; content?: ChatContentView; /** @deprecated Use content.summary. */ summary?: string; /** @deprecated Raw employee output is not a delivery presentation. */ result?: string; createdAt?: string; acceptanceResults: Array<{ criterion: string; passed: boolean }>; artifacts: Array<{ id: string; mediaType: string; relativePath: string; sha256: string }>; evidenceCount: number; unresolvedIssues: string[] }
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

export { toPlainTimelineSummary } from './chat-content-contract'
