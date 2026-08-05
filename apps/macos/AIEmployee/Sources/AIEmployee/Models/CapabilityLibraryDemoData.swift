import SwiftUI

struct CapabilityLibraryItem: Identifiable {
    let id: String
    let name: String
    let version: String
    let summary: String
    let category: String
    let status: String
    let icon: String
    let markdown: String
    let directory: [CapabilityDirectoryRow]
    let documents: [String: String]
    let dependencySections: [CapabilityMetadataSection]
    let capabilitySections: [CapabilityMetadataSection]
    let actions: [CapabilityAction]

    func statusColor(_ palette: AppTheme.Palette) -> Color {
        status == "可用" ? palette.success : status == "缺少依赖" || status == "未连接" ? palette.error : palette.warning
    }
}

struct CapabilityDirectoryRow: Identifiable {
    let id: String
    let name: String
    let depth: Int
    let isFolder: Bool
    let parentID: String?
    let detail: String?
    var icon: String {
        name.hasSuffix(".md") ? "doc.richtext" : name.hasSuffix(".png") ? "photo" : name.hasSuffix(".json") ? "curlybraces" : "doc"
    }
}

struct CapabilityMetadataRow: Identifiable {
    let id = UUID()
    let label: String
    let value: String
}

struct CapabilityMetadataSection: Identifiable {
    let id = UUID()
    let title: String
    let rows: [CapabilityMetadataRow]
}

struct CapabilityAction: Identifiable {
    let id = UUID()
    let name: String
    let summary: String
    let risk: Int
    let rows: [CapabilityMetadataRow]
}

enum CapabilityLibraryDemoData {
    static func current(for scope: CapabilityLibraryScope) -> [CapabilityLibraryItem]? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1) {
            let scene = arguments[index + 1]
            guard scene.hasPrefix(scope == .skills ? "skills" : "tools") else { return nil }
        }
        return scope == .skills ? skills : tools
#else
        return nil
#endif
    }

    private static let skills: [CapabilityLibraryItem] = [
        skill(id: "prd-generation", name: "产品需求分析", version: "1.2.0", summary: "把模糊业务目标转化为可评审、可验收的产品需求文档。", category: "产品 · 可用", status: "可用", markdown: """
        # 产品需求分析

        将业务目标、用户问题和约束整理为结构化产品需求文档。结论必须区分事实、推测与未知信息。

        ## 适用场景

        - 从访谈、需求或会议纪要中提取真实问题
        - 定义状态、异常流程与验收标准
        - 生成可交付的 Markdown PRD

        ## 工作流程

        1. 检查输入材料和证据完整性
        2. 澄清目标、用户与范围边界
        3. 建立状态、流程、权限和异常模型
        4. 输出文档并执行完整性检查

        > 缺少关键证据时必须明确标记，不得补写为已确认事实。
        """, tools: "本地文件、文档写入", context: "业务目标、用户材料", output: "Markdown PRD", available: true),
        skill(id: "user-research", name: "用户研究", version: "1.0.0", summary: "从访谈和反馈材料中提取有证据支持的用户洞察。", category: "研究 · 可用", status: "可用", markdown: """
        # 用户研究

        对访谈、反馈与观察记录进行编码，保留原始证据、反例和样本限制。

        ## 输出

        - 研究问题与样本说明
        - 主题编码和证据索引
        - 洞察、反例与置信度
        """, tools: "本地文件", context: "访谈记录、研究问题", output: "研究报告", available: true),
        skill(id: "data-analysis", name: "数据分析", version: "1.1.0", summary: "清洗业务数据并输出指标口径、结论和复现步骤。", category: "数据 · 可用", status: "可用", markdown: """
        # 数据分析

        将业务问题转化为可复现的数据分析，先检查数据质量，再定义指标和计算方法。

        ## 输出要求

        - 明确指标口径与时间范围
        - 保留缺失值和异常值处理记录
        - 区分相关性、因果关系和无法判断的信息
        """, tools: "本地文件、表格处理", context: "业务问题、数据文件", output: "分析报告、结果表格", available: true),
        skill(id: "meeting-brief", name: "会议纪要整理", version: "1.0.2", summary: "从会议材料中提取决策、待办、负责人和未决问题。", category: "协作 · 可用", status: "可用", markdown: """
        # 会议纪要整理

        把会议记录整理为可执行纪要，不将讨论意见误写为最终决策。

        ## 结构

        - 已确认决策
        - 待办事项与负责人
        - 截止时间
        - 未决问题
        """, tools: "本地文件、文档写入", context: "会议录音转写或笔记", output: "会议纪要", available: true),
        skill(id: "content-review", name: "内容审校", version: "0.8.4", summary: "检查文档结构、事实归属、术语一致性和表达问题。", category: "内容 · 已停用", status: "已停用", markdown: """
        # 内容审校

        检查长文档中的事实归属、术语一致性、结构重复和表达歧义。

        > 当前版本处于停用状态，仅用于查看历史说明。
        """, tools: "本地文件", context: "待审校文档、术语表", output: "审校意见", available: false),
        skill(id: "api-review", name: "接口评审", version: "0.9.0", summary: "检查接口状态、错误语义、幂等边界和恢复路径。", category: "工程 · 缺少依赖", status: "缺少依赖", markdown: """
        # 接口评审

        从调用方视角检查 API 契约，重点覆盖状态机、错误语义、幂等性与可恢复性。

        ## 当前状态

        缺少接口请求工具，因此暂时不可供员工选择。
        """, tools: "接口请求（未安装）", context: "OpenAPI 或接口文档", output: "接口评审记录", available: false)
    ]

    private static func skill(id: String, name: String, version: String, summary: String, category: String, status: String, markdown: String, tools: String, context: String, output: String, available: Bool) -> CapabilityLibraryItem {
        let root = "\(id)/"
        let references = "\(id)/references/"
        let supportFolder: String
        let supportFile: String
        let supportDetail: String
        switch id {
        case "prd-generation": (supportFolder, supportFile, supportDetail) = ("templates", "prd-template.md", "PRD 模板")
        case "user-research": (supportFolder, supportFile, supportDetail) = ("references", "coding-guide.md", "编码指南")
        case "data-analysis": (supportFolder, supportFile, supportDetail) = ("references", "metric-rules.md", "指标规范")
        case "meeting-brief": (supportFolder, supportFile, supportDetail) = ("templates", "meeting-notes.md", "纪要模板")
        case "content-review": (supportFolder, supportFile, supportDetail) = ("references", "terminology.md", "术语规范")
        default: (supportFolder, supportFile, supportDetail) = ("references", "review-checklist.md", "评审清单")
        }
        let folderID = "\(id)/\(supportFolder)/"
        var directory = [
            CapabilityDirectoryRow(id: root, name: id, depth: 0, isFolder: true, parentID: nil, detail: nil),
            CapabilityDirectoryRow(id: "\(id)/SKILL.md", name: "SKILL.md", depth: 1, isFolder: false, parentID: root, detail: "主说明"),
            CapabilityDirectoryRow(id: folderID, name: supportFolder, depth: 1, isFolder: true, parentID: root, detail: nil),
            CapabilityDirectoryRow(id: "\(folderID)\(supportFile)", name: supportFile, depth: 2, isFolder: false, parentID: folderID, detail: supportDetail)
        ]
        if supportFolder != "references" {
            directory.append(CapabilityDirectoryRow(id: references, name: "references", depth: 1, isFolder: true, parentID: root, detail: nil))
            directory.append(CapabilityDirectoryRow(id: "\(references)acceptance.md", name: "acceptance.md", depth: 2, isFolder: false, parentID: references, detail: "验收规则"))
        }
        directory.append(CapabilityDirectoryRow(id: "\(id)/scripts/", name: "scripts", depth: 1, isFolder: true, parentID: root, detail: nil))
        directory.append(CapabilityDirectoryRow(id: "\(id)/scripts/validate.py", name: "validate.py", depth: 2, isFolder: false, parentID: "\(id)/scripts/", detail: "代码不预览"))
        let supportMarkdown = "# \(supportDetail)\n\n这是 **\(name)** 的配套文档，用于说明执行时必须遵守的结构、判断标准和验收边界。\n\n## 使用要求\n\n- 与 `SKILL.md` 的工作流程保持一致\n- 缺少输入时明确指出，不补写为已确认事实\n- 输出必须保留来源和验证结果"
        var documents = ["\(id)/SKILL.md": markdown, "\(folderID)\(supportFile)": supportMarkdown]
        if supportFolder != "references" { documents["\(references)acceptance.md"] = "# 验收规则\n\n- 输出结构完整\n- 关键结论有输入依据\n- 未知信息被明确标记" }
        return .init(id: id, name: name, version: version, summary: summary, category: category, status: status, icon: "sparkles", markdown: markdown, directory: directory, documents: documents, dependencySections: [
            .init(title: "运行依赖", rows: [.init(label: "所需工具", value: tools), .init(label: "Runtime", value: ">= 1.0.0"), .init(label: "校验状态", value: available ? "Manifest 有效" : "依赖不完整")]),
            .init(title: "输入与输出", rows: [.init(label: "必需上下文", value: context), .init(label: "产物类型", value: output), .init(label: "输出格式", value: "Markdown")])
        ], capabilitySections: [], actions: [])
    }

    private static let tools: [CapabilityLibraryItem] = [
        tool(id: "local-files", name: "本地文件", version: "1.0.0", summary: "读取经过授权的本地目录和文件。", category: "原生 · 可用", status: "可用", type: "Native", runtime: "Rust", markdown: "# 本地文件\n\n在用户授权的范围内读取本地目录与文件。所有路径在 Runtime 中校验，AI 员工不会直接取得文件系统权限。\n\n## 能力边界\n\n- 只读取明确授权的路径\n- 拒绝未知权限和越界访问\n- 读取结果进入审计记录", actions: [action("读取文件", "读取授权路径中的文本内容。", 0, "filesystem.read", "无", "从不", "安全")]),
        tool(id: "document-writer", name: "文档写入", version: "1.0.0", summary: "创建或更新 Markdown 文档并验证写入结果。", category: "原生 · 可用", status: "可用", type: "Native", runtime: "Rust", markdown: "# 文档写入\n\n将 Markdown 内容写入经过授权的输出目录，并在返回成功前验证文件存在和内容摘要。\n\n## 注意事项\n\n写入会产生外部副作用，需要幂等键和明确的目标路径。", actions: [action("写入文档", "创建或覆盖指定的 Markdown 文件。", 2, "filesystem.write", "可逆", "存在风险时", "按幂等键")]),
        tool(id: "spreadsheet", name: "表格处理", version: "1.1.0", summary: "读取、校验和生成结构化表格文件。", category: "插件 · 可用", status: "可用", type: "Plugin", runtime: "Python", markdown: "# 表格处理\n\n读取 CSV 与 XLSX 数据，执行结构校验、基础计算并生成新的表格产物。\n\n## 安全边界\n\n只处理授权目录中的文件，写入新文件前需要明确目标路径。", actions: [action("读取工作簿", "读取工作表、表头和单元格数据。", 0, "spreadsheet.read", "无", "从不", "安全"), action("生成工作簿", "生成新的 XLSX 文件。", 2, "spreadsheet.write", "可逆", "存在风险时", "按幂等键")]),
        tool(id: "knowledge-search", name: "知识库检索", version: "1.0.3", summary: "从本地可信知识库中检索带来源的相关内容。", category: "原生 · 可用", status: "可用", type: "Native", runtime: "Rust", markdown: "# 知识库检索\n\n从已导入的本地知识条目中检索内容，每条结果保留来源、更新时间和可信边界。", actions: [action("检索知识", "根据查询返回带来源的相关知识片段。", 0, "knowledge.read", "无", "从不", "安全")]),
        tool(id: "database-query", name: "数据库查询", version: "0.7.1", summary: "通过只读连接查询结构化业务数据。", category: "MCP · 已停用", status: "已停用", type: "MCP", runtime: "External", markdown: "# 数据库查询\n\n通过受控连接执行只读查询。当前连接已停用，因此只能查看能力说明。", actions: [action("执行查询", "执行经过校验的只读 SQL 查询。", 2, "database.read", "无", "每次执行", "不安全")]),
        tool(id: "browser", name: "浏览器", version: "1.0.0", summary: "访问公开网页并提取可引用的页面信息。", category: "MCP · 未连接", status: "未连接", type: "MCP", runtime: "External", markdown: "# 浏览器\n\n读取公开网页并返回正文、标题和来源信息。当前 MCP 服务未连接，因此不可供员工选择。", actions: [action("打开网页", "访问指定公开 URL 并提取页面内容。", 1, "network.public", "无", "从不", "安全")])
    ]

    private static func tool(id: String, name: String, version: String, summary: String, category: String, status: String, type: String, runtime: String, markdown: String, actions: [CapabilityAction]) -> CapabilityLibraryItem {
        .init(id: id, name: name, version: version, summary: summary, category: category, status: status, icon: "wrench.and.screwdriver", markdown: markdown, directory: [], documents: [:], dependencySections: [], capabilitySections: [
            .init(title: "工具清单", rows: [.init(label: "类型", value: type), .init(label: "Runtime", value: runtime), .init(label: "入口", value: type == "MCP" ? "MCP Server" : "ToolExecutor"), .init(label: "Actions", value: actions.map(\.name).joined(separator: "、"))]),
            .init(title: "运行约束", rows: [.init(label: "默认超时", value: "30 秒"), .init(label: "结果限制", value: "1 MB"), .init(label: "Manifest", value: "Schema v1")])
        ], actions: actions)
    }

    private static func action(_ name: String, _ summary: String, _ risk: Int, _ permission: String, _ sideEffect: String, _ confirmation: String, _ idempotency: String) -> CapabilityAction {
        .init(name: name, summary: summary, risk: risk, rows: [.init(label: "所需权限", value: permission), .init(label: "副作用", value: sideEffect), .init(label: "确认策略", value: confirmation), .init(label: "幂等策略", value: idempotency), .init(label: "结果验证", value: "Runtime 校验并写入审计记录")])
    }
}
