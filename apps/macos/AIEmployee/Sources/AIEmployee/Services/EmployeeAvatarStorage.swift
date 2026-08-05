import Foundation

enum EmployeeAvatarStorage {
    enum AvatarError: LocalizedError {
        case unsupportedFormat
        var errorDescription: String? { "请选择 PNG、JPEG、HEIC 或 WebP 图片。" }
    }

    static func importImage(from source: URL) throws -> String {
        let allowed = ["png", "jpg", "jpeg", "heic", "webp"]
        let extensionName = source.pathExtension.lowercased()
        guard allowed.contains(extensionName) else { throw AvatarError.unsupportedFormat }

        let hasAccess = source.startAccessingSecurityScopedResource()
        defer { if hasAccess { source.stopAccessingSecurityScopedResource() } }

        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "AIEmployee/Avatars", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let destination = root.appending(path: "\(UUID().uuidString.lowercased()).\(extensionName)")
        try FileManager.default.copyItem(at: source, to: destination)
        return destination.path
    }
}
