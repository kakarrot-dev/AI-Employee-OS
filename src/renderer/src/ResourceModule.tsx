import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Brain, Check, Database, NavArrowRight, ShieldCheck, Sparks, Tools } from 'iconoir-react'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeSummary } from '../../shared/runtime-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { Avatar, ClientModal, DetailPage, StatusLight, type ClientIcon } from './components/client-ui'

export type ResourceKind = 'skills' | 'tools'
export type ResourceItem = ResourceCatalogView['skills'][number] | ResourceCatalogView['tools'][number]
const empty: ResourceCatalogView = { skills: [], tools: [], mcps: [], healthChecks: [] }

export function resourcesFor(catalog: ResourceCatalogView, kind: ResourceKind): ResourceItem[] {
  return kind === 'skills' ? catalog.skills : catalog.tools
}

function DependencyGroup({ title, items, icon: Icon }: { title: string; items: string[]; icon: ClientIcon }): React.JSX.Element {
  return <div><div className="dependency-groups__title"><Icon aria-hidden width={18} height={18} /><span>{title}</span></div>{items.length ? items.map((item) => <p key={item}><Check aria-hidden width={15} height={15} />{item}</p>) : <p>无</p>}</div>
}

function skillMarkdown(skill: ResourceCatalogView['skills'][number]): string {
  const steps = skill.steps.length ? skill.steps.map((step, index) => `${index + 1}. ${step}`).join('\n') : 'Runtime 未提供固定步骤。'
  const tools = skill.toolVersionIds.length ? skill.toolVersionIds.map((tool) => `- \`${tool}\``).join('\n') : '- 无'
  return `# ${skill.name}\n\n${skill.description}\n\n## 固定步骤\n\n${steps}\n\n## Tool 依赖\n\n${tools}\n\n## 运行边界\n\n正式执行时，资源版本、Agent 能力和任务 RunGrant 必须同时允许。`
}

export function ResourceModule({ catalog = empty, kind = 'skills', selectedId, probing = false, error, onProbe, onOpenEmployee }: { catalog?: ResourceCatalogView; kind?: ResourceKind; selectedId?: string; probing?: boolean; error?: string; onProbe?: () => void; onOpenEmployee?: (employeeId: string) => void }): React.JSX.Element {
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

  if (!selected) return <DetailPage><div className="directory-empty"><h3>暂无 {kind === 'skills' ? 'Skill' : 'Tool'}</h3><p>Runtime 尚未提供该类型的版本化资源。</p></div></DetailPage>
  const isSkill = 'steps' in selected
  const Icon = isSkill ? Sparks : Tools
  const sourceHealth = catalog.healthChecks.find((check) => check.adapterVersionId === selected.id)
  const health = 'health' in selected ? selected.health : selected.available ? 'available' : 'unavailable'
  const associatedSkills = isSkill ? [] : catalog.skills.filter((skill) => skill.toolVersionIds.includes(selected.id)).map((skill) => skill.name)
  const permissionItems = isSkill ? ['由 Runtime 版本、Agent 能力与任务 RunGrant 共同约束'] : [`副作用：${selected.sideEffect}`, `风险：${selected.risk}`, ...(selected.networkOrigins.length ? selected.networkOrigins.map((origin) => `网络 Origin：${origin}`) : ['不允许网络出站'])]

  return <><DetailPage>{error && <p className="inline-error">{error}</p>}
    <section className="capability-intro"><div className="capability-mark"><Icon aria-hidden width={29} height={29} /></div><div><span className="capability-category">{isSkill ? 'Skill' : 'Tool'} · v{selected.version}</span><h2>{selected.name}</h2><p>{selected.description}</p></div></section>
    {isSkill && <section className="plain-section skill-document"><div className="content-section-title"><h3>SKILL.md</h3><span>由 Runtime 结构化定义生成 · v{selected.version}</span></div><div className="markdown-rendered skill-document__markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{skillMarkdown(selected)}</ReactMarkdown></div></section>}
    <section className="plain-section"><h3>{isSkill ? '适用任务' : '可用于'}</h3><div className="use-case-list">{isSkill ? selected.steps.length ? selected.steps.map((item) => <span key={item}>{item}</span>) : <span>Runtime 未提供适用任务标签</span> : <><span>{selected.sideEffect === 'none' ? '本地无副作用调用' : selected.sideEffect === 'external_read' ? '外部只读调用' : '外部写入调用'}</span><span>{selected.risk} 风险</span></>}</div></section>
    <section className="plain-section"><h3>{isSkill ? '执行与依赖' : '调用关系'}</h3><div className="dependency-groups">{isSkill ? <><DependencyGroup icon={Brain} title="执行步骤" items={selected.steps} /><DependencyGroup icon={Tools} title="Tools" items={selected.toolVersionIds} /></> : <><DependencyGroup icon={Sparks} title="关联 Skills" items={associatedSkills} /><DependencyGroup icon={Database} title="连接与运行" items={[`健康：${selected.health}`, `Credential：${selected.credentialStatus}`]} /></>}<DependencyGroup icon={ShieldCheck} title="权限" items={permissionItems} /></div></section>
    <section className="plain-section"><div className="content-section-title"><h3>已绑定 Agent</h3><span>{linkedEmployees.length} 位</span></div>{linkedEmployees.length ? linkedEmployees.map(({ summary }) => <button type="button" className="linked-agent" key={summary.id} onClick={() => onOpenEmployee?.(summary.id)}><Avatar label={summary.name} initials={summary.name.slice(0, 1)} color="#b8c982" size="small" /><span><strong>{summary.name}</strong><small>{employeeStatusLabel(summary.status)}</small></span><NavArrowRight aria-hidden width={16} height={16} /></button>) : <p className="empty-state">尚未绑定 Agent。</p>}</section>
    <button type="button" className="advanced-disclosure" onClick={() => setAdvancedOpen(true)}>高级信息 <NavArrowRight aria-hidden width={14} height={14} /></button>
  </DetailPage>
  <ClientModal open={advancedOpen} title="能力高级信息" eyebrow={<span className="quiet-meta">只读</span>} onClose={() => setAdvancedOpen(false)}><div className="detail-browser-content"><div className="detail-browser-intro"><h3>{selected.name}</h3><p>查看资源版本、健康、依赖与运行边界。所有字段来自 Runtime。</p></div><section><div className="content-section-title"><h3>版本与状态</h3><span>{isSkill ? 'Skill' : 'Tool'}</span></div><div className="detail-data-list"><div className="detail-data-row"><span><strong>精确 ID</strong><small>{selected.id}</small></span><em>v{selected.version}</em></div><div className="detail-data-row"><span><strong>可用性</strong><small>{selected.reason ?? 'Runtime 未返回异常原因'}</small></span><StatusLight state={selected.available ? 'success' : health === 'degraded' ? 'waiting' : 'danger'} label={selected.available ? '可用' : health === 'degraded' ? '降级' : '不可用'} /></div><div className="detail-data-row"><span><strong>创建时间</strong><small>版本实体创建时间</small></span><em>{selected.createdAt}</em></div>{sourceHealth && <div className="detail-data-row"><span><strong>最近探测</strong><small>{sourceHealth.checkedAt} · {sourceHealth.latencyMs}ms</small></span><StatusLight state={sourceHealth.status === 'available' ? 'success' : sourceHealth.status === 'degraded' ? 'waiting' : 'danger'} label={sourceHealth.status} /></div>}</div></section>{!isSkill && <section><button type="button" className="button button--quiet" disabled={probing} onClick={onProbe}>{probing ? '检查中' : '重新检查资源健康'}</button></section>}<div className="resource-boundary">资源定义是不可变版本包。运行中的任务继续使用被冻结的快照，客户端不能静默替换。</div></div></ClientModal></>
}

function employeeStatusLabel(status: EmployeeSummary['status']): string {
  return ({ draft: '草稿', pending_test: '待测试', active: '可工作', disabled: '已停用', archived: '已归档', pending_changes: '有待发布修改' })[status]
}
