import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClaudeScrollPinning } from './useClaudeScrollPinning'

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = []
  readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  observe(target: Element): void { this.targets.add(target) }
  unobserve(target: Element): void { this.targets.delete(target) }
  disconnect(): void { this.targets.clear() }
  resize(): void { this.callback([], this) }
}

function createViewport() {
  const element = document.createElement('div')
  element.append(document.createElement('div'))
  const geometry = { contentHeight: 1000, viewportHeight: 400, top: 0 }
  Object.defineProperties(element, {
    scrollHeight: { get: () => geometry.contentHeight },
    clientHeight: { get: () => geometry.viewportHeight },
    scrollTop: { get: () => geometry.top, set: (value: number) => { geometry.top = value } }
  })
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (options.behavior !== 'smooth') geometry.top = Math.max(0, Math.min(options.top ?? geometry.top, geometry.contentHeight - geometry.viewportHeight))
  })
  Object.defineProperty(element, 'scrollTo', { value: scrollTo })
  return { element, geometry, scrollTo }
}

function setupConversation() {
  const viewport = createViewport()
  const hook = renderHook(({ revision, conversation }) => useClaudeScrollPinning([revision], conversation), {
    initialProps: { revision: 0, conversation: 'first' }
  })
  act(() => {
    hook.result.current.containerRef.current = viewport.element
    hook.result.current.scrollToBottom()
  })
  hook.rerender({ revision: 0, conversation: 'first' })
  return { ...hook, ...viewport }
}

beforeEach(() => {
  vi.useFakeTimers()
  TestResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Claude conversation scroll pinning', () => {
  it('keeps streaming content at the bottom while the reader follows the latest message', () => {
    const { result, geometry, rerender } = setupConversation()
    expect(geometry.top).toBe(600)

    geometry.contentHeight = 1250
    rerender({ revision: 1, conversation: 'first' })

    expect(geometry.top).toBe(850)
    expect(result.current.isPinned).toBe(true)
    expect(result.current.showJumpControl).toBe(false)
  })

  it('does not consume the first manual scroll after a no-op jump to the bottom', () => {
    const { result, geometry } = setupConversation()
    act(() => { result.current.scrollToBottom() })

    act(() => {
      geometry.top = 200
      result.current.handleScroll()
    })

    expect(result.current.isPinned).toBe(false)
    expect(result.current.showJumpControl).toBe(true)
  })

  it('resumes following after input ends without requiring another token or scroll event', () => {
    const { result, geometry, rerender } = setupConversation()
    act(() => { result.current.markUserInput() })
    geometry.contentHeight = 1200
    rerender({ revision: 1, conversation: 'first' })
    act(() => { vi.advanceTimersByTime(149) })
    expect(geometry.top).toBe(600)
    expect(result.current.isPinned).toBe(false)

    act(() => { vi.advanceTimersByTime(1) })

    expect(geometry.top).toBe(800)
    expect(result.current.isPinned).toBe(true)
    expect(result.current.showJumpControl).toBe(false)
  })

  it('preserves an older reading position during and after repeated user input', () => {
    const { result, geometry, rerender } = setupConversation()
    act(() => {
      result.current.markUserInput()
      geometry.top = 250
      result.current.handleScroll()
      vi.advanceTimersByTime(100)
      result.current.markUserInput()
    })
    geometry.contentHeight = 1300
    rerender({ revision: 1, conversation: 'first' })
    act(() => { vi.advanceTimersByTime(150) })
    geometry.contentHeight = 1400
    rerender({ revision: 2, conversation: 'first' })

    expect(geometry.top).toBe(250)
    expect(result.current.isPinned).toBe(false)
    expect(result.current.showJumpControl).toBe(true)
  })

  it('preserves a user scroll even if its scroll event has not arrived when protection expires', () => {
    const { result, geometry } = setupConversation()
    act(() => {
      result.current.markUserInput()
      geometry.top = 200
      vi.advanceTimersByTime(150)
    })

    expect(geometry.top).toBe(200)
    expect(result.current.isPinned).toBe(false)
    expect(result.current.showJumpControl).toBe(true)
  })

  it('repins within 40 px and shows the jump button only beyond 120 px', () => {
    const { result, geometry } = setupConversation()
    act(() => { geometry.top = 560; result.current.handleScroll() })
    expect(result.current.isPinned).toBe(true)
    act(() => { geometry.top = 559; result.current.handleScroll() })
    expect(result.current.isPinned).toBe(false)
    act(() => { geometry.top = 480; result.current.handleScroll() })
    expect(result.current.showJumpControl).toBe(false)
    act(() => { geometry.top = 479; result.current.handleScroll() })
    expect(result.current.showJumpControl).toBe(true)
  })

  it('follows resized content and remeasures the viewport without moving an older reading position', () => {
    const { result, element, geometry } = setupConversation()
    const observer = TestResizeObserver.instances.at(-1)!
    expect(observer.targets.has(element)).toBe(true)
    expect(observer.targets.has(element.firstElementChild!)).toBe(true)
    geometry.contentHeight = 1400
    act(() => { observer.resize() })
    expect(geometry.top).toBe(1000)

    act(() => { geometry.top = 500; result.current.handleScroll() })
    geometry.contentHeight = 1600
    geometry.viewportHeight = 500
    act(() => { observer.resize() })

    expect(geometry.top).toBe(500)
    expect(result.current.showJumpControl).toBe(true)
  })

  it('repins when a larger viewport brings the reading position within the bottom tolerance', () => {
    const { result, geometry } = setupConversation()
    act(() => { geometry.top = 300; result.current.handleScroll() })
    expect(result.current.isPinned).toBe(false)
    geometry.viewportHeight = 680

    act(() => { TestResizeObserver.instances.at(-1)!.resize() })

    expect(result.current.isPinned).toBe(true)
    expect(geometry.top).toBe(320)
  })

  it('resets a different conversation and cancels the previous conversation input timer', () => {
    const { result, geometry, rerender } = setupConversation()
    act(() => {
      result.current.markUserInput()
      geometry.top = 200
      result.current.handleScroll()
    })
    geometry.contentHeight = 1800
    rerender({ revision: 1, conversation: 'second' })
    expect(geometry.top).toBe(1400)
    expect(result.current.isPinned).toBe(true)
    act(() => { geometry.top = 1000; result.current.handleScroll() })

    act(() => { vi.advanceTimersByTime(200) })

    expect(geometry.top).toBe(1000)
    expect(result.current.isPinned).toBe(false)
  })

  it('observes a replacement container even when the conversation and content dependencies stay equal', () => {
    const { result, rerender } = setupConversation()
    const previousObserver = TestResizeObserver.instances.at(-1)!
    const replacement = createViewport()
    replacement.geometry.contentHeight = 2000
    act(() => { result.current.containerRef.current = replacement.element })

    rerender({ revision: 0, conversation: 'first' })

    expect(previousObserver.targets.size).toBe(0)
    expect(replacement.geometry.top).toBe(1600)
    expect(TestResizeObserver.instances.at(-1)!.targets.has(replacement.element)).toBe(true)
  })

  it('cancels a smooth jump immediately when the user starts reading older content', () => {
    const { result, geometry, scrollTo } = setupConversation()
    act(() => { geometry.top = 100; result.current.handleScroll(); result.current.scrollToBottom(true) })
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: 'smooth' })
    act(() => { geometry.top = 300; result.current.handleScroll() })
    expect(result.current.isPinned).toBe(true)

    act(() => {
      result.current.markUserInput()
      geometry.top = 150
      result.current.handleScroll()
      vi.advanceTimersByTime(1000)
    })

    expect(geometry.top).toBe(150)
    expect(result.current.isPinned).toBe(false)
    expect(result.current.showJumpControl).toBe(true)
  })

  it('honors reduced motion for an explicitly requested smooth jump', () => {
    const { result, geometry, scrollTo } = setupConversation()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }))
    act(() => { geometry.top = 100; result.current.handleScroll(); result.current.scrollToBottom(true) })

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: 'auto' })
    expect(geometry.top).toBe(600)
    expect(result.current.isPinned).toBe(true)
  })

  it('cleans up input protection and resize observation when the conversation unmounts', () => {
    const { result, unmount } = setupConversation()
    act(() => { result.current.markUserInput() })

    unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(TestResizeObserver.instances.every((observer) => observer.targets.size === 0)).toBe(true)
  })
})
