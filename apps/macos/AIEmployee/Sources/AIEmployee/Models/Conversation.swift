import Foundation

struct ChatMessage: Codable, Identifiable, Sendable {
    let id: String
    let role: String
    let content: String
    let createdAt: String
    enum CodingKeys: String, CodingKey { case id, role, content; case createdAt = "created_at" }
}

struct ChatHistoryResponse: Codable, Sendable {
    let schemaVersion: String
    let conversationID: String
    let messages: [ChatMessage]
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversationID = "conversation_id"; case messages }
}

struct ChatSendResponse: Codable, Sendable {
    let schemaVersion: String
    let conversationID: String
    let employeeID: String
    let configVersion: Int
    let message: ChatMessage
    let intent: String?
    let intentConfidence: Double?
    let intentSource: String?
    let routedTo: String?
    let taskID: String?
    let artifactPath: String?
    let runID: String?
    let runPhase: String?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case conversationID = "conversation_id"
        case employeeID = "employee_id"
        case configVersion = "config_version"
        case message
        case intent
        case intentConfidence = "intent_confidence"
        case intentSource = "intent_source"
        case routedTo = "routed_to"
        case taskID = "task_id"
        case artifactPath = "artifact_path"
        case runID = "run_id"
        case runPhase = "run_phase"
    }
}

struct ChatStreamDelta: Codable, Sendable {
    let type: String
    let delta: String
}

struct ChatDeleteResponse: Codable, Sendable {
    let schemaVersion: String
    let conversationID: String
    let deleted: Bool
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversationID = "conversation_id"; case deleted }
}

struct ChatRetentionResponse: Codable, Sendable {
    let schemaVersion: String
    let conversationID: String
    let operation: String
    let updated: Bool
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversationID = "conversation_id"; case operation, updated }
}

struct ArchivedConversation: Codable, Identifiable, Sendable {
    let conversationID: String
    let employeeID: String
    let employeeName: String
    let employeeRole: String
    let updatedAt: String
    let preview: String?
    var id: String { conversationID }
    enum CodingKeys: String, CodingKey {
        case conversationID = "conversation_id"
        case employeeID = "employee_id"
        case employeeName = "employee_name"
        case employeeRole = "employee_role"
        case updatedAt = "updated_at"
        case preview
    }
}

struct ArchiveListResponse: Codable, Sendable {
    let schemaVersion: String
    let conversations: [ArchivedConversation]
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversations }
}
