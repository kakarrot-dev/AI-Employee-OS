import React, { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Community, Download, NavArrowRight, Xmark } from 'iconoir-react'
import { Button } from 'react-aria-components'
import { ChatMessage, ChatContentBlock, MarkdownContent, MarkdownMessage, MessageActionCard, MessageAttachmentGroup } from '../../../src/renderer/src/components/message-ui'
import { Avatar, ClientModal, StatusLight } from '../../../src/renderer/src/components/client-ui'
import type { ChatContentView } from '../../../src/shared/chat-content-contract'
import {
  meetingContacts, meetingExpertGroup, meetingStages, meetingStageStatus, meetingSummaryFileName, meetingSummaryText, meetingTimeLabel, scheduleDemoMeeting,
  type FeishuMeetingSession, type MeetingDraft, type MeetingErrors, type MeetingStage
} from './feishu-meeting-demo'

interface Props {
  session: FeishuMeetingSession
  onChange: (session: FeishuMeetingSession) => void
  userProfile: { name: string; avatarUrl: string | null }
  sidebarCollapsed: boolean
}

function inlineMarkdown(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_\[\]<>#|]/g, '\\$&')
}

export function FeishuMeetingPage({ session, onChange, userProfile, sidebarCollapsed }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState<MeetingErrors>({})
  const [documentOpen, setDocumentOpen] = useState(false)
  const [documentUrl, setDocumentUrl] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef<HTMLDivElement>(null)
  const followLatestRef = useRef(true)
  const { draft, stage, meeting, minutes } = session
  const documentText = meetingSummaryText(session)
  const documentName = meetingSummaryFileName(session)
  const filteredContacts = meetingContacts.filter((person) => `${person.name} ${person.department}`.includes(query.trim()))
  const eventTime = (kind: string): string => {
    const event = session.events.find((item) => item.kind === kind)
    return event ? meetingTimeLabel(event.at) : ''
  }
  const userMessage = (kind: string, children: ReactNode): React.JSX.Element => <ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time={eventTime(kind)}>{children}</ChatMessage>
  const groupMessage = (kind: MeetingStage, children: ReactNode): React.JSX.Element => {
    const active = kind === stage && stage !== 'complete'
    const waiting = active && ['invited', 'started', 'recording', 'ended', 'recording-ready', 'transcribing'].includes(stage)
    return <ChatMessage source="agent" variant="timeline" name={meetingExpertGroup.name} initials="团" color="#c5b8e3" time={eventTime(kind)} status={<StatusLight state={waiting ? 'waiting' : active ? 'active' : 'success'} label={`${kind === 'complete' ? '已交付' : waiting ? '等待中' : active ? '处理中' : '已完成'} · 演示`} breathing={active && !waiting} />}>{children}</ChatMessage>
  }
  const memberName = (id: string): string => meetingExpertGroup.members.find((member) => member.id === id)!.name
  const updateDraft = (patch: Partial<MeetingDraft>): void => {
    onChange({ ...session, draft: { ...draft, ...patch } })
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))))
  }
  const togglePerson = (id: string): void => updateDraft({ participantIds: draft.participantIds.includes(id) ? draft.participantIds.filter((value) => value !== id) : [...draft.participantIds, id] })
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const result = scheduleDemoMeeting(session)
    setErrors(result.errors)
    if (Object.keys(result.errors).length) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    else onChange(result.session)
  }
  const locate = (id: string): void => {
    requestAnimationFrame(() => {
      const target = timelineRef.current?.querySelector<HTMLElement>(`[data-meeting-anchor="${id}"]`)
      target?.scrollIntoView({ block: 'center', behavior: 'auto' })
      target?.focus({ preventScroll: true })
    })
  }
  useEffect(() => {
    if (!documentText) { setDocumentUrl(''); return }
    const url = URL.createObjectURL(new Blob([documentText], { type: 'text/markdown;charset=utf-8' }))
    setDocumentUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [documentText])
  useEffect(() => {
    if (stage !== 'draft' && followLatestRef.current) latestRef.current?.scrollIntoView({ block: 'end' })
  }, [stage])

  const steps: Array<{ title: string; detail: string; begins: MeetingStage; anchor: string }> = [
    { title: '填写会议信息', detail: '主题、时间与参会人', begins: 'draft', anchor: 'setup' },
    { title: '预约会议与邀请', detail: '启用录制，发送参会信息', begins: 'submitted', anchor: stage === 'submitted' ? 'setup' : 'scheduled' },
    { title: '会议进行中', detail: '接收开始通知，确认录制', begins: 'started', anchor: 'started' },
    { title: '会议结束 · 等待录制', detail: '等待录制文件处理完成', begins: 'ended', anchor: 'ended' },
    { title: '关联妙记 · 等待转写', detail: '内容未就绪时自动重试', begins: 'recording-ready', anchor: 'recording-ready' },
    { title: '读取妙记内容', detail: '保留发言人与时间信息', begins: 'content-ready', anchor: 'content-ready' },
    { title: '专家团协作', detail: '整理结论、行动项及来源', begins: 'summarizing', anchor: 'summarizing' },
    { title: '交付摘要文档', detail: '统一交付，可预览与下载', begins: 'complete', anchor: 'complete' }
  ]
  const progress = steps.findLastIndex((step) => meetingStages.indexOf(stage) >= meetingStages.indexOf(step.begins))
  const status = meetingStageStatus[stage]
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
    complete: { title: '专家团已交付摘要文档', summary: '三位专家已根据本场飞书妙记完成整理和核对，统一交付摘要文档。', metrics: [{ label: '协作专家', value: String(meetingExpertGroup.members.length) }, { label: '完成核对', value: `${session.groupWork.filter((work) => ['summary-drafted', 'actions-reviewed', 'source-checked'].includes(work.id)).length}/3` }, { label: '交付文档', value: session.summary ? '1' : '0' }], detail: { label: '查看专家团协作记录', content: session.groupWork.filter((work) => ['summary-drafted', 'actions-reviewed', 'source-checked'].includes(work.id)).map((work) => `${memberName(work.expertId)}\n${work.title}`).join('\n\n') } }
  }

  const downloadDocument = (): void => {
    if (!documentUrl) return
    const link = document.createElement('a')
    link.href = documentUrl
    link.download = documentName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
  const requestText = meeting ? [
    '请安排飞书会议，并由会议专家团在会后生成摘要文档。', '',
    `- **会议主题**：${inlineMarkdown(meeting.topic)}`,
    `- **会议时间**：${meetingTimeLabel(meeting.start)} — ${meetingTimeLabel(meeting.end)}（北京时间）`,
    `- **参会人员**：${meeting.participants.map((person) => inlineMarkdown(`${person.name}（${person.department}）`)).join('、')}`,
    '- **办理设置**：自动录制、会后生成摘要（演示）'
  ].join('\n') : ''

  return <div className="workspace-page message-page feishu-scene">
    <div className={`conversation-workspace${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <div className="conversation-column">
        <div className="feishu-scene-banner"><span className="feishu-group-mark"><Community aria-hidden /></span><span><strong>{meetingExpertGroup.name}</strong><small>{meetingExpertGroup.members.length} 位专家协作 · 飞书妙记摘要</small></span><span className="feishu-demo-label">演示模式</span></div>
        <div className="message-scroll" aria-label="飞书会议消息时间线" ref={timelineRef} onScroll={(event) => { const node = event.currentTarget; followLatestRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100 }}>
          <div className="message-canvas">
            <div className="feishu-demo-notice">Web 0.1 本地演示：未连接飞书或 Agent 服务。演示时间已压缩，提交后约 30 秒自动走完流程，不等待表单中的实际会议时间。</div>
            <div className="date-divider"><span>会议消息时间线</span></div>
            <div tabIndex={-1} data-meeting-anchor="setup">
              {stage === 'draft' ? <ChatMessage source="agent" variant="timeline" surface="none" name={meetingExpertGroup.name} initials="团" color="#c5b8e3" time=""><MessageActionCard title="安排一场飞书会议" status="待填写 · 演示" tone="waiting" actions={<Button type="submit" form="feishu-meeting-form" className="button button--primary">发起会议并生成摘要<NavArrowRight aria-hidden /></Button>}>
                <p className="feishu-help">填写一次，由会议专家团安排会议、通知参会人，会后自动调取飞书妙记并交付摘要。</p>
                <form id="feishu-meeting-form" ref={formRef} className="feishu-meeting-form" onSubmit={submit} noValidate aria-label="飞书会议信息">
                  <label className="feishu-field" htmlFor="feishu-topic"><span>会议主题 <small>必填</small></span><input id="feishu-topic" name="topic" placeholder="例如：产品 v0.1 需求评审" maxLength={100} value={draft.topic} onChange={(event) => updateDraft({ topic: event.target.value })} aria-invalid={!!errors.topic} aria-describedby={errors.topic ? 'feishu-topic-error' : undefined} />{errors.topic && <small className="feishu-error" id="feishu-topic-error">{errors.topic}</small>}</label>
                  <div className="feishu-time-fields">
                    <label className="feishu-field" htmlFor="feishu-start"><span>开始时间</span><input id="feishu-start" name="start" type="datetime-local" value={draft.start} onChange={(event) => updateDraft({ start: event.target.value })} aria-invalid={!!errors.start} aria-describedby={errors.start ? 'feishu-start-error feishu-timezone' : 'feishu-timezone'} />{errors.start && <small className="feishu-error" id="feishu-start-error">{errors.start}</small>}</label>
                    <label className="feishu-field" htmlFor="feishu-end"><span>结束时间</span><input id="feishu-end" name="end" type="datetime-local" value={draft.end} onChange={(event) => updateDraft({ end: event.target.value })} aria-invalid={!!errors.end} aria-describedby={errors.end ? 'feishu-end-error feishu-timezone' : 'feishu-timezone'} />{errors.end && <small className="feishu-error" id="feishu-end-error">{errors.end}</small>}</label>
                  </div>
                  <p className="feishu-help" id="feishu-timezone">北京时间（UTC+8）· 未来 30 天内，单次不超过 24 小时</p>
                  <fieldset className="feishu-people" tabIndex={-1} aria-invalid={!!errors.participantIds} aria-describedby={errors.participantIds ? 'feishu-people-error' : undefined}>
                    <legend>选择参会人 <small>已选 {draft.participantIds.length} 人</small></legend>
                    <input type="search" aria-label="搜索参会人" placeholder="搜索姓名、部门或职位" value={query} onChange={(event) => setQuery(event.target.value)} />
                    {draft.participantIds.length > 0 && <div className="feishu-selected-people">{draft.participantIds.map((id) => { const person = meetingContacts.find((item) => item.id === id)!; return <button type="button" key={id} onClick={() => togglePerson(id)} aria-label={`移除 ${person.name} ${person.department}`}>{person.name}<small>{person.department.split(' · ')[0]}</small><Xmark aria-hidden /></button> })}</div>}
                    <div className="feishu-contact-options">{filteredContacts.map((person) => <label className={`feishu-contact-option${draft.participantIds.includes(person.id) ? ' is-selected' : ''}`} key={person.id}><input type="checkbox" checked={draft.participantIds.includes(person.id)} onChange={() => togglePerson(person.id)} /><Avatar label={person.name} initials={person.name.slice(0, 1)} color="#d9c5a6" size="small" /><span><strong>{person.name}</strong><small>{person.department}</small></span></label>)}{!filteredContacts.length && <p className="feishu-help">没有匹配的示例人员，请更换姓名或部门。</p>}</div>
                    {errors.participantIds && <small className="feishu-error" id="feishu-people-error">{errors.participantIds}</small>}
                  </fieldset>
                  <div className="feishu-auto-settings"><Check aria-hidden /><span><strong>自动录制 · 会后自动生成摘要</strong><small>本场景默认启用，会议结束后等待录制与妙记转写就绪。</small></span></div>
                  <small>演示通讯录 · 共 {meetingContacts.length} 人</small>
                </form>
              </MessageActionCard></ChatMessage> : meeting && userMessage('submitted', <MarkdownMessage>{requestText}</MarkdownMessage>)}
            </div>
            {session.events.filter((event) => event.kind !== 'submitted').map((event) => {
              const content = eventContent[event.kind]!
              return <div key={event.kind} tabIndex={-1} data-meeting-anchor={event.kind}>
                {groupMessage(event.kind, <ChatContentBlock variant={event.kind === 'complete' ? 'delivery' : 'timeline'} content={{ schemaVersion: 1, ...content }}>
                  {event.kind === 'complete' && session.summary && <MessageAttachmentGroup source="agent" embedded openMode="preview" attachments={[{ id: session.minutes!.id, name: documentName, detail: 'Markdown · 会议摘要 · 演示文档' }]} onOpen={() => setDocumentOpen(true)} onDownload={documentUrl ? downloadDocument : undefined} />}
                </ChatContentBlock>)}
              </div>
            })}
            <div ref={latestRef} />
          </div>
        </div>
        <footer className="feishu-next-action" aria-label="会议自动流程状态">
          <div role="status" aria-live="polite"><strong>{status.title}</strong><small>{status.detail}</small></div>
          {stage !== 'draft' && <div className="feishu-playback-status"><StatusLight state={stage === 'complete' ? 'success' : 'active'} label={stage === 'complete' ? '演示已完成' : '自动演示中'} /><Button className="button button--quiet" onPress={() => { followLatestRef.current = true; locate(session.events.at(-1)?.kind === 'submitted' ? 'setup' : session.events.at(-1)!.kind) }}>查看最新进度</Button></div>}
        </footer>
      </div>
      <aside className={`matter-sidebar feishu-progress${sidebarCollapsed ? ' is-collapsed' : ''}`} aria-label="会议流程" aria-hidden={sidebarCollapsed || undefined} inert={sidebarCollapsed}>
        <div className="matter-sidebar__header"><strong>会议流程</strong><small>{progress + 1} / {steps.length}</small></div>
        <ol>{steps.map((step, index) => <li key={step.begins}><button type="button" className={index === progress ? 'is-current' : ''} disabled={index > progress} aria-current={index === progress ? 'step' : undefined} onClick={() => locate(step.anchor)}><span className="feishu-step-number">{index < progress || stage === 'complete' ? <Check aria-hidden /> : index + 1}</span><span><strong>{step.title}</strong><small>{step.detail}</small></span></button></li>)}</ol>
        <section className="feishu-group-members" aria-label="专家团成员与分工"><h3>{meetingExpertGroup.name}<small>{meetingExpertGroup.members.length} 位专家</small></h3>{meetingExpertGroup.members.map((member) => { const lastWork = session.groupWork.filter((work) => work.expertId === member.id).at(-1); return <div className="feishu-group-member" key={member.id}><strong>{member.name}</strong><p>{member.id === 'meeting-planner' ? '筹备会议、关联妙记、核对来源' : member.id === 'meeting-recorder' ? '调取妙记、整理概述与会议结论' : '核对行动项、负责人及截止时间'}</p><small className={lastWork ? 'is-done' : ''}>{stage === 'summarizing' && member.id === 'meeting-recorder' ? '正在整理概述与会议结论' : (stage === 'summarizing' || stage === 'reviewing') && member.id === 'meeting-followup' ? '正在核对行动项' : stage === 'reviewing' && member.id === 'meeting-planner' ? '正在核对妙记来源' : lastWork ? lastWork.title : '等待协作'}</small></div> })}<p className="feishu-help">专家团统一交付 · 本地协作演示<br />切换会话后自动继续，刷新后重置。</p></section>
      </aside>
    </div>
    <ClientModal open={documentOpen} title={documentName} eyebrow="会议摘要 · 演示文档" onClose={() => setDocumentOpen(false)}>
      <div className="feishu-summary-document"><MarkdownContent>{documentText}</MarkdownContent></div>
      <div className="feishu-document-actions">{documentUrl && <a className="button button--primary" tabIndex={0} href={documentUrl} download={documentName}><Download aria-hidden />下载文档</a>}</div>
    </ClientModal>
  </div>
}
