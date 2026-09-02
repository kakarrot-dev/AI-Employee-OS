import { useEffect, useMemo, useState } from 'react'
import { Brain, Check, Coins, Community, Database, EditPencil, Group, HalfMoon, InfoCircle, NavArrowRight, Refresh, Settings, ShieldCheck, SunLight } from 'iconoir-react'
import type { ProviderStatus, RuntimeStatus } from '../../shared/runtime-contract'
import type { MemoryHealthView, MemoryQueueItemView, MemoryViewModel } from '../../shared/memory-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { DEFAULT_SUPERVISOR_CONFIG, SUPERVISOR_FIELD_LIMITS, validateSupervisorConfig, type SupervisorConfigInput, type SupervisorConfigIssue } from '../../shared/supervisor-contract'
import { Avatar, ClientModal, DetailPage, SettingRow, SettingsBlock, StatusLight, SummaryList, SummaryListItem, type ClientIcon } from './components/client-ui'
import { supervisorIdentity } from './employee-avatar'
import { MemoryModule } from './MemoryModule'

export type SystemSectionId = 'profile' | 'general' | 'supervisor' | 'models' | 'resources' | 'memory' | 'usage' | 'about'
export type ThemeMode = 'system' | 'light' | 'dark'
export interface ClientProfile { name: string; role: string; description: string; avatarUrl: string | null }

export const systemSections: Array<{ id: SystemSectionId; label: string; icon: ClientIcon; description: string }> = [
  { id: 'profile', label: '个人资料', icon: Group, description: '管理当前 macOS 客户端中的本地身份信息。' },
  { id: 'general', label: '通用', icon: Settings, description: '设置客户端外观、启动行为与本地通知。' },
  { id: 'supervisor', label: '总管', icon: Community, description: '设置总管的身份、提示词、模型与记忆。' },
  { id: 'models', label: '模型服务', icon: Brain, description: '配置模型连接并核对实际调用结果。' },
  { id: 'resources', label: '资源与权限', icon: ShieldCheck, description: '查看 Runtime 的默认授权边界与资源健康状态。' },
  { id: 'memory', label: '记忆与存储', icon: Database, description: '查看、修改和治理本地记忆。' },
  { id: 'usage', label: '用量与预算', icon: Coins, description: '查看 Provider 已返回的真实用量与预算能力。' },
  { id: 'about', label: '关于与诊断', icon: InfoCircle, description: '查看版本、Runtime 状态与本地诊断边界。' }
]

function clientStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage || undefined
  } catch {
    return undefined
  }
}

function readTheme(): ThemeMode {
  const value = clientStorage()?.getItem('ai-employee-os.theme')
  return value === 'light' || value === 'dark' ? value : 'system'
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  const value = clientStorage()?.getItem(key)
  return value === null || value === undefined ? fallback : value !== 'false'
}

function applyTheme(theme: ThemeMode): void {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  clientStorage()?.setItem('ai-employee-os.theme', theme)
}

export function readClientProfile(): ClientProfile {
  const storage = clientStorage()
  return {
    name: storage?.getItem('ai-employee-os.profile.name') ?? '本地用户',
    role: storage?.getItem('ai-employee-os.profile.role') ?? '',
    description: storage?.getItem('ai-employee-os.profile.description') ?? '',
    avatarUrl: storage?.getItem('ai-employee-os.profile.avatarUrl') ?? null
  }
}

function Intro({ section, supervisor }: { section: SystemSectionId; supervisor: SupervisorConfigInput }): React.JSX.Element {
  const definition = systemSections.find((item) => item.id === section) ?? systemSections[0]
  const Icon = definition.icon
  const identity = supervisorIdentity(supervisor)
  return <section className="settings-intro"><span>{section === 'supervisor' ? <Avatar label={identity.name} initials={identity.initials} color={identity.color} size="medium" src={identity.avatarSrc} /> : <Icon aria-hidden width={24} height={24} />}</span><div><h2>{section === 'supervisor' ? identity.name : definition.label}</h2><p>{definition.description}</p></div></section>
}

function SupervisorFieldFeedback({ value, issue, min, max }: { value: string; issue?: SupervisorConfigIssue; min: number; max: number }): React.JSX.Element {
  return <small className={`form-field__feedback${issue ? ' is-error' : ''}`} role={issue ? 'alert' : undefined}><span>{issue?.message ?? `${min}-${max} 个字符`}</span><span>{[...value.trim()].length}/{max}</span></small>
}

function SupervisorSettings({ configuration, providerStatus, onChange }: { configuration: SupervisorConfigInput; providerStatus: ProviderStatus; onChange: (configuration: SupervisorConfigInput) => void }): React.JSX.Element {
  const [draft, setDraft] = useState<SupervisorConfigInput>(configuration)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [touched, setTouched] = useState<Set<keyof SupervisorConfigInput>>(new Set())
  useEffect(() => { setDraft(configuration) }, [configuration])
  const issues = useMemo(() => validateSupervisorConfig(draft), [draft])
  const issueFor = (field: keyof SupervisorConfigInput): SupervisorConfigIssue | undefined => touched.has(field) ? issues.find((issue) => issue.field === field) : undefined
  const updateDraft = <K extends keyof SupervisorConfigInput>(field: K, value: SupervisorConfigInput[K]): void => {
    setDraft((current) => ({ ...current, [field]: value }))
    setTouched((current) => new Set(current).add(field))
    setSaveState('idle')
  }
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateDraft('avatarDataUrl', typeof reader.result === 'string' ? reader.result : undefined)
    reader.readAsDataURL(file)
  }
  const save = async (): Promise<void> => {
    setTouched(new Set(['name', 'avatarDataUrl', 'systemPrompt', 'modelId', 'memoryScopes']))
    if (issues.length) { setSaveState('error'); return }
    setSaving(true); setSaveState('idle')
    try {
      const value = await window.aiEmployeeOS.supervisor.update(draft)
      const next = { name: value.name, avatarDataUrl: value.avatarDataUrl, systemPrompt: value.systemPrompt, modelId: value.modelId, memoryScopes: [...value.memoryScopes] }
      setDraft(next); onChange(next); setSaveState('saved')
    } catch { setSaveState('error') } finally { setSaving(false) }
  }
  const identity = supervisorIdentity(draft)
  return <div className="supervisor-settings-form">
    <SettingsBlock title="身份" description="用于对话、进度和验收记录中的总管身份。"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传总管头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={identity.name} initials={identity.initials} color={identity.color} size="large" src={identity.avatarSrc} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label><small>PNG、JPEG 或 WebP</small></div><label className="form-field"><span>名称</span><input value={draft.name} maxLength={SUPERVISOR_FIELD_LIMITS.name.max} aria-label="总管名称" aria-invalid={Boolean(issueFor('name'))} onChange={(event) => updateDraft('name', event.target.value)} /><SupervisorFieldFeedback value={draft.name} issue={issueFor('name')} {...SUPERVISOR_FIELD_LIMITS.name} /></label></div></SettingsBlock>
    <SettingsBlock title="System Prompt" description="定义总管的沟通方式、任务拆解偏好和验收侧重点。平台权限与安全规则始终优先。"><label className="form-field form-field--prompt"><span>系统提示词</span><textarea rows={10} value={draft.systemPrompt} maxLength={SUPERVISOR_FIELD_LIMITS.systemPrompt.max} aria-label="总管 System Prompt" aria-invalid={Boolean(issueFor('systemPrompt'))} onChange={(event) => updateDraft('systemPrompt', event.target.value)} /><SupervisorFieldFeedback value={draft.systemPrompt} issue={issueFor('systemPrompt')} {...SUPERVISOR_FIELD_LIMITS.systemPrompt} /></label><div className="boundary-note"><ShieldCheck aria-hidden width={17} height={17} /><span>任务路由、权限校验和完成证据由 Runtime 保护，System Prompt 不能覆盖这些规则。</span></div></SettingsBlock>
    <SettingsBlock title="模型" description="用于意图判断、直接回答和员工结果验收。"><div className="settings-selection-grid">{(['deepseek-v4-pro', 'claude-sonnet-4.6'] as const).map((modelId) => { const model = providerStatus.models.find((item) => item.modelId === modelId); return <button type="button" key={modelId} className={`selection-card${draft.modelId === modelId ? ' is-selected' : ''}`} onClick={() => updateDraft('modelId', modelId)}><Brain aria-hidden width={19} height={19} /><span><strong>{modelId}</strong><small>{model?.verification === 'verified' ? '当前可用' : '需要配置对应模型服务'}</small></span>{draft.modelId === modelId && <Check aria-hidden width={18} height={18} />}</button> })}</div></SettingsBlock>
    <SettingsBlock title="记忆" description="只读取用户已确认的全局记忆，不自动扩大任务、文件或 Tool 权限。"><div className="choice-stack"><label><input type="checkbox" aria-label="读取全局记忆" checked={draft.memoryScopes.includes('global')} onChange={(event) => updateDraft('memoryScopes', event.target.checked ? ['global'] : [])} /><span><strong>读取全局记忆</strong><small>在对话路由与结果验收时使用已治理的偏好和规则</small></span></label></div></SettingsBlock>
    <div className="settings-save-row"><span className={saveState === 'error' ? 'is-error' : ''} role={saveState === 'error' ? 'alert' : undefined}>{saveState === 'saved' ? '设置已保存并会用于下一次总管调用' : saveState === 'error' ? issues[0]?.message ?? '保存失败，请重试' : '修改将在保存后生效'}</span><button type="button" className="button button--primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中' : '保存设置'}</button></div>
  </div>
}

const POE_MODEL_COPY = {
  'claude-sonnet-4.6': '文本 · Responses API',
  'gpt-image-2': '图像 · Chat Completions API',
  'seedance-2.0': '视频 · Chat Completions API'
} as const

function providerErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('authentication_failed')) return 'API Key 无效或已失效。'
  if (code.includes('insufficient_balance')) return 'Poe Points 不足，无法完成验证。'
  if (code.includes('model_not_found')) return '当前账号无法调用该模型。'
  if (code.includes('rate_limited')) return '请求过于频繁，请稍后重试。'
  if (code.includes('credential_store_denied')) return '系统钥匙串拒绝保存，请检查 macOS 权限。'
  if (code.includes('credential_store_timeout')) return '保存 API Key 超时，请稍后重试。'
  if (code.includes('credential_store_failed') || code.includes('credential_invalid')) return 'API Key 保存失败，请重新输入后重试。'
  return '连接失败，请检查 API Key 与网络后重试。'
}

function ProviderSettings({ status, onStatusChange }: { status: ProviderStatus; onStatusChange: (status: ProviderStatus) => void }): React.JSX.Element {
  const [poeCredential, setPoeCredential] = useState('')
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState<string>()
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string }>()
  const poeConfigured = status.credentialStatus.poe === 'configured'
  const savePoe = async (): Promise<void> => {
    if (poeCredential.trim().length < 8) { setFeedback({ tone: 'error', text: '请输入有效的 Poe API Key。' }); return }
    setSaving(true); setFeedback(undefined)
    try {
      onStatusChange(await window.aiEmployeeOS.provider.configurePoe(poeCredential))
      setPoeCredential('')
      setFeedback({ tone: 'success', text: 'Poe 连接已保存，请分别验证需要使用的模型。' })
    } catch (error) { setFeedback({ tone: 'error', text: providerErrorMessage(error) }) } finally { setSaving(false) }
  }
  const verify = async (modelId: keyof typeof POE_MODEL_COPY): Promise<void> => {
    setVerifying(modelId); setFeedback(undefined)
    try {
      onStatusChange(await window.aiEmployeeOS.provider.verifyPoeModel(modelId))
      setFeedback({ tone: 'success', text: `${modelId} 已通过真实调用验证。` })
    } catch (error) { setFeedback({ tone: 'error', text: providerErrorMessage(error) }) } finally { setVerifying(undefined) }
  }
  const row = (model: ProviderStatus['models'][number]): React.JSX.Element => {
    const configured = status.credentialStatus[model.provider] === 'configured'
    const verified = model.verification === 'verified'
    return <div className="provider-row" key={model.modelId}><span><strong>{model.modelId}</strong><small>{model.provider === 'poe' ? POE_MODEL_COPY[model.modelId as keyof typeof POE_MODEL_COPY] : '文本 · Responses API'}</small></span><StatusLight state={verified ? 'success' : 'waiting'} label={verified ? '已验证' : configured ? '待验证' : '待配置'} breathing={configured && !verified} />{model.provider === 'poe' && <button type="button" className="button button--quiet provider-row__action" aria-label={`验证 ${model.modelId}`} disabled={!poeConfigured || Boolean(verifying)} onClick={() => void verify(model.modelId as keyof typeof POE_MODEL_COPY)}>{verifying === model.modelId ? '验证中' : '验证'}</button>}</div>
  }
  return <>
    <SettingsBlock title="DeepSeek">{status.models.filter((model) => model.provider === 'deepseek').map(row)}</SettingsBlock>
    <SettingsBlock title="Poe" description="一个 API Key 连接文本、图像和视频模型；模型验证互相独立。"><div className="provider-credential-panel"><label className="form-field provider-credential-field"><span>Poe API Key</span><div className="provider-credential-control"><input type="password" value={poeCredential} autoComplete="off" aria-label="Poe API Key" placeholder={poeConfigured ? '输入新 Key 可替换当前连接' : '输入 Poe API Key'} onChange={(event) => { setPoeCredential(event.target.value); setFeedback(undefined) }} /><button type="button" className="button button--primary" disabled={saving || poeCredential.trim().length < 8} onClick={() => void savePoe()}>{saving ? '保存中' : '保存连接'}</button></div></label><p>验证会向对应模型发起一次真实请求；图像和视频请求可能消耗较多 Poe Points。</p>{feedback && <p className={`provider-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}</div>{status.models.filter((model) => model.provider === 'poe').map(row)}</SettingsBlock>
  </>
}

export function SystemModule({ section, providerStatus, runtimeStatus, resourceCatalog, supervisor = { ...DEFAULT_SUPERVISOR_CONFIG, memoryScopes: [...DEFAULT_SUPERVISOR_CONFIG.memoryScopes] }, onReconnect, onProbeResources, onProfileChange, onSupervisorChange, onProviderStatusChange }: { section: SystemSectionId; providerStatus: ProviderStatus; runtimeStatus: RuntimeStatus; resourceCatalog?: ResourceCatalogView; supervisor?: SupervisorConfigInput; onReconnect: () => Promise<void>; onProbeResources?: () => Promise<void>; onProfileChange?: (profile: ClientProfile) => void; onSupervisorChange?: (configuration: SupervisorConfigInput) => void; onProviderStatusChange?: (status: ProviderStatus) => void }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [profile, setProfile] = useState(readClientProfile)
  const [restoreSession, setRestoreSession] = useState(() => readBooleanPreference('ai-employee-os.restore-session', true))
  const [allowNotifications, setAllowNotifications] = useState(() => readBooleanPreference('ai-employee-os.allow-notifications', true))
  const [detailView, setDetailView] = useState<'memory' | 'about' | null>(null)
  const [memories, setMemories] = useState<MemoryViewModel[]>([])
  const [memoryQueue, setMemoryQueue] = useState<MemoryQueueItemView[]>([])
  const [memoryHealth, setMemoryHealth] = useState<MemoryHealthView>()
  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => {
    if (section !== 'memory') return
    void Promise.all([window.aiEmployeeOS.memory.list(), window.aiEmployeeOS.memory.queue(), window.aiEmployeeOS.memory.status()]).then(([items, queue, health]) => { setMemories(items); setMemoryQueue(queue); setMemoryHealth(health) }).catch(() => undefined)
  }, [section])
  const updateProfile = <K extends keyof ClientProfile>(key: K, value: ClientProfile[K]): void => {
    const next = { ...profile, [key]: value }
    setProfile(next)
    if (value === null) clientStorage()?.removeItem(`ai-employee-os.profile.${key}`)
    else clientStorage()?.setItem(`ai-employee-os.profile.${key}`, String(value))
    onProfileChange?.(next)
  }
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateProfile('avatarUrl', typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }
  const updatePreference = (key: 'ai-employee-os.restore-session' | 'ai-employee-os.allow-notifications', value: boolean): void => {
    clientStorage()?.setItem(key, String(value))
    if (key === 'ai-employee-os.restore-session') setRestoreSession(value)
    else setAllowNotifications(value)
  }

  return <><DetailPage className="system-page"><Intro section={section} supervisor={supervisor} />
    {section === 'profile' && <><SettingsBlock title="个人身份" description="这是个人用户资料，不属于总管或任何 Agent 员工。"><div><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传个人头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={profile.name} initials={profile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="large" src={profile.avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label></div><label className="form-field"><span>显示名称</span><input value={profile.name} onChange={(event) => updateProfile('name', event.target.value)} /></label><label className="form-field"><span>身份说明</span><input value={profile.role} onChange={(event) => updateProfile('role', event.target.value)} placeholder="例如：产品经理" /></label><label className="form-field"><span>个人简介</span><textarea rows={4} value={profile.description} onChange={(event) => updateProfile('description', event.target.value)} placeholder="补充你的工作方向与协作偏好。" /></label></div></SettingsBlock><SettingsBlock title="资料范围"><SettingRow title="本地个人资料" description="只用于当前客户端的身份展示，不会创建 Agent 员工"><StatusLight state="success" label="本机" /></SettingRow></SettingsBlock></>}
    {section === 'general' && <><SettingsBlock title="外观" description="主题变化会立即应用到整个客户端。"><div className="theme-choice">{([['system', Settings, '跟随系统'], ['light', SunLight, '浅色'], ['dark', HalfMoon, '深色']] as const).map(([id, Icon, label]) => <button type="button" key={id} className={theme === id ? 'is-active' : ''} onClick={() => setTheme(id)}><Icon aria-hidden width={20} height={20} /><span>{label}</span>{theme === id && <Check aria-hidden width={17} height={17} />}</button>)}</div></SettingsBlock><SettingsBlock title="启动"><SettingRow title="启动时恢复上次会话" description="保留最近一次会话选择，消息事实仍由 Runtime 持久化"><input type="checkbox" checked={restoreSession} aria-label="启动时恢复上次会话" onChange={(event) => updatePreference('ai-employee-os.restore-session', event.target.checked)} /></SettingRow><SettingRow title="允许 macOS 通知" description="保存本地提醒偏好；通知事件接入后按此设置生效"><input type="checkbox" checked={allowNotifications} aria-label="允许 macOS 通知" onChange={(event) => updatePreference('ai-employee-os.allow-notifications', event.target.checked)} /></SettingRow></SettingsBlock></>}
    {section === 'supervisor' && <SupervisorSettings configuration={supervisor} providerStatus={providerStatus} onChange={(value) => onSupervisorChange?.(value)} />}
    {section === 'models' && <ProviderSettings status={providerStatus} onStatusChange={(value) => onProviderStatusChange?.(value)} />}
    {section === 'resources' && <><SettingsBlock title="默认授权策略" description="运行中不能静默扩大已冻结的权限范围。"><SettingRow title="已授权 Tool" description="在事项冻结的 Tool、参数 Schema 与目录范围内自动执行"><StatusLight state="success" label="自动执行" /></SettingRow><SettingRow title="越界与敏感动作" description="未声明 Tool、越界目录、敏感参数和注入内容仍会被阻止"><StatusLight state="success" label="强制拦截" /></SettingRow></SettingsBlock><SettingsBlock title="资源健康" description="MCP、Tool 和数据源归入系统治理，不与能力目录重复。">{resourceCatalog?.tools.length ? resourceCatalog.tools.map((tool) => <div className="provider-row" key={tool.id}><span><strong>{tool.name}</strong><small>{tool.reason ?? `${tool.sideEffect} · ${tool.credentialStatus}`}</small></span><StatusLight state={tool.health === 'available' ? 'success' : tool.health === 'degraded' ? 'waiting' : 'danger'} label={tool.health === 'available' ? '可用' : tool.health === 'degraded' ? '降级' : '不可用'} /></div>) : <div className="directory-empty"><h3>Runtime 尚未提供资源</h3></div>}<SettingRow title="MCP 目录" description={`${resourceCatalog?.mcps.length ?? 0} 个版本化 MCP`}><button type="button" className="button button--quiet" onClick={() => void onProbeResources?.()}>重新检查</button></SettingRow></SettingsBlock></>}
    {section === 'memory' && <><SettingsBlock title="本地记忆"><div className="memory-summary"><div><strong>{memories.filter((item) => item.status === 'active').length}</strong><span>有效记忆</span></div><div><strong>{memories.filter((item) => item.status === 'conflicted').length + memoryQueue.length}</strong><span>等待处理</span></div><div><strong>{memoryHealth?.embedding === 'hybrid' ? '混合' : 'BM25'}</strong><span>召回模式</span></div></div></SettingsBlock><SettingsBlock title="最近记忆"><SummaryList emptyMessage="暂无本地记忆。">{memories.slice(0, 3).map((item) => <SummaryListItem key={item.id} onClick={() => setDetailView('memory')} title={item.content} subtitle={`${item.scopeType} · ${item.category} · v${item.version}`} trailing={<StatusLight state={item.status === 'active' ? 'success' : item.status === 'conflicted' ? 'waiting' : 'muted'} label={item.status} />} />)}</SummaryList></SettingsBlock><button type="button" className="text-action" onClick={() => setDetailView('memory')}>查看和治理全部记忆 <NavArrowRight aria-hidden width={14} height={14} /></button></>}
    {section === 'usage' && <SettingsBlock title="用量与预算" description="不显示没有来源的模拟金额或 Token 数。"><div className="directory-empty"><h3>Runtime 尚未提供聚合用量接口</h3><p>Provider 的单次实际用量已记录在运行证据中；聚合视图开放后再在这里展示。</p></div></SettingsBlock>}
    {section === 'about' && <><SettingsBlock title="应用"><SettingRow title="AI Employee OS" description="本地开发版本"><span>0.1.0</span></SettingRow><SettingRow title="Runtime" description={runtimeStatus.message}><StatusLight state={runtimeStatus.state === 'connected' ? 'success' : runtimeStatus.state === 'connecting' ? 'waiting' : 'danger'} label={runtimeStatus.state === 'connected' ? '已连接' : runtimeStatus.state === 'connecting' ? '连接中' : '未连接'} breathing={runtimeStatus.state === 'connecting'} /></SettingRow></SettingsBlock><SettingsBlock title="诊断"><SettingRow title="重新检查 Runtime" description="重新连接，不修改业务数据"><button type="button" className="button button--quiet" onClick={() => void onReconnect()}><Refresh aria-hidden width={16} height={16} />检查</button></SettingRow></SettingsBlock><button type="button" className="advanced-disclosure" onClick={() => setDetailView('about')}>查看高级信息 <NavArrowRight aria-hidden width={14} height={14} /></button></>}
  </DetailPage>
  <ClientModal open={detailView === 'memory'} title="全部记忆" eyebrow={<span className="quiet-meta">本地治理</span>} onClose={() => setDetailView(null)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>全部记忆</h3><p>查看记忆来源、状态和适用范围，处理冲突或过期内容。</p></div><MemoryModule /></div></ClientModal>
  <ClientModal open={detailView === 'about'} title="应用高级信息" eyebrow={<span className="quiet-meta">只读</span>} onClose={() => setDetailView(null)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>本地诊断</h3><p>用于核对客户端、Runtime、资源目录和本地存储的真实状态。</p></div><section><div className="detail-data-list"><div className="detail-data-row"><span><strong>客户端版本</strong><small>AI Employee OS macOS</small></span><em>0.1.0</em></div><div className="detail-data-row"><span><strong>Runtime</strong><small>{runtimeStatus.message}</small></span><StatusLight state={runtimeStatus.state === 'connected' ? 'success' : runtimeStatus.state === 'connecting' ? 'waiting' : 'danger'} label={runtimeStatus.state} /></div><div className="detail-data-row"><span><strong>模型服务</strong><small>{providerStatus.models.length} 个模型状态</small></span><StatusLight state={providerStatus.state === 'ready' ? 'success' : providerStatus.state === 'degraded' ? 'waiting' : 'danger'} label={providerStatus.state} /></div><div className="detail-data-row"><span><strong>版本化资源</strong><small>Skill、Tool 与 MCP</small></span><em>{(resourceCatalog?.skills.length ?? 0) + (resourceCatalog?.tools.length ?? 0) + (resourceCatalog?.mcps.length ?? 0)} 项</em></div></div></section></div></ClientModal>
  </>
}
