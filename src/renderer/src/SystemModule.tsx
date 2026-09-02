import { useEffect, useState } from 'react'
import { Brain, Check, Coins, Community, Database, EditPencil, Group, HalfMoon, InfoCircle, NavArrowRight, Refresh, Settings, ShieldCheck, SunLight } from 'iconoir-react'
import type { ProviderStatus, RuntimeStatus } from '../../shared/runtime-contract'
import type { MemoryHealthView, MemoryQueueItemView, MemoryViewModel } from '../../shared/memory-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { Avatar, ClientModal, DetailPage, SettingRow, SettingsBlock, StatusLight, type ClientIcon } from './components/client-ui'
import { MemoryModule } from './MemoryModule'

export type SystemSectionId = 'profile' | 'general' | 'supervisor' | 'models' | 'resources' | 'memory' | 'usage' | 'about'
export type ThemeMode = 'system' | 'light' | 'dark'
export interface ClientProfile { name: string; role: string; description: string; avatarUrl: string | null }

export const systemSections: Array<{ id: SystemSectionId; label: string; icon: ClientIcon; description: string }> = [
  { id: 'profile', label: '个人资料', icon: Group, description: '管理当前 macOS 客户端中的本地身份信息。' },
  { id: 'general', label: '通用', icon: Settings, description: '设置客户端外观、启动行为与本地通知。' },
  { id: 'supervisor', label: '总管', icon: Community, description: '查看总管的职责边界与 Runtime 注入规则。' },
  { id: 'models', label: '模型服务', icon: Brain, description: '查看模型连接、Credential 状态与验证结果。' },
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

function Intro({ section }: { section: SystemSectionId }): React.JSX.Element {
  const definition = systemSections.find((item) => item.id === section) ?? systemSections[0]
  const Icon = definition.icon
  return <section className="settings-intro"><span><Icon aria-hidden width={24} height={24} /></span><div><h2>{definition.label}</h2><p>{definition.description}</p></div></section>
}

function ProviderSettings({ status }: { status: ProviderStatus }): React.JSX.Element {
  return <>{(['deepseek', 'poe'] as const).map((provider) => <SettingsBlock key={provider} title={provider === 'deepseek' ? 'DeepSeek' : 'Poe'}>{status.models.filter((model) => model.provider === provider).map((model) => <div className="provider-row" key={model.modelId}><span><strong>{model.modelId}</strong><small>{status.credentialStatus[provider] === 'configured' ? 'Credential 已配置，明文不会回显' : 'Credential 未配置'}</small></span><StatusLight state={model.verification === 'verified' ? 'success' : 'waiting'} label={model.verification === 'verified' ? '已验证' : '待验证'} breathing={model.verification !== 'verified'} /></div>)}</SettingsBlock>)}</>
}

export function SystemModule({ section, providerStatus, runtimeStatus, resourceCatalog, onReconnect, onProbeResources, onProfileChange }: { section: SystemSectionId; providerStatus: ProviderStatus; runtimeStatus: RuntimeStatus; resourceCatalog?: ResourceCatalogView; onReconnect: () => Promise<void>; onProbeResources?: () => Promise<void>; onProfileChange?: (profile: ClientProfile) => void }): React.JSX.Element {
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

  return <><DetailPage className="system-page"><Intro section={section} />
    {section === 'profile' && <><SettingsBlock title="个人身份" description="这是个人用户资料，不属于总管或任何 Agent 员工。"><div><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传个人头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={profile.name} initials={profile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="large" src={profile.avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label></div><label className="form-field"><span>显示名称</span><input value={profile.name} onChange={(event) => updateProfile('name', event.target.value)} /></label><label className="form-field"><span>身份说明</span><input value={profile.role} onChange={(event) => updateProfile('role', event.target.value)} placeholder="例如：产品经理" /></label><label className="form-field"><span>个人简介</span><textarea rows={4} value={profile.description} onChange={(event) => updateProfile('description', event.target.value)} placeholder="补充你的工作方向与协作偏好。" /></label></div></SettingsBlock><SettingsBlock title="资料范围"><SettingRow title="本地个人资料" description="只用于当前客户端的身份展示，不会创建 Agent 员工"><StatusLight state="success" label="本机" /></SettingRow></SettingsBlock></>}
    {section === 'general' && <><SettingsBlock title="外观" description="主题变化会立即应用到整个客户端。"><div className="theme-choice">{([['system', Settings, '跟随系统'], ['light', SunLight, '浅色'], ['dark', HalfMoon, '深色']] as const).map(([id, Icon, label]) => <button type="button" key={id} className={theme === id ? 'is-active' : ''} onClick={() => setTheme(id)}><Icon aria-hidden width={20} height={20} /><span>{label}</span>{theme === id && <Check aria-hidden width={17} height={17} />}</button>)}</div></SettingsBlock><SettingsBlock title="启动"><SettingRow title="启动时恢复上次会话" description="保留最近一次会话选择，消息事实仍由 Runtime 持久化"><input type="checkbox" checked={restoreSession} aria-label="启动时恢复上次会话" onChange={(event) => updatePreference('ai-employee-os.restore-session', event.target.checked)} /></SettingRow><SettingRow title="允许 macOS 通知" description="保存本地提醒偏好；通知事件接入后按此设置生效"><input type="checkbox" checked={allowNotifications} aria-label="允许 macOS 通知" onChange={(event) => updatePreference('ai-employee-os.allow-notifications', event.target.checked)} /></SettingRow></SettingsBlock></>}
    {section === 'supervisor' && <SettingsBlock title="总管定义" description="总管是系统级入口，不属于任何 Agent 员工。"><div className="boundary-note">当前版本由 Runtime 固定注入意图判断、任务路由、权限与验收规则。尚未提供可写配置接口，因此这里只展示边界，不提供无效编辑器。</div></SettingsBlock>}
    {section === 'models' && <ProviderSettings status={providerStatus} />}
    {section === 'resources' && <><SettingsBlock title="默认授权策略" description="运行中不能静默扩大已冻结的权限范围。"><SettingRow title="有副作用的 Tool" description="外部写入、权限变更和高风险动作必须审批"><StatusLight state="success" label="强制审批" /></SettingRow><SettingRow title="只读资源" description="仍受 RunGrant、Origin 和版本约束"><StatusLight state="success" label="受控执行" /></SettingRow></SettingsBlock><SettingsBlock title="资源健康" description="MCP、Tool 和数据源归入系统治理，不与能力目录重复。">{resourceCatalog?.tools.length ? resourceCatalog.tools.map((tool) => <div className="provider-row" key={tool.id}><span><strong>{tool.name}</strong><small>{tool.reason ?? `${tool.sideEffect} · ${tool.credentialStatus}`}</small></span><StatusLight state={tool.health === 'available' ? 'success' : tool.health === 'degraded' ? 'waiting' : 'danger'} label={tool.health === 'available' ? '可用' : tool.health === 'degraded' ? '降级' : '不可用'} /></div>) : <div className="directory-empty"><h3>Runtime 尚未提供资源</h3></div>}<SettingRow title="MCP 目录" description={`${resourceCatalog?.mcps.length ?? 0} 个版本化 MCP`}><button type="button" className="button button--quiet" onClick={() => void onProbeResources?.()}>重新检查</button></SettingRow></SettingsBlock></>}
    {section === 'memory' && <><SettingsBlock title="本地记忆"><div className="memory-summary"><div><strong>{memories.filter((item) => item.status === 'active').length}</strong><span>有效记忆</span></div><div><strong>{memories.filter((item) => item.status === 'conflicted').length + memoryQueue.length}</strong><span>等待处理</span></div><div><strong>{memoryHealth?.embedding === 'hybrid' ? '混合' : 'BM25'}</strong><span>召回模式</span></div></div></SettingsBlock><SettingsBlock title="最近记忆"><div className="memory-rows">{memories.slice(0, 3).map((item) => <button type="button" key={item.id} onClick={() => setDetailView('memory')}><span><strong>{item.content}</strong><small>{item.scopeType} · {item.category} · v{item.version}</small></span><StatusLight state={item.status === 'active' ? 'success' : item.status === 'conflicted' ? 'waiting' : 'muted'} label={item.status} /></button>)}{!memories.length && <p className="empty-state">暂无本地记忆。</p>}</div></SettingsBlock><button type="button" className="text-action" onClick={() => setDetailView('memory')}>查看和治理全部记忆 <NavArrowRight aria-hidden width={14} height={14} /></button></>}
    {section === 'usage' && <SettingsBlock title="用量与预算" description="不显示没有来源的模拟金额或 Token 数。"><div className="directory-empty"><h3>Runtime 尚未提供聚合用量接口</h3><p>Provider 的单次实际用量已记录在运行证据中；聚合视图开放后再在这里展示。</p></div></SettingsBlock>}
    {section === 'about' && <><SettingsBlock title="应用"><SettingRow title="AI Employee OS" description="本地开发版本"><span>0.1.0</span></SettingRow><SettingRow title="Runtime" description={runtimeStatus.message}><StatusLight state={runtimeStatus.state === 'connected' ? 'success' : runtimeStatus.state === 'connecting' ? 'waiting' : 'danger'} label={runtimeStatus.state === 'connected' ? '已连接' : runtimeStatus.state === 'connecting' ? '连接中' : '未连接'} breathing={runtimeStatus.state === 'connecting'} /></SettingRow></SettingsBlock><SettingsBlock title="诊断"><SettingRow title="重新检查 Runtime" description="重新连接，不修改业务数据"><button type="button" className="button button--quiet" onClick={() => void onReconnect()}><Refresh aria-hidden width={16} height={16} />检查</button></SettingRow></SettingsBlock><button type="button" className="advanced-disclosure" onClick={() => setDetailView('about')}>查看高级信息 <NavArrowRight aria-hidden width={14} height={14} /></button></>}
  </DetailPage>
  <ClientModal open={detailView === 'memory'} title="全部记忆" eyebrow={<span className="quiet-meta">本地治理</span>} onClose={() => setDetailView(null)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>全部记忆</h3><p>查看记忆来源、状态和适用范围，处理冲突或过期内容。</p></div><MemoryModule /></div></ClientModal>
  <ClientModal open={detailView === 'about'} title="应用高级信息" eyebrow={<span className="quiet-meta">只读</span>} onClose={() => setDetailView(null)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>本地诊断</h3><p>用于核对客户端、Runtime、资源目录和本地存储的真实状态。</p></div><section><div className="detail-data-list"><div className="detail-data-row"><span><strong>客户端版本</strong><small>AI Employee OS macOS</small></span><em>0.1.0</em></div><div className="detail-data-row"><span><strong>Runtime</strong><small>{runtimeStatus.message}</small></span><StatusLight state={runtimeStatus.state === 'connected' ? 'success' : runtimeStatus.state === 'connecting' ? 'waiting' : 'danger'} label={runtimeStatus.state} /></div><div className="detail-data-row"><span><strong>模型服务</strong><small>{providerStatus.models.length} 个模型状态</small></span><StatusLight state={providerStatus.state === 'ready' ? 'success' : providerStatus.state === 'degraded' ? 'waiting' : 'danger'} label={providerStatus.state} /></div><div className="detail-data-row"><span><strong>版本化资源</strong><small>Skill、Tool 与 MCP</small></span><em>{(resourceCatalog?.skills.length ?? 0) + (resourceCatalog?.tools.length ?? 0) + (resourceCatalog?.mcps.length ?? 0)} 项</em></div></div></section></div></ClientModal>
  </>
}
