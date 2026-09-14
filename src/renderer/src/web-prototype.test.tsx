import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../prototypes/macos-client-v2/src/App'
import { MessageAttachmentGroup } from './components/message-ui'

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

function navigate(label: string) {
  fireEvent.click(within(screen.getByRole('navigation', { name: '一级导航' })).getByRole('button', { name: label }))
}

describe('Web prototype interaction parity', () => {
  it.each([false, true])('respects reduced motion (%s) when advancing the shared attachment carousel', (reduced) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)', media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(620)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(220)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200)
    const { container } = render(<MessageAttachmentGroup source="user" attachments={[{ id: 'a', name: 'a.txt', detail: 'TXT' }, { id: 'b', name: 'b.txt', detail: 'TXT' }]} />)
    const rows = container.querySelector('.message-attachments__rows') as HTMLElement
    const scrollBy = vi.fn()
    Object.defineProperty(rows, 'scrollBy', { value: scrollBy })
    fireEvent.scroll(rows)
    fireEvent.click(screen.getByRole('button', { name: '查看下一份附件' }))
    expect(scrollBy).toHaveBeenCalledWith({ left: 207, behavior: reduced ? 'auto' : 'smooth' })
  })

  it('exposes the current page and selected directory row to keyboard and assistive technology', () => {
    const { container } = render(<App />)
    navigate('通讯录')
    expect(screen.getByRole('button', { name: '通讯录' })).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('.list-row.is-selected')).toHaveAttribute('aria-current', 'true')
  })

  it('explains empty search results on messages and capabilities', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索会话' }), { target: { value: '不存在的会话xyz' } })
    expect(screen.getByText('没有匹配的会话')).toHaveAttribute('role', 'status')
    navigate('能力')
    fireEvent.change(screen.getByRole('textbox', { name: '搜索能力' }), { target: { value: '不存在的能力xyz' } })
    expect(screen.getByText('没有匹配的能力')).toHaveAttribute('role', 'status')
  })

  it('clears the workspace when the last conversation is deleted and can start a new one', () => {
    render(<App />)
    while (screen.queryAllByRole('button', { name: /^删除会话 / }).length) {
      fireEvent.click(screen.getAllByRole('button', { name: /^删除会话 / })[0])
    }
    expect(screen.getByText('选择或新建会话开始')).toBeInTheDocument()
    expect(screen.queryByLabelText('飞书会议消息时间线')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    expect(screen.getByRole('button', { name: '发起会议并生成摘要' })).toBeInTheDocument()
  })

  it('saves employee edits and deletes the selected employee, including the last one', async () => {
    const { container } = render(<App />)
    navigate('通讯录')
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    const dialog = screen.getByRole('dialog', { name: 'Agent 设置' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '名称' }), { target: { value: '编辑后的专家' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(container.querySelector('.toolbar h1')).toHaveTextContent('编辑后的专家')
    while (container.querySelector('.list-row.is-selected')) {
      fireEvent.click(screen.getByRole('button', { name: '设置' }))
      fireEvent.click(screen.getByRole('button', { name: '删除 Agent' }))
      const confirm = screen.getByRole('dialog', { name: '删除 Agent' })
      expect(confirm).toHaveTextContent(container.querySelector('.toolbar h1')!.textContent!)
      fireEvent.click(within(confirm).getByRole('button', { name: '确认删除' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    expect(screen.getByText('创建一位专家开始')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument()
  })

  it('does not offer system file actions for fixture attachments without files', () => {
    const { container } = render(<App />)
    fireEvent.click(within(container.querySelector('.context-pane') as HTMLElement).getByRole('button', { name: /^东南亚/ }))
    const actions = within(container.querySelector('.message-attachments--agent') as HTMLElement).getAllByRole('button', { name: /^打开方式 / })
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) expect(action).toBeDisabled()
    expect(screen.getAllByText('示例附件未提供文件，无法打开或下载。').length).toBeGreaterThan(0)
  })

  it('keeps permission and budget choices when leaving and returning to settings', () => {
    render(<App />)
    navigate('系统')
    fireEvent.click(screen.getByRole('button', { name: '资源与权限' }))
    fireEvent.click(screen.getByRole('button', { name: /每次询问/ }))
    fireEvent.click(screen.getByRole('button', { name: '用量与预算' }))
    const budget = screen.getByRole('spinbutton', { name: '月度预算金额' })
    fireEvent.change(budget, { target: { value: '-1' } })
    expect(screen.getByRole('button', { name: '保存预算' })).toBeDisabled()
    fireEvent.change(budget, { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }))
    expect(screen.getByText('¥ 713.58')).toBeInTheDocument()
    navigate('消息')
    navigate('系统')
    expect(screen.getByRole('spinbutton', { name: '月度预算金额' })).toHaveValue(800)
    fireEvent.click(screen.getByRole('button', { name: '资源与权限' }))
    expect(screen.getByRole('button', { name: /每次询问/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('retains simulated model verification and labels native-only actions as unavailable', () => {
    render(<App />)
    navigate('系统')
    fireEvent.click(screen.getByRole('button', { name: '模型服务' }))
    fireEvent.change(screen.getByLabelText('Poe API Key'), { target: { value: 'demo-key-only' } })
    fireEvent.click(screen.getByRole('button', { name: '保存示例连接' }))
    fireEvent.click(screen.getAllByRole('button', { name: '验证' })[0])
    navigate('消息')
    navigate('系统')
    expect(screen.getAllByText('已验证 · 演示')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '关于与诊断' }))
    expect(screen.getByRole('button', { name: '检查' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '导出' })).toBeDisabled()
    expect(screen.getByText('Web 演示 · 未连接')).toBeInTheDocument()
  })

  it('retains uploaded files per conversation and exposes an actual download with URL cleanup', async () => {
    const createUrl = vi.fn(() => 'blob:uploaded-file')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createUrl
      static revokeObjectURL = revokeUrl
    })
    const { container } = render(<App />)
    const selectResearch = () => fireEvent.click(within(container.querySelector('.context-pane') as HTMLElement).getByRole('button', { name: /^东南亚/ }))
    selectResearch()
    const file = new File(['test attachment'], 'review-note.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('添加附件'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /^Agent 产品讨论/ }))
    expect(screen.queryByRole('button', { name: '移除 review-note.txt' })).not.toBeInTheDocument()
    selectResearch()
    expect(screen.getByRole('button', { name: '移除 review-note.txt' })).toBeInTheDocument()
    fireEvent.submit(container.querySelector('form.composer')!)
    fireEvent.click(screen.getByRole('button', { name: '打开 review-note.txt' }))
    const preview = screen.getByRole('dialog', { name: '附件预览' })
    await waitFor(() => expect(within(preview).getByRole('link', { name: '下载文件' })).toHaveAttribute('href', 'blob:uploaded-file'))
    expect(createUrl).toHaveBeenCalledWith(file)
    expect(within(preview).getByRole('link', { name: '下载文件' })).toHaveAttribute('download', file.name)
    fireEvent.click(within(preview).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:uploaded-file'))
  })

  it('handles the sample direction confirmation without losing its state on navigation', () => {
    const { container } = render(<App />)
    fireEvent.click(within(container.querySelector('.context-pane') as HTMLElement).getByRole('button', { name: /^东南亚/ }))
    fireEvent.click(screen.getByRole('button', { name: '提出修改' }))
    expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveValue('发布物料修改建议：')
    fireEvent.click(screen.getByRole('button', { name: '确认方向' }))
    navigate('通讯录')
    navigate('消息')
    expect(screen.getByRole('article', { name: '确认发布物料方向' })).toHaveTextContent('已确认 · 演示')
    expect(screen.queryByRole('button', { name: '确认方向' })).not.toBeInTheDocument()
  })
})
