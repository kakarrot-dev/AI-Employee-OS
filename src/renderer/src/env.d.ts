import type { AttachmentBridge, ConversationBridge, EmployeeBridge, ExpertGroupBridge, MemoryBridge, ProviderBridge, ResourceBridge, RuntimeBridge, SupervisorBridge, TaskBridge, UsageBridge } from '../../shared/runtime-contract'
import type { ConnectionBridge } from '../../shared/connection-contract'

declare global {
  interface Window {
    aiEmployeeOS: {
      runtime: RuntimeBridge
      provider: ProviderBridge
      conversation: ConversationBridge
      attachment: AttachmentBridge
      supervisor: SupervisorBridge
      employee: EmployeeBridge
      expertGroup: ExpertGroupBridge
      task: TaskBridge
      resource: ResourceBridge
      memory: MemoryBridge
      usage?: UsageBridge
      connection: ConnectionBridge
    }
  }
}

export {}
