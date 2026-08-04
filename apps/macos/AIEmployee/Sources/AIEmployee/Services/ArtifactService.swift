import AppKit
import Foundation

enum ArtifactService {
    enum ArtifactError: LocalizedError {
        case outsideAuthorizedDirectory
        case missing
        case unsupportedType
        case tooLarge

        var errorDescription: String? {
            switch self {
            case .outsideAuthorizedDirectory: "产物不在本任务授权的 outputs 目录中，已拒绝访问。"
            case .missing: "产物文件不存在，可能已被移动或删除。"
            case .unsupportedType: "当前只能预览 Markdown 产物。"
            case .tooLarge: "产物超过 1 MB，请使用外部编辑器打开。"
            }
        }
    }

    static func loadMarkdown(at path: String) async throws -> String {
        let url = try validatedURL(path)
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true else { throw ArtifactError.missing }
        guard (values.fileSize ?? 0) <= 1_048_576 else { throw ArtifactError.tooLarge }
        return try String(contentsOf: url, encoding: .utf8)
    }

    @MainActor
    static func open(_ path: String) throws {
        NSWorkspace.shared.open(try validatedURL(path))
    }

    @MainActor
    static func reveal(_ path: String) throws {
        NSWorkspace.shared.activateFileViewerSelecting([try validatedURL(path)])
    }

    private static func validatedURL(_ path: String) throws -> URL {
        let candidate = URL(filePath: path).standardizedFileURL.resolvingSymlinksInPath()
        let outputDirectory = try RuntimeService.authorizedOutputDirectory()
            .standardizedFileURL.resolvingSymlinksInPath()
        let prefix = outputDirectory.path.hasSuffix("/") ? outputDirectory.path : outputDirectory.path + "/"
        guard candidate.path.hasPrefix(prefix) else { throw ArtifactError.outsideAuthorizedDirectory }
        guard candidate.pathExtension.lowercased() == "md" else { throw ArtifactError.unsupportedType }
        guard FileManager.default.fileExists(atPath: candidate.path) else { throw ArtifactError.missing }
        return candidate
    }
}
