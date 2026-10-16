import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatMessage, MarkdownContent, MarkdownMessage, StreamingMarkdownMessage } from '../../components/message-ui'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CDS Markdown rendering', () => {
  it('renders all six heading levels and preserves strong, emphasis and deletion semantics', () => {
    const headings = Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} 第 ${index + 1} 级标题`)
    render(<MarkdownContent>{[...headings, '**重点内容**、*强调内容*、~~已删除内容~~。'].join('\n\n')}</MarkdownContent>)

    headings.forEach((_, index) => {
      expect(screen.getByRole('heading', { level: index + 1, name: `第 ${index + 1} 级标题` })).toBeInTheDocument()
    })
    expect(screen.getByText('重点内容').tagName).toBe('STRONG')
    expect(screen.getByText('强调内容').tagName).toBe('EM')
    expect(screen.getByText('已删除内容').tagName).toBe('DEL')
  })

  it('keeps nested unordered and ordered lists, quotations and thematic breaks as real elements', () => {
    const markdown = [
      '- 无序父项',
      '  1. 有序子项',
      '  2. 第二个子项',
      '',
      '3. 有序父项',
      '   - 无序子项',
      '',
      '> 一段引用。',
      '>',
      '> 第二段包含 **引用重点**。',
      '',
      '---'
    ].join('\n')
    const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>)

    const unorderedParent = screen.getByText('无序父项').closest('li')!
    expect(unorderedParent.parentElement?.tagName).toBe('UL')
    expect(within(unorderedParent).getByRole('list').tagName).toBe('OL')
    expect(within(unorderedParent).getAllByRole('listitem')).toHaveLength(2)
    const orderedParent = screen.getByText('有序父项').closest('li')!
    expect(orderedParent.parentElement?.tagName).toBe('OL')
    expect(orderedParent.parentElement).toHaveAttribute('start', '3')
    expect(within(orderedParent).getByRole('list').tagName).toBe('UL')
    expect(container.querySelector('blockquote')).toHaveTextContent(/一段引用。\s*第二段包含 引用重点。/)
    expect(screen.getByText('引用重点').closest('blockquote')).toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('keeps inline code inline and sends fenced language and whitespace to the code block', () => {
    const code = '\n  const value = 1\n\tconsole.log(value)\n\n'
    const markdown = '段落中的 `value`。\n\n```typescript\n' + code + '```'
    const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>)

    const inline = screen.getByText('value', { selector: 'p code' })
    expect(inline.closest('pre')).toBeNull()
    const block = screen.getByRole('button', { name: '复制代码' }).closest('[data-cds="CodeBlock"]')!
    expect(within(block as HTMLElement).getByText('typescript')).toBeInTheDocument()
    expect(block.querySelector('pre code')?.textContent).toBe(code)
    expect(container.querySelector('pre div')).toBeNull()
    expect(block.closest('pre')).toBeNull()
  })

  it('preserves table alignment inside a keyboard-focusable scrolling region', () => {
    render(<MarkdownContent>{'| 左列 | 中列 | 右列 |\n| :-- | :--: | --: |\n| A | B | C |'}</MarkdownContent>)

    const region = screen.getByRole('region', { name: '数据表格' })
    expect(region).toHaveAttribute('tabindex', '0')
    region.focus()
    expect(region).toHaveFocus()
    const table = within(region).getByRole('table')
    const headings = within(table).getAllByRole('columnheader')
    const cells = within(table).getAllByRole('cell')
    for (const [index, alignment] of ['left', 'center', 'right'].entries()) {
      expect(headings[index]).toHaveStyle({ textAlign: alignment })
      expect(cells[index]).toHaveStyle({ textAlign: alignment })
    }
  })

  it('represents GFM task completion with read-only checkboxes', () => {
    render(<MarkdownContent>{'- [x] 已完成\n- [ ] 待完成'}</MarkdownContent>)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
    checkboxes.forEach((checkbox) => expect(checkbox).toBeDisabled())
    expect(screen.getByText('已完成').closest('li')).toContainElement(checkboxes[0])
    expect(screen.getByText('待完成').closest('li')).toContainElement(checkboxes[1])
  })

  it('opens only http(s) links in a protected new window', () => {
    render(<MarkdownContent>{'[HTTPS 外链](https://example.com/report)\n\n[HTTP 外链](http://example.com/report)\n\n[本页位置](#details)\n\n[发送邮件](mailto:reader@example.com)'}</MarkdownContent>)

    for (const name of ['HTTPS 外链', 'HTTP 外链']) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(screen.getByRole('link', { name: '本页位置' })).toHaveAttribute('href', '#details')
    expect(screen.getByRole('link', { name: '本页位置' })).not.toHaveAttribute('target')
    expect(screen.getByRole('link', { name: '发送邮件' })).not.toHaveAttribute('target')
  })

  it('does not create executable javascript URLs or raw HTML elements', () => {
    const execute = vi.fn()
    vi.stubGlobal('__cdsMarkdownInjected', execute)
    const markdown = [
      '[危险链接](javascript:alert%281%29)',
      '',
      '<script>window.__cdsMarkdownInjected()</script>',
      '',
      '<img src="invalid" onerror="window.__cdsMarkdownInjected()">',
      '',
      '<iframe src="javascript:window.__cdsMarkdownInjected()"></iframe>'
    ].join('\n')
    const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>)

    const unsafeLink = screen.getByText('危险链接').closest('a')!
    expect(unsafeLink.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    expect(unsafeLink).not.toHaveAttribute('target')
    expect(container.querySelector('script, img, iframe, [onerror], [onclick]')).toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps a complete reply expanded even when its measured content overflows', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2400)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40)
    const paragraphs = Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 段完整回复。`)
    render(<MarkdownMessage collapsible={false}>{paragraphs.join('\n\n')}</MarkdownMessage>)

    await act(async () => { await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())) })
    expect(screen.getByText('第 1 段完整回复。')).toBeVisible()
    expect(screen.getByText('第 30 段完整回复。')).toBeVisible()
    expect(screen.queryByRole('button', { name: /展开全文|收起/ })).not.toBeInTheDocument()
  })

  it('renders the active streaming cursor outside Markdown and removes it at completion', () => {
    const markdown = '最后是 **真实回复**：\n\n- 第一条\n- 第二条'
    const { container, rerender } = render(<StreamingMarkdownMessage active>{markdown}</StreamingMarkdownMessage>)
    const cursor = container.querySelector('[data-cds="StreamingCursor"]')!

    expect(cursor.tagName).toBe('SPAN')
    expect(cursor).toBeVisible()
    expect(cursor).toHaveAttribute('aria-hidden', 'true')
    expect(cursor.closest('[data-cds="Markdown"]')).toBeNull()
    expect(cursor.parentElement).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('真实回复').tagName).toBe('STRONG')

    rerender(<StreamingMarkdownMessage active={false}>{markdown}</StreamingMarkdownMessage>)
    expect(container.querySelector('[data-cds="StreamingCursor"]')).toBeNull()
    expect(screen.getByText('真实回复')).toBeVisible()
    expect(container.querySelector('[data-cds="StreamingText"]')).not.toHaveAttribute('aria-live')
  })

  it('places user attachments before the bubble and exposes a model badge only for the agent', () => {
    render(<>
      <ChatMessage source="user" name="本地用户" initials="用" color="#d7b36a" time="12:30" modelName="不应显示的用户模型" attachments={<section aria-label="用户附件">需求.pdf</section>}><p>用户消息正文</p></ChatMessage>
      <ChatMessage source="agent" name="悟空" initials="悟" color="#b8c982" time="12:31" modelName="claude-sonnet-4.6" attachments={<section aria-label="Agent 附件">报告.md</section>}><p>Agent 回复正文</p></ChatMessage>
    </>)

    const userAttachments = screen.getByRole('region', { name: '用户附件' })
    const userBubble = screen.getByText('用户消息正文').closest('.message-bubble')!
    expect(userBubble).not.toContainElement(userAttachments)
    expect(userAttachments.compareDocumentPosition(userBubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('不应显示的用户模型')).not.toBeInTheDocument()

    const agentAttachments = screen.getByRole('region', { name: 'Agent 附件' })
    const agentBubble = screen.getByText('Agent 回复正文').closest('.message-bubble')!
    expect(agentBubble).not.toContainElement(agentAttachments)
    expect(agentBubble.compareDocumentPosition(agentAttachments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('claude-sonnet-4.6').closest('header')).toHaveTextContent('悟空claude-sonnet-4.612:31')
  })
})
