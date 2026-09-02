import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownMessage, MatterRouteNote, MessageAttachmentGroup } from './message-ui'

describe('message UI contracts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps route changes real and dismisses the menu after an action', () => {
    const onOpenMatter = vi.fn()
    const onCreateMatter = vi.fn()
    const onRequestChange = vi.fn()
    render(<MatterRouteNote title="市场研究" mode="linked" onOpenMatter={onOpenMatter} onCreateMatter={onCreateMatter} onRequestChange={onRequestChange} />)

    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    const options = screen.getByRole('group', { name: '更改消息归类' })
    fireEvent.click(screen.getByRole('button', { name: '将最新消息作为变更请求' }))
    expect(onRequestChange).toHaveBeenCalledOnce()
    expect(options).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    fireEvent.click(screen.getByRole('button', { name: '创建新事项草稿' }))
    expect(onCreateMatter).toHaveBeenCalledOnce()
  })

  it('reuses attachment actions for remove, open and reveal interactions', () => {
    const onOpen = vi.fn()
    const onReveal = vi.fn()
    const { rerender } = render(<MessageAttachmentGroup source="agent" attachments={[{ id: 'report', name: 'report.md', detail: 'Markdown · SHA-256 已记录' }]} onOpen={onOpen} onReveal={onReveal} />)
    fireEvent.click(screen.getByRole('button', { name: '打开 report.md' }))
    fireEvent.click(screen.getByRole('button', { name: '在文件夹中显示 report.md' }))
    expect(onOpen).toHaveBeenCalledWith('report')
    expect(onReveal).toHaveBeenCalledWith('report')

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
})
