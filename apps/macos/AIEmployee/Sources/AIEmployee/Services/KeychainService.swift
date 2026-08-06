import Foundation

enum KeychainService {
    private struct BrokerResponse: Decodable {
        let ok: Bool
        let exists: Bool?
        let value: String?
        let errorCode: Int?
    }

    static func load() -> String? {
        try? invoke("load").value
    }

    static func exists() -> Bool {
        (try? invoke("status").exists) ?? false
    }

    static func legacyItemExists() -> Bool {
        (try? invoke("legacy-status").exists) ?? false
    }

    static func save(_ value: String) throws {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw NSError(domain: "Keychain", code: 1, userInfo: [NSLocalizedDescriptionKey: "API Key 不能为空"])
        }
        _ = try invoke("save", input: Data(trimmed.utf8))
    }

    static func delete() {
        _ = try? invoke("delete")
    }

    private static func invoke(_ command: String, input: Data? = nil) throws -> BrokerResponse {
        let broker = try brokerURL()
        let process = Process()
        process.executableURL = broker
        process.arguments = [command]
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        if let input {
            let stdin = Pipe()
            process.standardInput = stdin
            try process.run()
            stdin.fileHandleForWriting.write(input)
            try stdin.fileHandleForWriting.close()
        } else {
            try process.run()
        }
        process.waitUntilExit()
        let output = stdout.fileHandleForReading.readDataToEndOfFile()
        guard let response = try? JSONDecoder().decode(BrokerResponse.self, from: output) else {
            throw NSError(domain: "CredentialBroker", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: "凭据代理返回无效结果"])
        }
        guard process.terminationStatus == 0, response.ok else {
            throw NSError(domain: NSOSStatusErrorDomain, code: response.errorCode ?? Int(process.terminationStatus))
        }
        return response
    }

    private static func brokerURL() throws -> URL {
        let bundled = Bundle.main.bundleURL
            .appending(path: "Contents/Helpers/AIEmployeeCredentialBroker")
        if FileManager.default.isExecutableFile(atPath: bundled.path) { return bundled }

        let development = Bundle.main.bundleURL
            .deletingLastPathComponent()
            .appending(path: "AIEmployeeCredentialBroker")
        if FileManager.default.isExecutableFile(atPath: development.path) { return development }
        throw NSError(domain: "CredentialBroker", code: 2, userInfo: [NSLocalizedDescriptionKey: "凭据代理不存在，请重新构建 App"])
    }
}
