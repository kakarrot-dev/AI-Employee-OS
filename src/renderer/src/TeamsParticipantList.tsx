import type { TeamsParticipantConfirmation } from '../../shared/teams-contract'
import { DetailState } from './components/client-ui'

const labels: Record<TeamsParticipantConfirmation['state'], string> = { not_sent: '卡片未发送', sending: '正在发送卡片', awaiting_confirmation: '等待确认', confirmed: '已确认参加', declined: '已拒绝参加', delivery_unknown: '发送结果待核实' }
export function TeamsParticipantList({ participants }: { participants: TeamsParticipantConfirmation[] }): React.JSX.Element {
  return <table className="meeting-participants" aria-label="参会人员及卡片确认状态"><thead><tr><th scope="col">参会人</th><th scope="col">邮箱</th><th scope="col">确认状态</th></tr></thead><tbody>{participants.map(person => <tr key={person.userId}><th scope="row">{person.name || '姓名待核实'}</th><td>{person.email || '邮箱待核实'}</td><td><DetailState tone={person.state === 'confirmed' ? 'success' : person.state === 'declined' ? 'danger' : 'waiting'}>{labels[person.state]}</DetailState>{person.respondedAt && <small>{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(new Date(person.respondedAt))}</small>}</td></tr>)}</tbody></table>
}
