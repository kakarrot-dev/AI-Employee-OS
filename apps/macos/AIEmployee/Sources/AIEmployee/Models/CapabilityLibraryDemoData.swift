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
    let dataSources: [RuntimeDataSource]

    func statusColor(_ palette: AppTheme.Palette) -> Color {
        status == "可用" ? palette.success : palette.warning
    }
}

struct CapabilityDirectoryRow: Identifiable {
    let id: String
    let name: String
    let depth: Int
    let isFolder: Bool
    let parentID: String?
    let detail: String?
    var icon: String { name.hasSuffix(".md") ? "doc.richtext" : "doc" }
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
        guard let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1) else { return nil }
        let scene = arguments[index + 1]
        guard scene.hasPrefix(scope == .skills ? "skills" : "tools") else { return nil }
        return scope == .skills ? skills : tools
#else
        return nil
#endif
    }

    private static let skills = [
        skill(
            id: "local-file-operations",
            name: "本地文件操作",
            summary: "读取、创建和精确编辑授权目录内的 UTF-8 文件。",
            tools: "file-tool",
            markdown: "# 本地文件操作\n\n根据用户意图读取、创建或精确编辑授权目录内的文件。信息不足时先询问，不猜测路径或内容。"
        ),
        skill(
            id: "web-search",
            name: "网络搜索",
            summary: "通过 Agent Reach 搜索公开网页并保留来源。",
            tools: "agent-reach-tool",
            markdown: "# 网络搜索\n\n通过 Agent Reach 的受控搜索后端获取公开网页资料，回答必须保留真实来源。"
        )
    ]

    private static let tools = [
        tool(
            id: "file-tool",
            name: "本地文件",
            summary: "在授权目录内读取、创建和精确编辑 UTF-8 文件。",
            markdown: """
            # 本地文件

            在用户授权的本地目录内，读取、创建和精确编辑 UTF-8 文本文件。

            ## 能做什么

            - 读取授权路径中的文本内容
            - 创建尚不存在的新文件
            - 在文件中唯一匹配一段旧文本后做原子替换

            ## 不能做什么

            - 访问未授权目录
            - 覆盖已存在文件来「创建」
            - 在旧文本不唯一或不存在时强行编辑
            - 执行任意 shell 或二进制读写

            ## 运行方式

            所有调用经 Rust ToolExecutor 校验路径、权限与审计后执行。模型不能直连文件系统。
            """,
            actions: [
                securityAction("read_file", "读取授权路径中的 UTF-8 文本。", 0, ["filesystem.read"], "never", "none", ["arguments.path"]),
                securityAction("create_file", "创建新文件，且不会覆盖已有文件。", 2, ["filesystem.write"], "always", "reversible", ["arguments.path", "arguments.content"]),
                securityAction("edit_file", "唯一匹配旧文本后进行原子替换。", 2, ["filesystem.write"], "always", "reversible", ["arguments.path", "arguments.old_text", "arguments.new_text"])
            ],
            capabilitySections: [
                capabilitySection("read_file", "读取授权路径中的 UTF-8 文本。", 10_000, "none", "safe", true),
                capabilitySection("create_file", "创建新文件，且不会覆盖已有文件。", 10_000, "reversible", "keyed", false),
                capabilitySection("edit_file", "唯一匹配旧文本后进行原子替换。", 10_000, "reversible", "keyed", false)
            ]
        ),
        tool(
            id: "agent-reach-tool",
            name: "Agent Reach 网络搜索",
            summary: "通过受控 Exa 后端搜索公开网页并保留来源。",
            markdown: """
            # Agent Reach 网络搜索

            通过 Agent Reach 当前选定的 Exa 后端，搜索公开网页并返回带来源的结果。

            ## 能做什么

            - 按查询文本检索公开网页
            - 指定返回条数（1–10）

            ## 不能做什么

            - 提交任意 shell 命令
            - Computer Use 或任意站点抓取
            - 读取、展示 Cookie / Token / API Key 原文
            """,
            actions: [
                securityAction("search_web", "搜索公开网页并返回带来源的结果。", 1, ["network.search"], "never", "none", ["arguments.query"])
            ],
            capabilitySections: [
                capabilitySection("search_web", "搜索公开网页并返回带来源的结果。", 30_000, "none", "safe", true)
            ]
        )
    ]

    private static func skill(id: String, name: String, summary: String, tools: String, markdown: String) -> CapabilityLibraryItem {
        item(
            id: id,
            name: name,
            summary: summary,
            icon: "sparkles",
            markdown: markdown,
            dependencySections: [.init(title: "运行依赖", rows: [.init(label: "所需工具", value: tools)])],
            capabilitySections: [],
            actions: []
        )
    }

    private static func tool(
        id: String,
        name: String,
        summary: String,
        markdown: String,
        actions: [CapabilityAction],
        capabilitySections: [CapabilityMetadataSection]
    ) -> CapabilityLibraryItem {
        item(
            id: id,
            name: name,
            summary: summary,
            icon: "wrench.and.screwdriver",
            markdown: markdown,
            dependencySections: [.init(title: "运行环境", rows: [.init(label: "入口", value: "Rust ToolExecutor")])],
            capabilitySections: capabilitySections,
            actions: actions
        )
    }

    private static func item(
        id: String,
        name: String,
        summary: String,
        icon: String,
        markdown: String,
        dependencySections: [CapabilityMetadataSection],
        capabilitySections: [CapabilityMetadataSection],
        actions: [CapabilityAction]
    ) -> CapabilityLibraryItem {
        let document = "\(id)/SKILL.md"
        return .init(
            id: id,
            name: name,
            version: "1.0.0",
            summary: summary,
            category: "内置 · 可用",
            status: "可用",
            icon: icon,
            markdown: markdown,
            directory: [
                .init(id: "\(id)/", name: id, depth: 0, isFolder: true, parentID: nil, detail: nil),
                .init(id: document, name: "SKILL.md", depth: 1, isFolder: false, parentID: "\(id)/", detail: "能力说明")
            ],
            documents: [document: markdown],
            dependencySections: dependencySections,
            capabilitySections: capabilitySections,
            actions: actions,
            dataSources: []
        )
    }

    private static func capabilitySection(
        _ name: String,
        _ summary: String,
        _ timeoutMs: Int,
        _ sideEffect: String,
        _ idempotency: String,
        _ concurrencySafe: Bool
    ) -> CapabilityMetadataSection {
        .init(title: "\(ToolPresentation.actionTitle(name))（\(name)）", rows: [
            .init(label: "摘要", value: summary),
            .init(label: "超时", value: "\(timeoutMs) ms"),
            .init(label: "副作用", value: ToolPresentation.sideEffectLabel(sideEffect)),
            .init(label: "幂等", value: ToolPresentation.idempotencyLabel(idempotency)),
            .init(label: "并发", value: concurrencySafe ? "可并发" : "不可并发")
        ])
    }

    private static func securityAction(
        _ name: String,
        _ summary: String,
        _ risk: Int,
        _ permissions: [String],
        _ confirmation: String,
        _ sideEffect: String,
        _ sensitiveFields: [String]
    ) -> CapabilityAction {
        .init(
            name: "\(ToolPresentation.actionTitle(name))（\(name)）",
            summary: summary,
            risk: risk,
            rows: [
                .init(label: "风险含义", value: ToolPresentation.riskLabel(risk)),
                .init(label: "权限", value: permissions.joined(separator: "、")),
                .init(label: "审批", value: ToolPresentation.confirmationLabel(confirmation)),
                .init(label: "副作用", value: ToolPresentation.sideEffectLabel(sideEffect)),
                .init(label: "敏感参数", value: sensitiveFields.joined(separator: "、"))
            ]
        )
    }
}
