import type { EmployeeUiStatus } from './employee-contract'

export interface ExpertGroupMemberView {
  employeeId: string
  employeeVersionId?: string
  name: string
  role?: string
  avatarDataUrl?: string
  status: EmployeeUiStatus
}

export interface ExpertGroupView {
  id: string
  name: string
  description: string
  createdAt: string
  status: 'active' | 'archived'
  members: ExpertGroupMemberView[]
}
