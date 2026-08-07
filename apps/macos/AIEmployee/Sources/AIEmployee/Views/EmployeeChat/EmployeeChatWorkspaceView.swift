import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct EmployeeChatWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    @ObservedObject var scenarioStore: ScenarioStore
    let employee: Employee?
    @Binding var isCreatingWork: Bool

    @SceneStorage("taskInspectorVisible") private var inspectorVisible = true
    @State private var inspectorWidth: CGFloat = 320
    @State private var workspaceWidth: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.appWindowWidth) private var appWindowWidth

    private static let conversationListMinimumWindowWidth: CGFloat = 960

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
        GeometryReader { proxy in
            workspace(availableWidth: proxy.size.width)
        }
        .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { workspaceWidth = $0 }
        .onChange(of: conversationStore.pendingTaskRefresh) { _, pending in
            guard pending else { return }
            conversationStore.clearPendingTaskRefresh()
            store.retryHistory()
        }
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                EmployeeToolbarTitle(employee: employee, run: activeRun, reduceMotion: reduceMotion)
            }
            if supportsTasks, selectedRun != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        inspectorVisible.toggle()
                    } label: {
                        Label(showsInspector(availableWidth: workspaceWidth) ? "隐藏任务面板" : "显示任务面板", systemImage: "sidebar.right")
                    }
                    .help(workspaceWidth < 1020 ? "扩大窗口后可显示工作检查器" : (showsInspector(availableWidth: workspaceWidth) ? "隐藏工作检查器" : "显示工作检查器"))
                    .disabled(workspaceWidth < 1020)
                }
            }
        }
    }

    @ViewBuilder
    private func workspace(availableWidth: CGFloat) -> some View {
        HSplitView {
            if showsConversationList(availableWidth: availableWidth) {
                WorkConversationList(store: store, conversationStore: conversationStore, employeeStore: employeeStore)
                    .frame(minWidth: 230, idealWidth: 250, maxWidth: 280)
            }

            VStack(spacing: 0) {
                if !scenarioStore.flows.isEmpty {
                    BusinessFlowHistoryBar(store: scenarioStore, flows: scenarioStore.flows)
                    Divider().overlay(palette.hairlineSoft)
                }
                EmployeeMessageStream(store: store, conversationStore: conversationStore, employee: employee, showsTasks: supportsTasks)
                EmployeeComposerContainer(
                    store: store,
                    conversationStore: conversationStore,
                    activeRun: activeRun,
                    employeeName: employee?.name ?? conversationStore.employeeName,
                    supportsTasks: supportsTasks,
                    isCreatingWork: $isCreatingWork
                )
            }
            .frame(minWidth: 460, maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.canvas)

            if showsInspector(availableWidth: availableWidth) {
                TaskInspectorView(
                    run: selectedRun,
                    store: store,
                    employeeName: employee?.name ?? conversationStore.employeeName
                )
                    .frame(minWidth: 280, idealWidth: inspectorWidth, maxWidth: 420)
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { newWidth in
                        inspectorWidth = min(max(newWidth, 280), 420)
                    }
            }
        }
        .task { await scenarioStore.reload() }
    }

    private func showsInspector(availableWidth: CGFloat) -> Bool {
        supportsTasks && selectedRun != nil && inspectorVisible && availableWidth >= 1020
    }

    private func showsConversationList(availableWidth: CGFloat) -> Bool {
        appWindowWidth >= Self.conversationListMinimumWindowWidth && availableWidth >= 700
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct BusinessFlowHistoryBar: View {
    @ObservedObject var store: ScenarioStore
    let flows: [BusinessFlowProjection]
    @State private var selectedFlowID: String?
    @Environment(\.colorScheme) private var colorScheme

    private var selected: BusinessFlowProjection? {
        flows.first { $0.id == selectedFlowID } ?? flows.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("业务流", systemImage: "point.3.connected.trianglepath.dotted")
                    .font(.caption.weight(.semibold)).foregroundStyle(palette.muted)
                Picker("业务流", selection: Binding(
                    get: { selected?.id ?? "" },
                    set: { selectedFlowID = $0 }
                )) {
                    ForEach(flows) { flow in
                        Text(flow.title).tag(flow.id)
                    }
                }
                .labelsHidden().frame(maxWidth: 260)
                Spacer()
                if let selected {
                    Text(selected.status)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(selected.status == "succeeded" ? palette.success : palette.primaryActive)
                    if selected.status == "running" {
                        Button("继续") { Task { await store.continueFlow(selected) } }
                            .buttonStyle(.borderedProminent)
                        Button("取消") { Task { await store.cancelFlow(selected) } }
                    }
                }
            }
            if let selected {
                HStack(spacing: 0) {
                    ForEach(Array(selected.workOrders.enumerated()), id: \.element.id) { index, work in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(work.status == "succeeded" ? palette.success : palette.primaryActive)
                                .frame(width: 7, height: 7)
                            Text(work.goal).lineLimit(1)
                            Text(work.status).foregroundStyle(palette.muted)
                        }
                        .font(.caption)
                        if index < selected.workOrders.count - 1 {
                            Rectangle().fill(palette.hairline).frame(width: 24, height: 1).padding(.horizontal, 8)
                        }
                    }
                }
            }
            if let pending = store.pendingRun {
                HStack(spacing: 8) {
                    if pending.phase == "waiting_approval" || pending.status == "waiting_approval" {
                        Text("下一步需要审批").font(.caption).foregroundStyle(palette.warning)
                        Button("批准") { Task { await store.resolvePendingRun(approve: true) } }
                        Button("拒绝") { Task { await store.resolvePendingRun(approve: false) } }
                    } else if pending.phase == "verification_required" || pending.status == "verification_required" {
                        Text("执行结果未知，禁止自动重试").font(.caption).foregroundStyle(palette.error)
                        Button("标记成功") { Task { await store.resolveUnknown(status: "succeeded") } }
                        Button("标记失败") { Task { await store.resolveUnknown(status: "failed") } }
                    }
                }
            }
            if let error = store.errorMessage {
                Text(error).font(.caption).foregroundStyle(palette.error).lineLimit(2)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(palette.surfaceSoft)
        .disabled(store.isLoading)
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
                    Text(employee?.name ?? "员工不可用").fontWeight(.semibold)
                    if let role = employee?.role {
                        Text("· \(role)").foregroundStyle(.secondary)
                    }
                }
            }
        }
        .buttonStyle(.plain)
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
                Label(employee?.status == "active" ? "可用" : "已停用", systemImage: employee?.status == "active" ? "checkmark.circle" : "pause.circle")
                Text("消息和工作会保留在这名员工的持续会话中。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(AppTheme.Spacing.md)
            .frame(width: 280, alignment: .leading)
        }
        .onAppear {
            guard run?.status == .running, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
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
                LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
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
                .padding(.top, AppTheme.Spacing.lg)
                .padding(.bottom, 132)
                .frame(maxWidth: 820, alignment: .leading)
                .padding(.horizontal, AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, alignment: .center)
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
                withAnimation(.easeOut(duration: AppTheme.Motion.standard)) {
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
            AgentTimelineBlock(
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
                    ChatMarkdownBody(source: content)
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

private struct AgentTimelineBlock<Content: View>: View {
    let employeeName: String
    let employeeAvatarPath: String?
    let metadata: String
    var statusSystemImage: String? = nil
    var statusColor: Color = .secondary
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            EmployeeAvatar(name: employeeName, avatarPath: employeeAvatarPath, size: 28)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                HStack(spacing: AppTheme.Spacing.xs) {
                    Text(employeeName)
                    .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(palette.ink)
                    if let statusSystemImage {
                        Image(systemName: statusSystemImage)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(statusColor)
                    }
                    Text("· \(metadata)")
                        .font(.system(size: 12, weight: .medium).monospacedDigit())
                        .foregroundStyle(palette.muted)
                    Spacer(minLength: AppTheme.Spacing.sm)
                }
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
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
                .font(.title2.weight(.semibold))
                .foregroundStyle(palette.ink)
            Text("可以先讨论想法、补充背景或澄清问题。消息会保留在与 \(employeeName) 的持续会话中。")
                .font(.body)
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
    @State private var hovering = false
    @State private var expanded = false
    @State private var isEditing = false
    @State private var editingText = ""
    @FocusState private var editorFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    var body: some View {
        if message.role == "user" {
            VStack(alignment: .trailing, spacing: 5) {
                if isEditing {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        TextEditor(text: $editingText)
                            .font(.body)
                            .foregroundStyle(palette.body)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 52, maxHeight: 140)
                            .focused($editorFocused)
                        HStack(spacing: AppTheme.Spacing.sm) {
                            Text("修改后将重新生成这一轮回复")
                                .font(.caption2)
                                .foregroundStyle(palette.muted)
                            Spacer(minLength: AppTheme.Spacing.md)
                            Button("取消") { isEditing = false }
                                .buttonStyle(.plain)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(palette.muted)
                            Button {
                                if revise(editingText) { isEditing = false }
                            } label: {
                                Label("重新发送", systemImage: "arrow.up")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(palette.onPrimary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(palette.primaryActive, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .disabled(editingText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)
                    .frame(minWidth: 380, idealWidth: 520, maxWidth: 600, alignment: .leading)
                    .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                            .stroke(palette.primary.opacity(0.32), lineWidth: 1)
                    }
                    .onExitCommand { isEditing = false }
                } else {
                    ContentSizedBubble(maxWidth: 620) {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            if !attachments.isEmpty {
                                ChatAttachmentStack(attachments: attachments)
                            }
                            Text(displayedContent)
                                .font(.system(size: 15.5))
                                .foregroundStyle(palette.body)
                                .lineSpacing(4)
                                .textSelection(.enabled)
                                .selectableTextCursor()
                        }
                        .padding(.horizontal, AppTheme.Spacing.md)
                        .padding(.vertical, AppTheme.Spacing.sm)
                        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
                    }
                }

                if isLong && !isEditing { foldButton }
                if !isEditing {
                    MessageHoverActions(
                        createdAt: message.createdAt,
                        text: message.content,
                        edit: isEditable ? beginEditing : nil,
                        actionsVisible: hovering
                    )
                    .opacity(hovering ? 1 : 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .contentShape(Rectangle())
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: AppTheme.Motion.fast), value: hovering)
            .accessibilityLabel("你：\(message.content)")
        } else {
            AgentTimelineBlock(
                employeeName: employeeName,
                employeeAvatarPath: employeeAvatarPath,
                metadata: TaskPresentation.time(message.createdAt)
            ) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        ChatMarkdownBody(source: displayedContent)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(employeeName)：\(message.content)")
                        if isLong { foldButton }
                }
            }
            .overlay(alignment: .topTrailing) {
                Button { copy(message.content) } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption.weight(.medium))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(palette.muted)
                .background(palette.canvas.opacity(0.92), in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm))
                .opacity(hovering ? 1 : 0)
                .help("复制完整回复")
                .accessibilityLabel("复制 \(employeeName) 的回复")
            }
            .contentShape(Rectangle())
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: AppTheme.Motion.fast), value: hovering)
        }
    }

    private func beginEditing() {
        editingText = message.content
        isEditing = true
        Task { @MainActor in
            await Task.yield()
            editorFocused = true
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private var isLong: Bool {
        message.content.count > 900 || message.content.split(separator: "\n", omittingEmptySubsequences: false).count > 14
    }

    private var displayedContent: String {
        guard isLong, !expanded else { return message.content }
        let limit = message.role == "user" ? 520 : 900
        return String(message.content.prefix(limit)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private var foldButton: some View {
        Button {
            withAnimation(.easeOut(duration: AppTheme.Motion.standard)) { expanded.toggle() }
        } label: {
            Label(expanded ? "收起" : "展开完整消息", systemImage: expanded ? "chevron.up" : "chevron.down")
                .font(.caption.weight(.medium))
        }
        .buttonStyle(.plain)
        .foregroundStyle(palette.primaryActive)
        .help(expanded ? "折叠长消息" : "查看完整消息")
    }

    private var attachments: [ChatAttachmentPresentation] {
        WorkLibraryDemoData.current?.messageAttachments[message.id] ?? []
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ContentSizedBubble<Content: View>: View {
    let maxWidth: CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        ContentSizedLayout(maxWidth: maxWidth) { content() }
    }
}

private struct ContentSizedLayout: Layout {
    let maxWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let subview = subviews.first else { return .zero }
        let availableWidth = min(proposal.width ?? maxWidth, maxWidth)
        let ideal = subview.sizeThatFits(.unspecified)
        let width = min(ideal.width, availableWidth)
        let fitted = subview.sizeThatFits(.init(width: width, height: nil))
        return .init(width: width, height: fitted.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: .init(width: bounds.width, height: bounds.height))
    }
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
            Image(systemName: icon)
                .font(.callout.weight(.medium))
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
                Button(action: remove) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(palette.muted)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .help("移除附件")
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

private struct ChatMarkdownBody: View {
    let source: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        SelectableMarkdownTextView(source: source, colorScheme: colorScheme)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TaskConversationBlock: View {
    let run: TaskRun
    let employee: Employee?
    let showsInput: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            if showsInput {
                UserMessageBlock(text: run.input, createdAt: run.createdAt)
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
        AgentTimelineBlock(
            employeeName: employee?.name ?? "AI 员工",
            employeeAvatarPath: employee?.avatarPath,
            metadata: statusText(at: date),
            statusSystemImage: run.status.systemImage,
            statusColor: statusColor
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
                    ChatMarkdownBody(source: message).frame(maxWidth: .infinity, alignment: .leading)
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

private struct UserMessageBlock: View {
    let text: String
    let createdAt: String
    @State private var hovering = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .trailing, spacing: 5) {
            ContentSizedBubble(maxWidth: 680) {
                Text(text)
                    .font(.body)
                    .foregroundStyle(palette.body)
                    .textSelection(.enabled)
                    .selectableTextCursor()
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)
                    .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
            }

            MessageHoverActions(createdAt: createdAt, text: text, edit: nil, actionsVisible: hovering)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: AppTheme.Motion.fast), value: hovering)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct MessageHoverActions: View {
    let createdAt: String
    let text: String
    let edit: (() -> Void)?
    let actionsVisible: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 4) {
            Text(TaskPresentation.time(createdAt))
                .font(.caption.monospacedDigit())
                .foregroundStyle(palette.mutedSoft)
                .padding(.trailing, 4)

            HStack(spacing: 4) {
                hoverButton("复制消息", systemImage: "doc.on.doc") { copyToPasteboard() }
                if let edit {
                    hoverButton("编辑消息", systemImage: "pencil", action: edit)
                }
            }
            .opacity(actionsVisible ? 1 : 0)
        }
        .frame(height: 24)
    }

    private func hoverButton(_ label: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.caption.weight(.medium))
                .foregroundStyle(palette.muted)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(label)
        .accessibilityLabel(label)
    }

    private func copyToPasteboard() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private extension View {
    func selectableTextCursor() -> some View {
        onContinuousHover { phase in
            switch phase {
            case .active: NSCursor.iBeam.set()
            case .ended: NSCursor.arrow.set()
            }
        }
    }
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
                Image(systemName: fileIcon)
                    .font(.system(size: 20, weight: .medium))
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
                    .buttonStyle(.plain)
                    .help("使用系统默认 App 打开文件")

                    Rectangle()
                        .fill(palette.onPrimary.opacity(0.24))
                        .frame(width: 1, height: 18)

                    Menu {
                        Button("打开文件夹", systemImage: "folder") {
                            perform { try ArtifactService.openContainingFolder(path) }
                        }
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .bold))
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
    @Binding var isCreatingWork: Bool

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
                EmployeeUnifiedComposer(
                    taskStore: store,
                    conversationStore: conversationStore,
                    employeeName: employeeName,
                    supportsTasks: supportsTasks,
                    isCreatingWork: $isCreatingWork
                )
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.bottom, AppTheme.Spacing.md)
        .onChange(of: store.awaitingWorkConfirmation) { _, awaitingConfirmation in
            if awaitingConfirmation { isCreatingWork = false }
        }
        .onChange(of: supportsTasks) { _, canCreateTasks in
            if !canCreateTasks { isCreatingWork = false }
        }
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
            .buttonStyle(.plain)

            if expanded {
                Divider().overlay(palette.hairlineSoft)
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

    private var summary: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            Image(systemName: "hand.raised.fill")
                .foregroundStyle(palette.warning)
                .frame(width: 18)
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
                    Image(systemName: decision == .approved ? "checkmark.circle.fill" : "xmark.circle.fill")
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
            .buttonStyle(.plain)

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
            Image(systemName: "hand.raised.fill")
                .foregroundStyle(palette.warning)
                .frame(width: 18)
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

private struct EmployeeUnifiedComposer: View {
    @ObservedObject var taskStore: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    let employeeName: String
    let supportsTasks: Bool
    @Binding var isCreatingWork: Bool
    @State private var attachments: [ChatAttachmentPresentation] = []
    @State private var choosingAttachments = false
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let error = conversationStore.error, !isCreatingWork {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(palette.error)
                    .textSelection(.enabled)
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.top, AppTheme.Spacing.sm)
            }

            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                if !attachments.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: AppTheme.Spacing.xs) {
                            ForEach(attachments) { attachment in
                                ChatAttachmentRow(attachment: attachment) {
                                    attachments.removeAll { $0.id == attachment.id }
                                }
                                .frame(width: 240)
                            }
                        }
                    }
                }

                TextField(isCreatingWork ? "描述要交给 \(employeeName) 的工作…" : "给 \(employeeName) 发消息…", text: draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.body)
                    .lineLimit(1...8)
                    .frame(minHeight: attachments.isEmpty ? 38 : 28, alignment: .topLeading)
                    .focused($focused)
                    .onKeyPress(keys: [.return]) { keyPress in
                        guard keyPress.modifiers.contains(.shift) else { return .ignored }
                        NSApp.sendAction(#selector(NSText.insertNewline(_:)), to: nil, from: nil)
                        return .handled
                    }
                    .onSubmit(submit)
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.top, AppTheme.Spacing.md)
            .padding(.bottom, AppTheme.Spacing.xs)

            HStack(spacing: AppTheme.Spacing.xs) {
                Button { choosingAttachments = true } label: {
                    Image(systemName: "plus")
                        .font(.body.weight(.medium))
                        .foregroundStyle(palette.muted)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("添加附件")
                .accessibilityLabel("添加附件")

                if supportsTasks {
                    Button { isCreatingWork.toggle(); focused = true } label: {
                        Label(isCreatingWork ? "工作模式" : "交给员工工作", systemImage: "briefcase")
                            .font(.caption.weight(isCreatingWork ? .semibold : .regular))
                            .foregroundStyle(isCreatingWork ? palette.ink : palette.muted)
                            .padding(.horizontal, AppTheme.Spacing.xs)
                            .frame(height: 28)
                            .background(isCreatingWork ? palette.primary.opacity(0.14) : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(conversationStore.isSending || taskStore.isSubmitting)
                    .help(isCreatingWork ? "切回日常聊天" : "创建可追踪的工作记录")
                } else {
                    Text("工作 · 尚未接通 Runtime")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(palette.warning)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(palette.warning.opacity(0.12), in: Capsule())
                        .help("安装并绑定 Skill/Tool Package 后即可执行工作；客户端不提供创建入口。")
                }

                Spacer()

                if conversationStore.isSending && !isCreatingWork {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            Text(conversationStore.isStopping ? "正在停止…" : "\(employeeName) 正在回复…")
                                .font(.caption)
                                .foregroundStyle(palette.muted)
                        }
                        ProgressView().controlSize(.small)
                    }
                } else {
                    ViewThatFits(in: .horizontal) {
                        Text("Enter 发送 · Shift+Enter 换行")
                            .font(.caption2)
                            .foregroundStyle(palette.mutedSoft)
                        EmptyView()
                    }
                }

                Button(action: conversationStore.isSending && !isCreatingWork ? conversationStore.stopSending : submit) {
                    Image(systemName: conversationStore.isSending && !isCreatingWork ? "stop.fill" : "arrow.up")
                        .font(.callout.weight(.bold))
                        .foregroundStyle(conversationStore.isSending && !isCreatingWork || canSubmit ? palette.surfaceCard : palette.mutedSoft)
                        .frame(width: 32, height: 32)
                        .background((conversationStore.isSending && !isCreatingWork || canSubmit ? palette.ink : palette.hairlineSoft), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit && !(conversationStore.isSending && !isCreatingWork))
                .disabled(conversationStore.isStopping)
                .help(conversationStore.isSending && !isCreatingWork ? "停止本轮回复" : (isCreatingWork ? "确认工作" : "发送消息"))
                .accessibilityLabel(conversationStore.isSending && !isCreatingWork ? "停止本轮回复" : (isCreatingWork ? "确认工作" : "发送消息"))
            }
            .padding(.leading, AppTheme.Spacing.sm)
            .padding(.trailing, AppTheme.Spacing.xs)
            .padding(.bottom, AppTheme.Spacing.xs)
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AppTheme.Elevation.composerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.Elevation.composerRadius, style: .continuous)
                .stroke(
                    focused ? palette.primary.opacity(0.20) : palette.hairlineSoft.opacity(0.72),
                    lineWidth: 1
                )
        }
        .shadow(
            color: focused ? palette.primary.opacity(0.10) : .clear,
            radius: 8
        )
        .shadow(
            color: palette.shadow,
            radius: AppTheme.Elevation.composerRadius,
            y: AppTheme.Elevation.composerY
        )
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
        .fileImporter(isPresented: $choosingAttachments, allowedContentTypes: [.data], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            for url in urls where !attachments.contains(where: { $0.path == url.path }) {
                let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
                attachments.append(.init(
                    name: url.lastPathComponent,
                    kind: values?.contentType?.localizedDescription ?? "文件",
                    size: formattedSize(values?.fileSize),
                    path: url.path
                ))
            }
        }
    }

    private var draft: Binding<String> { isCreatingWork ? $taskStore.draft : $conversationStore.draft }

    private var canSubmit: Bool {
        let text = draft.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && (isCreatingWork ? !taskStore.isSubmitting : !conversationStore.isSending)
    }

    private func submit() {
        guard canSubmit else { return }
        if isCreatingWork { taskStore.requestRun() } else { conversationStore.send() }
        attachments = []
    }

    private func formattedSize(_ bytes: Int?) -> String {
        guard let bytes else { return "未知大小" }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
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
                .buttonStyle(.plain)
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
                            Image(systemName: expanded ? "chevron.down" : "chevron.right").font(.caption2)
                        }
                    }
                    .buttonStyle(.plain)
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
