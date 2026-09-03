import { Avatar, DetailPage } from './components/client-ui'
import { employeeAvatarSrc } from './employee-avatar'

interface RecruitmentEmployee {
  id: string
  name: string
  color: string
}

interface RecruitmentCategory {
  id: string
  name: string
  employees: RecruitmentEmployee[]
}

const recruitmentCategories: RecruitmentCategory[] = [
  {
    id: 'analysis',
    name: '信息与分析',
    employees: [
      { id: 'employee.network-intelligence', name: '网络情报员', color: '#9ebd79' },
      { id: 'employee.tender-analyst', name: '招投标分析员', color: '#d7b36a' }
    ]
  },
  {
    id: 'delivery',
    name: '内容与交付',
    employees: [
      { id: 'employee.document-writer', name: '文档编写员', color: '#85a9c7' }
    ]
  }
]

export function RecruitmentCatalog(): React.JSX.Element {
  return <DetailPage className="recruitment-page">
    <section className="recruitment-catalog" aria-labelledby="recruitment-title">
      <header className="recruitment-catalog__header">
        <h2 id="recruitment-title">招募员工</h2>
        <p>浏览可招募的 Agent 员工。当前版本仅作展示，暂不支持选择或招募。</p>
      </header>
      <div className="recruitment-catalog__categories">
        {recruitmentCategories.map((category) => <section className="recruitment-category" aria-labelledby={`recruitment-category-${category.id}`} key={category.id}>
          <div className="recruitment-category__heading">
            <h3 id={`recruitment-category-${category.id}`}>{category.name}</h3>
            <span>{category.employees.length} 位</span>
          </div>
          <div className="recruitment-grid" role="list" aria-label={`${category.name}员工`}>
            {category.employees.map((employee) => <article className="recruitment-employee" role="listitem" key={employee.id}>
              <Avatar label={employee.name} initials={employee.name.slice(0, 1)} color={employee.color} size="large" src={employeeAvatarSrc({ employeeId: employee.id })} />
              <strong>{employee.name}</strong>
            </article>)}
          </div>
        </section>)}
      </div>
    </section>
  </DetailPage>
}
