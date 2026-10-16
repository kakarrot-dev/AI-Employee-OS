import { useEffect, useState, type ReactNode } from 'react'
import { EditPencil, NavArrowLeft, NavArrowRight } from './cds-icons'
import { CdsButton } from '../open-claude-ui/primitives/CdsButton'
import { Avatar, type RailItem } from './client-ui'

interface DesktopShellProps<TId extends string> {
  active: TId
  items: Array<RailItem<TId>>
  footerItems: Array<RailItem<TId>>
  title: string
  support?: ReactNode
  actions?: ReactNode
  context: ReactNode
  collapsed: boolean
  user: { name: string; avatarUrl?: string | null }
  creatingConversation?: boolean
  creationError?: string
  onToggleSidebar: () => void
  onNewConversation: () => void
  onProfile: () => void
  onNavigate: (id: TId) => void
  children: ReactNode
}

/** CDS desktop composition; all data and commands remain owned by the caller. */
export function DesktopShell<TId extends string>({ active, items, footerItems, title, support, actions, context, collapsed, user, creatingConversation = false, creationError, onToggleSidebar, onNewConversation, onProfile, onNavigate, children }: DesktopShellProps<TId>): React.JSX.Element {
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 899px)').matches ?? false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sidebarCollapsed = compact ? !drawerOpen : collapsed
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 899px)')
    if (!query) return
    const resize = (): void => { setCompact(query.matches); setDrawerOpen(false) }
    query.addEventListener('change', resize)
    return () => query.removeEventListener('change', resize)
  }, [])
  useEffect(() => {
    if (!compact || !drawerOpen) return
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [compact, drawerOpen])
  const toggleSidebar = (): void => { if (compact) setDrawerOpen((open) => !open); else onToggleSidebar() }
  const ToggleIcon = sidebarCollapsed ? NavArrowRight : NavArrowLeft
  const renderItem = (item: RailItem<TId>): React.JSX.Element => {
    const Icon = item.icon
    return <CdsButton variant="ghost" size="sm" key={item.id} className="desktop-nav-item" aria-label={item.label} title={compact || sidebarCollapsed ? item.label : undefined} aria-current={active === item.id ? 'page' : undefined} disabled={item.disabled} onClick={() => onNavigate(item.id)} icon={<Icon aria-hidden />}>
      <span className="desktop-nav-item__label">{item.label}</span>
      {(item.marker || item.badge) && <span className="desktop-nav-item__badge" aria-label={item.marker ? `${item.marker} 条未读消息` : undefined}>{item.marker || item.badge}</span>}
    </CdsButton>
  }

  return <main className={`desktop-app${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}${compact ? ' is-compact' : ''}`} data-design-system="open-claude-ui">
    <header className="desktop-toolbar" aria-label="窗口拖拽区" data-layout-contract="application-toolbar">
      <div className="desktop-toolbar__navigation" data-toolbar-zone="navigation">
        <CdsButton variant="ghost" size="icon" className="desktop-sidebar-toggle" aria-label={sidebarCollapsed ? '展开左侧栏' : '折叠左侧栏'} title={sidebarCollapsed ? '展开左侧栏' : '折叠左侧栏'} aria-expanded={!sidebarCollapsed} aria-controls="desktop-context" onClick={toggleSidebar} icon={<ToggleIcon aria-hidden />} />
        <span className="desktop-brand">AI Employee OS</span>
      </div>
      <div className="desktop-toolbar__workspace" data-toolbar-zone="workspace">
        <div className="desktop-toolbar__identity" data-toolbar-zone="identity"><h1 title={title}>{title}</h1>{support}</div>
        <div className="desktop-toolbar__actions" data-toolbar-zone="actions">{actions}</div>
      </div>
    </header>

    {compact && drawerOpen && <CdsButton variant="ghost" className="desktop-sidebar-backdrop" aria-label="关闭左侧栏" onClick={() => setDrawerOpen(false)} />}
    <nav className="desktop-sidebar" aria-label="一级导航">
      <div className="desktop-sidebar__start">
        <CdsButton variant="ghost" size="md" className="desktop-new-conversation" aria-label="新建会话" title={sidebarCollapsed ? '新建会话' : undefined} disabled={creatingConversation} onClick={() => { onNewConversation(); setDrawerOpen(false) }} icon={<EditPencil aria-hidden />}><span>{creatingConversation ? '正在创建' : '新建会话'}</span></CdsButton>
        {creationError && <p className="desktop-sidebar__error" role="alert">{creationError}</p>}
      </div>
      <div className="desktop-sidebar__modules">{items.map(renderItem)}</div>
      <div className="desktop-sidebar__context" id="desktop-context" hidden={sidebarCollapsed}>{context}</div>
      <div className="desktop-sidebar__footer">
        {footerItems.map(renderItem)}
        <CdsButton variant="ghost" size="lg" className="desktop-profile" aria-label={`${user.name} 个人信息`} title={sidebarCollapsed ? user.name : undefined} onClick={onProfile} icon={<Avatar label={user.name} initials={user.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="small" src={user.avatarUrl} />}><span className="desktop-profile__copy"><strong>{user.name}</strong><small>个人信息</small></span>
        </CdsButton>
      </div>
    </nav>

    <section className="desktop-workspace workspace" aria-label="工作区"><div className="workspace-center">{children}</div></section>
  </main>
}
