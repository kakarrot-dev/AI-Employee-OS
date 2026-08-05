import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct EmployeeChatWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
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
        supportsTasks && selectedRun != nil && inspectorVisible && workspaceWidth >= 1020
    }

    private var showsConversationList: Bool {
        workspaceWidth >= 700
    }

    private var supportsTasks: Bool {
        capabilityStore.tasksEnabled
    }

    var body: some View {
        HSplitView {
            if showsConversationList {
                WorkConversationList(store: store, conversationStore: conversationStore, employeeStore: employeeStore)
                    .frame(minWidth: 230, idealWidth: 250, maxWidth: 280)
            }

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
                TaskInspectorView(run: selectedRun, employee: employee)
                    .frame(minWidth: 280, idealWidth: inspectorWidth, maxWidth: 420)
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { newWidth in
                        inspectorWidth = min(max(newWidth, 280), 420)
                    }
            }
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
                        Label(showsInspector ? "隐藏任务面板" : "显示任务面板", systemImage: "sidebar.right")
                    }
                    .help(workspaceWidth < 1020 ? "扩大窗口后可显示工作检查器" : (showsInspector ? "隐藏工作检查器" : "显示工作检查器"))
                    .disabled(workspaceWidth < 1020)
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
            }
        }
        .buttonStyle(.plain)
        .help(run.map { "\(employee?.name ?? "Alex") 正在处理：\($0.input)" } ?? "查看员工详情")
        .popover(isPresented: $detailsVisible, arrowEdge: .top) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(employee?.name ?? "Alex").font(.headline)
                Text("\(employee?.role ?? "AI 产品经理") · \(employee?.department ?? "产品部")").font(.callout).foregroundStyle(.secondary)
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

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                if timeline.isEmpty {
                    EmptyConversationView(employeeName: employee?.name ?? conversationStore.employeeName, supportsTasks: showsTasks)
                }

                ForEach(timeline) { entry in
                    switch entry {
                    case .message(let message):
                        ConversationMessageBlock(
                            message: message,
                            employeeName: employee?.name ?? conversationStore.employeeName,
                            edit: { conversationStore.draft = message.content }
                        )
                    case .run(let run):
                        TaskConversationBlock(run: run)
                            .id(run.id)
                    }
                }
            }
            .padding(.top, AppTheme.Spacing.lg)
            .padding(.bottom, 132)
            .frame(maxWidth: 820, alignment: .leading)
            .padding(.horizontal, AppTheme.Spacing.lg)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .scrollContentBackground(.hidden)
        .background(palette.canvas)
    }

    private var timeline: [WorkTimelineEntry] {
        var entries = conversationStore.messages.map(WorkTimelineEntry.message)
        if showsTasks { entries.append(contentsOf: store.runs.map(WorkTimelineEntry.run)) }
        return entries.sorted { $0.createdAt < $1.createdAt }
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
    let edit: () -> Void
    @State private var hovering = false
    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    var body: some View {
        if message.role == "user" {
            VStack(alignment: .trailing, spacing: 5) {
                ContentSizedBubble(maxWidth: 680) {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        if !attachments.isEmpty {
                            ChatAttachmentStack(attachments: attachments)
                        }
                        Text(message.content)
                            .font(.body)
                            .foregroundStyle(palette.body)
                            .textSelection(.enabled)
                    }
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)
                    .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
                }

                MessageHoverActions(createdAt: message.createdAt, text: message.content, edit: edit)
                    .opacity(hovering ? 1 : 0)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .contentShape(Rectangle())
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: AppTheme.Motion.fast), value: hovering)
            .accessibilityLabel("你：\(message.content)")
        } else {
            ChatMarkdownBody(source: message.content)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("\(employeeName)：\(message.content)")
        }
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
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.md).stroke(palette.hairlineSoft, lineWidth: 1) }
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
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MarkdownBlock.parse(source).enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
    }

    @ViewBuilder private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text): Text(text).font(level == 1 ? .title2.weight(.semibold) : level == 2 ? .title3.weight(.semibold) : .headline).foregroundStyle(palette.ink).padding(.top, level == 1 ? 0 : 8)
        case .paragraph(let text): Text(inline(text)).font(.body).foregroundStyle(palette.body).lineSpacing(4)
        case .bullet(let text): HStack(alignment: .firstTextBaseline, spacing: 9) { Circle().fill(palette.primaryActive).frame(width: 5, height: 5); Text(inline(text)).foregroundStyle(palette.body).lineSpacing(3) }
        case .numbered(let text): Text(inline(text)).foregroundStyle(palette.body).lineSpacing(3)
        case .quote(let text): Text(inline(text)).foregroundStyle(palette.muted).padding(.leading, 12).overlay(alignment: .leading) { Rectangle().fill(palette.primary.opacity(0.42)).frame(width: 2) }
        case .code(let text): Text(text).font(.system(.caption, design: .monospaced)).foregroundStyle(palette.body).padding(12).frame(maxWidth: .infinity, alignment: .leading).background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
        case .divider: Divider().overlay(palette.hairlineSoft)
        case .spacing: Color.clear.frame(height: 3)
        }
    }

    private func inline(_ text: String) -> AttributedString { (try? AttributedString(markdown: text)) ?? AttributedString(text) }
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
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)
                    .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
            }

            MessageHoverActions(createdAt: createdAt, text: text, edit: nil)
                .opacity(hovering ? 1 : 0)
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
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 4) {
            Text(TaskPresentation.time(createdAt))
                .font(.caption.monospacedDigit())
                .foregroundStyle(palette.mutedSoft)
                .padding(.trailing, 4)

            hoverButton("复制消息", systemImage: "doc.on.doc") { copyToPasteboard() }
            if let edit {
                hoverButton("编辑消息", systemImage: "pencil", action: edit)
            }
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
                .help("使用系统默认应用打开")
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
            if let demoPreview {
                do {
                    try ArtifactService.materializeDemoArtifact(at: path, content: demoPreview)
                    preview = demoPreview
                } catch {
                    artifactError = error.localizedDescription
                }
                return
            }
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

    private var demoPreview: String? { WorkLibraryDemoData.current?.artifacts[path] }

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
        Group {
            if supportsTasks,
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
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            if isCreatingWork {
                HStack(spacing: 7) {
                    Image(systemName: "briefcase.fill").foregroundStyle(palette.primaryActive)
                    Text("工作").font(.caption.weight(.semibold)).foregroundStyle(palette.ink)
                    Text("将创建可追踪的执行记录").font(.caption).foregroundStyle(palette.muted)
                }
            }

            if let error = conversationStore.error, !isCreatingWork {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(palette.error)
                    .textSelection(.enabled)
            }

            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        ForEach(attachments) { attachment in
                            ChatAttachmentRow(attachment: attachment) {
                                attachments.removeAll { $0.id == attachment.id }
                            }
                            .frame(width: 260)
                        }
                    }
                }
            }

            TextField(isCreatingWork ? "描述要交给 \(employeeName) 的工作…" : "给 \(employeeName) 发消息…", text: draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .lineLimit(1...8)
                .focused($focused)
                .onSubmit(submit)

            HStack(spacing: AppTheme.Spacing.sm) {
                Button { choosingAttachments = true } label: {
                    Image(systemName: "plus")
                        .font(.body.weight(.medium))
                        .foregroundStyle(palette.muted)
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("添加附件")
                .accessibilityLabel("添加附件")

                if supportsTasks {
                    Button { isCreatingWork.toggle(); focused = true } label: {
                        Label(isCreatingWork ? "返回闲聊" : "作为工作执行", systemImage: isCreatingWork ? "bubble.left" : "briefcase")
                    }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .disabled(conversationStore.isSending || taskStore.isSubmitting)
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
                .help(isCreatingWork ? "确认工作" : "发送消息")
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
