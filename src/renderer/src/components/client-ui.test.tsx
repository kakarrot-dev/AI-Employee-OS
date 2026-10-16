import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ChatBubble, Check, ShieldCheck } from 'iconoir-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { describe, expect, it, vi } from 'vitest'
import { CLIENT_ICON_CONTRACT, ClientIconSystem } from './client-icon-system'
import { AppShell, Avatar, CdsButton, CdsSegmentedControl, ClientModal, ContextPane, DetailListMark, DetailNote, DetailPage, DetailSectionHeader, DetailState, DetailSummaryPanel, IconButton, ListRow, ProfileFacts, ProfileSummary, ProfileValueTags, Rail, SearchBox, SelectionCatalog, SelectionOption, SettingRow, SettingsBlock, SummaryCard, SummaryCardGrid, SummaryList, SummaryListItem, Toolbar } from './client-ui'
import { CdsDialog } from '../open-claude-ui/primitives/ConfirmationDialog'
import { AttachmentOpenMenu } from './message-ui'

describe('client UI contracts', () => {
  it('clears a search and returns keyboard focus to its input', () => {
    function SearchExample(): React.JSX.Element {
      const [value, setValue] = useState('没有匹配的关键词')
      return <SearchBox label="搜索专家" placeholder="搜索专家" value={value} onChange={setValue} />
    }
    render(<SearchExample />)
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    const input = screen.getByRole('textbox', { name: '搜索专家' })
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('button', { name: '清除搜索' })).not.toBeInTheDocument()
  })

  it('keeps the direct profile entry available when no user menu is configured', () => {
    const onProfile = vi.fn()
    render(<Rail active="messages" items={[]} footerItems={[]} userProfile={{ name: '用户' }} onProfile={onProfile} onNavigate={() => undefined} />)
    const profile = screen.getByRole('button', { name: '用户 个人信息' })
    expect(profile).not.toHaveAttribute('aria-haspopup')
    fireEvent.click(profile)
    expect(onProfile).toHaveBeenCalledOnce()
  })

  it('applies the shared minimal icon family and stroke contract', () => {
    const { container } = render(<ClientIconSystem><Check aria-label="完成" /></ClientIconSystem>)
    expect(CLIENT_ICON_CONTRACT).toEqual({ library: 'iconoir-react', strokeWidth: 1.5 })
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.5')
  })

  it('keeps the toolbar, primary rail, context pane and workspace as stable landmarks', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <AppShell
        toolbar={<Toolbar title="会话" navigation={<button type="button">折叠左侧栏</button>} trailing={<button type="button">折叠右侧栏</button>} />}
        rail={<Rail active="messages" items={[{ id: 'messages', label: '消息', icon: ChatBubble }]} footerItems={[]} onNavigate={onNavigate} />}
        context={<ContextPane><p>上下文</p></ContextPane>}
      >
        <p>工作区</p>
      </AppShell>
    )

    const toolbar = screen.getByRole('banner', { name: '窗口拖拽区' })
    expect(toolbar).toHaveAttribute('data-layout-contract', 'application-toolbar')
    expect(toolbar.querySelector('[data-toolbar-zone="navigation"]')).toBeInTheDocument()
    expect(toolbar.querySelector('[data-toolbar-zone="workspace"]')).toBeInTheDocument()
    expect(toolbar.querySelector('[data-toolbar-zone="identity"]')).toBeInTheDocument()
    expect(toolbar.querySelector('[data-toolbar-zone="actions"]')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /总管在线/ })).toHaveAttribute('data-cds', 'Button')
    expect(screen.getByRole('button', { name: /总管在线/ })).toHaveAttribute('data-cds-primitive', 'ListRow')
  })

  it('makes avatar visibility an explicit shared list-row contract', () => {
    const { rerender } = render(<ListRow title="会话" subtitle="最近消息" identity="text" avatar={<Avatar label="不应显示" initials="会" />} onClick={() => undefined} />)
    expect(screen.getByRole('button', { name: /会话最近消息/ })).toHaveClass('list-row--text')
    expect(screen.queryByLabelText('不应显示')).not.toBeInTheDocument()

    rerender(<ListRow title="员工" subtitle="职责" identity="person" avatar={<Avatar label="文档编写员" initials="文" />} onClick={() => undefined} />)
    expect(screen.getByRole('button', { name: /员工职责/ })).toHaveClass('list-row--person')
    expect(screen.getByLabelText('文档编写员').closest('.list-row__avatar')).toBeInTheDocument()
  })

  it('reuses the profile summary and fact contracts for identity details', () => {
    render(<><ProfileSummary identity={{ name: '文档编写员', initials: '文', color: '#c5b8e3' }} title="结构化文档撰写" description="负责整理可追溯文档。" /><ProfileFacts items={[{ label: '工作状态', value: '可工作' }, { label: '运行模型', value: 'deepseek-v4-pro' }]} /></>)
    expect(screen.getByRole('heading', { name: '结构化文档撰写', level: 2 }).closest('.profile-summary')).toBeInTheDocument()
    expect(screen.getByText('工作状态').closest('.profile-facts')).toBeInTheDocument()
  })

  it('shows profile values without visible keys while keeping the field context accessible', () => {
    render(<ProfileValueTags items={[{ label: '工作状态', accessibleValue: '可工作', value: '可工作' }, { label: '运行模型', accessibleValue: 'deepseek-v4-pro', value: 'deepseek-v4-pro' }]} />)
    const facts = screen.getByRole('list', { name: '基本资料' })
    expect(facts).toHaveTextContent('可工作')
    expect(facts).toHaveTextContent('deepseek-v4-pro')
    expect(facts).not.toHaveTextContent('工作状态')
    expect(screen.getByLabelText('工作状态：可工作')).toBeInTheDocument()
  })

  it('renders summary cards as static information without button affordances', () => {
    render(<SummaryCardGrid emptyMessage="尚未绑定能力"><SummaryCard leading={<Check />} title="本机文档编写" description="依赖正常，可用于正式任务" trailing="已招募" tone="muted" /></SummaryCardGrid>)
    expect(screen.getByRole('article')).toHaveTextContent('本机文档编写')
    expect(screen.getByRole('article')).toHaveClass('summary-card--muted')
    expect(screen.getByText('已招募')).toHaveClass('summary-card__trailing')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('exposes wide detail pages and labelled card collections through shared contracts', () => {
    const { container } = render(<DetailPage width="wide"><SummaryCardGrid label="候选员工" emptyMessage="暂无员工"><div role="listitem"><SummaryCard title="产品经理" /></div></SummaryCardGrid></DetailPage>)
    expect(container.querySelector('.detail-page')).toHaveClass('detail-page--wide')
    expect(screen.getByRole('list', { name: '候选员工' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('产品经理')
  })

  it('reuses one searchable selection contract for single and multiple choices', () => {
    const onQueryChange = vi.fn()
    const onSelect = vi.fn()
    render(<SelectionCatalog searchLabel="搜索能力" placeholder="搜索名称或说明" query="" resultLabel="2 项" emptyMessage="没有匹配项" onQueryChange={onQueryChange}>
      <SelectionOption leading={<Check />} title="多源网络调研" description="收集并核验公开资料。" meta="v2 · 2 个 Tool" status="依赖可用" selected onSelect={onSelect} />
      <SelectionOption leading={<ShieldCheck />} title="视觉方案" description="生成视觉方向与资产。" meta="v1 · 1 个 Tool" status="依赖未就绪" selected={false} disabled onSelect={() => undefined} />
    </SelectionCatalog>)

    fireEvent.change(screen.getByRole('textbox', { name: '搜索能力' }), { target: { value: '调研' } })
    expect(onQueryChange).toHaveBeenCalledWith('调研')
    const selected = screen.getByRole('button', { name: /多源网络调研/ })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(selected)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /视觉方案/ })).toBeDisabled()
  })

  it('reuses one summary-list contract for rows and contained empty states', () => {
    const onClick = vi.fn()
    const { rerender } = render(<SummaryList emptyMessage="暂无记录"><SummaryListItem title="市场报告" subtitle="2 个交付物" trailing="已交付" onClick={onClick} /></SummaryList>)
    fireEvent.click(screen.getByRole('button', { name: /市场报告2 个交付物已交付/ }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByText('市场报告').closest('.summary-list')).toBeInTheDocument()

    rerender(<SummaryList emptyMessage="暂无记录">{[]}</SummaryList>)
    expect(screen.getByText('暂无记录')).toHaveClass('summary-list__empty')
    expect(screen.getByText('暂无记录').parentElement).toHaveClass('summary-list')
  })

  it('composes detail summaries, sections and outlined rows from shared contracts', () => {
    const { container } = render(<>
      <DetailSummaryPanel icon={<ShieldCheck />} title="所有完成要求均已通过" description="交付文件和来源证据已保存。" tone="success" metrics={[{ label: '完成要求', value: '2/2' }, { label: '来源证据', value: 20 }]} />
      <DetailSectionHeader title="交付文件与证据" description="可在下方查看" meta="2 个文件" />
      <SummaryList emptyMessage="暂无文件" variant="outlined"><SummaryListItem leading={<DetailListMark tone="success"><Check /></DetailListMark>} title="新闻整理.md" trailing={<DetailState tone="success">已保存</DetailState>} /></SummaryList>
      <DetailNote icon={<ShieldCheck />} tone="success">已保存 20 条来源证据</DetailNote>
    </>)

    expect(screen.getByText('所有完成要求均已通过').closest('.detail-summary-panel')).toHaveClass('detail-summary-panel--success')
    expect(screen.getByText('交付文件与证据').closest('.detail-section-header')).toBeInTheDocument()
    expect(screen.getByText('新闻整理.md').closest('.summary-list')).toHaveClass('summary-list--outlined')
    expect(screen.getByText('已保存 20 条来源证据').closest('.detail-note')).toHaveClass('detail-note--success')
    expect(container.querySelector('.detail-list-mark--success')).toBeInTheDocument()
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

  it('uses the upstream button for icon actions without implicitly submitting a surrounding form', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const onAction = vi.fn()
    render(<form onSubmit={onSubmit}><IconButton label="重新读取" icon={Check} onClick={onAction} /></form>)
    const action = screen.getByRole('button', { name: '重新读取' })
    expect(action).toHaveAttribute('data-cds', 'Button')
    expect(action).toHaveAttribute('data-cds-size', 'icon')
    expect(action).toHaveAttribute('title', '重新读取')
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks a loading upstream button instead of firing its business callback twice', () => {
    const onClick = vi.fn()
    const { rerender } = render(<CdsButton type="button" variant="primary" size="sm" isLoading onClick={onClick}>发布员工</CdsButton>)
    const button = screen.getByRole('button', { name: '发布员工' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    rerender(<CdsButton type="button" variant="primary" size="sm" onClick={onClick}>发布员工</CdsButton>)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('moves segmented focus and selection with arrows, Home and End while skipping disabled options', () => {
    const onChange = vi.fn()
    render(<CdsSegmentedControl label="员工视图" defaultValue="all" onChange={onChange} tabs={[
      { id: 'all', label: '全部', tabId: 'employees-all', controls: 'employees-panel' },
      { id: 'unavailable', label: '不可选', disabled: true },
      { id: 'active', label: '已启用' }
    ]} />)
    const first = screen.getByRole('tab', { name: '全部' })
    const last = screen.getByRole('tab', { name: '已启用' })
    expect(first).toHaveAttribute('id', 'employees-all')
    expect(first).toHaveAttribute('aria-controls', 'employees-panel')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('tabindex', '-1')
    expect(onChange).toHaveBeenLastCalledWith('active', 2)
    fireEvent.keyDown(last, { key: 'ArrowRight' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'End' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Home' })
    expect(first).toHaveFocus()
  })

  it('leaves controlled segmented selection to its caller and isolates the generated ids of separate controls', () => {
    const onChange = vi.fn()
    const tabs = [{ id: 'first', label: '第一项' }, { id: 'second', label: '第二项' }]
    const { rerender } = render(<><CdsSegmentedControl label="首组" tabs={tabs} value="first" onChange={onChange} /><CdsSegmentedControl label="第二组" tabs={tabs} /></>)
    const firstControl = screen.getByRole('tablist', { name: '首组' })
    const secondControl = screen.getByRole('tablist', { name: '第二组' })
    fireEvent.click(within(firstControl).getByRole('tab', { name: '第二项' }))
    expect(onChange).toHaveBeenCalledWith('second', 1)
    expect(within(firstControl).getByRole('tab', { name: '第一项' })).toHaveAttribute('aria-selected', 'true')
    expect(within(firstControl).getByRole('tab', { name: '第一项' }).id).not.toBe(within(secondControl).getByRole('tab', { name: '第一项' }).id)
    rerender(<><CdsSegmentedControl label="首组" tabs={tabs} value="second" onChange={onChange} /><CdsSegmentedControl label="第二组" tabs={tabs} /></>)
    expect(within(firstControl).getByRole('tab', { name: '第二项' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps modal focus inside the surface, wraps both directions and restores its opener after backdrop dismissal', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return <><button type="button" onClick={() => setOpen(true)}>打开详情</button><ClientModal open={open} title="详情" size="medium" onClose={() => setOpen(false)}><button type="button" disabled>不可用</button><div hidden><button type="button">隐藏操作</button></div><button type="button">末尾操作</button></ClientModal></>
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开详情' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: '详情' })
    const first = within(dialog).getByRole('button', { name: '关闭' })
    const last = within(dialog).getByRole('button', { name: '末尾操作' })
    await waitFor(() => expect(first).toHaveFocus())
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
    opener.focus()
    expect(first).toHaveFocus()
    fireEvent.mouseDown(last)
    expect(dialog).toBeInTheDocument()
    fireEvent.mouseDown(dialog.closest('.modal-overlay')!)
    expect(screen.queryByRole('dialog', { name: '详情' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('returns focus through each nested modal instead of sending it behind an open parent', async () => {
    function Harness() {
      const [parentOpen, setParentOpen] = useState(false)
      const [childOpen, setChildOpen] = useState(false)
      return <><button type="button" onClick={() => setParentOpen(true)}>打开员工</button><ClientModal open={parentOpen} title="员工" onClose={() => setParentOpen(false)}><button type="button" onClick={() => setChildOpen(true)}>删除员工</button><ClientModal open={childOpen} title="确认删除员工" nested onClose={() => setChildOpen(false)}><button type="button">确认删除</button></ClientModal></ClientModal></>
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开员工' })
    opener.focus()
    fireEvent.click(opener)
    const trigger = screen.getByRole('button', { name: '删除员工' })
    trigger.focus()
    fireEvent.click(trigger)
    const child = screen.getByRole('dialog', { name: '确认删除员工' })
    await waitFor(() => expect(within(child).getByRole('button', { name: '关闭' })).toHaveFocus())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '员工' })).toBeInTheDocument()
    expect(trigger).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(opener).toHaveFocus()
  })

  it('keeps a dialog focusable even when its content has no controls', () => {
    render(<CdsDialog open title="只读信息" onClose={() => undefined}><p>没有交互项</p></CdsDialog>)
    const dialog = screen.getByRole('dialog', { name: '只读信息' })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(dialog).toHaveFocus()
  })

  it('preserves a user-selected control while the dialog initial-focus frame is pending', () => {
    const frames: FrameRequestCallback[] = []
    const schedule = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length })
    try {
      render(<CdsDialog open title="快速操作" onClose={() => undefined}><button type="button">默认操作</button><button type="button">用户已选操作</button></CdsDialog>)
      const selected = screen.getByRole('button', { name: '用户已选操作' })
      selected.focus()
      act(() => frames[0](0))
      expect(selected).toHaveFocus()
    } finally { schedule.mockRestore() }
  })

  it('keeps attachment menu keyboard focus in its dialog and dismisses the menu before the dialog', async () => {
    const onClose = vi.fn()
    const onReveal = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(false)
      return <><button type="button" onClick={() => setOpen(true)}>打开交付详情</button>{createPortal(<button type="button" data-react-aria-top-layer>无关弹层操作</button>, document.body)}<ClientModal open={open} title="交付详情" onClose={() => { onClose(); setOpen(false) }}><AttachmentOpenMenu attachment={{ id: 'report', name: 'report.md', detail: 'Markdown' }} onOpen={() => undefined} onReveal={onReveal} /></ClientModal></>
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开交付详情' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: '交付详情' })
    const close = within(dialog).getByRole('button', { name: '关闭' })
    await waitFor(() => expect(close).toHaveFocus())
    const trigger = within(dialog).getByRole('button', { name: '打开方式 report.md' })
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = await screen.findByRole('menuitem', { name: /使用系统默认应用打开/ })
    await waitFor(() => expect(first).toHaveFocus())
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    const reveal = screen.getByRole('menuitem', { name: /打开所在文件夹/ })
    expect(reveal).toHaveFocus()
    fireEvent.keyDown(reveal, { key: 'Enter' })
    fireEvent.keyUp(reveal, { key: 'Enter' })
    expect(onReveal).toHaveBeenCalledExactlyOnceWith('report')
    await waitFor(() => expect(trigger).toHaveFocus())

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const item = await screen.findByRole('menuitem', { name: /使用系统默认应用打开/ })
    await waitFor(() => expect(item).toHaveFocus())
    fireEvent.keyDown(item, { key: 'Tab' })
    expect(document.activeElement?.closest('[data-cds="DialogPortal"]')).not.toBeNull()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement?.closest('[data-cds="DialogPortal"]')).not.toBeNull()
    fireEvent.keyDown(item, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(dialog).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
    screen.getByRole('button', { name: '无关弹层操作' }).focus()
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(opener).toHaveFocus()
  })

  it('restores focus through an attachment menu, its nested dialog and the outer dialog in Escape order', async () => {
    function Harness() {
      const [parentOpen, setParentOpen] = useState(false)
      const [childOpen, setChildOpen] = useState(false)
      return <><button type="button" onClick={() => setParentOpen(true)}>打开事项</button><ClientModal open={parentOpen} title="事项" onClose={() => setParentOpen(false)}><button type="button" onClick={() => setChildOpen(true)}>查看交付</button><ClientModal open={childOpen} title="交付文件" nested onClose={() => setChildOpen(false)}><AttachmentOpenMenu attachment={{ id: 'report', name: 'report.md', detail: 'Markdown' }} onOpen={() => undefined} /></ClientModal></ClientModal></>
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开事项' })
    opener.focus()
    fireEvent.click(opener)
    const parent = screen.getByRole('dialog', { name: '事项' })
    await waitFor(() => expect(within(parent).getByRole('button', { name: '关闭' })).toHaveFocus())
    const childTrigger = within(parent).getByRole('button', { name: '查看交付' })
    childTrigger.focus()
    fireEvent.click(childTrigger)
    const child = screen.getByRole('dialog', { name: '交付文件' })
    await waitFor(() => expect(within(child).getByRole('button', { name: '关闭' })).toHaveFocus())
    const menuTrigger = within(child).getByRole('button', { name: '打开方式 report.md' })
    act(() => menuTrigger.focus())
    fireEvent.keyDown(menuTrigger, { key: 'ArrowDown' })
    const item = await screen.findByRole('menuitem', { name: /使用系统默认应用打开/ })
    await waitFor(() => expect(item).toHaveFocus())
    fireEvent.keyDown(item, { key: 'Escape' })
    await waitFor(() => expect(menuTrigger).toHaveFocus())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(child).toBeInTheDocument()
    expect(parent).toBeInTheDocument()
    fireEvent.keyDown(menuTrigger, { key: 'Escape' })
    expect(child).not.toBeInTheDocument()
    expect(childTrigger).toHaveFocus()
    fireEvent.keyDown(childTrigger, { key: 'Escape' })
    expect(parent).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('preserves setting control labels and callbacks inside the new CDS section', () => {
    function Harness() {
      const [enabled, setEnabled] = useState(false)
      return <SettingsBlock title="启动偏好" description="控制本机启动行为"><SettingRow title="恢复会话" description="打开上次会话"><input type="checkbox" aria-label="恢复上次会话" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></SettingRow></SettingsBlock>
    }
    render(<Harness />)
    const section = screen.getByRole('region', { name: '启动偏好' })
    expect(section).toHaveAttribute('data-cds', 'SettingsSection')
    fireEvent.click(within(section).getByRole('checkbox', { name: '恢复上次会话' }))
    expect(screen.getByRole('checkbox', { name: '恢复上次会话' })).toBeChecked()
  })
})
