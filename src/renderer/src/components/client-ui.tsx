import { useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { Search, Xmark } from 'iconoir-react'
import { Button, Input, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'

export type ClientIcon = ComponentType<{ width?: number | string; height?: number | string; strokeWidth?: number; 'aria-hidden'?: boolean }>

export interface RailItem<TId extends string> {
  id: TId
  label: string
  icon: ClientIcon
  marker?: string
}

export function IconButton({ label, icon: Icon, className = '', disabled = false, onClick }: { label: string; icon: ClientIcon; className?: string; disabled?: boolean; onClick?: () => void }): React.JSX.Element {
  return <TooltipTrigger delay={450}><Button aria-label={label} className={`icon-button${className ? ` ${className}` : ''}`} isDisabled={disabled} onPress={onClick}><Icon aria-hidden width={19} height={19} /></Button><Tooltip className="app-tooltip" placement="bottom">{label}</Tooltip></TooltipTrigger>
}

export function Avatar({ label, initials, color = '#d7b36a', size = 'small', src }: { label: string; initials: string; color?: string; size?: 'small' | 'medium' | 'large'; src?: string | null }): React.JSX.Element {
  return <span className={`avatar avatar--${size}`} style={{ '--avatar-color': color } as React.CSSProperties} aria-label={label}>{src ? <img src={src} alt="" /> : initials}</span>
}

export function StatusLight({ state, label, breathing = false }: { state: 'active' | 'waiting' | 'success' | 'danger' | 'muted'; label: string; breathing?: boolean }): React.JSX.Element {
  return <span className="status-light"><span className={`status-light__dot status-light__dot--${state}${breathing ? ' is-breathing' : ''}`} />{label}</span>
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }): React.JSX.Element {
  return <div className="section-header"><h2>{title}</h2>{action}</div>
}

export function SearchBox({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  return <TextField aria-label={label} value={value} onChange={onChange} className="search-box"><Search aria-hidden width={17} height={17} /><Input placeholder={placeholder} /></TextField>
}

export function ListRow({ title, subtitle, meta, selected = false, avatar, marker, onClick }: { title: string; subtitle: string; meta?: string; selected?: boolean; avatar?: ReactNode; marker?: ReactNode; onClick: () => void }): React.JSX.Element {
  return <Button className={`list-row${selected ? ' is-selected' : ''}`} onPress={onClick}>{avatar}<span className="list-row__body"><span className="list-row__title">{title}</span><span className="list-row__subtitle">{subtitle}</span></span><span className="list-row__meta">{meta}{marker}</span></Button>
}

export function Toolbar({ title, support, trailing }: { title: string; support?: ReactNode; trailing?: ReactNode }): React.JSX.Element {
  return <header className="toolbar" aria-label="窗口拖拽区"><div className="window-controls-safe-area" aria-hidden="true" /><div className="toolbar__workspace"><div className="toolbar__content"><div className="toolbar__identity"><h1>{title}</h1>{support}</div>{trailing && <div className="toolbar__trailing">{trailing}</div>}</div></div></header>
}

export function Rail<TId extends string>({ active, items, footerItems, userProfile, onProfile, onNavigate }: { active: TId; items: Array<RailItem<TId>>; footerItems: Array<RailItem<TId>>; userProfile?: { name: string; avatarUrl?: string | null }; onProfile?: () => void; onNavigate: (id: TId) => void }): React.JSX.Element {
  const render = (item: RailItem<TId>): React.JSX.Element => { const Icon = item.icon; return <TooltipTrigger key={item.id} delay={350}><Button aria-label={item.label} aria-current={active === item.id ? 'page' : undefined} className={`rail-button${active === item.id ? ' is-active' : ''}`} onPress={() => onNavigate(item.id)}><Icon aria-hidden width={22} height={22} />{item.marker && <span className="rail-button__marker">{item.marker}</span>}</Button><Tooltip className="app-tooltip" placement="right">{item.label}</Tooltip></TooltipTrigger> }
  return <nav className="rail" aria-label="一级导航"><div className="rail__main">{items.map(render)}</div><div className="rail__footer">{userProfile && onProfile && <TooltipTrigger delay={350}><Button className="rail-profile-button" aria-label={`${userProfile.name} 个人信息`} onPress={onProfile}><Avatar label={userProfile.name} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="small" src={userProfile.avatarUrl} /></Button><Tooltip className="app-tooltip" placement="right">个人信息</Tooltip></TooltipTrigger>}{footerItems.map(render)}</div></nav>
}

export function ContextPane({ children, footer }: { children: ReactNode; footer?: ReactNode }): React.JSX.Element {
  return <aside className="context-pane">{children}{footer}</aside>
}

export function Workspace({ children }: { children: ReactNode }): React.JSX.Element {
  return <section className="workspace"><div className="workspace-center">{children}</div></section>
}

export function AppShell({ toolbar, rail, context, children }: { toolbar: ReactNode; rail: ReactNode; context: ReactNode; children: ReactNode }): React.JSX.Element {
  return <main className="prototype">{toolbar}{rail}{context}<Workspace>{children}</Workspace></main>
}

export function DetailPage({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <div className={`workspace-page detail-page${className ? ` ${className}` : ''}`}><div className="detail-canvas">{children}</div></div>
}

export function SettingsBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  return <section className="settings-block"><div className="settings-block__heading"><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="settings-block__content">{children}</div></section>
}

export function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }): React.JSX.Element {
  return <div className="setting-row"><span><strong>{title}</strong><small>{description}</small></span>{children}</div>
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
