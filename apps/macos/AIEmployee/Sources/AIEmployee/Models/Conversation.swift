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
    }
}

struct ChatDeleteResponse: Codable, Sendable {
    let schemaVersion: String
    let conversationID: String
    let deleted: Bool
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversationID = "conversation_id"; case deleted }
}
