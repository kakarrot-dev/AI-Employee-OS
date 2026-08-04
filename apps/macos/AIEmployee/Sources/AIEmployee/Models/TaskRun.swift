import Foundation

enum TaskRunStatus: String, Codable, Sendable {
    case pending, running, succeeded, failed, cancelled
}

struct GraphNodeEvidence: Codable, Identifiable, Sendable {
    let stepID: String
    let actionID: String
    let status: String
    let outputAs: String

    var id: String { actionID }

    enum CodingKeys: String, CodingKey {
        case stepID = "step_id"
        case actionID = "action_id"
        case status
        case outputAs = "output_as"
    }
}

struct RuntimeResponse: Codable, Sendable {
    struct Evaluation: Codable, Sendable { let score: Double; let deliveryAllowed: Bool
        enum CodingKeys: String, CodingKey { case score; case deliveryAllowed = "delivery_allowed" }
    }
    struct Graph: Codable, Sendable { let engine: String; let skillID: String; let skillVersion: String; let nodes: [GraphNodeEvidence]
        enum CodingKeys: String, CodingKey { case engine; case skillID = "skill_id"; case skillVersion = "skill_version"; case nodes }
    }
    let taskID: String
    let status: TaskRunStatus
    let artifactPath: String
    let evaluation: Evaluation
    let graph: Graph

    enum CodingKeys: String, CodingKey {
        case taskID = "task_id"
        case status
        case artifactPath = "artifact_path"
        case evaluation, graph
    }
}

struct TaskRun: Identifiable {
    let id: UUID
    let input: String
    let createdAt: Date
    var status: TaskRunStatus
    var response: RuntimeResponse?
    var error: String?
}
