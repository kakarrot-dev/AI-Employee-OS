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
    let packageFiles: [RuntimePackageFile]
    let documents: [String: String]

    enum CodingKeys: String, CodingKey {
        case id, name, version, status, path, summary, category, available, documents
        case packageFiles = "package_files"
    }
}

struct RuntimePackageFile: Codable, Sendable {
    let path: String
    let name: String
    let depth: Int
    let isDirectory: Bool
    let parentPath: String?

    enum CodingKeys: String, CodingKey {
        case path, name, depth
        case isDirectory = "is_directory"
        case parentPath = "parent_path"
    }
}

struct RuntimeDataSource: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let status: String
    let doctorStatus: String
    let activeBackend: String?
    let backends: [String]
    let credentialType: String
    let credentialState: String
    let lastCheckedAt: String
    let message: String
    let loginHint: String
    let exposedToEmployee: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, status, backends, message
        case doctorStatus = "doctor_status"
        case activeBackend = "active_backend"
        case credentialType = "credential_type"
        case credentialState = "credential_state"
        case lastCheckedAt = "last_checked_at"
        case loginHint = "login_hint"
        case exposedToEmployee = "exposed_to_employee"
    }
}

struct RuntimeToolAction: Codable, Identifiable, Sendable {
    let name: String
    let description: String
    let requiredPermissions: [String]
    let riskLevel: Int
    let sideEffect: String
    let confirmation: String
    let timeoutMs: Int
    let idempotency: String
    let concurrencySafe: Bool
    let sensitiveFields: [String]

    var id: String { name }

    enum CodingKeys: String, CodingKey {
        case name, description, confirmation, idempotency
        case requiredPermissions = "required_permissions"
        case riskLevel = "risk_level"
        case sideEffect = "side_effect"
        case timeoutMs = "timeout_ms"
        case concurrencySafe = "concurrency_safe"
        case sensitiveFields = "sensitive_fields"
    }
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
    let documentation: String?
    let actions: [RuntimeToolAction]?
    let dataSources: [RuntimeDataSource]?

    enum CodingKeys: String, CodingKey {
        case id, name, type, version, status, summary, category, available, documentation, actions
        case dataSources = "data_sources"
    }
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
