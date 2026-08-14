import SwiftUI

enum CapabilityLibraryScope: Equatable {
    case skills, tools

    var title: String { self == .skills ? "技能库" : "工具库" }
    var subtitle: String { self == .skills ? "浏览已安装技能的说明与目录" : "查看工具能力、权限与风险" }
    var icon: String { self == .skills ? "sparkles" : "wrench.and.screwdriver" }
    var emptyTitle: String { self == .skills ? "还没有已安装技能" : "还没有可用工具" }
    var emptyDetail: String { self == .skills ? "安装 Skill 后，可以在这里阅读说明文档和查看包目录。" : "Runtime 注册 Tool 后，可以在这里查看能力、权限和风险。" }
}

struct CapabilityLibraryWorkspaceView: View {
    let scope: CapabilityLibraryScope
    @ObservedObject var capabilityStore: CapabilityStore
    @State private var query = ""
    @State private var selectedID: String?
    @State private var tab: CapabilityDetailTab = .document
    @State private var compactShowsDetail = false
    @Environment(\.colorScheme) private var colorScheme

    private var capabilities: [CapabilityLibraryItem] {
        capabilityStore.libraryItems(for: scope)
    }

    private var isDisconnected: Bool {
        CapabilityLibraryDemoData.current(for: scope) == nil && capabilities.isEmpty
    }

    private var filteredCapabilities: [CapabilityLibraryItem] {
        guard !query.isEmpty else { return capabilities }
        return capabilities.filter {
            $0.name.localizedCaseInsensitiveContains(query) ||
            $0.summary.localizedCaseInsensitiveContains(query) ||
            $0.category.localizedCaseInsensitiveContains(query)
        }
    }

    private var selected: CapabilityLibraryItem? {
        capabilities.first { $0.id == selectedID }
    }

    var body: some View {
        Group {
            if capabilityStore.isLoading && capabilities.isEmpty {
                ProgressView(scope == .skills ? "正在读取技能…" : "正在读取工具…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = capabilityStore.loadError, capabilities.isEmpty {
                UXFeedbackStateView(
                    title: scope == .skills ? "无法读取技能" : "无法读取工具",
                    message: "已安装 Package 没有被修改。\(error)",
                    systemImage: "exclamationmark.triangle.fill",
                    tone: .error,
                    actionTitle: "重试",
                    action: { Task { await capabilityStore.reload() } }
                )
                .padding(AppTheme.Spacing.xl)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if isDisconnected {
                emptyState
            } else {
                AdaptiveBrowser(profile: .capabilities, compactShowsDetail: $compactShowsDetail) {
                    catalogList
                } detail: { showsBack in
                    detail(showsBack: showsBack)
                }
            }
        }
        .background(palette.canvas)
        .moduleNavigationTitle(scope.title, systemImage: scope.icon)
        .onAppear {
            if selectedID == nil { selectedID = capabilities.first?.id }
            tab = scope == .skills ? .structure : .document
            Task { await capabilityStore.reload() }
        }
        .onChange(of: selectedID) { _, _ in tab = scope == .skills ? .structure : .document }
    }

    private var catalogList: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                CreamSectionHeader(scope.title, count: filteredCapabilities.count)
                CreamSearchField(
                    scope == .skills ? "搜索技能" : "搜索工具",
                    text: $query,
                    accessibilityLabel: scope == .skills ? "搜索技能" : "搜索工具"
                )
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if filteredCapabilities.isEmpty {
                UXFeedbackStateView(
                    title: "没有匹配结果",
                    message: "换一个名称或分类试试。",
                    systemImage: "magnifyingglass",
                    actionTitle: "清除搜索",
                    action: { query = "" }
                )
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredCapabilities) { item in
                            CapabilityCatalogRow(item: item, isSelected: selectedID == item.id) {
                                selectedID = item.id
                                compactShowsDetail = true
                            }
                            Divider().overlay(palette.hairlineSoft).padding(.leading, 54)
                        }
                    }
                }
            }
        }
        .background(palette.surfaceSoft)
    }

    @ViewBuilder private func detail(showsBack: Bool) -> some View {
        if let selected {
            CapabilityDetailView(scope: scope, item: selected, tab: $tab, showsBack: showsBack, close: { compactShowsDetail = false })
        } else {
            ContentUnavailableView("选择一项查看", systemImage: scope.icon)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Image(systemName: scope.icon).font(.system(size: 25, weight: .light)).foregroundStyle(palette.primaryActive)
                Text("尚未接通 Runtime")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.warning)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(palette.warning.opacity(0.12), in: Capsule())
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(scope.emptyTitle).font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Text(scope == .skills
                     ? "当前没有已安装的 Skill Package。请在仓库 packages/skills 中创建并安装后，这里会只读展示。"
                     : "当前没有已安装的 Tool Package。请在仓库 packages/tools 中创建并安装后，这里会只读展示。")
                    .foregroundStyle(palette.muted).frame(maxWidth: 440, alignment: .leading)
            }
            Text("此页面仅用于查看，客户端不提供创建入口。")
                .font(.callout).foregroundStyle(palette.muted)
            if let error = capabilityStore.loadError {
                Text(error).font(.caption).foregroundStyle(palette.error)
            }
        }
        .padding(36).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CapabilityCatalogRow: View {
    let item: CapabilityLibraryItem
    let isSelected: Bool
    let select: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: select) {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: item.icon)
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(palette.primaryActive)
                    .frame(width: 32, height: 32).background(palette.primary.opacity(0.10), in: RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(item.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink).lineLimit(1)
                        Text("v\(item.version)").font(.caption2.monospaced()).foregroundStyle(palette.mutedSoft)
                    }
                    Text(item.summary).font(.caption).foregroundStyle(palette.muted).lineLimit(2)
                    Text(item.category).font(.caption2.weight(.medium)).foregroundStyle(item.statusColor(palette))
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 11).contentShape(Rectangle())
            .background(isSelected ? palette.primary.opacity(0.11) : Color.clear)
        }.buttonStyle(.plain)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum CapabilityDetailTab: String, CaseIterable, Identifiable {
    case document, structure, dependencies, capabilities, security
    var id: String { rawValue }
    var title: String {
        switch self {
        case .document: "说明文档"
        case .structure: "技能文件"
        case .dependencies: "依赖信息"
        case .capabilities: "能力信息"
        case .security: "权限与风险"
        }
    }
}

private struct CapabilityDetailView: View {
    let scope: CapabilityLibraryScope
    let item: CapabilityLibraryItem
    @Binding var tab: CapabilityDetailTab
    let showsBack: Bool
    let close: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    private var tabs: [CapabilityDetailTab] {
        scope == .skills ? [.structure, .dependencies] : [.document, .capabilities, .security]
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 14) {
                    if showsBack {
                        CreamIconButton(
                            systemName: "chevron.left",
                            accessibilityLabel: "返回列表",
                            help: "返回列表",
                            action: close
                        )
                    }
                    Image(systemName: item.icon).font(.system(size: 20, weight: .medium)).foregroundStyle(palette.primaryActive)
                        .frame(width: 46, height: 46).background(palette.primary.opacity(0.10), in: RoundedRectangle(cornerRadius: 13))
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 8) {
                            Text(item.name).font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                            Text("v\(item.version)").font(.caption.monospaced()).foregroundStyle(palette.muted)
                        }
                        Text(item.summary).font(.callout).foregroundStyle(palette.muted)
                    }
                    Spacer()
                    CreamStatusBadge(
                        title: item.status,
                        systemImage: item.status == "可用" ? "checkmark.circle.fill" : "exclamationmark.circle.fill",
                        tone: item.status == "可用" ? .success : .warning
                    )
                }
                CreamTabBar(items: tabs, selection: $tab, title: \ .title)
            }
            .padding(.horizontal, 28).padding(.top, 24)

            if scope == .skills, tab == .structure {
                SkillPackageBrowser(item: item).id(item.id)
            } else {
                ScrollView {
                    Group {
                        switch tab {
                        case .document: CapabilityMarkdownPreview(source: item.markdown)
                        case .dependencies: CapabilityMetadataView(sections: item.dependencySections)
                        case .capabilities:
                            VStack(alignment: .leading, spacing: 28) {
                                if !item.capabilitySections.isEmpty {
                                    CapabilityMetadataView(sections: item.capabilitySections)
                                }
                                if !item.dataSources.isEmpty {
                                    AgentReachDataSourcesView(sources: item.dataSources)
                                }
                                if item.capabilitySections.isEmpty && item.dataSources.isEmpty {
                                    Text("暂无能力信息").font(.callout).foregroundStyle(palette.muted)
                                }
                            }
                        case .security: CapabilitySecurityView(actions: item.actions)
                        case .structure: EmptyView()
                        }
                    }
                    .frame(maxWidth: 780, alignment: .leading).padding(.horizontal, 28).padding(.vertical, 24)
                }
            }
        }.background(palette.canvas)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CapabilityMarkdownPreview: View {
    let source: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(Array(MarkdownBlock.parse(source).enumerated()), id: \.offset) { _, block in blockView(block) }
        }.frame(maxWidth: 680, alignment: .leading).textSelection(.enabled)
    }

    @ViewBuilder private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text): Text(text).font(level == 1 ? .title.weight(.semibold) : level == 2 ? .title2.weight(.semibold) : .headline).foregroundStyle(palette.ink).padding(.top, level == 1 ? 0 : 12)
        case .paragraph(let text): Text(inline(text)).font(.body).foregroundStyle(palette.body).lineSpacing(5)
        case .bullet(let text): HStack(alignment: .firstTextBaseline, spacing: 10) { Circle().fill(palette.primaryActive).frame(width: 5, height: 5); Text(inline(text)).foregroundStyle(palette.body).lineSpacing(4) }
        case .numbered(let text): Text(inline(text)).foregroundStyle(palette.body).lineSpacing(4)
        case .quote(let text): Text(inline(text)).foregroundStyle(palette.muted).padding(.leading, 12).overlay(alignment: .leading) { Rectangle().fill(palette.primary.opacity(0.45)).frame(width: 2) }
        case .code(let text): Text(text).font(.system(.caption, design: .monospaced)).foregroundStyle(palette.body).padding(14).frame(maxWidth: .infinity, alignment: .leading).background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
        case .table(let headers, let rows): Text(([headers] + rows).map { $0.joined(separator: "  ·  ") }.joined(separator: "\n")).font(.callout.monospaced()).foregroundStyle(palette.body)
        case .divider: Divider().overlay(palette.hairline)
        case .spacing: Color.clear.frame(height: 3)
        }
    }

    private func inline(_ text: String) -> AttributedString { (try? AttributedString(markdown: text)) ?? AttributedString(text) }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct SkillPackageBrowser: View {
    let item: CapabilityLibraryItem
    @State private var selectedDocumentID: String?
    @State private var expandedFolders: Set<String> = []
    @State private var compactShowsDocument = false
    @Environment(\.colorScheme) private var colorScheme

    private var selectedSource: String? {
        guard let selectedDocumentID else { return nil }
        return item.documents[selectedDocumentID]
    }

    private var selectedName: String {
        item.directory.first { $0.id == selectedDocumentID }?.name ?? "SKILL.md"
    }

    private var visibleRows: [CapabilityDirectoryRow] {
        item.directory.filter { row in
            var parent = row.parentID
            while let parentID = parent {
                guard expandedFolders.contains(parentID) else { return false }
                parent = item.directory.first { $0.id == parentID }?.parentID
            }
            return true
        }
    }

    var body: some View {
        AdaptiveBrowser(profile: .skillPackage, compactShowsDetail: $compactShowsDocument) {
            directory
        } detail: { showsBack in
            document(showsBack: showsBack)
        }
        .onAppear {
            expandedFolders = Set(item.directory.filter(\.isFolder).map(\.id))
            selectedDocumentID = item.directory.first { $0.name == "SKILL.md" }?.id
            if selectedDocumentID == nil {
                compactShowsDocument = false
            }
        }
    }

    private var directory: some View {
        VStack(spacing: 0) {
            HStack {
                Text("包目录").font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                Spacer()
                Text("\(item.directory.count) 项").font(.caption).foregroundStyle(palette.mutedSoft)
            }.padding(.horizontal, 16).frame(height: 42)
            Divider().overlay(palette.hairlineSoft)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(visibleRows) { row in
                        Button { select(row) } label: {
                            HStack(spacing: 7) {
                                if row.isFolder {
                                    Image(systemName: expandedFolders.contains(row.id) ? "chevron.down" : "chevron.right")
                                        .font(.system(size: 8, weight: .semibold)).foregroundStyle(palette.mutedSoft).frame(width: 10)
                                } else {
                                    Color.clear.frame(width: 10, height: 1)
                                }
                                Image(systemName: row.isFolder ? "folder" : row.icon)
                                    .foregroundStyle(row.isFolder ? palette.primaryActive : palette.muted).frame(width: 17)
                                Text(row.name).font(.system(.caption, design: .monospaced)).foregroundStyle(palette.body).lineLimit(1)
                                Spacer(minLength: 0)
                            }
                            .padding(.leading, CGFloat(row.depth * 15) + 10).padding(.trailing, 10).frame(height: 31)
                            .background(selectedDocumentID == row.id ? palette.primary.opacity(0.11) : Color.clear)
                            .contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }.padding(.vertical, 6)
            }
        }.background(palette.surfaceSoft)
    }

    private func document(showsBack: Bool) -> some View {
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
                Image(systemName: "doc.richtext").foregroundStyle(palette.primaryActive)
                Text(selectedName).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                Spacer()
                Text("只读预览").font(.caption).foregroundStyle(palette.mutedSoft)
            }.padding(.horizontal, 20).frame(height: 42)
            Divider().overlay(palette.hairlineSoft)
            if let selectedSource {
                ScrollView {
                    CapabilityMarkdownPreview(source: selectedSource)
                        .frame(maxWidth: 700, alignment: .leading).padding(.horizontal, 28).padding(.vertical, 24)
                }
            } else {
                ContentUnavailableView("此文件暂不支持预览", systemImage: "doc", description: Text("当前只展示 Markdown 文档内容。"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }.background(palette.canvas)
    }

    private func select(_ row: CapabilityDirectoryRow) {
        if row.isFolder {
            if expandedFolders.contains(row.id) { expandedFolders.remove(row.id) } else { expandedFolders.insert(row.id) }
        } else {
            selectedDocumentID = row.id
            compactShowsDocument = true
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CapabilityMetadataView: View {
    let sections: [CapabilityMetadataSection]
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            ForEach(sections) { section in
                VStack(alignment: .leading, spacing: 0) {
                    Text(section.title).font(.headline).foregroundStyle(palette.ink).padding(.bottom, 10)
                    ForEach(section.rows) { row in
                        HStack(alignment: .top, spacing: 18) {
                            Text(row.label).font(.callout).foregroundStyle(palette.muted).frame(width: 116, alignment: .leading)
                            Text(row.value).font(.callout).foregroundStyle(palette.body).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                        }.padding(.vertical, 10)
                        Divider().overlay(palette.hairlineSoft)
                    }
                }
            }
        }
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct AgentReachDataSourcesView: View {
    let sources: [RuntimeDataSource]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Agent Reach 数据源").font(.headline).foregroundStyle(palette.ink)
                    Text("只显示脱敏状态，不读取或展示 Cookie、Token、API Key 原文。")
                        .font(.caption).foregroundStyle(palette.muted)
                }
                Spacer()
                Text("\(sources.count) 个").font(.caption.monospacedDigit()).foregroundStyle(palette.mutedSoft)
            }.padding(.bottom, 12)

            ForEach(sources.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }) { source in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(source.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                        if source.exposedToEmployee {
                            Text("员工可调用").font(.caption2.weight(.semibold)).foregroundStyle(palette.primaryActive)
                        }
                        Spacer()
                        CreamStatusBadge(
                            title: statusTitle(source.status),
                            systemImage: statusIcon(source.status),
                            tone: statusTone(source.status)
                        )
                    }
                    metadata("后端", source.activeBackend ?? source.backends.joined(separator: "、"))
                    metadata("凭据", credentialTitle(source.credentialState, type: source.credentialType))
                    if source.status != "ready" {
                        Text(source.loginHint).font(.caption).foregroundStyle(palette.muted)
                    }
                    Text("检查时间（Unix）：\(source.lastCheckedAt)").font(.caption2).foregroundStyle(palette.mutedSoft)
                }.padding(.vertical, 13)
                Divider().overlay(palette.hairlineSoft)
            }
        }
    }

    private func metadata(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label).foregroundStyle(palette.muted).frame(width: 48, alignment: .leading)
            Text(value.isEmpty ? "未提供" : value).foregroundStyle(palette.body).frame(maxWidth: .infinity, alignment: .leading)
        }.font(.caption)
    }

    private func statusTitle(_ status: String) -> String {
        switch status { case "ready": "可用"; case "configured_unverified": "已配置待验证"; default: "需要处理" }
    }
    private func statusIcon(_ status: String) -> String {
        status == "ready" ? "checkmark.circle.fill" : status == "configured_unverified" ? "questionmark.circle.fill" : "exclamationmark.circle.fill"
    }
    private func statusTone(_ status: String) -> UXFeedbackTone {
        status == "ready" ? .success : status == "configured_unverified" ? .warning : .error
    }
    private func credentialTitle(_ state: String, type: String) -> String {
        switch state {
        case "not_required": "无需凭据"
        case "present_unverified": "检测到 \(type)，尚未实时验证"
        case "session_unverified": "浏览器会话未连接或未验证"
        case "missing": "缺少 \(type)"
        default: "未知"
        }
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CapabilitySecurityView: View {
    let actions: [CapabilityAction]
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        if actions.isEmpty {
            Text("暂无权限与风险信息").font(.callout).foregroundStyle(palette.muted)
        } else {
            VStack(alignment: .leading, spacing: 24) {
                ForEach(actions) { action in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(action.name).font(.headline).foregroundStyle(palette.ink)
                            Spacer()
                            Text("风险 \(action.risk)").font(.caption.weight(.semibold)).foregroundStyle(action.risk >= 2 ? palette.error : palette.warning)
                        }
                        Text(action.summary).font(.callout).foregroundStyle(palette.muted)
                        ForEach(action.rows) { row in
                            HStack(alignment: .top, spacing: 18) {
                                Text(row.label).foregroundStyle(palette.muted).frame(width: 116, alignment: .leading)
                                Text(row.value).foregroundStyle(palette.body).frame(maxWidth: .infinity, alignment: .leading)
                            }.font(.callout)
                        }
                    }.padding(.bottom, 20).overlay(alignment: .bottom) { Divider().overlay(palette.hairlineSoft) }
                }
            }
        }
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
