/** Adapted from open-claude-ui ChatMessageBubbles, AttachmentCard,
 * StatusIndicators and McpToolDecisionCard (MIT). Business commands are slots. */
import type { ReactNode } from 'react'
import { ShieldCheck } from '../../components/cds-icons'

export function CdsMessage({ source, name, time, modelName, attachments, avatar, timeline, borderless, status, children }: { source: 'user' | 'agent'; name: string; time: string; modelName?: string; attachments?: ReactNode; avatar: ReactNode; timeline?: boolean; borderless?: boolean; status?: ReactNode; children: ReactNode }): React.JSX.Element {
  return <article data-cds={source === 'user' ? 'UserMessage' : 'AssistantMessage'} className={`message-block message-block--${source}${timeline ? ' message-block--timeline message-stream-item' : ''}`}>
    {avatar}
    <div className="message-block__stack">
      <header className="message-author"><strong>{name}</strong>{source === 'agent' && modelName && <span className="message-model-badge">{modelName}</span>}<time>{time}</time></header>
      {source === 'user' && attachments}
      {borderless ? children : <div className="message-bubble">{status && <div className="message-bubble__status">{status}</div>}{children}</div>}
      {source === 'agent' && attachments}
    </div>
  </article>
}

export function CdsAttachmentCard({ name, detail, chip, action, children }: { name: string; detail: string; chip?: boolean; action?: ReactNode; children?: ReactNode }): React.JSX.Element {
  const type = name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const category = /^(?:ts|tsx|js|jsx|py|css|html|json|rs|go|swift)$/.test(extension) ? 'code' : extension === 'pdf' ? 'pdf' : /^(?:png|jpg|jpeg|webp|gif)$/.test(extension) ? 'image' : /^(?:doc|docx|txt|md|csv)$/.test(extension) ? 'text' : /^(?:zip|gz|tar|rar)$/.test(extension) ? 'archive' : 'general'
  const badge = category === 'code' ? '</>' : category === 'pdf' ? 'PDF' : category === 'image' ? 'IMG' : category === 'text' ? 'DOC' : category === 'archive' ? 'ZIP' : type.slice(0, 3)
  return <article data-cds="AttachmentCard" data-layout={chip ? 'chip' : 'tile'} data-category={category} className={`message-attachment-row cds-attachment-card${chip ? ' cds-attachment-card--chip' : ''}`}>
    <div className="cds-attachment-card__top"><span className="cds-attachment-card__badge">{badge}</span><span className="message-attachment-row__actions">{action}</span></div>
    <div className="message-attachment-row__body"><strong title={name}>{name}</strong><small>{detail}</small></div>
    {children}
  </article>
}

export function CdsDecisionCard({ title, status, tone, children, actions }: { title: string; status: ReactNode; tone: string; children: ReactNode; actions?: ReactNode }): React.JSX.Element {
  return <article className="approval-card message-action-card message-stream-item" data-cds="McpToolDecisionCard" data-tone={tone} data-component-contract="message-action-card" aria-label={title}>
    <header className="message-action-card__header"><span className="cds-decision-card__icon" aria-hidden><ShieldCheck /></span><h3>{title}</h3><span role="status">{status}</span></header>
    <div className="message-action-card__body">{children}</div>
    {actions && <footer className="approval-actions">{actions}</footer>}
  </article>
}

export function CdsThinkingIndicator({ label }: { label: string }): React.JSX.Element {
  return <span className="cds-thinking-indicator" data-cds="QuietDotsWave"><span className="cds-thinking-dots" aria-hidden><i /><i /><i /></span><span>{label}</span></span>
}
