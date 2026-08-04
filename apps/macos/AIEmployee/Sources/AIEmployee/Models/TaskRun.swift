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
    let events: [RuntimeEvent]

    enum CodingKeys: String, CodingKey {
        case taskID = "task_id"
        case status
        case artifactPath = "artifact_path"
        case evaluation, graph, events
    }
}

struct TaskHistoryResponse: Codable, Sendable {
    struct Item: Codable, Sendable {
        let taskID: String
        let input: String
        let status: TaskRunStatus
        let createdAt: String
        let updatedAt: String
        let actions: [GraphNodeEvidence]
        let artifactPath: String?
        let evaluation: RuntimeResponse.Evaluation?
        let events: [RuntimeEvent]
        let cancellationRequested: Bool

        enum CodingKeys: String, CodingKey {
            case taskID = "task_id"
            case input, status, actions, evaluation, events
            case createdAt = "created_at"
            case updatedAt = "updated_at"
            case artifactPath = "artifact_path"
            case cancellationRequested = "cancellation_requested"
        }
    }

    let schemaVersion: String
    let tasks: [Item]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case tasks
    }
}

struct RuntimeEvent: Codable, Identifiable, Sendable {
    let schemaVersion: String
    let eventID: String
    let sequence: Int
    let taskID: String
    let type: String
    let occurredAt: String

    var id: String { eventID }

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case eventID = "event_id"
        case sequence
        case taskID = "task_id"
        case type
        case occurredAt = "occurred_at"
    }
}

struct RuntimeEventsResponse: Codable, Sendable {
    let schemaVersion: String
    let taskID: String
    let after: Int
    let events: [RuntimeEvent]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case taskID = "task_id"
        case after, events
    }
}

struct TaskRun: Identifiable {
    let id: String
    let input: String
    let createdAt: String
    var status: TaskRunStatus
    var actions: [GraphNodeEvidence]
    var events: [RuntimeEvent]
    var response: RuntimeResponse?
    var error: String?
    var artifactPath: String?
    var evaluation: RuntimeResponse.Evaluation?
    var isCancellationRequested: Bool
}
