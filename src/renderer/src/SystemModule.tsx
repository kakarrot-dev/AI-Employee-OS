import { useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Check, Coins, Community, Database, EditPencil, Group, HalfMoon, InfoCircle, Refresh, Settings, ShieldCheck, SunLight } from 'iconoir-react'
import type { ProviderStatus, RuntimeStatus } from '../../shared/runtime-contract'
import type { MemoryQueueItemView, MemoryViewModel } from '../../shared/memory-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import type { UsageSummaryView } from '../../shared/usage-contract'
import { DEFAULT_SUPERVISOR_CONFIG, SUPERVISOR_FIELD_LIMITS, validateSupervisorConfig, type SupervisorConfigInput, type SupervisorConfigIssue } from '../../shared/supervisor-contract'
import { Avatar, DetailPage, SettingRow, SettingsBlock, StatusLight, type ClientIcon } from './components/client-ui'
import { supervisorIdentity } from './employee-avatar'
import { MemoryModule } from './MemoryModule'
import { formatClientTimestamp } from './client-time'

export type SystemSectionId = 'profile' | 'general' | 'supervisor' | 'models' | 'resources' | 'memory' | 'usage' | 'about'
export type ThemeMode = 'system' | 'light' | 'dark'
export interface ClientProfile { name: string; avatarUrl: string | null }

export const systemSections: Array<{ id: SystemSectionId; label: string; icon: ClientIcon }> = [
  { id: 'profile', label: '个人资料', icon: Group },
  { id: 'general', label: '通用', icon: Settings },
  { id: 'supervisor', label: '总管', icon: Community },
  { id: 'models', label: '模型服务', icon: Brain },
  { id: 'resources', label: '资源与权限', icon: ShieldCheck },
  { id: 'memory', label: '记忆与存储', icon: Database },
  { id: 'usage', label: '用量与预算', icon: Coins },
  { id: 'about', label: '关于与诊断', icon: InfoCircle }
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
    avatarUrl: storage?.getItem('ai-employee-os.profile.avatarUrl') ?? null
  }
}

function SupervisorFieldFeedback({ value, issue, min, max }: { value: string; issue?: SupervisorConfigIssue; min: number; max: number }): React.JSX.Element {
  return <small className={`form-field__feedback${issue ? ' is-error' : ''}`} role={issue ? 'alert' : undefined}><span>{issue?.message ?? `${min}-${max} 个字符`}</span><span>{[...value.trim()].length}/{max}</span></small>
}

function SupervisorSettings({ configuration, providerStatus, onChange }: { configuration: SupervisorConfigInput; providerStatus: ProviderStatus; onChange: (configuration: SupervisorConfigInput) => void }): React.JSX.Element {
  const [draft, setDraft] = useState<SupervisorConfigInput>(configuration)
  const [saveError, setSaveError] = useState(false)
  const [touched, setTouched] = useState<Set<keyof SupervisorConfigInput>>(new Set())
  const latestDraft = useRef(configuration)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    if (JSON.stringify(configuration) === JSON.stringify(latestDraft.current)) return
    latestDraft.current = configuration
    setDraft(configuration)
  }, [configuration])
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])
  const issues = useMemo(() => validateSupervisorConfig(draft), [draft])
  const issueFor = (field: keyof SupervisorConfigInput): SupervisorConfigIssue | undefined => touched.has(field) ? issues.find((issue) => issue.field === field) : undefined
  const scheduleSave = (next: SupervisorConfigInput): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveError(false)
    if (validateSupervisorConfig(next).length > 0) return
    saveTimer.current = setTimeout(() => {
      saveTimer.current = undefined
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        const value = await window.aiEmployeeOS.supervisor.update(next)
        if (JSON.stringify(latestDraft.current) !== JSON.stringify(next)) return
        const saved = { name: value.name, avatarDataUrl: value.avatarDataUrl, systemPrompt: value.systemPrompt, modelId: value.modelId, memoryScopes: [...value.memoryScopes] }
        latestDraft.current = saved
        setDraft(saved)
        onChange(saved)
      }).catch(() => {
        if (JSON.stringify(latestDraft.current) === JSON.stringify(next)) setSaveError(true)
      })
    }, 400)
  }
  const updateDraft = <K extends keyof SupervisorConfigInput>(field: K, value: SupervisorConfigInput[K]): void => {
    const next = { ...latestDraft.current, [field]: value }
    latestDraft.current = next
    setDraft(next)
    setTouched((current) => new Set(current).add(field))
    onChange(next)
    scheduleSave(next)
  }
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateDraft('avatarDataUrl', typeof reader.result === 'string' ? reader.result : undefined)
    reader.readAsDataURL(file)
  }
  const identity = supervisorIdentity(draft)
  return <div className="supervisor-settings-form">
    <SettingsBlock title="身份"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传总管头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={identity.name} initials={identity.initials} color={identity.color} size="large" src={identity.avatarSrc} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label></div><label className="form-field"><span>名称</span><input value={draft.name} maxLength={SUPERVISOR_FIELD_LIMITS.name.max} aria-label="总管名称" aria-invalid={Boolean(issueFor('name'))} onChange={(event) => updateDraft('name', event.target.value)} /><SupervisorFieldFeedback value={draft.name} issue={issueFor('name')} {...SUPERVISOR_FIELD_LIMITS.name} /></label></div></SettingsBlock>
    <SettingsBlock title="系统提示词"><div className="form-field form-field--prompt"><textarea rows={10} value={draft.systemPrompt} maxLength={SUPERVISOR_FIELD_LIMITS.systemPrompt.max} aria-label="总管系统提示词" aria-invalid={Boolean(issueFor('systemPrompt'))} onChange={(event) => updateDraft('systemPrompt', event.target.value)} /><SupervisorFieldFeedback value={draft.systemPrompt} issue={issueFor('systemPrompt')} {...SUPERVISOR_FIELD_LIMITS.systemPrompt} /></div></SettingsBlock>
    <SettingsBlock title="模型"><div className="settings-selection-grid">{(['deepseek-v4-pro', 'claude-sonnet-4.6'] as const).map((modelId) => { const model = providerStatus.models.find((item) => item.modelId === modelId); return <button type="button" key={modelId} className={`selection-card${draft.modelId === modelId ? ' is-selected' : ''}`} onClick={() => updateDraft('modelId', modelId)}><Brain aria-hidden /><span><strong>{modelId}</strong><small>{model?.verification === 'verified' ? '当前可用' : '需要配置模型服务'}</small></span>{draft.modelId === modelId && <Check aria-hidden />}</button> })}</div></SettingsBlock>
    <SettingsBlock title="记忆"><div className="choice-stack"><label><input type="checkbox" aria-label="读取全局记忆" checked={draft.memoryScopes.includes('global')} onChange={(event) => updateDraft('memoryScopes', event.target.checked ? ['global'] : [])} /><span><strong>读取全局记忆</strong><small>用于对话路由与结果验收</small></span></label></div></SettingsBlock>
    {saveError && <p className="supervisor-autosave-error" role="alert">自动保存失败，请继续修改后重试。</p>}
  </div>
}

const POE_MODEL_COPY = {
  'claude-sonnet-4.6': '文本模型',
  'gpt-image-2': '图像模型',
  'seedance-2.0': '视频模型'
} as const

function readableResourceReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined
  const labels: Record<string, string> = {
    ssrf_target_blocked: '目标地址不允许访问',
    credential_missing: '缺少连接凭证',
    request_timeout: '连接超时',
    network_failed: '网络连接失败'
  }
  if (labels[reason]) return labels[reason]
  return /^[a-z0-9_:-]+$/i.test(reason) ? '健康检查未通过' : reason
}

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
  const deepSeekModels = status.models.filter((model) => model.provider === 'deepseek')
  const poeModels = status.models.filter((model) => model.provider === 'poe')
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
    return <div className="provider-row" key={model.modelId}><span><strong>{model.modelId}</strong><small>{model.provider === 'poe' ? POE_MODEL_COPY[model.modelId as keyof typeof POE_MODEL_COPY] : '文本模型'}</small></span><StatusLight state={verified ? 'success' : 'waiting'} label={verified ? '已验证' : configured ? '待验证' : '待配置'} breathing={configured && !verified} />{model.provider === 'poe' && <button type="button" className="button button--quiet provider-row__action" aria-label={`验证 ${model.modelId}`} disabled={!poeConfigured || Boolean(verifying)} onClick={() => void verify(model.modelId as keyof typeof POE_MODEL_COPY)}>{verifying === model.modelId ? '验证中' : '验证'}</button>}</div>
  }
  return <>
    <SettingsBlock title="DeepSeek">{deepSeekModels.map(row)}{deepSeekModels.length === 0 && <SettingRow title="DeepSeek 连接" description="当前未发现可用模型"><StatusLight state="muted" label="未配置" /></SettingRow>}</SettingsBlock>
    <SettingsBlock title="Poe"><div className="provider-credential-panel"><label className="form-field provider-credential-field"><span>Poe API Key</span><div className="provider-credential-control"><input type="password" value={poeCredential} autoComplete="off" aria-label="Poe API Key" placeholder="填写 mock-only 即可，不使用真实密钥" onChange={(event) => { setPoeCredential(event.target.value); setFeedback(undefined) }} /><button type="button" className="button button--primary" disabled={saving || poeCredential.trim().length < 8} onClick={() => void savePoe()}>{saving ? '保存中' : '保存连接'}</button></div></label><p>原型验证仅更新模拟状态，不调用模型或消耗积分。</p>{feedback && <p className={`provider-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}</div>{poeModels.map(row)}{poeModels.length === 0 && <SettingRow title="Poe 模型" description="保存连接后读取可验证模型"><StatusLight state="muted" label="未连接" /></SettingRow>}</SettingsBlock>
  </>
}

export function SystemModule({ section, providerStatus, runtimeStatus, resourceCatalog, supervisor = { ...DEFAULT_SUPERVISOR_CONFIG, memoryScopes: [...DEFAULT_SUPERVISOR_CONFIG.memoryScopes] }, onReconnect, onProbeResources, onProfileChange, onSupervisorChange, onProviderStatusChange }: { section: SystemSectionId; providerStatus: ProviderStatus; runtimeStatus: RuntimeStatus; resourceCatalog?: ResourceCatalogView; supervisor?: SupervisorConfigInput; onReconnect: () => Promise<void>; onProbeResources?: () => Promise<void>; onProfileChange?: (profile: ClientProfile) => void; onSupervisorChange?: (configuration: SupervisorConfigInput) => void; onProviderStatusChange?: (status: ProviderStatus) => void }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [profile, setProfile] = useState(readClientProfile)
  const [restoreSession, setRestoreSession] = useState(() => readBooleanPreference('ai-employee-os.restore-session', true))
  const [memories, setMemories] = useState<MemoryViewModel[]>([])
  const [memoryQueue, setMemoryQueue] = useState<MemoryQueueItemView[]>([])
  const [memoryState, setMemoryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [usage, setUsage] = useState<UsageSummaryView>()
  const [usageState, setUsageState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => {
    if (section !== 'memory') return
    setMemoryState('loading')
    void Promise.all([window.aiEmployeeOS.memory.list(), window.aiEmployeeOS.memory.queue()]).then(([items, queue]) => { setMemories(items); setMemoryQueue(queue); setMemoryState('ready') }).catch(() => setMemoryState('error'))
  }, [section])
  useEffect(() => {
    if (section !== 'usage') return
    setUsageState('loading')
    const bridge = window.aiEmployeeOS.usage
    if (!bridge) { setUsageState('error'); return }
    void bridge.summary().then((value) => { setUsage(value); setUsageState('ready') }).catch(() => setUsageState('error'))
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
  const updatePreference = (key: 'ai-employee-os.restore-session', value: boolean): void => {
    clientStorage()?.setItem(key, String(value))
    setRestoreSession(value)
  }

  const catalog = resourceCatalog ?? { skills: [], tools: [], mcps: [], healthChecks: [] }
  const availableResources = catalog.skills.filter((item) => item.available).length + catalog.tools.filter((item) => item.available).length + catalog.mcps.filter((item) => item.available).length
  const resourceTotal = catalog.skills.length + catalog.tools.length + catalog.mcps.length
  const unhealthyResources = [...catalog.tools, ...catalog.mcps].filter((item) => item.health !== 'available').length
  const number = (value: number): string => new Intl.NumberFormat('zh-CN').format(value)

  return <><DetailPage className="system-page">
    {section === 'profile' && <SettingsBlock title="身份"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传个人头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={profile.name || '本地用户'} initials={profile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="large" src={profile.avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label></div><label className="form-field"><span>名称</span><input value={profile.name} maxLength={20} aria-label="个人名称" onChange={(event) => updateProfile('name', event.target.value)} /></label></div></SettingsBlock>}
    {section === 'general' && <><SettingsBlock title="外观"><div className="theme-choice">{([['system', Settings, '跟随系统'], ['light', SunLight, '浅色'], ['dark', HalfMoon, '深色']] as const).map(([id, Icon, label]) => <button type="button" key={id} className={theme === id ? 'is-active' : ''} onClick={() => setTheme(id)}><Icon aria-hidden /><span>{label}</span>{theme === id && <Check aria-hidden />}</button>)}</div></SettingsBlock><SettingsBlock title="启动"><SettingRow title="恢复上次会话" description="下次启动时打开最近使用的会话"><input type="checkbox" checked={restoreSession} aria-label="启动时恢复上次会话" onChange={(event) => updatePreference('ai-employee-os.restore-session', event.target.checked)} /></SettingRow></SettingsBlock></>}
    {section === 'supervisor' && <SupervisorSettings configuration={supervisor} providerStatus={providerStatus} onChange={(value) => onSupervisorChange?.(value)} />}
    {section === 'models' && <ProviderSettings status={providerStatus} onStatusChange={(value) => onProviderStatusChange?.(value)} />}
    {section === 'resources' && <><SettingsBlock title="资源概览"><div className="settings-summary"><div><strong>{resourceTotal}</strong><span>资源总数</span></div><div><strong>{availableResources}</strong><span>当前可用</span></div><div><strong>{unhealthyResources}</strong><span>需要处理</span></div></div></SettingsBlock><SettingsBlock title="默认权限"><SettingRow title="已授权操作" description="仅使用已授权的工具和目录"><StatusLight state="success" label="自动执行" /></SettingRow><SettingRow title="越界或敏感操作" description="未授权时阻止执行"><StatusLight state="success" label="强制拦截" /></SettingRow></SettingsBlock><SettingsBlock title="资源状态">{[...catalog.tools, ...catalog.mcps].map((item) => { const detail = readableResourceReason(item.reason) ?? (item.credentialStatus === 'missing' ? '缺少连接凭证' : undefined); return <div className="provider-row" key={item.id}><span><strong>{item.name}</strong>{detail && <small>{detail}</small>}</span><StatusLight state={item.health === 'available' ? 'success' : item.health === 'degraded' ? 'waiting' : 'danger'} label={item.health === 'available' ? '可用' : item.health === 'degraded' ? '降级' : '不可用'} /></div> })}{catalog.tools.length + catalog.mcps.length === 0 && <SettingRow title="执行资源" description="当前没有可用资源"><span>0 项</span></SettingRow>}<SettingRow title="健康检查"><button type="button" className="button button--quiet" onClick={() => void onProbeResources?.()}>检查</button></SettingRow></SettingsBlock></>}
    {section === 'memory' && <><SettingsBlock title="本地记忆"><div className="settings-summary settings-summary--two"><div><strong>{memoryState === 'loading' ? '...' : memoryState === 'error' ? '-' : memories.filter((item) => item.status === 'active').length}</strong><span>已记住</span></div><div><strong>{memoryState === 'loading' ? '...' : memoryState === 'error' ? '-' : memoryQueue.length + memories.filter((item) => item.status === 'conflicted' || item.status === 'pending_verification').length}</strong><span>待确认</span></div></div></SettingsBlock><SettingsBlock title={memoryQueue.length > 0 ? `待确认的记忆（${memoryQueue.length}）` : '记忆管理'}><MemoryModule onSnapshot={({ memories: items, queue }) => { setMemories(items); setMemoryQueue(queue); setMemoryState('ready') }} /></SettingsBlock></>}
    {section === 'usage' && <>{usageState === 'error' ? <SettingsBlock title="实际用量"><SettingRow title="暂时无法读取" description={window.aiEmployeeOS.usage ? undefined : '请重启客户端后重试'}>{window.aiEmployeeOS.usage && <button type="button" className="button button--quiet" onClick={() => { setUsageState('loading'); void window.aiEmployeeOS.usage?.summary().then((value) => { setUsage(value); setUsageState('ready') }).catch(() => setUsageState('error')) }}>重试</button>}</SettingRow></SettingsBlock> : <><SettingsBlock title="实际用量"><div className="settings-summary"><div><strong>{usageState === 'loading' ? '...' : number(usage?.requestCount ?? 0)}</strong><span>模型调用</span></div><div><strong>{usageState === 'loading' ? '...' : number(usage?.inputTokens ?? 0)}</strong><span>输入 Token</span></div><div><strong>{usageState === 'loading' ? '...' : number(usage?.outputTokens ?? 0)}</strong><span>输出 Token</span></div></div></SettingsBlock><SettingsBlock title="按模型">{usage?.models.map((model) => <div className="provider-row usage-model-row" key={`${model.provider}:${model.modelId}`}><span><strong>{model.modelId}</strong><small>{model.provider === 'deepseek' ? 'DeepSeek' : 'Poe'}，{model.requestCount} 次调用</small></span><span>{number(model.totalTokens)} Token</span></div>)}{usageState === 'ready' && usage?.models.length === 0 && <SettingRow title="尚无模型调用" description="完成一次对话或任务后显示真实用量"><span>0 Token</span></SettingRow>}<SettingRow title="费用"><span>{usage?.amountUsdMicros === null || usage === undefined ? '模型服务未提供' : `$${(usage.amountUsdMicros / 1_000_000).toFixed(4)}`}</span></SettingRow></SettingsBlock></>}</>}
    {section === 'about' && <><SettingsBlock title="应用"><SettingRow title="AI Employee OS"><span>0.1.0</span></SettingRow><SettingRow title="本地服务" description={runtimeStatus.state === 'disconnected' ? '消息和事项暂时无法执行' : undefined}><StatusLight state={runtimeStatus.state === 'connected' ? 'success' : runtimeStatus.state === 'connecting' ? 'waiting' : 'danger'} label={runtimeStatus.state === 'connected' ? '已连接' : runtimeStatus.state === 'connecting' ? '连接中' : '未连接'} breathing={runtimeStatus.state === 'connecting'} /></SettingRow><SettingRow title="模型服务" description={`${providerStatus.models.length} 个模型，${providerStatus.models.filter((item) => item.verification === 'verified').length} 个已验证`}><StatusLight state={providerStatus.state === 'ready' ? 'success' : providerStatus.state === 'degraded' ? 'waiting' : 'danger'} label={providerStatus.state === 'ready' ? '正常' : providerStatus.state === 'degraded' ? '部分可用' : '不可用'} /></SettingRow><SettingRow title="能力资源"><span>{resourceTotal} 项</span></SettingRow></SettingsBlock><SettingsBlock title="诊断"><SettingRow title="检查本地服务" description={`上次检查 ${formatClientTimestamp(runtimeStatus.checkedAt)}`}><button type="button" className="button button--quiet" onClick={() => void onReconnect()}><Refresh aria-hidden />检查</button></SettingRow></SettingsBlock></>}
  </DetailPage></>
}
