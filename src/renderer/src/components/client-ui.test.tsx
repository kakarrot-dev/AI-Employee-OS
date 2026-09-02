import { fireEvent, render, screen } from '@testing-library/react'
import { ChatBubble } from 'iconoir-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell, ClientModal, ContextPane, ListRow, Rail, Toolbar } from './client-ui'

describe('client UI contracts', () => {
  it('keeps the toolbar, primary rail, context pane and workspace as stable landmarks', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <AppShell
        toolbar={<Toolbar title="会话" />}
        rail={<Rail active="messages" items={[{ id: 'messages', label: '消息', icon: ChatBubble }]} footerItems={[]} onNavigate={onNavigate} />}
        context={<ContextPane><p>上下文</p></ContextPane>}
      >
        <p>工作区</p>
      </AppShell>
    )

    expect(screen.getByRole('banner', { name: '窗口拖拽区' })).toBeInTheDocument()
    expect(container.querySelector('.window-controls-safe-area')).toBeInTheDocument()
    expect(container.querySelector('.traffic-lights')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '一级导航' })).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toHaveTextContent('上下文')
    expect(screen.getByText('工作区').closest('.workspace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '消息' }))
    expect(onNavigate).toHaveBeenCalledWith('messages')
    expect(screen.getByRole('button', { name: '消息' })).toHaveAttribute('aria-current', 'page')
  })

  it('represents selection through the shared list-row contract', () => {
    render(<ListRow title="总管" subtitle="在线" selected onClick={() => undefined} />)
    expect(screen.getByRole('button', { name: /总管在线/ })).toHaveClass('list-row', 'is-selected')
  })

  it('reuses the modal animation, keyboard dismissal and focus-return contract', () => {
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(false)
      return <><button type="button" onClick={() => setOpen(true)}>打开设置</button><ClientModal open={open} title="设置" onClose={() => setOpen(false)}><button type="button">弹层动作</button></ClientModal></>
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开设置' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: '设置' })
    expect(dialog).toHaveAttribute('data-entering')
    expect(dialog.closest('.modal-overlay')).toHaveAttribute('data-entering')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('dismisses only the topmost nested modal with Escape', () => {
    function Harness(): React.JSX.Element {
      const [parentOpen, setParentOpen] = useState(true)
      const [childOpen, setChildOpen] = useState(true)
      return <ClientModal open={parentOpen} title="员工设置" onClose={() => setParentOpen(false)}><button type="button" onClick={() => setChildOpen(true)}>删除员工</button><ClientModal open={childOpen} title="确认删除" nested size="small" onClose={() => setChildOpen(false)}><button type="button">确认</button></ClientModal></ClientModal>
    }
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: '员工设置' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '确认删除' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByRole('dialog', { name: '员工设置' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '确认删除' })).not.toBeInTheDocument()
  })
})
