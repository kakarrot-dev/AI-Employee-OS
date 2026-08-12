import AppKit
import SwiftUI

struct TaskThreadWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @Environment(\.colorScheme) private var colorScheme
    @State private var showsInspector = true
    @State private var roomDraft = ""
    @State private var pendingDeletion: TaskThreadProjection?
    @FocusState private var composerFocused: Bool

    var body: some View {
        HSplitView {
            threadList
            if let thread = store.activeThread {
                HSplitView {
                    taskRoom(thread)
                    if showsInspector { inspector(thread) }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                emptyDetail
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

    private var threadList: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 2) {
                    ForEach(store.taskThreads) { thread in
                        TaskThreadSidebarRow(
                            thread: thread,
                            isSelected: store.activeThread?.id == thread.id,
                            select: { store.selectThread(thread) },
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
        .frame(minWidth: 210, idealWidth: 236, maxWidth: 270, maxHeight: .infinity)
    }

    private var emptyDetail: some View {
        ContentUnavailableView(
            "还没有工作",
            systemImage: "tray",
            description: Text("在办公室描述目标后，Task 会持续保存在这里。")
        )
        .frame(minWidth: 480, maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.canvas)
    }

    private func taskRoom(_ thread: TaskThreadProjection) -> some View {
        VStack(spacing: 0) {
            roomHeader(thread)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                    if let proposal = store.activeProposal,
                       proposal.threadID == thread.id,
                       store.awaitingWorkConfirmation {
                        proposalReview(proposal)
                    }
                    ForEach(thread.room.items) { item in timelineItem(item, thread: thread) }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 22)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
            composer(thread)
        }
        .frame(minWidth: 500)
    }

    private func proposalReview(_ response: TaskProposalResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("执行方案", systemImage: "list.bullet.clipboard")
                        .font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                    Text(response.proposal.intent == "multi_agent_task" ? "多员工协作 · \(response.proposal.assignments.count) 个分工" : "单员工执行")
                        .font(.caption).foregroundStyle(palette.muted)
                }
                Spacer()
                Button("返回修改", action: store.cancelWorkConfirmation).buttonStyle(CreamSecondaryButtonStyle())
                Button("确认执行", action: store.confirmAndRun)
                    .buttonStyle(CreamPrimaryButtonStyle())
                    .disabled(store.isSubmitting || response.proposal.missingInputs.contains(where: \.required))
            }
            ForEach(response.proposal.missingInputs, id: \.key) { item in
                Label(item.question, systemImage: "questionmark.circle")
                    .font(.callout).foregroundStyle(palette.warning)
            }
            ForEach(response.proposal.assignments, id: \.nodeID) { assignment in
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    Image(systemName: assignment.role == "finalizer" ? "checkmark.seal" : "person.crop.circle")
                        .foregroundStyle(palette.primary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(assignment.goal).font(.callout).foregroundStyle(palette.body)
                        Text(assignment.employeeSelector.preferredID ?? "由 Runtime 按能力匹配")
                            .font(.caption2).foregroundStyle(palette.mutedSoft)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.lg).stroke(palette.hairlineSoft) }
    }

    private func roomHeader(_ thread: TaskThreadProjection) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(thread.title).font(.headline).foregroundStyle(palette.ink)
                HStack(spacing: -5) {
                    ForEach(thread.room.participants.prefix(5)) { participant in
                        CreamAvatar(path: participant.avatarPath, name: participant.name, size: 24)
                            .overlay(Circle().stroke(palette.canvas, lineWidth: 2))
                    }
                    Text("\(thread.room.participants.count) 位员工 · \(statusLabel(thread.status))")
                        .font(.caption).foregroundStyle(palette.muted).padding(.leading, 10)
                }
            }
            Spacer()
            Button { showsInspector.toggle() } label: {
                Image(systemName: "sidebar.trailing")
            }
            .buttonStyle(.plain)
            .help(showsInspector ? "隐藏任务详情" : "显示任务详情")
            .accessibilityLabel(showsInspector ? "隐藏任务详情" : "显示任务详情")
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
    }

    @ViewBuilder
    private func timelineItem(_ item: TaskRoomTimelineItem, thread: TaskThreadProjection) -> some View {
        if item.role == "user" {
            UserMessageBlock(text: item.content, createdAt: item.createdAt)
        } else if item.role == "agent" {
            AgentTimelineBlock(
                employeeName: item.agentName ?? "员工",
                employeeAvatarPath: item.avatarPath,
                metadata: TaskPresentation.time(item.createdAt)
            ) {
                ChatMarkdownBody(source: item.content)
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
                    .font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                Text(cardContent(item)).font(.callout).foregroundStyle(palette.body).textSelection(.enabled)
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

    private func composer(_ thread: TaskThreadProjection) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField(composerPlaceholder(thread), text: $roomDraft, axis: .vertical)
                .textFieldStyle(.plain).font(.body).lineLimit(1...6)
                .frame(minHeight: 36, alignment: .topLeading)
                .focused($composerFocused)
                .onSubmit { sendRoomMessage() }
                .disabled(!canSendMessage(thread) || thread.archivedAt != nil)
            HStack(spacing: 8) {
                Image(systemName: "plus").foregroundStyle(palette.muted).frame(width: 28, height: 28)
                Spacer()
                Text("Enter 发送 · Shift+Enter 换行").font(.caption2).foregroundStyle(palette.mutedSoft)
                Button(action: sendRoomMessage) {
                    Image(systemName: "arrow.up").font(.callout.weight(.bold))
                        .foregroundStyle(canSubmit(thread) ? palette.surfaceCard : palette.mutedSoft)
                        .frame(width: 32, height: 32)
                        .background(canSubmit(thread) ? palette.ink : palette.hairlineSoft, in: Circle())
                }
                .buttonStyle(.plain).disabled(!canSubmit(thread)).accessibilityLabel("发送任务消息")
            }
        }
        .padding(.horizontal, AppTheme.Spacing.md).padding(.top, AppTheme.Spacing.md).padding(.bottom, AppTheme.Spacing.xs)
        .creamFloatingComposer(focused: composerFocused)
        .padding(.horizontal, AppTheme.Spacing.lg).padding(.bottom, AppTheme.Spacing.md)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(thread.status == "awaiting_input" ? "补充任务信息" : "任务执行状态输入区")
    }

    private func canSubmit(_ thread: TaskThreadProjection) -> Bool {
        canSendMessage(thread) && thread.archivedAt == nil && !store.isSubmitting
            && !roomDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func sendRoomMessage() {
        let value = roomDraft
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        store.sendTaskRoomMessage(value)
        roomDraft = ""
    }

    private func composerPlaceholder(_ thread: TaskThreadProjection) -> String {
        if ["drafting", "awaiting_input"].contains(thread.status) { return "补充任务所需信息…" }
        if thread.execution?.workOrders.contains(where: { $0.runPhase == "waiting_user" }) == true { return "回复当前员工的问题…" }
        return "员工执行中；需要操作时会在这里提问"
    }

    private func canSendMessage(_ thread: TaskThreadProjection) -> Bool {
        ["drafting", "awaiting_input"].contains(thread.status)
            || thread.execution?.workOrders.contains(where: { $0.runPhase == "waiting_user" }) == true
    }

    private func inspector(_ thread: TaskThreadProjection) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 9) {
                    HStack {
                        Text("任务进度").font(.headline).foregroundStyle(palette.ink)
                        Spacer()
                        Text(overallProgressLabel(thread))
                            .font(.caption.monospacedDigit().weight(.semibold))
                            .foregroundStyle(palette.muted)
                    }
                    if let progress = overallProgress(thread) {
                        CreamProgressBar(value: progress)
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("参与员工").font(.caption.weight(.semibold)).foregroundStyle(palette.muted)
                    ForEach(thread.room.participants) { participant in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 10) {
                                CreamAvatar(path: participant.avatarPath, name: participant.name, size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(participant.name).font(.callout.weight(.medium)).foregroundStyle(palette.ink).lineLimit(1)
                                    Text(participant.role).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                                }
                                Spacer(minLength: 6)
                                Text(statusLabel(participantStatus(participant, in: thread)))
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(statusColor(participantStatus(participant, in: thread)))
                            }
                            if let progress = participantProgress(participant, in: thread) {
                                CreamProgressBar(value: progress)
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
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Circle().fill(statusColor).frame(width: 6, height: 6)
                    Text(statusLabel).font(.caption2).foregroundStyle(palette.muted)
                    if let latest = thread.room.items.last?.content {
                        Text("· \(latest)").font(.caption2).foregroundStyle(palette.muted).lineLimit(1)
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
        .animation(.easeOut(duration: AppTheme.Motion.fast), value: isHovered)
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
