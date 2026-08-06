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
                .numbered("1. 第一步"),
                .quote("引用"),
                .divider,
                .code("let value = 1")
            ],
            "Markdown document structure"
        )
        expect(
            MarkdownBlock.parse("| 名称 | 状态 |\n| --- | :---: |\n| Alex | 工作中 |") == [
                .table(headers: ["名称", "状态"], rows: [["Alex", "工作中"]])
            ],
            "Markdown table structure"
        )
        expect(
            MarkdownBlock.parse("```\nline one\nline two") == [.code("line one\nline two")],
            "unclosed code block preservation"
        )
        let standaloneLink = MarkdownBlock.standaloneLink(in: "[OpenAI 发布说明](https://openai.com/news/)")
        expect(
            standaloneLink?.title == "OpenAI 发布说明" && standaloneLink?.url.host == "openai.com",
            "standalone Markdown links become semantic link presentations"
        )
        expect(
            MarkdownBlock.standaloneLink(in: "[本地文件](file:///tmp/private)") == nil,
            "link cards only accept public HTTP URLs"
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
        let draftErrors = EmployeeDraftValidation.errors(employee: employee, soulPrompt: "")
        expect(draftErrors[.id] != nil && draftErrors[.soul] != nil, "employee draft validation reports blocking fields")
        var validEmployee = employee
        validEmployee.id = "research-assistant"
        validEmployee.name = "研究助理"
        validEmployee.role = "AI 研究员"
        validEmployee.department = "研究部"
        expect(EmployeeDraftValidation.errors(employee: validEmployee, soulPrompt: "以证据为先").isEmpty, "employee draft validation accepts a complete profile")
        let chatSend = """
        {"schema_version":"1.0","conversation_id":"c1","employee_id":"ai-product-manager","config_version":2,"message":{"id":"m1","role":"assistant","content":"你好","created_at":"2026-08-05T00:00:00Z"}}
        """.data(using: .utf8)!
        let decodedSend = try! JSONDecoder().decode(ChatSendResponse.self, from: chatSend)
        expect(decodedSend.employeeID == "ai-product-manager" && decodedSend.configVersion == 2, "chat-send response includes employee and config version")
        expect(TaskPresentation.time("1785982643508") != "1785982643508", "conversation time accepts Runtime millisecond timestamps")
        expect(
            TaskPresentation.time("2026-08-06T02:54:20.944Z") != "2026-08-06T02:54:20.944Z",
            "conversation time accepts fractional ISO 8601 timestamps"
        )
        expect(
            TaskPresentation.isChronologicallyBefore("1785982643", "2026-08-06T02:54:20.944Z"),
            "mixed Runtime and ISO timestamps sort chronologically"
        )
        expect(
            AppDestination.allCases == [.office, .contacts, .work, .skills, .tools, .settings],
            "main shell exposes the approved six destinations"
        )
        let toolsPayload = """
        {"schema_version":"1.0","tools":[{"id":"file-tool","name":"File Tool","type":"native","version":"1.0.0","status":"active","summary":"Read files","category":"rust-native-v1","available":true,"documentation":"# 本地文件","actions":[{"name":"read_file","description":"Read","required_permissions":["filesystem.read"],"risk_level":0,"side_effect":"none","confirmation":"never","timeout_ms":10000,"idempotency":"safe","concurrency_safe":true,"sensitive_fields":["arguments.path"]}],"data_sources":null}]}
        """.data(using: .utf8)!
        let tools = try! JSONDecoder().decode(ToolsListResponse.self, from: toolsPayload)
        expect(tools.tools.first?.documentation?.contains("本地文件") == true, "tools-list documentation decodes")
        expect(tools.tools.first?.actions?.first?.riskLevel == 0, "tools-list actions decode risk")
        expect(ToolPresentation.actionTitle("create_file") == "创建文件", "tool action titles stay localized")
        expect(ToolPresentation.riskLabel(2) == "每次确认", "tool risk labels stay localized")
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
