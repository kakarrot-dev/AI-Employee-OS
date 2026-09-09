import { Community, Sparks } from 'iconoir-react'
import type { AgentCapabilityVersionView, EmployeeDetail } from '../../shared/employee-contract'
import type { ExpertGroupView } from '../../shared/expert-group-contract'
import type { ResourceCatalogView } from '../../shared/resource-contract'
import { Avatar, DetailState, ProfileSummary, ProfileValueTags, StatusLight, SummaryCard, SummaryCardGrid } from './components/client-ui'
import { formatClientTimestamp } from './client-time'
import { employeeAvatarSrc } from './employee-avatar'
import { employeeStatusBreathing, employeeStatusLabel, employeeStatusTone } from './employee-status'
import { ExpertGroupAvatar } from './ExpertGroupAvatar'

export function skillsForExpert(detail: EmployeeDetail, capabilities: AgentCapabilityVersionView[], skills: ResourceCatalogView['skills']): ResourceCatalogView['skills'] {
  const version = detail.draft ?? detail.active
  const capabilityIds = new Set(version?.capabilityVersionIds ?? [])
  const skillIds = new Set(capabilities.filter((capability) => capabilityIds.has(capability.id)).flatMap((capability) => capability.skillVersionIds))
  return skills.filter((skill) => skillIds.has(skill.id))
}

export function ExpertProfileContent({ detail, skills, actions }: { detail: EmployeeDetail; skills: ResourceCatalogView['skills']; actions?: React.ReactNode }): React.JSX.Element {
  const activeVersion = detail.draft ?? detail.active
  return <div className="expert-profile-content">
    <ProfileSummary identity={{ name: detail.employee.name, initials: detail.employee.name.slice(0, 1), color: '#c5b8e3', avatarSrc: employeeAvatarSrc({ employeeId: detail.employee.id, avatarDataUrl: detail.employee.avatarDataUrl ?? activeVersion?.avatarDataUrl }) }} title={activeVersion?.role || 'Agent 专家'} description={activeVersion?.description ?? '尚未填写职责说明'} actions={actions} />
    <ProfileValueTags showLabels items={[
      { label: '工作状态', accessibleValue: employeeStatusLabel(detail.status), value: <StatusLight state={employeeStatusTone(detail.status)} label={employeeStatusLabel(detail.status)} breathing={employeeStatusBreathing(detail.status)} /> },
      { label: '加入时间', accessibleValue: formatClientTimestamp(detail.employee.createdAt), value: formatClientTimestamp(detail.employee.createdAt) },
      { label: '运行模型', accessibleValue: activeVersion?.modelId || '未配置', value: activeVersion?.modelId || '未配置' },
      { label: '配置版本', accessibleValue: activeVersion ? `v${activeVersion.version}` : '未创建', value: activeVersion ? `v${activeVersion.version}` : '未创建' }
    ]} />
    <section className="plain-section"><div className="content-section-title"><h3>能力摘要</h3><span>{skills.length} 项 Skill</span></div><SummaryCardGrid emptyMessage="尚未绑定 Skill。">{skills.map((skill) => <SummaryCard key={skill.id} leading={<Sparks aria-hidden />} title={skill.name} description={skill.description} trailing={<DetailState tone={skill.available ? 'success' : 'danger'}>{skill.available ? '可用' : '不可用'}</DetailState>} />)}</SummaryCardGrid></section>
  </div>
}

export function ExpertGroupProfileContent({ group, mode = 'directory', actions }: { group: ExpertGroupView; mode?: 'directory' | 'candidate' | 'demo'; actions?: React.ReactNode }): React.JSX.Element {
  const callable = mode === 'directory' && group.status === 'active' && group.members.length > 0 && group.members.every((member) => member.status === 'active' && member.employeeVersionId)
  const statusLabel = mode === 'demo' ? '演示可用' : mode === 'candidate' ? '未招募' : callable ? '可调用' : '不可调用'
  return <div className="expert-profile-content expert-group-profile-content">
    <ProfileSummary identity={{ name: group.name, initials: '团', color: '#aab98c' }} avatar={<ExpertGroupAvatar name={group.name} members={group.members} size="large" />} title="多 Agent 协作专家团" description={group.description} actions={actions} />
    <ProfileValueTags showLabels items={[
      { label: '当前状态', accessibleValue: statusLabel, value: <StatusLight state={callable ? 'success' : 'muted'} label={statusLabel} /> },
      { label: '专家组成', accessibleValue: `${group.members.length} 位专家`, value: `${group.members.length} 位专家` },
      { label: '协作方式', accessibleValue: '按顺序协作', value: '按顺序协作' }
    ]} />
    <section className="plain-section"><div className="content-section-title"><h3>协作成员</h3><span>{mode === 'demo' ? '按流程协作演示' : mode === 'candidate' ? '候选协作顺序' : '悟空按此顺序调用'}</span></div><div className="expert-member-sequence"><SummaryCardGrid emptyMessage="该专家团尚未配置成员。" label="专家团成员">{group.members.map((member, index) => <SummaryCard key={member.employeeId} leading={<Avatar label={member.name} initials={member.name.slice(0, 1)} color="#c5b8e3" size="small" src={employeeAvatarSrc({ employeeId: member.employeeId, avatarDataUrl: member.avatarDataUrl })} />} title={member.name} description={`第 ${index + 1} 位 · ${member.role || '尚未填写职责'}`} trailing={<StatusLight state={mode === 'directory' && member.status === 'active' ? 'success' : 'muted'} label={mode === 'demo' ? '示例成员' : mode === 'candidate' ? '候选成员' : member.status === 'active' ? '可调用' : '不可调用'} />} />)}</SummaryCardGrid></div></section>
    <div className="expert-group-runtime-note"><Community aria-hidden /><span><strong>{mode === 'demo' ? '场景使用方式' : '悟空调用规则'}</strong><small>{mode === 'demo' ? '点击进入会话，填写会议主题、时间与参会人员后发起演示。专家团按固定流程协作，普通消息不会自动发起或变更会议。' : mode === 'candidate' ? '该编组尚未加入通讯录，悟空不会在新任务中调用。完成招募后，系统才会按成员顺序组织协作。' : '当目标与该专家团整体职责匹配时，悟空会按成员顺序组建执行团队；解雇后不再参与新任务，历史任务记录继续保留。'}</small></span></div>
  </div>
}
