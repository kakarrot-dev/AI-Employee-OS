import Foundation
import OSLog

struct RuntimeService: Sendable {
    enum RuntimeError: LocalizedError {
        case missingRepository
        case processFailed(String)
        case invalidResponse(String)

        var errorDescription: String? {
            switch self {
            case .missingRepository: "无法定位 AI Employee OS 仓库"
            case .processFailed(let message): "Runtime 执行失败：\(message)"
            case .invalidResponse(let message): "Runtime 返回不可解析：\(message)"
            }
        }
    }

    let run: @Sendable (String) async throws -> RuntimeResponse

    static func live() -> Self {
        Self { input in
            try await Task.detached(priority: .userInitiated) {
                let root = try repositoryRoot()
                let binary = root.appending(path: "target/debug/ai-employee-runtime")
                let databaseDirectory = root.appending(path: "storage/database")
                let outputDirectory = root.appending(path: "outputs")
                try FileManager.default.createDirectory(at: databaseDirectory, withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
                let process = Process()
                process.executableURL = binary
                process.arguments = [
                    "run-golden", "--repository-root", root.path,
                    "--database", databaseDirectory.appending(path: "runtime.db").path,
                    "--output-dir", outputDirectory.path,
                    "--input", input, "--approve-write"
                ]
                let stdout = Pipe()
                let stderr = Pipe()
                process.standardOutput = stdout
                process.standardError = stderr
                try process.run()
                process.waitUntilExit()
                let output = stdout.fileHandleForReading.readDataToEndOfFile()
                let error = stderr.fileHandleForReading.readDataToEndOfFile()
                guard process.terminationStatus == 0 else {
                    throw RuntimeError.processFailed(String(decoding: error, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
                }
                do { return try JSONDecoder().decode(RuntimeResponse.self, from: output) }
                catch { throw RuntimeError.invalidResponse(error.localizedDescription) }
            }.value
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
}
