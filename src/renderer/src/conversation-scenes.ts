import { useSyncExternalStore, type ReactNode } from 'react'
import type { ConversationMessageView, ConversationSummaryView, TaskDetailView } from '../../shared/runtime-contract'
import type { PersonIdentity } from './components/client-ui'

/** Optional host-provided scene content. The client owns the entire message-page layout. */
export interface ConversationScene {
  identity: PersonIdentity
  task?: TaskDetailView
  messages: ConversationMessageView[]
  setup?: ReactNode
  timeline?: Array<{ id: string; createdAt: string; content: ReactNode }>
  details?: ReactNode
  delivery?: (onOpenDetails: () => void) => ReactNode
}

export interface ConversationScenes {
  subscribe(listener: () => void): () => void
  getSnapshot(conversationId: string): ConversationScene | undefined
  enter(name: string, kind: 'expert' | 'group'): Promise<ConversationSummaryView | undefined>
  canEnter(name: string, kind: 'expert' | 'group'): boolean
  getDraft(conversationId: string): string
  setDraft(conversationId: string, value: string): void
  emptyDescription: string
}

const noSubscribe = (): (() => void) => () => undefined
export function useConversationScene(scenes: ConversationScenes | undefined, conversationId: string): ConversationScene | undefined {
  return useSyncExternalStore(scenes?.subscribe ?? noSubscribe, () => scenes?.getSnapshot(conversationId))
}
