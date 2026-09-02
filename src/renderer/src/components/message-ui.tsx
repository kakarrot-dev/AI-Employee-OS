import { useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Folder, NavArrowDown, NavArrowLeft, NavArrowRight, OpenNewWindow, Page, Sparks, Xmark } from 'iconoir-react'
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components'
import { Avatar, IconButton } from './client-ui'

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

export function MarkdownContent({ children, className = '' }: { children: string; className?: string }): React.JSX.Element {
  return <div className={`markdown-rendered${className ? ` ${className}` : ''}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown></div>
}

export function MarkdownMessage({ children, compact = false }: { children: string; compact?: boolean }): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [collapsible, setCollapsible] = useState(false)

  useEffect(() => {
    const content = contentRef.current
    if (!content || expanded) return
    const measure = (): void => setCollapsible(content.scrollHeight > content.clientHeight + 1)
    const frame = window.requestAnimationFrame(measure)
    if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(frame)
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame) }
  }, [children, expanded])

  return <div className={`markdown-message${compact ? ' markdown-message--compact' : ''}`}><div ref={contentRef} className={`markdown-message__content${collapsible ? ' is-collapsible' : ''}${expanded ? ' is-expanded' : ''}`}><MarkdownContent>{children}</MarkdownContent></div>{(collapsible || expanded) && <Button className="message-expand-button" aria-expanded={expanded} onPress={() => setExpanded((value) => !value)}>{expanded ? '收起' : '展开全文'}<NavArrowDown aria-hidden width={14} height={14} className={expanded ? 'is-expanded' : ''} /></Button>}</div>
}

export interface ChatMessageProps {
  source: 'user' | 'agent'
  name: string
  initials: string
  color: string
  time: string
  avatarSrc?: string
  variant?: 'message' | 'timeline'
  status?: ReactNode
  children: ReactNode
}

export function ChatMessage({ source, name, initials, color, time, avatarSrc, variant = 'message', status, children }: ChatMessageProps): React.JSX.Element {
  return <article className={`message-block message-block--${source}${variant === 'timeline' ? ' message-block--timeline message-stream-item' : ''}`}><Avatar label={name} initials={initials} color={color} size="small" src={avatarSrc} /><div className="message-block__stack"><div className="message-author"><strong>{name}</strong><time>{time}</time></div><div className="message-bubble">{status && <div className="message-bubble__status">{status}</div>}{children}</div></div></article>
}

export function AttachmentOpenMenu({ attachment, onOpen, onReveal }: { attachment: MessageAttachment; onOpen?: (id: string) => void; onReveal?: (id: string) => void }): React.JSX.Element {
  const hasActions = Boolean(onOpen || onReveal)
  return <MenuTrigger>
    <Button className="attachment-open-trigger" aria-label={`打开方式 ${attachment.name}`} isDisabled={!hasActions}>
      <OpenNewWindow aria-hidden width={16} height={16} />
      <span>打开方式</span>
      <NavArrowDown aria-hidden width={14} height={14} className="attachment-open-trigger__chevron" />
    </Button>
    <Popover className="attachment-open-popover" placement="bottom end" offset={6}>
      <Menu className="attachment-open-menu" aria-label={`${attachment.name} 的打开方式`}>
        {onOpen && <MenuItem id="open" className="attachment-open-menu__item" onAction={() => onOpen(attachment.id)}>
          <span className="attachment-open-menu__icon"><OpenNewWindow aria-hidden width={17} height={17} /></span>
          <span className="attachment-open-menu__copy"><strong>使用系统默认应用打开</strong><small>使用 macOS 关联的应用</small></span>
        </MenuItem>}
        {onReveal && <MenuItem id="reveal" className="attachment-open-menu__item" onAction={() => onReveal(attachment.id)}>
          <span className="attachment-open-menu__icon"><Folder aria-hidden width={17} height={17} /></span>
          <span className="attachment-open-menu__copy"><strong>打开所在文件夹</strong><small>在 Finder 中定位此文件</small></span>
        </MenuItem>}
      </Menu>
    </Popover>
  </MenuTrigger>
}

export function MessageAttachmentGroup({ attachments, source, embedded = false, onRemove, onOpen, onReveal }: { attachments: MessageAttachment[]; source: 'user' | 'agent'; embedded?: boolean; onRemove?: (id: string) => void; onOpen?: (id: string) => void; onReveal?: (id: string) => void }): React.JSX.Element | null {
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
    rows.scrollBy({ left: direction * ((firstCard?.offsetWidth ?? rows.clientWidth) + 7), behavior: 'smooth' })
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
    {multiple && <div className="message-attachments__header"><span>{source === 'agent' ? <Sparks aria-hidden width={16} height={16} /> : <Page aria-hidden width={16} height={16} />}{attachments.length} 个附件</span>{isTimelineCarousel && (carouselState.canPrevious || carouselState.canNext) && <span className="attachment-carousel-navigation"><small>{carouselState.current} / {attachments.length}</small><IconButton label="查看上一份附件" icon={NavArrowLeft} onClick={() => moveCarousel(-1)} disabled={!carouselState.canPrevious} /><IconButton label="查看下一份附件" icon={NavArrowRight} onClick={() => moveCarousel(1)} disabled={!carouselState.canNext} /></span>}</div>}
    <div className="message-attachments__rows" ref={rowsRef} onScroll={isTimelineCarousel ? updateCarouselState : undefined}>{attachments.map((attachment) => <div className="message-attachment-row" key={attachment.id}><span className="message-attachment-row__icon"><Page aria-hidden width={18} height={18} /></span><span className="message-attachment-row__body"><strong title={attachment.name}>{attachment.name}</strong><small>{attachment.detail}</small></span>{onRemove ? <IconButton label={`移除 ${attachment.name}`} icon={Xmark} onClick={() => onRemove(attachment.id)} /> : source === 'agent' ? <span className="message-attachment-row__actions"><AttachmentOpenMenu attachment={attachment} onOpen={onOpen} onReveal={onReveal} /></span> : <IconButton label={`打开 ${attachment.name}`} icon={NavArrowRight} onClick={() => onOpen?.(attachment.id)} disabled={!onOpen} />}</div>)}</div>
  </div>
}

export function MatterTeamAvatars({ team }: { team: MatterParticipant[] }): React.JSX.Element {
  return <span className="matter-team-avatars" aria-label={`当前临时团队：${team.map((item) => item.name).join('、')}`}>{team.map((item) => <Avatar key={item.id} label={item.name} initials={item.initials} color={item.color} size="small" src={item.src} />)}<small>{team.map((item) => item.name).join('、')}</small></span>
}

export function MatterRouteNote({ title, mode, busy = false, onOpenMatter, onCreateMatter, onRequestChange }: { title: string; mode: 'created' | 'linked'; busy?: boolean; onOpenMatter: () => void; onCreateMatter: () => void; onRequestChange?: () => void }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  return <div className="matter-route-note message-stream-item"><span title={title}><Sparks aria-hidden width={14} height={14} />{mode === 'created' ? '已创建事项' : '已归入已有事项'}</span><Button className="matter-route-note__change" aria-expanded={editing} onPress={() => setEditing((value) => !value)}>更改</Button>{editing && <div className="matter-route-note__options" role="group" aria-label="更改消息归类"><Button onPress={() => { setEditing(false); onOpenMatter() }}>查看当前事项</Button>{onRequestChange && <Button isDisabled={busy} onPress={() => { setEditing(false); onRequestChange() }}>将最新消息作为变更请求</Button>}<Button isDisabled={busy} onPress={() => { setEditing(false); onCreateMatter() }}>创建新事项草稿</Button></div>}</div>
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileDetail(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined
  return `${extension || '文件'} · ${fileSizeLabel(file.size)}`
}
