import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatBubble, Group, Settings } from './cds-icons'
import { DesktopShell } from './DesktopShell'

type NavigationId = 'messages' | 'team' | 'system'
type ShellProps = ComponentProps<typeof DesktopShell<NavigationId>>

function mockViewport(initialWidth: number): { resize: (width: number) => void } {
  let width = initialWidth
  const queries = new Map<string, { matches: () => boolean; listeners: Set<(event: MediaQueryListEvent) => void> }>()
  vi.stubGlobal('matchMedia', vi.fn((media: string) => {
    let query = queries.get(media)
    if (!query) {
      const maximum = media.match(/max-width:\s*(\d+)px/)?.[1]
      query = { matches: () => maximum !== undefined && width <= Number(maximum), listeners: new Set() }
      queries.set(media, query)
    }
    const state = query
    return {
      media,
      get matches() { return state.matches() },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { state.listeners.add(listener) },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { state.listeners.delete(listener) }
    }
  }))
  return {
    resize(nextWidth) {
      const previous = new Map([...queries].map(([media, query]) => [media, query.matches()]))
      width = nextWidth
      act(() => {
        for (const [media, query] of queries) {
          const matches = query.matches()
          if (previous.get(media) === matches) continue
          const event = Object.assign(new Event('change'), { matches, media })
          query.listeners.forEach((listener) => listener(event))
        }
      })
    }
  }
}

function shellProps(overrides: Partial<ShellProps> = {}): ShellProps {
  return {
    active: 'messages',
    items: [{ id: 'messages', label: '消息', icon: ChatBubble }, { id: 'team', label: '通讯录', icon: Group, disabled: true }],
    footerItems: [{ id: 'system', label: '设置', icon: Settings }],
    title: '悟空',
    context: <p>会话上下文</p>,
    collapsed: false,
    user: { name: '本地用户' },
    onToggleSidebar: vi.fn(),
    onNewConversation: vi.fn(),
    onProfile: vi.fn(),
    onNavigate: vi.fn(),
    children: <p>当前工作内容</p>,
    ...overrides
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('DesktopShell responsive navigation', () => {
  it('delegates manual collapse to its controlled owner at the 900px wide boundary', () => {
    mockViewport(900)
    const props = shellProps()
    const { rerender } = render(<DesktopShell {...props} />)
    const context = screen.getByText('会话上下文')
    expect(context).toBeVisible()
    expect(screen.getByRole('button', { name: '折叠左侧栏' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: '折叠左侧栏' }))
    expect(props.onToggleSidebar).toHaveBeenCalledOnce()
    expect(context).toBeVisible()

    rerender(<DesktopShell {...props} collapsed />)
    expect(context).not.toBeVisible()
    expect(screen.getByRole('button', { name: '消息' })).toHaveAttribute('title', '消息')
    expect(screen.getByRole('button', { name: '展开左侧栏' })).toHaveAttribute('aria-controls', 'desktop-context')
    fireEvent.click(screen.getByRole('button', { name: '展开左侧栏' }))
    expect(props.onToggleSidebar).toHaveBeenCalledTimes(2)

    rerender(<DesktopShell {...props} collapsed={false} />)
    expect(context).toBeVisible()
    expect(screen.queryByRole('button', { name: '关闭左侧栏' })).not.toBeInTheDocument()
  })

  it.each([false, true])('defaults to icon navigation below 900px when controlled collapsed is %s', (collapsed) => {
    mockViewport(899)
    render(<DesktopShell {...shellProps({ collapsed })} />)

    expect(screen.getByRole('main')).toHaveClass('is-compact', 'is-sidebar-collapsed')
    expect(screen.getByText('会话上下文')).not.toBeVisible()
    expect(screen.getByRole('button', { name: '展开左侧栏' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '消息' })).toHaveAttribute('title', '消息')
    expect(screen.getByRole('navigation', { name: '一级导航' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '工作区' })).toHaveTextContent('当前工作内容')
  })

  it.each(['backdrop', 'Escape'])('opens a compact drawer and dismisses it with %s', (close) => {
    mockViewport(899)
    const props = shellProps()
    render(<DesktopShell {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '展开左侧栏' }))
    expect(screen.getByText('会话上下文')).toBeVisible()
    expect(screen.getByRole('button', { name: '折叠左侧栏' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '关闭左侧栏' })).toBeInTheDocument()

    if (close === 'backdrop') fireEvent.click(screen.getByRole('button', { name: '关闭左侧栏' }))
    else fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByText('会话上下文')).not.toBeVisible()
    expect(screen.getByRole('button', { name: '展开左侧栏' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '关闭左侧栏' })).not.toBeInTheDocument()
    expect(props.onToggleSidebar).not.toHaveBeenCalled()
  })

  it.each([false, true])('restores the latest controlled wide state after crossing breakpoints from collapsed=%s', (collapsed) => {
    const viewport = mockViewport(1200)
    const props = shellProps({ collapsed })
    const { rerender } = render(<DesktopShell {...props} />)

    viewport.resize(899)
    expect(screen.getByText('会话上下文')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '展开左侧栏' }))
    expect(screen.getByText('会话上下文')).toBeVisible()

    const latestCollapsed = !collapsed
    rerender(<DesktopShell {...props} collapsed={latestCollapsed} />)
    expect(screen.getByText('会话上下文')).toBeVisible()
    viewport.resize(900)

    expect(screen.getByRole('main')).not.toHaveClass('is-compact')
    expect(screen.queryByRole('button', { name: '关闭左侧栏' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: latestCollapsed ? '展开左侧栏' : '折叠左侧栏' })).toHaveAttribute('aria-expanded', String(!latestCollapsed))
    if (latestCollapsed) expect(screen.getByText('会话上下文')).not.toBeVisible()
    else expect(screen.getByText('会话上下文')).toBeVisible()

    viewport.resize(899)
    expect(screen.getByText('会话上下文')).not.toBeVisible()
    expect(screen.queryByRole('button', { name: '关闭左侧栏' })).not.toBeInTheDocument()
    expect(props.onToggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps navigation and disabled creation accessible when the sidebar is collapsed', () => {
    mockViewport(899)
    const props = shellProps({ creatingConversation: true, creationError: '创建失败，请重试' })
    const { rerender } = render(<DesktopShell {...props} />)
    const navigation = screen.getByRole('navigation', { name: '一级导航' })
    const messages = within(navigation).getByRole('button', { name: '消息' })
    expect(messages).toHaveAttribute('aria-current', 'page')
    fireEvent.click(messages)
    expect(props.onNavigate).toHaveBeenCalledWith('messages')

    const disabledNavigation = within(navigation).getByRole('button', { name: '通讯录' })
    expect(disabledNavigation).toBeDisabled()
    expect(disabledNavigation).not.toHaveAttribute('aria-current')
    fireEvent.click(disabledNavigation)
    expect(props.onNavigate).toHaveBeenCalledOnce()
    fireEvent.click(within(navigation).getByRole('button', { name: '设置' }))
    expect(props.onNavigate).toHaveBeenLastCalledWith('system')
    fireEvent.click(within(navigation).getByRole('button', { name: '本地用户 个人信息' }))
    expect(props.onProfile).toHaveBeenCalledOnce()

    const create = within(navigation).getByRole('button', { name: '新建会话' })
    expect(create).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('创建失败，请重试')
    fireEvent.click(create)
    expect(props.onNewConversation).not.toHaveBeenCalled()

    rerender(<DesktopShell {...props} creatingConversation={false} />)
    fireEvent.click(screen.getByRole('button', { name: '展开左侧栏' }))
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    expect(props.onNewConversation).toHaveBeenCalledOnce()
    expect(screen.getByText('会话上下文')).not.toBeVisible()
    expect(screen.queryByRole('button', { name: '关闭左侧栏' })).not.toBeInTheDocument()
  })
})
