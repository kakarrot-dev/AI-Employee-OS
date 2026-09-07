import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Database, NavArrowRight, Refresh, ShieldCheck, Sparks, Tools } from 'iconoir-react'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeSummary } from '../../shared/runtime-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { Avatar, ClientModal, DetailPage, DetailState, StatusLight, type ClientIcon } from './components/client-ui'
import { employeeAvatarSrc } from './employee-avatar'
import { employeeStatusLabel } from './employee-status'
import { formatClientTimestamp } from './client-time'

export type ResourceKind = 'skills' | 'tools'
export type ResourceItem = ResourceCatalogView['skills'][number] | ResourceCatalogView['tools'][number]
const empty: ResourceCatalogView = { skills: [], tools: [], mcps: [], healthChecks: [] }

export function resourcesFor(catalog: ResourceCatalogView, kind: ResourceKind): ResourceItem[] {
  return kind === 'skills' ? catalog.skills : catalog.tools
}

function DependencyGroup({ title, items, icon: Icon }: { title: string; items: string[]; icon: ClientIcon }): React.JSX.Element {
  return <div><div className="dependency-groups__title"><Icon aria-hidden /><span>{title}</span></div>{items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>无</p>}</div>
}

function skillMarkdown(skill: ResourceCatalogView['skills'][number]): string {
  return skill.instructionsMarkdown
}

export function ResourceModule({ catalog = empty, kind = 'skills', selectedId, loading = false, probing = false, error, onProbe, onOpenEmployee }: { catalog?: ResourceCatalogView; kind?: ResourceKind; selectedId?: string; loading?: boolean; probing?: boolean; error?: string; onProbe?: () => void; onOpenEmployee?: (employeeId: string) => void }): React.JSX.Element {
  const [employeeCapabilities, setEmployeeCapabilities] = useState<AgentCapabilityVersionView[]>([])
  const [employeeDetails, setEmployeeDetails] = useState<Array<{ summary: EmployeeSummary; detail: EmployeeDetail }>>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const items = resourcesFor(catalog, kind)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  useEffect(() => {
    let mounted = true
    void Promise.all([window.aiEmployeeOS.employee.capabilities(), window.aiEmployeeOS.employee.list()]).then(async ([capabilities, employees]) => {
      const details = await Promise.all(employees.map(async (summary) => ({ summary, detail: await window.aiEmployeeOS.employee.detail(summary.id) })))
      if (mounted) { setEmployeeCapabilities(capabilities); setEmployeeDetails(details) }
    }).catch(() => { if (mounted) { setEmployeeCapabilities([]); setEmployeeDetails([]) } })
    return () => { mounted = false }
  }, [])

  const linkedEmployees = useMemo(() => {
    if (!selected) return []
    const capabilityIds = new Set(employeeCapabilities.filter((capability) => ('steps' in selected ? capability.skillVersionIds : capability.toolVersionIds).includes(selected.id)).map((capability) => capability.id))
    return employeeDetails.filter(({ detail }) => [detail.active, detail.draft].some((version) => version?.capabilityVersionIds.some((id) => capabilityIds.has(id))))
  }, [employeeCapabilities, employeeDetails, selected])

  if (!selected) return <DetailPage>{error && <p className="inline-error" role="alert">{error}</p>}<div className="directory-empty"><h3>{loading ? '正在读取能力目录' : `暂无 ${kind === 'skills' ? 'Skill' : 'Tool'}`}</h3><p>{loading ? 'Runtime 正在同步版本化资源，短暂中断会自动重试。' : error ? 'Runtime 连接成功后会自动重新读取能力目录。' : 'Runtime 尚未提供该类型的版本化资源。'}</p></div></DetailPage>
  const isSkill = 'steps' in selected
  const Icon = isSkill ? Sparks : Tools
  const sourceHealth = catalog.healthChecks.find((check) => check.adapterVersionId === selected.id)
  const health = 'health' in selected ? selected.health : selected.available ? 'available' : 'unavailable'
  const associatedSkills = isSkill ? [] : catalog.skills.filter((skill) => skill.toolVersionIds.includes(selected.id)).map((skill) => skill.name)
  const healthLabels = { available: '可用', degraded: '降级', unavailable: '不可用' }
  const credentialLabels = { not_required: '无需凭证', configured: '已配置凭证', missing: '缺少凭证' }
  const riskLabels = { low: '低风险', medium: '中风险', high: '高风险' }
  const permissionItems = isSkill ? ['仅可调用已绑定工具', '执行范围由专家授权和当前任务共同决定'] : [selected.sideEffect === 'none' ? '本地调用' : selected.sideEffect === 'external_read' ? '读取外部信息' : '写入外部系统', riskLabels[selected.risk], ...(selected.networkOrigins.length ? selected.networkOrigins.map((origin) => origin === 'fixed_by_installed_skill' ? '网络范围由已安装能力限定' : origin === 'user_approved_public_https_feed' ? '仅访问任务授权的公开 HTTPS 订阅源' : origin) : ['无需访问外部网络'])]

  return <><DetailPage className="resource-page">{error && <p className="inline-error">{error}</p>}
    <section className="capability-intro resource-intro"><div className="capability-mark"><Icon aria-hidden /></div><div className="resource-intro__copy"><span className="capability-category">{isSkill ? 'Skill · 工作方法' : 'Tool · 执行动作'} · v{selected.version}</span><h2>{selected.name}</h2><p>{selected.description}</p></div><DetailState tone={selected.available ? 'success' : health === 'degraded' ? 'waiting' : 'danger'}>{selected.available ? '可用' : healthLabels[health]}</DetailState></section>
    <div className="resource-health-bar"><span>{selected.available ? '能力已就绪，可由已绑定的专家在授权范围内调用。' : selected.reason ?? '能力暂不可用，请检查连接或依赖。'}</span><button type="button" className="text-action resource-health-action" aria-label="重新检查资源健康" disabled={probing || !onProbe} onClick={onProbe}><Refresh aria-hidden />{probing ? '检查中…' : '重新检查'}</button></div>
    {isSkill && <section className="plain-section"><div className="content-section-title"><h3>执行步骤</h3><span>{selected.steps.length} 步</span></div>{selected.steps.length ? <ol className="resource-step-list">{selected.steps.map((step, index) => <li key={`${index}:${step}`}><span aria-hidden>{index + 1}</span><p>{step}</p></li>)}</ol> : <p className="empty-state">暂未提供执行步骤。</p>}</section>}
    <section className="plain-section"><h3>{isSkill ? '工具与使用范围' : '调用与使用范围'}</h3><div className="dependency-groups">{isSkill ? <div><div className="dependency-groups__title"><Tools aria-hidden /><span>依赖工具</span></div>{selected.toolVersionIds.length ? selected.toolVersionIds.map((id) => { const tool = catalog.tools.find((item) => item.id === id); return <div className="resource-dependency" key={id}><span title={id}>{tool?.name ?? id}</span><DetailState tone={tool?.available ? 'success' : 'danger'}>{tool?.available ? '可用' : '不可用'}</DetailState></div> }) : <p>无工具依赖</p>}</div> : <><DependencyGroup icon={Sparks} title="关联 Skills" items={associatedSkills} /><DependencyGroup icon={Database} title="连接状态" items={[healthLabels[selected.health], credentialLabels[selected.credentialStatus]]} /></>}<DependencyGroup icon={ShieldCheck} title="使用范围" items={permissionItems} /></div></section>
    <section className="plain-section"><div className="content-section-title"><h3>已绑定 Agent</h3><span>{linkedEmployees.length} 位</span></div>{linkedEmployees.length ? linkedEmployees.map(({ summary }) => <button type="button" className="linked-agent" key={summary.id} onClick={() => onOpenEmployee?.(summary.id)}><Avatar label={summary.name} initials={summary.name.slice(0, 1)} color="#b8c982" size="small" src={employeeAvatarSrc({ employeeId: summary.id, avatarDataUrl: summary.avatarDataUrl })} /><span><strong>{summary.name}</strong><small>{employeeStatusLabel(summary.status)}</small></span><NavArrowRight aria-hidden /></button>) : <p className="empty-state">尚未绑定 Agent。</p>}</section>
    {isSkill && <section className="plain-section skill-document"><div className="content-section-title"><h3>SKILL.md</h3><span>完整运行契约 · v{selected.version}</span></div><div className="markdown-rendered skill-document__markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{skillMarkdown(selected)}</ReactMarkdown></div></section>}
    <button type="button" className="advanced-disclosure" onClick={() => setAdvancedOpen(true)}>高级信息 <NavArrowRight aria-hidden /></button>
  </DetailPage>
  <ClientModal open={advancedOpen} title="能力高级信息" eyebrow={<span className="quiet-meta">只读</span>} onClose={() => setAdvancedOpen(false)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>{selected.name}</h3><p>查看资源版本、健康、依赖与运行边界。所有字段来自 Runtime。</p></div><section><div className="content-section-title"><h3>版本与状态</h3><span>{isSkill ? 'Skill' : 'Tool'}</span></div><div className="detail-data-list"><div className="detail-data-row"><span><strong>精确 ID</strong><small>{selected.id}</small></span><em>v{selected.version}</em></div><div className="detail-data-row"><span><strong>可用性</strong><small>{selected.reason ?? (selected.available ? '当前未发现异常' : '暂未提供异常原因')}</small></span><StatusLight state={selected.available ? 'success' : health === 'degraded' ? 'waiting' : 'danger'} label={selected.available ? '可用' : health === 'degraded' ? '降级' : '不可用'} /></div><div className="detail-data-row"><span><strong>创建时间</strong><small>版本实体创建时间</small></span><em>{formatClientTimestamp(selected.createdAt)}</em></div>{sourceHealth && <div className="detail-data-row"><span><strong>最近探测</strong><small>{formatClientTimestamp(sourceHealth.checkedAt)} · {sourceHealth.latencyMs}ms</small></span><StatusLight state={sourceHealth.status === 'available' ? 'success' : sourceHealth.status === 'degraded' ? 'waiting' : 'danger'} label={healthLabels[sourceHealth.status]} /></div>}</div></section>{isSkill && <p className="quiet-meta">SHA-256 {selected.instructionDigest}</p>}<div className="resource-boundary">资源定义是不可变版本包。运行中的任务继续使用被冻结的快照，客户端不能静默替换。</div></div></ClientModal></>
}
