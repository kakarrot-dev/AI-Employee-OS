import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopComposer } from './DesktopComposer'

afterEach(cleanup)

function setup(overrides: Partial<React.ComponentProps<typeof DesktopComposer>> = {}) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
  const onDropAttachments = vi.fn()
  const onCancel = vi.fn()
  function Harness() {
    const [value, setValue] = useState('待发送内容')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    return <DesktopComposer value={value} onChange={setValue} inputRef={inputRef} placeholder="发送给总管" disabled={false} sending={false} cancelling={false} canCancel={false} hasAttachments={false} onSubmit={onSubmit} onSelectAttachments={vi.fn()} onDropAttachments={onDropAttachments} onCancel={onCancel} {...overrides} />
  }
  render(<Harness />)
  return { onSubmit, onDropAttachments, onCancel, input: screen.getByRole('textbox', { name: '发送消息' }) }
}

describe('DesktopComposer', () => {
  it('submits Enter and leaves Shift+Enter available for a new line', () => {
    const { input, onSubmit } = setup()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it.each([{ isComposing: true }, { keyCode: 229 }])('does not submit while a Chinese IME is composing: %j', (composition) => {
    const { input, onSubmit } = setup()
    fireEvent.keyDown(input, { key: 'Enter', ...composition })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('passes actual dropped files and removes the drag feedback', () => {
    const { onDropAttachments } = setup()
    const form = screen.getByRole('form', { name: '消息输入' })
    const file = new File(['真实文件内容'], '需求.pdf', { type: 'application/pdf' })
    const dataTransfer = { types: ['Files'], files: [file] }
    fireEvent.dragEnter(form, { dataTransfer })
    expect(screen.getByRole('status')).toHaveTextContent('松开以上传文件')
    fireEvent.drop(form, { dataTransfer })
    expect(onDropAttachments).toHaveBeenCalledWith([file])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('routes stop through cancellation and prevents edits and uploads during a reply', () => {
    const { input, onCancel } = setup({ sending: true, canCancel: true })
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加附件' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument()
  })

  it('exposes a recoverable error and blocks an empty send', () => {
    const { input } = setup({ error: '附件导入失败，请重试' })
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('附件导入失败，请重试')
  })
})
