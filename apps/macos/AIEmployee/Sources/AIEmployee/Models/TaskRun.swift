import Foundation

enum JSONValue: Codable, Sendable, Equatable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else { self = .string(try container.decode(String.self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

enum TaskRunStatus: String, Codable, Sendable {
    case pending, running, succeeded, failed, cancelled
}

struct GraphNodeEvidence: Codable, Identifiable, Sendable {
    let stepID: String
    let actionID: String
    let status: String
    let outputAs: String
    let toolID: String?
    let action: String?
    let resource: String?
    let rationaleSummary: String?

    var id: String { actionID }

    init(
        stepID: String,
        actionID: String,
        status: String,
        outputAs: String,
        toolID: String? = nil,
        action: String? = nil,
        resource: String? = nil,
        rationaleSummary: String? = nil
    ) {
        self.stepID = stepID
        self.actionID = actionID
        self.status = status
        self.outputAs = outputAs
        self.toolID = toolID
        self.action = action
        self.resource = resource
        self.rationaleSummary = rationaleSummary
    }

    enum CodingKeys: String, CodingKey {
        case stepID = "step_id"
        case actionID = "action_id"
        case status
        case outputAs = "output_as"
        case toolID = "tool_id"
        case action, resource
        case rationaleSummary = "rationale_summary"
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
        let agentID: String
        let input: String
        let status: TaskRunStatus
        let createdAt: String
        let updatedAt: String
        let actions: [GraphNodeEvidence]
        let artifactPath: String?
        let evaluation: RuntimeResponse.Evaluation?
        let events: [RuntimeEvent]
        let cancellationRequested: Bool
        let runID: String?
        let runPhase: String?
        let waitingReason: String?
        let stopReason: String?
        let deliverableTitle: String?
        let deliverableStatus: String?
        let verifiedArtifactPath: String?
        let conversationID: String?
        let skillID: String?
        let skillVersion: String?
        let skillIDs: [String]
        let deliverableMessage: String?

        enum CodingKeys: String, CodingKey {
            case taskID = "task_id"
            case agentID = "agent_id"
            case input, status, actions, evaluation, events
            case createdAt = "created_at"
            case updatedAt = "updated_at"
            case artifactPath = "artifact_path"
            case cancellationRequested = "cancellation_requested"
            case runID = "run_id"
            case runPhase = "run_phase"
            case waitingReason = "waiting_reason"
            case stopReason = "stop_reason"
            case deliverableTitle = "deliverable_title"
            case deliverableStatus = "deliverable_status"
            case verifiedArtifactPath = "verified_artifact_path"
            case conversationID = "conversation_id"
            case skillID = "skill_id"
            case skillVersion = "skill_version"
            case skillIDs = "skill_ids"
            case deliverableMessage = "deliverable_message"
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
    let payload: [String: JSONValue]

    var id: String { eventID }

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case eventID = "event_id"
        case sequence
        case taskID = "task_id"
        case type
        case occurredAt = "occurred_at"
        case payload
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

struct RunContinuationResponse: Codable, Sendable {
    let taskID: String
    let runID: String
    let status: String
    let phase: String
    enum CodingKeys: String, CodingKey {
        case taskID = "task_id"; case runID = "run_id"; case status; case phase
    }
}

struct TaskRun: Identifiable {
    let id: String
    let agentID: String
    let input: String
    let createdAt: String
    var updatedAt: String? = nil
    var status: TaskRunStatus
    var actions: [GraphNodeEvidence]
    var events: [RuntimeEvent]
    var response: RuntimeResponse?
    var error: String?
    var artifactPath: String?
    var evaluation: RuntimeResponse.Evaluation?
    var isCancellationRequested: Bool
    var runID: String? = nil
    var runPhase: String? = nil
    var waitingReason: String? = nil
    var stopReason: String? = nil
    var deliverableTitle: String? = nil
    var deliverableStatus: String? = nil
    var verifiedArtifactPath: String? = nil
    var conversationID: String? = nil
    var skillID: String? = nil
    var skillVersion: String? = nil
    var skillIDs: [String] = []
    var deliverableMessage: String? = nil

    var hasPersistentDeliverable: Bool {
        deliverableStatus == "verified"
            || verifiedArtifactPath != nil
    }
}
