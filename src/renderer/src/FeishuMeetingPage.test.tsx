import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeishuMeetingPage } from '../../../prototypes/macos-client-v2/src/FeishuMeetingPage'
import { advanceDemoMeeting, createFeishuMeetingSession, meetingStages, scheduleDemoMeeting, type MeetingStage } from '../../../prototypes/macos-client-v2/src/feishu-meeting-demo'

const userProfile = { name: '验收用户', avatarUrl: null }
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
const revokeUrl = vi.fn()

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:meeting-summary')
    static revokeObjectURL = revokeUrl
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

function fixture(stage: MeetingStage = 'draft') {
  const now = new Date()
  let session = createFeishuMeetingSession(now)
  session.draft.topic = '产品评审 [议题]<草稿>'
  session.draft.participantIds = ['demo-design', 'demo-qa']
  if (stage === 'draft') return session
  session = scheduleDemoMeeting(session, now).session
  for (const next of meetingStages.slice(2, meetingStages.indexOf(stage) + 1)) session = advanceDemoMeeting(session, next, now)
  return session
}

describe('meeting scene shared message presentation', () => {
  it('submits the shared action card and renders a literal, readable user message', () => {
    const session = fixture()
    const onChange = vi.fn()
    const { container, rerender } = render(<FeishuMeetingPage session={session} onChange={onChange} userProfile={userProfile} sidebarCollapsed={false} />)
    const formCard = screen.getByRole('article', { name: '安排一场飞书会议' })
    expect(formCard).toHaveAttribute('data-component-contract', 'message-action-card')
    expect(formCard.closest('.message-block--agent')).toHaveTextContent('会议专家团')
    fireEvent.click(screen.getByRole('button', { name: '发起会议并生成摘要' }))
    expect(onChange).toHaveBeenCalledOnce()
    const submitted = onChange.mock.calls[0][0]
    expect(submitted.stage).toBe('submitted')
    rerender(<FeishuMeetingPage session={submitted} onChange={onChange} userProfile={userProfile} sidebarCollapsed={false} />)
    const message = container.querySelector('.message-block--user')!
    expect(message).toHaveTextContent('产品评审 [议题]<草稿>')
    expect(message).toHaveTextContent('陈晨（设计部 · 设计师）、陈晨（质量部 · 测试工程师）')
    expect(message.querySelector('a, img')).toBeNull()
    expect(message.querySelector('.markdown-message')).not.toBeNull()
  })

  it('waits for delivery, discloses group evidence and previews only the summary through the shared attachment menu', () => {
    const onChange = vi.fn()
    const { container, rerender, unmount } = render(<FeishuMeetingPage session={fixture('transcribing')} onChange={onChange} userProfile={userProfile} sidebarCollapsed={false} />)
    expect(container.querySelector('[data-meeting-anchor="transcribing"] .message-bubble__status')).toHaveTextContent('等待中 · 演示')
    expect(screen.queryByRole('button', { name: /打开方式/ })).not.toBeInTheDocument()
    const session = fixture('complete')
    rerender(<FeishuMeetingPage session={session} onChange={onChange} userProfile={userProfile} sidebarCollapsed={false} />)
    const timeline = screen.getByLabelText('飞书会议消息时间线')
    expect(timeline.querySelectorAll('.message-block--user')).toHaveLength(1)
    expect(timeline.querySelectorAll('.message-attachments--agent')).toHaveLength(1)
    expect(timeline).not.toHaveTextContent(session.summary!.overview)
    expect(timeline).not.toHaveTextContent(session.minutes!.transcript[0].text)
    fireEvent.click(screen.getByRole('button', { name: '查看专家团协作记录' }))
    expect(timeline).toHaveTextContent('已整理会议概述与结论')
    expect(timeline).toHaveTextContent('已核对行动项、负责人及截止时间')
    expect(timeline).toHaveTextContent('已核对妙记来源与会议信息')
    fireEvent.click(screen.getByRole('button', { name: /打开方式 产品评审/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /预览文档/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(session.summary!.overview)
    expect(dialog).not.toHaveTextContent(session.minutes!.transcript[0].text)
    expect(within(dialog).getByRole('link', { name: '下载文档' })).toHaveAttribute('href', 'blob:meeting-summary')
    unmount()
    expect(revokeUrl).toHaveBeenCalledWith('blob:meeting-summary')
  })
})
