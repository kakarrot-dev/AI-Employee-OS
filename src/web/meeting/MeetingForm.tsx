import { useRef, useState, type FormEvent } from 'react'
import { Check, NavArrowRight, Xmark } from 'iconoir-react'
import { Button } from 'react-aria-components'
import { ChatMessage, MessageActionCard } from '../../renderer/src/components/message-ui'
import { Avatar } from '../../renderer/src/components/client-ui'
import { meetingContacts, meetingExpertGroup, type FeishuMeetingSession, type MeetingDraft, type MeetingErrors } from './demo'
import type { MeetingStore } from './store'

export function MeetingForm({ id, session, store }: { id: string; session: FeishuMeetingSession; store: MeetingStore }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [errors, setErrors] = useState<MeetingErrors>({})
  const formRef = useRef<HTMLFormElement>(null)
  const { draft } = session
  const filteredContacts = meetingContacts.filter((person) => `${person.name} ${person.department}`.includes(query.trim()))
  const updateDraft = (patch: Partial<MeetingDraft>): void => {
    store.updateDraft(id, patch)
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))))
  }
  const togglePerson = (personId: string): void => updateDraft({ participantIds: draft.participantIds.includes(personId) ? draft.participantIds.filter((value) => value !== personId) : [...draft.participantIds, personId] })
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const errors = store.submit(id)
    setErrors(errors)
    if (Object.keys(errors).length) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }
  return <div className="meeting-scene-form"><ChatMessage source="agent" variant="timeline" surface="none" name={meetingExpertGroup.name} initials="团" color="#c5b8e3" time=""><MessageActionCard title="安排一场飞书会议" status="待填写 · 演示" tone="waiting" actions={<Button type="submit" form="feishu-meeting-form" className="button button--primary">发起会议并生成摘要<NavArrowRight aria-hidden /></Button>}>
                <p className="feishu-help">填写一次，自动演示预约、邀请、会议、妙记转写与摘要交付。约 30 秒走完整个演示，不等待实际会议时间。</p>
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
              </MessageActionCard></ChatMessage></div>
}
