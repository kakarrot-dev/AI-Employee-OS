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
            actions: [GraphNodeEvidence(stepID: "write", actionID: "action-1", status: "blocked", outputAs: "prd", toolID: "file-tool", action: "create_file", resource: "/tmp/prd.md", rationaleSummary: "创建交付文件")],
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
        let elapsedAt = ISO8601DateFormatter().date(from: "2026-08-06T02:55:25Z")!
        expect(
            TaskPresentation.elapsed("2026-08-06T02:54:20Z", at: elapsedAt) == "1 分 5 秒",
            "elapsed work time interpolates minutes and seconds"
        )
        expect(TaskPresentation.threadStatus("failed") == "未能完成", "failed work status uses user-facing language")
        expect(TaskPresentation.threadStatus("future_state") == "状态待确认", "unknown work status fails closed without exposing raw state")
        expect(TaskPresentation.runPhase("future_phase", waitingReason: nil) == "正在处理", "unknown run phase does not expose raw state")
        expect(
            AppDestination.allCases == [.office, .contacts, .work, .knowledge, .skills, .tools, .archive, .settings],
            "main shell exposes only the approved user-facing destinations"
        )
        let flowPayload = """
        {"schema_version":"1.0.0","business_flow_id":"flow_12345678","root_task_id":"task_root","scenario_id":"scenario_launch","scenario_version_id":"scenario_launch:v1","scenario_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","title":"发布准备","objective":"形成发布方案","status":"running","root_deliverable_id":null,"work_orders":[{"id":"work_12345678","node_id":"research","child_task_id":"task_child","assignee_agent_id":"maya","role":"executor","goal":"研究","status":"ready","revision":1}]}
        """.data(using: .utf8)!
        let flow = try! JSONDecoder().decode(BusinessFlowProjection.self, from: flowPayload)
        expect(flow.workOrders.first?.status == "ready" && flow.rootDeliverableID == nil, "business flow projection decodes Runtime state")
        let toolsPayload = """
        {"schema_version":"1.0","tools":[{"id":"file-tool","name":"File Tool","type":"native","version":"1.0.0","status":"active","summary":"Read files","category":"rust-native-v1","available":true,"documentation":"# 本地文件","actions":[{"name":"read_file","description":"Read","required_permissions":["filesystem.read"],"risk_level":0,"side_effect":"none","confirmation":"never","timeout_ms":10000,"idempotency":"safe","concurrency_safe":true,"sensitive_fields":["arguments.path"]}],"data_sources":null}]}
        """.data(using: .utf8)!
        let tools = try! JSONDecoder().decode(ToolsListResponse.self, from: toolsPayload)
        expect(tools.tools.first?.documentation?.contains("本地文件") == true, "tools-list documentation decodes")
        expect(tools.tools.first?.actions?.first?.riskLevel == 0, "tools-list actions decode risk")
        expect(ToolPresentation.actionTitle("create_file") == "创建文件", "tool action titles stay localized")
        expect(ToolPresentation.riskLabel(2) == "每次确认", "tool risk labels stay localized")
        expect(!AppDestination.primary.contains(.settings), "settings stays at the bottom of the global sidebar")
        expect(AppDestination.primary == [.office, .contacts, .work, .knowledge, .skills, .tools], "archive is pinned above settings while scenario builder stays out of the main list")

        let compactContext = AppLayoutResolver.context(
            windowSize: CGSize(width: 720, height: 572),
            globalNavigationVisible: false
        )
        let compactWork = AppLayoutResolver.resolve(
            profile: .work,
            availableSize: compactContext.windowSize,
            context: compactContext,
            prefersInspector: true
        )
        expect(compactContext.shellClass == .compact, "720pt resolves the compact shell")
        expect(compactContext.verticalDensity == .compact, "short windows use compact vertical density")
        expect(compactWork.presentation == .singlePane, "compact work uses a single semantic pane")
        expect(compactWork.primaryWidth >= 480 && !compactWork.showsCollection && !compactWork.showsInspector, "compact work preserves primary width and removes hidden panes")
        expect(
            !AppLayoutResolver.defaultGlobalNavigationVisible(windowSize: compactContext.windowSize, prefersGlobalNavigation: true),
            "compact shell defaults the global navigation to hidden without erasing preference"
        )

        let regularContext = AppLayoutResolver.context(
            windowSize: CGSize(width: 960, height: 600),
            globalNavigationVisible: true
        )
        let regularWork = AppLayoutResolver.resolve(
            profile: .work,
            availableSize: CGSize(width: 728, height: 600),
            context: regularContext,
            prefersInspector: true
        )
        expect(regularContext.shellClass == .regular, "960pt resolves the regular shell")
        expect(regularWork.presentation == .split, "960pt work keeps collection and primary content")
        expect(regularWork.primaryWidth >= AppLayoutProfile.work.primary.minWidth, "regular work never compresses primary content below its profile")
        expect(!regularWork.inspectorAvailable && !regularWork.showsInspector, "regular work omits an inspector that cannot meet minimum widths")

        let expandedContext = AppLayoutResolver.context(
            windowSize: CGSize(width: 1_280, height: 820),
            globalNavigationVisible: true
        )
        let expandedWork = AppLayoutResolver.resolve(
            profile: .work,
            availableSize: CGSize(width: 1_048, height: 820),
            context: expandedContext,
            prefersInspector: true
        )
        expect(expandedWork.presentation == .splitWithInspector, "1280pt work fits collection, primary content, and inspector")
        expect(expandedWork.primaryWidth >= AppLayoutProfile.work.primary.minWidth, "expanded work keeps the primary minimum")
        expect(expandedWork.visiblePanes.contains(.inspector), "expanded work renders its inspector")

        let compactBrowser = AppLayoutResolver.resolve(
            profile: .contacts,
            availableSize: compactContext.windowSize,
            context: compactContext
        )
        let compactBrowserCollection = compactBrowser.resolvingSinglePane(.collection)
        let compactBrowserDetail = compactBrowser.resolvingSinglePane(.primaryContent)
        expect(compactBrowser.presentation == .singlePane, "compact browsers drill between collection and detail")
        expect(compactBrowserCollection.showsCollection && !compactBrowserCollection.visiblePanes.contains(.primaryContent), "compact browser collection is the only rendered workspace pane")
        expect(!compactBrowserDetail.showsCollection && compactBrowserDetail.visiblePanes.contains(.primaryContent), "compact browser detail replaces the collection pane")

        let regularSettings = AppLayoutResolver.resolve(
            profile: .settings,
            availableSize: CGSize(width: 728, height: 600),
            context: regularContext
        )
        expect(regularSettings.presentation == .split && regularSettings.primaryWidth >= 480, "settings shares the regular browser contract")

        var alex = Employee.draft()
        alex.id = "ai-product-manager"
        alex.name = "Alex"
        alex.role = "AI 产品经理"
        alex.department = "产品部"
        var maya = Employee.draft()
        maya.id = "maya"
        maya.name = "Maya"
        maya.role = "用户研究员"
        maya.department = "研究部"

        let titledDelivery = TaskRun(
            id: "task-title-only",
            agentID: "maya",
            input: "原始目标文案",
            createdAt: "2026-08-05T10:00:00Z",
            status: .succeeded,
            actions: [],
            events: [],
            response: nil,
            error: nil,
            artifactPath: nil,
            evaluation: nil,
            isCancellationRequested: false,
            deliverableTitle: "访谈洞察报告"
        )
        let verifiedDelivery = TaskRun(
            id: "task-verified",
            agentID: "ai-product-manager",
            input: "写 PRD",
            createdAt: "2026-08-05T11:00:00Z",
            status: .succeeded,
            actions: [],
            events: [],
            response: nil,
            error: nil,
            artifactPath: "/tmp/draft.md",
            evaluation: nil,
            isCancellationRequested: false,
            deliverableTitle: "产品需求文档",
            verifiedArtifactPath: "/tmp/outputs/prd.md"
        )
        let ignored = TaskRun(
            id: "task-empty",
            agentID: "ai-product-manager",
            input: "无交付",
            createdAt: "2026-08-05T12:00:00Z",
            status: .succeeded,
            actions: [],
            events: [],
            response: nil,
            error: nil,
            artifactPath: nil,
            evaluation: nil,
            isCancellationRequested: false
        )
        let office = OfficeSnapshot.live(
            employees: [alex, maya],
            runs: [titledDelivery, verifiedDelivery, ignored],
            isLoading: false,
            runtimeMessage: nil,
            usage: OfficeSnapshot.UsageSummary(
                inputTokens: 100,
                outputTokens: 40,
                estimatedCostCNY: 0.01,
                modelCalls: 2,
                points: [
                    OfficeSnapshot.UsagePoint(id: "2026-08-05", label: "今天", inputTokens: 100, outputTokens: 40)
                ],
                pricingModel: "deepseek-v4-flash",
                pricingVersion: "deepseek-v4-flash-cny-v1"
            )
        )
        expect(office.deliveries.count == 2, "live office keeps title-only and path deliveries")
        expect(
            office.deliveries.contains { $0.title == "访谈洞察报告" && $0.employeeName == "Maya" && $0.artifactName == "访谈洞察报告" },
            "title-only delivery uses deliverable title and agent name"
        )
        expect(
            office.deliveries.contains { $0.title == "产品需求文档" && $0.employeeName == "Alex" && $0.artifactName == "prd.md" },
            "verified artifact path wins for delivery filename"
        )
        expect(verifiedDelivery.hasPersistentDeliverable, "verified delivery remains in the conversation timeline")
        expect(!ignored.hasPersistentDeliverable, "plain completed work may yield to its final assistant reply")
        expect(office.usage?.modelCalls == 2 && office.usage?.totalTokens == 140, "live office keeps usage summary")
        let runningWork = TaskRun(
            id: "task-running",
            agentID: "maya",
            input: "整理访谈记录",
            createdAt: "2026-08-05T13:00:00Z",
            status: .running,
            actions: [],
            events: [],
            response: nil,
            error: nil,
            artifactPath: nil,
            evaluation: nil,
            isCancellationRequested: false
        )
        let officeWithRunningWork = OfficeSnapshot.live(
            employees: [alex, maya],
            runs: [runningWork],
            isLoading: false,
            runtimeMessage: nil
        )
        expect(officeWithRunningWork.currentWork.count == 1, "live office exposes current work details")
        let usagePayload = """
        {"schema_version":"1.0","input_tokens":2000000,"output_tokens":500000,"estimated_cost_cny":3.0,"model_calls":2,"points":[{"id":"2026-08-05","label":"今天","input_tokens":1000000,"output_tokens":500000},{"id":"2026-08-04","label":"8/4","input_tokens":1000000,"output_tokens":0}],"pricing_model":"deepseek-v4-flash","pricing_basis":"input_cache_miss"}
        """.data(using: .utf8)!
        let usageDecoded = try! JSONDecoder().decode(UsageSummaryResponse.self, from: usagePayload)
        expect(usageDecoded.officeSummary?.estimatedCostCNY == 3.0, "usage-summary decodes official CNY estimate")
        let emptyUsage = """
        {"schema_version":"1.0","input_tokens":0,"output_tokens":0,"estimated_cost_cny":0,"model_calls":0,"points":[],"pricing_model":"deepseek-v4-flash","pricing_basis":"input_cache_miss"}
        """.data(using: .utf8)!
        expect(try! JSONDecoder().decode(UsageSummaryResponse.self, from: emptyUsage).officeSummary == nil, "zero model calls stay as empty placeholder")

        let taskRoomPayload = """
        {"schema_version":"1.0.0","id":"thread-1","title":"市场调研","status":"running","current_revision":1,"root_task_id":"root-1","execution":null,"created_at":"1","updated_at":"2","archived_at":null,"messages":[],"room":{"schema_version":"1.0.0","thread_id":"thread-1","participants":[{"agent_id":"researcher","name":"数据搜集员工","role":"研究员","avatar_path":null,"status":"running"}],"items":[{"id":"timeline-1","sequence":1,"role":"agent","kind":"agent_update","content":"开始检索","created_at":"2","agent_id":"researcher","agent_name":"数据搜集员工","agent_role":"研究员","avatar_path":null,"task_id":"task-1","run_id":"run-1","action_id":null,"approval_id":null,"handoff_id":null,"deliverable_id":null,"status":"started","tool_id":null,"action":null,"artifact_uri":null}]}}
        """.data(using: .utf8)!
        let taskRoom = try! JSONDecoder().decode(TaskThreadProjection.self, from: taskRoomPayload)
        expect(taskRoom.room.participants.first?.name == "数据搜集员工", "task room decodes participant identity")
        expect(taskRoom.room.items.first?.role == "agent" && taskRoom.room.items.first?.runID == "run-1", "task room binds agent message to canonical run")

        expect(
            TaskProposalPresentationState.initial(threadStatus: "drafting", proposal: nil)
                == .recoverable(message: "上次方案未完成，可以重新生成。"),
            "drafting task thread offers explicit proposal recovery"
        )
        expect(
            TaskProposalPresentationState.initial(threadStatus: "running", proposal: nil) == .idle,
            "materialized task thread does not expose proposal recovery"
        )
        expect(
            TaskProposalPresentationState.failure(code: "task_proposal_provider_network")
                == .failed(message: "模型服务连接中断，请稍后重试。", diagnosticCode: "task_proposal_provider_network"),
            "proposal provider failures keep user copy and a stable diagnostic code"
        )

        let candidateProposal = TaskProposalResponse(
            proposalID: "proposal-1",
            threadID: "thread-1",
            proposalHash: "hash-1",
            requiresConfirmation: true,
            resolvedAssignments: [
                .init(nodeID: "research", agentID: "missing-researcher", skillIDs: ["web-search"]),
                .init(nodeID: "plan", agentID: "ai-product-manager", skillIDs: ["prd-generation"]),
            ],
            proposal: .init(
                intent: "work",
                title: "产品调研",
                objective: "完成调研并形成方案",
                assignments: [
                    .init(
                        nodeID: "research",
                        role: "researcher",
                        employeeSelector: .init(preferredID: nil, capabilities: ["web.search"]),
                        goal: "收集证据",
                        dependsOn: []
                    ),
                    .init(
                        nodeID: "plan",
                        role: "planner",
                        employeeSelector: .init(preferredID: "ai-product-manager", capabilities: ["product.plan"]),
                        goal: "形成方案",
                        dependsOn: ["research"]
                    ),
                ],
                missingInputs: []
            )
        )
        let candidates = candidateProposal.candidateAssignments(employees: [alex])
        expect(
            candidates.map(\.id) == ["research", "plan"],
            "proposal candidate assignments preserve proposal order"
        )
        expect(
            candidates.last?.agentID == "ai-product-manager"
                && candidates.last?.name == "Alex"
                && candidates.last?.role == "AI 产品经理",
            "proposal candidate assignments join resolved agent identity to employee profiles"
        )
        expect(
            candidates.first?.agentID == "missing-researcher"
                && candidates.first?.name == "missing-researcher"
                && candidates.first?.role == "员工资料不可用",
            "proposal candidate assignments keep missing employee identities visible"
        )

        print("client model checks passed")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
        guard condition() else {
            FileHandle.standardError.write(Data("client model check failed: \(name)\n".utf8))
            exit(1)
        }
    }
}
