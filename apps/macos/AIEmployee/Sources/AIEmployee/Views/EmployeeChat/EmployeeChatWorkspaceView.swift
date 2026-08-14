import AppKit
import SwiftUI

struct EmployeeChatWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    let employee: Employee?
    let openArchive: () -> Void

    @SceneStorage("taskInspectorVisible") private var inspectorVisible = true
    @State private var compactShowsPrimary = true
    @State private var resolvedLayout = AppLayoutResolver.resolve(
        profile: .employeeChat,
        availableSize: CGSize(width: 1_048, height: 768),
        context: .default,
        prefersInspector: true
    )
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    private var activeRun: TaskRun? {
        guard supportsTasks else { return nil }
        return conversationRuns.first { $0.status == .running || $0.status == .pending }
    }

    private var selectedRun: TaskRun? {
        activeRun
    }

    private var conversationRuns: [TaskRun] {
        let conversationID = "conversation_\(conversationStore.employeeID)_primary"
        return store.runs.filter {
            $0.agentID == conversationStore.employeeID && $0.conversationID == conversationID
        }
    }

    private var supportsTasks: Bool {
        capabilityStore.tasksEnabled
    }

    var body: some View {
        AdaptiveWorkspace(
            profile: .employeeChat,
            compactShowsPrimary: $compactShowsPrimary,
            prefersInspector: inspectorPreference,
            onLayoutChange: { resolvedLayout = $0 }
        ) {
            WorkConversationList(
                store: store,
                conversationStore: conversationStore,
                employeeStore: employeeStore,
                didSelect: { compactShowsPrimary = true }
            )
        } primary: { _, _ in
            VStack(spacing: 0) {
                EmployeeMessageStream(store: store, conversationStore: conversationStore, employee: employee, showsTasks: supportsTasks)
                EmployeeComposerContainer(
                    store: store,
                    conversationStore: conversationStore,
                    activeRun: activeRun,
                    employeeName: employee?.name ?? conversationStore.employeeName,
                    supportsTasks: supportsTasks
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.canvas)
        } inspector: {
            TaskInspectorView(
                run: selectedRun,
                store: store,
                employeeName: employee?.name ?? conversationStore.employeeName
            )
        }
        .onChange(of: conversationStore.pendingTaskRefresh) { _, pending in
            guard pending else { return }
            conversationStore.clearPendingTaskRefresh()
            store.retryHistory()
        }
        .navigationTitle("")
        .toolbar {
            if resolvedLayout.presentation == .singlePane, compactShowsPrimary {
                ToolbarItem(placement: .navigation) {
                    CreamIconButton(
                        systemName: "chevron.left",
                        accessibilityLabel: "返回员工会话列表",
                        help: "返回员工会话列表",
                        action: { compactShowsPrimary = false }
                    )
                }
            }
            ToolbarItem(placement: .navigation) {
                EmployeeToolbarTitle(employee: employee, run: activeRun, reduceMotion: reduceMotion)
            }
            if !conversationStore.messages.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    CreamIconButton(
                        systemName: "archivebox",
                        accessibilityLabel: "归档当前私聊",
                        help: "归档当前私聊",
                        action: {
                            Task {
                                if await conversationStore.archiveHistory() { openArchive() }
                            }
                        }
                    )
                    .disabled(conversationStore.isSending)
                }
            }
            if supportsTasks, selectedRun != nil, resolvedLayout.inspectorAvailable {
                ToolbarItem(placement: .primaryAction) {
                    CreamIconButton(
                        systemName: "sidebar.right",
                        accessibilityLabel: resolvedLayout.showsInspector ? "隐藏工作检查器" : "显示工作检查器",
                        help: resolvedLayout.showsInspector ? "隐藏工作检查器" : "显示工作检查器",
                        isSelected: resolvedLayout.showsInspector,
                        action: { inspectorVisible.toggle() }
                    )
                }
            }
        }
    }

    private var inspectorPreference: Binding<Bool> {
        Binding(
            get: { supportsTasks && selectedRun != nil && inspectorVisible },
            set: { inspectorVisible = $0 }
        )
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmployeeToolbarTitle: View {
    let employee: Employee?
    let run: TaskRun?
    let reduceMotion: Bool

    @State private var pulse = false
    @State private var detailsVisible = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button { detailsVisible = true } label: {
            HStack(spacing: AppTheme.Spacing.xs) {
                ZStack {
                    if run?.status == .running && !reduceMotion {
                        Circle()
                            .stroke(stateColor.opacity(pulse ? 0.06 : 0.38), lineWidth: 2)
                            .frame(width: pulse ? 18 : 10, height: pulse ? 18 : 10)
                    }
                    Circle().fill(stateColor).frame(width: 7, height: 7)
                }
                HStack(spacing: 5) {
                    Text(employee?.name ?? "员工不可用")
                        .font(AppTheme.Typography.workspaceTitle)
                    if let role = employee?.role {
                        Text("· \(role)")
                            .font(AppTheme.Typography.interfaceBody())
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .buttonStyle(CreamInlineButtonStyle())
        .help(run.map { "\(employee?.name ?? "该员工") 正在处理：\($0.input)" } ?? "查看员工详情")
        .popover(isPresented: $detailsVisible, arrowEdge: .top) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(employee?.name ?? "员工不可用").font(.headline)
                if let employee {
                    Text("\(employee.role) · \(employee.department)").font(.callout).foregroundStyle(.secondary)
                } else {
                    Text("员工资料不存在或已被删除").font(.callout).foregroundStyle(.secondary)
                }
                Divider()
                CreamStatusLabel(
                    title: employee?.status == "active" ? "可用" : "已停用",
                    systemImage: employee?.status == "active" ? "checkmark.circle.fill" : "pause.circle.fill",
                    tone: employee?.status == "active" ? .success : .neutral
                )
                Text("消息和工作会保留在这名员工的持续会话中。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(AppTheme.Spacing.md)
            .frame(width: 280, alignment: .leading)
        }
        .onAppear {
            guard run?.status == .running, !reduceMotion else { return }
            withAnimation(AppTheme.Motion.activePulse) {
                pulse = true
            }
        }
    }

    private var stateColor: Color {
        guard let run else { return palette.success }
        if run.actions.contains(where: { $0.status == "blocked" }) { return palette.warning }
        if run.actions.contains(where: { $0.status == "result_unknown" }) { return palette.error }
        return switch run.status {
        case .pending, .running: palette.accentTeal
        case .succeeded: palette.success
        case .failed: palette.error
        case .cancelled: palette.muted
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmployeeMessageStream: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    let employee: Employee?
    let showsTasks: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let bottomAnchorID = "conversation-timeline-bottom"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                CreamTimelineLayout(
                    density: .compact,
                    horizontalInset: AppTheme.Spacing.lg,
                    topInset: AppTheme.Spacing.lg,
                    bottomInset: 132
                ) {
                    if let historyError = store.historyError {
                        UXFeedbackStateView(
                            title: "无法读取工作记录",
                            message: "当前会话仍然保留。\(historyError)",
                            systemImage: "exclamationmark.triangle.fill",
                            tone: .error,
                            actionTitle: "重试",
                            action: store.retryHistory
                        )
                        .padding(AppTheme.Spacing.md)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.error.opacity(0.06), in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg))
                    }
                    if timeline.isEmpty {
                        EmptyConversationView(employeeName: employee?.name ?? conversationStore.employeeName, supportsTasks: showsTasks)
                    }

                    ForEach(timeline) { entry in
                        switch entry {
                        case .message(let message):
                            ConversationMessageBlock(
                                message: message,
                                employeeName: employee?.name ?? conversationStore.employeeName,
                                employeeAvatarPath: employee?.avatarPath,
                                isEditable: message.role == "user" && message.id == conversationStore.latestUserMessageID && !conversationStore.isSending,
                                revise: { conversationStore.reviseLatestUserMessage(id: message.id, content: $0) }
                            )
                        case .run(let run):
                            TaskConversationBlock(
                                run: run,
                                employee: employee,
                                showsInput: run.conversationID != "conversation_\(conversationStore.employeeID)_primary"
                            )
                                .id(run.id)
                        }
                    }

                    if conversationStore.isSending {
                        PendingAssistantResponseView(
                            employeeName: employee?.name ?? conversationStore.employeeName,
                            employeeAvatarPath: employee?.avatarPath,
                            content: conversationStore.streamingContent,
                            startedAt: conversationStore.streamingStartedAt
                        )
                            .id("pending-assistant-response")
                    }

                    Color.clear.frame(height: 1).id(Self.bottomAnchorID)
                }
            }
            .onChange(of: scrollSignal) { _, _ in scrollToLatest(using: proxy) }
            .onChange(of: conversationStore.employeeID) { _, _ in scrollToLatest(using: proxy) }
        }
        .scrollContentBackground(.hidden)
        .background(palette.canvas)
    }

    private var scrollSignal: String {
        "\(timeline.last?.id ?? "empty"):\(conversationStore.isSending):\(conversationStore.streamingContent.count)"
    }

    private var conversationRuns: [TaskRun] {
        let employeeID = conversationStore.employeeID
        let conversationID = "conversation_\(employeeID)_primary"
        return store.runs.filter {
            $0.agentID == employeeID && $0.conversationID == conversationID
        }
    }

    private func scrollToLatest(using proxy: ScrollViewProxy) {
        Task { @MainActor in
            await Task.yield()
            if reduceMotion || conversationStore.isSending {
                proxy.scrollTo(Self.bottomAnchorID, anchor: .bottom)
            } else {
                withAnimation(AppTheme.Motion.panelPresentation) {
                    proxy.scrollTo(Self.bottomAnchorID, anchor: .bottom)
                }
            }
        }
    }

    private var timeline: [WorkTimelineEntry] {
        let visibleMessages = conversationStore.messages.filter { message in
            guard message.role == "assistant",
                  message.content == "执行已暂停，等待你批准所需权限。" else { return true }
            return !showsTasks
        }.filter { message in
            guard showsTasks, message.role == "assistant" else { return true }
            return !conversationRuns.contains { run in
                run.status == .succeeded
                    && !TaskPresentation.isChronologicallyBefore(message.createdAt, run.createdAt)
                    && run.conversationID == "conversation_\(conversationStore.employeeID)_primary"
                    && run.deliverableMessage == message.content
            }
        }
        var entries = visibleMessages.map(WorkTimelineEntry.message)
        if showsTasks {
            entries.append(contentsOf: conversationRuns.filter {
                $0.hasPersistentDeliverable || !hasFinalReply(for: $0)
            }.map(WorkTimelineEntry.run))
        }
        return entries.sorted {
            if $0.createdAt == $1.createdAt { return $0.id < $1.id }
            return TaskPresentation.isChronologicallyBefore($0.createdAt, $1.createdAt)
        }
    }

    private func hasFinalReply(for run: TaskRun) -> Bool {
        guard run.status == .succeeded,
              run.conversationID == "conversation_\(conversationStore.employeeID)_primary" else { return false }
        return conversationStore.messages.contains { message in
            message.role == "assistant"
                && message.content != "执行已暂停，等待你批准所需权限。"
                && !TaskPresentation.isChronologicallyBefore(message.createdAt, run.createdAt)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct PendingAssistantResponseView: View {
    let employeeName: String
    let employeeAvatarPath: String?
    let content: String
    let startedAt: Date?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            CreamTimelineAgentRow(
                employeeName: employeeName,
                employeeAvatarPath: employeeAvatarPath,
                metadata: status(at: context.date),
                statusSystemImage: "sparkle",
                statusColor: palette.accentTeal
            ) {
                if content.isEmpty {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        ProgressView().controlSize(.small).tint(palette.accentTeal)
                        Text("消息已收到，正在组织回答")
                            .font(.callout)
                            .foregroundStyle(palette.muted)
                    }
                } else {
                    CreamTimelineMarkdownBody(source: content)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.isEmpty ? "\(employeeName) 正在回复，消息已收到" : "\(employeeName) 正在回复：\(content)")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }

    private func status(at date: Date) -> String {
        guard let startedAt else { return "正在回复" }
        return "正在回复 · 已处理 \(max(0, Int(date.timeIntervalSince(startedAt)))) 秒"
    }
}

private enum WorkTimelineEntry: Identifiable {
    case message(ChatMessage)
    case run(TaskRun)

    var id: String {
        switch self { case .message(let message): "message-\(message.id)"; case .run(let run): "run-\(run.id)" }
    }
    var createdAt: String {
        switch self { case .message(let message): message.createdAt; case .run(let run): run.createdAt }
    }
}

private struct EmptyConversationView: View {
    let employeeName: String
    let supportsTasks: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text("和 \(employeeName) 聊聊")
                .font(AppTheme.Typography.sectionTitle)
                .foregroundStyle(palette.ink)
            Text("可以先讨论想法、补充背景或澄清问题。消息会保留在与 \(employeeName) 的持续会话中。")
                .font(AppTheme.Typography.interfaceBody())
                .foregroundStyle(palette.muted)
                .frame(maxWidth: 560, alignment: .leading)
        }
        .padding(.top, AppTheme.Spacing.xxl)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ConversationMessageBlock: View {
    let message: ChatMessage
    let employeeName: String
    let employeeAvatarPath: String?
    let isEditable: Bool
    let revise: (String) -> Bool
    @State private var expanded = false
    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    var body: some View {
        if message.role == "user" {
            CreamTimelineUserMessage(
                text: message.content,
                metadata: TaskPresentation.time(message.createdAt),
                maxWidth: 620,
                revise: isEditable ? revise : nil
            ) {
                if !attachments.isEmpty {
                    ChatAttachmentStack(attachments: attachments)
                }
            }
        } else {
            CreamTimelineAgentRow(
                employeeName: employeeName,
                employeeAvatarPath: employeeAvatarPath,
                metadata: TaskPresentation.time(message.createdAt),
                copyText: message.content
            ) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        CreamTimelineMarkdownBody(source: displayedContent)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(employeeName)：\(message.content)")
                        if isLong { foldButton }
                }
            }
        }
    }

    private var isLong: Bool {
        message.content.count > 900 || message.content.split(separator: "\n", omittingEmptySubsequences: false).count > 14
    }

    private var displayedContent: String {
        guard isLong, !expanded else { return message.content }
        return String(message.content.prefix(900)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private var foldButton: some View {
        Button {
            withAnimation(AppTheme.Motion.panelPresentation) { expanded.toggle() }
        } label: {
            Label(expanded ? "收起" : "展开完整消息", systemImage: expanded ? "chevron.up" : "chevron.down")
                .font(.caption.weight(.medium))
        }
        .buttonStyle(CreamInlineButtonStyle(tone: .primary))
        .help(expanded ? "折叠长消息" : "查看完整消息")
    }

    private var attachments: [ChatAttachmentPresentation] {
        WorkLibraryDemoData.current?.messageAttachments[message.id] ?? []
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ChatAttachmentStack: View {
    let attachments: [ChatAttachmentPresentation]

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            ForEach(attachments) { attachment in
                ChatAttachmentRow(attachment: attachment)
            }
        }
    }
}

private struct ChatAttachmentRow: View {
    let attachment: ChatAttachmentPresentation
    var remove: (() -> Void)? = nil
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            CreamSymbol(systemName: icon)
                .foregroundStyle(palette.primaryActive)
                .frame(width: 30, height: 30)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(attachment.name)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(palette.body)
                    .lineLimit(1)
                Text("\(attachment.kind) · \(attachment.size)")
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
            }
            Spacer(minLength: AppTheme.Spacing.sm)
            if let remove {
                CreamIconButton(
                    systemName: "xmark",
                    accessibilityLabel: "移除附件 \(attachment.name)",
                    help: "移除附件 \(attachment.name)",
                    action: remove
                )
            }
        }
        .padding(.horizontal, AppTheme.Spacing.xs)
        .frame(minWidth: 230, minHeight: 40)
        .background(palette.surfaceCard.opacity(0.82), in: RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous))
    }

    private var icon: String {
        let ext = URL(filePath: attachment.name).pathExtension.lowercased()
        if ["png", "jpg", "jpeg", "heic", "webp"].contains(ext) { return "photo" }
        if ["zip", "tar", "gz"].contains(ext) { return "archivebox" }
        return "doc.text"
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct TaskConversationBlock: View {
    let run: TaskRun
    let employee: Employee?
    let showsInput: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            if showsInput {
                CreamTimelineUserMessage(
                    text: run.input,
                    metadata: TaskPresentation.time(run.createdAt)
                )
            }

            if run.status == .running || run.status == .pending {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    runBlock(at: context.date)
                }
            } else {
                runBlock(at: .now)
            }
        }
    }

    private func runBlock(at date: Date) -> some View {
        CreamTimelineAgentRow(
            employeeName: employee?.name ?? "AI 员工",
            employeeAvatarPath: employee?.avatarPath,
            metadata: statusText(at: date),
            statusSystemImage: run.status.systemImage,
            statusColor: statusColor,
            copyText: deliveryMessage
        ) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                if run.status == .running || run.status == .pending {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        ProgressView().controlSize(.small).tint(palette.accentTeal)
                        Text(currentActivity)
                            .font(.callout.weight(.medium))
                            .foregroundStyle(palette.body)
                    }
                }
                if let error = run.error { InlineFailureMessage(error: error) }
                if let message = deliveryMessage {
                    CreamTimelineMarkdownBody(source: message).frame(maxWidth: .infinity, alignment: .leading)
                }
                if let path = run.verifiedArtifactPath ?? run.response?.artifactPath ?? run.artifactPath {
                    ArtifactMessageBlock(run: run, path: path)
                }
            }
        }
    }

    private func statusText(at date: Date) -> String {
        switch run.status {
        case .pending: "等待 Runtime 开始 · (TaskPresentation.elapsed(run.createdAt, at: date))"
        case .running where run.isCancellationRequested: "正在停止 · (TaskPresentation.elapsed(run.createdAt, at: date))"
        case .running: "(runtimePhase) · 已运行 (TaskPresentation.elapsed(run.createdAt, at: date))"
        case .succeeded: "已完成这项工作"
        case .failed where run.artifactPath != nil || run.verifiedArtifactPath != nil:
            "文件已生成，但最终回复未完成"
        case .failed: "未能完成这项工作"
        case .cancelled: "这项工作已停止"
        }
    }

    private var runtimePhase: String {
        guard let phase = run.runPhase else { return "正在处理" }
        return TaskPresentation.runPhase(phase, waitingReason: run.waitingReason)
    }

    private var currentActivity: String {
        if let running = run.actions.first(where: { $0.status == "running" }) {
            return TaskPresentation.actionTitle(running.stepID)
        }
        return runtimePhase
    }

    private var deliveryMessage: String? {
        if let message = run.deliverableMessage?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty {
            return message
        }
        if let path = run.verifiedArtifactPath ?? run.response?.artifactPath ?? run.artifactPath {
            return run.status == .failed
                ? "文件已经生成：`\(URL(fileURLWithPath: path).lastPathComponent)`。但最终回复阶段未能完成，你仍可以打开并检查文件内容。"
                : "已完成这项工作，并生成文件：`\(URL(fileURLWithPath: path).lastPathComponent)`。"
        }
        return nil
    }

    private var statusColor: Color {
        switch run.status {
        case .pending, .running: palette.accentTeal
        case .succeeded: palette.success
        case .failed: palette.error
        case .cancelled: palette.muted
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct InlineFailureMessage: View {
    let error: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Label("工作未能完成", systemImage: "exclamationmark.triangle.fill")
                .font(.callout.weight(.semibold))
                .foregroundStyle(palette.error)
            Text(error).font(.callout).foregroundStyle(palette.body).textSelection(.enabled)
        }
        .padding(.vertical, AppTheme.Spacing.xs)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ArtifactMessageBlock: View {
    let run: TaskRun
    let path: String
    @State private var artifactError: String?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                CreamSymbol(systemName: fileIcon, scale: .feature)
                    .foregroundStyle(palette.primaryActive)
                    .frame(width: 40, height: 40)
                    .background(palette.primary.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text(displayTitle)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(palette.ink)
                        .lineLimit(2)
                    HStack(spacing: AppTheme.Spacing.xs) {
                        Text(formatLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(palette.primaryActive)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(palette.primary.opacity(0.10), in: Capsule())
                        Text(fileName)
                            .font(.caption.monospaced())
                            .foregroundStyle(palette.muted)
                            .lineLimit(1)
                    }
                }
                Spacer()
                HStack(spacing: 0) {
                    Button {
                        perform { try ArtifactService.open(path) }
                    } label: {
                        Label("打开文件", systemImage: "arrow.up.right")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(palette.onPrimary)
                            .padding(.leading, 12)
                            .padding(.trailing, 10)
                            .frame(height: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(CreamEmbeddedButtonStyle())
                    .help("使用系统默认 App 打开文件")

                    Rectangle()
                        .fill(palette.onPrimary.opacity(0.24))
                        .frame(width: 1, height: 18)

                    Menu {
                        Button("打开文件夹", systemImage: "folder") {
                            perform { try ArtifactService.openContainingFolder(path) }
                        }
                    } label: {
                        CreamSymbol(systemName: "chevron.down", scale: .compact)
                            .foregroundStyle(palette.onPrimary)
                            .frame(width: 28, height: 32)
                            .contentShape(Rectangle())
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .fixedSize()
                    .help("更多打开方式")
                    .accessibilityLabel("更多打开方式")
                }
                .background(palette.primaryActive, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .frame(maxWidth: 680, alignment: .leading)
        .alert("无法访问交付物", isPresented: Binding(
            get: { artifactError != nil },
            set: { if !$0 { artifactError = nil } }
        )) {
            Button("知道了", role: .cancel) { artifactError = nil }
        } message: {
            Text(artifactError ?? "未知错误")
        }
    }

    private func perform(_ action: () throws -> Void) {
        do { try action() }
        catch { artifactError = error.localizedDescription }
    }

    private var fileURL: URL { URL(fileURLWithPath: path) }
    private var fileName: String { fileURL.lastPathComponent }
    private var displayTitle: String {
        run.deliverableTitle?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? fileURL.deletingPathExtension().lastPathComponent
    }
    private var formatLabel: String {
        let pathExtension = fileURL.pathExtension
        return pathExtension.isEmpty ? "文件" : pathExtension.uppercased()
    }
    private var fileIcon: String {
        switch fileURL.pathExtension.lowercased() {
        case "md", "txt", "rtf": "doc.text.fill"
        case "pdf": "doc.richtext.fill"
        case "csv", "xls", "xlsx": "tablecells.fill"
        case "png", "jpg", "jpeg", "heic", "webp": "photo.fill"
        default: "doc.fill"
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

private struct EmployeeComposerContainer: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    let activeRun: TaskRun?
    let employeeName: String
    let supportsTasks: Bool
    @Environment(\.resolvedAppLayout) private var layout

    var body: some View {
        Group {
            if supportsTasks,
               let activeRun,
               activeRun.runPhase == "waiting_approval",
               WorkLibraryDemoData.current == nil {
                LiveActionApprovalBar(run: activeRun, store: store, employeeName: employeeName)
            } else if supportsTasks,
               let request = WorkLibraryDemoData.current?.demoActionApproval,
               activeRun?.id == request.taskID {
                DemoActionApprovalBar(request: request, employeeName: employeeName)
            } else if supportsTasks, store.awaitingWorkConfirmation {
                WorkSubmissionConfirmationBar(store: store, employeeName: employeeName)
            } else if supportsTasks, let activeRun {
                WorkingStatusBar(run: activeRun, employeeName: employeeName, stop: { store.cancel(activeRun.id) })
            } else {
                EmployeeChatComposer(
                    conversationStore: conversationStore,
                    employeeName: employeeName
                )
            }
        }
        .frame(maxWidth: AppLayoutProfile.employeeChat.primary.maxWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, layout.isCompact ? 16 : AppTheme.Spacing.lg)
        .padding(.bottom, AppTheme.Spacing.md)
    }
}

private struct LiveActionApprovalBar: View {
    let run: TaskRun
    @ObservedObject var store: TaskStore
    let employeeName: String
    @State private var expanded = false
    @Environment(\.colorScheme) private var colorScheme

    private var pendingAction: GraphNodeEvidence? {
        run.actions.first(where: { $0.status == "blocked" || $0.status == "pending" })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                    summary
                    Spacer(minLength: AppTheme.Spacing.md)
                    actions
                }
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    summary
                    actions.frame(maxWidth: .infinity, alignment: .trailing)
                }
            }

            Button {
                expanded.toggle()
            } label: {
                Label(expanded ? "收起说明" : "为什么需要确认", systemImage: expanded ? "chevron.up" : "chevron.down")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(palette.muted)
            }
            .buttonStyle(CreamInlineButtonStyle())

            if expanded {
                Divider().overlay(palette.hairlineSoft)
                if let pendingAction {
                    approvalFact("工具", pendingAction.toolID ?? "未知")
                    approvalFact("动作", pendingAction.action ?? pendingAction.stepID)
                    approvalFact("目标", pendingAction.resource?.isEmpty == false ? pendingAction.resource! : "未提供可展示目标")
                    if let rationale = pendingAction.rationaleSummary, !rationale.isEmpty {
                        approvalFact("原因", rationale)
                    }
                }
                Text("允许一次只对当前工作生效；拒绝会结束本次工作。所有 Tool 调用仍由 Runtime 经过权限与审计检查后执行。")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            }

            if let error = run.error {
                Text(error).font(.caption).foregroundStyle(palette.error)
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(palette.warning.opacity(0.34), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.09), radius: 12, y: 4)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
    }

    private func approvalFact(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            Text(label).foregroundStyle(palette.muted).frame(width: 44, alignment: .leading)
            Text(value).foregroundStyle(palette.body).textSelection(.enabled)
        }
        .font(.caption)
    }

    private var summary: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            CreamSymbol(systemName: "hand.raised.fill")
                .foregroundStyle(palette.warning)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text("\(employeeName) 需要你确认")
                    .font(.callout.weight(.semibold))
                Text(pendingAction.map { TaskPresentation.actionTitle($0.stepID) } ?? "执行待处理的工具操作")
                    .font(.callout)
                    .foregroundStyle(palette.body)
                Text("仅本次工作 · 不会自动重复授权")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            }
        }
    }

    private var actions: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Button("拒绝", role: .destructive) { store.resolveApproval(for: run, approve: false) }
                .buttonStyle(CreamSecondaryButtonStyle())
            Button(store.isResolvingApproval(for: run) ? "处理中…" : "允许一次") {
                store.resolveApproval(for: run, approve: true)
            }
                .buttonStyle(CreamPrimaryButtonStyle())
        }
        .disabled(store.isResolvingApproval(for: run))
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct DemoActionApprovalBar: View {
    let request: DemoActionApprovalRequest
    let employeeName: String
    @State private var expanded = false
    @State private var decision: Decision?
    @Environment(\.colorScheme) private var colorScheme

    private enum Decision { case approved, denied }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            if let decision {
                HStack(spacing: AppTheme.Spacing.sm) {
                    CreamSymbol(systemName: decision == .approved ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(decision == .approved ? palette.success : palette.error)
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(decision == .approved ? "已允许本次操作" : "已拒绝本次操作")
                            .font(.callout.weight(.semibold))
                        Text(request.action)
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                    }
                    Spacer()
                }
            } else {
                approvalContent
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(palette.warning.opacity(0.34), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.09), radius: 12, y: 4)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
    }

    private var approvalContent: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                    approvalSummary
                    Spacer(minLength: AppTheme.Spacing.md)
                    approvalActions
                }
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    approvalSummary
                    HStack {
                        Spacer()
                        approvalActions
                    }
                }
            }

            Button {
                expanded.toggle()
            } label: {
                Label(expanded ? "收起详情" : "查看影响范围", systemImage: expanded ? "chevron.up" : "chevron.down")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(palette.muted)
            }
            .buttonStyle(CreamInlineButtonStyle())

            if expanded {
                Divider().overlay(palette.hairlineSoft)
                Grid(alignment: .leading, horizontalSpacing: AppTheme.Spacing.md, verticalSpacing: AppTheme.Spacing.xs) {
                    approvalDetail("工具", request.tool)
                    approvalDetail("写入位置", request.scope)
                    approvalDetail("可能影响", request.impact)
                    approvalDetail("网络访问", request.networkAccess ? "需要" : "不需要")
                }
                .font(.caption)
                .textSelection(.enabled)
            }
        }
    }

    private var approvalSummary: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            CreamSymbol(systemName: "hand.raised.fill")
                .foregroundStyle(palette.warning)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text("\(employeeName) 需要你确认")
                    .font(.callout.weight(.semibold))
                Text(request.action)
                    .font(.callout)
                    .foregroundStyle(palette.body)
                Text("仅本次工作 · \(request.scope)")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
            }
        }
    }

    private var approvalActions: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Button("拒绝", role: .destructive) { decision = .denied }
                .buttonStyle(CreamSecondaryButtonStyle())
            Button("允许一次") { decision = .approved }
                .buttonStyle(CreamPrimaryButtonStyle())
        }
    }

    private func approvalDetail(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(palette.muted)
            Text(value).foregroundStyle(palette.body)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct WorkingStatusBar: View {
    let run: TaskRun
    let employeeName: String
    let stop: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            ProgressView().controlSize(.small).tint(palette.accentTeal)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(run.isCancellationRequested ? "\(employeeName) 正在停止" : "\(employeeName) 正在工作")
                    .font(.callout.weight(.semibold))
                Text(currentActivity)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
            }
            Spacer()
            Button(run.isCancellationRequested ? "正在停止…" : "停止", role: .destructive, action: stop)
                .buttonStyle(CreamInlineButtonStyle(tone: .destructive))
                .disabled(run.isCancellationRequested)
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .frame(minHeight: 58)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(palette.hairlineSoft, lineWidth: 1) }
        .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
    }

    private var currentActivity: String {
        if let running = run.actions.first(where: { $0.status == "running" }) {
            return TaskPresentation.actionTitle(running.stepID)
        }
        return "等待 Runtime 更新进度"
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct WorkSubmissionConfirmationBar: View {
    @ObservedObject var store: TaskStore
    let employeeName: String
    @State private var expanded = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            if expanded {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text(store.draft).foregroundStyle(palette.body).textSelection(.enabled)
                    Text("确认后将创建一项可追踪工作。Skill、Tool、权限和副作用仍由 Runtime 按实际执行步骤校验。")
                        .foregroundStyle(palette.muted)
                }
                .font(.caption)
                Divider().overlay(palette.hairlineSoft)
            }

            HStack(spacing: AppTheme.Spacing.sm) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Button {
                        expanded.toggle()
                    } label: {
                        HStack(spacing: 5) {
                            Text("确认交给 \(employeeName) 执行").font(.callout.weight(.semibold))
                            CreamSymbol(systemName: expanded ? "chevron.down" : "chevron.right", scale: .compact)
                        }
                    }
                    .buttonStyle(CreamInlineButtonStyle(tone: .primary))
                    Text("工作 · 保留执行记录与交付物")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                }
                Spacer()
                Button("返回修改", action: store.cancelWorkConfirmation).buttonStyle(CreamSecondaryButtonStyle())
                Button("确认执行", action: store.confirmAndRun).buttonStyle(CreamPrimaryButtonStyle())
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(palette.hairlineSoft, lineWidth: 1) }
        .shadow(color: .black.opacity(0.09), radius: 12, y: 4)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
