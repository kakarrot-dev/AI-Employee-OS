import Foundation

struct ChatAttachmentPresentation: Identifiable, Hashable {
    let id: String
    let name: String
    let kind: String
    let size: String
    let path: String?

    init(id: String = UUID().uuidString, name: String, kind: String, size: String, path: String? = nil) {
        self.id = id
        self.name = name
        self.kind = kind
        self.size = size
        self.path = path
    }
}

struct WorkApprovalRequest {
    let taskID: String
    let action: String
    let tool: String
    let scope: String
    let impact: String
    let networkAccess: Bool
}

struct WorkLibraryDemoData {
    let messages: [String: [ChatMessage]]
    let runs: [TaskRun]
    let lastActivity: [String: String]
    let previews: [String: String]
    let artifacts: [String: String]
    let messageAttachments: [String: [ChatAttachmentPresentation]]
    let approval: WorkApprovalRequest?

    static var current: Self? {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1), arguments[index + 1].hasPrefix("work") else { return nil }
        return sample
#else
        return nil
#endif
    }

    private static var sample: Self {
        let now = Date()
        func stamp(_ secondsAgo: TimeInterval) -> String { ISO8601DateFormatter().string(from: now.addingTimeInterval(-secondsAgo)) }

        let artifactPath = ((try? RuntimeService.authorizedOutputDirectory()) ?? FileManager.default.temporaryDirectory)
            .appending(path: "work-library-information-architecture.md").path
        let messages: [String: [ChatMessage]] = [
            "ai-product-manager": [
                .init(id: "work-alex-user", role: "user", content: "重新设计工作库，让每名 AI 员工只有一个持续会话，正式工作也要进入同一条时间线。", createdAt: stamp(14_400)),
                .init(id: "work-alex-agent", role: "assistant", content: "我会先统一会话与工作记录的关系，再检查 **运行状态、审批和交付物** 是否能在同一页面恢复。", createdAt: stamp(14_220))
            ],
            "maya": [
                .init(id: "work-maya-user", role: "user", content: "帮我整理昨天的 8 份用户访谈，先标出证据不足的结论。", createdAt: stamp(360)),
                .init(id: "work-maya-agent", role: "assistant", content: "已收到。我会保留原始引文、样本限制和反例，不把个例包装成普遍结论。", createdAt: stamp(180))
            ],
            "leo": [
                .init(id: "work-leo-user", role: "user", content: "检查上周激活率的指标口径。", createdAt: stamp(259_380)),
                .init(id: "work-leo-agent", role: "assistant", content: "已记录。当前需要补充事件定义和去重规则，确认后才能计算。", createdAt: stamp(259_200))
            ]
        ]

        let completed = TaskRun(
            id: "demo-work-completed",
            input: "输出工作库的信息架构与自适应布局说明",
            createdAt: stamp(10_800),
            status: .succeeded,
            actions: [
                .init(stepID: "inspect-context", actionID: "completed-1", status: "succeeded", outputAs: "现有页面与契约边界"),
                .init(stepID: "design-structure", actionID: "completed-2", status: "succeeded", outputAs: "工作库信息架构"),
                .init(stepID: "write-document", actionID: "completed-3", status: "succeeded", outputAs: "Markdown 交付物")
            ],
            events: [], response: nil, error: nil, artifactPath: artifactPath,
            evaluation: .init(score: 0.92, deliveryAllowed: true), isCancellationRequested: false
        )
        let running = TaskRun(
            id: "demo-work-running",
            input: "完善工作库的会话时间、运行进度与交付物展示",
            createdAt: stamp(160),
            status: .running,
            actions: [
                .init(stepID: "inspect-context", actionID: "running-1", status: "succeeded", outputAs: "现有会话与 Task 数据"),
                .init(stepID: "design-structure", actionID: "running-2", status: "succeeded", outputAs: "统一时间线方案"),
                .init(stepID: "write-approved-file", actionID: "running-3", status: "blocked", outputAs: "工作库设计说明"),
                .init(stepID: "verify-output", actionID: "running-4", status: "pending", outputAs: "视觉与构建验证")
            ],
            events: [], response: nil, error: nil, artifactPath: nil, evaluation: nil, isCancellationRequested: false
        )

        return Self(
            messages: messages,
            runs: [running, completed],
            lastActivity: ["ai-product-manager": stamp(8), "maya": stamp(180), "leo": stamp(259_200)],
            previews: [
                "ai-product-manager": "正在完善工作库的进度与交付物展示",
                "maya": "已收到，我会保留原始引文和样本限制",
                "leo": "需要补充事件定义和去重规则"
            ],
            artifacts: [artifactPath: """
            # 工作库信息架构

            工作库以 AI 员工的持续会话为入口，把普通消息、正式工作、运行活动和交付物放入同一条时间线。

            ## 验收结果

            - 每名员工只有一个持续会话
            - Task 与消息按真实时间排序
            - 运行状态和交付物可以恢复
            """],
            messageAttachments: [
                "work-alex-user": [
                    .init(name: "现有工作库截图.png", kind: "PNG 图像", size: "428 KB"),
                    .init(name: "工作库需求说明.md", kind: "Markdown", size: "6 KB")
                ],
                "work-maya-user": [
                    .init(name: "用户访谈记录.zip", kind: "ZIP 归档", size: "3.8 MB")
                ]
            ],
            approval: .init(
                taskID: "demo-work-running",
                action: "允许写入工作库设计说明",
                tool: "filesystem.write",
                scope: "/outputs/work-library-information-architecture.md",
                impact: "创建或覆盖这一个 Markdown 文件",
                networkAccess: false
            )
        )
    }
}

enum WorkRelativeTime {
    static func label(_ value: String?) -> String? {
        guard let value, let date = ISO8601DateFormatter().date(from: value) else { return nil }
        let seconds = max(0, Date().timeIntervalSince(date))
        if seconds < 45 { return "now" }
        if seconds < 3_600 { return "\(max(1, Int(seconds / 60)))m" }
        if seconds < 86_400 { return "\(Int(seconds / 3_600))h" }
        return "\(Int(seconds / 86_400))d"
    }
}
