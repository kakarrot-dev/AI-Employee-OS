import Foundation

struct EmployeeCapabilityItem: Identifiable {
    enum Kind { case skill, tool }
    let id: String
    let kind: Kind
    let name: String
    let version: String
    let detail: String
    let metadata: String
    let isAvailable: Bool
}

struct EmployeePermissionItem: Identifiable {
    let id: String
    let name: String
    let resource: String
    let source: String
    let effect: String
    let confirmation: String?
}

struct EmployeeCapabilityProfile {
    let selectedSkills: [EmployeeCapabilityItem]
    let selectedTools: [EmployeeCapabilityItem]
    let permissions: [EmployeePermissionItem]
    let skillCatalog: [EmployeeCapabilityItem]
    let toolCatalog: [EmployeeCapabilityItem]

    static let empty = Self(selectedSkills: [], selectedTools: [], permissions: [], skillCatalog: [], toolCatalog: [])
}

struct ContactsDemoData {
    let employees: [Employee]
    let capabilities: [String: EmployeeCapabilityProfile]

    static var current: Self? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1) else { return nil }
        guard arguments[index + 1].hasPrefix("contacts") else { return nil }
        return sample
#else
        return nil
#endif
    }

    private static var sample: Self {
        let productSkill = EmployeeCapabilityItem(id: "prd-generation", kind: .skill, name: "产品需求分析", version: "1.2.0", detail: "把业务目标转化为结构化、可评审的产品需求文档。", metadata: "依赖：本地文件、文档写入", isAvailable: true)
        let researchSkill = EmployeeCapabilityItem(id: "user-research", kind: .skill, name: "用户研究", version: "1.0.0", detail: "整理访谈材料并提取有证据支持的用户洞察。", metadata: "依赖：本地文件", isAvailable: true)
        let analysisSkill = EmployeeCapabilityItem(id: "data-analysis", kind: .skill, name: "数据分析", version: "1.1.0", detail: "清洗业务数据并输出指标口径、结论与限制。", metadata: "依赖：本地文件、表格处理", isAvailable: true)
        let apiSkill = EmployeeCapabilityItem(id: "api-review", kind: .skill, name: "接口评审", version: "0.9.0", detail: "检查接口状态、错误语义与幂等边界。", metadata: "尚未安装依赖工具", isAvailable: false)

        let fileTool = EmployeeCapabilityItem(id: "file-tool", kind: .tool, name: "本地文件", version: "1.0.0", detail: "读取经过授权的本地目录与文件。", metadata: "原生 · 已就绪 · 风险 0", isAvailable: true)
        let documentTool = EmployeeCapabilityItem(id: "document-tool", kind: .tool, name: "文档写入", version: "1.0.0", detail: "创建或更新 Markdown 文档并验证写入结果。", metadata: "原生 · 已就绪 · 存在副作用", isAvailable: true)
        let sheetTool = EmployeeCapabilityItem(id: "spreadsheet-tool", kind: .tool, name: "表格处理", version: "1.0.0", detail: "读取和生成结构化表格文件。", metadata: "插件 · 已就绪 · 风险 1", isAvailable: true)
        let browserTool = EmployeeCapabilityItem(id: "browser-tool", kind: .tool, name: "浏览器", version: "1.0.0", detail: "访问网页并提取公开信息。", metadata: "MCP · 未连接", isAvailable: false)

        let skillCatalog = [productSkill, researchSkill, analysisSkill, apiSkill]
        let toolCatalog = [fileTool, documentTool, sheetTool, browserTool]
        let alexPermissions = [
            EmployeePermissionItem(id: "alex-read", name: "读取文件", resource: "filesystem.read", source: "本地文件", effect: "允许", confirmation: nil),
            EmployeePermissionItem(id: "alex-write", name: "写入文档", resource: "filesystem.write", source: "文档写入", effect: "允许", confirmation: "存在风险时确认")
        ]
        let mayaPermissions = [
            EmployeePermissionItem(id: "maya-read", name: "读取文件", resource: "filesystem.read", source: "本地文件", effect: "允许", confirmation: nil),
            EmployeePermissionItem(id: "maya-network", name: "访问网络", resource: "network.public", source: "浏览器", effect: "拒绝", confirmation: nil)
        ]
        let leoPermissions = [
            EmployeePermissionItem(id: "leo-read", name: "读取文件", resource: "filesystem.read", source: "本地文件", effect: "允许", confirmation: nil),
            EmployeePermissionItem(id: "leo-sheet", name: "生成表格", resource: "spreadsheet.write", source: "表格处理", effect: "允许", confirmation: "每次执行均确认")
        ]

        let employees = [
            employee(id: "alex", name: "Alex", role: "AI 产品经理", department: "产品部", identity: "# Alex\n\n你是一名 AI 产品经理，负责把模糊目标转化为可执行、可验收的产品方案。\n\n## 工作范围\n\n- 澄清业务目标与用户问题\n- 输出结构化产品需求文档\n- 定义状态、异常流程和验收标准", soul: "# 工作原则\n\n- 坚持第一性原理\n- 区分事实、推测与未知\n- 结论必须可执行、可验证"),
            employee(id: "maya", name: "Maya", role: "AI 用户研究员", department: "产品部", identity: "# Maya\n\n你是一名 AI 用户研究员，负责从访谈、反馈与行为材料中提取可靠洞察。\n\n## 工作范围\n\n- 设计研究问题\n- 编码访谈材料\n- 识别证据强度与样本限制", soul: "# 工作原则\n\n- 不把个例包装成普遍结论\n- 保留反例和原始证据\n- 使用清晰、克制的研究语言"),
            employee(id: "leo", name: "Leo", role: "AI 数据分析师", department: "数据部", identity: "# Leo\n\n你是一名 AI 数据分析师，负责把业务问题转化为可复现的数据分析。\n\n## 工作范围\n\n- 定义指标口径\n- 检查数据质量\n- 输出结论、限制与复现步骤", soul: "# 工作原则\n\n- 先检查数据，再计算指标\n- 区分相关性与因果关系\n- 不隐藏缺失值和口径变化")
        ]
        return Self(employees: employees, capabilities: [
            "alex": .init(selectedSkills: [productSkill], selectedTools: [fileTool, documentTool], permissions: alexPermissions, skillCatalog: skillCatalog, toolCatalog: toolCatalog),
            "maya": .init(selectedSkills: [researchSkill], selectedTools: [fileTool], permissions: mayaPermissions, skillCatalog: skillCatalog, toolCatalog: toolCatalog),
            "leo": .init(selectedSkills: [analysisSkill], selectedTools: [fileTool, sheetTool], permissions: leoPermissions, skillCatalog: skillCatalog, toolCatalog: toolCatalog)
        ])
    }

    private static func employee(id: String, name: String, role: String, department: String, identity: String, soul: String) -> Employee {
        Employee(schemaVersion: "1.0", id: id, name: name, role: role, department: department, mission: identity, responsibilities: [], boundaries: [], soul: [soul], persona: .init(), basePrompt: identity, avatarPath: nil, status: "active", configVersion: 1)
    }
}
