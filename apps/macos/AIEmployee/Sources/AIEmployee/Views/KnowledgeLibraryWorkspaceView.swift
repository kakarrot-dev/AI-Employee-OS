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
                ProgressView("正在读取知识库…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = store.loadError, store.documents.isEmpty {
                UXFeedbackStateView(
                    title: "无法读取知识库",
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
                CreamSectionHeader("知识库", count: filteredDocuments.count)
                CreamSearchField("搜索文档", text: $query, accessibilityLabel: "搜索文档")
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if filteredDocuments.isEmpty {
                UXFeedbackStateView(
                    title: "没有匹配结果",
                    message: "换一个标题、来源路径或正文关键词试试。",
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
                            CreamInteractiveRow(
                                isSelected: row.documentID == selectedID,
                                accessibilityLabel: row.name,
                                action: { select(row) }
                            ) {
                                HStack(spacing: 7) {
                                    if row.isFolder {
                                        CreamSymbol(
                                            systemName: expandedFolders.contains(folderPath(for: row)) ? "chevron.down" : "chevron.right",
                                            scale: .compact
                                        )
                                            .foregroundStyle(palette.mutedSoft)
                                    } else {
                                        Color.clear.frame(width: 12, height: 1)
                                    }
                                    CreamSymbol(systemName: row.isFolder ? "folder" : "doc.richtext")
                                        .foregroundStyle(row.isFolder ? palette.primaryActive : palette.muted)
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
                                .contentShape(Rectangle())
                            }
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
                    CreamIconButton(
                        systemName: "chevron.left",
                        accessibilityLabel: "返回目录",
                        help: "返回目录",
                        action: { compactShowsDocument = false }
                    )
                }
                CreamSymbol(systemName: "doc.richtext")
                    .foregroundStyle(palette.primaryActive)
                VStack(alignment: .leading, spacing: 2) {
                    Text(selected?.name ?? "选择文档")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(palette.ink)
                        .lineLimit(1)
                    if let selected {
                        Text(selected.relativePath)
                            .font(AppTheme.Typography.compactMetadata().monospaced())
                            .foregroundStyle(palette.mutedSoft)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if let selected {
                    CreamStatusBadge(
                        title: indexTitle(selected.indexStatus),
                        systemImage: indexSystemImage(selected.indexStatus),
                        tone: indexTone(selected.indexStatus)
                    )
                } else {
                    Text("只读预览").font(.caption).foregroundStyle(palette.mutedSoft)
                }
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
            CreamSymbol(systemName: "books.vertical", scale: .emptyState)
                .foregroundStyle(palette.primaryActive)
            VStack(alignment: .leading, spacing: 6) {
                Text("还没有知识来源").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Text("导入并完成索引的内容会显示在这里。当前客户端只提供浏览。")
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

    private func indexTitle(_ status: String) -> String {
        switch status {
        case "ready", "indexed": "已索引"
        case "pending", "indexing": "正在索引"
        case "failed": "索引失败"
        default: "状态待确认"
        }
    }

    private func indexSystemImage(_ status: String) -> String {
        switch status {
        case "ready", "indexed": "checkmark.circle.fill"
        case "failed": "exclamationmark.triangle.fill"
        default: "clock.fill"
        }
    }

    private func indexTone(_ status: String) -> UXFeedbackTone {
        switch status {
        case "ready", "indexed": .success
        case "failed": .error
        case "pending", "indexing": .warning
        default: .neutral
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
