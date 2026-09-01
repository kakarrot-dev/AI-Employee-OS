import { useEffect, useMemo, useState } from 'react'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary } from '../../shared/runtime-contract'

const steps = ['基本资料', 'System Prompt', '模型配置', 'Agent 能力', '记忆范围', '测试', '确认']
const statusLabels: Record<EmployeeSummary['status'], string> = { draft: '草稿', pending_test: '待测试', active: '可工作', disabled: '已停用', archived: '已归档', pending_changes: '有待发布修改' }
const emptyDraft: EmployeeDraftInput = { name: '', description: '', systemPrompt: '', modelId: 'deepseek-v4-pro', capabilityVersionIds: [], memoryScopes: ['employee'] }

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.split(':').at(-1)?.trim() ?? message
  const labels: Record<string, string> = {
    employee_version_not_tested: '必须先完成并确认 Sandbox 测试',
    capability_dependency_unavailable: '所选能力存在不可用依赖，不能测试或发布',
    employee_has_history: '员工已有正式引用，只能归档',
    test_not_confirmable: '测试未完成或未通过自动验收',
    provider_unavailable: '模型服务当前不可用'
  }
  return labels[code] ?? `操作失败：${code}`
}

export function TeamModule(): React.JSX.Element {
  const [view, setView] = useState<'employees' | 'capabilities'>('employees')
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [capabilities, setCapabilities] = useState<AgentCapabilityVersionView[]>([])
  const [detail, setDetail] = useState<EmployeeDetail>()
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<EmployeeDraftInput>(emptyDraft)
  const [testCase, setTestCase] = useState({ name: '', prompt: '', acceptanceCriteria: '', expectedContains: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const refreshList = async (): Promise<void> => setEmployees(await window.aiEmployeeOS.employee.list())
  const loadDetail = async (employeeId: string): Promise<EmployeeDetail> => {
    const value = await window.aiEmployeeOS.employee.detail(employeeId)
    setDetail(value)
    return value
  }

  useEffect(() => {
    void Promise.all([window.aiEmployeeOS.employee.list(), window.aiEmployeeOS.employee.capabilities()]).then(([employeeList, capabilityList]) => { setEmployees(employeeList); setCapabilities(capabilityList) }).catch((reason) => setError(errorText(reason)))
    const unsubscribe = window.aiEmployeeOS.employee.onEvent((event) => {
      if (detail?.employee.id === event.employeeId) void loadDetail(event.employeeId)
      void refreshList()
    })
    return unsubscribe
  }, [detail?.employee.id])

  const selectedCapabilityNames = useMemo(() => capabilities.filter((capability) => draft.capabilityVersionIds.includes(capability.id)).map((capability) => capability.name), [capabilities, draft.capabilityVersionIds])

  const startCreate = (): void => { setDetail(undefined); setDraft(emptyDraft); setStep(0); setEditing(true); setError(undefined) }
  const open = async (employeeId: string): Promise<void> => { setEditing(false); setError(undefined); await loadDetail(employeeId) }
  const edit = async (): Promise<void> => {
    if (!detail) return
    const value = detail.draft ? detail : await window.aiEmployeeOS.employee.beginEdit(detail.employee.id)
    setDetail(value)
    setDraft(value.draft ? { name: value.draft.name, description: value.draft.description, systemPrompt: value.draft.systemPrompt, modelId: value.draft.modelId, capabilityVersionIds: [...value.draft.capabilityVersionIds], memoryScopes: [...value.draft.memoryScopes] } : emptyDraft)
    setStep(0)
    setEditing(true)
  }

  const persist = async (): Promise<EmployeeDetail> => {
    const value = detail ? await window.aiEmployeeOS.employee.saveDraft(detail.employee.id, draft) : await window.aiEmployeeOS.employee.create(draft)
    setDetail(value)
    await refreshList()
    return value
  }

  const next = async (): Promise<void> => {
    setBusy(true); setError(undefined)
    try { await persist(); setStep((current) => Math.min(current + 1, steps.length - 1)) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const addTestCase = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try {
      const value = await window.aiEmployeeOS.employee.addTestCase(detail.employee.id, { ...testCase, expectedContains: testCase.expectedContains || undefined })
      setDetail(value); setTestCase({ name: '', prompt: '', acceptanceCriteria: '', expectedContains: '' })
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const action = async (operation: () => Promise<EmployeeDetail>): Promise<void> => {
    setBusy(true); setError(undefined)
    try { setDetail(await operation()); await refreshList() } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const runTest = async (testCaseId: string): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try { await window.aiEmployeeOS.employee.runTest(detail.employee.id, testCaseId); await loadDetail(detail.employee.id) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const remove = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try { await window.aiEmployeeOS.employee.deleteDraft(detail.employee.id); setDetail(undefined); await refreshList() } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  if (view === 'capabilities') return (
    <section className="team-module">
      <div className="team-toolbar"><div><p className="eyeline">只读目录</p><h2>Agent 能力</h2></div><div className="segmented"><button type="button" onClick={() => setView('employees')}>Agent 员工</button><button type="button" className="active">Agent 能力</button></div></div>
      <div className="capability-grid">{capabilities.map((capability) => { const available = capability.dependencies.every((dependency) => dependency.available); return <article className="capability-card" key={capability.id}><div><span className={available ? 'verified' : 'unverified'}>{available ? '可用' : '依赖未就绪'}</span><small>v{capability.version}</small></div><h3>{capability.name}</h3><p>{capability.description}</p><dl><dt>Skill</dt><dd>{capability.skillVersionIds.join('、') || '无'}</dd><dt>Tool</dt><dd>{capability.toolVersionIds.join('、') || '无'}</dd><dt>MCP</dt><dd>{capability.mcpVersionIds.join('、') || '无'}</dd></dl>{capability.dependencies.filter((dependency) => !dependency.available).map((dependency) => <p className="dependency-warning" key={dependency.versionId}>{dependency.versionId}：{dependency.reason}</p>)}</article> })}</div>
    </section>
  )

  return (
    <section className="team-module">
      <div className="team-toolbar"><div><p className="eyeline">本地团队</p><h2>Agent 员工</h2></div><div className="team-actions"><div className="segmented"><button type="button" className="active">Agent 员工</button><button type="button" onClick={() => setView('capabilities')}>Agent 能力</button></div><button type="button" className="primary-action" onClick={startCreate}>新建 Agent 员工</button></div></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {editing ? (
        <div className="employee-editor">
          <nav aria-label="创建步骤">{steps.map((label, index) => <button type="button" key={label} className={index === step ? 'active' : index < step ? 'done' : ''} onClick={() => index <= step && setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
          <div className="editor-stage">
            <div className="stage-heading"><span>步骤 {step + 1} / {steps.length}</span><h3>{steps[step]}</h3></div>
            {step === 0 && <div className="form-stack"><label>名称<input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>职责说明<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div>}
            {step === 1 && <div className="form-stack"><label>员工 System Prompt<textarea className="prompt-input" value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></label><p className="field-help">平台安全约束和运行上下文由 Runtime 分层注入，不要复制到员工 Prompt。</p></div>}
            {step === 2 && <div className="form-stack"><label>文本模型<select value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value as EmployeeDraftInput['modelId'] })}><option value="deepseek-v4-pro">deepseek-v4-pro · 已验证</option><option value="claude-sonnet-4.6">claude-sonnet-4.6 · Poe 待验证</option></select></label></div>}
            {step === 3 && <div className="choice-list">{capabilities.map((capability) => { const available = capability.dependencies.every((dependency) => dependency.available); return <label key={capability.id}><input type="checkbox" checked={draft.capabilityVersionIds.includes(capability.id)} onChange={(event) => setDraft({ ...draft, capabilityVersionIds: event.target.checked ? [...draft.capabilityVersionIds, capability.id] : draft.capabilityVersionIds.filter((id) => id !== capability.id) })} /><span><strong>{capability.name}</strong><small>{available ? '依赖可用' : '依赖未就绪，选择后不能测试或发布'}</small></span></label> })}</div>}
            {step === 4 && <div className="choice-list">{(['global', 'employee', 'task'] as const).map((scope) => <label key={scope}><input type="checkbox" checked={draft.memoryScopes.includes(scope)} onChange={(event) => setDraft({ ...draft, memoryScopes: event.target.checked ? [...draft.memoryScopes, scope] : draft.memoryScopes.filter((item) => item !== scope) })} /><span><strong>{{ global: '全局记忆', employee: '员工记忆', task: '任务记忆' }[scope]}</strong><small>正式运行时仍由 RunGrant 取交集</small></span></label>)}</div>}
            {step === 5 && <div className="test-stage"><div className="form-stack compact"><label>用例名称<input value={testCase.name} onChange={(event) => setTestCase({ ...testCase, name: event.target.value })} /></label><label>真实测试 Prompt<textarea value={testCase.prompt} onChange={(event) => setTestCase({ ...testCase, prompt: event.target.value })} /></label><label>验收标准<input value={testCase.acceptanceCriteria} onChange={(event) => setTestCase({ ...testCase, acceptanceCriteria: event.target.value })} /></label><label>必须包含（可选）<input value={testCase.expectedContains} onChange={(event) => setTestCase({ ...testCase, expectedContains: event.target.value })} /></label><button type="button" onClick={addTestCase} disabled={busy || !detail}>添加 TestCase</button></div><div className="test-list">{detail?.testCases.map((item) => { const runs = detail.testRuns.filter((run) => run.testCaseId === item.id); return <article key={item.id}><strong>{item.name}</strong><p>{item.acceptanceCriteria}</p><button type="button" onClick={() => runTest(item.id)} disabled={busy}>运行 Sandbox 测试</button>{runs.map((run) => <div className="test-result" key={run.id}><span>{run.status} · {run.automaticPassed ? '自动验收通过' : run.status === 'completed' ? '自动验收未通过' : '等待结果'}</span><p>{run.output || run.failureCode}</p>{run.status === 'completed' && run.automaticPassed && !run.userConfirmed && <button type="button" onClick={() => action(() => window.aiEmployeeOS.employee.confirmTest(detail.employee.id, run.id))}>用户确认</button>}{run.userConfirmed && <em>已确认</em>}</div>)}</article> })}</div></div>}
            {step === 6 && <div className="confirmation-card"><h3>{draft.name}</h3><p>{draft.description}</p><dl><dt>模型</dt><dd>{draft.modelId}</dd><dt>能力</dt><dd>{selectedCapabilityNames.join('、') || '未选择'}</dd><dt>记忆</dt><dd>{draft.memoryScopes.join('、') || '无'}</dd><dt>测试</dt><dd>{detail?.draft?.state === 'tested' ? '已测试并确认' : '尚未满足发布条件'}</dd></dl><button type="button" className="primary-action" disabled={busy || detail?.draft?.state !== 'tested'} onClick={() => detail && action(() => window.aiEmployeeOS.employee.publish(detail.employee.id))}>发布为可工作版本</button></div>}
            <div className="stage-footer"><button type="button" onClick={() => setEditing(false)}>退出并保留草稿</button><div>{step > 0 && <button type="button" onClick={() => setStep(step - 1)}>上一步</button>}{step < steps.length - 1 && <button type="button" className="primary-action" onClick={next} disabled={busy}>{busy ? '保存中' : '保存并继续'}</button>}</div></div>
          </div>
          <aside className="prompt-preview"><span>持续预览</span><h3>最终 System Prompt 分层</h3><ol><li><strong>平台安全层</strong><p>由客户端内置，只读且不可被员工覆盖。</p></li><li><strong>员工定义层</strong><pre>{draft.systemPrompt || '尚未填写'}</pre></li><li><strong>能力层</strong><p>{selectedCapabilityNames.join('、') || '未绑定能力'}</p></li><li><strong>运行上下文层</strong><p>正式 Run 时由 Runtime 注入最小任务与记忆范围。</p></li></ol></aside>
        </div>
      ) : (
        <div className="employee-directory">
          <div className="employee-list">{employees.length === 0 ? <div className="directory-empty"><h3>还没有 Agent 员工</h3><p>员工只能由你主动创建；总管不会自动预填。</p></div> : employees.map((employee) => <button type="button" key={employee.id} className={detail?.employee.id === employee.id ? 'active' : ''} onClick={() => void open(employee.id)}><span><strong>{employee.name}</strong><small>{statusLabels[employee.status]}</small></span><span>›</span></button>)}</div>
          <div className="employee-detail">{detail ? <><div className="detail-heading"><div><span>{statusLabels[detail.status]}</span><h3>{detail.employee.name}</h3></div><button type="button" onClick={() => void edit()}>编辑</button></div><p>{detail.draft?.description ?? detail.active?.description}</p><div className="detail-actions">{detail.employee.archived ? <button type="button" onClick={() => action(() => window.aiEmployeeOS.employee.restore(detail.employee.id))}>恢复并重新测试</button> : <><button type="button" onClick={() => action(() => window.aiEmployeeOS.employee.setDisabled(detail.employee.id, !detail.employee.disabled))}>{detail.employee.disabled ? '启用' : '停用'}</button><button type="button" onClick={() => action(() => window.aiEmployeeOS.employee.archive(detail.employee.id))}>归档</button></>}{!detail.employee.activeVersionId && detail.formalReferences.length === 0 && <button type="button" className="danger-action" onClick={remove}>彻底删除草稿</button>}</div><section className="detail-section"><h4>版本</h4>{detail.versions.map((version) => <div className="version-row" key={version.id}><span>v{version.version} · {detail.employee.activeVersionId === version.id ? '当前工作版本' : version.publishedAt ? '历史版本' : version.state}</span>{version.publishedAt && detail.employee.activeVersionId !== version.id && <button type="button" onClick={() => action(() => window.aiEmployeeOS.employee.rollback(detail.employee.id, version.id))}>回滚</button>}</div>)}</section><section className="detail-section"><h4>任务引用</h4><p>{detail.formalReferences.length ? `${detail.formalReferences.length} 个 Assignment 引用，禁止物理删除` : '暂无正式任务引用'}</p></section></> : <div className="directory-empty"><h3>选择一个员工</h3><p>查看详情、版本、测试与任务引用。</p></div>}</div>
        </div>
      )}
    </section>
  )
}
