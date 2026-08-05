import SwiftUI

struct EmployeeChatWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    let employee: Employee?
    @Binding var isCreatingWork: Bool

    @SceneStorage("taskInspectorVisible") private var inspectorVisible = true
    @State private var inspectorWidth: CGFloat = 320
    @State private var workspaceWidth: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    private var activeRun: TaskRun? {
        guard supportsTasks else { return nil }
        return store.runs.first { $0.status == .running || $0.status == .pending }
    }

    private var selectedRun: TaskRun? {
        guard supportsTasks else { return nil }
        if let selection = store.selection,
           let selected = store.runs.first(where: { $0.id == selection }) {
            return selected
        }
        return activeRun ?? store.runs.first
    }

    private var showsInspector: Bool {
        supportsTasks && inspectorVisible && workspaceWidth >= 820
    }

    private var supportsTasks: Bool {
        (employee?.id ?? conversationStore.employeeID) == "ai-product-manager"
    }

    var body: some View {
        HSplitView {
            VStack(spacing: 0) {
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

            if showsInspector {
                TaskInspectorView(run: selectedRun)
                    .frame(minWidth: 280, idealWidth: inspectorWidth, maxWidth: 420)
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { newWidth in
                        inspectorWidth = min(max(newWidth, 280), 420)
                    }
            }
        }
        .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { workspaceWidth = $0 }
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                EmployeeToolbarTitle(employee: employee, run: activeRun, reduceMotion: reduceMotion)
            }
            if supportsTasks {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        inspectorVisible.toggle()
                    } label: {
                        Label(showsInspector ? "隐藏任务面板" : "显示任务面板", systemImage: "sidebar.right")
                    }
                    .help(workspaceWidth < 820 ? "扩大窗口后可显示任务面板" : (showsInspector ? "隐藏任务面板" : "显示任务面板"))
                    .disabled(workspaceWidth < 820)
                }
            }
        }
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
                    Text(employee?.name ?? "Alex").fontWeight(.semibold)
                    Text("· \(employee?.role ?? "AI 产品经理")").foregroundStyle(.secondary)
                }
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .buttonStyle(.plain)
        .help(run.map { "\(employee?.name ?? "Alex") 正在处理：\($0.input)" } ?? "查看员工详情")
        .popover(isPresented: $detailsVisible, arrowEdge: .top) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(employee?.name ?? "Alex").font(.headline)
                Text("\(employee?.role ?? "AI 产品经理") · \(employee?.department ?? "产品部")").font(.callout).foregroundStyle(.secondary)
                Divider()
                Label("需求分析", systemImage: "text.magnifyingglass")
                Label("PRD 生成", systemImage: "doc.text")
                Text("所有写入均经过 Rust Runtime、一次性审批和审计。")
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

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                if conversationStore.messages.isEmpty && (!showsTasks || store.runs.isEmpty) {
                    EmptyConversationView(employeeName: employee?.name ?? conversationStore.employeeName)
                }

                ForEach(conversationStore.messages) { message in
                    ConversationMessageBlock(message: message, employeeName: employee?.name ?? conversationStore.employeeName)
                }

                if showsTasks && !store.runs.isEmpty {
                    ForEach(Array(store.runs.reversed())) { run in
                        TaskConversationBlock(run: run)
                            .id(run.id)
                    }
                }
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.top, AppTheme.Spacing.lg)
            .padding(.bottom, 132)
            .frame(maxWidth: 820, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .scrollContentBackground(.hidden)
        .background(palette.canvas)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmptyConversationView: View {
    let employeeName: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text("和 \(employeeName) 聊聊")
                .font(.title2.weight(.semibold))
                .foregroundStyle(palette.ink)
            Text("可以先讨论想法、补充背景或澄清问题。需要正式执行时，再明确交给 \(employeeName) 一项工作。")
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
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if message.role == "user" {
                Text("你")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.muted)
            }
            Text(message.content)
                .font(.body)
                .foregroundStyle(palette.body)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(message.role == "user" ? AppTheme.Spacing.md : 0)
        .frame(maxWidth: message.role == "user" ? 680 : .infinity, alignment: .leading)
        .background(message.role == "user" ? palette.surfaceSoft : .clear, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .accessibilityLabel(message.role == "user" ? "你：\(message.content)" : "\(employeeName)：\(message.content)")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct TaskConversationBlock: View {
    let run: TaskRun
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            UserMessageBlock(text: run.input, createdAt: run.createdAt)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                AgentStatusLine(run: run)

                if !run.actions.isEmpty || !run.events.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(activityItems) { item in
                            ActivityDisclosureRow(item: item)
                            if item.id != activityItems.last?.id {
                                Divider().overlay(palette.hairlineSoft)
                            }
                        }
                    }
                }

                if let error = run.error {
                    InlineFailureMessage(error: error)
                }

                if let path = run.response?.artifactPath ?? run.artifactPath {
                    ArtifactMessageBlock(run: run, path: path)
                }
            }

            Divider().overlay(palette.hairlineSoft)
        }
    }

    private var activityItems: [EmployeeActivityItem] {
        let actionItems = run.actions.map { node in
            EmployeeActivityItem(
                id: "action-\(node.actionID)",
                title: TaskPresentation.actionTitle(node.stepID),
                status: node.status,
                detail: node.outputAs.isEmpty ? nil : "阶段输出：\(node.outputAs)",
                timestamp: nil,
                isDiagnostic: false
            )
        }
        let actionTypes = Set(run.actions.map(\.stepID))
        let eventItems = run.events.filter { !actionTypes.contains($0.type) }.map { event in
            EmployeeActivityItem(
                id: "event-\(event.eventID)",
                title: TaskPresentation.eventTitle(event.type),
                status: eventStatus(event.type),
                detail: "Runtime Event：\(event.type)",
                timestamp: TaskPresentation.date(event.occurredAt),
                isDiagnostic: true
            )
        }
        return actionItems + eventItems
    }

    private func eventStatus(_ type: String) -> String {
        if type.contains("failed") { return "failed" }
        if type.contains("cancelled") { return "cancelled" }
        if type.contains("started") { return "running" }
        return "succeeded"
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct UserMessageBlock: View {
    let text: String
    let createdAt: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(text)
                .font(.body)
                .foregroundStyle(palette.body)
                .textSelection(.enabled)
            Text(TaskPresentation.date(createdAt))
                .font(.caption)
                .foregroundStyle(palette.mutedSoft)
        }
        .padding(AppTheme.Spacing.md)
        .frame(maxWidth: 680, alignment: .leading)
        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct AgentStatusLine: View {
    let run: TaskRun
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Image(systemName: run.status.systemImage)
                .foregroundStyle(statusColor)
                .frame(width: 16)
            Text(statusText)
                .font(.body.weight(.medium))
                .foregroundStyle(palette.ink)
            Spacer()
        }
    }

    private var statusText: String {
        switch run.status {
        case .pending: "工作已保存，等待 Runtime 开始"
        case .running: run.isCancellationRequested ? "Alex 正在停止这项工作" : "Alex 正在处理这项工作"
        case .succeeded: "Alex 已完成这项工作"
        case .failed: "Alex 未能完成这项工作"
        case .cancelled: "这项工作已停止"
        }
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

private struct EmployeeActivityItem: Identifiable {
    let id: String
    let title: String
    let status: String
    let detail: String?
    let timestamp: String?
    let isDiagnostic: Bool
}

private struct ActivityDisclosureRow: View {
    let item: EmployeeActivityItem
    @State private var expanded = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                if let detail = item.detail {
                    Text(detail)
                        .font(.caption.monospaced())
                        .foregroundStyle(palette.muted)
                        .textSelection(.enabled)
                }
                if let timestamp = item.timestamp {
                    Text(timestamp).font(.caption).foregroundStyle(palette.mutedSoft)
                }
            }
            .padding(.leading, 26)
            .padding(.bottom, AppTheme.Spacing.sm)
        } label: {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: statusSymbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
                    .frame(width: 14)
                Text(item.title)
                    .font(.callout)
                    .foregroundStyle(palette.body)
                Spacer()
                Text(TaskPresentation.actionStatus(item.status))
                    .font(.caption)
                    .foregroundStyle(statusColor)
            }
            .padding(.vertical, AppTheme.Spacing.sm)
        }
        .disclosureGroupStyle(.automatic)
        .onAppear {
            if item.status == "failed" || item.status == "blocked" || item.status == "result_unknown" {
                expanded = true
            }
        }
    }

    private var statusSymbol: String {
        switch item.status {
        case "running": "circle.dotted"
        case "succeeded": "checkmark"
        case "failed": "exclamationmark"
        case "blocked": "lock.fill"
        case "result_unknown": "questionmark"
        case "cancelled": "xmark"
        default: "circle"
        }
    }

    private var statusColor: Color {
        switch item.status {
        case "running": palette.accentTeal
        case "succeeded": palette.success
        case "failed", "result_unknown": palette.error
        case "blocked": palette.warning
        default: palette.muted
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
    @State private var preview: String?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "doc.text.fill")
                    .font(.title3)
                    .foregroundStyle(palette.primary)
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("PRD 已交付").font(.body.weight(.semibold))
                    if let evaluation = run.response?.evaluation ?? run.evaluation {
                        Text(evaluation.deliveryAllowed ? "质量检查通过 · \(evaluation.score.formatted(.number.precision(.fractionLength(2))))" : "未达到交付门槛")
                            .font(.caption)
                            .foregroundStyle(evaluation.deliveryAllowed ? palette.success : palette.warning)
                    }
                }
                Spacer()
                Button {
                    perform { try ArtifactService.open(path) }
                } label: {
                    Label("打开", systemImage: "arrow.up.right")
                }
                .buttonStyle(.plain)
            }

            Divider().overlay(palette.hairlineSoft)

            if let preview {
                Text(tryAttributedMarkdown(preview))
                    .font(.callout)
                    .foregroundStyle(palette.body)
                    .lineLimit(12)
                    .textSelection(.enabled)
            } else {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("正在读取交付物…").font(.caption).foregroundStyle(palette.muted)
                }
            }

            HStack {
                Text(URL(fileURLWithPath: path).lastPathComponent)
                    .font(.caption.monospaced())
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Spacer()
                Button("在 Finder 中显示") { perform { try ArtifactService.reveal(path) } }
                    .buttonStyle(.plain)
                    .font(.caption)
            }
        }
        .padding(AppTheme.Spacing.md)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous).stroke(palette.hairlineSoft, lineWidth: 1) }
        .frame(maxWidth: 680, alignment: .leading)
        .task(id: path) {
            do { preview = try await ArtifactService.loadMarkdown(at: path) }
            catch { artifactError = error.localizedDescription }
        }
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

    private func tryAttributedMarkdown(_ source: String) -> AttributedString {
        (try? AttributedString(markdown: source)) ?? AttributedString(source)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmployeeComposerContainer: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    let activeRun: TaskRun?
    let employeeName: String
    let supportsTasks: Bool
    @Binding var isCreatingWork: Bool

    var body: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            if supportsTasks {
                if store.awaitingApproval {
                    ApprovalActionBar(store: store)
                } else if let activeRun {
                    WorkingStatusBar(run: activeRun, stop: { store.cancel(activeRun.id) })
                }
            }

            if isCreatingWork && supportsTasks {
                EmployeeWorkComposer(
                    store: store,
                    employeeName: employeeName,
                    cancel: { isCreatingWork = false }
                )
            } else {
                EmployeeChatComposer(
                    store: conversationStore,
                    employeeName: employeeName,
                    canCreateWork: supportsTasks && activeRun == nil && !store.awaitingApproval,
                    createWork: { isCreatingWork = true }
                )
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.bottom, AppTheme.Spacing.md)
        .onChange(of: store.awaitingApproval) { _, awaitingApproval in
            if awaitingApproval { isCreatingWork = false }
        }
        .onChange(of: supportsTasks) { _, canCreateTasks in
            if !canCreateTasks { isCreatingWork = false }
        }
    }
}

private struct EmployeeChatComposer: View {
    @ObservedObject var store: ConversationStore
    let employeeName: String
    let canCreateWork: Bool
    let createWork: () -> Void
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            if let error = store.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(palette.error)
                    .textSelection(.enabled)
            }

            TextField("给 \(employeeName) 发消息…", text: $store.draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .lineLimit(1...8)
                .focused($focused)
                .onSubmit(submit)

            HStack(spacing: AppTheme.Spacing.sm) {
                if canCreateWork {
                    Button(action: createWork) {
                        Label("交给 \(employeeName) 工作", systemImage: "briefcase")
                    }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .disabled(store.isSending)
                }

                Spacer()

                if store.isSending {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.small)
                        Text("\(employeeName) 正在回复…")
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                    }
                }

                Button(action: submit) {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.bold))
                        .foregroundStyle(canSubmit ? palette.ink : palette.mutedSoft)
                        .frame(width: 32, height: 32)
                        .background((canSubmit ? palette.primary : palette.hairlineSoft), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
                .help("发送消息")
            }
        }
        .padding(AppTheme.Spacing.sm)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(focused ? palette.primary.opacity(0.72) : palette.hairlineSoft, lineWidth: focused ? 1.4 : 1)
        }
        .shadow(color: .black.opacity(0.09), radius: 12, y: 4)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
    }

    private var canSubmit: Bool {
        !store.isSending && !store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        guard canSubmit else { return }
        store.send()
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmployeeWorkComposer: View {
    @ObservedObject var store: TaskStore
    let employeeName: String
    let cancel: () -> Void
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            TextField("描述要交给 \(employeeName) 的工作…", text: $store.draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .lineLimit(1...8)
                .focused($focused)
                .onSubmit(submit)

            HStack {
                Button("返回聊天", action: cancel)
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                Spacer()
                Button(action: submit) {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.bold))
                        .foregroundStyle(canSubmit ? palette.ink : palette.mutedSoft)
                        .frame(width: 32, height: 32)
                        .background((canSubmit ? palette.primary : palette.hairlineSoft), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
                .help("提交工作")
            }
        }
        .padding(AppTheme.Spacing.sm)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(focused ? palette.primary.opacity(0.72) : palette.hairlineSoft, lineWidth: focused ? 1.4 : 1)
        }
        .shadow(color: .black.opacity(0.09), radius: 12, y: 4)
        .frame(maxWidth: 820)
        .frame(maxWidth: .infinity)
        .onAppear { focused = true }
    }

    private var canSubmit: Bool {
        !store.isSubmitting && !store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        guard canSubmit else { return }
        store.requestRun()
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct WorkingStatusBar: View {
    let run: TaskRun
    let stop: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            ProgressView().controlSize(.small).tint(palette.accentTeal)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(run.isCancellationRequested ? "Alex 正在停止" : "Alex 正在工作")
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

private struct ApprovalActionBar: View {
    @ObservedObject var store: TaskStore
    @State private var expanded = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            if expanded {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    LabeledContent("动作", value: "创建 PRD 文档")
                    LabeledContent("Tool", value: "document-tool")
                    LabeledContent("授权范围", value: "仅本次工作")
                    LabeledContent("预计副作用", value: "在 outputs 目录创建 Markdown 文件")
                    LabeledContent("网络访问", value: "无")
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
                            Text("Alex 请求写入文件").font(.callout.weight(.semibold))
                            Image(systemName: expanded ? "chevron.down" : "chevron.right").font(.caption2)
                        }
                    }
                    .buttonStyle(.plain)
                    Text("仅限本次工作 · outputs/PRD.md")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                }
                Spacer()
                Button("拒绝", action: store.cancelApproval)
                Button("允许一次", action: store.approveAndRun)
                    .buttonStyle(.borderedProminent)
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
