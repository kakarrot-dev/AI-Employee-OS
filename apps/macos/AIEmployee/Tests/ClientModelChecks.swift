import Foundation

@main
enum ClientModelChecks {
    static func main() {
        let document = """
        # 标题
        ## 范围
        - 条目
        1. 第一步
        > 引用
        ---
        ```swift
        let value = 1
        ```
        """
        expect(
            MarkdownBlock.parse(document) == [
                .heading(level: 1, text: "标题"),
                .heading(level: 2, text: "范围"),
                .bullet("条目"),
                .numbered("第一步"),
                .quote("引用"),
                .divider,
                .code("let value = 1")
            ],
            "Markdown document structure"
        )
        expect(
            MarkdownBlock.parse("```\nline one\nline two") == [.code("line one\nline two")],
            "unclosed code block preservation"
        )
        expect(
            EmployeePresence.resolve(activeRun: nil, latestRun: nil) == .available,
            "employee is available without active work"
        )
        let blocked = TaskRun(
            id: "task-1",
            agentID: "ai-product-manager",
            input: "生成 PRD",
            createdAt: "2026-08-05T00:00:00Z",
            status: .running,
            actions: [GraphNodeEvidence(stepID: "write", actionID: "action-1", status: "blocked", outputAs: "prd")],
            events: [],
            response: nil,
            error: nil,
            artifactPath: nil,
            evaluation: nil,
            isCancellationRequested: false
        )
        expect(
            EmployeePresence.resolve(activeRun: blocked, latestRun: blocked) == .attention,
            "blocked action requires attention"
        )
        let employee = Employee.draft()
        expect(employee.schemaVersion == "1.0" && employee.status == "active", "employee draft uses canonical defaults")
        expect(employee.persona.thinking.approach == "user_value_first", "persona defaults match Alex package")
        let encoded = try! JSONEncoder().encode(employee)
        expect((try? JSONDecoder().decode(Employee.self, from: encoded))?.basePrompt == employee.basePrompt, "employee contract round trip")
        let chatSend = """
        {"schema_version":"1.0","conversation_id":"c1","employee_id":"ai-product-manager","config_version":2,"message":{"id":"m1","role":"assistant","content":"你好","created_at":"2026-08-05T00:00:00Z"}}
        """.data(using: .utf8)!
        let decodedSend = try! JSONDecoder().decode(ChatSendResponse.self, from: chatSend)
        expect(decodedSend.employeeID == "ai-product-manager" && decodedSend.configVersion == 2, "chat-send response includes employee and config version")
        expect(
            AppDestination.allCases == [.office, .contacts, .work, .skills, .tools, .settings],
            "main shell exposes the approved six destinations"
        )
        expect(!AppDestination.primary.contains(.settings), "settings stays at the bottom of the global sidebar")
        print("client model checks passed")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
        guard condition() else {
            FileHandle.standardError.write(Data("client model check failed: \(name)\n".utf8))
            exit(1)
        }
    }
}
