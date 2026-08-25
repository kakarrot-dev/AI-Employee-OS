import Foundation

struct KnowledgeListResponse: Codable, Sendable {
    struct Source: Codable, Sendable {
        let id: String
        let uri: String
        let sourceType: String
        let title: String
        let contentHash: String
        let indexStatus: String
        let updatedAt: String
        let content: String

        enum CodingKeys: String, CodingKey {
            case id, uri, title, content
            case sourceType = "source_type"
            case contentHash = "content_hash"
            case indexStatus = "index_status"
            case updatedAt = "updated_at"
        }
    }

    let schemaVersion: String
    let sources: [Source]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case sources
    }
}
