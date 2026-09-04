import { fireEvent, render, screen } from '@testing-library/react'
import { ChatBubble, Check, ShieldCheck } from 'iconoir-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CLIENT_ICON_CONTRACT, ClientIconSystem } from './client-icon-system'
import { AppShell, Avatar, ClientModal, ContextPane, DetailListMark, DetailNote, DetailPage, DetailSectionHeader, DetailState, DetailSummaryPanel, ListRow, ProfileFacts, ProfileSummary, ProfileValueTags, Rail, SelectionCatalog, SelectionOption, SummaryCard, SummaryCardGrid, SummaryList, SummaryListItem, Toolbar } from './client-ui'

describe('client UI contracts', () => {
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
    expect(screen.getByText('已保存 20 条来源证据')).toHaveClass('detail-note--success')
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
})
