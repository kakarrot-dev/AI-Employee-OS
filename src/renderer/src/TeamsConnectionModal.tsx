import { useEffect, useState } from 'react'
import { ClientModal } from './components/client-ui'
import { type TeamsConnectionInput, type TeamsConnectionStatus } from '../../shared/teams-contract'
export function teamsError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error)
  if (code.includes('configuration_invalid')) return '请检查租户 ID、应用 ID、客户端密钥及组织者邮箱。'
  if (code.includes('permission_denied')) return 'Microsoft 拒绝访问，请检查应用权限、管理员同意和组织者账号。'
  if (code.includes('credential')) return '无法访问 macOS 钥匙串，请检查系统授权。'
  if (code.includes('authorization')) return 'Microsoft 凭据失效，请更新客户端密钥。'
  return '连接失败，请检查网络和 Microsoft 应用配置。'
}
export function TeamsConnectionModal({ open, status, onClose, onStatusChange }: { open: boolean; status: TeamsConnectionStatus; onClose(): void; onStatusChange(status: TeamsConnectionStatus): void }): React.JSX.Element {
  const [input, setInput] = useState<TeamsConnectionInput>({ tenantId: '', clientId: '', clientSecret: '', organizer: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [editing, setEditing] = useState(false)
  useEffect(() => { if (open) { setInput({ tenantId: status.tenantId ?? '', clientId: status.clientId ?? '', organizer: status.organizer ?? '', clientSecret: '' }); setEditing(status.state !== 'connected'); setError(undefined) } }, [open])
  async function perform(operation: () => Promise<TeamsConnectionStatus>): Promise<void> {
    setBusy(true); setError(undefined)
    try { const next = await operation(); onStatusChange(next); setInput(v => ({ ...v, clientSecret: '' })); setEditing(next.state !== 'connected') } catch (e) { setError(teamsError(e)) } finally { setBusy(false) }
  }
  return <ClientModal open={open} title="Microsoft Teams 连接" size="large" onClose={() => { if (!busy) onClose() }}><div className="connection-modal">
    <div className="connection-modal__hero"><div><h3>{status.state === 'connected' ? '已连接 Microsoft Teams' : '连接 Microsoft Teams'}</h3><p>查询企业通讯录，并由指定组织者创建 Teams 日历会议和参会邀请。</p></div></div>
    {!editing ? <><dl className="connection-facts"><div><dt>组织者</dt><dd>{status.organizer}</dd></div><div><dt>查找人员</dt><dd>{status.canSearch ? '可用' : '不可用'}</dd></div><div><dt>创建会议</dt><dd>{status.canCreate ? '已具备权限，实际创建以执行回执为准' : '需要补充权限或启用 Teams 日历'}</dd></div><div><dt>凭据存储</dt><dd>macOS 钥匙串</dd></div></dl>{status.message && <p>{status.message}</p>}<div className="connection-modal__actions"><button className="button button--quiet" disabled={busy} onClick={() => setEditing(true)}>更新凭据</button><button className="button button--quiet" disabled={busy} onClick={() => void perform(() => window.aiEmployeeOS.connection.getTeamsStatus())}>检查连接</button><button className="button button--quiet danger-action" disabled={busy} onClick={() => void perform(() => window.aiEmployeeOS.connection.disconnectTeams())}>断开连接</button></div></> : <form onSubmit={e => { e.preventDefault(); void perform(() => window.aiEmployeeOS.connection.connectTeams(input)) }}>
      <p>使用 Microsoft Entra 应用凭据。需要管理员同意 User.Read.All 和 Calendars.ReadWrite 应用权限；组织者需具备支持 Teams 会议的日历。</p>
      <div className="connection-form-fields">{([['tenantId','租户 ID'],['clientId','应用 ID'],['clientSecret','客户端密钥'],['organizer','组织者邮箱']] as const).map(([key,label]) => <label className="form-field" key={key}><span>{label}</span><input aria-label={`Teams ${label}`} type={key === 'clientSecret' ? 'password' : 'text'} autoComplete="off" disabled={busy} value={input[key]} onChange={e => setInput({ ...input, [key]: e.target.value })} /></label>)}</div>
      <p>凭据仅保存在本机钥匙串。会议创建会同时提交日历邀请，执行前会显示确认。</p><div className="connection-modal__actions"><button type="submit" className="button button--primary" disabled={busy || Object.values(input).some(v => !v.trim())}>{busy ? '正在验证' : '验证并连接'}</button></div></form>}
    {error && <p role="alert" className="provider-feedback is-error">{error}</p>}
  </div></ClientModal>
}
