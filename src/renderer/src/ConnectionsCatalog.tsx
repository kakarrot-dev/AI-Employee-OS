import { useEffect, useState } from 'react'
import { CheckCircle, Link, OpenNewWindow, ShieldCheck, WarningTriangle } from 'iconoir-react'
import { ClientModal, DetailNote, DetailPage, DetailSectionHeader, DetailState, DetailSummaryPanel, SummaryCard, SummaryCardGrid } from './components/client-ui'
import { FEISHU_REDIRECT_URI, type FeishuConnectionStatus } from '../../shared/connection-contract'
import githubIcon from './assets/connections/github.svg'
import feishuIcon from './assets/connections/feishu.svg'
import teamsIcon from './assets/connections/teams.svg'
import notionIcon from './assets/connections/notion.svg'
import dingtalkIcon from './assets/connections/dingtalk.svg'
import wecomIcon from './assets/connections/wecom.svg'
import wechatIcon from './assets/connections/wechat.svg'
import yuqueIcon from './assets/connections/yuque.svg'
import wpsIcon from './assets/connections/wps.svg'
import baiduNetdiskIcon from './assets/connections/baidu-netdisk.svg'
import giteeIcon from './assets/connections/gitee.svg'
import alibabaCloudIcon from './assets/connections/alibaba-cloud.svg'

export interface ConnectionApplication {
  id: string
  name: string
  description: string
  icon: string
}

interface ConnectionCategory {
  id: string
  name: string
  description: string
  applications: ConnectionApplication[]
}

export const FEISHU_CONNECTION_APPLICATION: ConnectionApplication = { id: 'feishu', name: '飞书', description: '当前支持知识库统计、新版文档搜索与只读提炼。', icon: feishuIcon }

export const connectionCategories: ConnectionCategory[] = [
  {
    id: 'collaboration',
    name: '协作沟通',
    description: '连接团队消息、组织协同与客户触达渠道。',
    applications: [
      FEISHU_CONNECTION_APPLICATION,
      { id: 'teams', name: 'Microsoft Teams', description: '团队消息、会议与协作空间。', icon: teamsIcon },
      { id: 'dingtalk', name: '钉钉', description: '组织通讯、消息、审批与协同办公。', icon: dingtalkIcon },
      { id: 'wecom', name: '企业微信', description: '企业内部协作与客户连接。', icon: wecomIcon },
      { id: 'wechat', name: '微信', description: '消息触达与客户沟通渠道。', icon: wechatIcon }
    ]
  },
  {
    id: 'knowledge',
    name: '知识与文件',
    description: '连接知识库、在线文档与企业文件空间。',
    applications: [
      { id: 'notion', name: 'Notion', description: '知识库、文档与工作流协作。', icon: notionIcon },
      { id: 'yuque', name: '语雀', description: '团队知识库、文档与结构化知识管理。', icon: yuqueIcon },
      { id: 'wps', name: 'WPS Office', description: '文档、表格、演示与云端协作。', icon: wpsIcon },
      { id: 'baidu-netdisk', name: '百度网盘', description: '云端文件存储、同步与共享。', icon: baiduNetdiskIcon }
    ]
  },
  {
    id: 'development',
    name: '研发与云服务',
    description: '连接代码协作平台与云端基础设施。',
    applications: [
      { id: 'github', name: 'GitHub', description: '代码仓库、Issue、Pull Request 与 CI 协作。', icon: githubIcon },
      { id: 'gitee', name: 'Gitee', description: '代码托管、协作开发与 DevOps。', icon: giteeIcon },
      { id: 'alibaba-cloud', name: '阿里云', description: '云计算资源、数据服务与企业基础设施。', icon: alibabaCloudIcon }
    ]
  }
]

export const connectionApplications = connectionCategories.flatMap((category) => category.applications)

export const EMPTY_FEISHU_STATUS: FeishuConnectionStatus = { provider: 'feishu', state: 'not_connected', checkedAt: '', scopes: [] }

function ApplicationLogo({ application }: { application: ConnectionApplication }): React.JSX.Element {
  return <span className="connection-logo" role="img" aria-label={`${application.name} 官方图标`}><img alt="" src={application.icon} /></span>
}

function feishuState(status: FeishuConnectionStatus, loading: boolean): { label: string; tone: 'success' | 'waiting' | 'danger' | 'muted' } {
  if (loading) return { label: '检查中', tone: 'waiting' }
  if (status.state === 'connected') return { label: '已连接', tone: 'success' }
  if (status.state === 'connecting') return { label: '授权中', tone: 'waiting' }
  if (status.state === 'reauthorization_required') return { label: '需授权', tone: 'waiting' }
  if (status.state === 'error') return { label: '连接异常', tone: 'danger' }
  return { label: '未连接', tone: 'muted' }
}

export function readableConnectionError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error)
  const legacyTokenError = code.match(/feishu_token_exchange_failed:([a-z0-9_.-]+)/i)?.[1]?.toLowerCase()
  if (code.includes('feishu_callback_server_unavailable')) return '本机端口 3000 无法监听，请关闭占用该端口的程序后重试。'
  if (code.includes('feishu_authorization_timeout')) return '飞书授权已超时。请确认重定向 URL 已添加并重新发起授权。'
  if (code.includes('feishu_authorization_cancelled')) return '已取消本次飞书授权，未保存任何新凭证。'
  if (code.includes('feishu_authorization_denied')) return '你取消了飞书授权，连接未发生变更。'
  if (code.includes('feishu_oauth_state_mismatch')) return '授权回调校验失败，请重新发起连接。'
  if (code.includes('feishu_offline_access_missing')) return '飞书未返回 refresh token。请在应用权限管理中开通 offline_access、发布版本后重试。'
  if (code.includes('feishu_required_scopes_missing')) return '飞书未授予知识库或文档只读权限。请在权限管理中添加 search:docs:read、docx:document:readonly、wiki:wiki:readonly，发布版本后重新授权。'
  if (code.includes('feishu_app_id_invalid')) return 'App ID 格式无效，应为 cli_ 开头的飞书应用 ID。'
  if (code.includes('feishu_app_secret_invalid')) return 'App Secret 格式无效，请重新复制。'
  if (code.includes('20029')) return '飞书重定向 URL 校验失败。请在开放平台“安全设置”中添加下方地址，保存后重试。'
  if (code.includes('feishu_token_invalid_client') || legacyTokenError === 'invalid_client') return 'App ID 与 App Secret 不匹配。请从当前飞书应用重新复制最新凭证后再试。'
  if (code.includes('feishu_token_invalid_grant') || legacyTokenError === 'invalid_grant' || legacyTokenError === '20003') return '本次授权码已过期或已被使用。请重新发起用户授权。'
  if (code.includes('feishu_token_network_failed')) return '无法访问飞书令牌服务。请检查网络后重新发起授权。'
  if (code.includes('feishu_token_service_unavailable')) return '飞书令牌服务暂时不可用，请稍后重新发起授权。'
  if (code.includes('feishu_token_exchange_failed')) {
    const providerCode = code.match(/provider_([a-z0-9_.-]+)/i)?.[1]
    return providerCode && providerCode !== 'unknown'
      ? `飞书拒绝了令牌交换（错误码 ${providerCode}）。请按该错误码检查应用配置后重试。`
      : '飞书拒绝了令牌交换。请重新发起授权；若仍失败，请检查飞书返回的错误码。'
  }
  if (code.includes('feishu_credential_store')) return '无法将飞书凭证写入 macOS 钥匙串，请检查系统权限。'
  return '飞书连接失败，请检查网络与应用配置后重试。'
}

function FeishuConnectionModal({ open, status, onClose, onStatusChange }: { open: boolean; status: FeishuConnectionStatus; onClose: () => void; onStatusChange: (status: FeishuConnectionStatus) => void }): React.JSX.Element {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [openingConsole, setOpeningConsole] = useState(false)
  const [redirectConfigured, setRedirectConfigured] = useState(false)
  const [feedback, setFeedback] = useState<string>()
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)

  useEffect(() => {
    if (!open) return
    setAppId(status.appId ?? '')
    setAppSecret('')
    setRedirectConfigured(false)
    setFeedback(status.state === 'error' || status.state === 'reauthorization_required' ? status.message : undefined)
    setConfirmingDisconnect(false)
  }, [open, status.appId])

  const connect = async (): Promise<void> => {
    setBusy(true)
    setFeedback(undefined)
    try {
      const value = await window.aiEmployeeOS.connection.connectFeishu({ appId, appSecret })
      onStatusChange(value)
      setAppSecret('')
    } catch (error) {
      setFeedback(readableConnectionError(error))
    } finally {
      setBusy(false)
    }
  }

  const openDeveloperConsole = async (): Promise<void> => {
    setOpeningConsole(true)
    setFeedback(undefined)
    try {
      await window.aiEmployeeOS.connection.openFeishuDeveloperConsole(appId)
    } catch (error) {
      setFeedback(readableConnectionError(error))
    } finally {
      setOpeningConsole(false)
    }
  }

  const cancelAuthorization = async (closeAfter = false): Promise<void> => {
    try {
      onStatusChange(await window.aiEmployeeOS.connection.cancelFeishuAuthorization())
      setFeedback('已取消本次飞书授权，未保存任何新凭证。')
    } catch (error) {
      setFeedback(readableConnectionError(error))
    } finally {
      setBusy(false)
      if (closeAfter) onClose()
    }
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true)
    setFeedback(undefined)
    try {
      onStatusChange(await window.aiEmployeeOS.connection.disconnectFeishu())
      setConfirmingDisconnect(false)
    } catch (error) {
      setFeedback(readableConnectionError(error))
    } finally {
      setBusy(false)
    }
  }

  const connected = status.state === 'connected'
  const reauthorizing = status.state === 'reauthorization_required'
  const closeModal = (): void => { if (busy) void cancelAuthorization(true); else onClose() }
  const validAppId = /^cli_[A-Za-z0-9_-]{4,124}$/.test(appId.trim())
  const readyToAuthorize = validAppId && (reauthorizing || appSecret.trim().length >= 8) && redirectConfigured
  return <ClientModal open={open} title="飞书连接" size="large" onClose={closeModal}>
    <div className="connection-modal">
      {connected ? <>
        <div className="connection-modal__hero is-connected"><CheckCircle aria-hidden /><div><h3>已连接飞书</h3><p>用户令牌有效；再次使用或检查状态时，客户端会按需自动刷新。</p></div></div>
        <dl className="connection-facts"><div><dt>App ID</dt><dd>{status.appId}</dd></div><div><dt>凭证存储</dt><dd>macOS 钥匙串</dd></div><div><dt>当前权限</dt><dd>{status.scopes.join('、') || '由飞书授权结果决定'}</dd></div></dl>
        <DetailNote icon={<ShieldCheck aria-hidden />}>App Secret 与用户令牌不会返回 Renderer，也不会写入客户端配置文件。</DetailNote>
        <DetailNote icon={<ShieldCheck aria-hidden />}>执行飞书资料任务时，命中文档的纯文本会作为受控 ToolResult 交给该 Agent 当前配置的模型服务；仅连接或检查状态不会读取文档。</DetailNote>
        {confirmingDisconnect && <div className="connection-disconnect-confirm" role="alert"><WarningTriangle aria-hidden /><span>断开后将从本机钥匙串删除飞书凭证，恢复连接需要重新授权。</span></div>}
        {feedback && <p className="provider-feedback is-error" role="alert">{feedback}</p>}
        <div className="connection-modal__actions">{confirmingDisconnect ? <><button type="button" className="button button--quiet" disabled={busy} onClick={() => setConfirmingDisconnect(false)}>取消</button><button type="button" className="button button--danger" disabled={busy} onClick={() => void disconnect()}>{busy ? '正在断开' : '确认断开'}</button></> : <button type="button" className="button button--quiet danger-action" onClick={() => setConfirmingDisconnect(true)}>断开连接</button>}</div>
      </> : <form onSubmit={(event) => { event.preventDefault(); void connect() }}>
        <div className="connection-modal__hero"><span className="connection-modal__logo"><img src={feishuIcon} alt="" /></span><div><h3>{status.state === 'reauthorization_required' ? '重新授权飞书' : '连接自建应用'}</h3><p>使用用户身份连接，只申请保持登录、知识库枚举、搜索和只读新版文档所需权限。</p></div></div>
        <ol className="connection-flow" aria-label="飞书连接流程">
          <li className="connection-flow__step">
            <span className="connection-flow__index">1</span>
            <div><h4>填写应用凭证</h4><p>从飞书开放平台“凭证与基础信息”复制，仅在完成授权后写入 macOS 钥匙串。</p></div>
          </li>
          <li className="connection-flow__content connection-form-fields">
            <label className="form-field"><span>App ID</span><input value={appId} autoComplete="off" aria-label="飞书 App ID" placeholder="cli_xxxxxxxxxxxxxxxx" disabled={busy} onChange={(event) => { setAppId(event.target.value); setRedirectConfigured(false); setFeedback(undefined) }} /></label>
            {reauthorizing
              ? <DetailNote icon={<ShieldCheck aria-hidden />}>复用 macOS 钥匙串中已保存的 App Secret，不返回界面、不写入日志。</DetailNote>
              : <label className="form-field"><span>App Secret</span><input type="password" value={appSecret} autoComplete="off" aria-label="飞书 App Secret" placeholder="仅保存到 macOS 钥匙串" disabled={busy} onChange={(event) => { setAppSecret(event.target.value); setFeedback(undefined) }} /></label>}
          </li>
          <li className="connection-flow__step">
            <span className="connection-flow__index">2</span>
            <div><h4>配置权限与重定向 URL</h4><p>在“权限管理”添加 search:docs:read、docx:document:readonly、wiki:wiki:readonly 并发布版本；再到“安全设置 → 重定向 URL”添加完全一致的地址。</p></div>
          </li>
          <li className="connection-flow__content connection-setup-list">
            <code>{FEISHU_REDIRECT_URI}</code>
            <button type="button" className="button button--quiet" disabled={busy || openingConsole || !validAppId} onClick={() => void openDeveloperConsole()}><OpenNewWindow aria-hidden />{openingConsole ? '正在打开' : '打开安全设置'}</button>
            <label className="connection-redirect-confirm"><input type="checkbox" checked={redirectConfigured} disabled={busy} onChange={(event) => { setRedirectConfigured(event.target.checked); setFeedback(undefined) }} /><span>我已添加三个只读权限、发布版本，并保存上述重定向 URL</span></label>
          </li>
          <li className="connection-flow__step">
            <span className="connection-flow__index">3</span>
            <div><h4>完成用户授权</h4><p>系统浏览器授权成功后，客户端自动校验回调、保存令牌并刷新为“已连接”。</p></div>
          </li>
        </ol>
        <div className="connection-setup-list connection-setup-list--scope">
          <p><strong>当前申请权限</strong><span>offline_access、search:docs:read、docx:document:readonly、wiki:wiki:readonly；不申请消息、文档写入、日历或通讯录权限。</span></p>
          <p><strong>数据使用</strong><span>只有正式任务执行只读 Tool 时，知识库统计结果或命中文档纯文本才会交给该 Agent 当前配置的模型服务分析。</span></p>
        </div>
        <DetailNote icon={<ShieldCheck aria-hidden />}>{busy ? '正在等待浏览器回调。若浏览器仍显示错误码 20029，请取消授权，返回第 2 步检查地址。' : '客户端使用 OAuth state 校验一次性回调，并以 App Secret 完成令牌交换；关闭弹窗或点击取消会终止本次授权。'}</DetailNote>
        {feedback && <p className="provider-feedback is-error" role="alert">{feedback}</p>}
        <div className="connection-modal__actions"><button type="button" className="button button--quiet" onClick={() => { if (busy) void cancelAuthorization(); else onClose() }}>{busy ? '取消授权' : '取消'}</button><button type="submit" className="button button--primary" disabled={busy || !readyToAuthorize}><OpenNewWindow aria-hidden />{busy ? '等待飞书授权' : '开始用户授权'}</button></div>
      </form>}
    </div>
  </ClientModal>
}

export function ConnectionsCatalog({ feishuStatus, loading, modalOpen, onModalOpenChange, onStatusChange }: { feishuStatus: FeishuConnectionStatus; loading: boolean; modalOpen: boolean; onModalOpenChange: (open: boolean) => void; onStatusChange: (status: FeishuConnectionStatus) => void }): React.JSX.Element {
  const currentState = feishuState(feishuStatus, loading)
  const connectedCount = feishuStatus.state === 'connected' ? 1 : 0
  return <><DetailPage className="connections-page" width="wide">
    <section className="recruitment-catalog connections-catalog" aria-label="连接" data-source="bridge">
      <DetailSummaryPanel
        icon={<Link aria-hidden />}
        title="外部系统与应用"
        description="飞书已支持安全授权与按需自动续期；其他应用仍为待接入目录。"
        metrics={[
          { label: '应用总数', value: connectionApplications.length },
          { label: '应用类型', value: connectionCategories.length },
          { label: '已连接', value: connectedCount }
        ]}
        tone={connectedCount ? 'success' : 'muted'}
      />
      <div className="recruitment-catalog__categories">
        {connectionCategories.map((category) => <section className="recruitment-category" aria-label={category.name} key={category.id}>
          <DetailSectionHeader title={category.name} description={category.description} meta={`${category.applications.length} 个`} />
          <SummaryCardGrid emptyMessage="暂无已连接应用" label={`${category.name}应用`}>
            {category.applications.map((application) => {
              const isFeishu = application.id === 'feishu'
              const appState = isFeishu ? currentState : { label: '未连接', tone: 'muted' as const }
              return <div className={`recruitment-card connection-card${isFeishu ? ' connection-card--available' : ''}`} role="listitem" key={application.id}>
                <SummaryCard leading={<ApplicationLogo application={application} />} title={application.name} description={application.description} tone={isFeishu && feishuStatus.state === 'connected' ? 'success' : 'muted'} trailing={<div className="connection-card__trailing"><DetailState tone={appState.tone}>{appState.label}</DetailState>{isFeishu && <button type="button" className="connection-card__action" disabled={loading} onClick={() => onModalOpenChange(true)}>{feishuStatus.state === 'connected' ? '管理' : feishuStatus.state === 'reauthorization_required' ? '重新授权' : '连接'}</button>}</div>} />
              </div>
            })}
          </SummaryCardGrid>
        </section>)}
      </div>
    </section>
  </DetailPage><FeishuConnectionModal open={modalOpen} status={feishuStatus} onClose={() => onModalOpenChange(false)} onStatusChange={onStatusChange} /></>
}
