import { useState } from 'react'
import { Community, NavArrowRight, UserPlus } from 'iconoir-react'
import type { AgentCapabilityVersionView, EmployeeDetail, EmployeeSummary } from '../../shared/runtime-contract'
import type { ExpertGroupView } from '../../shared/expert-group-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { Avatar, ClientModal, DetailPage, DetailSectionHeader, DetailState, ProfileSummary, ProfileValueTags, StatusLight, SummaryCard, SummaryCardGrid } from './components/client-ui'
import { employeeAvatarSrc } from './employee-avatar'
import { candidateExpertGroups, type ExpertGroupSummary } from './ExpertGroupDirectory'
import { ExpertGroupAvatar } from './ExpertGroupAvatar'
import { ExpertGroupProfileContent, ExpertProfileContent, skillsForExpert } from './ExpertProfiles'
import { employeeStatusLabel, employeeStatusTone } from './employee-status'
import recruitmentAgentAvatars from './assets/employee-avatars/recruitment-agents.png'

interface RecruitmentEmployee {
  id: string
  name: string
  description: string
  color: string
  avatarPosition?: string
  sourcePath?: string
}

interface RecruitmentCategory {
  id: string
  name: string
  description: string
  employees: RecruitmentEmployee[]
}

const recruitmentCategories: RecruitmentCategory[] = [
  {
    id: 'analysis',
    name: '信息与分析',
    description: '收集、核验并提炼公开信息与客户材料。',
    employees: [
      { id: 'employee.network-intelligence', name: '网络情报员', description: '公开网络情报搜集、交叉核验与证据交接。', color: '#9ebd79' },
      { id: 'employee.feishu-researcher', name: '飞书资料员', description: '飞书知识库与文档检索、只读统计和证据交接。', color: '#789a78' },
      { id: 'employee.tender-analyst', name: '招投标分析员', description: '客户招投标材料解析、要求归类与写作交接。', color: '#d7b36a' }
    ]
  },
  {
    id: 'delivery',
    name: '内容与交付',
    description: '把事实、证据与要求整理为可验收的内容。',
    employees: [
      { id: 'employee.document-writer', name: '文档编写员', description: '证据驱动的本机文档编写与精确编辑。', color: '#85a9c7' }
    ]
  },
  {
    id: 'product-research',
    name: '产品与研究',
    description: '发现真实问题，并把洞察转化为产品决策。',
    employees: [
      {
        id: 'candidate.product-manager',
        name: '产品经理',
        description: '负责产品发现、策略、路线图与跨团队协同。',
        color: '#b36f4d',
        avatarPosition: '0% 0%',
        sourcePath: 'agency-agents/product/product-manager.md'
      },
      {
        id: 'candidate.ux-researcher',
        name: '用户体验研究员',
        description: '开展用户访谈、可用性测试并沉淀研究洞察。',
        color: '#6f9691',
        avatarPosition: '33.333% 0%',
        sourcePath: 'agency-agents/design/design-ux-researcher.md'
      }
    ]
  },
  {
    id: 'engineering-quality',
    name: '工程与质量',
    description: '约束技术方案质量，并验证真实上线准备度。',
    employees: [
      {
        id: 'candidate.software-architect',
        name: '软件架构师',
        description: '负责系统边界、技术权衡与演进式架构设计。',
        color: '#3e5975',
        avatarPosition: '66.667% 0%',
        sourcePath: 'agency-agents/engineering/engineering-software-architect.md'
      },
      {
        id: 'candidate.code-reviewer',
        name: '代码审查员',
        description: '从正确性、安全性与可维护性审查代码。',
        color: '#426557',
        avatarPosition: '100% 0%',
        sourcePath: 'agency-agents/engineering/engineering-code-reviewer.md'
      },
      {
        id: 'candidate.reality-checker',
        name: '生产就绪验证员',
        description: '以可验证证据评估集成质量与上线准备度。',
        color: '#59636d',
        avatarPosition: '0% 100%',
        sourcePath: 'agency-agents/testing/testing-reality-checker.md'
      }
    ]
  },
  {
    id: 'solution-business',
    name: '方案与业务',
    description: '把复杂需求转化为可落地、可赢单的解决方案。',
    employees: [
      {
        id: 'candidate.workflow-architect',
        name: '工作流架构师',
        description: '梳理流程分支、恢复机制与跨角色交接契约。',
        color: '#8b6449',
        avatarPosition: '33.333% 100%',
        sourcePath: 'agency-agents/specialized/specialized-workflow-architect.md'
      },
      {
        id: 'candidate.proposal-strategist',
        name: '提案策略师',
        description: '提炼赢单主题并构建有证据支撑的提案叙事。',
        color: '#824d57',
        avatarPosition: '66.667% 100%',
        sourcePath: 'agency-agents/sales/sales-proposal-strategist.md'
      },
      {
        id: 'candidate.government-digital-presales-consultant',
        name: '政务数字化售前顾问',
        description: '面向 ToG 场景提供方案、合规与投标支撑。',
        color: '#45627f',
        avatarPosition: '100% 100%',
        sourcePath: 'agency-agents/specialized/government-digital-presales-consultant.md'
      }
    ]
  }
]

function RecruitmentAvatar({ employee }: { employee: RecruitmentEmployee }): React.JSX.Element {
  if (!employee.avatarPosition) {
    return <Avatar label={employee.name} initials={employee.name.slice(0, 1)} color={employee.color} size="medium" src={employeeAvatarSrc({ employeeId: employee.id })} />
  }

  return <span
    aria-label={employee.name}
    className="avatar avatar--medium recruitment-avatar"
    role="img"
    style={{ backgroundImage: `url(${recruitmentAgentAvatars})`, backgroundPosition: employee.avatarPosition }}
  />
}

export type RecruitmentKind = 'experts' | 'groups'

type RecruitmentSelection =
  | { kind: 'expert'; employee: RecruitmentEmployee; categoryName: string; summary?: EmployeeSummary }
  | { kind: 'group'; group: ExpertGroupView; mode: 'directory' | 'candidate' }

function candidateGroupView(group: ExpertGroupSummary): ExpertGroupView {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: '',
    status: 'active',
    members: group.members.map((member) => ({ employeeId: member.id, name: member.name.replace(' Agent', ''), role: member.responsibility, status: 'draft' }))
  }
}

function groupIsCallable(group: ExpertGroupView): boolean {
  return group.status === 'active' && group.members.length > 0 && group.members.every((member) => member.status === 'active' && Boolean(member.employeeVersionId))
}

function CandidateExpertProfile({ employee, categoryName, summary }: { employee: RecruitmentEmployee; categoryName: string; summary?: EmployeeSummary }): React.JSX.Element {
  const name = summary?.name ?? employee.name
  const status = summary ? employeeStatusLabel(summary.status) : '未招募'
  return <div className="expert-profile-content recruitment-candidate-profile">
    <ProfileSummary identity={{ name, initials: name.slice(0, 1), color: employee.color, avatarSrc: employeeAvatarSrc({ employeeId: employee.id, avatarDataUrl: summary?.avatarDataUrl }) }} avatar={<RecruitmentAvatar employee={{ ...employee, name }} />} title={summary?.role || categoryName} description={employee.description} />
    <ProfileValueTags items={[
      { label: '当前状态', accessibleValue: status, value: <StatusLight state={summary ? employeeStatusTone(summary.status) : 'muted'} label={status} /> },
      { label: '专家类型', accessibleValue: '单 Agent 专家', value: '单 Agent 专家' },
      { label: '工作方向', accessibleValue: categoryName, value: categoryName }
    ]} />
    <section className="plain-section recruitment-responsibility"><div className="content-section-title"><h3>职责说明</h3><span>候选资料</span></div><p>{employee.description}</p></section>
  </div>
}

function RecruitmentOverview({ kind, itemCount, recruitedCount }: { kind: RecruitmentKind; itemCount: number; recruitedCount: number }): React.JSX.Element {
  const isExperts = kind === 'experts'
  const metrics = isExperts
    ? [{ label: '候选专家', value: itemCount }, { label: '已招募', value: recruitedCount }, { label: '工作类型', value: recruitmentCategories.length }]
    : [{ label: '可选专家团', value: itemCount }, { label: '已招募', value: recruitedCount }, { label: '协作方式', value: '多 Agent' }]

  return <section className={`recruitment-overview recruitment-overview--${kind}`} aria-labelledby={`recruitment-${kind}-title`}>
    <div className="recruitment-overview__intro">
      <span className="recruitment-overview__eyebrow">{isExperts ? '单 Agent 专家目录' : '多 Agent 协作目录'}</span>
      <div className="recruitment-overview__identity">
        <span className="recruitment-overview__icon">{isExperts ? <UserPlus aria-hidden /> : <Community aria-hidden />}</span>
        <div>
          <h3 id={`recruitment-${kind}-title`}>{isExperts ? '候选专家目录' : '候选专家团目录'}</h3>
          <p>{isExperts
            ? '按工作类型浏览专家。打开卡片查看完整资料，已招募专家可直接进入会话。'
            : '浏览通讯录中的已招募专家团与候选编组，打开卡片查看协作成员和调用规则。'}</p>
        </div>
      </div>
    </div>
    <dl className="recruitment-overview__metrics" aria-label="概况指标">
      {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
    </dl>
  </section>
}

export function RecruitmentCatalog({ employees, expertGroups = [], skills = [], initialKind = 'experts', onEnterConversation }: { employees: EmployeeSummary[]; expertGroups?: ExpertGroupView[]; skills?: ResourceCatalogView['skills']; initialKind?: RecruitmentKind; onEnterConversation?: (name: string, kind: 'expert' | 'group') => Promise<void> }): React.JSX.Element {
  const [kind, setKind] = useState<RecruitmentKind>(initialKind)
  const [selection, setSelection] = useState<RecruitmentSelection>()
  const [expertDetail, setExpertDetail] = useState<EmployeeDetail>()
  const [expertCapabilities, setExpertCapabilities] = useState<AgentCapabilityVersionView[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string>()
  const [enteringConversation, setEnteringConversation] = useState(false)
  const employeeCount = recruitmentCategories.reduce((count, category) => count + category.employees.length, 0)
  const recruitedEmployeeIds = new Set(employees.filter((employee) => employee.status !== 'archived').map((employee) => employee.id))
  const recruitedCount = recruitmentCategories.reduce((count, category) => count + category.employees.filter((employee) => recruitedEmployeeIds.has(employee.id)).length, 0)
  const groupEntries = [
    ...expertGroups.map((group) => ({ group, mode: 'directory' as const })),
    ...candidateExpertGroups.filter((candidate) => !expertGroups.some((group) => group.id === candidate.id)).map((group) => ({ group: candidateGroupView(group), mode: 'candidate' as const }))
  ]

  const closeDetail = (): void => {
    if (enteringConversation) return
    setSelection(undefined)
    setExpertDetail(undefined)
    setExpertCapabilities([])
    setDetailError(undefined)
  }

  const openExpert = async (employee: RecruitmentEmployee, categoryName: string): Promise<void> => {
    const summary = employees.find((item) => item.id === employee.id)
    setSelection({ kind: 'expert', employee, categoryName, summary })
    setExpertDetail(undefined)
    setExpertCapabilities([])
    setDetailError(undefined)
    if (!summary) {
      setDetailLoading(false)
      return
    }
    setDetailLoading(true)
    try {
      const [detail, capabilities] = await Promise.all([window.aiEmployeeOS.employee.detail(summary.id), window.aiEmployeeOS.employee.capabilities()])
      setExpertDetail(detail)
      setExpertCapabilities(capabilities)
    } catch {
      setDetailError('专家详情读取失败，请稍后重试。')
    } finally {
      setDetailLoading(false)
    }
  }

  const expertSkills = expertDetail ? skillsForExpert(expertDetail, expertCapabilities, skills) : []
  const selectionName = selection?.kind === 'expert' ? selection.summary?.name ?? selection.employee.name : selection?.group.name
  const canEnterConversation = selection?.kind === 'expert' ? selection.summary?.status === 'active' : selection?.mode === 'directory' && groupIsCallable(selection.group)
  const enterConversation = async (): Promise<void> => {
    if (!selection || !selectionName || !canEnterConversation || !onEnterConversation) return
    setEnteringConversation(true)
    try {
      await onEnterConversation(selectionName, selection.kind)
      setSelection(undefined)
    } finally {
      setEnteringConversation(false)
    }
  }

  return <DetailPage className="recruitment-page" width="wide">
    <section className="recruitment-catalog" aria-label="招募员工">
      <div className="filter-row capability-kind-switch recruitment-kind-switch" role="tablist" aria-label="招募类型">
        <button type="button" role="tab" id="recruitment-experts-tab" aria-label="专家" aria-controls="recruitment-experts-panel" aria-selected={kind === 'experts'} className={kind === 'experts' ? 'is-active' : ''} onClick={() => setKind('experts')}>
          <span className="recruitment-kind-switch__icon"><UserPlus aria-hidden /></span>
          <span className="recruitment-kind-switch__copy"><strong>专家</strong><small>单个 Agent</small></span>
          <span className="recruitment-kind-switch__count">{employeeCount} 位</span>
        </button>
        <button type="button" role="tab" id="recruitment-groups-tab" aria-label="专家团" aria-controls="recruitment-groups-panel" aria-selected={kind === 'groups'} className={kind === 'groups' ? 'is-active' : ''} onClick={() => setKind('groups')}>
          <span className="recruitment-kind-switch__icon"><Community aria-hidden /></span>
          <span className="recruitment-kind-switch__copy"><strong>专家团</strong><small>多个 Agent 协作</small></span>
          <span className="recruitment-kind-switch__count">{groupEntries.length} 个</span>
        </button>
      </div>
      {kind === 'experts' ? <div className="recruitment-kind-panel" role="tabpanel" id="recruitment-experts-panel" aria-labelledby="recruitment-experts-tab">
      <RecruitmentOverview kind="experts" itemCount={employeeCount} recruitedCount={recruitedCount} />
      <div className="recruitment-catalog__categories">
        {recruitmentCategories.map((category) => <section className="recruitment-category" aria-label={category.name} key={category.id}>
          <DetailSectionHeader title={category.name} description={category.description} meta={`${category.employees.length} 位`} />
          <SummaryCardGrid emptyMessage="暂无候选员工" label={`${category.name}员工`}>
            {category.employees.map((employee) => { const summary = employees.find((item) => item.id === employee.id); const displayName = summary?.name ?? employee.name; return <div className="recruitment-card" data-availability={recruitedEmployeeIds.has(employee.id) ? 'recruited' : 'unavailable'} data-source-path={employee.sourcePath} role="listitem" key={employee.id}>
              <SummaryCard
                leading={<RecruitmentAvatar employee={{ ...employee, name: displayName }} />}
                title={<span className="recruitment-card__title"><span>专家</span>{displayName}</span>}
                description={<span className="recruitment-card__description">{summary?.role || employee.description}</span>}
                tone={recruitedEmployeeIds.has(employee.id) ? 'success' : 'muted'}
                trailing={<span className="recruitment-card__trailing">{recruitedEmployeeIds.has(employee.id) ? <DetailState tone="success">已招募</DetailState> : <DetailState tone="muted">候选</DetailState>}<NavArrowRight aria-hidden /></span>}
                label={`查看专家 ${displayName}`}
                onClick={() => void openExpert(employee, category.name)}
              />
            </div>})}
          </SummaryCardGrid>
        </section>)}
      </div>
      </div> : <div className="recruitment-kind-panel" role="tabpanel" id="recruitment-groups-panel" aria-labelledby="recruitment-groups-tab">
        <RecruitmentOverview kind="groups" itemCount={groupEntries.length} recruitedCount={expertGroups.length} />
        <section className="recruitment-category recruitment-category--groups" aria-label="专家团">
          <DetailSectionHeader title="专家团" description="按业务目标组合多个 Agent，已招募编组可以直接进入会话。" meta={`${groupEntries.length} 个`} />
          <SummaryCardGrid emptyMessage="暂无候选专家团" label="候选专家团">
            {groupEntries.map(({ group, mode }) => <div className="recruitment-card recruitment-card--group" data-availability={mode === 'directory' ? 'recruited' : 'static'} role="listitem" key={group.id}>
              <SummaryCard
                leading={<ExpertGroupAvatar name={group.name} members={group.members} size="medium" />}
                title={<span className="recruitment-card__title"><span>专家团</span>{group.name}</span>}
                description={<span className="recruitment-card__description">{group.description}</span>}
                tone={mode === 'directory' ? 'success' : 'muted'}
                trailing={<span className="recruitment-card__trailing">{mode === 'directory' ? <DetailState tone="success">已招募</DetailState> : <DetailState tone="muted">候选</DetailState>}<NavArrowRight aria-hidden /></span>}
                label={`查看专家团 ${group.name}`}
                onClick={() => setSelection({ kind: 'group', group, mode })}
              />
            </div>)}
          </SummaryCardGrid>
        </section>
      </div>}
    </section>
    <ClientModal open={Boolean(selection)} title={selectionName ? `${selectionName}详情` : '详情'} size="large" onClose={closeDetail}>
      <div className="recruitment-detail-modal">
        <div className="recruitment-detail-modal__content">
          {detailLoading ? <div className="recruitment-detail-skeleton" role="status" aria-label="正在读取专家详情"><span /><span /><span /></div> : selection?.kind === 'expert' ? expertDetail ? <ExpertProfileContent detail={expertDetail} skills={expertSkills} /> : <CandidateExpertProfile employee={selection.employee} categoryName={selection.categoryName} summary={selection.summary} /> : selection?.kind === 'group' ? <ExpertGroupProfileContent group={selection.group} mode={selection.mode} /> : null}
          {detailError && <p className="inline-error" role="alert">{detailError}</p>}
        </div>
        <div className="recruitment-detail-modal__actions"><p>{canEnterConversation ? `选择后将新建会话，并由悟空优先安排${selectionName}。` : '该对象尚未加入通讯录或当前不可调用，暂时不能进入会话。'}</p><div><button type="button" className="button button--quiet" onClick={closeDetail}>关闭</button><button type="button" className="button button--primary" disabled={!canEnterConversation || !onEnterConversation || enteringConversation} onClick={() => void enterConversation()}>{enteringConversation ? '正在进入' : canEnterConversation ? '选择并进入会话' : '尚未招募'}</button></div></div>
      </div>
    </ClientModal>
  </DetailPage>
}
