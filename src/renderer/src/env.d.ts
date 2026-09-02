import type { ConversationBridge, EmployeeBridge, MemoryBridge, ProviderBridge, ResourceBridge, RuntimeBridge, SupervisorBridge, TaskBridge, UsageBridge } from '../../shared/runtime-contract'

declare global {
  interface Window {
    aiEmployeeOS: {
      runtime: RuntimeBridge
      provider: ProviderBridge
      conversation: ConversationBridge
      supervisor: SupervisorBridge
      employee: EmployeeBridge
      task: TaskBridge
      resource: ResourceBridge
      memory: MemoryBridge
      usage?: UsageBridge
    }
  }
}

export {}
