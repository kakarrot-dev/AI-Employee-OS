import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatContentBlock, ChatMessage, MarkdownMessage, MatterRouteNote, MessageAttachmentGroup, TimelineSummary } from './message-ui'

describe('message UI contracts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps route changes real and dismisses the menu after an action', () => {
    const onOpenMatter = vi.fn()
    const onCreateMatter = vi.fn()
    const onRequestChange = vi.fn()
    render(<MatterRouteNote title="市场研究" mode="linked" onOpenMatter={onOpenMatter} onCreateMatter={onCreateMatter} onRequestChange={onRequestChange} />)
    expect(screen.getByText('已归入已有事项')).toBeInTheDocument()
    expect(screen.queryByText('市场研究')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    const options = screen.getByRole('group', { name: '更改消息归类' })
    fireEvent.click(screen.getByRole('button', { name: '将最新消息作为变更请求' }))
    expect(onRequestChange).toHaveBeenCalledOnce()
    expect(options).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    fireEvent.click(screen.getByRole('button', { name: '创建新事项草稿' }))
    expect(onCreateMatter).toHaveBeenCalledOnce()
  })

  it('does not offer a duplicate matter for a message that already created its own matter', () => {
    render(<MatterRouteNote title="客户材料分析" mode="created" onOpenMatter={vi.fn()} onCreateMatter={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    expect(screen.queryByRole('button', { name: '创建新事项草稿' })).not.toBeInTheDocument()
  })

  it('reuses one accessible attachment menu for open and reveal interactions', () => {
    const onOpen = vi.fn()
    const onReveal = vi.fn()
    const { rerender } = render(<MessageAttachmentGroup source="agent" attachments={[{ id: 'report', name: 'report.md', detail: 'Markdown · SHA-256 已记录' }]} onOpen={onOpen} onReveal={onReveal} />)
    fireEvent.click(screen.getByRole('button', { name: '打开方式 report.md' }))
    expect(screen.getByRole('menu', { name: '打开方式 report.md' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /使用系统默认应用打开/ }))
    fireEvent.click(screen.getByRole('button', { name: '打开方式 report.md' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /打开所在文件夹/ }))
    expect(onOpen).toHaveBeenCalledWith('report')
    expect(onReveal).toHaveBeenCalledWith('report')
    expect(screen.queryByRole('menu', { name: '打开方式 report.md' })).not.toBeInTheDocument()

    const onRemove = vi.fn()
    rerender(<MessageAttachmentGroup source="user" attachments={[{ id: 'brief', name: 'brief.pdf', detail: 'PDF · 1.8 MB' }]} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: '移除 brief.pdf' }))
    expect(onRemove).toHaveBeenCalledWith('brief')
  })

  it('expands and collapses long markdown without changing the message bubble contract', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
    const { container } = render(<MarkdownMessage>{'# 标题\n\n一段较长的消息内容。'.repeat(20)}</MarkdownMessage>)
    const expand = await screen.findByRole('button', { name: /展开全文/ })
    expect(container.querySelector('.markdown-message__content')).toHaveClass('is-collapsible')
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: /收起/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: /收起/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /展开全文/ })).toHaveAttribute('aria-expanded', 'false'))
  })

  it('does not mark a short message as collapsible', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(32)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32)
    const { container } = render(<MarkdownMessage>Hi there!</MarkdownMessage>)
    await waitFor(() => expect(container.querySelector('.markdown-message__content')).not.toHaveClass('is-collapsible'))
    expect(screen.queryByRole('button', { name: /展开全文/ })).not.toBeInTheDocument()
  })

  it('uses the compact disclosure boundary for process messages', () => {
    const { container } = render(<MarkdownMessage compact>过程内容</MarkdownMessage>)
    expect(container.querySelector('.markdown-message')).toHaveClass('markdown-message--compact')
  })

  it('uses one borderless chat contract for timeline messages and their status', () => {
    const { container } = render(<ChatMessage source="agent" variant="timeline" name="网络情报员" initials="网" color="#9ebd79" time="12:49" status={<span>阶段完成</span>}><MarkdownMessage compact>已完成多源检索。</MarkdownMessage></ChatMessage>)
    expect(container.querySelector('.message-block')).toHaveClass('message-block--timeline', 'message-stream-item')
    expect(container.querySelector('.message-bubble__status')).toHaveTextContent('阶段完成')
    expect(container.querySelector('.message-block--progress')).toBeNull()
  })

  it('renders legacy markdown assignment summaries as regular plain timeline text', () => {
    const { container } = render(<TimelineSummary>{'## 研究范围与结论摘要 **研究任务：** 交叉核验。 | 通道 | 结果 | |---|---| | agent-reach.search | 5 条 |'}</TimelineSummary>)
    const summary = container.querySelector('.chat-content__summary')

    expect(summary).toHaveTextContent('研究范围与结论摘要 研究任务： 交叉核验。；通道；结果；agent-reach.search；5 条')
    expect(summary?.closest('.chat-content')).toHaveClass('chat-content--timeline')
    expect(container.querySelector('h2')).toBeNull()
  })

  it('renders one structured chat content contract for timeline and delivery messages', () => {
    const content = { schemaVersion: 1 as const, title: '公开信息核验完成', summary: '已形成可追溯结论。', metrics: [{ label: '来源', value: '11' }, { label: '结论', value: '5' }], detail: { label: '查看研究说明', content: '查询结果。\n冲突明细。\n\n补充结论。' } }
    const { rerender } = render(<ChatContentBlock content={content} />)
    expect(screen.getByText('公开信息核验完成')).toHaveClass('chat-content__title')
    expect(screen.getByLabelText('内容概况')).toHaveTextContent('11来源5结论')
    fireEvent.click(screen.getByRole('button', { name: /查看研究说明/ }))
    const detailParagraphs = document.querySelectorAll('.chat-content__detail-body p')
    expect(detailParagraphs).toHaveLength(2)
    expect(detailParagraphs[0].textContent).toBe('查询结果。\n冲突明细。')
    expect(detailParagraphs[1]).toHaveTextContent('补充结论。')
    expect(screen.getByRole('button', { name: /收起详情/ })).toHaveAttribute('aria-expanded', 'true')

    rerender(<ChatContentBlock content={content} variant="delivery" />)
    expect(screen.getByText('公开信息核验完成').closest('.chat-content')).toHaveClass('chat-content--delivery')
  })
})
