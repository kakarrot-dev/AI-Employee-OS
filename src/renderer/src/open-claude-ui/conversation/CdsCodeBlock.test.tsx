import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CdsCodeBlock } from './CdsCodeBlock'

const writeText = vi.fn<(text: string) => Promise<void>>()
let previousClipboard: PropertyDescriptor | undefined
let previousDesktopApi: PropertyDescriptor | undefined

beforeEach(() => {
  vi.useFakeTimers()
  writeText.mockReset().mockResolvedValue(undefined)
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  previousDesktopApi = Object.getOwnPropertyDescriptor(window, 'aiEmployeeOS')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  if (previousDesktopApi) Object.defineProperty(window, 'aiEmployeeOS', previousDesktopApi)
  else Reflect.deleteProperty(window, 'aiEmployeeOS')
})

function installDesktopClipboard(write: (text: string) => Promise<void>): void {
  Object.defineProperty(window, 'aiEmployeeOS', { configurable: true, value: { ...window.aiEmployeeOS, clipboard: { writeText: write } } })
}

describe('CdsCodeBlock', () => {
  it('shows the language and filename while preserving every code whitespace character', () => {
    const code = '\n  const value = " spaced "\n\treturn value\n\n'
    const { container } = render(<CdsCodeBlock code={code} language="typescript" filename="sample.ts" />)

    expect(screen.getByText('typescript')).toBeInTheDocument()
    expect(screen.getByText('sample.ts')).toBeInTheDocument()
    const pre = container.querySelector('pre')
    expect(pre?.textContent).toBe(code)
    expect(pre?.querySelector('code')?.textContent).toBe(code)
    expect(pre?.querySelector('div')).toBeNull()
    expect(screen.getByRole('button', { name: '复制代码' })).toHaveAttribute('type', 'button')
  })

  it('preserves blank lines and indentation with optional line numbers', () => {
    const code = '\n  first\n\tsecond\n'
    render(<CdsCodeBlock code={code} showLineNumbers filename="sample.txt" />)

    expect(screen.getByText('text')).toBeInTheDocument()
    const rows = within(screen.getByRole('table', { name: 'sample.txt 代码和行号' })).getAllByRole('row')
    expect(rows).toHaveLength(4)
    code.split('\n').forEach((line, index) => {
      expect(within(rows[index]).getByRole('rowheader')).toHaveTextContent(String(index + 1))
      expect(within(rows[index]).getByRole('cell').textContent).toBe(line)
    })
  })

  it('only reports a successful clipboard write and clears it after 2.5 seconds', async () => {
    let complete: () => void = () => undefined
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve }))
    const code = '  const answer = 42\n'
    render(<CdsCodeBlock code={code} />)

    fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(code)
    expect(screen.queryByRole('button', { name: '已复制代码' })).not.toBeInTheDocument()

    await act(async () => { complete() })
    expect(screen.getByRole('button', { name: '已复制代码' })).toHaveTextContent('已复制')
    act(() => { vi.advanceTimersByTime(2499) })
    expect(screen.getByRole('button', { name: '已复制代码' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
  })

  it('keeps clipboard failures retryable and does not report them as copied', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    render(<CdsCodeBlock code="retry me" />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(screen.queryByRole('button', { name: '已复制代码' })).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制失败，重试复制代码' })) })
    expect(writeText).toHaveBeenNthCalledWith(2, 'retry me')
    expect(screen.getByRole('button', { name: '已复制代码' })).toBeInTheDocument()
  })

  it('restarts the copied indicator lifetime on repeated clicks', async () => {
    render(<CdsCodeBlock code="copy again" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    act(() => { vi.advanceTimersByTime(2000) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '已复制代码' })) })
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    act(() => { vi.advanceTimersByTime(2499) })
    expect(screen.getByRole('button', { name: '已复制代码' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
  })

  it('cleans up the copied-state timer when unmounted', async () => {
    const { unmount } = render(<CdsCodeBlock code="copy then close" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a pending clipboard completion after unmount', async () => {
    let complete: () => void = () => undefined
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve }))
    const { unmount } = render(<CdsCodeBlock code="pending copy" />)
    fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    unmount()

    await act(async () => { complete() })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears a copied indicator when streaming changes the code', async () => {
    const { rerender } = render(<CdsCodeBlock code="first chunk" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(screen.getByRole('button', { name: '已复制代码' })).toBeInTheDocument()

    rerender(<CdsCodeBlock code={'first chunk\nsecond chunk'} />)
    expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(writeText).toHaveBeenLastCalledWith('first chunk\nsecond chunk')
  })

  it('prefers the desktop clipboard bridge and waits for its actual completion', async () => {
    let complete: () => void = () => undefined
    const desktopWrite = vi.fn<(text: string) => Promise<void>>(() => new Promise<void>((resolve) => { complete = resolve }))
    installDesktopClipboard(desktopWrite)
    render(<CdsCodeBlock code="desktop clipboard" />)

    fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    expect(desktopWrite).toHaveBeenCalledExactlyOnceWith('desktop clipboard')
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '已复制代码' })).not.toBeInTheDocument()

    await act(async () => { complete() })
    expect(screen.getByRole('button', { name: '已复制代码' })).toBeInTheDocument()
  })

  it('does not bypass a rejected desktop bridge through the browser clipboard', async () => {
    const desktopWrite = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('desktop clipboard rejected'))
    installDesktopClipboard(desktopWrite)
    render(<CdsCodeBlock code="rejected copy" />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(desktopWrite).toHaveBeenCalledExactlyOnceWith('rejected copy')
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '复制失败，重试复制代码' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '已复制代码' })).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes original indentation, blank lines and CRLF unchanged to the desktop bridge', async () => {
    const desktopWrite = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    installDesktopClipboard(desktopWrite)
    const code = '\r\n  function example() {\r\n\treturn " original "  \r\n  }\r\n\r\n'
    render(<CdsCodeBlock code={code} showLineNumbers />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制代码' })) })
    expect(desktopWrite).toHaveBeenCalledExactlyOnceWith(code)
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '已复制代码' })).toBeInTheDocument()
  })
})
