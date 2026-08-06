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
            case .processFailed(let message): "Runtime 执行失败：\(message)"
            case .invalidResponse(let message): "Runtime 返回不可解析：\(message)"
            }
        }
    }

    let recover: @Sendable () async throws -> Void
    let loadHistory: @Sendable () async throws -> TaskHistoryResponse
    let loadUsageSummary: @Sendable () async throws -> UsageSummaryResponse
    let events: @Sendable (String, Int) async throws -> RuntimeEventsResponse
    let cancel: @Sendable (String) async throws -> Void
    let continueRun: @Sendable (String, Bool, String?) async throws -> RunContinuationResponse
    let resolveUnknown: @Sendable (String, String) async throws -> RunContinuationResponse
    let chatHistory: @Sendable (String) async throws -> ChatHistoryResponse
    let chatSend: @Sendable (String, String, String, String, String?, @escaping @MainActor @Sendable (String) -> Void) async throws -> ChatSendResponse
    let chatDelete: @Sendable (String) async throws -> ChatDeleteResponse
    let employeeList: @Sendable () async throws -> EmployeeListResponse
    let employeeSave: @Sendable (Employee) async throws -> EmployeeSaveResponse
    let employeeDelete: @Sendable (String) async throws -> EmployeeDeleteResponse
    let effectivePrompt: @Sendable (String) async throws -> EffectivePromptResponse
    let capabilities: @Sendable () async throws -> RuntimeCapabilities
    let skillsList: @Sendable (String?) async throws -> SkillsListResponse
    let toolsList: @Sendable () async throws -> ToolsListResponse
    let bindSkill: @Sendable (String, String, String) async throws -> BindSkillResponse
    let unbindSkill: @Sendable (String, String) async throws -> UnbindSkillResponse

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
                    pricingBasis: "input_cache_miss"
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
        }, continueRun: { runID, approve, key in
            let layout = try runtimeLayout()
            return try await decodeCommand([
                "continue-run", "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path, "--run-id", runID,
                "--authorized-root", layout.outputDirectory.path, approve ? "--approve" : "--reject"
            ], environment: key.map { ["DEEPSEEK_API_KEY": $0] } ?? [:], as: RunContinuationResponse.self)
        }, resolveUnknown: { actionID, status in
            let layout = try runtimeLayout()
            return try await decodeCommand([
                "resolve-action-result", "--repository-root", layout.resourceRoot.path,
                "--database", try databaseURL().path,
                "--action-id", actionID, "--status", status,
                "--evidence-json", "{\"verified_by\":\"user\"}"
            ], environment: KeychainService.load().map { ["DEEPSEEK_API_KEY": $0] } ?? [:], as: RunContinuationResponse.self)
        }, chatHistory: { conversationID in
            try await decodeCommand(["chat-history", "--database", try databaseURL().path, "--conversation-id", conversationID], as: ChatHistoryResponse.self)
        }, chatSend: { conversationID, employeeID, input, key, replaceMessageID, onDelta in
            var arguments = ["chat-send", "--stream-events", "--repository-root", try runtimeLayout().resourceRoot.path, "--database", try databaseURL().path, "--conversation-id", conversationID, "--employee-id", employeeID, "--input", input]
            if let replaceMessageID { arguments.append(contentsOf: ["--replace-message-id", replaceMessageID]) }
            return try await streamChatCommand(
                arguments,
                environment: ["DEEPSEEK_API_KEY": key],
                onDelta: onDelta
            )
        }, chatDelete: { conversationID in
            try await decodeCommand(["chat-delete", "--database", try databaseURL().path, "--conversation-id", conversationID], as: ChatDeleteResponse.self)
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
        })
    }

    private struct CancelResponse: Codable, Sendable { let status: String }
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
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = try runtimeLayout().binary
            process.arguments = arguments
            process.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            do { try process.run() }
            catch { throw RuntimeError.processUnavailable(error.localizedDescription) }

            var buffer = Data()
            var response: ChatSendResponse?
            let decoder = JSONDecoder()
            while let data = try stdout.fileHandleForReading.read(upToCount: 4096), !data.isEmpty {
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
            let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
            guard process.terminationStatus == 0 else {
                throw RuntimeError.processFailed(String(decoding: errorData, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
            }
            guard let response else { throw RuntimeError.invalidResponse("流式响应缺少完成事件") }
            return response
        }.value
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
