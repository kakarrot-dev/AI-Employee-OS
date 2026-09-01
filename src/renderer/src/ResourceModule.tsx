import { useEffect, useMemo, useState } from 'react'
import type { ResourceCatalogView } from '../../shared/resource-contract'

type Tab = 'skills' | 'tools' | 'mcps' | 'sources'

const empty: ResourceCatalogView = { skills: [], tools: [], mcps: [], healthChecks: [] }

export function ResourceModule(): React.JSX.Element {
  const [catalog, setCatalog] = useState<ResourceCatalogView>(empty)
  const [tab, setTab] = useState<Tab>('skills')
  const [selectedId, setSelectedId] = useState<string>()
  const [error, setError] = useState<string>()
  const [probing, setProbing] = useState(false)

  useEffect(() => { window.aiEmployeeOS.resource.list().then(setCatalog).catch(() => setError('资源目录读取失败')) }, [])
  const items = useMemo(() => tab === 'skills' ? catalog.skills : tab === 'tools' || tab === 'sources' ? catalog.tools : catalog.mcps, [catalog, tab])
  const visible = tab === 'sources' ? items.filter((item) => item.id.includes('research-source')) : items
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0]
  const sourceHealth = selected && catalog.healthChecks.find((check) => check.adapterVersionId === selected.id)
  const probe = async (): Promise<void> => { setProbing(true); setError(undefined); try { setCatalog(await window.aiEmployeeOS.resource.probe()) } catch { setError('数据源健康检查失败') } finally { setProbing(false) } }

  return <section className="resource-module">
    <div className="resource-toolbar"><div><small>内置版本包 · 只读</small><h2>Skill、Tool、MCP 与数据源</h2></div><div className="resource-actions"><div className="segmented">{([['skills', 'Skill'], ['tools', 'Tool'], ['mcps', 'MCP'], ['sources', '数据源']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setSelectedId(undefined) }}>{label}</button>)}</div>{tab === 'sources' && <button type="button" onClick={probe} disabled={probing}>{probing ? '检查中' : '检查数据源'}</button>}</div></div>
    {error && <p className="inline-error">{error}</p>}
    <div className="resource-directory">
      <div className="resource-list">{visible.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><span><strong>{item.name}</strong><small>{item.id}</small></span><span className={item.available ? 'verified' : 'unverified'}>{item.available ? '可用' : '不可用'}</span></button>)}</div>
      <div className="resource-detail">{selected ? <>
        <div className="detail-heading"><div><span>版本 {selected.version}</span><h3>{selected.name}</h3></div><span className={selected.available ? 'verified' : 'unverified'}>{selected.available ? '可用' : '不可用'}</span></div>
        <p>{selected.description}</p><dl><dt>精确 ID</dt><dd>{selected.id}</dd><dt>创建时间</dt><dd>{selected.createdAt}</dd>
          {'health' in selected && <><dt>健康状态</dt><dd>{selected.health}</dd><dt>Credential</dt><dd>{selected.credentialStatus}</dd></>}
          {sourceHealth && <><dt>最近探测</dt><dd>{sourceHealth.status} · {sourceHealth.latencyMs}ms · {sourceHealth.checkedAt}{sourceHealth.failureCode ? ` · ${sourceHealth.failureCode}` : ''}</dd></>}
          {'sideEffect' in selected && <><dt>副作用</dt><dd>{selected.sideEffect}</dd><dt>风险</dt><dd>{selected.risk}</dd><dt>允许 Origin</dt><dd>{selected.networkOrigins.join('、')}</dd></>}
          {'toolVersionIds' in selected && <><dt>Tool</dt><dd>{selected.toolVersionIds.join('、')}</dd></>}
        </dl>
        {'steps' in selected && <div className="resource-steps"><h4>固定步骤</h4><ol>{selected.steps.map((step) => <li key={step}>{step}</li>)}</ol></div>}
        <div className="resource-boundary">定义来自 Runtime 内置不可变版本包。Agent 只能提交 Proposal；真实执行、审批、出站校验和终态由 Runtime 决定。</div>
      </> : <div className="directory-empty"><h3>暂无资源</h3><p>Runtime 尚未提供该类型。</p></div>}</div>
    </div>
  </section>
}
