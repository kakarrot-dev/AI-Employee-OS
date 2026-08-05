import Foundation

struct RuntimeCapabilities: Codable, Sendable {
    let schemaVersion: String
    let skillsInstalled: Int
    let toolsInstalled: Int
    let tasksEnabled: Bool
    let canCreatePackages: Bool

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case skillsInstalled = "skills_installed"
        case toolsInstalled = "tools_installed"
        case tasksEnabled = "tasks_enabled"
        case canCreatePackages = "can_create_packages"
    }

    static let disconnected = RuntimeCapabilities(
        schemaVersion: "1.0",
        skillsInstalled: 0,
        toolsInstalled: 0,
        tasksEnabled: false,
        canCreatePackages: false
    )
}

struct RuntimeSkillItem: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let version: String
    let status: String
    let path: String?
    let summary: String
    let category: String
    let available: Bool
}

struct RuntimeToolItem: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let type: String
    let version: String
    let status: String
    let summary: String
    let category: String
    let available: Bool
}

struct SkillsListResponse: Codable, Sendable {
    let schemaVersion: String
    let skills: [RuntimeSkillItem]
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", skills }
}

struct ToolsListResponse: Codable, Sendable {
    let schemaVersion: String
    let tools: [RuntimeToolItem]
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", tools }
}

struct BindSkillResponse: Codable, Sendable {
    let schemaVersion: String
    let bound: Bool
    let agentID: String
    let skillID: String
    let skillVersion: String
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", bound
        case agentID = "agent_id", skillID = "skill_id", skillVersion = "skill_version"
    }
}

struct UnbindSkillResponse: Codable, Sendable {
    let schemaVersion: String
    let unbound: Bool
    let agentID: String
    let skillID: String
    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", unbound
        case agentID = "agent_id", skillID = "skill_id"
    }
}
