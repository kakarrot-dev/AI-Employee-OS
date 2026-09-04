import { Children, useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { Check, Search, Xmark } from 'iconoir-react'
import { Button, Input, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'

export type ClientIcon = ComponentType<{ width?: number | string; height?: number | string; strokeWidth?: number; 'aria-hidden'?: boolean }>

export interface RailItem<TId extends string> {
  id: TId
  label: string
  icon: ClientIcon
  marker?: string
}

export function IconButton({ label, icon: Icon, className = '', disabled = false, onClick }: { label: string; icon: ClientIcon; className?: string; disabled?: boolean; onClick?: () => void }): React.JSX.Element {
  return <TooltipTrigger delay={450}><Button aria-label={label} className={`icon-button${className ? ` ${className}` : ''}`} isDisabled={disabled} onPress={onClick}><Icon aria-hidden /></Button><Tooltip className="app-tooltip" placement="bottom">{label}</Tooltip></TooltipTrigger>
}

export function Avatar({ label, initials, color = '#d7b36a', size = 'small', src }: { label: string; initials: string; color?: string; size?: 'small' | 'medium' | 'large'; src?: string | null }): React.JSX.Element {
  return <span className={`avatar avatar--${size}`} style={{ '--avatar-color': color } as React.CSSProperties} aria-label={label}>{src ? <img src={src} alt="" /> : initials}</span>
}

export interface PersonIdentity {
  name: string
  initials: string
  color: string
  avatarSrc?: string | null
}

export function PersonAvatar({ identity, size = 'small' }: { identity: PersonIdentity; size?: 'small' | 'medium' | 'large' }): React.JSX.Element {
  return <Avatar label={identity.name} initials={identity.initials} color={identity.color} size={size} src={identity.avatarSrc} />
}

export function StatusLight({ state, label, breathing = false }: { state: 'active' | 'waiting' | 'success' | 'danger' | 'muted'; label: string; breathing?: boolean }): React.JSX.Element {
  return <span className="status-light"><span className={`status-light__dot status-light__dot--${state}${breathing ? ' is-breathing' : ''}`} />{label}</span>
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }): React.JSX.Element {
  return <div className="section-header"><h2>{title}</h2>{action}</div>
}

export function SearchBox({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  return <TextField aria-label={label} value={value} onChange={onChange} className="search-box"><Search aria-hidden /><Input placeholder={placeholder} /></TextField>
}

export function SelectionCatalog({ searchLabel, placeholder, query, resultLabel, emptyMessage, onQueryChange, children }: { searchLabel: string; placeholder: string; query: string; resultLabel: string; emptyMessage: string; onQueryChange: (value: string) => void; children: ReactNode }): React.JSX.Element {
  const items = Children.toArray(children)
  return <div className="selection-catalog"><div className="selection-catalog__toolbar"><SearchBox label={searchLabel} placeholder={placeholder} value={query} onChange={onQueryChange} /><span>{resultLabel}</span></div><div className="selection-catalog__grid">{items.length ? items : <p className="selection-catalog__empty">{emptyMessage}</p>}</div></div>
}

export function SelectionOption({ title, description, meta, status, selected, disabled = false, leading, onSelect }: { title: string; description: string; meta: string; status: ReactNode; selected: boolean; disabled?: boolean; leading: ReactNode; onSelect: () => void }): React.JSX.Element {
  return <Button className={`selection-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} isDisabled={disabled} onPress={onSelect}><span className="selection-option__leading">{leading}</span><span className="selection-option__body"><span className="selection-option__title"><strong>{title}</strong><em>{meta}</em></span><small>{description}</small><span className="selection-option__status">{status}</span></span><span className="selection-option__indicator" aria-hidden="true">{selected && <Check />}</span></Button>
}

export function ListRow({ title, subtitle, meta, selected = false, avatar, identity = avatar ? 'person' : 'text', marker, onClick }: { title: string; subtitle: string; meta?: string; selected?: boolean; avatar?: ReactNode; identity?: 'person' | 'text'; marker?: ReactNode; onClick: () => void }): React.JSX.Element {
  const showAvatar = identity === 'person' && avatar !== undefined && avatar !== null
  return <Button className={`list-row list-row--${identity}${selected ? ' is-selected' : ''}`} onPress={onClick}>{showAvatar && <span className="list-row__avatar">{avatar}</span>}<span className="list-row__body"><span className="list-row__title">{title}</span><span className="list-row__subtitle">{subtitle}</span></span><span className="list-row__meta">{meta}{marker}</span></Button>
}

export function ProfileSummary({ identity, title, description, actions }: { identity: PersonIdentity; title: string; description: string; actions?: ReactNode }): React.JSX.Element {
  return <section className="profile-summary"><div className="profile-summary__identity"><PersonAvatar identity={identity} size="large" /><div className="profile-summary__copy"><span>{identity.name}</span><h2>{title}</h2><p>{description}</p></div></div>{actions && <div className="profile-summary__actions" aria-label="资料操作">{actions}</div>}</section>
}

export interface ProfileFact {
  label: string
  value: ReactNode
}

export function ProfileFacts({ title = '基本资料', items }: { title?: string; items: ProfileFact[] }): React.JSX.Element {
  return <section className="profile-facts"><h3>{title}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}

export interface ProfileValueTag extends ProfileFact {
  accessibleValue: string
}

export function ProfileValueTags({ label = '基本资料', items }: { label?: string; items: ProfileValueTag[] }): React.JSX.Element {
  return <ul className="profile-value-tags" aria-label={label}>{items.map((item) => <li key={item.label} aria-label={`${item.label}：${item.accessibleValue}`}>{item.value}</li>)}</ul>
}

export function SummaryCardGrid({ children, emptyMessage, label }: { children: ReactNode; emptyMessage: string; label?: string }): React.JSX.Element {
  const items = Children.toArray(children)
  return <div className="summary-card-grid" aria-label={label} role={label ? 'list' : undefined}>{items.length ? items : <p className="summary-card-grid__empty">{emptyMessage}</p>}</div>
}

export type SummaryCardTone = 'default' | 'success' | 'muted'

export function SummaryCard({ title, description, leading, trailing, tone = 'default' }: { title: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode; tone?: SummaryCardTone }): React.JSX.Element {
  const hasLeading = leading !== undefined && leading !== null
  const hasTrailing = trailing !== undefined && trailing !== null
  return <article className={`summary-card summary-card--${tone}${hasLeading ? ' has-leading' : ''}${hasTrailing ? ' has-trailing' : ''}`}>{hasLeading && <span className="summary-card__leading">{leading}</span>}<span className="summary-card__body"><strong>{title}</strong>{description !== undefined && description !== null && <small>{description}</small>}</span>{hasTrailing && <span className="summary-card__trailing">{trailing}</span>}</article>
}

export function SummaryList({ children, emptyMessage, variant = 'subtle' }: { children: ReactNode; emptyMessage: string; variant?: 'subtle' | 'outlined' }): React.JSX.Element {
  const items = Children.toArray(children)
  return <div className={`summary-list summary-list--${variant}`}>{items.length ? items : <p className="summary-list__empty">{emptyMessage}</p>}</div>
}

export interface DetailMetric {
  label: string
  value: ReactNode
}

export type DetailTone = 'active' | 'waiting' | 'success' | 'danger' | 'muted'

export function DetailSummaryPanel({ icon, title, description, metrics = [], tone = 'muted' }: { icon: ReactNode; title: string; description: string; metrics?: DetailMetric[]; tone?: DetailTone }): React.JSX.Element {
  return <div className={`detail-summary-panel detail-summary-panel--${tone}`}>
    <div className="detail-summary-panel__intro"><span className="detail-summary-panel__icon">{icon}</span><div className="detail-summary-panel__copy"><h3>{title}</h3><p>{description}</p></div></div>
    {metrics.length > 0 && <div className="detail-metric-group" aria-label="概况指标">{metrics.map((metric) => <span className="detail-metric-group__item" key={metric.label}><strong>{metric.value}</strong><small>{metric.label}</small></span>)}</div>}
  </div>
}

export function DetailSectionHeader({ title, description, meta }: { title: string; description?: string; meta?: ReactNode }): React.JSX.Element {
  return <div className="detail-section-header"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{meta !== undefined && meta !== null && <span className="detail-section-header__meta">{meta}</span>}</div>
}

export function DetailListMark({ children, tone = 'muted', shape = 'circle' }: { children: ReactNode; tone?: DetailTone; shape?: 'circle' | 'rounded' }): React.JSX.Element {
  return <span className={`detail-list-mark detail-list-mark--${shape} detail-list-mark--${tone}`}>{children}</span>
}

export function DetailState({ children, tone = 'muted' }: { children: ReactNode; tone?: DetailTone }): React.JSX.Element {
  return <span className={`detail-state detail-state--${tone}`}>{children}</span>
}

export function DetailNote({ icon, children, tone = 'muted' }: { icon?: ReactNode; children: ReactNode; tone?: DetailTone }): React.JSX.Element {
  return <p className={`detail-note detail-note--${tone}`}>{icon}{children}</p>
}

export function SummaryListItem({ title, subtitle, leading, trailing, onClick }: { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode; trailing?: ReactNode; onClick?: () => void }): React.JSX.Element {
  const content = <>{leading !== undefined && leading !== null && <span className="summary-list__leading">{leading}</span>}<span className="summary-list__body"><strong>{title}</strong>{subtitle !== undefined && subtitle !== null && <small>{subtitle}</small>}</span>{trailing !== undefined && trailing !== null && <span className="summary-list__trailing">{trailing}</span>}</>
  return onClick ? <button type="button" className="summary-list__item summary-list__item--interactive" onClick={onClick}>{content}</button> : <div className="summary-list__item">{content}</div>
}

export function Toolbar({ title, icon: Icon, navigation, support, trailing }: { title: string; icon?: ClientIcon; navigation?: ReactNode; support?: ReactNode; trailing?: ReactNode }): React.JSX.Element {
  return <header className="toolbar" aria-label="窗口拖拽区" data-layout-contract="application-toolbar"><div className="window-controls-safe-area" data-toolbar-zone="navigation">{navigation}</div><div className="toolbar__workspace" data-toolbar-zone="workspace"><div className="toolbar__content"><div className="toolbar__identity" data-toolbar-zone="identity">{Icon && <span className="toolbar__title-icon" aria-hidden="true"><Icon /></span>}<h1>{title}</h1>{support}</div>{trailing && <div className="toolbar__trailing" data-toolbar-zone="actions">{trailing}</div>}</div></div></header>
}

export function Rail<TId extends string>({ active, items, footerItems, userProfile, onProfile, onNavigate }: { active: TId; items: Array<RailItem<TId>>; footerItems: Array<RailItem<TId>>; userProfile?: { name: string; avatarUrl?: string | null }; onProfile?: () => void; onNavigate: (id: TId) => void }): React.JSX.Element {
  const render = (item: RailItem<TId>): React.JSX.Element => { const Icon = item.icon; return <TooltipTrigger key={item.id} delay={350}><Button aria-label={item.label} aria-current={active === item.id ? 'page' : undefined} className={`rail-button${active === item.id ? ' is-active' : ''}`} onPress={() => onNavigate(item.id)}><Icon aria-hidden />{item.marker && <span className="rail-button__marker">{item.marker}</span>}</Button><Tooltip className="app-tooltip" placement="right">{item.label}</Tooltip></TooltipTrigger> }
  return <nav className="rail" aria-label="一级导航"><div className="rail__main">{items.map(render)}</div><div className="rail__footer">{userProfile && onProfile && <TooltipTrigger delay={350}><Button className="rail-profile-button" aria-label={`${userProfile.name} 个人信息`} onPress={onProfile}><Avatar label={userProfile.name} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="small" src={userProfile.avatarUrl} /></Button><Tooltip className="app-tooltip" placement="right">个人信息</Tooltip></TooltipTrigger>}{footerItems.map(render)}</div></nav>
}

export function ContextPane({ children, footer }: { children: ReactNode; footer?: ReactNode }): React.JSX.Element {
  return <aside className="context-pane">{children}{footer}</aside>
}

export function Workspace({ children }: { children: ReactNode }): React.JSX.Element {
  return <section className="workspace"><div className="workspace-center">{children}</div></section>
}

export function AppShell({ toolbar, rail, context, contextCollapsed = false, children }: { toolbar: ReactNode; rail: ReactNode; context: ReactNode; contextCollapsed?: boolean; children: ReactNode }): React.JSX.Element {
  return <main className={`prototype${contextCollapsed ? ' is-context-collapsed' : ''}`}>{toolbar}{rail}{context}<Workspace>{children}</Workspace></main>
}

export function DetailPage({ children, className = '', width = 'default' }: { children: ReactNode; className?: string; width?: 'default' | 'wide' }): React.JSX.Element {
  return <div className={`workspace-page detail-page${width === 'wide' ? ' detail-page--wide' : ''}${className ? ` ${className}` : ''}`}><div className="detail-canvas">{children}</div></div>
}

export function SettingsBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  return <section className="settings-block"><div className="settings-block__heading"><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="settings-block__content">{children}</div></section>
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  return <div className="setting-row"><span><strong>{title}</strong>{description && <small>{description}</small>}</span>{children}</div>
}

export function ClientModal({ open, title, eyebrow, identity, headerMeta, size = 'large', nested = false, onClose, children }: { open: boolean; title: string; eyebrow?: ReactNode; identity?: ReactNode; headerMeta?: ReactNode; size?: 'small' | 'medium' | 'large'; nested?: boolean; onClose: () => void; children: ReactNode }): React.JSX.Element | null {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = (): HTMLElement[] => dialogRef.current ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')) : []
    window.requestAnimationFrame(() => focusable()[0]?.focus())
    const onKeyDown = (event: KeyboardEvent): void => {
      const dialogs = document.querySelectorAll<HTMLElement>('.app-modal')
      if (dialogs.item(dialogs.length - 1) !== dialogRef.current) return
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0], last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [open])
  if (!open) return null
  return <div className={`modal-overlay${nested ? ' modal-overlay--nested' : ''}`} data-entering="" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className={`app-modal app-modal--${size}`} data-entering="" role="dialog" aria-modal="true" aria-label={title}><div className="modal-dialog"><div className="modal-header">{identity ?? <div><h2>{title}</h2>{eyebrow}</div>}{headerMeta}<IconButton label="关闭" icon={Xmark} onClick={onClose} /></div>{children}</div></section></div>
}
