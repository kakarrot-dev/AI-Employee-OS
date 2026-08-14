import AppKit
import SwiftUI

struct TaskThreadWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var employeeStore: EmployeeStore
    @Environment(\.colorScheme) private var colorScheme
    @SceneStorage("workInspectorPreferred") private var inspectorPreferred = true
    @State private var compactShowsRoom = false
    @State private var roomDraft = ""
    @State private var pendingDeletion: TaskThreadProjection?

    var body: some View {
        AdaptiveWorkspace(
            profile: .work,
            compactShowsPrimary: $compactShowsRoom,
            prefersInspector: inspectorPreference
        ) {
            threadList
        } primary: { showsBack, layout in
            if let thread = store.activeThread {
                taskRoom(thread, showsBack: showsBack, layout: layout)
            } else {
                emptyDetail(showsBack: showsBack)
            }
        } inspector: {
            if let thread = store.activeThread {
                inspector(thread)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.canvas)
        .moduleNavigationTitle(.work)
        .confirmationDialog("删除这条工作记录？", isPresented: Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        ), titleVisibility: .visible) {
            Button("删除记录", role: .destructive) {
                if let pendingDeletion { store.deleteThread(pendingDeletion) }
                pendingDeletion = nil
            }
            Button("取消", role: .cancel) { pendingDeletion = nil }
        } message: {
            Text("记录会从工作库移除；底层 Task、Action 与 Audit 证据仍由 Runtime 保留。")
        }
    }

    private var inspectorPreference: Binding<Bool> {
        Binding(
            get: { store.activeThread != nil && inspectorPreferred },
            set: { inspectorPreferred = $0 }
        )
    }

    private var threadList: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 2) {
                    ForEach(store.taskThreads) { thread in
                        TaskThreadSidebarRow(
                            thread: thread,
                            isSelected: store.activeThread?.id == thread.id,
                            select: {
                                store.selectThread(thread)
                                compactShowsRoom = true
                            },
                            archive: { store.archiveThread(thread) },
                            restore: { store.restoreThread(thread) },
                            delete: { pendingDeletion = thread }
                        )
                        .padding(.horizontal, 8)
                    }
                }
                .padding(.vertical, 8)
            }
        }
    }

    private func emptyDetail(showsBack: Bool) -> some View {
        VStack(spacing: 16) {
            if showsBack {
                Button {
                    compactShowsRoom = false
                } label: {
                    Label("返回工作列表", systemImage: "chevron.left")
                }
                .buttonStyle(.plain)
                .foregroundStyle(palette.body)
            }
            ContentUnavailableView(
                "还没有工作",
                systemImage: "tray",
                description: Text("在办公室描述目标后，Task 会持续保存在这里。")
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.canvas)
    }

    private func taskRoom(_ thread: TaskThreadProjection, showsBack: Bool, layout: ResolvedLayout) -> some View {
        VStack(spacing: 0) {
            roomHeader(thread, showsBack: showsBack, layout: layout)
            Divider()
            ScrollView {
                CreamTimelineLayout(
                    density: .regular,
                    horizontalInset: layout.isCompact ? 16 : 28,
                    topInset: 22,
                    bottomInset: 22
                ) {
                    switch store.proposalState {
                    case .recoverable(let message):
                        proposalRecoveryCard(message: message)
                    case .generating, .restoring:
                        proposalLoadingCard()
                    case .review(let proposal) where proposal.threadID == thread.id:
                        proposalReview(proposal)
                    case .failed(let message, let code):
                        proposalFailureCard(message: message, code: code)
                    case .idle, .review:
                        EmptyView()
                    }
                    ForEach(thread.room.items) { item in timelineItem(item, thread: thread) }
                }
            }
            composer(thread, layout: layout)
        }
    }

    private func proposalReview(_ proposal: TaskProposalResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("执行方案", systemImage: "list.bullet.clipboard")
                        .font(AppTheme.Typography.interfaceBody(weight: .semibold)).foregroundStyle(palette.ink)
                    Text(proposal.proposal.intent == "multi_agent_task" ? "多员工协作 · \(proposal.proposal.assignments.count) 个分工" : "单员工执行")
                        .font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted)
                }
                Spacer()
                Button("返回修改", action: store.cancelWorkConfirmation).buttonStyle(CreamSecondaryButtonStyle())
                Button("确认执行", action: store.confirmAndRun)
                    .buttonStyle(CreamPrimaryButtonStyle())
                    .disabled(store.isSubmitting || proposal.proposal.missingInputs.contains(where: \.required))
            }
            ForEach(proposal.proposal.missingInputs, id: \.key) { item in
                Label(item.question, systemImage: "questionmark.circle")
                    .font(AppTheme.Typography.interfaceBody()).foregroundStyle(palette.warning)
            }
            Text("方案匹配").font(AppTheme.Typography.metadata(weight: .semibold)).foregroundStyle(palette.muted)
            ForEach(proposal.candidateAssignments(employees: employeeStore.employees)) { candidate in
                HStack(spacing: 10) {
                    CreamAvatar(path: candidate.avatarPath, name: candidate.name, size: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(candidate.name).font(AppTheme.Typography.interfaceBody(weight: .medium)).foregroundStyle(palette.ink)
                        Text("\(candidate.role) · \(candidate.goal)")
                            .font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.lg).stroke(palette.hairlineSoft) }
    }

    private func proposalRecoveryCard(message: String) -> some View {
        proposalRetryCard(
            title: "需要重新匹配",
            systemImage: "arrow.triangle.2.circlepath",
            message: message
        )
    }

    private func proposalFailureCard(message: String, code _: String) -> some View {
        proposalRetryCard(
            title: "方案未生成",
            systemImage: "exclamationmark.triangle",
            message: message
        )
    }

    private func proposalRetryCard(title: String, systemImage: String, message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(AppTheme.Typography.interfaceBody(weight: .semibold)).foregroundStyle(palette.ink)
            Text(message).font(AppTheme.Typography.interfaceBody()).foregroundStyle(palette.body)
            Button("重新生成方案", action: store.regenerateProposal)
                .buttonStyle(CreamPrimaryButtonStyle())
                .disabled(store.isSubmitting)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.lg).stroke(palette.hairlineSoft) }
    }

    private func proposalLoadingCard() -> some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text("正在匹配员工…").font(AppTheme.Typography.interfaceBody(weight: .medium)).foregroundStyle(palette.body)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.lg).stroke(palette.hairlineSoft) }
    }

    private func roomHeader(_ thread: TaskThreadProjection, showsBack: Bool, layout: ResolvedLayout) -> some View {
        let participantSummary = thread.room.participants.isEmpty ? "尚未匹配员工" : "\(thread.room.participants.count) 位员工"
        return HStack(spacing: 12) {
            if showsBack {
                Button {
                    compactShowsRoom = false
                } label: {
                    Image(systemName: "chevron.left")
                }
                .buttonStyle(.plain)
                .foregroundStyle(palette.body)
                .help("返回工作列表")
                .accessibilityLabel("返回工作列表")
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(thread.title).font(AppTheme.Typography.workspaceTitle).foregroundStyle(palette.ink)
                HStack(spacing: -5) {
                    ForEach(thread.room.participants.prefix(5)) { participant in
                        CreamAvatar(path: participant.avatarPath, name: participant.name, size: 24)
                            .overlay(Circle().stroke(palette.canvas, lineWidth: 2))
                    }
                    Text("\(participantSummary) · \(statusLabel(thread.status))")
                        .font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted).padding(.leading, 10)
                }
            }
            Spacer()
            if layout.inspectorAvailable {
                Button { inspectorPreferred.toggle() } label: {
                    Image(systemName: "sidebar.trailing")
                }
                .buttonStyle(.plain)
                .help(layout.showsInspector ? "隐藏任务详情" : "显示任务详情")
                .accessibilityLabel(layout.showsInspector ? "隐藏任务详情" : "显示任务详情")
            }
        }
        .padding(.horizontal, layout.isCompact ? 16 : 20).padding(.vertical, 12)
    }

    @ViewBuilder
    private func timelineItem(_ item: TaskRoomTimelineItem, thread: TaskThreadProjection) -> some View {
        if item.role == "user" {
            CreamTimelineUserMessage(
                text: item.content,
                metadata: TaskPresentation.time(item.createdAt)
            )
        } else if item.role == "agent" {
            CreamTimelineAgentRow(
                employeeName: item.agentName ?? "员工",
                employeeAvatarPath: item.avatarPath,
                metadata: TaskPresentation.time(item.createdAt),
                copyText: item.content
            ) {
                CreamTimelineMarkdownBody(source: item.content)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if ["approval", "handoff", "deliverable", "activity"].contains(item.kind) {
            runtimeCard(item, thread: thread)
        } else {
            HStack {
                Spacer()
                Label(systemLabel(item), systemImage: systemIcon(item.kind))
                    .font(.caption).foregroundStyle(palette.muted)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(palette.surfaceCard, in: Capsule())
                Spacer()
            }
        }
    }

    private func runtimeCard(_ item: TaskRoomTimelineItem, thread: TaskThreadProjection) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 9) {
                Label(cardTitle(item), systemImage: systemIcon(item.kind))
                    .font(AppTheme.Typography.interfaceBody(weight: .semibold)).foregroundStyle(palette.ink)
                Text(cardContent(item))
                    .font(AppTheme.Typography.interfaceBody())
                    .foregroundStyle(palette.body)
                    .lineSpacing(4)
                    .textSelection(.enabled)
                if item.kind == "approval", item.status == "pending",
                   let execution = thread.execution,
                   let work = execution.workOrders.first(where: { $0.actionID == item.actionID }) {
                    HStack(spacing: 8) {
                        Button("批准") { store.resolveApproval(for: work, in: execution, approve: true) }
                            .buttonStyle(.borderedProminent)
                        Button("拒绝") { store.resolveApproval(for: work, in: execution, approve: false) }
                            .buttonStyle(.bordered)
                    }
                    .disabled(store.isResolvingApproval(for: work))
                }
                if let uri = item.artifactURI {
                    Button("在 Finder 中显示") { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: uri)]) }
                        .buttonStyle(.link)
                }
            }
            .padding(14)
            .frame(maxWidth: 650, alignment: .leading)
            .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12).stroke(palette.hairlineSoft) }
            Spacer(minLength: 40)
        }
    }

    private func composer(_ thread: TaskThreadProjection, layout: ResolvedLayout) -> some View {
        CreamComposer(
            composerPlaceholder(thread),
            text: $roomDraft,
            accessibilityLabel: thread.status == "awaiting_input" ? "补充任务信息" : "任务执行状态输入区",
            size: .regular,
            maxWidth: AppLayoutProfile.work.primary.maxWidth,
            isInputEnabled: canSendMessage(thread),
            actionState: store.isSubmitting ? .loading : .submit,
            isActionEnabled: canSubmit(thread),
            actionHelp: store.isSubmitting ? "正在发送任务消息" : "发送任务消息",
            onAction: sendRoomMessage,
            leadingActions: { EmptyView() },
            status: { EmptyView() }
        )
        .padding(.horizontal, layout.isCompact ? 16 : AppTheme.Spacing.lg)
        .padding(.bottom, AppTheme.Spacing.md)
    }

    private func canSubmit(_ thread: TaskThreadProjection) -> Bool {
        canSendMessage(thread) && !roomDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func sendRoomMessage() {
        guard let thread = store.activeThread, canSubmit(thread) else { return }
        let value = roomDraft
        store.sendTaskRoomMessage(value)
        roomDraft = ""
    }

    private func composerPlaceholder(_ thread: TaskThreadProjection) -> String {
        if ["drafting", "awaiting_input"].contains(thread.status) { return "补充任务所需信息…" }
        if thread.execution?.workOrders.contains(where: { $0.runPhase == "waiting_user" }) == true { return "回复当前员工的问题…" }
        return "员工执行中；需要操作时会在这里提问"
    }

    private func canSendMessage(_ thread: TaskThreadProjection) -> Bool {
        guard proposalStateAllowsRoomInput, !store.isSubmitting, thread.archivedAt == nil else { return false }
        return ["drafting", "awaiting_input"].contains(thread.status)
            || thread.execution?.workOrders.contains(where: { $0.runPhase == "waiting_user" }) == true
    }

    private var proposalStateAllowsRoomInput: Bool {
        switch store.proposalState {
        case .recoverable, .failed, .restoring, .generating:
            return false
        case .idle, .review:
            return true
        }
    }

    private func inspector(_ thread: TaskThreadProjection) -> some View {
        let candidateAssignments = inspectorCandidateAssignments(for: thread)
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 9) {
                    HStack {
                        Text("任务进度").font(AppTheme.Typography.workspaceTitle).foregroundStyle(palette.ink)
                        Spacer()
                        Text(overallProgressLabel(thread))
                            .font(AppTheme.Typography.metadata(weight: .semibold).monospacedDigit())
                            .foregroundStyle(palette.muted)
                    }
                    if let progress = overallProgress(thread) {
                        CreamProgressBar(value: progress)
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text(candidateAssignments.isEmpty ? "参与员工" : "拟参与员工")
                        .font(AppTheme.Typography.metadata(weight: .semibold)).foregroundStyle(palette.muted)
                    if thread.room.participants.isEmpty {
                        if candidateAssignments.isEmpty {
                            Text("尚未匹配员工")
                                .font(AppTheme.Typography.interfaceBody(weight: .medium)).foregroundStyle(palette.ink)
                            Text("方案生成后将在这里显示")
                                .font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted)
                        } else {
                            ForEach(candidateAssignments) { candidate in
                                HStack(spacing: 10) {
                                    CreamAvatar(path: candidate.avatarPath, name: candidate.name, size: 34)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(candidate.name)
                                            .font(AppTheme.Typography.interfaceBody(weight: .medium)).foregroundStyle(palette.ink).lineLimit(1)
                                        Text(candidate.role)
                                            .font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted).lineLimit(1)
                                    }
                                    Spacer(minLength: 6)
                                    Text("待确认")
                                        .font(AppTheme.Typography.compactMetadata(weight: .medium))
                                        .foregroundStyle(palette.warning)
                                }
                            }
                        }
                    } else {
                        ForEach(thread.room.participants) { participant in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 10) {
                                    CreamAvatar(path: participant.avatarPath, name: participant.name, size: 34)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(participant.name).font(AppTheme.Typography.interfaceBody(weight: .medium)).foregroundStyle(palette.ink).lineLimit(1)
                                        Text(participant.role).font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted).lineLimit(1)
                                    }
                                    Spacer(minLength: 6)
                                    Text(statusLabel(participantStatus(participant, in: thread)))
                                        .font(AppTheme.Typography.compactMetadata(weight: .medium))
                                        .foregroundStyle(statusColor(participantStatus(participant, in: thread)))
                                }
                                if let progress = participantProgress(participant, in: thread) {
                                    CreamProgressBar(value: progress)
                                }
                            }
                        }
                    }
                }
            }
            .padding(20)
        }
        .frame(minWidth: 220, idealWidth: 240, maxWidth: 270)
        .background(palette.surfaceCard.opacity(0.32))
    }

    private func inspectorCandidateAssignments(for thread: TaskThreadProjection) -> [TaskProposalCandidateAssignment] {
        guard thread.room.participants.isEmpty,
              case .review(let proposal) = store.proposalState,
              proposal.threadID == thread.id else { return [] }
        return proposal.candidateAssignments(employees: employeeStore.employees)
    }

    private func systemLabel(_ item: TaskRoomTimelineItem) -> String {
        switch item.kind {
        case "proposal": "系统提出方案：\(item.content)"
        case "confirmation": "已确认执行"
        default: item.content
        }
    }

    private func cardTitle(_ item: TaskRoomTimelineItem) -> String {
        switch item.kind {
        case "approval": item.status == "pending" ? "等待你的批准" : "操作审批 · \(statusLabel(item.status ?? ""))"
        case "handoff": "员工交接 · \(statusLabel(item.status ?? ""))"
        case "deliverable": "最终交付"
        default: item.agentName.map { "\($0) 正在执行" } ?? "执行进展"
        }
    }

    private func cardContent(_ item: TaskRoomTimelineItem) -> String {
        guard item.kind == "approval", let action = item.action else { return item.content }
        let actionName = ["search_web": "搜索网页", "create_file": "创建文件", "edit_file": "编辑文件", "read_file": "读取文件"][action] ?? action
        return item.status == "pending" ? "\(item.agentName ?? "员工") 请求执行：\(actionName)" : "\(actionName) · \(statusLabel(item.status ?? ""))"
    }

    private func participantStatus(_ participant: TaskRoomParticipant, in thread: TaskThreadProjection) -> String {
        thread.execution?.workOrders.first(where: { $0.assigneeAgentID == participant.agentID })?.status ?? participant.status
    }

    private func participantProgress(_ participant: TaskRoomParticipant, in thread: TaskThreadProjection) -> Double? {
        guard let works = thread.execution?.workOrders.filter({ $0.assigneeAgentID == participant.agentID }), !works.isEmpty else { return nil }
        return Double(works.filter(isCompletedWork).count) / Double(works.count)
    }

    private func overallProgress(_ thread: TaskThreadProjection) -> Double? {
        guard let works = thread.execution?.workOrders, !works.isEmpty else { return nil }
        return Double(works.filter(isCompletedWork).count) / Double(works.count)
    }

    private func overallProgressLabel(_ thread: TaskThreadProjection) -> String {
        guard let works = thread.execution?.workOrders, !works.isEmpty else { return "尚未编排" }
        return "\(works.filter(isCompletedWork).count) / \(works.count)"
    }

    private func isCompletedWork(_ work: WorkOrderProjection) -> Bool {
        ["succeeded", "failed", "cancelled"].contains(work.status)
    }

    private func systemIcon(_ kind: String) -> String {
        ["approval": "checkmark.shield", "handoff": "arrow.right.arrow.left", "deliverable": "doc.badge.checkmark", "activity": "gearshape.2", "proposal": "list.bullet.clipboard", "error": "exclamationmark.triangle"][kind] ?? "checkmark.circle"
    }

    private func statusLabel(_ status: String) -> String {
        ["drafting": "草拟中", "awaiting_input": "等待补充", "awaiting_confirmation": "等待确认", "pending": "等待开始", "running": "执行中", "waiting_dependency": "等待依赖", "waiting_approval": "等待审批", "approved": "已批准", "rejected": "已拒绝", "accepted": "已交接", "verified": "已验证", "started": "已开始", "succeeded": "已完成", "failed": "失败", "cancelled": "已取消"].first(where: { $0.key == status })?.value ?? status
    }

    private func statusColor(_ status: String) -> Color {
        status == "succeeded" ? palette.success : status == "failed" ? palette.error : palette.primary
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct TaskThreadSidebarRow: View {
    let thread: TaskThreadProjection
    let isSelected: Bool
    let select: () -> Void
    let archive: () -> Void
    let restore: () -> Void
    let delete: () -> Void
    @State private var isHovered = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: select) {
            VStack(alignment: .leading, spacing: 4) {
                Text(thread.title)
                    .font(AppTheme.Typography.sidebarTitle())
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Circle().fill(statusColor).frame(width: 6, height: 6)
                    Text(statusLabel).font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted)
                    if let latest = thread.room.items.last?.content {
                        Text("· \(latest)").font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted).lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .creamSidebarRowSurface(isSelected: isSelected, isHovered: isHovered)
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .animation(AppTheme.Motion.hoverReveal, value: isHovered)
        .contextMenu {
            if thread.archivedAt == nil {
                Button("归档", systemImage: "archivebox", action: archive)
            } else {
                Button("恢复到当前", systemImage: "tray.and.arrow.up", action: restore)
                Divider()
                Button("删除记录", systemImage: "trash", role: .destructive, action: delete)
            }
        }
    }

    private var statusLabel: String {
        ["drafting": "草拟中", "awaiting_input": "等待补充", "awaiting_confirmation": "等待确认", "pending": "等待开始", "running": "执行中", "succeeded": "已完成", "failed": "失败", "cancelled": "已取消"][thread.status] ?? thread.status
    }

    private var statusColor: Color {
        thread.status == "succeeded" ? palette.success : thread.status == "failed" ? palette.error : palette.primary
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
