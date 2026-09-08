import { writeFileSync } from 'node:fs'
import { RuntimeStore } from '../../src/runtime/store'
import { RuntimeKernel } from '../../src/runtime/kernel'
import { EmployeeService } from '../../src/runtime/employee-service'
import { ResourceService } from '../../src/runtime/resource-service'
import { ExpertGroupService } from '../../src/runtime/expert-group-service'

// Only built-in definitions in an isolated in-memory database. No user DB,
// provider, credential access, resource probes or worker execution.
const store = new RuntimeStore(':memory:')
try {
  const kernel = new RuntimeKernel(store)
  const resources = new ResourceService(kernel)
  const employees = new EmployeeService(kernel)
  const groups = new ExpertGroupService(kernel, employees)
  resources.seed()
  employees.seedCapabilities()
  employees.seedRequestedSpecialists()
  groups.seed()
  writeFileSync('src/web/catalog.json', JSON.stringify({
    employees: employees.list().map((employee) => employees.detail(employee.id)),
    capabilities: employees.capabilities(),
    resources: resources.list(),
    groups: groups.list()
  }, null, 2) + '\n')
} finally {
  store.database.close()
}
