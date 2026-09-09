import { useEffect, useState } from 'react'
import { Button } from 'react-aria-components'
import { Check, Download } from 'iconoir-react'
import { DeliveryMessage, TeamJoinedEvent } from '../../renderer/src/App'
import { ClientModal, DetailNote, DetailSectionHeader, StatusLight, type PersonIdentity } from '../../renderer/src/components/client-ui'
import { ChatContentBlock, ChatMessage, MarkdownContent } from '../../renderer/src/components/message-ui'
import { formatClientTimestamp } from '../../renderer/src/client-time'
import type { ConversationScene, ConversationScenes } from '../../renderer/src/conversation-scenes'
import type { ChatContentView } from '../../shared/chat-content-contract'
import type { TaskDetailView } from '../../shared/runtime-contract'
import type { WebClientBridge } from '../preview-bridge'
import { MeetingForm } from './MeetingForm'
import { meetingExpertGroup, meetingStages, meetingSummaryFileName, meetingSummaryText, meetingTimeLabel, type FeishuMeetingSession, type MeetingStage } from './demo'
import { MeetingStore, meetingRequest, meetingTask } from './store'

const identity: PersonIdentity = { name: meetingExpertGroup.name, initials: '团', color: '#c5b8e3' }

function progressEntries(session: FeishuMeetingSession, task: TaskDetailView): NonNullable<ConversationScene['timeline']> {
  const { meeting, minutes } = session
  const eventContent: Partial<Record<MeetingStage, Omit<ChatContentView, 'schemaVersion'>>> = {
    scheduled: { title: '飞书会议已预约', summary: '会议策划 Agent 已安排会议，并启用自动录制。', detail: { label: '查看预约信息', content: `会议编号：${meeting?.reservation?.meetingNo ?? ''}（演示）\n会议主题：${meeting?.topic ?? ''}\n自动录制：已启用` } },
    invited: { title: '参会邀请已发送', summary: `已向 ${meeting?.invitations?.length ?? 0} 位参会人发送会议主题、约定时间与入会信息。`, detail: { label: '查看邀请回执', content: meeting?.participants.map((person) => `${person.name}（${person.department}）：已发送（演示）`).join('\n\n') ?? '' } },
    started: { title: '会议已开始', summary: '已收到飞书会议开始通知，并将实际会议关联到本次预约。' },
    recording: { title: '自动录制已开启', summary: '已收到录制开始通知，会议进行中。' },
    ended: { title: '会议已结束', summary: '已收到飞书会议结束通知。录制文件仍在处理，暂不生成摘要。' },
    'recording-ready': { title: '录制文件已就绪', summary: '已收到录制就绪通知，会议策划 Agent 已获取并关联本场会议的妙记来源。', detail: { label: '查看妙记来源', content: minutes ? `${minutes.title}\n飞书妙记 · 示例来源\n会议时间：${meetingTimeLabel(minutes.recordedAt)}（北京时间）\n已关联本场会议` : '' } },
    transcribing: { title: '等待妙记转写', summary: '首次读取时，妙记转写尚未就绪；已安排自动重试。' },
    'content-ready': { title: '飞书妙记读取完成', summary: '自动重试成功，已读取包含发言人和时间信息的妙记内容，交由专家团处理。' },
    summarizing: { title: '会议专家团开始协作', summary: '会议纪要 Agent 整理概述与结论；行动项跟进 Agent 核对负责人、截止时间；会议策划 Agent 核对来源。' },
    reviewing: { title: '摘要初稿已整理，正在核对', summary: '会议纪要 Agent 已完成初稿，其余成员继续核对行动项与妙记来源。' },
  }

  return [{ id: 'team-joined', createdAt: session.events[0].at, content: <TeamJoinedEvent task={task} /> }, ...session.events.filter((event) => event.kind !== 'submitted' && event.kind !== 'complete').map((event) => {
    const current = event.kind === session.stage
    return { id: event.kind, createdAt: event.at, content: <ChatMessage source="agent" variant="timeline" name={identity.name} initials={identity.initials} color={identity.color} time={formatClientTimestamp(event.at)} status={<StatusLight state={current ? 'active' : 'success'} label={current ? '进行中 · 演示' : '已完成 · 演示'} breathing={current} />}><ChatContentBlock content={{ schemaVersion: 1, ...eventContent[event.kind]! }} /></ChatMessage> }
  })]
}

const steps: Array<{ title: string; description: string; start: MeetingStage; end: MeetingStage }> = [
  { title: '预约会议', description: '确认主题、时间与参会人，预约并启用自动录制。', start: 'submitted', end: 'scheduled' },
  { title: '发送参会邀请', description: '把会议信息发送给所选人员。', start: 'scheduled', end: 'invited' },
  { title: '会议进行与录制', description: '收到开始通知后关联实际会议，并等待录制与会议结束通知。', start: 'invited', end: 'ended' },
  { title: '等待录制就绪', description: '会议结束后继续等待录制文件处理完成。', start: 'ended', end: 'recording-ready' },
  { title: '读取飞书妙记', description: '关联本场妙记；转写尚未就绪时等待并自动重试。', start: 'recording-ready', end: 'content-ready' },
  { title: '专家团整理摘要', description: '会议纪要专家整理概述与结论，行动项专家核对分工。', start: 'content-ready', end: 'reviewing' },
  { title: '核对摘要文档', description: '三位专家核对来源、负责人和截止时间。', start: 'reviewing', end: 'complete' },
  { title: '交付摘要文档', description: '统一以会议专家团交付，可预览和下载摘要。', start: 'complete', end: 'complete' }
]

function MeetingDetails({ session }: { session: FeishuMeetingSession }): React.JSX.Element {
  const stageIndex = meetingStages.indexOf(session.stage)
  return <>
    <section><DetailSectionHeader title="会议办理流程" description="本地自动演示 · 八个步骤" meta="8 个步骤" /><div className="matter-progress-list">{steps.map((step) => {
      const done = stageIndex >= meetingStages.indexOf(step.end)
      const active = !done && stageIndex >= meetingStages.indexOf(step.start)
      const at = session.events.find((event) => event.kind === (done ? step.end : step.start))?.at
      return <div className={`matter-progress-item matter-progress-item--${done ? 'done' : active ? 'active' : 'pending'}`} key={step.title}><span className="matter-progress-item__marker">{done ? <Check aria-hidden /> : null}</span><div><div className="matter-progress-item__title"><strong>{step.title}</strong><time>{at ? formatClientTimestamp(at) : '待开始'}</time></div><p>{step.description}</p></div></div>
    })}</div></section>
    <DetailNote>飞书妙记{session.minutes ? `：${session.minutes.title}（示例）` : '将在录制就绪后关联'}。会议原文仅供摘要处理，消息与详情中不展示原文。</DetailNote>
  </>
}

function MeetingDelivery({ session, task, onOpen }: { session: FeishuMeetingSession; task: TaskDetailView; onOpen: () => void }): React.JSX.Element {
  const [preview, setPreview] = useState(false)
  const [url, setUrl] = useState('')
  const document = meetingSummaryText(session)
  const filename = meetingSummaryFileName(session)
  useEffect(() => {
    const value = URL.createObjectURL(new Blob([document], { type: 'text/markdown;charset=utf-8' }))
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [document])
  const download = (): void => {
    if (!url) return
    const anchor = window.document.createElement('a')
    anchor.href = url; anchor.download = filename
    window.document.body.append(anchor); anchor.click(); anchor.remove()
  }
  return <><DeliveryMessage task={task} supervisor={identity} onOpen={onOpen} onOpenArtifact={() => setPreview(true)} openMode="preview" onDownloadArtifact={download} />
    <ClientModal open={preview} title={filename} eyebrow="摘要 · 演示" size="medium" onClose={() => setPreview(false)}><div className="meeting-summary-preview"><MarkdownContent>{document}</MarkdownContent></div><div className="meeting-summary-actions"><Button className="button button--primary" onPress={download} isDisabled={!url}><Download aria-hidden />下载摘要</Button></div></ClientModal>
  </>
}

/** Explicit selection only. Free-text messages never select or mutate a scene. */
export function createMeetingScenes(bridge: WebClientBridge, store: MeetingStore): ConversationScenes {
  const drafts = new Map<string, string>()
  const snapshots = new WeakMap<FeishuMeetingSession, ConversationScene>()
  const canEnter = (name: string, kind: 'expert' | 'group'): boolean => kind === 'group' && name === meetingExpertGroup.name
  return {
    subscribe: store.subscribe, canEnter,
    getDraft: (id) => drafts.get(id) ?? '',
    setDraft: (id, value) => { if (value) drafts.set(id, value); else drafts.delete(id) },
    emptyDescription: '从通讯录选择专家团开始办事，也可以在此记录消息。Web 0.1 不自动识别办事意图。',
    enter: async (name, kind) => {
      if (!canEnter(name, kind)) return undefined
      const conversation = await bridge.conversation.create()
      store.create(conversation.id)
      return store.summary(conversation)
    },
    getSnapshot: (id) => {
      const session = store.get(id)
      if (!session) return undefined
      const cached = snapshots.get(session)
      if (cached) return cached
      const task = meetingTask(id, session)
      const scene: ConversationScene = {
        identity, task, messages: meetingRequest(id, session),
        setup: session.stage === 'draft' ? <MeetingForm key={id} id={id} session={session} store={store} /> : undefined,
        timeline: task ? progressEntries(session, task) : undefined,
        details: task ? <MeetingDetails session={session} /> : undefined,
        delivery: task?.delivery ? (onOpen) => <MeetingDelivery key={id} session={session} task={task} onOpen={onOpen} /> : undefined
      }
      snapshots.set(session, scene)
      return scene
    }
  }
}
