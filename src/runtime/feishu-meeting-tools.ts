import { FEISHU_MEETING_TOOL_IDS as ids } from '../shared/feishu-meeting-contract'
import type { ToolAction } from './domain'

export function bindMeetingParameters(toolId: string, parameters: Record<string, unknown>, actions: ToolAction[]): Record<string, unknown> {
  const verified = actions.filter((action) => action.state === 'succeeded' && action.resultVerified === true)
  if (toolId === ids.create) {
    if (actions.some((action) => action.toolVersionId === ids.create)) throw new Error('meeting_creation_already_attempted')
    const contacts = verified.filter((action) => action.toolVersionId === ids.search).flatMap((action) => Array.isArray(action.result?.items) ? action.result.items as Array<{ openId: string; name: string }> : [])
    const recipientNames = (parameters.recipientIds as string[]).map((id) => {
      const contact = contacts.find((item) => item.openId === id)
      if (!contact) throw new Error('meeting_recipient_not_from_search')
      return contact.name
    })
    return { ...parameters, recipientNames }
  }
  if (toolId === ids.send) {
    const creation = verified.find((action) => action.toolVersionId === ids.create && action.result?.reserveId === parameters.reserveId)
    const meeting = creation?.result
    if (!meeting || !Array.isArray(meeting.recipientIds) || !meeting.recipientIds.includes(parameters.recipientId)) throw new Error('meeting_invitation_not_bound')
    if (actions.some((action) => action.toolVersionId === ids.send && action.parameters.reserveId === parameters.reserveId && action.parameters.recipientId === parameters.recipientId)) throw new Error('meeting_invitation_already_attempted')
    const index = meeting.recipientIds.indexOf(parameters.recipientId)
    return { ...parameters, recipientName: Array.isArray(meeting.recipientNames) ? meeting.recipientNames[index] : parameters.recipientId, meeting }
  }
  return parameters
}

export function remainingMeetingTools(actions: ToolAction[]): string[] {
  if (actions.some((action) => ['pending', 'running', 'result_unknown'].includes(action.state))) return []
  const creation = actions.find((action) => action.toolVersionId === ids.create)
  if (!creation) return [...(actions.filter((action) => action.toolVersionId === ids.search).length < 10 ? [ids.search] : []), ids.create]
  if (creation.state !== 'succeeded' || !creation.resultVerified) return []
  const recipients = Array.isArray(creation.result?.recipientIds) ? creation.result.recipientIds : []
  return recipients.some((id) => !actions.some((action) => action.toolVersionId === ids.send && action.parameters.reserveId === creation.result?.reserveId && action.parameters.recipientId === id)) ? [ids.send] : []
}

export function meetingEvidenceIssue(actions: ToolAction[]): string | undefined {
  const creation = actions.find((action) => action.toolVersionId === ids.create && action.state === 'succeeded' && action.resultVerified && typeof action.result?.reserveId === 'string' && typeof action.result?.meetingNumber === 'string' && typeof action.result?.meetingUrl === 'string')
  if (!creation) return '会议尚未取得已核验的会议号和入会链接'
  if (!Array.isArray(creation.result?.recipientIds)) return '会议缺少已确认的邀请名单'
  const pending = creation.result.recipientIds.filter((id) => !actions.some((action) => action.toolVersionId === ids.send && action.state === 'succeeded' && action.resultVerified && action.result?.reserveId === creation.result?.reserveId && action.result?.recipientId === id && typeof action.result?.messageId === 'string'))
  return pending.length ? `会议已创建，但还有 ${pending.length} 位联系人的邀请未确认发送成功；不可重新创建会议或声称对方已接受` : undefined
}
