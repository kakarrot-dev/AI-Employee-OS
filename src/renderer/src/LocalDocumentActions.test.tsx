import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDetailView } from '../../shared/task-contract'
import { LocalDocumentActions } from './LocalDocumentActions'

function task(): TaskDetailView {
  return { id: 'task', conversationId: 'conversation', draftId: 'draft', title: '文档', goal: '文档', state: 'needs_attention', acceptanceCriteria: [], employeeVersionIds: [], directories: [], draftRevision: 1, assignments: [], timeline: [], researchBundles: [], toolActions: [{ id: 'write', toolVersionId: 'document.create@local-document/v1', state: 'pending', risk: 'medium', approvalId: 'approval', parameters: { path: '/authorized/验收.md', content: '# 标题\n\n[原始文本](https://example.com)\n<script>example</script>' } }], approvals: [{ id: 'approval', toolActionId: 'write', decision: 'pending' }] }
}

describe('existing local document approvals', () => {
  it('shows the exact path and plain text, approving only after an explicit click', async () => {
    const input = task(), onUpdate = vi.fn(), approveTool = vi.fn().mockResolvedValue({ ...input, approvals: [] })
    Object.defineProperty(window, 'aiEmployeeOS', { configurable: true, value: { task: { approveTool, rejectTool: vi.fn() } } })
    const { container } = render(<LocalDocumentActions task={input} onUpdate={onUpdate} />)
    expect(screen.getByText('文件：/authorized/验收.md')).toBeInTheDocument()
    expect(container.querySelector('pre')?.textContent).toBe(input.toolActions[0].parameters.content)
    expect(container.querySelector('a, script')).toBeNull()
    expect(approveTool).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认新建文档' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ ...input, approvals: [] }))
    expect(approveTool).toHaveBeenCalledExactlyOnceWith('write')
  })

  it.each(['wrong approval id', 'wrong action id', 'approved', 'terminal task', 'settled action', 'unknown tool'])('does not offer stale or unsupported approval: %s', condition => {
    const input = task()
    if (condition === 'wrong approval id') input.approvals[0].id = 'other'
    if (condition === 'wrong action id') input.approvals[0].toolActionId = 'other'
    if (condition === 'approved') input.approvals[0].decision = 'approved'
    if (condition === 'terminal task') input.state = 'failed'
    if (condition === 'settled action') input.toolActions[0].state = 'succeeded'
    if (condition === 'unknown tool') input.toolActions[0].toolVersionId = 'unknown.external.write@v1'
    const { container } = render(<LocalDocumentActions task={input} onUpdate={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rejects the original action and prevents repeated decisions while waiting', async () => {
    const input = task(), onUpdate = vi.fn()
    let resolve!: (value: TaskDetailView) => void
    const rejectTool = vi.fn().mockReturnValue(new Promise<TaskDetailView>(done => { resolve = done }))
    const approveTool = vi.fn()
    Object.defineProperty(window, 'aiEmployeeOS', { configurable: true, value: { task: { approveTool, rejectTool } } })
    render(<LocalDocumentActions task={input} onUpdate={onUpdate} />)
    const reject = screen.getByRole('button', { name: '拒绝此动作' })
    fireEvent.click(reject); fireEvent.click(reject)
    expect(rejectTool).toHaveBeenCalledExactlyOnceWith('write')
    expect(reject).toBeDisabled()
    expect(approveTool).not.toHaveBeenCalled()
    await act(async () => resolve({ ...input, state: 'failed', approvals: [] }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed' }))
  })

  it('shows read and exact edit operations and keeps failed decisions reviewable', async () => {
    const input = task(), approveTool = vi.fn().mockRejectedValue(new Error('run_grant_expired'))
    input.toolActions[0] = { ...input.toolActions[0], toolVersionId: 'document.edit@local-document/v1', parameters: { path: '/authorized/验收.md', oldText: '原文\n一', newText: '替换\n二' } }
    Object.defineProperty(window, 'aiEmployeeOS', { configurable: true, value: { task: { approveTool, rejectTool: vi.fn() } } })
    const { container, rerender } = render(<LocalDocumentActions task={input} onUpdate={vi.fn()} />)
    expect([...container.querySelectorAll('pre')].map(pre => pre.textContent)).toEqual(['原文\n一', '替换\n二'])
    fireEvent.click(screen.getByRole('button', { name: '确认修改文档' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作未被接受')
    expect(screen.getByRole('button', { name: '确认修改文档' })).toBeEnabled()
    input.toolActions[0] = { ...input.toolActions[0], toolVersionId: 'document.read@local-document/v1', parameters: { path: '/authorized/验收.md' } }
    rerender(<LocalDocumentActions task={input} onUpdate={vi.fn()} />)
    expect(screen.getByRole('button', { name: '确认读取文档' })).toBeInTheDocument()
    expect(container.querySelector('pre')).toBeNull()
  })
})
