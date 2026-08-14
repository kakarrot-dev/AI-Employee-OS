import Foundation

struct TaskThreadMessage: Codable, Identifiable, Sendable {
    let id: String
    let sequence: Int
    let role: String
    let kind: String
    let content: String
    let proposalID: String?
    let taskID: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, sequence, role, kind, content
        case proposalID = "proposal_id"
        case taskID = "task_id"
        case createdAt = "created_at"
    }
}

struct TaskThreadProjection: Codable, Identifiable, Sendable {
    let schemaVersion: String
    let id: String
    let title: String
    let status: String
    let currentRevision: Int
    let rootTaskID: String?
    let execution: BusinessFlowProjection?
    let createdAt: String
    let updatedAt: String
    let archivedAt: String?
    let messages: [TaskThreadMessage]
    let room: TaskRoomTimeline

    enum CodingKeys: String, CodingKey {
        case id, title, status, messages, room
        case schemaVersion = "schema_version"
        case currentRevision = "current_revision"
        case rootTaskID = "root_task_id"
        case execution
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case archivedAt = "archived_at"
    }
}

struct TaskRoomParticipant: Codable, Identifiable, Sendable {
    let agentID: String
    let name: String
    let role: String
    let avatarPath: String?
    let status: String
    var id: String { agentID }

    enum CodingKeys: String, CodingKey {
        case name, role, status
        case agentID = "agent_id"
        case avatarPath = "avatar_path"
    }
}

struct TaskRoomTimelineItem: Codable, Identifiable, Sendable {
    let id: String
    let sequence: Int
    let role: String
    let kind: String
    let content: String
    let createdAt: String
    let agentID: String?
    let agentName: String?
    let agentRole: String?
    let avatarPath: String?
    let taskID: String?
    let runID: String?
    let actionID: String?
    let approvalID: String?
    let handoffID: String?
    let deliverableID: String?
    let status: String?
    let toolID: String?
    let action: String?
    let artifactURI: String?

    enum CodingKeys: String, CodingKey {
        case id, sequence, role, kind, content, status, action
        case createdAt = "created_at"
        case agentID = "agent_id"
        case agentName = "agent_name"
        case agentRole = "agent_role"
        case avatarPath = "avatar_path"
        case taskID = "task_id"
        case runID = "run_id"
        case actionID = "action_id"
        case approvalID = "approval_id"
        case handoffID = "handoff_id"
        case deliverableID = "deliverable_id"
        case toolID = "tool_id"
        case artifactURI = "artifact_uri"
    }
}

struct TaskRoomTimeline: Codable, Sendable {
    let schemaVersion: String
    let threadID: String
    let participants: [TaskRoomParticipant]
    let items: [TaskRoomTimelineItem]

    enum CodingKeys: String, CodingKey {
        case participants, items
        case schemaVersion = "schema_version"
        case threadID = "thread_id"
    }
}

struct TaskThreadRetentionResponse: Codable, Sendable {
    let schemaVersion: String
    let threadID: String
    let operation: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case operation
        case schemaVersion = "schema_version"
        case threadID = "thread_id"
        case updatedAt = "updated_at"
    }
}

enum TaskProposalPresentationState: Equatable, Sendable {
    case idle
    case restoring
    case recoverable(message: String)
    case generating
    case review(TaskProposalResponse)
    case failed(message: String, diagnosticCode: String)

    static func initial(threadStatus: String, proposal: TaskProposalResponse?) -> Self {
        if let proposal { return .review(proposal) }
        return threadStatus == "drafting"
            ? .recoverable(message: "上次方案未完成，可以重新生成。")
            : .idle
    }

    static func failure(code: String) -> Self {
        let message: String
        switch code {
        case "task_proposal_provider_network":
            message = "模型服务连接中断，请稍后重试。"
        case "task_proposal_provider_rate_limited":
            message = "模型服务当前请求过多，请稍后重试。"
        case "task_proposal_provider_authentication":
            message = "模型凭证无效或未配置，请检查设置后重试。"
        case "task_proposal_provider_quota":
            message = "模型服务额度不足，请检查账户额度后重试。"
        case "task_proposal_provider_server_temporary", "task_proposal_provider_dependency_unavailable":
            message = "模型服务暂时不可用，请稍后重试。"
        case "task_proposal_employee_catalog_empty", "task_proposal_assignee_not_ready":
            message = "当前没有具备所需能力的在职员工，请检查通讯录和技能库。"
        case "task_proposal_expired", "task_proposal_stale", "task_proposal_revision_conflict":
            message = "员工或能力状态已经变化，请重新生成方案。"
        case "task_proposal_provider_invalid_response", "task_proposal_schema_invalid":
            message = "方案格式未通过 Runtime 校验，请重新生成。"
        default:
            message = "方案生成失败，可以重新生成。"
        }
        return .failed(message: message, diagnosticCode: code)
    }
}

struct TaskProposalCandidateAssignment: Identifiable, Equatable, Sendable {
    let id: String
    let agentID: String
    let name: String
    let role: String
    let avatarPath: String?
    let goal: String
}

struct TaskProposalResponse: Codable, Equatable, Sendable {
    struct Proposal: Codable, Equatable, Sendable {
        struct Assignment: Codable, Equatable, Sendable {
            struct EmployeeSelector: Codable, Equatable, Sendable {
                let preferredID: String?
                let capabilities: [String]
                enum CodingKeys: String, CodingKey { case capabilities; case preferredID = "preferred_id" }
            }
            let nodeID: String
            let role: String
            let employeeSelector: EmployeeSelector
            let goal: String
            let dependsOn: [String]
            enum CodingKeys: String, CodingKey {
                case role, goal
                case nodeID = "node_id"
                case employeeSelector = "employee_selector"
                case dependsOn = "depends_on"
            }
        }
        let intent: String
        let title: String
        let objective: String
        let assignments: [Assignment]
        let missingInputs: [MissingInput]
        struct MissingInput: Codable, Equatable, Sendable {
            let key: String
            let question: String
            let required: Bool
        }
        enum CodingKeys: String, CodingKey {
            case intent, title, objective, assignments
            case missingInputs = "missing_inputs"
        }
    }
    let proposalID: String
    let threadID: String
    let proposalHash: String
    let requiresConfirmation: Bool
    let resolvedAssignments: [ResolvedAssignment]
    let proposal: Proposal
    struct ResolvedAssignment: Codable, Equatable, Sendable {
        let nodeID: String
        let agentID: String
        let skillIDs: [String]
        enum CodingKeys: String, CodingKey { case nodeID = "node_id"; case agentID = "agent_id"; case skillIDs = "skill_ids" }
    }
    enum CodingKeys: String, CodingKey {
        case proposal
        case proposalID = "proposal_id"
        case threadID = "thread_id"
        case proposalHash = "proposal_hash"
        case requiresConfirmation = "requires_confirmation"
        case resolvedAssignments = "resolved_assignments"
    }

    func candidateAssignments(employees: [Employee]) -> [TaskProposalCandidateAssignment] {
        proposal.assignments.compactMap { assignment in
            guard let resolved = resolvedAssignments.first(where: { $0.nodeID == assignment.nodeID }) else {
                return nil
            }
            let employee = employees.first(where: { $0.id == resolved.agentID })
            return TaskProposalCandidateAssignment(
                id: assignment.nodeID,
                agentID: resolved.agentID,
                name: employee?.name ?? resolved.agentID,
                role: employee?.role ?? "员工资料不可用",
                avatarPath: employee?.avatarPath,
                goal: assignment.goal
            )
        }
    }
}

struct TaskProposalConfirmationResponse: Codable, Sendable {
    let schemaVersion: String
    let thread: TaskThreadProjection
    enum CodingKeys: String, CodingKey { case thread; case schemaVersion = "schema_version" }
}
