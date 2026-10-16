import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, Folder, NavArrowDown, NavArrowLeft, NavArrowRight, OpenNewWindow, Page, Sparks, Xmark } from './cds-icons'
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components'
import { legacyChatContent, type ChatContentView } from '../../../shared/chat-content-contract'
import { Avatar, IconButton, DetailState, type DetailTone } from './client-ui'
import { CdsButton } from '../open-claude-ui/primitives/CdsButton'
import { CdsMessage, CdsAttachmentCard, CdsDecisionCard, CdsThinkingIndicator } from '../open-claude-ui/conversation/CdsConversation'
import { CdsCodeBlock } from '../open-claude-ui/conversation/CdsCodeBlock'

export function MessageActionCard({ title, status, tone, children, actions }: { title: string; status: string; tone: DetailTone; children: ReactNode; actions?: ReactNode }): React.JSX.Element {
  return <CdsDecisionCard title={title} status={<DetailState tone={tone}>{status}</DetailState>} tone={tone} actions={actions}>{children}</CdsDecisionCard>
}

export function MessageConfirmationActions({ cancelLabel, confirmLabel, busy = false, onCancel, onConfirm }: { cancelLabel: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }): React.JSX.Element {
  return <><CdsButton variant="ghost" size="md" disabled={busy} onClick={onCancel}>{cancelLabel}</CdsButton><CdsButton variant="primary" size="md" disabled={busy} onClick={onConfirm}>{busy ? '正在处理' : confirmLabel}</CdsButton></>
}

export interface MessageAttachment {
  id: string
  name: string
  detail: string
}

export interface MatterParticipant {
  id: string
  name: string
  initials: string
  color: string
  src?: string
}

export interface AgentMessageIdentity {
  name: string
  initials: string
  color: string
  avatarSrc?: string
}

export type AgentActivityState = 'thinking'

export interface AgentActivityMessageContract {
  state: AgentActivityState
  agent: AgentMessageIdentity
  time: string
}

function reducedMotionRequested(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const markdownComponents: Components = {
  pre({ children }) {
    const code = Children.toArray(children).find((child) => isValidElement<{ children?: ReactNode; className?: string }>(child) && child.type === 'code')
    if (!isValidElement<{ children?: ReactNode; className?: string }>(code)) return <pre>{children}</pre>
    const language = /(?:^|\s)language-([^\s]+)/.exec(code.props.className ?? '')?.[1]
    const value = Children.toArray(code.props.children).join('')
    return <CdsCodeBlock code={value} language={language ?? 'text'} />
  },
  table({ children, node: _node, ...props }) {
    return <div className="cds-markdown-table" tabIndex={0} role="region" aria-label="数据表格"><table {...props}>{children}</table></div>
  },
  a({ children, node: _node, href, ...props }) {
    const external = /^https?:\/\//i.test(href ?? '')
    return <a {...props} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}</a>
  }
}

export function MarkdownContent({ children, className = '' }: { children: string; className?: string }): React.JSX.Element {
  return <div className={`markdown-rendered${className ? ` ${className}` : ''}`} data-cds="Markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{children}</ReactMarkdown></div>
}

export function MarkdownMessage({ children, compact = false, collapsible: allowCollapse = true }: { children: string; compact?: boolean; collapsible?: boolean }): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [collapsible, setCollapsible] = useState(false)

  useEffect(() => {
    const content = contentRef.current
    if (!content || expanded || !allowCollapse) return
    const measure = (): void => setCollapsible(content.scrollHeight > content.clientHeight + 1)
    const frame = window.requestAnimationFrame(measure)
    if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(frame)
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame) }
  }, [children, expanded, allowCollapse])

  return <div className={`markdown-message${compact ? ' markdown-message--compact' : ''}`}><div ref={contentRef} className={`markdown-message__content${allowCollapse && collapsible ? ' is-collapsible' : ''}${expanded || !allowCollapse ? ' is-expanded' : ''}`}><MarkdownContent>{children}</MarkdownContent></div>{allowCollapse && (collapsible || expanded) && <CdsButton variant="ghost" size="sm" className="message-expand-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起' : '展开全文'}<NavArrowDown aria-hidden className={expanded ? 'is-expanded' : ''} /></CdsButton>}</div>
}

export function ChatContentBlock({ content, variant = 'timeline', children }: { content: ChatContentView; variant?: 'timeline' | 'delivery'; children?: ReactNode }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const detailParagraphs = content.detail?.content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean) ?? []
  return <div className={`chat-content chat-content--${variant}`}>
    <strong className="chat-content__title">{content.title}</strong>
    <MarkdownContent className="chat-content__summary">{content.summary}</MarkdownContent>
    {content.metrics && content.metrics.length > 0 && <dl className="chat-content__metrics" aria-label={variant === 'delivery' ? '交付概况' : '内容概况'}>{content.metrics.map((item) => <div key={`${item.label}:${item.value}`}><dd>{item.value}</dd><dt>{item.label}</dt></div>)}</dl>}
    {content.detail && <div className="chat-content__detail"><CdsButton variant="ghost" size="sm" className="message-expand-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起详情' : content.detail.label}<NavArrowDown aria-hidden className={expanded ? 'is-expanded' : ''} /></CdsButton>{expanded && <div className="chat-content__detail-body">{detailParagraphs.map((paragraph, index) => <p key={`${index}:${paragraph}`}>{paragraph}</p>)}</div>}</div>}
    {children}
  </div>
}

export function TimelineSummary({ content, children, fallbackTitle }: { content?: ChatContentView; children?: string; fallbackTitle?: string }): React.JSX.Element {
  return <ChatContentBlock content={content ?? legacyChatContent(children ?? '', fallbackTitle)} />
}

export interface ChatMessageProps extends AgentMessageIdentity {
  source: 'user' | 'agent'
  time: string
  variant?: 'message' | 'timeline'
  status?: ReactNode
  surface?: 'bubble' | 'none'
  modelName?: string
  attachments?: ReactNode
  children: ReactNode
}

export function ChatMessage({ source, name, initials, color, time, avatarSrc, variant = 'message', status, surface = 'bubble', modelName, attachments, children }: ChatMessageProps): React.JSX.Element {
  return <CdsMessage source={source} name={name} time={time} modelName={modelName} attachments={attachments} avatar={<Avatar label={name} initials={initials} color={color} size="small" src={avatarSrc} />} timeline={variant === 'timeline'} borderless={surface === 'none'} status={status}>{children}</CdsMessage>
}

const agentActivityLabels: Record<AgentActivityState, string> = {
  thinking: '思考中'
}

export function AgentActivityMessage({ activity, autoReveal = true }: { activity: AgentActivityMessageContract; autoReveal?: boolean }): React.JSX.Element {
  const statusRef = useRef<HTMLDivElement>(null)
  const label = agentActivityLabels[activity.state]

  useEffect(() => {
    if (!autoReveal) return
    statusRef.current?.closest('.message-block')?.scrollIntoView?.({ behavior: reducedMotionRequested() ? 'auto' : 'smooth', block: 'nearest' })
  }, [autoReveal])

  return <ChatMessage source="agent" {...activity.agent} time={activity.time} surface="none">
    <div ref={statusRef} className="agent-activity" data-state={activity.state} role="status" aria-label={`${activity.agent.name} ${label}`}>
      <CdsThinkingIndicator label={label} />
    </div>
  </ChatMessage>
}

export function StreamingMarkdownMessage({ children, active }: { children: string; active: boolean }): React.JSX.Element {
  return <div className={`streaming-response${active ? ' is-writing' : ''}`} data-cds="StreamingText" aria-live={active ? 'polite' : undefined}><MarkdownContent>{children}</MarkdownContent>{active && <span className="cds-stream-cursor" data-cds="StreamingCursor" aria-hidden="true" />}</div>
}

interface AttachmentActions {
  openMode?: 'system' | 'preview'
  onOpen?: (id: string) => void
  onReveal?: (id: string) => void
  onDownload?: (id: string) => void
}

export function AttachmentOpenMenu({ attachment, openMode = 'system', onOpen, onReveal, onDownload }: { attachment: MessageAttachment } & AttachmentActions): React.JSX.Element {
  const hasActions = Boolean(onOpen || onReveal || onDownload)
  return <MenuTrigger>
    <Button data-cds="Button" data-cds-size="icon" data-cds-variant="ghost" className="attachment-open-trigger" aria-label={`打开方式 ${attachment.name}`} isDisabled={!hasActions}>
      <OpenNewWindow aria-hidden />

    </Button>
    <Popover className="attachment-open-popover" placement="bottom end" offset={6}>
      <Menu className="attachment-open-menu" aria-label={`${attachment.name} 的打开方式`}>
        {onOpen && <MenuItem id="open" className="attachment-open-menu__item" onAction={() => onOpen(attachment.id)}>
          <span className="attachment-open-menu__icon"><OpenNewWindow aria-hidden /></span>
          <span className="attachment-open-menu__copy"><strong>{openMode === 'preview' ? '预览文档' : '使用系统默认应用打开'}</strong><small>{openMode === 'preview' ? '在当前窗口查看文档' : '使用 macOS 关联的应用'}</small></span>
        </MenuItem>}
        {onReveal && <MenuItem id="reveal" className="attachment-open-menu__item" onAction={() => onReveal(attachment.id)}>
          <span className="attachment-open-menu__icon"><Folder aria-hidden /></span>
          <span className="attachment-open-menu__copy"><strong>打开所在文件夹</strong><small>在 Finder 中定位此文件</small></span>
        </MenuItem>}
        {onDownload && <MenuItem id="download" className="attachment-open-menu__item" onAction={() => onDownload(attachment.id)}>
          <span className="attachment-open-menu__icon"><Download aria-hidden /></span>
          <span className="attachment-open-menu__copy"><strong>下载文档</strong><small>保存一份到本地</small></span>
        </MenuItem>}
      </Menu>
    </Popover>
  </MenuTrigger>
}

export function MessageAttachmentGroup({ attachments, source, embedded = false, onRemove, openMode, onOpen, onReveal, onDownload }: { attachments: MessageAttachment[]; source: 'user' | 'agent'; embedded?: boolean; onRemove?: (id: string) => void } & AttachmentActions): React.JSX.Element | null {
  const rowsRef = useRef<HTMLDivElement>(null)
  const [carouselState, setCarouselState] = useState({ current: 1, canPrevious: false, canNext: false })
  const isTimelineCarousel = source === 'user' && attachments.length > 1 && !onRemove
  const updateCarouselState = (): void => {
    const rows = rowsRef.current
    if (!rows || !isTimelineCarousel) return
    const firstCard = rows.firstElementChild as HTMLElement | null
    const step = firstCard ? firstCard.offsetWidth + 7 : rows.clientWidth
    const maxScroll = Math.max(0, rows.scrollWidth - rows.clientWidth)
    const isAtEnd = maxScroll > 0 && rows.scrollLeft >= maxScroll - 2
    setCarouselState({ current: isAtEnd ? attachments.length : Math.min(attachments.length, Math.round(rows.scrollLeft / Math.max(step, 1)) + 1), canPrevious: rows.scrollLeft > 2, canNext: rows.scrollLeft < maxScroll - 2 })
  }
  const moveCarousel = (direction: -1 | 1): void => {
    const rows = rowsRef.current
    const firstCard = rows?.firstElementChild as HTMLElement | null
    if (!rows) return
    rows.scrollBy({ left: direction * ((firstCard?.offsetWidth ?? rows.clientWidth) + 7), behavior: reducedMotionRequested() ? 'auto' : 'smooth' })
  }

  useEffect(() => {
    const rows = rowsRef.current
    if (!rows || !isTimelineCarousel) return
    const frame = window.requestAnimationFrame(updateCarouselState)
    if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(frame)
    const observer = new ResizeObserver(updateCarouselState)
    observer.observe(rows)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame) }
  }, [attachments.length, isTimelineCarousel])

  if (!attachments.length) return null
  const multiple = attachments.length > 1
  return <div className={`message-attachments message-attachments--${source} message-attachments--${multiple ? 'multiple' : 'single'}${embedded ? ' message-attachments--embedded' : ''}${isTimelineCarousel ? ' message-attachments--carousel' : ''}`}>
    {multiple && <div className="message-attachments__header"><span>{source === 'agent' ? <Sparks aria-hidden /> : <Page aria-hidden />}{attachments.length} 个附件</span>{isTimelineCarousel && (carouselState.canPrevious || carouselState.canNext) && <span className="attachment-carousel-navigation"><small>{carouselState.current} / {attachments.length}</small><IconButton label="查看上一份附件" icon={NavArrowLeft} onClick={() => moveCarousel(-1)} disabled={!carouselState.canPrevious} /><IconButton label="查看下一份附件" icon={NavArrowRight} onClick={() => moveCarousel(1)} disabled={!carouselState.canNext} /></span>}</div>}
    <div className="message-attachments__rows" ref={rowsRef} onScroll={isTimelineCarousel ? updateCarouselState : undefined}>{attachments.map((attachment) => <CdsAttachmentCard key={attachment.id} name={attachment.name} detail={attachment.detail} chip={Boolean(onRemove)} action={onRemove ? <IconButton className="attachment-remove-button" label={`移除 ${attachment.name}`} icon={Xmark} onClick={() => onRemove(attachment.id)} /> : source === 'agent' ? <AttachmentOpenMenu attachment={attachment} openMode={openMode} onOpen={onOpen} onReveal={onReveal} onDownload={onDownload} /> : <IconButton label={`打开 ${attachment.name}`} icon={NavArrowRight} onClick={() => onOpen?.(attachment.id)} disabled={!onOpen} />} />)}</div>
  </div>
}

export function MatterTeamAvatars({ team }: { team: MatterParticipant[] }): React.JSX.Element {
  return <span className="matter-team-avatars" aria-label={`当前临时团队：${team.map((item) => item.name).join('、')}`}>{team.map((item) => <Avatar key={item.id} label={item.name} initials={item.initials} color={item.color} size="small" src={item.src} />)}<small>{team.map((item) => item.name).join('、')}</small></span>
}

export function MatterRouteNote({ title, mode, busy = false, onOpenMatter, onCreateMatter, onRequestChange }: { title: string; mode: 'created' | 'linked'; busy?: boolean; onOpenMatter: () => void; onCreateMatter: () => void; onRequestChange?: () => void }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  return <div className="matter-route-note message-stream-item"><span title={title}><Sparks aria-hidden />{mode === 'created' ? '已创建事项' : '已归入已有事项'}</span><CdsButton variant="ghost" size="xs" className="matter-route-note__change" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>更改</CdsButton>{editing && <div className="matter-route-note__options" role="group" aria-label="更改消息归类"><CdsButton variant="ghost" size="sm" onClick={() => { setEditing(false); onOpenMatter() }}>查看当前事项</CdsButton>{onRequestChange && <CdsButton variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(false); onRequestChange() }}>将最新消息作为变更请求</CdsButton>}{mode === 'linked' && <CdsButton variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(false); onCreateMatter() }}>创建新事项草稿</CdsButton>}</div>}</div>
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileDetail(file: Pick<File, 'name' | 'size'>): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined
  return `${extension || '文件'} · ${fileSizeLabel(file.size)}`
}
