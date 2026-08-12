import Foundation

struct ConfiguredModel: Identifiable, Hashable, Sendable {
    let provider: String
    let model: String

    var id: String { "\(provider)/\(model)" }
    var providerTitle: String { provider == "poe" ? "Poe" : provider.capitalized }
}

enum ModelConfiguration {
    static let providerKey = "modelProvider"
    static let modelKey = "modelName"

    static var models: [ConfiguredModel] {
        let values = environmentFile()["AI_EMPLOYEE_MODELS", default: ""]
        var seen = Set<String>()
        return values.split(separator: ",").compactMap { raw in
            let parts = raw.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "/", maxSplits: 1)
            guard parts.count == 2 else { return nil }
            let item = ConfiguredModel(provider: String(parts[0]).lowercased(), model: String(parts[1]))
            guard ["deepseek", "poe"].contains(item.provider), !item.model.isEmpty, seen.insert(item.id).inserted else { return nil }
            return item
        }
    }

    static var selected: ConfiguredModel? {
        let defaults = UserDefaults.standard
        let provider = defaults.string(forKey: providerKey)
        let model = defaults.string(forKey: modelKey)
        return models.first { $0.provider == provider && $0.model == model } ?? models.first
    }

    static func environment() throws -> [String: String] {
        guard let selected else { throw configurationError(".env 中未配置 AI_EMPLOYEE_MODELS") }
        let file = environmentFile()
        let keyName = selected.provider == "poe" ? "POE_API_KEY" : "DEEPSEEK_API_KEY"
        guard let apiKey = file[keyName], !apiKey.isEmpty else { throw configurationError(".env 中未配置 \(keyName)") }
        return [
            keyName: apiKey,
            "AI_EMPLOYEE_MODEL_PROVIDER": selected.provider,
            "AI_EMPLOYEE_MODEL": selected.model,
        ]
    }

    static var environmentPath: String? { locateEnvironmentFile()?.path }

    private static func environmentFile() -> [String: String] {
        guard let url = locateEnvironmentFile(), let content = try? String(contentsOf: url, encoding: .utf8) else { return [:] }
        return content.split(whereSeparator: \.isNewline).reduce(into: [:]) { result, line in
            let text = line.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty, !text.hasPrefix("#"), let separator = text.firstIndex(of: "=") else { return }
            let key = String(text[..<separator]).trimmingCharacters(in: .whitespaces)
            var value = String(text[text.index(after: separator)...]).trimmingCharacters(in: .whitespaces)
            if value.count >= 2, (value.hasPrefix("\"") && value.hasSuffix("\"") || value.hasPrefix("'") && value.hasSuffix("'")) {
                value.removeFirst(); value.removeLast()
            }
            result[key] = value
        }
    }

    private static func locateEnvironmentFile() -> URL? {
        let manager = FileManager.default
        var candidates: [URL] = []
        if let explicit = ProcessInfo.processInfo.environment["AI_EMPLOYEE_ENV_FILE"] {
            candidates.append(URL(fileURLWithPath: explicit))
        }
        candidates.append(URL(fileURLWithPath: manager.currentDirectoryPath).appending(path: ".env"))
        candidates.append(Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().appending(path: ".env"))
        return candidates.first { manager.fileExists(atPath: $0.path) }
    }

    private static func configurationError(_ message: String) -> NSError {
        NSError(domain: "ModelConfiguration", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
