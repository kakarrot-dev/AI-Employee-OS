import SwiftUI

struct KnowledgeDocument: Identifiable, Equatable {
    let id: String
    let name: String
    let relativePath: String
    let source: String
    let indexStatus: String
    let contentHash: String
    let updatedAt: String
}

struct KnowledgeListResponse: Codable, Sendable {
    struct Source: Codable, Sendable {
        let id: String
        let uri: String
        let sourceType: String
        let title: String
        let contentHash: String
        let indexStatus: String
        let updatedAt: String
        let content: String

        enum CodingKeys: String, CodingKey {
            case id, uri, title, content
            case sourceType = "source_type"
            case contentHash = "content_hash"
            case indexStatus = "index_status"
            case updatedAt = "updated_at"
        }
    }
    let schemaVersion: String
    let sources: [Source]
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", sources }
}

private struct KnowledgeTreeRow: Identifiable {
    let id: String
    let name: String
    let depth: Int
    let isFolder: Bool
    let documentID: String?
}

@MainActor
final class KnowledgeLibraryStore: ObservableObject {
    @Published private(set) var documents: [KnowledgeDocument] = []
    @Published private(set) var loadError: String?
    @Published private(set) var isLoading = false
    private let service: RuntimeService

    init(service: RuntimeService = .live()) {
        self.service = service
    }

    func reload() {
        Task { await load() }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await service.knowledgeList()
            documents = response.sources.map { item in
                KnowledgeDocument(
                    id: item.id,
                    name: item.title,
                    relativePath: item.uri,
                    source: item.content,
                    indexStatus: item.indexStatus,
                    contentHash: item.contentHash,
                    updatedAt: item.updatedAt
                )
            }
            .sorted { $0.relativePath.localizedStandardCompare($1.relativePath) == .orderedAscending }
            loadError = nil
        } catch {
            documents = []
            loadError = error.localizedDescription
        }
    }

}

struct KnowledgeLibraryWorkspaceView: View {
    @ObservedObject var store: KnowledgeLibraryStore
    @State private var query = ""
    @State private var selectedID: String?
    @State private var expandedFolders: Set<String> = []
    @State private var compactShowsDocument = false
    @Environment(\.colorScheme) private var colorScheme

    private var filteredDocuments: [KnowledgeDocument] {
        guard !query.isEmpty else { return store.documents }
        return store.documents.filter {
            $0.relativePath.localizedCaseInsensitiveContains(query) ||
                $0.source.localizedCaseInsensitiveContains(query)
        }
    }

    private var selected: KnowledgeDocument? {
        store.documents.first { $0.id == selectedID }
    }

    private var treeRows: [KnowledgeTreeRow] {
        var folders: Set<String> = []
        for document in store.documents {
            let components = document.relativePath.split(separator: "/").map(String.init)
            guard components.count > 1 else { continue }
            for index in 1..<components.count {
                folders.insert(components.prefix(index).joined(separator: "/"))
            }
        }

        var rows: [KnowledgeTreeRow] = []
        func appendChildren(of parentPath: String, depth: Int) {
            let directFolders = folders.filter { path in
                let parent = path.split(separator: "/").dropLast().joined(separator: "/")
                return parent == parentPath
            }.sorted { $0.localizedStandardCompare($1) == .orderedAscending }

            for path in directFolders {
                rows.append(KnowledgeTreeRow(
                    id: "folder:\(path)",
                    name: path.split(separator: "/").last.map(String.init) ?? path,
                    depth: depth,
                    isFolder: true,
                    documentID: nil
                ))
                appendChildren(of: path, depth: depth + 1)
            }

            let directDocuments = store.documents.filter { document in
                document.relativePath.split(separator: "/").dropLast().joined(separator: "/") == parentPath
            }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }

            rows.append(contentsOf: directDocuments.map { document in
                KnowledgeTreeRow(
                    id: "document:\(document.id)",
                    name: document.name,
                    depth: depth,
                    isFolder: false,
                    documentID: document.id
                )
            })
        }
        appendChildren(of: "", depth: 0)
        return rows
    }

    private var visibleTreeRows: [KnowledgeTreeRow] {
        if !query.isEmpty {
            let matchingIDs = Set(filteredDocuments.map(\.id))
            let ancestorPaths = Set(filteredDocuments.flatMap { document -> [String] in
                let components = document.relativePath.split(separator: "/").map(String.init)
                guard components.count > 1 else { return [] }
                return (1..<components.count).map { components.prefix($0).joined(separator: "/") }
            })
            return treeRows.filter { row in
                row.isFolder ? ancestorPaths.contains(folderPath(for: row)) : row.documentID.map(matchingIDs.contains) == true
            }
        }

        return treeRows.filter { row in
            let components = treePath(for: row).split(separator: "/").map(String.init)
            guard components.count > 1 else { return true }
            return (1..<components.count).allSatisfy { index in
                expandedFolders.contains(components.prefix(index).joined(separator: "/"))
            }
        }
    }

    var body: some View {
        Group {
            if store.isLoading && store.documents.isEmpty {
                ProgressView("正在读取 Runtime 知识索引…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = store.loadError, store.documents.isEmpty {
                UXFeedbackStateView(
                    title: "无法读取 Runtime 知识索引",
                    message: error,
                    systemImage: "exclamationmark.triangle.fill",
                    tone: .error,
                    actionTitle: "重试",
                    action: { store.reload() }
                )
                .padding(AppTheme.Spacing.xl)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.documents.isEmpty {
                emptyState
            } else {
                AdaptiveBrowser(profile: .knowledge, compactShowsDetail: $compactShowsDocument) {
                    documentList
                } detail: { showsBack in
                    documentPreview(showsBack: showsBack)
                }
            }
        }
        .background(palette.canvas)
        .moduleNavigationTitle("知识库", systemImage: "books.vertical")
        .task {
            await store.load()
            if selectedID == nil { selectedID = store.documents.first?.id }
            expandAllFolders()
        }
        .onChange(of: store.documents) { _, documents in
            if !documents.contains(where: { $0.id == selectedID }) {
                selectedID = documents.first?.id
            }
            expandAllFolders()
        }
    }

    private var documentList: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text("知识库").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                    Spacer()
                    Text("\(filteredDocuments.count)").font(.caption.monospacedDigit()).foregroundStyle(palette.muted)
                }
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.mutedSoft)
                    TextField("搜索文档", text: $query).textFieldStyle(.plain)
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(palette.mutedSoft)
                            .help("清除搜索").accessibilityLabel("清除搜索")
                    }
                }
                .padding(.horizontal, 11).frame(height: 34)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.md).stroke(palette.hairlineSoft) }
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if filteredDocuments.isEmpty {
                UXFeedbackStateView(
                    title: "没有匹配结果",
                    message: "换一个文件名、路径或正文关键词试试。",
                    systemImage: "magnifyingglass",
                    actionTitle: "清除搜索",
                    action: { query = "" }
                )
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(visibleTreeRows) { row in
                            Button { select(row) } label: {
                                HStack(spacing: 7) {
                                    if row.isFolder {
                                        Image(systemName: expandedFolders.contains(folderPath(for: row)) ? "chevron.down" : "chevron.right")
                                            .font(.system(size: 8, weight: .semibold))
                                            .foregroundStyle(palette.mutedSoft)
                                            .frame(width: 10)
                                    } else {
                                        Color.clear.frame(width: 10, height: 1)
                                    }
                                    Image(systemName: row.isFolder ? "folder" : "doc.richtext")
                                        .foregroundStyle(row.isFolder ? palette.primaryActive : palette.muted)
                                        .frame(width: 17)
                                    Text(row.name)
                                        .font(.system(.caption, design: row.isFolder ? .default : .monospaced))
                                        .fontWeight(row.isFolder ? .semibold : .regular)
                                        .foregroundStyle(palette.body)
                                        .lineLimit(1)
                                    Spacer(minLength: 0)
                                }
                                .padding(.leading, CGFloat(row.depth * 15) + 10)
                                .padding(.trailing, 10)
                                .frame(height: 31)
                                .background(row.documentID == selectedID ? palette.primary.opacity(0.11) : Color.clear)
                                .contentShape(Rectangle())
                            }.buttonStyle(.plain)
                        }
                    }.padding(.vertical, 6)
                }
            }
        }
        .background(palette.surfaceSoft)
    }

    private func documentPreview(showsBack: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                if showsBack {
                    Button { compactShowsDocument = false } label: { Image(systemName: "chevron.left") }
                        .buttonStyle(.plain).foregroundStyle(palette.body)
                        .help("返回目录").accessibilityLabel("返回目录")
                }
                Image(systemName: "doc.richtext").foregroundStyle(palette.primaryActive)
                Text(selected?.relativePath ?? "选择文档").font(.callout.weight(.semibold)).foregroundStyle(palette.ink).lineLimit(1)
                Spacer()
                Text(selected.map { "索引：\($0.indexStatus)" } ?? "只读预览").font(.caption).foregroundStyle(palette.mutedSoft)
            }
            .padding(.horizontal, 20).frame(height: 42)
            Divider().overlay(palette.hairlineSoft)

            if let selected {
                ScrollView {
                    MarkdownDocumentView(source: selected.source)
                        .frame(maxWidth: 700, alignment: .leading)
                        .padding(.horizontal, 28).padding(.vertical, 24)
                }
            } else {
                ContentUnavailableView("选择一篇文档", systemImage: "doc.richtext")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(palette.canvas)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "books.vertical")
                .font(.system(size: 28, weight: .light)).foregroundStyle(palette.primaryActive)
            VStack(alignment: .leading, spacing: 6) {
                Text("Runtime 知识库中还没有来源").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Text("只有通过 Runtime 导入并写入 knowledge_sources 的内容会在这里显示；文件目录本身不是知识库事实源。")
                    .foregroundStyle(palette.muted).frame(maxWidth: 460, alignment: .leading)
            }
        }
        .padding(36).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private func select(_ row: KnowledgeTreeRow) {
        if row.isFolder {
            let path = folderPath(for: row)
            if expandedFolders.contains(path) {
                expandedFolders.remove(path)
            } else {
                expandedFolders.insert(path)
            }
        } else if let documentID = row.documentID {
            selectedID = documentID
            compactShowsDocument = true
        }
    }

    private func expandAllFolders() {
        expandedFolders.formUnion(treeRows.filter(\.isFolder).map(folderPath))
    }

    private func folderPath(for row: KnowledgeTreeRow) -> String {
        String(row.id.dropFirst("folder:".count))
    }

    private func treePath(for row: KnowledgeTreeRow) -> String {
        if row.isFolder { return folderPath(for: row) + "/" }
        return row.documentID ?? row.id
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
