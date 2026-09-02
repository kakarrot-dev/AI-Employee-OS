import { useEffect, useMemo, useState } from 'react'
import { Brain, Check, Database, EditPencil, Group, NavArrowRight, Settings, ShieldCheck, Sparks, Trash, WarningTriangle } from 'iconoir-react'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary, TaskDetailView } from '../../shared/runtime-contract'
import { Avatar, ClientModal, DetailPage, IconButton, SettingRow, SettingsBlock, StatusLight, SummaryList, SummaryListItem, type ClientIcon } from './components/client-ui'

export const employeeStatusLabels: Record<EmployeeSummary['status'], string> = { draft: '草稿', pending_test: '待测试', active: '可工作', disabled: '已停用', archived: '已归档', pending_changes: '有待发布修改' }
const emptyDraft: EmployeeDraftInput = { name: '', role: '', description: '', avatarDataUrl: undefined, systemPrompt: '', modelId: 'deepseek-v4-pro', capabilityVersionIds: [], memoryScopes: ['employee'] }
type EditorMode = 'create' | 'settings' | null
type SettingsSection = 'basic' | 'prompt' | 'model' | 'memory'

const settingsSections: Array<{ id: SettingsSection; label: string; icon: ClientIcon }> = [
  { id: 'basic', label: '基本资料', icon: Group },
  { id: 'prompt', label: '提示词', icon: EditPencil },
  { id: 'model', label: '模型与能力', icon: Brain },
  { id: 'memory', label: '记忆', icon: Database }
]

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.split(':').at(-1)?.trim() ?? message
  const labels: Record<string, string> = { employee_version_not_tested: '必须先完成并确认 Sandbox 测试', capability_dependency_unavailable: '所选能力存在不可用依赖，不能测试或发布', employee_has_history: '员工已有正式引用，只能归档', test_not_confirmable: '测试未完成或未通过自动验收', provider_unavailable: '模型服务当前不可用', invalid_employee_role: '职责不能为空且不能超过 120 个字符', invalid_employee_avatar: '头像必须是 2 MB 以内的 PNG、JPEG 或 WebP 图片' }
  return labels[code] ?? `操作失败：${code}`
}

function employeeTone(status: EmployeeSummary['status']): 'success' | 'waiting' | 'muted' {
  return status === 'active' ? 'success' : status === 'disabled' || status === 'archived' ? 'muted' : 'waiting'
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
}

export function TeamModule({ selectedEmployeeId, createRequest = 0, editRequest = 0, onEmployeesChanged, onSelectEmployee, onEditEmployee }: { selectedEmployeeId?: string; createRequest?: number; editRequest?: number; onEmployeesChanged?: (employees: EmployeeSummary[]) => void; onSelectEmployee?: (employeeId: string) => void; onEditEmployee?: () => void }): React.JSX.Element {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [capabilities, setCapabilities] = useState<AgentCapabilityVersionView[]>([])
  const [tasks, setTasks] = useState<TaskDetailView[]>([])
  const [detail, setDetail] = useState<EmployeeDetail>()
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [createStep, setCreateStep] = useState<0 | 1 | 2>(0)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('basic')
  const [draft, setDraft] = useState<EmployeeDraftInput>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'已保存' | '未保存' | '保存中'>('已保存')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedDelivery, setSelectedDelivery] = useState<TaskDetailView>()
  const [error, setError] = useState<string>()

  const refreshList = async (): Promise<EmployeeSummary[]> => {
    const items = await window.aiEmployeeOS.employee.list()
    setEmployees(items); onEmployeesChanged?.(items); return items
  }
  const loadDetail = async (employeeId: string): Promise<EmployeeDetail> => {
    const value = await window.aiEmployeeOS.employee.detail(employeeId)
    setDetail(value); return value
  }

  useEffect(() => {
    let mounted = true
    void Promise.all([window.aiEmployeeOS.employee.list(), window.aiEmployeeOS.employee.capabilities(), window.aiEmployeeOS.task.list()]).then(([employeeList, capabilityList, taskList]) => {
      if (!mounted) return
      setEmployees(employeeList); setCapabilities(capabilityList); setTasks(taskList); onEmployeesChanged?.(employeeList)
    }).catch((reason) => setError(errorText(reason)))
    const unsubscribe = window.aiEmployeeOS.employee.onEvent((event) => { if (detail?.employee.id === event.employeeId) void loadDetail(event.employeeId); void refreshList() })
    const unsubscribeTask = window.aiEmployeeOS.task.onEvent(() => { void window.aiEmployeeOS.task.list().then(setTasks) })
    return () => { mounted = false; unsubscribe(); unsubscribeTask() }
  }, [detail?.employee.id])

  useEffect(() => { if (selectedEmployeeId && selectedEmployeeId !== detail?.employee.id && editorMode === null) void loadDetail(selectedEmployeeId) }, [selectedEmployeeId, editorMode])
  useEffect(() => { if (createRequest > 0) startCreate() }, [createRequest])
  useEffect(() => { if (editRequest > 0 && detail) void startEdit() }, [editRequest])
  useEffect(() => {
    if (editorMode !== 'settings' || saveState !== '未保存' || !detail) return
    const timer = window.setTimeout(() => { void saveDraft() }, 650)
    return () => window.clearTimeout(timer)
  }, [draft, editorMode, saveState, detail?.employee.id])

  const selectedCapabilityNames = useMemo(() => capabilities.filter((capability) => draft.capabilityVersionIds.includes(capability.id)).map((capability) => capability.name), [capabilities, draft.capabilityVersionIds])
  const activeVersion = detail?.draft ?? detail?.active
  const detailCapabilities = capabilities.filter((capability) => (activeVersion?.capabilityVersionIds ?? []).includes(capability.id))
  const versionIds = new Set(detail?.versions.map((version) => version.id) ?? [])
  const recentDeliveries = tasks.filter((task) => task.delivery && task.assignments.some((assignment) => versionIds.has(assignment.employeeVersionId))).sort((a, b) => String(b.timeline.at(-1)?.createdAt ?? '').localeCompare(String(a.timeline.at(-1)?.createdAt ?? ''))).slice(0, 3)

  const updateDraft = <K extends keyof EmployeeDraftInput>(key: K, value: EmployeeDraftInput[K]): void => { setDraft((current) => ({ ...current, [key]: value })); if (editorMode === 'settings') setSaveState('未保存') }
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) { setError('头像必须是 2 MB 以内的 PNG、JPEG 或 WebP 图片'); return }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { updateDraft('avatarDataUrl', reader.result); setError(undefined) } }
    reader.onerror = () => setError('头像读取失败，请重新选择图片')
    reader.readAsDataURL(file)
  }
  const startCreate = (): void => { setDraft(emptyDraft); setCreateStep(0); setEditorMode('create'); setError(undefined); setSaveState('未保存') }
  const startEdit = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try {
      const value = detail.draft ? detail : await window.aiEmployeeOS.employee.beginEdit(detail.employee.id)
      const version = value.draft
      if (!version) throw new Error('Runtime 未返回可编辑草稿')
      setDetail(value); setDraft({ name: version.name, role: version.role ?? '', description: version.description, avatarDataUrl: version.avatarDataUrl, systemPrompt: version.systemPrompt, modelId: version.modelId, capabilityVersionIds: [...version.capabilityVersionIds], memoryScopes: [...version.memoryScopes] })
      setSettingsSection('basic'); setSaveState('已保存'); setEditorMode('settings'); await refreshList()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const saveDraft = async (): Promise<EmployeeDetail | undefined> => {
    if (!detail) return undefined
    setBusy(true); setSaveState('保存中'); setError(undefined)
    try { const value = await window.aiEmployeeOS.employee.saveDraft(detail.employee.id, draft); setDetail(value); setSaveState('已保存'); await refreshList(); return value } catch (reason) { setSaveState('未保存'); setError(errorText(reason)); return undefined } finally { setBusy(false) }
  }
  const advanceCreate = async (): Promise<void> => {
    if (createStep < 2) { setCreateStep((createStep + 1) as 1 | 2); return }
    setBusy(true); setError(undefined)
    try { const value = await window.aiEmployeeOS.employee.create(draft); setDetail(value); await refreshList(); onSelectEmployee?.(value.employee.id); setEditorMode(null) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try { await window.aiEmployeeOS.employee.deleteDraft(detail.employee.id); setDetail(undefined); setEditorMode(null); setDeleteOpen(false); const items = await refreshList(); if (items[0]) onSelectEmployee?.(items[0].id) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const createCanContinue = createStep === 0 ? Boolean(draft.name.trim() && draft.role?.trim() && draft.description.trim()) : createStep === 1 ? Boolean(draft.systemPrompt.trim()) : Boolean(draft.modelId && draft.capabilityVersionIds.length)
  const navigateCreate = (nextStep: 0 | 1 | 2): void => {
    if (nextStep <= createStep) { setError(undefined); setCreateStep(nextStep); return }
    if (nextStep === createStep + 1 && createCanContinue) { setError(undefined); setCreateStep(nextStep); return }
    setError(nextStep > createStep + 1 ? '请按顺序完成创建步骤。' : '请先完成当前步骤的必填项。')
  }
  const canDelete = Boolean(detail && !detail.employee.activeVersionId && detail.formalReferences.length === 0)

  return <>
    <DetailPage>{error && editorMode === null && <p className="inline-error" role="alert">{error}</p>}{detail ? <>
      <section className="profile-intro employee-profile-intro"><div className="profile-intro__identity"><Avatar label={detail.employee.name} initials={detail.employee.name.slice(0, 1)} color="#c5b8e3" size="large" src={activeVersion?.avatarDataUrl} /><div><h2>{activeVersion?.role || 'Agent 员工'}</h2><p>{activeVersion?.description ?? '尚未填写职责说明'}</p></div></div><div className="profile-intro__actions" aria-label="员工操作"><IconButton label="设置" icon={Settings} onClick={onEditEmployee} /></div></section>
      <section className="plain-section"><h3>基本资料</h3><dl className="definition-grid"><div><dt>员工名称</dt><dd>{detail.employee.name}</dd></div><div><dt>工作状态</dt><dd><StatusLight state={employeeTone(detail.status)} label={employeeStatusLabels[detail.status]} breathing={detail.status === 'active' || detail.status === 'pending_test'} /></dd></div><div><dt>职责</dt><dd>{activeVersion?.role || '未配置'}</dd></div><div><dt>加入时间</dt><dd>{dateLabel(detail.employee.createdAt)}</dd></div></dl></section>
      <section className="plain-section"><div className="content-section-title"><h3>能力摘要</h3><span>{detailCapabilities.length} 项</span></div><SummaryList emptyMessage="尚未绑定能力。">{detailCapabilities.map((item) => <SummaryListItem key={item.id} leading={<Sparks aria-hidden width={18} height={18} />} title={item.name} subtitle={item.dependencies.every((dependency) => dependency.available) ? detail.status === 'pending_test' ? '已绑定，测试通过后可用于正式任务' : '依赖正常，可用于正式任务' : '存在不可用依赖'} trailing={<NavArrowRight aria-hidden width={16} height={16} />} />)}</SummaryList></section>
      <section className="plain-section"><div className="content-section-title"><h3>最近 3 项交付</h3><span>按时间倒序</span></div><SummaryList emptyMessage="新员工尚无交付记录。">{recentDeliveries.map((task) => <SummaryListItem key={task.id} onClick={() => setSelectedDelivery(task)} leading={<span className="delivery-list__icon"><Check aria-hidden width={16} height={16} /></span>} title={task.goal} subtitle={`${task.delivery?.artifacts.length ?? 0} 个交付物 · ${task.delivery?.evidenceCount ?? 0} 条证据`} trailing={<>已交付<NavArrowRight aria-hidden width={16} height={16} /></>} />)}</SummaryList></section>
    </> : <div className="directory-empty"><h3>{employees.length ? '选择一个 Agent 员工' : '还没有 Agent 员工'}</h3><p>{employees.length ? '从左侧通讯录选择员工，查看职责、能力与最近交付。' : '员工只能由你主动创建；总管不会自动预填。'}</p></div>}</DetailPage>

    <ClientModal open={editorMode === 'create'} title="新建 Agent 员工" eyebrow={<span className="quiet-meta">第 {createStep + 1} / 3 步</span>} size="large" onClose={() => setEditorMode(null)}><div className="modal-layout"><nav className="modal-navigation create-agent-navigation" aria-label="创建步骤">{([['基本资料', Group], ['提示词', EditPencil], ['模型与能力', Brain]] as const).map(([label, Icon], index) => <button type="button" key={label} className={createStep === index ? 'is-active' : ''} onClick={() => navigateCreate(index as 0 | 1 | 2)}><Icon aria-hidden width={17} height={17} /><span>{label}</span>{index < createStep && <Check aria-hidden width={15} height={15} />}</button>)}</nav><div className="modal-content modal-content--with-footer"><div className="modal-content__main">{error && <p className="inline-error" role="alert">{error}</p>}
      {createStep === 0 && <div className="form-section"><h2>基本资料</h2><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传新员工头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={draft.name || '新员工'} initials={draft.name.trim().slice(0, 1) || '新'} color="#c5b8e3" size="large" src={draft.avatarDataUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label></div><label className="form-field"><span>名称</span><input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="例如：用户研究员" /></label><label className="form-field"><span>职责</span><input value={draft.role ?? ''} onChange={(event) => updateDraft('role', event.target.value)} placeholder="例如：用户访谈与洞察分析" /></label><label className="form-field"><span>职责说明</span><textarea rows={4} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="说明这个 Agent 负责什么，以及不负责什么。" /></label></div>}
      {createStep === 1 && <div className="form-section"><h2>提示词</h2><label className="form-field form-field--prompt"><span>System Prompt</span><textarea rows={14} value={draft.systemPrompt} onChange={(event) => updateDraft('systemPrompt', event.target.value)} placeholder="定义角色、工作方法、输出要求和边界。" /></label><div className="prompt-layers"><p><ShieldCheck aria-hidden width={17} height={17} /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden width={17} height={17} /><span><strong>运行上下文层</strong><small>任务开始时按最小范围注入</small></span></p></div></div>}
      {createStep === 2 && <div className="form-section"><h2>模型与能力</h2><p>选择运行模型和业务能力。Tool、MCP 与权限会从能力派生。</p><div className="create-selection-group"><h3>模型</h3>{(['deepseek-v4-pro', 'claude-sonnet-4.6'] as const).map((item) => <button type="button" key={item} className={`selection-card create-selection-card${draft.modelId === item ? ' is-selected' : ''}`} onClick={() => updateDraft('modelId', item)}><Brain aria-hidden width={19} height={19} /><span><strong>{item}</strong><small>{item === 'deepseek-v4-pro' ? '可由 Provider 状态验证' : '需要 Poe Credential'}</small></span>{draft.modelId === item && <Check aria-hidden width={18} height={18} />}</button>)}</div><div className="create-selection-group"><h3>能力</h3>{capabilities.map((item) => { const selected = draft.capabilityVersionIds.includes(item.id); const available = item.dependencies.every((dependency) => dependency.available); return <button type="button" key={item.id} className={`selection-card create-selection-card${selected ? ' is-selected' : ''}`} onClick={() => updateDraft('capabilityVersionIds', selected ? draft.capabilityVersionIds.filter((id) => id !== item.id) : [...draft.capabilityVersionIds, item.id])}><Sparks aria-hidden width={19} height={19} /><span><strong>{item.name}</strong><small>{available ? '依赖可用' : '依赖未就绪，不能参与总管测试'}</small></span>{selected && <Check aria-hidden width={18} height={18} />}</button> })}</div></div>}
    </div><div className="create-agent-actions"><div><button type="button" className="button button--quiet" onClick={createStep === 0 ? () => setEditorMode(null) : () => setCreateStep((createStep - 1) as 0 | 1)}>{createStep === 0 ? '取消' : '上一步'}</button><button type="button" className="button button--primary" disabled={!createCanContinue || busy} onClick={() => void advanceCreate()}>{busy ? '保存中' : createStep === 2 ? '创建员工' : '继续'}</button></div></div></div></div></ClientModal>

    <ClientModal open={editorMode === 'settings'} title={detail?.employee.name ?? 'Agent 设置'} identity={detail ? <div className="modal-identity employee-modal-identity"><Avatar label={draft.name || detail.employee.name} initials={(draft.name || detail.employee.name).slice(0, 1)} color="#b8c982" size="medium" src={draft.avatarDataUrl} /><strong>{draft.name || detail.employee.name}</strong><StatusLight state={employeeTone(detail.status)} label={employeeStatusLabels[detail.status]} breathing={detail.status === 'active' || detail.status === 'pending_test'} /></div> : undefined} headerMeta={canDelete ? <div className="modal-header__actions"><IconButton label="删除 Agent" icon={Trash} className="modal-delete-button" onClick={() => setDeleteOpen(true)} /></div> : undefined} size="large" onClose={() => setEditorMode(null)}>
      <div className="modal-layout">
        <nav className="modal-navigation" aria-label="Agent 设置">{settingsSections.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={settingsSection === id ? 'is-active' : ''} onClick={() => setSettingsSection(id)}><Icon aria-hidden width={17} height={17} /><span>{label}</span></button>)}</nav>
        <div className="modal-content"><div className="modal-content__main">{error && <p className="inline-error" role="alert">{error}</p>}
          {settingsSection === 'basic' && <div className="form-section employee-settings-form"><h2>基本资料</h2><p>员工身份会显示在通讯录、对话和任务协作界面。</p><SettingsBlock title="员工身份" description="头像、名称和职责共同构成员工在系统中的身份。"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={draft.name} initials={draft.name.slice(0, 1)} color="#b8c982" size="large" src={draft.avatarDataUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label><small>点击头像替换</small></div><div className="employee-fields-grid"><label className="form-field"><span>名称</span><input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></label><label className="form-field"><span>职责</span><input value={draft.role ?? ''} onChange={(event) => updateDraft('role', event.target.value)} /></label><label className="form-field form-field--wide"><span>职责说明</span><textarea rows={4} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} /></label></div></div></SettingsBlock></div>}
          {settingsSection === 'prompt' && <div className="form-section employee-settings-form"><h2>提示词</h2><p>定义员工的职责、工作方法、输出要求和执行边界。</p><SettingsBlock title="员工定义层" description="保存后进入员工草稿版本，由总管统一组织测试。"><label className="form-field form-field--prompt"><span>System Prompt</span><textarea rows={13} value={draft.systemPrompt} onChange={(event) => updateDraft('systemPrompt', event.target.value)} /></label></SettingsBlock><SettingsBlock title="只读注入层" description="这两层由平台和 Runtime 管理，员工不能覆盖。"><div className="prompt-layers"><p><ShieldCheck aria-hidden width={17} height={17} /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden width={17} height={17} /><span><strong>运行上下文层</strong><small>任务启动时按最小范围注入</small></span></p></div></SettingsBlock></div>}
          {settingsSection === 'model' && <div className="form-section employee-settings-form"><h2>模型与能力</h2><p>模型负责推理，Agent 能力定义可调用的 Skill、Tool、MCP 和权限。</p><SettingsBlock title="运行模型" description="选择当前草稿版本使用的模型。"><div className="settings-selection-grid">{(['deepseek-v4-pro', 'claude-sonnet-4.6'] as const).map((item) => <button type="button" key={item} className={`selection-card${draft.modelId === item ? ' is-selected' : ''}`} onClick={() => updateDraft('modelId', item)}><Brain aria-hidden width={19} height={19} /><span><strong>{item}</strong><small>草稿运行模型</small></span>{draft.modelId === item && <Check aria-hidden width={18} height={18} />}</button>)}</div></SettingsBlock><SettingsBlock title="Agent 能力" description={`${selectedCapabilityNames.length} 项已绑定，能力依赖未就绪时不能参与总管测试。`}>{capabilities.length ? <div className="settings-selection-grid">{capabilities.map((item) => { const selected = draft.capabilityVersionIds.includes(item.id); return <button type="button" className={`selection-card${selected ? ' is-selected' : ''}`} key={item.id} onClick={() => updateDraft('capabilityVersionIds', selected ? draft.capabilityVersionIds.filter((id) => id !== item.id) : [...draft.capabilityVersionIds, item.id])}><Sparks aria-hidden width={19} height={19} /><span><strong>{item.name}</strong><small>{item.dependencies.every((dependency) => dependency.available) ? '依赖正常' : '存在不可用依赖'}</small></span>{selected && <Check aria-hidden width={18} height={18} />}</button>})}</div> : <p className="empty-state">尚无可绑定能力。</p>}</SettingsBlock><SettingsBlock title="派生边界"><SettingRow title="运行时授权" description="正式运行时仍与任务授权取交集"><ShieldCheck aria-hidden width={18} height={18} /></SettingRow><SettingRow title="测试与组队" description="由总管统一组织，不在员工设置中操作"><Group aria-hidden width={18} height={18} /></SettingRow></SettingsBlock></div>}
          {settingsSection === 'memory' && <div className="form-section employee-settings-form"><h2>记忆</h2><p>选择员工可读取的记忆范围，正式运行时仍与任务 RunGrant 取交集。</p><SettingsBlock title="可用记忆范围" description="关闭的范围不会进入员工运行上下文。"><div className="choice-stack">{(['employee', 'task', 'global'] as const).map((scope) => <label key={scope}><input type="checkbox" checked={draft.memoryScopes.includes(scope)} onChange={(event) => updateDraft('memoryScopes', event.target.checked ? [...draft.memoryScopes, scope] : draft.memoryScopes.filter((item) => item !== scope))} /><span><strong>{{ employee: '员工记忆', task: '任务记忆', global: '全局记忆' }[scope]}</strong><small>{{ employee: '该员工的长期工作偏好和经验', task: '当前任务明确允许的上下文', global: '用户确认的全局偏好与规则' }[scope]}</small></span></label>)}</div></SettingsBlock></div>}
        </div></div>
      </div>
    </ClientModal>

    <ClientModal open={deleteOpen} title={`删除 ${detail?.employee.name ?? 'Agent'}？`} size="small" nested onClose={() => setDeleteOpen(false)}><div className="confirm-dialog"><span className="danger-icon"><WarningTriangle aria-hidden width={24} height={24} /></span><p>此操作不可恢复。只有没有工作版本和正式任务引用的草稿员工可以删除。</p><div className="confirm-actions"><button type="button" className="button button--quiet" onClick={() => setDeleteOpen(false)}>取消</button><button type="button" className="button button--danger" onClick={() => void remove()} disabled={busy}>确认删除</button></div></div></ClientModal>
    <ClientModal open={Boolean(selectedDelivery)} title={selectedDelivery?.goal ?? '交付详情'} eyebrow={selectedDelivery ? <StatusLight state="success" label="已交付" /> : undefined} size="medium" onClose={() => setSelectedDelivery(undefined)}><div className="matter-detail-content">{selectedDelivery?.delivery && <><section><div className="content-section-title"><h3>验收结果</h3><span>{selectedDelivery.delivery.evidenceCount} 条证据</span></div><div className="detail-data-list">{selectedDelivery.delivery.acceptanceResults.map((item) => <div className="detail-data-row" key={item.criterion}><span><strong>{item.criterion}</strong><small>Runtime 验收记录</small></span><StatusLight state={item.passed ? 'success' : 'danger'} label={item.passed ? '通过' : '未通过'} /></div>)}</div></section><section><div className="content-section-title"><h3>交付物</h3><span>{selectedDelivery.delivery.artifacts.length} 个</span></div><div className="detail-data-list">{selectedDelivery.delivery.artifacts.map((item) => <div className="detail-data-row" key={item.id}><span><strong>{item.relativePath}</strong><small>{item.mediaType}</small></span><em>{item.sha256.slice(0, 10)}…</em></div>)}</div></section></>}</div></ClientModal>
  </>
}
