import { useRef, useState, type ReactNode } from 'react'
import { NavArrowLeft, Sparks } from 'iconoir-react'
import { DetailPage, DetailSectionHeader, SearchBox } from '../../../src/renderer/src/components/client-ui'
import { blankExpertDraft, expertCapabilities, expertDraftIssues, expertInputChoices, expertModels, expertOutputChoices, expertQuestions, expertSections, normalizeExpertDraft, type ExpertDraft, type ExpertSection } from './expert-creation'
import './expert-creation.css'

export function CreateExpertPage({ draft, onChange, onCreate, onBack }: { draft: ExpertDraft; onChange: (draft: ExpertDraft) => void; onCreate: (draft: ExpertDraft) => void; onBack: () => void }): React.JSX.Element {
  const [section, setSection] = useState<ExpertSection>('basic')
  const [submitted, setSubmitted] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const formRef = useRef<HTMLFormElement>(null)
  const issues = expertDraftIssues(draft)
  const patch = (value: Partial<ExpertDraft>): void => onChange({ ...draft, ...value })
  const issueFor = (field: keyof ExpertDraft): string | undefined => submitted ? issues.find(issue => issue.field === field)?.message : undefined
  const feedback = (field: keyof ExpertDraft, hint?: string): ReactNode => <small id={`expert-${field}-feedback`} className={`form-field__feedback${issueFor(field) ? ' is-error' : ''}`} role={issueFor(field) ? 'alert' : undefined}>{issueFor(field) || hint}</small>
  const field = (key: 'name' | 'description' | 'prompt' | 'opening' | 'questions', label: string, hint: string, placeholder: string, maxLength?: number, rows?: number): ReactNode => {
    const props = { id: `expert-${key}`, 'aria-label': label, 'aria-invalid': Boolean(issueFor(key)), 'aria-describedby': `expert-${key}-feedback`, value: draft[key], maxLength, placeholder, required: ['name', 'description', 'prompt'].includes(key), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => patch({ [key]: event.target.value }) }
    return <label className="form-field"><span>{label}{props.required && <span className="expert-required"> *</span>}</span>{rows ? <textarea {...props} rows={rows} /> : <input {...props} />}{feedback(key, hint)}</label>
  }
  const numberField = (key: 'maxTokens' | 'timeout' | 'temperature' | 'topP', label: string, min: number, max: number, step = 1): ReactNode => <label className="form-field"><span>{label}</span><input id={`expert-${key}`} type="number" aria-label={label} aria-invalid={Boolean(issueFor(key))} aria-describedby={`expert-${key}-feedback`} value={Number.isNaN(draft[key]) ? '' : draft[key]} min={min} max={max} step={step} onChange={event => patch({ [key]: event.target.value === '' ? NaN : Number(event.target.value) })} />{feedback(key, `${min}–${max}`)}</label>
  const matchingCapabilities = expertCapabilities.filter(capability => (kind === 'all' || kind === capability.kind) && `${capability.name} ${capability.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const toggleFormat = (key: 'inputs' | 'outputs', id: string): void => patch({ [key]: draft[key].includes(id) ? draft[key].filter(value => value !== id) : [...draft[key], id] })
  const changeSection = (next: ExpertSection): void => {
    setSection(next)
    formRef.current?.querySelector('.expert-create-layout')?.scrollTo?.({ top: 0 })
  }

  return <DetailPage width="wide" className="expert-create-page">
    <form ref={formRef} aria-label="创建专家" noValidate onSubmit={event => {
      event.preventDefault(); setSubmitted(true)
      if (issues.length) {
        changeSection(issues[0].section)
        requestAnimationFrame(() => document.getElementById(`expert-${issues[0].field}`)?.focus())
        return
      }
      onCreate(normalizeExpertDraft(draft))
    }}>
      <header className="expert-create-header"><div><button type="button" className="expert-back" onClick={onBack}><NavArrowLeft aria-hidden />专家市场</button><h2>创建你的专属专家</h2><p>定义它的专长、回答方式和可使用的能力。</p></div><div className="expert-create-actions"><button type="button" className="button button--quiet" onClick={() => { onChange(blankExpertDraft()); onBack() }}>取消</button><button type="submit" className="button button--primary">创建并聊天</button></div></header>
      <nav className="expert-section-nav" aria-label="专家配置分区">{expertSections.map(item => <button type="button" key={item.id} aria-current={section === item.id ? 'step' : undefined} onClick={() => changeSection(item.id)}>{item.name}{submitted && issues.some(issue => issue.section === item.id) && <span className="expert-error-dot" aria-label="有待完善项" />}</button>)}</nav>
      <div className="expert-create-layout"><div className="expert-create-fields">
        {section === 'basic' && <>
          <section className="expert-form-section"><DetailSectionHeader title="专家资料" description="展示在专家市场和对话中的个人名片。" />
            {field('name', '专家名称', '2–20 个字符，取一个容易辨认的名字', '例如：考研英语陪练', 20)}
            {field('description', '专家简介', '最多 200 字，说明可以帮你做什么', '陪我练习考研英语阅读，讲解长难句并整理易错词。', 200, 3)}
          </section>
          <section className="expert-form-section"><DetailSectionHeader title="回答规则" description="写清职责、工作步骤和边界，让专家更懂你的期待。" />
            {field('prompt', '系统提示词', '最多 8000 字；需要外部操作时，使用已配置的工具并以执行结果为依据', '你是一位耐心的英语陪练。先了解我的水平和目标，再给出分步讲解；每次练习后总结易错点。信息不足时先追问。', 8000, 8)}
          </section>
          <section className="expert-form-section"><DetailSectionHeader title="开始聊天" description="选填，帮助你更快开启第一轮对话。" />
            {field('opening', '开场白', '最多 200 字', '你好，今天想一起解决什么问题？', 200, 2)}
            {field('questions', '推荐问题', '每行一条，最多 4 条，每条最多 80 字', '帮我制定一周复习计划\n带我练习一篇英语阅读', undefined, 4)}
          </section>
        </>}
        {section === 'model' && <section className="expert-form-section"><DetailSectionHeader title="模型配置" description="选择运行模型，调整回复长度与生成方式。" />
          <label className="form-field"><span>运行模型 <span className="expert-required">*</span></span><select id="expert-model" aria-label="运行模型" value={draft.model} onChange={event => patch({ model: event.target.value })}>{expertModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select>{feedback('model', 'glm-5.2 支持图片与音频输入，请按需要选择。')}</label>
          <div className="expert-field-pair">{numberField('maxTokens', '最大输出 Token', 1, 32768)}{numberField('timeout', '响应超时（秒）', 1, 120)}</div>
          <label className="expert-check"><input type="checkbox" checked={draft.streaming} onChange={event => patch({ streaming: event.target.checked })} />流式回复<span>逐步显示回答内容</span></label>
          <details className="expert-generation" open={Boolean(issueFor('temperature') || issueFor('topP')) || undefined}><summary>生成参数</summary><div className="expert-field-pair">{numberField('temperature', '温度', 0, 1, 0.1)}{numberField('topP', 'Top P', 0.01, 1, 0.05)}</div><p>温度越低，回答越稳定；Top P 控制候选内容的范围。</p></details>
        </section>}
        {section === 'capabilities' && <section className="expert-form-section"><DetailSectionHeader title="Skill / Tool / MCP" description="按需添加工作技能、常用工具或业务系统操作。" meta={`已选 ${draft.capabilities.length} 项`} />
          <p className="expert-capability-note">通过使用者账号访问本人有权使用的资料，修改或发送前由本人确认。</p>
          <SearchBox label="搜索执行能力" placeholder="搜索技能、工具或 MCP" value={query} onChange={setQuery} />
          <div className="expert-capability-filters" role="group" aria-label="能力类型">{[['all', '全部'], ['skill', 'Skill'], ['tool', 'Tool'], ['mcp', 'MCP']].map(([id, label]) => <button className="button button--quiet" type="button" key={id} aria-pressed={kind === id} onClick={() => setKind(id)}>{label}</button>)}<span>知识库 · 敬请期待</span></div>
          <div id="expert-capabilities" tabIndex={-1}>{feedback('capabilities')}{matchingCapabilities.map(capability => {
            const binding = draft.capabilities.find(item => item.id === capability.id)
            return <article key={capability.id} className={`expert-capability${binding ? ' is-selected' : ''}`}><label className="expert-capability-heading"><input type="checkbox" aria-label={`添加${capability.name}`} checked={Boolean(binding)} onChange={event => patch({ capabilities: event.target.checked ? [...draft.capabilities, { id: capability.id, version: capability.versions[0], actions: capability.actions.filter(action => !action.write).map(action => action.id) }] : draft.capabilities.filter(item => item.id !== capability.id) })} /><span><strong>{capability.name}</strong><small>{capability.description}</small></span><span className="expert-kind">{capability.kind === 'skill' ? 'Skill' : capability.kind === 'tool' ? 'Tool' : 'MCP'}</span></label>
              {binding && <div className="expert-capability-options"><label>版本<select aria-label={`${capability.name}版本`} value={binding.version} onChange={event => patch({ capabilities: draft.capabilities.map(item => item.id === binding.id ? { ...item, version: event.target.value } : item) })}>{capability.versions.map(version => <option value={version} key={version}>v{version}</option>)}</select></label>{capability.actions.map(action => <label className="expert-check" key={action.id}><input type="checkbox" aria-label={`${capability.name}：${action.name}`} checked={binding.actions.includes(action.id)} onChange={event => patch({ capabilities: draft.capabilities.map(item => item.id === binding.id ? { ...item, actions: event.target.checked ? [...item.actions, action.id] : item.actions.filter(id => id !== action.id) } : item) })} />{action.name}<span>{action.write ? '执行前由本人确认' : '只读'}</span></label>)}</div>}
            </article>
          })}{!matchingCapabilities.length && <p role="status" className="expert-capability-note">没有匹配的能力，试试其他关键词或分类。</p>}</div>
        </section>}
        {section === 'io' && <>{(['inputs', 'outputs'] as const).map(key => <section className="expert-form-section" key={key}><DetailSectionHeader title={key === 'inputs' ? '输入格式' : '输出格式'} description={key === 'inputs' ? '允许用户提供的内容，可多选，至少保留一种。' : '专家返回结果的格式，可多选，至少保留一种。'} /><fieldset id={`expert-${key}`} tabIndex={-1} className="expert-format-grid" aria-label={key === 'inputs' ? '输入格式' : '输出格式'}>{(key === 'inputs' ? expertInputChoices : expertOutputChoices).map(choice => <label className={`expert-format${draft[key].includes(choice.id) ? ' is-selected' : ''}`} key={choice.id}><input type="checkbox" checked={draft[key].includes(choice.id)} onChange={() => toggleFormat(key, choice.id)} /><span><strong>{choice.name}</strong>{'hint' in choice && <small>{String(choice.hint)}</small>}</span></label>)}</fieldset>{feedback(key)}</section>)}</>}
        <p className="expert-prototype-note">本地原型演示：配置与专家仅保留在本次页面中，刷新后重置；尚未连接模型、工具或文件生成服务。</p>
      </div>
      <aside className="expert-preview" aria-label="专家预览"><span className="expert-preview-label">对话预览</span><div className="expert-preview-identity"><span className="expert-preview-avatar" aria-hidden>{draft.name.trim().slice(0, 1) || <Sparks />}</span><h3>{draft.name.trim() || '你的专属专家'}</h3><p>{draft.description.trim() || '介绍一下它能帮你做什么'}</p></div><div className="expert-preview-opening">{draft.opening.trim() || '你好，今天想聊些什么？'}</div>{expertQuestions(draft).slice(0, 4).map((question, index) => <div className="expert-preview-question" key={index}>{question}</div>)}<dl className="expert-preview-facts"><div><dt>运行模型</dt><dd>{draft.model}</dd></div><div><dt>执行能力</dt><dd>{draft.capabilities.length ? `${draft.capabilities.length} 项` : '使用模型回答'}</dd></div><div><dt>输出格式</dt><dd>{draft.outputs.map(id => expertOutputChoices.find(choice => choice.id === id)?.name).join('、') || '待选择'}</dd></div></dl><p className="expert-preview-note">创建后可在“我创建的”中找到它</p></aside>
      </div>
    </form>
  </DetailPage>
}

export function ExpertConfigurationDetails({ config }: { config: ExpertDraft }): React.JSX.Element {
  return <section className="plain-section expert-saved-config" aria-label="专家配置"><h3>专家配置</h3><dl>
    <div><dt>模型与回复</dt><dd>{config.model} · {config.maxTokens} Token · {config.timeout} 秒 · {config.streaming ? '流式回复' : '完整回复'}</dd></div>
    <div><dt>生成参数</dt><dd>温度 {config.temperature} · Top P {config.topP}</dd></div>
    <div><dt>输入格式</dt><dd>{config.inputs.map(id => expertInputChoices.find(choice => choice.id === id)?.name).join('、')}</dd></div>
    <div><dt>输出格式</dt><dd>{config.outputs.map(id => expertOutputChoices.find(choice => choice.id === id)?.name).join('、')}</dd></div>
    <div><dt>执行能力</dt><dd>{config.capabilities.length ? config.capabilities.map(binding => {
      const capability = expertCapabilities.find(item => item.id === binding.id)
      return <p key={binding.id}>{capability?.name} · v{binding.version}<br />{capability?.actions.filter(action => binding.actions.includes(action.id)).map(action => `${action.name}${action.write ? '（执行前由本人确认）' : ''}`).join('、')}</p>
    }) : '未添加，使用模型回答'}</dd></div>
    {config.opening && <div><dt>开场白</dt><dd>{config.opening}</dd></div>}
    {expertQuestions(config).length > 0 && <div><dt>推荐问题</dt><dd>{expertQuestions(config).map((question, index) => <p key={index}>{question}</p>)}</dd></div>}
  </dl></section>
}
