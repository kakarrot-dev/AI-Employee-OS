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
    let message: ChatMessage
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversationID = "conversation_id"; case message }
}

struct ChatDeleteResponse: Codable, Sendable {
    let schemaVersion: String
    let conversationID: String
    let deleted: Bool
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case conversationID = "conversation_id"; case deleted }
}
