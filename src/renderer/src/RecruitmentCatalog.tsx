import { UserPlus } from 'iconoir-react'
import type { EmployeeSummary } from '../../shared/runtime-contract'
import { Avatar, DetailPage, DetailSectionHeader, DetailState, DetailSummaryPanel, SummaryCard, SummaryCardGrid } from './components/client-ui'
import { employeeAvatarSrc } from './employee-avatar'
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

export function RecruitmentCatalog({ employees }: { employees: EmployeeSummary[] }): React.JSX.Element {
  const employeeCount = recruitmentCategories.reduce((count, category) => count + category.employees.length, 0)
  const recruitedEmployeeIds = new Set(employees.filter((employee) => employee.status !== 'archived').map((employee) => employee.id))
  const recruitedCount = recruitmentCategories.reduce((count, category) => count + category.employees.filter((employee) => recruitedEmployeeIds.has(employee.id)).length, 0)
  return <DetailPage className="recruitment-page" width="wide">
    <section className="recruitment-catalog" aria-label="招募员工">
      <DetailSummaryPanel
        icon={<UserPlus aria-hidden />}
        title="候选员工目录"
        description="按工作类型浏览候选 Agent 员工。当前版本仅展示员工资料，暂不支持选择或招募。"
        metrics={[{ label: '候选员工', value: employeeCount }, { label: '已招募', value: recruitedCount }, { label: '工作类型', value: recruitmentCategories.length }]}
      />
      <div className="recruitment-catalog__categories">
        {recruitmentCategories.map((category) => <section className="recruitment-category" aria-label={category.name} key={category.id}>
          <DetailSectionHeader title={category.name} description={category.description} meta={`${category.employees.length} 位`} />
          <SummaryCardGrid emptyMessage="暂无候选员工" label={`${category.name}员工`}>
            {category.employees.map((employee) => <div className="recruitment-card" data-availability={recruitedEmployeeIds.has(employee.id) ? 'recruited' : 'unavailable'} data-source-path={employee.sourcePath} role="listitem" key={employee.id}>
              <SummaryCard leading={<RecruitmentAvatar employee={employee} />} title={employee.name} description={employee.description} tone={recruitedEmployeeIds.has(employee.id) ? 'success' : 'muted'} trailing={recruitedEmployeeIds.has(employee.id) ? <DetailState tone="success">已招募</DetailState> : <DetailState tone="muted">未开放</DetailState>} />
            </div>)}
          </SummaryCardGrid>
        </section>)}
      </div>
    </section>
  </DetailPage>
}
