import type { ConversationBridge, EmployeeBridge, MemoryBridge, ProviderBridge, ResourceBridge, RuntimeBridge, TaskBridge } from '../../shared/runtime-contract'

declare global {
  interface Window {
    aiEmployeeOS: {
      runtime: RuntimeBridge
      provider: ProviderBridge
      conversation: ConversationBridge
      employee: EmployeeBridge
      task: TaskBridge
      resource: ResourceBridge
      memory: MemoryBridge
    }
  }
}

export {}
