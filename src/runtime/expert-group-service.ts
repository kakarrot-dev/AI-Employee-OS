import type { ExpertGroupView } from '../shared/expert-group-contract'
import type { ExpertGroup } from './domain'
import { EmployeeService } from './employee-service'
import { RuntimeKernel } from './kernel'

export const CUSTOMER_SOLUTION_GROUP_ID = 'expert-group.customer-solution'

const CUSTOMER_SOLUTION_GROUP: ExpertGroup = {
  schemaVersion: 1,
  id: CUSTOMER_SOLUTION_GROUP_ID,
  createdAt: '2026-09-04T00:00:00.000Z',
  name: '售前分析专家团',
  description: '从客户材料分析、公开信息核验到最终文档交付，由三位专家按依赖顺序协作完成。',
  memberEmployeeIds: ['employee.tender-analyst', 'employee.network-intelligence', 'employee.document-writer'],
  archived: false
}

export interface AvailableExpertGroup {
  groupId: string
  name: string
  description: string
  memberVersionIds: string[]
  members: Array<{ versionId: string; name: string; role?: string }>
}

export class ExpertGroupService {
  constructor(private readonly kernel: RuntimeKernel, private readonly employees: EmployeeService) {}

  seed(): void {
    const existing = this.kernel.store.get<ExpertGroup>('ExpertGroup', CUSTOMER_SOLUTION_GROUP.id)
    if (existing) {
      if (existing.name !== CUSTOMER_SOLUTION_GROUP.name) this.kernel.save({ entityType: 'ExpertGroup', entity: { ...existing, name: CUSTOMER_SOLUTION_GROUP.name }, immutable: false }, 'expert_group.updated', { field: 'name' })
      return
    }
    this.kernel.save({ entityType: 'ExpertGroup', entity: CUSTOMER_SOLUTION_GROUP, immutable: false }, 'expert_group.recruited', { memberEmployeeIds: CUSTOMER_SOLUTION_GROUP.memberEmployeeIds })
  }

  list(): ExpertGroupView[] {
    return this.kernel.store.list<ExpertGroup>('ExpertGroup').filter((group) => !group.archived).map((group) => this.view(group))
  }

  archive(groupId: string): ExpertGroupView {
    const group = this.requireGroup(groupId)
    const archived = { ...group, archived: true }
    this.kernel.save({ entityType: 'ExpertGroup', entity: archived, immutable: false }, 'expert_group.archived', {})
    return this.view(archived)
  }

  archiveContainingEmployee(employeeId: string): void {
    for (const group of this.kernel.store.list<ExpertGroup>('ExpertGroup')) {
      if (group.archived || !group.memberEmployeeIds.includes(employeeId)) continue
      this.kernel.save({ entityType: 'ExpertGroup', entity: { ...group, archived: true }, immutable: false }, 'expert_group.archived', { reason: 'member_archived', employeeId })
    }
  }

  available(): AvailableExpertGroup[] {
    return this.list().flatMap((group) => {
      if (group.members.some((member) => member.status !== 'active' || !member.employeeVersionId)) return []
      return [{
        groupId: group.id,
        name: group.name,
        description: group.description,
        memberVersionIds: group.members.map((member) => member.employeeVersionId!),
        members: group.members.map((member) => ({ versionId: member.employeeVersionId!, name: member.name, role: member.role }))
      }]
    })
  }

  private view(group: ExpertGroup): ExpertGroupView {
    const employees = new Map(this.employees.list().map((employee) => [employee.id, employee]))
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      status: group.archived ? 'archived' : 'active',
      members: group.memberEmployeeIds.map((employeeId) => {
        const employee = employees.get(employeeId)
        if (!employee) throw new Error('expert_group_member_not_found')
        return { employeeId, employeeVersionId: employee.activeVersionId, name: employee.name, role: employee.role, avatarDataUrl: employee.avatarDataUrl, status: employee.status }
      })
    }
  }

  private requireGroup(groupId: string): ExpertGroup {
    const group = this.kernel.store.get<ExpertGroup>('ExpertGroup', groupId)
    if (!group) throw new Error('expert_group_not_found')
    return group
  }
}
