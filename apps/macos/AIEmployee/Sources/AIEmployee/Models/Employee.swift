import Foundation

struct EmployeePersona: Codable, Sendable {
    struct Communication: Codable, Sendable {
        var style = "structured"
        var tone = "professional"
        var response = "conclusion_first"
    }
    struct Thinking: Codable, Sendable {
        var approach = "first_principles"
        var evidence = "distinguish_fact_inference_unknown"
    }
    struct Decision: Codable, Sendable { var priorities = ["user_value", "feasibility"] }
    struct Habit: Codable, Sendable {
        var outputFormat = "markdown"
        var includeAcceptanceCriteria = true
        enum CodingKeys: String, CodingKey { case outputFormat = "output_format"; case includeAcceptanceCriteria = "include_acceptance_criteria" }
    }
    var communication = Communication()
    var thinking = Thinking()
    var decision = Decision()
    var habit = Habit()
}

struct Employee: Codable, Identifiable, Sendable {
    let schemaVersion: String
    var id: String
    var name: String
    var role: String
    var department: String
    var mission: String
    var responsibilities: [String]
    var boundaries: [String]
    var soul: [String]
    var persona: EmployeePersona
    var basePrompt: String
    var status: String
    var configVersion: Int

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", id, name, role, department, mission, responsibilities, boundaries, soul, persona
        case basePrompt = "base_prompt", status
        case configVersion = "config_version"
    }

    static func draft() -> Employee {
        Employee(schemaVersion: "1.0", id: "", name: "", role: "", department: "", mission: "", responsibilities: [], boundaries: [], soul: [], persona: .init(), basePrompt: "可靠、直接地协助用户完成工作。", status: "active", configVersion: 1)
    }
}

struct EmployeeListResponse: Codable, Sendable { let schemaVersion: String; let employees: [Employee]; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", employees } }
struct EmployeeSaveResponse: Codable, Sendable { let schemaVersion: String; let id: String; let saved: Bool; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", id, saved } }
struct EmployeeDeleteResponse: Codable, Sendable { let schemaVersion: String; let id: String; let disposition: String; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", id, disposition } }
struct EffectivePromptResponse: Codable, Sendable { let schemaVersion: String; let employeeID: String; let configVersion: Int; let prompt: String; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case employeeID = "employee_id"; case configVersion = "config_version"; case prompt } }
