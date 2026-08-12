import Foundation
import Security

private let service = "com.kakarrot.ai-employee-os.credentials.v3"
private let previousService = "com.kakarrot.ai-employee-os.credentials.v2"
private let legacyService = "com.kakarrot.ai-employee-os"
private let defaultAccount = "deepseek-api-key"
private var account: String {
    guard CommandLine.arguments.count > 2 else { return defaultAccount }
    let value = CommandLine.arguments[2]
    return ["deepseek-api-key", "poe-api-key"].contains(value) ? value : defaultAccount
}

private struct Response: Encodable {
    let ok: Bool
    var exists: Bool? = nil
    var value: String? = nil
    var errorCode: Int? = nil
}

private func query(for targetService: String, returnsData: Bool) -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: targetService,
        kSecAttrAccount as String: account,
        kSecReturnData as String: returnsData,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
}

private func read(_ targetService: String) -> (OSStatus, String?) {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query(for: targetService, returnsData: true) as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { return (status, nil) }
    return (status, String(data: data, encoding: .utf8))
}

private func exists(_ targetService: String) -> Bool {
    SecItemCopyMatching(query(for: targetService, returnsData: false) as CFDictionary, nil) == errSecSuccess
}

private func save(_ value: String) -> OSStatus {
    let base: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
    ]
    let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8)]
    var status = SecItemUpdate(base as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
        var add = base
        add.merge(attributes) { _, new in new }
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        status = SecItemAdd(add as CFDictionary, nil)
    }
    return status
}

private func loadCurrent() -> Response {
    let current = read(service)
    if current.0 == errSecSuccess, let value = current.1 {
        return Response(ok: true, value: value)
    }
    return current.0 == errSecItemNotFound
        ? Response(ok: true, exists: false)
        : Response(ok: false, errorCode: Int(current.0))
}

private func execute() -> Response {
    guard let command = CommandLine.arguments.dropFirst().first else {
        return Response(ok: false, errorCode: Int(errSecParam))
    }
    switch command {
    case "load":
        return loadCurrent()
    case "status":
        return Response(ok: true, exists: exists(service))
    case "legacy-status":
        return Response(ok: true, exists: exists(previousService) || exists(legacyService))
    case "save":
        let value = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return Response(ok: false, errorCode: Int(errSecParam)) }
        let status = save(value)
        return status == errSecSuccess ? Response(ok: true) : Response(ok: false, errorCode: Int(status))
    case "delete":
        let status = SecItemDelete(query(for: service, returnsData: false) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
            ? Response(ok: true)
            : Response(ok: false, errorCode: Int(status))
    default:
        return Response(ok: false, errorCode: Int(errSecParam))
    }
}

private let response = execute()
private let data = try JSONEncoder().encode(response)
FileHandle.standardOutput.write(data)
exit(response.ok ? EXIT_SUCCESS : EXIT_FAILURE)
