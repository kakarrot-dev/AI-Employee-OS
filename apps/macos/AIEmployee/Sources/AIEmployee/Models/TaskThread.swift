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

struct TaskProposalResponse: Codable, Sendable {
    struct Proposal: Codable, Sendable {
        struct Assignment: Codable, Sendable {
            struct EmployeeSelector: Codable, Sendable {
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
        struct MissingInput: Codable, Sendable {
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
    struct ResolvedAssignment: Codable, Sendable {
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
}

struct TaskProposalConfirmationResponse: Codable, Sendable {
    let schemaVersion: String
    let thread: TaskThreadProjection
    enum CodingKeys: String, CodingKey { case thread; case schemaVersion = "schema_version" }
}
