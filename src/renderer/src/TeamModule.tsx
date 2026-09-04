import { useEffect, useMemo, useState } from 'react'
import { Brain, Check, Database, EditPencil, Group, Settings, ShieldCheck, Sparks, Trash, WarningTriangle } from 'iconoir-react'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeDraftInput, EmployeeSummary, ProviderStatus } from '../../shared/runtime-contract'
import { EMPLOYEE_FIELD_LIMITS, validateEmployeeDraft, type EmployeeDraftField, type EmployeeDraftIssue } from '../../shared/employee-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { Avatar, ClientModal, DetailPage, IconButton, SelectionCatalog, SelectionOption, SettingRow, SettingsBlock, StatusLight, type ClientIcon } from './components/client-ui'
import { employeeAvatarSrc } from './employee-avatar'
import { employeeStatusBreathing, employeeStatusLabel, employeeStatusTone } from './employee-status'
import { ExpertProfileContent } from './ExpertProfiles'

const emptyDraft: EmployeeDraftInput = { name: '', role: '', description: '', avatarDataUrl: undefined, systemPrompt: '', modelId: 'deepseek-v4-pro', capabilityVersionIds: [], memoryScopes: ['employee'] }
type EditorMode = 'create' | 'settings' | null
type SettingsSection = 'basic' | 'prompt' | 'model' | 'memory'

const settingsSections: Array<{ id: SettingsSection; label: string; icon: ClientIcon }> = [
  { id: 'basic', label: '基本资料', icon: Group },
  { id: 'prompt', label: '提示词', icon: EditPencil },
  { id: 'model', label: '模型与能力', icon: Brain },
  { id: 'memory', label: '记忆', icon: Database }
]

const employeeModelOptions: Array<{ id: EmployeeDraftInput['modelId']; provider: keyof ProviderStatus['credentialStatus']; providerLabel: string; description: string }> = [
  { id: 'deepseek-v4-pro', provider: 'deepseek', providerLabel: 'DeepSeek', description: '适合中文理解、推理与结构化输出。' },
  { id: 'claude-sonnet-4.6', provider: 'poe', providerLabel: 'Poe', description: '适合长文本理解、复杂指令执行与内容生成。' }
]

function includesQuery(values: string[], query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return !normalized || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

function ModelCapabilitySelection({ draft, capabilities, providerStatus, modelQuery, capabilityQuery, onModelQuery, onCapabilityQuery, onModel, onCapabilities }: { draft: EmployeeDraftInput; capabilities: AgentCapabilityVersionView[]; providerStatus: ProviderStatus; modelQuery: string; capabilityQuery: string; onModelQuery: (value: string) => void; onCapabilityQuery: (value: string) => void; onModel: (modelId: EmployeeDraftInput['modelId']) => void; onCapabilities: (ids: string[]) => void }): React.JSX.Element {
  const visibleModels = employeeModelOptions.filter((model) => includesQuery([model.id, model.providerLabel, model.description], modelQuery))
  const visibleCapabilities = capabilities
    .filter((capability) => includesQuery([capability.name, capability.description, ...capability.permissionRequirements, ...capability.requiredModelIds], capabilityQuery))
    .sort((left, right) => Number(draft.capabilityVersionIds.includes(right.id)) - Number(draft.capabilityVersionIds.includes(left.id)) || left.name.localeCompare(right.name, 'zh-CN'))

  return <div className="model-capability-selection">
    <section className="selection-config-section"><div className="selection-config-section__heading"><div><h3>运行模型</h3><p>从候选模型中选择一个作为当前员工的主模型。</p></div><span>单选 · 当前 {draft.modelId}</span></div><SelectionCatalog searchLabel="搜索运行模型" placeholder="搜索模型或 Provider" query={modelQuery} onQueryChange={onModelQuery} resultLabel={`${visibleModels.length} 个模型`} emptyMessage="没有匹配的模型。">{visibleModels.map((model) => { const registered = providerStatus.models.find((item) => item.modelId === model.id && item.modality === 'text'); const configured = providerStatus.credentialStatus[model.provider] === 'configured'; const available = configured && registered?.verification === 'verified'; const status = !configured ? `需配置 ${model.providerLabel} Credential` : registered?.verification !== 'verified' ? '模型尚未验证' : '当前可用'; return <SelectionOption key={model.id} leading={<Brain aria-hidden />} title={model.id} description={model.description} meta={`${model.providerLabel} · 文本模型`} status={<StatusLight state={available ? 'success' : 'waiting'} label={status} />} selected={draft.modelId === model.id} onSelect={() => onModel(model.id)} /> })}</SelectionCatalog></section>
    <section className="selection-config-section"><div className="selection-config-section__heading"><div><h3>Agent 能力</h3><p>可多选。已选能力优先显示，Skill、Tool、MCP 与权限由能力版本派生。</p></div><span>多选 · 已选 {draft.capabilityVersionIds.length} 项</span></div><SelectionCatalog searchLabel="搜索 Agent 能力" placeholder="搜索名称、说明或权限" query={capabilityQuery} onQueryChange={onCapabilityQuery} resultLabel={`${visibleCapabilities.length} / ${capabilities.length} 项`} emptyMessage={capabilities.length ? '没有匹配的能力。' : '尚无可绑定能力。'}>{visibleCapabilities.map((capability) => { const selected = draft.capabilityVersionIds.includes(capability.id); const dependenciesAvailable = capability.dependencies.every((dependency) => dependency.available); const modelCompatible = capability.requiredModelIds.length === 0 || capability.requiredModelIds.includes(draft.modelId); const available = dependenciesAvailable && modelCompatible; const status = !dependenciesAvailable ? '依赖未就绪' : !modelCompatible ? `需切换到 ${capability.requiredModelIds.join(' 或 ')}` : '依赖与模型均可用'; return <SelectionOption key={capability.id} leading={<Sparks aria-hidden />} title={capability.name} description={capability.description} meta={`v${capability.version} · ${capability.skillVersionIds.length} 个 Skill · ${capability.toolVersionIds.length} 个 Tool · ${capability.mcpVersionIds.length} 个 MCP`} status={<StatusLight state={available ? 'success' : 'danger'} label={status} />} selected={selected} disabled={!available && !selected} onSelect={() => onCapabilities(selected ? draft.capabilityVersionIds.filter((id) => id !== capability.id) : [...draft.capabilityVersionIds, capability.id])} /> })}</SelectionCatalog></section>
  </div>
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.split(':').at(-1)?.trim() ?? message
  const labels: Record<string, string> = { employee_version_not_tested: '必须先完成并确认 Sandbox 测试', capability_dependency_unavailable: '所选能力存在不可用依赖，不能测试或发布', capability_model_incompatible: '所选能力与当前运行模型不兼容', employee_has_history: '员工已有正式引用，只能归档', test_not_confirmable: '测试未完成或未通过自动验收', provider_unavailable: '模型服务当前不可用', invalid_employee_name: '员工名称需为 2–20 个字符', invalid_employee_role: '员工职责需为 2–40 个字符', invalid_employee_description: '职责说明需为 10–500 个字符', invalid_system_prompt: 'System Prompt 需为 10–10000 个字符', invalid_employee_avatar: '头像必须是 2 MB 以内的 PNG、JPEG 或 WebP 图片', invalid_capabilities: '员工能力配置不正确', invalid_memory_scopes: '员工记忆范围配置不正确', model_not_allowed: '请选择可用的运行模型' }
  return labels[code] ?? `操作失败：${code}`
}

function characterCount(value: string): number {
  return [...value.trim()].length
}

function FieldFeedback({ id, value, issue, min, max }: { id: string; value: string; issue?: EmployeeDraftIssue; min: number; max: number }): React.JSX.Element {
  return <small id={id} className={`form-field__feedback${issue ? ' is-error' : ''}`} aria-live={issue ? 'polite' : undefined}><span>{issue?.message ?? `${min}–${max} 个字符`}</span><span aria-label={`已输入 ${characterCount(value)} 个字符`}>{characterCount(value)}/{max}</span></small>
}

export function TeamModule({ selectedEmployeeId, skills = [], providerStatus, createRequest = 0, editRequest = 0, onEmployeesChanged, onSelectEmployee, onEditEmployee }: { selectedEmployeeId?: string; skills?: ResourceCatalogView['skills']; providerStatus: ProviderStatus; createRequest?: number; editRequest?: number; onEmployeesChanged?: (employees: EmployeeSummary[]) => void; onSelectEmployee?: (employeeId: string) => void; onEditEmployee?: () => void }): React.JSX.Element {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [capabilities, setCapabilities] = useState<AgentCapabilityVersionView[]>([])
  const [detail, setDetail] = useState<EmployeeDetail>()
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [createStep, setCreateStep] = useState<0 | 1 | 2>(0)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('basic')
  const [draft, setDraft] = useState<EmployeeDraftInput>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'已保存' | '未保存' | '保存中'>('已保存')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [dismissOpen, setDismissOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [capabilityQuery, setCapabilityQuery] = useState('')
  const [error, setError] = useState<string>()
  const [touchedFields, setTouchedFields] = useState<Set<EmployeeDraftField>>(new Set())
  const draftIssues = useMemo(() => validateEmployeeDraft(draft), [draft])
  const issueFor = (field: EmployeeDraftField): EmployeeDraftIssue | undefined => touchedFields.has(field) ? draftIssues.find((issue) => issue.field === field) : undefined

  const refreshList = async (): Promise<EmployeeSummary[]> => {
    const items = (await window.aiEmployeeOS.employee.list()).filter((employee) => employee.status !== 'archived')
    setEmployees(items); onEmployeesChanged?.(items); return items
  }
  const loadDetail = async (employeeId: string): Promise<EmployeeDetail> => {
    const value = await window.aiEmployeeOS.employee.detail(employeeId)
    setDetail(value); return value
  }

  useEffect(() => {
    let mounted = true
    void Promise.all([window.aiEmployeeOS.employee.list(), window.aiEmployeeOS.employee.capabilities()]).then(([employeeList, capabilityList]) => {
      if (!mounted) return
      const activeEmployees = employeeList.filter((employee) => employee.status !== 'archived')
      setEmployees(activeEmployees); setCapabilities(capabilityList); onEmployeesChanged?.(activeEmployees)
    }).catch((reason) => setError(errorText(reason)))
    const unsubscribe = window.aiEmployeeOS.employee.onEvent((event) => { if (detail?.employee.id === event.employeeId) void loadDetail(event.employeeId); void refreshList() })
    return () => { mounted = false; unsubscribe() }
  }, [detail?.employee.id])

  useEffect(() => { if (selectedEmployeeId && selectedEmployeeId !== detail?.employee.id && editorMode === null) void loadDetail(selectedEmployeeId) }, [selectedEmployeeId, editorMode])
  useEffect(() => { if (createRequest > 0) startCreate() }, [createRequest])
  useEffect(() => { if (editRequest > 0 && detail) void startEdit() }, [editRequest])
  useEffect(() => {
    if (editorMode !== 'settings' || saveState !== '未保存' || !detail || draftIssues.length > 0) return
    const timer = window.setTimeout(() => { void saveDraft() }, 650)
    return () => window.clearTimeout(timer)
  }, [draft, draftIssues.length, editorMode, saveState, detail?.employee.id])

  const activeVersion = detail?.draft ?? detail?.active
  const detailCapabilities = capabilities.filter((capability) => (activeVersion?.capabilityVersionIds ?? []).includes(capability.id))
  const detailSkillIds = new Set(detailCapabilities.flatMap((capability) => capability.skillVersionIds))
  const detailSkills = skills.filter((skill) => detailSkillIds.has(skill.id))

  const updateDraft = <K extends keyof EmployeeDraftInput>(key: K, value: EmployeeDraftInput[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }))
    setTouchedFields((current) => new Set(current).add(key as EmployeeDraftField))
    setError(undefined)
    if (editorMode === 'settings') setSaveState('未保存')
  }
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) { setError('头像必须是 2 MB 以内的 PNG、JPEG 或 WebP 图片'); return }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { updateDraft('avatarDataUrl', reader.result); setError(undefined) } }
    reader.onerror = () => setError('头像读取失败，请重新选择图片')
    reader.readAsDataURL(file)
  }
  const startCreate = (): void => { setDraft(emptyDraft); setTouchedFields(new Set()); setModelQuery(''); setCapabilityQuery(''); setCreateStep(0); setEditorMode('create'); setError(undefined); setSaveState('未保存') }
  const startEdit = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try {
      const value = detail.draft ? detail : await window.aiEmployeeOS.employee.beginEdit(detail.employee.id)
      const version = value.draft
      if (!version) throw new Error('Runtime 未返回可编辑草稿')
      setDetail(value); setDraft({ name: version.name, role: version.role ?? '', description: version.description, avatarDataUrl: version.avatarDataUrl, systemPrompt: version.systemPrompt, modelId: version.modelId, capabilityVersionIds: [...version.capabilityVersionIds], memoryScopes: [...version.memoryScopes] }); setTouchedFields(new Set())
      setModelQuery(''); setCapabilityQuery(''); setSettingsSection('basic'); setSaveState('已保存'); setEditorMode('settings'); await refreshList()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const saveDraft = async (): Promise<EmployeeDetail | undefined> => {
    if (!detail) return undefined
    if (draftIssues.length) { setTouchedFields(new Set(draftIssues.map((issue) => issue.field))); setSaveState('未保存'); setError(draftIssues[0].message); return undefined }
    setBusy(true); setSaveState('保存中'); setError(undefined)
    try { const value = await window.aiEmployeeOS.employee.saveDraft(detail.employee.id, draft); setDetail(value); setSaveState('已保存'); await refreshList(); return value } catch (reason) { setSaveState('未保存'); setError(errorText(reason)); return undefined } finally { setBusy(false) }
  }
  const advanceCreate = async (): Promise<void> => {
    if (!createCanContinue) { revealCurrentStepIssues(); return }
    if (createStep < 2) { setError(undefined); setCreateStep((createStep + 1) as 1 | 2); return }
    setBusy(true); setError(undefined)
    try { const value = await window.aiEmployeeOS.employee.create(draft); setDetail(value); await refreshList(); onSelectEmployee?.(value.employee.id); setEditorMode(null) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const remove = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try { await window.aiEmployeeOS.employee.deleteDraft(detail.employee.id); setDetail(undefined); setEditorMode(null); setDeleteOpen(false); const items = await refreshList(); if (items[0]) onSelectEmployee?.(items[0].id) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const dismiss = async (): Promise<void> => {
    if (!detail) return
    setBusy(true); setError(undefined)
    try {
      await window.aiEmployeeOS.employee.archive(detail.employee.id)
      setDetail(undefined); setEditorMode(null); setDismissOpen(false)
      const items = await refreshList()
      if (items[0]) onSelectEmployee?.(items[0].id)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const basicFields: EmployeeDraftField[] = ['name', 'role', 'description']
  const currentStepIssues = createStep === 0 ? draftIssues.filter((issue) => basicFields.includes(issue.field)) : createStep === 1 ? draftIssues.filter((issue) => issue.field === 'systemPrompt') : draftIssues.filter((issue) => ['modelId', 'capabilityVersionIds'].includes(issue.field))
  const createCanContinue = currentStepIssues.length === 0 && (createStep !== 2 || draft.capabilityVersionIds.length > 0)
  const revealCurrentStepIssues = (): void => {
    const fields = createStep === 0 ? basicFields : createStep === 1 ? ['systemPrompt' as const] : ['modelId' as const, 'capabilityVersionIds' as const]
    setTouchedFields((current) => new Set([...current, ...fields]))
    setError(createStep === 2 && !draft.capabilityVersionIds.length ? '请至少选择一项员工能力。' : '请先完成当前步骤的必填项。')
  }
  const navigateCreate = (nextStep: 0 | 1 | 2): void => {
    if (nextStep <= createStep) { setError(undefined); setCreateStep(nextStep); return }
    if (nextStep === createStep + 1 && createCanContinue) { setError(undefined); setCreateStep(nextStep); return }
    if (nextStep > createStep + 1) { setError('请按顺序完成创建步骤。'); return }
    revealCurrentStepIssues()
  }
  const canDelete = Boolean(detail && !detail.employee.activeVersionId && detail.formalReferences.length === 0)

  return <>
    <DetailPage className="employee-detail-page">{error && editorMode === null && <p className="inline-error" role="alert">{error}</p>}{detail ? <ExpertProfileContent detail={detail} skills={detailSkills} actions={<><IconButton label="设置" icon={Settings} onClick={onEditEmployee} /><IconButton label="解雇专家" icon={Trash} className="profile-dismiss-button" onClick={() => setDismissOpen(true)} /></>} /> : <div className="directory-empty"><h3>{employees.length ? '选择一个 Agent 员工' : '还没有 Agent 员工'}</h3><p>{employees.length ? '从左侧通讯录选择员工，查看职责、状态与能力。' : '员工只能由你主动创建；总管不会自动预填。'}</p></div>}</DetailPage>

    <ClientModal open={editorMode === 'create'} title="创建专家" eyebrow={<span className="quiet-meta">第 {createStep + 1} / 3 步</span>} size="large" onClose={() => setEditorMode(null)}><div className="modal-layout"><nav className="modal-navigation create-agent-navigation" aria-label="创建步骤">{([['基本资料', Group], ['提示词', EditPencil], ['模型与能力', Brain]] as const).map(([label, Icon], index) => <button type="button" key={label} className={createStep === index ? 'is-active' : ''} onClick={() => navigateCreate(index as 0 | 1 | 2)}><Icon aria-hidden /><span>{label}</span>{index < createStep && <Check aria-hidden />}</button>)}</nav><div className="modal-content modal-content--with-footer"><div className="modal-content__main">{error && <p className="inline-error" role="alert">{error}</p>}
      {createStep === 0 && <div className="form-section"><h2>基本资料</h2><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传新员工头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={draft.name || '新员工'} initials={draft.name.trim().slice(0, 1) || '新'} color="#c5b8e3" size="large" src={draft.avatarDataUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label><small>PNG、JPEG 或 WebP，最大 2 MB</small></div><label className="form-field"><span>员工名称</span><input value={draft.name} maxLength={EMPLOYEE_FIELD_LIMITS.name.max} aria-label="名称" aria-invalid={Boolean(issueFor('name'))} aria-describedby="create-name-feedback" onChange={(event) => updateDraft('name', event.target.value)} placeholder="例如：用户研究员" /><FieldFeedback id="create-name-feedback" value={draft.name} issue={issueFor('name')} {...EMPLOYEE_FIELD_LIMITS.name} /></label><label className="form-field"><span>员工职责</span><input value={draft.role} maxLength={EMPLOYEE_FIELD_LIMITS.role.max} aria-label="职责" aria-invalid={Boolean(issueFor('role'))} aria-describedby="create-role-feedback" onChange={(event) => updateDraft('role', event.target.value)} placeholder="例如：用户访谈与洞察分析" /><FieldFeedback id="create-role-feedback" value={draft.role} issue={issueFor('role')} {...EMPLOYEE_FIELD_LIMITS.role} /></label><label className="form-field"><span>职责说明</span><textarea rows={4} value={draft.description} maxLength={EMPLOYEE_FIELD_LIMITS.description.max} aria-label="职责说明" aria-invalid={Boolean(issueFor('description'))} aria-describedby="create-description-feedback" onChange={(event) => updateDraft('description', event.target.value)} placeholder="说明这个 Agent 负责什么，以及不负责什么。" /><FieldFeedback id="create-description-feedback" value={draft.description} issue={issueFor('description')} {...EMPLOYEE_FIELD_LIMITS.description} /></label></div>}
      {createStep === 1 && <div className="form-section"><h2>提示词</h2><label className="form-field form-field--prompt"><span>System Prompt</span><textarea rows={14} value={draft.systemPrompt} maxLength={EMPLOYEE_FIELD_LIMITS.systemPrompt.max} aria-label="System Prompt" aria-invalid={Boolean(issueFor('systemPrompt'))} aria-describedby="create-prompt-feedback" onChange={(event) => updateDraft('systemPrompt', event.target.value)} placeholder="定义角色、工作方法、输出要求和边界。" /><FieldFeedback id="create-prompt-feedback" value={draft.systemPrompt} issue={issueFor('systemPrompt')} {...EMPLOYEE_FIELD_LIMITS.systemPrompt} /></label><div className="prompt-layers"><p><ShieldCheck aria-hidden /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden /><span><strong>运行上下文层</strong><small>任务开始时按最小范围注入</small></span></p></div></div>}
      {createStep === 2 && <div className="form-section"><h2>模型与能力</h2><p>先选择一个主模型，再组合完成工作所需的多项能力。</p><ModelCapabilitySelection draft={draft} capabilities={capabilities} providerStatus={providerStatus} modelQuery={modelQuery} capabilityQuery={capabilityQuery} onModelQuery={setModelQuery} onCapabilityQuery={setCapabilityQuery} onModel={(modelId) => updateDraft('modelId', modelId)} onCapabilities={(ids) => updateDraft('capabilityVersionIds', ids)} /></div>}
    </div><div className="create-agent-actions"><div><button type="button" className="button button--quiet" onClick={createStep === 0 ? () => setEditorMode(null) : () => setCreateStep((createStep - 1) as 0 | 1)}>{createStep === 0 ? '取消' : '上一步'}</button><button type="button" className="button button--primary" disabled={!createCanContinue || busy} onClick={() => void advanceCreate()}>{busy ? '保存中' : createStep === 2 ? '创建专家' : '继续'}</button></div></div></div></div></ClientModal>

    <ClientModal open={editorMode === 'settings'} title={detail?.employee.name ?? 'Agent 设置'} identity={detail ? <div className="modal-identity employee-modal-identity"><Avatar label={draft.name || detail.employee.name} initials={(draft.name || detail.employee.name).slice(0, 1)} color="#b8c982" size="medium" src={employeeAvatarSrc({ employeeId: detail.employee.id, avatarDataUrl: draft.avatarDataUrl })} /><strong>{draft.name || detail.employee.name}</strong><StatusLight state={employeeStatusTone(detail.status)} label={employeeStatusLabel(detail.status)} breathing={employeeStatusBreathing(detail.status)} /></div> : undefined} headerMeta={canDelete ? <div className="modal-header__actions"><IconButton label="删除 Agent" icon={Trash} className="modal-delete-button" onClick={() => setDeleteOpen(true)} /></div> : undefined} size="large" onClose={() => setEditorMode(null)}>
      <div className="modal-layout">
        <nav className="modal-navigation" aria-label="Agent 设置">{settingsSections.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={settingsSection === id ? 'is-active' : ''} onClick={() => setSettingsSection(id)}><Icon aria-hidden /><span>{label}</span></button>)}</nav>
        <div className="modal-content"><div className="modal-content__main">{error && <p className="inline-error" role="alert">{error}</p>}
          {settingsSection === 'basic' && <div className="form-section employee-settings-form"><h2>基本资料</h2><p>员工身份会显示在通讯录、对话和任务协作界面。</p><SettingsBlock title="员工身份" description="头像、名称和职责共同构成员工在系统中的身份。"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={draft.name} initials={draft.name.slice(0, 1)} color="#b8c982" size="large" src={employeeAvatarSrc({ employeeId: detail?.employee.id, avatarDataUrl: draft.avatarDataUrl })} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label><small>点击替换 · 最大 2 MB</small></div><div className="employee-fields-grid"><label className="form-field"><span>员工名称</span><input value={draft.name} maxLength={EMPLOYEE_FIELD_LIMITS.name.max} aria-label="名称" aria-invalid={Boolean(issueFor('name'))} aria-describedby="settings-name-feedback" onChange={(event) => updateDraft('name', event.target.value)} /><FieldFeedback id="settings-name-feedback" value={draft.name} issue={issueFor('name')} {...EMPLOYEE_FIELD_LIMITS.name} /></label><label className="form-field"><span>员工职责</span><input value={draft.role} maxLength={EMPLOYEE_FIELD_LIMITS.role.max} aria-label="职责" aria-invalid={Boolean(issueFor('role'))} aria-describedby="settings-role-feedback" onChange={(event) => updateDraft('role', event.target.value)} /><FieldFeedback id="settings-role-feedback" value={draft.role} issue={issueFor('role')} {...EMPLOYEE_FIELD_LIMITS.role} /></label><label className="form-field form-field--wide"><span>职责说明</span><textarea rows={4} value={draft.description} maxLength={EMPLOYEE_FIELD_LIMITS.description.max} aria-label="职责说明" aria-invalid={Boolean(issueFor('description'))} aria-describedby="settings-description-feedback" onChange={(event) => updateDraft('description', event.target.value)} /><FieldFeedback id="settings-description-feedback" value={draft.description} issue={issueFor('description')} {...EMPLOYEE_FIELD_LIMITS.description} /></label></div></div></SettingsBlock></div>}
          {settingsSection === 'prompt' && <div className="form-section employee-settings-form"><h2>提示词</h2><p>定义员工的职责、工作方法、输出要求和执行边界。</p><SettingsBlock title="员工定义层" description="保存后进入员工草稿版本，由总管统一组织测试。"><label className="form-field form-field--prompt"><span>System Prompt</span><textarea rows={13} value={draft.systemPrompt} maxLength={EMPLOYEE_FIELD_LIMITS.systemPrompt.max} aria-label="System Prompt" aria-invalid={Boolean(issueFor('systemPrompt'))} aria-describedby="settings-prompt-feedback" onChange={(event) => updateDraft('systemPrompt', event.target.value)} /><FieldFeedback id="settings-prompt-feedback" value={draft.systemPrompt} issue={issueFor('systemPrompt')} {...EMPLOYEE_FIELD_LIMITS.systemPrompt} /></label></SettingsBlock><SettingsBlock title="只读注入层" description="这两层由平台和 Runtime 管理，员工不能覆盖。"><div className="prompt-layers"><p><ShieldCheck aria-hidden /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden /><span><strong>运行上下文层</strong><small>任务启动时按最小范围注入</small></span></p></div></SettingsBlock></div>}
          {settingsSection === 'model' && <div className="form-section employee-settings-form"><h2>模型与能力</h2><p>从多个候选模型中选择一个主模型，并组合多项 Agent 能力。</p><ModelCapabilitySelection draft={draft} capabilities={capabilities} providerStatus={providerStatus} modelQuery={modelQuery} capabilityQuery={capabilityQuery} onModelQuery={setModelQuery} onCapabilityQuery={setCapabilityQuery} onModel={(modelId) => updateDraft('modelId', modelId)} onCapabilities={(ids) => updateDraft('capabilityVersionIds', ids)} /><SettingsBlock title="派生边界"><SettingRow title="运行时授权" description="正式运行时仍与任务授权取交集"><ShieldCheck aria-hidden /></SettingRow><SettingRow title="测试与组队" description="由总管统一组织，不在员工设置中操作"><Group aria-hidden /></SettingRow></SettingsBlock></div>}
          {settingsSection === 'memory' && <div className="form-section employee-settings-form"><h2>记忆</h2><p>选择员工可读取的记忆范围，正式运行时仍与任务 RunGrant 取交集。</p><SettingsBlock title="可用记忆范围" description="关闭的范围不会进入员工运行上下文。"><div className="choice-stack">{(['employee', 'task', 'global'] as const).map((scope) => <label key={scope}><input type="checkbox" checked={draft.memoryScopes.includes(scope)} onChange={(event) => updateDraft('memoryScopes', event.target.checked ? [...draft.memoryScopes, scope] : draft.memoryScopes.filter((item) => item !== scope))} /><span><strong>{{ employee: '员工记忆', task: '任务记忆', global: '全局记忆' }[scope]}</strong><small>{{ employee: '该员工的长期工作偏好和经验', task: '当前任务明确允许的上下文', global: '用户确认的全局偏好与规则' }[scope]}</small></span></label>)}</div></SettingsBlock></div>}
        </div></div>
      </div>
    </ClientModal>

    <ClientModal open={deleteOpen} title={`删除 ${detail?.employee.name ?? 'Agent'}？`} size="small" nested onClose={() => setDeleteOpen(false)}><div className="confirm-dialog"><span className="danger-icon"><WarningTriangle aria-hidden /></span><p>此操作不可恢复。只有没有工作版本和正式任务引用的草稿员工可以删除。</p><div className="confirm-actions"><button type="button" className="button button--quiet" onClick={() => setDeleteOpen(false)}>取消</button><button type="button" className="button button--danger" onClick={() => void remove()} disabled={busy}>确认删除</button></div></div></ClientModal>
    <ClientModal open={dismissOpen} title={`解雇 ${detail?.employee.name ?? '专家'}？`} size="small" onClose={() => setDismissOpen(false)}><div className="confirm-dialog"><span className="danger-icon"><WarningTriangle aria-hidden /></span><p>解雇后，该专家不会再显示在通讯录中，悟空也不会再为新任务调用；历史任务与交付记录仍会保留。包含该专家的专家团也会一并退出通讯录。</p><div className="confirm-actions"><button type="button" className="button button--quiet" onClick={() => setDismissOpen(false)}>取消</button><button type="button" className="button button--danger" onClick={() => void dismiss()} disabled={busy}>{busy ? '处理中' : '确认解雇'}</button></div></div></ClientModal>
  </>
}
