import { Children, useId, useRef, type ComponentType, type ReactNode } from 'react'
import { Check, Search, Xmark } from './cds-icons'
import { Button, Input, Menu, MenuItem, MenuTrigger, Popover, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'
import { CdsButton } from '../open-claude-ui/primitives/CdsButton'
import { CdsDialog } from '../open-claude-ui/primitives/ConfirmationDialog'
import { CdsStatusIndicator } from '../open-claude-ui/primitives/StatusIndicators'

export { CdsButton } from '../open-claude-ui/primitives/CdsButton'
export { CdsSegmentedControl } from '../open-claude-ui/primitives/SegmentedControl'

export type ClientIcon = ComponentType<{ width?: number | string; height?: number | string; strokeWidth?: number; 'aria-hidden'?: boolean }>

export interface RailItem<TId extends string> {
  id: TId
  label: string
  icon: ClientIcon
  marker?: string
  badge?: string
  disabled?: boolean
}

export function IconButton({ label, icon: Icon, className = '', disabled = false, onClick }: { label: string; icon: ClientIcon; className?: string; disabled?: boolean; onClick?: () => void }): React.JSX.Element {
  return <CdsButton type="button" aria-label={label} title={label} className={`icon-button cds-icon-button${className ? ` ${className}` : ''}`} data-cds-primitive="IconButton" size="icon" variant="ghost" disabled={disabled} onClick={onClick} icon={<Icon aria-hidden />} />
}

export function Avatar({ label, initials, color = '#d7b36a', size = 'small', src }: { label: string; initials: string; color?: string; size?: 'small' | 'medium' | 'large'; src?: string | null }): React.JSX.Element {
  return <span className={`avatar avatar--${size} cds-avatar`} data-cds="Avatar" data-size={size} style={{ '--cds-avatar-color': color, '--avatar-color': color } as React.CSSProperties} aria-label={label}>{src ? <img src={src} alt="" /> : <span className="cds-avatar__initials">{initials}</span>}</span>
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
  return <CdsStatusIndicator tone={state} label={label} animate={breathing} />
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }): React.JSX.Element {
  return <div className="section-header cds-section-header" data-cds="SectionHeader"><h2>{title}</h2>{action && <div className="cds-section-header__actions">{action}</div>}</div>
}

export function SearchBox({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  return <TextField aria-label={label} value={value} onChange={onChange} className="search-box cds-search-field" data-cds="SearchField"><span className="cds-search-field__icon" aria-hidden="true"><Search /></span><Input ref={inputRef} placeholder={placeholder} />{value.length > 0 && <IconButton label="清除搜索" icon={Xmark} onClick={() => { onChange(''); inputRef.current?.focus() }} />}</TextField>
}

export function SelectionCatalog({ searchLabel, placeholder, query, resultLabel, emptyMessage, onQueryChange, children }: { searchLabel: string; placeholder: string; query: string; resultLabel: string; emptyMessage: string; onQueryChange: (value: string) => void; children: ReactNode }): React.JSX.Element {
  const items = Children.toArray(children)
  return <div className="selection-catalog cds-selection-catalog" data-cds="SelectionCatalog"><div className="selection-catalog__toolbar cds-selection-catalog__toolbar"><SearchBox label={searchLabel} placeholder={placeholder} value={query} onChange={onQueryChange} /><span className="cds-selection-catalog__count">{resultLabel}</span></div><div className="selection-catalog__grid cds-selection-catalog__options">{items.length ? items : <p className="selection-catalog__empty cds-empty" role="status">{emptyMessage}</p>}</div></div>
}

export function SelectionOption({ title, description, meta, status, selected, disabled = false, leading, onSelect }: { title: string; description: string; meta: string; status: ReactNode; selected: boolean; disabled?: boolean; leading: ReactNode; onSelect: () => void }): React.JSX.Element {
  return <CdsButton type="button" variant="ghost" className={`selection-option cds-selection-option${selected ? ' is-selected' : ''}`} data-cds-primitive="SelectionOption" aria-pressed={selected} disabled={disabled} onClick={onSelect}><span className="cds-selection-option__layout"><span className="selection-option__leading cds-selection-option__leading">{leading}</span><span className="selection-option__body cds-selection-option__body"><span className="selection-option__title"><strong title={title}>{title}</strong><em>{meta}</em></span><small>{description}</small><span className="selection-option__status">{status}</span></span><span className="selection-option__indicator cds-selection-option__indicator" aria-hidden="true">{selected && <Check />}</span></span></CdsButton>
}

export function ListRow({ title, subtitle, meta, selected = false, avatar, identity = avatar ? 'person' : 'text', marker, onClick }: { title: string; subtitle: string; meta?: string; selected?: boolean; avatar?: ReactNode; identity?: 'person' | 'text'; marker?: ReactNode; onClick: () => void }): React.JSX.Element {
  const showAvatar = identity === 'person' && avatar !== undefined && avatar !== null
  return <CdsButton type="button" variant="ghost" aria-current={selected ? 'true' : undefined} className={`list-row cds-list-row list-row--${identity}${selected ? ' is-selected' : ''}`} data-cds-primitive="ListRow" onClick={onClick}><span className="cds-list-row__layout">{showAvatar && <span className="list-row__avatar">{avatar}</span>}<span className="list-row__body"><span className="list-row__title">{title}</span><span className="list-row__subtitle">{subtitle}</span></span><span className="list-row__meta">{meta}{marker}</span></span></CdsButton>
}

export function ProfileSummary({ identity, title, description, avatar, actions }: { identity: PersonIdentity; title: string; description: string; avatar?: ReactNode; actions?: ReactNode }): React.JSX.Element {
  return <section className="profile-summary cds-profile-summary" data-cds="ProfileSummary"><div className="profile-summary__identity">{avatar ?? <PersonAvatar identity={identity} size="large" />}<div className="profile-summary__copy"><span>{identity.name}</span><h2>{title}</h2><p>{description}</p></div></div>{actions && <div className="profile-summary__actions" aria-label="资料操作">{actions}</div>}</section>
}

export interface ProfileFact {
  label: string
  value: ReactNode
}

export function ProfileFacts({ title = '基本资料', items }: { title?: string; items: ProfileFact[] }): React.JSX.Element {
  return <section className="profile-facts cds-profile-facts" data-cds="ProfileFacts"><h3>{title}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}

export interface ProfileValueTag extends ProfileFact {
  accessibleValue: string
}

export function ProfileValueTags({ label = '基本资料', items, showLabels = false }: { label?: string; items: ProfileValueTag[]; showLabels?: boolean }): React.JSX.Element {
  return <ul className={`profile-value-tags cds-profile-tags${showLabels ? ' profile-value-tags--labeled' : ''}`} data-cds="ProfileTags" aria-label={label}>{items.map((item) => <li key={item.label} aria-label={`${item.label}：${item.accessibleValue}`}>{showLabels ? <><small>{item.label}</small><span>{item.value}</span></> : item.value}</li>)}</ul>
}

export function SummaryCardGrid({ children, emptyMessage, label }: { children: ReactNode; emptyMessage: string; label?: string }): React.JSX.Element {
  const items = Children.toArray(children)
  return <div className="summary-card-grid cds-card-grid" data-cds="CardGrid" aria-label={label} role={label ? 'list' : undefined}>{items.length ? items : <p className="summary-card-grid__empty cds-empty">{emptyMessage}</p>}</div>
}

export type SummaryCardTone = 'default' | 'success' | 'muted'

export function SummaryCard({ title, description, leading, trailing, tone = 'default', onClick, label }: { title: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode; tone?: SummaryCardTone; onClick?: () => void; label?: string }): React.JSX.Element {
  const hasLeading = leading !== undefined && leading !== null
  const hasTrailing = trailing !== undefined && trailing !== null
  const className = `summary-card cds-card summary-card--${tone}${hasLeading ? ' has-leading' : ''}${hasTrailing ? ' has-trailing' : ''}${onClick ? ' summary-card--interactive' : ''}`
  const content = <span className="cds-card__layout">{hasLeading && <span className="summary-card__leading">{leading}</span>}<span className="summary-card__body"><strong>{title}</strong>{description !== undefined && description !== null && <small>{description}</small>}</span>{hasTrailing && <span className="summary-card__trailing">{trailing}</span>}</span>
  return onClick ? <CdsButton type="button" variant="ghost" className={className} data-cds-primitive="SummaryCard" data-tone={tone} aria-label={label} onClick={onClick}>{content}</CdsButton> : <article className={className} data-cds="SummaryCard" data-tone={tone}>{content}</article>
}

export function SummaryList({ children, emptyMessage, variant = 'subtle' }: { children: ReactNode; emptyMessage: string; variant?: 'subtle' | 'outlined' }): React.JSX.Element {
  const items = Children.toArray(children)
  return <div className={`summary-list cds-summary-list summary-list--${variant}`} data-cds="SummaryList" data-variant={variant}>{items.length ? items : <p className="summary-list__empty cds-empty">{emptyMessage}</p>}</div>
}

export interface DetailMetric {
  label: string
  value: ReactNode
}

export type DetailTone = 'active' | 'waiting' | 'success' | 'danger' | 'muted'

export function DetailSummaryPanel({ icon, title, description, metrics = [], tone = 'muted' }: { icon: ReactNode; title: string; description: string; metrics?: DetailMetric[]; tone?: DetailTone }): React.JSX.Element {
  return <div className={`detail-summary-panel cds-detail-summary detail-summary-panel--${tone}`} data-cds="DetailSummary" data-tone={tone}>
    <div className="detail-summary-panel__intro"><span className="detail-summary-panel__icon">{icon}</span><div className="detail-summary-panel__copy"><h3>{title}</h3><p>{description}</p></div></div>
    {metrics.length > 0 && <div className="detail-metric-group" aria-label="概况指标">{metrics.map((metric) => <span className="detail-metric-group__item" key={metric.label}><strong>{metric.value}</strong><small>{metric.label}</small></span>)}</div>}
  </div>
}

export function DetailSectionHeader({ title, description, meta }: { title: string; description?: string; meta?: ReactNode }): React.JSX.Element {
  return <div className="detail-section-header cds-detail-section-header" data-cds="DetailSectionHeader"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{meta !== undefined && meta !== null && <span className="detail-section-header__meta">{meta}</span>}</div>
}

export function DetailListMark({ children, tone = 'muted', shape = 'circle' }: { children: ReactNode; tone?: DetailTone; shape?: 'circle' | 'rounded' }): React.JSX.Element {
  return <span className={`detail-list-mark cds-detail-mark detail-list-mark--${shape} detail-list-mark--${tone}`} data-cds="DetailMark" data-tone={tone} data-shape={shape}>{children}</span>
}

export function DetailState({ children, tone = 'muted' }: { children: ReactNode; tone?: DetailTone }): React.JSX.Element {
  return <span className={`detail-state cds-detail-state detail-state--${tone}`} data-cds="DetailState" data-tone={tone}>{children}</span>
}

export function DetailNote({ icon, children, tone = 'muted' }: { icon?: ReactNode; children: ReactNode; tone?: DetailTone }): React.JSX.Element {
  return <p className={`detail-note cds-detail-note detail-note--${tone}`} data-cds="DetailNote" data-tone={tone}>{icon && <span className="cds-detail-note__icon">{icon}</span>}<span>{children}</span></p>
}

export function SummaryListItem({ title, subtitle, leading, trailing, onClick }: { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode; trailing?: ReactNode; onClick?: () => void }): React.JSX.Element {
  const content = <span className="cds-summary-list__layout">{leading !== undefined && leading !== null && <span className="summary-list__leading">{leading}</span>}<span className="summary-list__body"><strong>{title}</strong>{subtitle !== undefined && subtitle !== null && <small>{subtitle}</small>}</span>{trailing !== undefined && trailing !== null && <span className="summary-list__trailing">{trailing}</span>}</span>
  return onClick ? <CdsButton type="button" variant="ghost" className="summary-list__item cds-summary-list__item summary-list__item--interactive" data-cds-primitive="SummaryListItem" onClick={onClick}>{content}</CdsButton> : <div className="summary-list__item cds-summary-list__item" data-cds="SummaryListItem">{content}</div>
}

export function Toolbar({ title, icon: Icon, navigation, support, trailing, label = '窗口拖拽区' }: { title: string; icon?: ClientIcon; navigation?: ReactNode; support?: ReactNode; trailing?: ReactNode; label?: string }): React.JSX.Element {
  return <header className="toolbar" aria-label={label} data-layout-contract="application-toolbar"><div className="window-controls-safe-area" data-toolbar-zone="navigation">{navigation}</div><div className="toolbar__workspace" data-toolbar-zone="workspace"><div className="toolbar__content"><div className="toolbar__identity" data-toolbar-zone="identity">{Icon && <span className="toolbar__title-icon" aria-hidden="true"><Icon /></span>}<h1>{title}</h1>{support}</div>{trailing && <div className="toolbar__trailing" data-toolbar-zone="actions">{trailing}</div>}</div></div></header>
}

export function Rail<TId extends string>({ active, items, footerItems, userProfile, profileLabel = '个人信息', profileActive = false, profileMenuItems = [], expanded = false, header, children, onProfile, onNavigate }: { active: TId; items: Array<RailItem<TId>>; footerItems: Array<RailItem<TId>>; userProfile?: { name: string; avatarUrl?: string | null }; profileLabel?: string; profileActive?: boolean; profileMenuItems?: Array<RailItem<TId>>; expanded?: boolean; header?: ReactNode; children?: ReactNode; onProfile?: () => void; onNavigate: (id: TId) => void }): React.JSX.Element {
  const render = (item: RailItem<TId>): React.JSX.Element => { const Icon = item.icon; const label = item.badge ? `${item.label} ${item.badge}` : item.label; return <TooltipTrigger key={item.id} delay={350}><Button aria-label={label} isDisabled={item.disabled} aria-current={active === item.id ? 'page' : undefined} className={`rail-button${active === item.id ? ' is-active' : ''}`} onPress={() => onNavigate(item.id)}><Icon aria-hidden />{expanded && <span className="rail-button__label">{item.label}</span>}{expanded && item.badge && <span className="rail-button__badge">{item.badge}</span>}{item.marker && <span className="rail-button__marker">{item.marker}</span>}</Button><Tooltip className="app-tooltip" placement="right">{label}</Tooltip></TooltipTrigger> }
  const profileContent = userProfile && <><Avatar label={userProfile.name} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="small" src={userProfile.avatarUrl} />{expanded && <span className="rail-profile-button__copy"><strong>{userProfile.name}</strong><small>{profileLabel}</small></span>}</>
  const profileButton = userProfile && (profileMenuItems.length ? <MenuTrigger>
    <Button className="rail-profile-button" aria-current={profileActive ? 'page' : undefined} aria-label={`${userProfile.name} 用户菜单`}>{profileContent}</Button>
    <Popover className="rail-profile-popover" placement="top start" offset={8}>
      <Menu className="rail-profile-menu" aria-label="用户菜单">{profileMenuItems.map((item) => { const Icon = item.icon; return <MenuItem key={item.id} id={item.id} textValue={item.label} className="rail-profile-menu__item" onAction={() => onNavigate(item.id)}><Icon aria-hidden /><span>{item.label}</span></MenuItem> })}</Menu>
    </Popover>
  </MenuTrigger> : onProfile && <TooltipTrigger delay={350}><Button className="rail-profile-button" aria-current={profileActive ? 'page' : undefined} aria-label={`${userProfile.name} ${profileLabel}`} onPress={onProfile}>{profileContent}</Button><Tooltip className="app-tooltip" placement="right">{profileLabel}</Tooltip></TooltipTrigger>)
  return <nav className={`rail${expanded ? ' rail--expanded' : ''}`} aria-label="一级导航">{header && <div className="rail__header">{header}</div>}<div className="rail__main">{items.map(render)}</div>{children && <div className="rail__body" hidden={!expanded}>{children}</div>}<div className="rail__footer">{profileButton}{footerItems.map(render)}</div></nav>
}

export function ContextPane({ children, footer }: { children: ReactNode; footer?: ReactNode }): React.JSX.Element {
  return <aside className="context-pane cds-context-pane" data-cds="ContextPane">{children}{footer}</aside>
}

export function Workspace({ children }: { children: ReactNode }): React.JSX.Element {
  return <section className="workspace"><div className="workspace-center">{children}</div></section>
}

export function AppShell({ toolbar, rail, context, contextCollapsed = false, className = '', children }: { toolbar: ReactNode; rail: ReactNode; context: ReactNode; contextCollapsed?: boolean; className?: string; children: ReactNode }): React.JSX.Element {
  return <main className={`prototype${contextCollapsed ? ' is-context-collapsed' : ''}${className ? ` ${className}` : ''}`}>{toolbar}{rail}{context}<Workspace>{children}</Workspace></main>
}

export function DetailPage({ children, className = '', width = 'default' }: { children: ReactNode; className?: string; width?: 'default' | 'wide' }): React.JSX.Element {
  return <div className={`workspace-page detail-page cds-detail-page${width === 'wide' ? ' detail-page--wide' : ''}${className ? ` ${className}` : ''}`} data-cds="DetailPage" data-width={width}><div className="detail-canvas cds-detail-page__canvas">{children}</div></div>
}

export function SettingsBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  const id = useId()
  return <section className="settings-block cds-settings-section" data-cds="SettingsSection" aria-labelledby={id}><div className="settings-block__heading cds-settings-section__heading"><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div><div className="settings-block__content cds-settings-section__content">{children}</div></section>
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  return <div className="setting-row cds-setting-row" data-cds="SettingRow"><span className="cds-setting-row__copy"><strong>{title}</strong>{description && <small>{description}</small>}</span><div className="cds-setting-row__control">{children}</div></div>
}

export function ClientModal({ open, title, eyebrow, identity, headerMeta, size = 'large', nested = false, onClose, children }: { open: boolean; title: string; eyebrow?: ReactNode; identity?: ReactNode; headerMeta?: ReactNode; size?: 'small' | 'medium' | 'large'; nested?: boolean; onClose: () => void; children: ReactNode }): React.JSX.Element | null {
  return <CdsDialog open={open} title={title} size={size} nested={nested} onClose={onClose}><div className="modal-dialog cds-dialog__layout"><div className="modal-header cds-dialog__header">{identity ?? <div className="cds-dialog__title"><h2>{title}</h2>{eyebrow}</div>}{headerMeta}<IconButton label="关闭" icon={Xmark} onClick={onClose} /></div><div className="cds-dialog__content">{children}</div></div></CdsDialog>
}
