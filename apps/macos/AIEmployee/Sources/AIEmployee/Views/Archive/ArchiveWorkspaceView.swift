import SwiftUI

struct ArchiveWorkspaceView: View {
    @ObservedObject var store: ArchiveStore
    @ObservedObject var taskStore: TaskStore
    @Environment(\.colorScheme) private var colorScheme
    @State private var pendingConversationDeletion: ArchivedConversation?
    @State private var pendingThreadDeletion: TaskThreadProjection?

    var body: some View {
        AdaptivePage(profile: .archive) { _ in
            LazyVStack(alignment: .leading, spacing: 28) {
                archiveSection("私聊会话", count: store.conversations.count) {
                    ForEach(store.conversations) { conversation in
                        ArchivedConversationRow(conversation: conversation) {
                            Task { await store.restore(conversation) }
                        } delete: {
                            pendingConversationDeletion = conversation
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                archiveSection("工作记录", count: taskStore.archivedTaskThreads.count) {
                    ForEach(taskStore.archivedTaskThreads) { thread in
                        ArchivedTaskRow(thread: thread) {
                            taskStore.restoreThread(thread)
                        } delete: {
                            pendingThreadDeletion = thread
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                if store.conversations.isEmpty, taskStore.archivedTaskThreads.isEmpty, !store.isLoading {
                    ContentUnavailableView("还没有归档", systemImage: "archivebox", description: Text("私聊会话和工作记录归档后会统一显示在这里。"))
                        .frame(maxWidth: .infinity).padding(.top, 90)
                }
            }
            .padding(.bottom, 24)
            .animation(AppTheme.Motion.stateCrossfade, value: store.conversations.map(\.id))
            .animation(AppTheme.Motion.stateCrossfade, value: taskStore.archivedTaskThreads.map(\.id))
        }
        .background(palette.canvas)
        .moduleNavigationTitle(.archive)
        .task { await store.reload() }
        .confirmationDialog("删除这段私聊？", isPresented: Binding(get: { pendingConversationDeletion != nil }, set: { if !$0 { pendingConversationDeletion = nil } })) {
            Button("永久删除", role: .destructive) {
                if let item = pendingConversationDeletion { Task { await store.delete(item) } }
                pendingConversationDeletion = nil
            }
            Button("取消", role: .cancel) { pendingConversationDeletion = nil }
        } message: { Text("这段会话及其消息将被永久删除，无法恢复。") }
        .confirmationDialog("删除这条工作记录？", isPresented: Binding(get: { pendingThreadDeletion != nil }, set: { if !$0 { pendingThreadDeletion = nil } })) {
            Button("删除记录", role: .destructive) {
                if let item = pendingThreadDeletion { taskStore.deleteThread(item) }
                pendingThreadDeletion = nil
            }
            Button("取消", role: .cancel) { pendingThreadDeletion = nil }
        } message: { Text("记录会从界面移除；底层 Task、Action 与 Audit 证据仍由 Runtime 保留。") }
    }

    private func archiveSection<Content: View>(_ title: String, count: Int, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text(title).font(.headline); Text("\(count)").font(.caption).foregroundStyle(palette.muted) }
            LazyVStack(spacing: 4) { content() }
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ArchivedConversationRow: View {
    let conversation: ArchivedConversation
    let restore: () -> Void
    let delete: () -> Void
    @State private var hovered = false
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        HStack(spacing: 12) {
            CreamAvatar(path: nil, name: conversation.employeeName, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                HStack { Text(conversation.employeeName).font(.callout.weight(.semibold)); Text("私聊").font(.caption).foregroundStyle(palette.muted) }
                Text(conversation.preview ?? "暂无消息").font(.caption).foregroundStyle(palette.muted).lineLimit(1)
            }
            Spacer(minLength: 12)
            if hovered { ArchiveRowActions(restore: restore, delete: delete) }
        }
        .padding(11).creamSidebarRowSurface(isSelected: false, isHovered: hovered).onHover { hovered = $0 }
        .contextMenu { Button("恢复", systemImage: "tray.and.arrow.up", action: restore); Divider(); Button("删除", systemImage: "trash", role: .destructive, action: delete) }
        .animation(AppTheme.Motion.hoverReveal, value: hovered)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ArchivedTaskRow: View {
    let thread: TaskThreadProjection
    let restore: () -> Void
    let delete: () -> Void
    @State private var hovered = false
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "briefcase").foregroundStyle(palette.primary).frame(width: 38, height: 38).background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 3) {
                HStack { Text(thread.title).font(.callout.weight(.semibold)); Text("工作").font(.caption).foregroundStyle(palette.muted) }
                Text(thread.messages.first?.content ?? "暂无任务描述").font(.caption).foregroundStyle(palette.muted).lineLimit(1)
            }
            Spacer(minLength: 12)
            if hovered { ArchiveRowActions(restore: restore, delete: delete) }
        }
        .padding(11).creamSidebarRowSurface(isSelected: false, isHovered: hovered).onHover { hovered = $0 }
        .contextMenu { Button("恢复", systemImage: "tray.and.arrow.up", action: restore); Divider(); Button("删除", systemImage: "trash", role: .destructive, action: delete) }
        .animation(AppTheme.Motion.hoverReveal, value: hovered)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ArchiveRowActions: View {
    let restore: () -> Void
    let delete: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 4) {
            actionButton("恢复", systemImage: "tray.and.arrow.up", action: restore)
            actionButton("删除", systemImage: "trash", role: .destructive, action: delete)
        }
        .transition(.opacity.combined(with: .move(edge: .trailing)))
    }

    private func actionButton(_ title: String, systemImage: String, role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        Button(role: role, action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(role == .destructive ? palette.error : palette.body)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(title)
        .accessibilityLabel(title)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
