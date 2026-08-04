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

    let run: @Sendable (String, String) async throws -> RuntimeResponse
    let loadHistory: @Sendable () async throws -> TaskHistoryResponse
    let events: @Sendable (String, Int) async throws -> RuntimeEventsResponse
    let cancel: @Sendable (String) async throws -> Void

    static func live() -> Self {
        Self(run: { taskID, input in
            try await Task.detached(priority: .userInitiated) {
                let layout = try runtimeLayout()
                do {
                    try FileManager.default.createDirectory(at: layout.database.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try FileManager.default.createDirectory(at: layout.outputDirectory, withIntermediateDirectories: true)
                } catch {
                    throw RuntimeError.storageUnavailable(error.localizedDescription)
                }
                let process = Process()
                process.executableURL = layout.binary
                process.arguments = [
                    "run-golden", "--repository-root", layout.resourceRoot.path,
                    "--database", layout.database.path,
                    "--output-dir", layout.outputDirectory.path,
                    "--input", input, "--task-id", taskID, "--approve-write"
                ]
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
                do { return try JSONDecoder().decode(RuntimeResponse.self, from: output) }
                catch { throw RuntimeError.invalidResponse(error.localizedDescription) }
            }.value
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
        }, events: { taskID, after in
            try await decodeCommand(["events", "--database", try databaseURL().path, "--task-id", taskID, "--after", String(after)], as: RuntimeEventsResponse.self)
        }, cancel: { taskID in
            let _: CancelResponse = try await decodeCommand(["cancel-task", "--database", try databaseURL().path, "--task-id", taskID], as: CancelResponse.self)
        })
    }

    private struct CancelResponse: Codable, Sendable { let status: String }

    private static func databaseURL() throws -> URL {
        try runtimeLayout().database
    }

    static func authorizedOutputDirectory() throws -> URL {
        try runtimeLayout().outputDirectory
    }

    private static func decodeCommand<T: Decodable & Sendable>(_ arguments: [String], as type: T.Type) async throws -> T {
        try await Task.detached(priority: .utility) {
            let binary = try runtimeLayout().binary
            let process = Process()
            process.executableURL = binary
            process.arguments = arguments
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
        if FileManager.default.fileExists(atPath: bundleRoot.appending(path: "runtime/python-agent/app/worker.py").path),
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
