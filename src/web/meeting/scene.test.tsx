import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from '../../renderer/src/App'
import { createPreviewBridge } from '../preview-bridge'
import { createMeetingScenes } from './scene'
import { MeetingStore, meetingTask } from './store'
import { meetingExpertGroup, meetingSummaryText } from './demo'

let store: MeetingStore
beforeEach(() => {
  window.localStorage?.clear()
  store = new MeetingStore()
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected network request'))))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  URL.createObjectURL = vi.fn(() => 'blob:meeting-summary-test')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); store.dispose(); vi.useRealTimers(); vi.unstubAllGlobals() })

async function setup() {
  const bridge = createPreviewBridge(store)
  const scenes = createMeetingScenes(bridge, store)
  window.aiEmployeeOS = bridge
  render(<App scenes={scenes} />)
  await screen.findByRole('heading', { name: '与总管的对话', level: 1 })
  fireEvent.click(screen.getByRole('button', { name: '通讯录' }))
  fireEvent.click(screen.getByRole('tab', { name: '专家团' }))
  fireEvent.click(await screen.findByRole('button', { name: '进入会话' }))
  await screen.findByRole('form', { name: '飞书会议信息' })
  const conversation = (await bridge.conversation.list()).find((item) => item.title === meetingExpertGroup.name)!
  return { bridge, scenes, id: conversation.id }
}

describe('Meeting scene inside the shared client', () => {
  it('keeps the native shell and Composer, isolates drafts, and never routes ordinary messages into meetings', async () => {
    const { bridge, scenes, id } = await setup()
    expect(document.querySelector('.message-page .composer')).toBeTruthy()
    expect(document.querySelector('.matter-sidebar__header')).toHaveTextContent('事项0')
    const form = screen.getByRole('form', { name: '飞书会议信息' })
    fireEvent.change(within(form).getByLabelText(/会议主题/), { target: { value: '草稿会议' } })
    fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), { target: { value: '仅当前会话的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    await screen.findByRole('heading', { name: '新会话', level: 1 })
    expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveValue('')
    const ordinary = (await bridge.conversation.list()).find((item) => item.title === '新会话')!
    vi.useFakeTimers()
    await act(async () => { await bridge.conversation.send(ordinary.id, '请帮我安排飞书会议'); await vi.advanceTimersByTimeAsync(500) })
    expect(scenes.getSnapshot(ordinary.id)).toBeUndefined()
    expect(store.get(id)?.stage).toBe('draft')
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: /会议专家团.*填写会议信息/ }))
    await screen.findByRole('form', { name: '飞书会议信息' })
    expect(screen.getByLabelText(/会议主题/)).toHaveValue('草稿会议')
    expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveValue('仅当前会话的草稿')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('delivers one group summary through the shared timeline, matter details and file preview', async () => {
    const { bridge, id } = await setup()
    fireEvent.click(screen.getByRole('button', { name: '发起会议并生成摘要' }))
    expect(await screen.findByText('请填写会议主题。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/会议主题/), { target: { value: '客户端融合验收' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /陈晨.*设计部/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /陈晨.*质量部/ }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '发起会议并生成摘要' }))
    expect(store.get(id)?.meeting?.participants).toHaveLength(2)
    expect(document.querySelector('.matter-sidebar__header')).toHaveTextContent('事项1')
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    // Notes stay in time order and cannot alter the frozen form or create another matter.
    fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), { target: { value: '改成明天下午' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    const conversation = screen.getByLabelText('对话')
    expect(conversation.textContent!.indexOf('飞书会议已预约')).toBeLessThan(conversation.textContent!.indexOf('改成明天下午'))
    expect(store.get(id)?.meeting?.topic).toBe('客户端融合验收')
    // Leaving the module does not own or stop the workflow timer.
    fireEvent.click(screen.getByRole('button', { name: '通讯录' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(store.get(id)?.stage).toBe('complete')
    fireEvent.click(screen.getByRole('button', { name: '消息' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('会议摘要已交付')).toBeInTheDocument()
    expect(document.querySelectorAll('.matter-event')).toHaveLength(1)
    expect(document.querySelector('.composer')).toBeTruthy()
    expect(document.querySelectorAll('.message-attachments').length).toBeGreaterThan(0)
    const raw = store.get(id)!.minutes!.transcript[0].text
    expect(screen.getByLabelText('对话')).not.toHaveTextContent(raw)
    expect(screen.getByLabelText('对话')).not.toHaveTextContent('会议概述')
    expect(document.querySelectorAll('.message-author strong').length).toBeGreaterThan(0)
    expect([...document.querySelectorAll('.message-block--agent .message-author strong')].every((node) => node.textContent === meetingExpertGroup.name)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '查看完整验收记录' }))
    expect(document.querySelectorAll('.matter-progress-item')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: '按该事项原内容重新执行' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '打开方式 客户端融合验收-会议摘要.md' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /预览文档/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('会议概述')
    expect(screen.getByRole('dialog')).toHaveTextContent('负责人')
    expect(screen.getByRole('button', { name: '下载摘要' })).toBeEnabled()
    expect((await bridge.task.list()).filter((task) => task.conversationId === id)).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('runs concurrent sessions independently, freezes submitted facts and cancels an archived session', async () => {
    vi.useFakeTimers()
    const bridge = createPreviewBridge(store), scenes = createMeetingScenes(bridge, store), events = vi.fn()
    bridge.conversation.onEvent(events)
    const a = (await scenes.enter(meetingExpertGroup.name, 'group'))!, b = (await scenes.enter(meetingExpertGroup.name, 'group'))!
    store.updateDraft(a.id, { topic: '甲会议', participantIds: ['demo-product'] })
    store.updateDraft(b.id, { topic: '乙会议', participantIds: ['demo-engineering'] })
    expect(store.submit(a.id)).toEqual({})
    const first = scenes.getSnapshot(a.id)
    expect(scenes.getSnapshot(a.id)).toBe(first)
    store.updateDraft(a.id, { topic: '不应覆盖' })
    expect(store.get(a.id)?.meeting?.topic).toBe('甲会议')
    await vi.advanceTimersByTimeAsync(1000)
    store.submit(b.id)
    await bridge.conversation.send(a.id, '归档前的消息')
    await bridge.conversation.archive(a.id)
    await vi.advanceTimersByTimeAsync(32000)
    expect(store.get(a.id)).toBeUndefined()
    expect(events).not.toHaveBeenCalled()
    expect(store.get(b.id)?.stage).toBe('complete')
    const task = meetingTask(b.id, store.get(b.id)!)!
    expect(task.assignments).toHaveLength(3)
    expect(task.assignments.every((member) => member.state === 'succeeded')).toBe(true)
    expect(task.delivery?.artifacts).toHaveLength(1)
    expect(meetingSummaryText(store.get(b.id)!)).toContain('乙会议')
    expect(meetingSummaryText(store.get(b.id)!)).not.toContain('甲会议')
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    await bridge.conversation.send(b.id, '交付后的备注')
    const latestMessage = (await bridge.conversation.history(b.id)).at(-1)!
    expect((await bridge.conversation.list()).find((item) => item.id === b.id)?.updatedAt).toBe(latestMessage.createdAt)
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).not.toHaveBeenCalled()
  })
})
