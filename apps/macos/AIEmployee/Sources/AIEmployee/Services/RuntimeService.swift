import Foundation
import OSLog

struct RuntimeService: Sendable {
    enum RuntimeError: LocalizedError {
        case missingRepository
        case missingRuntime
        case storageUnavailable(String)
        case processUnavailable(String)
        case processFailed(String)
        case invalidResponse(String)

        var errorDescription: String? {
            switch self {
            case .missingRepository: "无法定位 AI Employee OS 仓库"
            case .missingRuntime: "Runtime 尚未构建或 App Bundle 不完整，请重新构建并启动 App。"
            case .storageUnavailable(let message): "无法访问本地任务存储：\(message)"
            case .processUnavailable(let message): "无法启动 Runtime：\(message)"
            case .processFailed(let message): Self.userFacingRuntimeFailure(message)
            case .invalidResponse(let message): "Runtime 返回不可解析：\(message)"
            }
        }

        private static func userFacingRuntimeFailure(_ message: String) -> String {
            if message.contains("task_proposal_provider_network") {
                return "模型服务连接中断，请稍后重试提出方案。任务草稿已经保存。"
            }
            if message.contains("task_proposal_provider_rate_limited") {
                return "模型服务当前请求过多，请稍后重试。任务草稿已经保存。"
            }
            if message.contains("task_proposal_provider_authentication") {
                return "模型凭证无效或未配置，请检查设置后重试。任务草稿已经保存。"
            }
            if message.contains("task_proposal_provider_quota") {
                return "模型服务额度不足，请检查账户额度后重试。任务草稿已经保存。"
            }
            if message.contains("task_proposal_provider_server_temporary") || message.contains("task_proposal_provider_dependency_unavailable") {
                return "模型服务暂时不可用，请稍后重试。任务草稿已经保存。"
            }
            if message.contains("task_proposal_provider_invalid_response") {
                return "模型返回的方案无法解析，请重新提出方案。任务草稿已经保存。"
            }
            if message.contains("task_proposal_schema_invalid") {
                return "模型返回的方案不符合执行契约，请重新提出方案。任务草稿已经保存。"
            }
            return "Runtime 执行失败：\(message)"
        }
    }

    let recover: @Sendable () async throws -> Void
    let loadHistory: @Sendable () async throws -> TaskHistoryResponse
    let loadUsageSummary: @Sendable () async throws -> UsageSummaryResponse
    let events: @Sendable (String, Int) async throws -> RuntimeEventsResponse
    let cancel: @Sendable (String) async throws -> Void
    let continueRun: @Sendable (String, Bool, String?) async throws -> RunContinuationResponse
    let resolveUnknown: @Sendable (String, String) async throws -> RunContinuationResponse
    let chatHistory: @Sendable (String, String) async throws -> ChatHistoryResponse
    let chatSend: @Sendable (String, String, String, String, String?, @escaping @MainActor @Sendable (String) -> Void) async throws -> ChatSendResponse
    let chatAbort: @Sendable (String, String) async throws -> Void
    let chatDelete: @Sendable (String, String) async throws -> ChatDeleteResponse
    let chatRetention: @Sendable (String, String, String) async throws -> ChatRetentionResponse
    let archiveList: @Sendable () async throws -> ArchiveListResponse
    let employeeList: @Sendable () async throws -> EmployeeListResponse
    let employeeSave: @Sendable (Employee) async throws -> EmployeeSaveResponse
    let employeeDelete: @Sendable (String) async throws -> EmployeeDeleteResponse
    let effectivePrompt: @Sendable (String) async throws -> EffectivePromptResponse
    let capabilities: @Sendable () async throws -> RuntimeCapabilities
    let skillsList: @Sendable (String?) async throws -> SkillsListResponse
    let toolsList: @Sendable () async throws -> ToolsListResponse
    let knowledgeList: @Sendable () async throws -> KnowledgeListResponse
    let bindSkill: @Sendable (String, String, String) async throws -> BindSkillResponse
    let unbindSkill: @Sendable (String, String) async throws -> UnbindSkillResponse
    let taskThreadCreate: @Sendable (String, String) async throws -> TaskThreadProjection
    let taskThreadList: @Sendable (Bool) async throws -> [TaskThreadProjection]
    let taskThreadMessage: @Sendable (String, String) async throws -> TaskThreadProjection
    let taskThreadRetention: @Sendable (String, String) async throws -> TaskThreadRetentionResponse
    let taskProposalGenerate: @Sendable (String, String?) async throws -> TaskProposalResponse
    let taskProposalConfirm: @Sendable (String, String) async throws -> TaskProposalConfirmationResponse
    let scenarioList: @Sendable () async throws -> [ScenarioSummary]
    let scenarioPropose: @Sendable (String, String) async throws -> ScenarioProposalResponse
    let scenarioSave: @Sendable (String, String, ScenarioProposal) async throws -> ScenarioSaved
    let businessFlowPlan: @Sendable (String) async throws -> BusinessFlowPlan
    let businessFlowStart: @Sendable (String, String, String) async throws -> BusinessFlowProjection
    let businessFlowList: @Sendable () async throws -> [BusinessFlowProjection]
    let businessFlowContinue: @Sendable (String, String?) async throws -> BusinessFlowContinueResponse

    static func live() -> Self {
        Self(recover: {
            let _: RecoveryResponse = try await decodeCommand(
                ["recover-runtime", "--database", try databaseURL().path],
                as: RecoveryResponse.self
            )
        }, loadHistory: {
            try await Task.detached(priority: .utility) {
                let layout = try runtimeLayout()
                let binary = layout.binary
                let database = layout.database
                guard FileManager.default.fileExists(atPath: database.path) else {
                    return TaskHistoryResponse(schemaVersion: "1.0", tasks: [])
                }
                let process = Process()
                process.executableURL = binary
                process.arguments = ["list-tasks", "--database", database.path]
                let stdout = Pipe()
                let stderr = Pipe()
                process.standardOutput = stdout
                process.standardError = stderr
                do { try process.run() }
                catch { throw RuntimeError.processUnavailable(error.localizedDescription) }
                process.waitUntilExit()
                let output = stdout.fileHandleForReading.readDataToEndOfFile()
                let error = stderr.fileHandleForReading.readDataToEndOfFile()
                guard process.terminationStatus == 0 else {
                    throw RuntimeError.processFailed(String(decoding: error, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
                }
                do { return try JSONDecoder().decode(TaskHistoryResponse.self, from: output) }
                catch { throw RuntimeError.invalidResponse(error.localizedDescription) }
            }.value
        }, loadUsageSummary: {
            let layout = try runtimeLayout()
            let database = layout.database
            guard FileManager.default.fileExists(atPath: database.path) else {
                return UsageSummaryResponse(
                    schemaVersion: "1.0",
                    inputTokens: 0,
                    outputTokens: 0,
                    estimatedCostCNY: 0,
                    modelCalls: 0,
                    points: [],
                    pricingModel: "deepseek-v4-flash",
                    pricingBasis: "input_cache_miss",
                    pricingVersion: "deepseek-v4-flash-cny-v1",
                    pricingSource: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/"
                )
            }
            return try await decodeCommand(
                ["usage-summary", "--database", database.path],
                as: UsageSummaryResponse.self
            )
        }, events: { taskID, after in
            try await decodeCommand(["events", "--database", try databaseURL().path, "--task-id", taskID, "--after", String(after)], as: RuntimeEventsResponse.self)
        }, cancel: { taskID in
            let _: CancelResponse = try await decodeCommand(["cancel-task", "--database", try databaseURL().path, "--task-id", taskID], as: CancelResponse.self)
        }, continueRun: { runID, approve, inputJSON in
            let layout = try runtimeLayout()
            var arguments = [
                "continue-run", "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path, "--run-id", runID
            ]
            if let inputJSON {
                arguments.append(contentsOf: ["--input-json", inputJSON])
            } else {
                arguments.append(contentsOf: ["--authorized-root", layout.outputDirectory.path, approve ? "--approve" : "--reject"])
            }
            return try await decodeCommand(arguments, environment: approve || inputJSON != nil ? try ModelConfiguration.environment() : [:], as: RunContinuationResponse.self)
        }, resolveUnknown: { actionID, status in
            let layout = try runtimeLayout()
            let evidence = try JSONSerialization.data(withJSONObject: [
                "method": "manual_user_verification",
                "observation": status == "succeeded" ? "用户确认副作用已发生且结果正确" : "用户确认副作用未成功完成或结果不正确",
                "observed_at": ISO8601DateFormatter().string(from: Date())
            ], options: [.sortedKeys])
            let evidenceJSON = String(decoding: evidence, as: UTF8.self)
            return try await decodeCommand([
                "resolve-action-result", "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path,
                "--action-id", actionID, "--status", status,
                "--evidence-json", evidenceJSON
            ], environment: try ModelConfiguration.environment(), as: RunContinuationResponse.self)
        }, chatHistory: { conversationID, employeeID in
            try await decodeCommand(["chat-history", "--database", try databaseURL().path, "--conversation-id", conversationID, "--employee-id", employeeID], as: ChatHistoryResponse.self)
        }, chatSend: { conversationID, employeeID, input, _, replaceMessageID, onDelta in
            var arguments = ["chat-send", "--stream-events", "--repository-root", try runtimeLayout().resourceRoot.path, "--database", try databaseURL().path, "--conversation-id", conversationID, "--employee-id", employeeID, "--input", input]
            if let replaceMessageID { arguments.append(contentsOf: ["--replace-message-id", replaceMessageID]) }
            return try await streamChatCommand(
                arguments,
                environment: try ModelConfiguration.environment(),
                onDelta: onDelta
            )
        }, chatAbort: { conversationID, employeeID in
            let _: ChatAbortResponse = try await decodeCommand([
                "chat-abort", "--database", try databaseURL().path,
                "--conversation-id", conversationID, "--employee-id", employeeID
            ], as: ChatAbortResponse.self)
        }, chatDelete: { conversationID, employeeID in
            try await decodeCommand(["chat-delete", "--database", try databaseURL().path, "--conversation-id", conversationID, "--employee-id", employeeID], as: ChatDeleteResponse.self)
        }, chatRetention: { conversationID, employeeID, operation in
            try await decodeCommand(["chat-retention", "--database", try databaseURL().path, "--conversation-id", conversationID, "--employee-id", employeeID, "--operation", operation], as: ChatRetentionResponse.self)
        }, archiveList: {
            try await decodeCommand(["archive-list", "--database", try databaseURL().path], as: ArchiveListResponse.self)
        }, employeeList: {
            try await decodeCommand(["employees-list", "--repository-root", try runtimeLayout().resourceRoot.path, "--database", try databaseURL().path], as: EmployeeListResponse.self)
        }, employeeSave: { employee in
            let data = try JSONEncoder().encode(employee)
            let payload = String(decoding: data, as: UTF8.self)
            return try await decodeCommand(["employee-save", "--database", try databaseURL().path, "--payload", payload], as: EmployeeSaveResponse.self)
        }, employeeDelete: { id in
            try await decodeCommand(["employee-delete", "--database", try databaseURL().path, "--employee-id", id], as: EmployeeDeleteResponse.self)
        }, effectivePrompt: { id in
            try await decodeCommand(["effective-prompt", "--database", try databaseURL().path, "--employee-id", id], as: EffectivePromptResponse.self)
        }, capabilities: {
            try await decodeCommand(["capabilities", "--repository-root", try runtimeLayout().resourceRoot.path, "--database", try databaseURL().path], as: RuntimeCapabilities.self)
        }, skillsList: { agentID in
            var args = ["skills-list", "--repository-root", try runtimeLayout().resourceRoot.path, "--database", try databaseURL().path]
            if let agentID {
                args.append(contentsOf: ["--agent-id", agentID])
            }
            return try await decodeCommand(args, as: SkillsListResponse.self)
        }, toolsList: {
            try await decodeCommand(["tools-list", "--repository-root", try runtimeLayout().resourceRoot.path, "--database", try databaseURL().path], as: ToolsListResponse.self)
        }, knowledgeList: {
            try await decodeCommand(["knowledge-list", "--database", try databaseURL().path], as: KnowledgeListResponse.self)
        }, bindSkill: { agentID, skillID, skillVersion in
            try await decodeCommand([
                "bind-skill",
                "--database", try databaseURL().path,
                "--agent-id", agentID,
                "--skill-id", skillID,
                "--skill-version", skillVersion
            ], as: BindSkillResponse.self)
        }, unbindSkill: { agentID, skillID in
            try await decodeCommand([
                "unbind-skill",
                "--database", try databaseURL().path,
                "--agent-id", agentID,
                "--skill-id", skillID
            ], as: UnbindSkillResponse.self)
        }, taskThreadCreate: { title, objective in
            try await decodeCommand([
                "task-thread-create", "--database", try databaseURL().path,
                "--title", title, "--objective", objective
            ], as: TaskThreadProjection.self)
        }, taskThreadList: { archived in
            var arguments = ["task-thread-list", "--database", try databaseURL().path]
            if archived { arguments.append("--archived") }
            return try await decodeCommand(arguments, as: [TaskThreadProjection].self)
        }, taskThreadMessage: { threadID, input in
            try await decodeCommand([
                "task-thread-message", "--database", try databaseURL().path,
                "--thread-id", threadID, "--input", input
            ], as: TaskThreadProjection.self)
        }, taskThreadRetention: { threadID, operation in
            try await decodeCommand([
                "task-thread-retention", "--database", try databaseURL().path,
                "--thread-id", threadID, "--operation", operation
            ], as: TaskThreadRetentionResponse.self)
        }, taskProposalGenerate: { threadID, preferredAgentID in
            let layout = try runtimeLayout()
            var arguments = [
                "task-proposal-generate", "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path, "--thread-id", threadID
            ]
            if let preferredAgentID { arguments.append(contentsOf: ["--preferred-agent-id", preferredAgentID]) }
            return try await decodeCommand(arguments, environment: try ModelConfiguration.environment(), as: TaskProposalResponse.self)
        }, taskProposalConfirm: { proposalID, proposalHash in
            let layout = try runtimeLayout()
            return try await decodeCommand([
                "task-proposal-confirm", "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path, "--proposal-id", proposalID,
                "--proposal-hash", proposalHash
            ], environment: try ModelConfiguration.environment(), as: TaskProposalConfirmationResponse.self)
        }, scenarioList: {
            try await decodeCommand([
                "scenario-list", "--database", try databaseURL().path
            ], as: [ScenarioSummary].self)
        }, scenarioPropose: { objective, _ in
            let input = try JSONSerialization.data(withJSONObject: [
                "objective": objective,
                "constraints": ["Phase 1 固定串行执行"],
                "overall_acceptance_criteria": [[
                    "criterion_id": "final-evaluation",
                    "description": "最终交付物通过 Runtime Evaluation",
                    "evidence_type": "evaluation",
                    "required": true
                ]],
            ])
            let layout = try runtimeLayout()
            return try await decodeCommand([
                "scenario-propose",
                "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path,
                "--input-json", String(decoding: input, as: UTF8.self),
            ], environment: try ModelConfiguration.environment(), as: ScenarioProposalResponse.self)
        }, scenarioSave: { scenarioID, source, proposal in
            let payload = String(decoding: try JSONEncoder().encode(proposal), as: UTF8.self)
            return try await decodeCommand([
                "scenario-save", "--database", try databaseURL().path,
                "--scenario-id", scenarioID, "--source", source,
                "--input-json", payload, "--confirmed",
            ], as: ScenarioSaved.self)
        }, businessFlowPlan: { scenarioID in
            try await decodeCommand([
                "business-flow-plan", "--database", try databaseURL().path,
                "--scenario-id", scenarioID,
            ], as: BusinessFlowPlan.self)
        }, businessFlowStart: { flowID, scenarioID, planHash in
            try await decodeCommand([
                "business-flow-start", "--database", try databaseURL().path,
                "--flow-id", flowID, "--scenario-id", scenarioID,
                "--plan-hash", planHash,
            ], as: BusinessFlowProjection.self)
        }, businessFlowList: {
            try await decodeCommand([
                "business-flow-list", "--database", try databaseURL().path,
            ], as: [BusinessFlowProjection].self)
        }, businessFlowContinue: { flowID, _ in
            let layout = try runtimeLayout()
            return try await decodeCommand([
                "business-flow-continue",
                "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path,
                "--flow-id", flowID,
            ], environment: try ModelConfiguration.environment(), as: BusinessFlowContinueResponse.self)
        })
    }

    private struct CancelResponse: Codable, Sendable { let status: String }
    private struct ChatAbortResponse: Codable, Sendable { let status: String }
    private struct RecoveryResponse: Codable, Sendable {
        let schemaVersion: String
        let safeFailures: Int
        let resultUnknown: Int
        enum CodingKeys: String, CodingKey {
            case schemaVersion = "schema_version"
            case safeFailures = "safe_failures"
            case resultUnknown = "result_unknown"
        }
    }

    private static func databaseURL() throws -> URL {
        let database = try runtimeLayout().database
        do {
            try FileManager.default.createDirectory(at: database.deletingLastPathComponent(), withIntermediateDirectories: true)
        } catch {
            throw RuntimeError.storageUnavailable(error.localizedDescription)
        }
        return database
    }

    static func authorizedOutputDirectory() throws -> URL {
        try runtimeLayout().outputDirectory
    }

    private static func decodeCommand<T: Decodable & Sendable>(_ arguments: [String], environment: [String: String] = [:], as type: T.Type) async throws -> T {
        try await Task.detached(priority: .utility) {
            let binary = try runtimeLayout().binary
            let process = Process()
            process.executableURL = binary
            process.arguments = arguments
            process.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
            let stdout = Pipe(); let stderr = Pipe()
            process.standardOutput = stdout; process.standardError = stderr
            do { try process.run() }
            catch { throw RuntimeError.processUnavailable(error.localizedDescription) }
            process.waitUntilExit()
            let output = stdout.fileHandleForReading.readDataToEndOfFile()
            let error = stderr.fileHandleForReading.readDataToEndOfFile()
            guard process.terminationStatus == 0 else { throw RuntimeError.processFailed(String(decoding: error, as: UTF8.self)) }
            do { return try JSONDecoder().decode(T.self, from: output) }
            catch { throw RuntimeError.invalidResponse(error.localizedDescription) }
        }.value
    }

    private static func streamChatCommand(
        _ arguments: [String],
        environment: [String: String],
        onDelta: @escaping @MainActor @Sendable (String) -> Void
    ) async throws -> ChatSendResponse {
        let worker = Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = try runtimeLayout().binary
            process.arguments = arguments
            process.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            return try await withTaskCancellationHandler {
                do { try process.run() }
                catch { throw RuntimeError.processUnavailable(error.localizedDescription) }

                var buffer = Data()
                var response: ChatSendResponse?
                let decoder = JSONDecoder()
                while let data = try stdout.fileHandleForReading.read(upToCount: 4096), !data.isEmpty {
                    try Task.checkCancellation()
                    buffer.append(data)
                    while let newline = buffer.firstIndex(of: 0x0A) {
                        let line = buffer.prefix(upTo: newline)
                        buffer.removeSubrange(...newline)
                        guard !line.isEmpty else { continue }
                        if let event = try? decoder.decode(ChatStreamDelta.self, from: line), event.type == "delta" {
                            await onDelta(event.delta)
                        } else if let completed = try? decoder.decode(ChatSendResponse.self, from: line) {
                            response = completed
                        }
                    }
                }
                process.waitUntilExit()
                try Task.checkCancellation()
                let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
                guard process.terminationStatus == 0 else {
                    throw RuntimeError.processFailed(String(decoding: errorData, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
                }
                guard let response else { throw RuntimeError.invalidResponse("流式响应缺少完成事件") }
                return response
            } onCancel: {
                if process.isRunning { process.terminate() }
            }
        }
        return try await withTaskCancellationHandler {
            try await worker.value
        } onCancel: {
            worker.cancel()
        }
    }

    private static func repositoryRoot() throws -> URL {
        if let configured = ProcessInfo.processInfo.environment["AI_EMPLOYEE_OS_ROOT"] {
            return URL(filePath: configured)
        }
        var candidate = Bundle.main.bundleURL
        for _ in 0..<5 {
            candidate.deleteLastPathComponent()
            if FileManager.default.fileExists(atPath: candidate.appending(path: "Cargo.toml").path) {
                return candidate
            }
        }
        throw RuntimeError.missingRepository
    }

    private struct RuntimeLayout {
        let resourceRoot: URL
        let binary: URL
        let database: URL
        let outputDirectory: URL
    }

    private static func runtimeLayout() throws -> RuntimeLayout {
        let bundleRoot = Bundle.main.bundleURL.appending(path: "Contents/Resources/AIEmployeeRuntime")
        let bundleBinary = Bundle.main.bundleURL.appending(path: "Contents/MacOS/ai-employee-runtime")
        if FileManager.default.fileExists(atPath: bundleRoot.appending(path: "runtime/python-agent/app/chat_worker.py").path),
           FileManager.default.isExecutableFile(atPath: bundleBinary.path) {
            let applicationSupport = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                .appending(path: "AIEmployee", directoryHint: .isDirectory)
            return RuntimeLayout(
                resourceRoot: bundleRoot,
                binary: bundleBinary,
                database: applicationSupport.appending(path: "runtime.db"),
                outputDirectory: applicationSupport.appending(path: "outputs", directoryHint: .isDirectory)
            )
        }
        let root = try repositoryRoot()
        let developmentBinary = root.appending(path: "target/debug/ai-employee-runtime")
        guard FileManager.default.isExecutableFile(atPath: developmentBinary.path) else {
            throw RuntimeError.missingRuntime
        }
        return RuntimeLayout(
            resourceRoot: root,
            binary: developmentBinary,
            database: root.appending(path: "storage/database/runtime.db"),
            outputDirectory: root.appending(path: "outputs", directoryHint: .isDirectory)
        )
    }
}
