import Foundation

struct EmployeePersona: Codable, Sendable {
    struct Communication: Codable, Sendable {
        var style = "structured"
        var tone = "professional"
        var response = "conclusion_first"
    }
    struct Thinking: Codable, Sendable {
        var approach = "user_value_first"
        var evidence = "distinguish_fact_inference_unknown"
    }
    struct Decision: Codable, Sendable { var priorities = ["user_value", "feasibility", "business_value"] }
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
    var avatarPath: String?
    var status: String
    var configVersion: Int

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", id, name, role, department, mission, responsibilities, boundaries, soul, persona
        case basePrompt = "base_prompt", avatarPath = "avatar_path", status
        case configVersion = "config_version"
    }

    static func draft() -> Employee {
        Employee(schemaVersion: "1.0", id: "", name: "", role: "", department: "", mission: "", responsibilities: [], boundaries: [], soul: [], persona: .init(), basePrompt: "可靠、直接地协助用户完成工作。", avatarPath: nil, status: "active", configVersion: 1)
    }
}

enum EmployeeDraftField: Hashable {
    case id, name, role, department, identity, soul
}

enum EmployeeDraftValidation {
    static func errors(employee: Employee, soulPrompt: String) -> [EmployeeDraftField: String] {
        var result: [EmployeeDraftField: String] = [:]
        let normalizedID = employee.id.trimmingCharacters(in: .whitespacesAndNewlines)
        if !(3...64).contains(normalizedID.count) { result[.id] = "员工 ID 需为 3–64 个字符" }
        if employee.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { result[.name] = "请填写员工姓名" }
        if employee.role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { result[.role] = "请填写员工岗位" }
        if employee.department.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { result[.department] = "请填写所属部门" }
        let identity = employee.basePrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if identity.isEmpty { result[.identity] = "请填写身份提示词" }
        else if identity.count > 8000 { result[.identity] = "身份提示词不能超过 8000 个字符" }
        let soul = soulPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if soul.isEmpty { result[.soul] = "请填写灵魂提示词" }
        else if soul.count > 8000 { result[.soul] = "灵魂提示词不能超过 8000 个字符" }
        return result
    }
}

struct EmployeeListResponse: Codable, Sendable { let schemaVersion: String; let employees: [Employee]; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", employees } }
struct EmployeeSaveResponse: Codable, Sendable { let schemaVersion: String; let id: String; let saved: Bool; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", id, saved } }
struct EmployeeDeleteResponse: Codable, Sendable { let schemaVersion: String; let id: String; let disposition: String; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", id, disposition } }
struct EffectivePromptResponse: Codable, Sendable { let schemaVersion: String; let employeeID: String; let configVersion: Int; let prompt: String; enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version"; case employeeID = "employee_id"; case configVersion = "config_version"; case prompt } }
