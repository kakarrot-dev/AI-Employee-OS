import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeService } from './employee-service'
import type { ExpertGroup } from './domain'
import { CUSTOMER_SOLUTION_GROUP_ID, ExpertGroupService } from './expert-group-service'
import { RuntimeKernel } from './kernel'
import { ResourceService } from './resource-service'
import { RuntimeStore } from './store'

const directories: string[] = []

function setup(seed = true): { groups: ExpertGroupService; employees: EmployeeService; kernel: RuntimeKernel; store: RuntimeStore } {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-expert-groups-'))
  directories.push(directory)
  const store = new RuntimeStore(join(directory, 'control.sqlite3'))
  const kernel = new RuntimeKernel(store)
  new ResourceService(kernel).seed()
  const employees = new EmployeeService(kernel)
  employees.seedCapabilities()
  employees.seedRequestedSpecialists()
  const groups = new ExpertGroupService(kernel, employees)
  if (seed) groups.seed()
  return { groups, employees, kernel, store }
}

afterEach(() => { while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }) })

describe('ExpertGroupService', () => {
  it('recruits the first expert group with the three specialists in dependency order', () => {
    const { groups, store } = setup()
    expect(groups.list()).toEqual([expect.objectContaining({
      id: CUSTOMER_SOLUTION_GROUP_ID,
      name: '售前分析专家团',
      status: 'active',
      members: [
        expect.objectContaining({ name: '招投标分析员', status: 'active' }),
        expect.objectContaining({ name: '网络情报员', status: 'active' }),
        expect.objectContaining({ name: '文档编写员', status: 'active' })
      ]
    })])
    expect(groups.available()[0].memberVersionIds).toEqual(['employee-version.tender-analyst.v2', 'employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'])
    store.close()
  })

  it('migrates the legacy visible name without changing recruitment state or members', () => {
    const { groups, kernel, store } = setup(false)
    const legacy: ExpertGroup = { schemaVersion: 1, id: CUSTOMER_SOLUTION_GROUP_ID, createdAt: '2026-09-04T00:00:00.000Z', name: '客户方案专家团', description: '旧描述', memberEmployeeIds: ['employee.tender-analyst', 'employee.network-intelligence', 'employee.document-writer'], archived: false }
    kernel.save({ entityType: 'ExpertGroup', entity: legacy, immutable: false }, 'expert_group.recruited', {})
    groups.seed()
    expect(groups.list()[0]).toMatchObject({ name: '售前分析专家团', description: '旧描述', status: 'active' })
    expect(groups.list()[0].members.map((member) => member.employeeId)).toEqual(legacy.memberEmployeeIds)
    store.close()
  })

  it('removes dismissed groups and groups containing a dismissed expert from the callable catalog', () => {
    const { groups, employees, store } = setup()
    groups.archive(CUSTOMER_SOLUTION_GROUP_ID)
    expect(groups.list()).toEqual([])
    expect(groups.available()).toEqual([])

    const second = setup()
    second.employees.archive('employee.network-intelligence')
    second.groups.archiveContainingEmployee('employee.network-intelligence')
    expect(second.groups.list()).toEqual([])
    expect(second.groups.available()).toEqual([])
    store.close()
    second.store.close()
  })
})
