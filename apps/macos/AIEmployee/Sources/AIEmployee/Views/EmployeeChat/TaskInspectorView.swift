import SwiftUI

struct TaskInspectorView: View {
    let run: TaskRun?
    @ObservedObject var store: TaskStore
    let employeeName: String

    @State private var diagnosticsExpanded = false
    @State private var technicalDetailsExpanded = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let run {
                    currentWork(run)
                    inspectorDivider
                    plan(run)

                    if run.deliverableStatus == "verified",
                       let path = run.verifiedArtifactPath ?? run.response?.artifactPath ?? run.artifactPath {
                        inspectorDivider
                        deliverable(run, path: path)
                    }

                    inspectorDivider
                    diagnostics(run)
                } else {
                    ContentUnavailableView(
                        "暂无工作",
                        systemImage: "checkmark.circle",
                        description: Text("开始一项工作后，这里会显示实时进度与运行状态。")
                    )
                    .padding(AppTheme.Spacing.lg)
                }
            }
        }
        .background(palette.surfaceSoft)
    }

    private func currentWork(_ run: TaskRun) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack(alignment: .center, spacing: AppTheme.Spacing.sm) {
                inspectorTitle("当前工作")
                Spacer()
                statusBadge(run)
            }

            Text(run.input)
                .font(.callout.weight(.semibold))
                .foregroundStyle(palette.ink)
                .lineLimit(4)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(currentStateText(run))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(currentStateColor(run))
                Text("最近更新 \(TaskPresentation.time(latestUpdate(run)))")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(palette.muted)
            }

            if run.runPhase == "waiting_approval" {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Button("拒绝") { store.resolveApproval(for: run, approve: false) }
                    Button(store.isResolvingApproval(for: run) ? "处理中…" : "批准并继续") {
                        store.resolveApproval(for: run, approve: true)
                    }
                        .buttonStyle(.borderedProminent)
                }
                .disabled(store.isResolvingApproval(for: run))
                .padding(.top, AppTheme.Spacing.xs)
            }

            if run.runPhase == "waiting_user" {
                Text(run.waitingReason ?? "请在对话中补充执行所需的信息。")
                    .font(.caption)
                    .foregroundStyle(palette.warning)
                    .padding(.top, AppTheme.Spacing.xs)
            }

            if let unknown = run.actions.first(where: { $0.status == "result_unknown" }) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("工具结果无法自动确认，Runtime 不会自动重试。请核验实际结果后再继续。")
                        .font(.caption)
                        .foregroundStyle(palette.warning)
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Button("核验为失败") { store.resolveUnknown(unknown.actionID, for: run, succeeded: false) }
                        Button("核验为成功") { store.resolveUnknown(unknown.actionID, for: run, succeeded: true) }
                    }
                }
                .padding(.top, AppTheme.Spacing.xs)
            }
        }
        .padding(AppTheme.Spacing.md)
    }

    private func plan(_ run: TaskRun) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack {
                inspectorTitle("工作计划")
                Spacer()
                if !run.actions.isEmpty {
                    Text("\(completedPlanCount(run)) / \(planStepCount(run))")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.muted)
                }
            }

            if run.actions.isEmpty {
                HStack(spacing: AppTheme.Spacing.sm) {
                    if run.status == .running || run.status == .pending {
                        ProgressView().controlSize(.small).tint(palette.accentTeal)
                    } else {
                        Image(systemName: "minus.circle").foregroundStyle(palette.mutedSoft)
                    }
                    Text(run.status == .running || run.status == .pending
                         ? "正在制定执行计划"
                         : "本次工作没有生成工具执行步骤")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(run.actions.enumerated()), id: \.element.id) { index, node in
                        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                            VStack(spacing: 0) {
                                Image(systemName: stepSymbol(node.status))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(stepColor(node.status))
                                    .frame(width: 16, height: 18)
                                if index < run.actions.count {
                                    Rectangle()
                                        .fill(node.status == "succeeded" ? palette.success.opacity(0.46) : palette.hairline)
                                        .frame(width: 1, height: 30)
                                }
                            }
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                Text(TaskPresentation.actionTitle(node.stepID))
                                    .font(.caption.weight(node.status == "running" || node.status == "blocked" ? .semibold : .medium))
                                    .foregroundStyle(node.status == "pending" ? palette.muted : palette.body)
                                Text(TaskPresentation.actionStatus(node.status))
                                    .font(.caption2)
                                    .foregroundStyle(stepColor(node.status))
                                if !node.outputAs.isEmpty {
                                    Text(node.outputAs)
                                        .font(.caption2)
                                        .foregroundStyle(palette.muted)
                                        .lineLimit(2)
                                }
                            }
                            .padding(.top, 1)
                            Spacer(minLength: 0)
                        }
                    }
                    planFinalizationStep(run)
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }

    private func planFinalizationStep(_ run: TaskRun) -> some View {
        let status = finalizationStatus(run)
        return HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            VStack(spacing: 0) {
                Image(systemName: stepSymbol(status))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(stepColor(status))
                    .frame(width: 16, height: 18)
            }
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text("整理结果并回复")
                    .font(.caption.weight(status == "running" ? .semibold : .medium))
                    .foregroundStyle(status == "pending" ? palette.muted : palette.body)
                Text(TaskPresentation.actionStatus(status))
                    .font(.caption2)
                    .foregroundStyle(stepColor(status))
            }
            .padding(.top, 1)
            Spacer(minLength: 0)
        }
    }

    private func deliverable(_ run: TaskRun, path: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            inspectorTitle("交付物")
            Label(run.deliverableTitle ?? "已验证交付物", systemImage: "doc.text.fill")
                .font(.callout.weight(.medium))
                .foregroundStyle(palette.ink)
            if let evaluation = run.response?.evaluation ?? run.evaluation {
                Text(evaluation.deliveryAllowed ? "运行时检查通过" : "未达到交付门槛")
                    .font(.caption)
                    .foregroundStyle(evaluation.deliveryAllowed ? palette.success : palette.warning)
            }
            Text(URL(fileURLWithPath: path).lastPathComponent)
                .font(.caption.monospaced())
                .foregroundStyle(palette.muted)
                .lineLimit(1)
        }
        .padding(AppTheme.Spacing.md)
    }

    private func diagnostics(_ run: TaskRun) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            DisclosureGroup(isExpanded: $diagnosticsExpanded) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    diagnosticRow("当前阶段", value: TaskPresentation.runPhase(run.runPhase ?? "unknown", waitingReason: run.waitingReason))
                    diagnosticRow("最近更新", value: TaskPresentation.time(latestUpdate(run)))
                    if let skillID = run.skillID {
                        diagnosticRow("使用能力", value: skillName(skillID, version: run.skillVersion))
                    } else if !run.skillIDs.isEmpty {
                        diagnosticRow("使用能力", value: run.skillIDs.map { skillName($0, version: nil) }.joined(separator: "、"))
                    }
                    if let action = activeAction(run) {
                        diagnosticRow("当前工具", value: TaskPresentation.actionTitle(action.stepID))
                    }

                    DisclosureGroup("技术详情", isExpanded: $technicalDetailsExpanded) {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            technicalRow("Task ID", value: run.id)
                            if let runID = run.runID { technicalRow("Run ID", value: runID) }
                            if let phase = run.runPhase { technicalRow("Run Phase", value: phase) }
                            if let reason = run.stopReason { technicalRow("Stop Reason", value: reason) }
                            technicalRow("Events", value: "\(run.events.count)")
                        }
                        .padding(.top, AppTheme.Spacing.xs)
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(palette.muted)
                }
                .padding(.top, AppTheme.Spacing.sm)
            } label: {
                HStack(spacing: AppTheme.Spacing.sm) {
                    inspectorTitle("运行诊断")
                    Spacer()
                    Label(diagnosticStatus(run).title, systemImage: diagnosticStatus(run).symbol)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(diagnosticStatus(run).color)
                }
            }

            if diagnosticStatus(run).needsAttention {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text(diagnosticSummary(run))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(palette.body)
                    Text(diagnosticSuggestion(run))
                        .font(.caption2)
                        .foregroundStyle(palette.muted)
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }

    private func statusBadge(_ run: TaskRun) -> some View {
        Label(
            run.status == .running ? "\(employeeName) 正在处理" : run.status.title,
            systemImage: run.status.systemImage
        )
            .font(.caption.weight(.medium))
            .foregroundStyle(statusColor(run.status))
    }

    private func diagnosticRow(_ label: String, value: String) -> some View {
        LabeledContent(label, value: value)
            .font(.caption)
            .foregroundStyle(palette.body)
    }

    private func technicalRow(_ label: String, value: String) -> some View {
        LabeledContent(label, value: value)
            .font(.caption2.monospaced())
            .foregroundStyle(palette.muted)
            .textSelection(.enabled)
    }

    private var inspectorDivider: some View {
        Divider().overlay(palette.hairlineSoft)
    }

    private func inspectorTitle(_ text: String) -> some View {
        Text(text).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
    }

    private func latestUpdate(_ run: TaskRun) -> String {
        run.updatedAt ?? run.events.last?.occurredAt ?? run.createdAt
    }

    private func activeAction(_ run: TaskRun) -> GraphNodeEvidence? {
        run.actions.first { ["running", "blocked", "result_unknown"].contains($0.status) }
            ?? run.actions.first { $0.status == "pending" }
    }

    private func completedCount(_ run: TaskRun) -> Int {
        run.actions.filter { $0.status == "succeeded" }.count
    }

    private func planStepCount(_ run: TaskRun) -> Int { run.actions.count + 1 }

    private func completedPlanCount(_ run: TaskRun) -> Int {
        completedCount(run) + (run.status == .succeeded ? 1 : 0)
    }

    private func finalizationStatus(_ run: TaskRun) -> String {
        switch run.status {
        case .succeeded: "succeeded"
        case .failed: "failed"
        case .cancelled: "cancelled"
        case .running where run.actions.allSatisfy({ $0.status == "succeeded" }): "running"
        default: "pending"
        }
    }

    private func currentStateText(_ run: TaskRun) -> String {
        if run.isCancellationRequested { return "正在安全停止" }
        if let action = activeAction(run), run.status == .running {
            return "\(TaskPresentation.runPhase(run.runPhase ?? "executing", waitingReason: run.waitingReason)) · \(TaskPresentation.actionTitle(action.stepID))"
        }
        return TaskPresentation.runPhase(run.runPhase ?? run.status.rawValue, waitingReason: run.waitingReason)
    }

    private func currentStateColor(_ run: TaskRun) -> Color {
        if run.runPhase == "waiting_approval" || run.runPhase == "waiting_user" { return palette.warning }
        return statusColor(run.status)
    }

    private func stepSymbol(_ status: String) -> String {
        switch status {
        case "succeeded": "checkmark.circle.fill"
        case "running": "circle.inset.filled"
        case "failed", "result_unknown": "exclamationmark.circle.fill"
        case "blocked": "lock.circle.fill"
        case "cancelled": "xmark.circle"
        default: "circle"
        }
    }

    private func stepColor(_ status: String) -> Color {
        switch status {
        case "succeeded": palette.success
        case "running": palette.accentTeal
        case "failed", "result_unknown": palette.error
        case "blocked": palette.warning
        default: palette.mutedSoft
        }
    }

    private func statusColor(_ status: TaskRunStatus) -> Color {
        switch status {
        case .succeeded: palette.success
        case .failed: palette.error
        case .running: palette.accentTeal
        case .pending, .cancelled: palette.muted
        }
    }

    private func skillName(_ id: String, version: String?) -> String {
        let name = switch id {
        case "web-search": "网络搜索"
        case "local-file-operations": "本地文件操作"
        default: id
        }
        return version.map { "\(name) · \($0)" } ?? name
    }

    private func diagnosticStatus(_ run: TaskRun) -> (title: String, symbol: String, color: Color, needsAttention: Bool) {
        if run.actions.contains(where: { $0.status == "result_unknown" }) {
            return ("需要核验", "questionmark.circle.fill", palette.warning, true)
        }
        if run.status == .failed {
            return ("需要处理", "exclamationmark.triangle.fill", palette.error, true)
        }
        if run.runPhase == "waiting_approval" || run.runPhase == "waiting_user" {
            return ("等待你处理", "person.crop.circle.badge.exclamationmark", palette.warning, true)
        }
        return ("运行正常", "checkmark.circle.fill", palette.success, false)
    }

    private func diagnosticSummary(_ run: TaskRun) -> String {
        if run.actions.contains(where: { $0.status == "result_unknown" }) { return "工具执行结果尚未确认" }
        if run.runPhase == "waiting_approval" { return "工作正在等待权限批准" }
        if run.runPhase == "waiting_user" { return "工作需要你补充信息" }
        if run.stopReason?.contains("decision_schema_invalid") == true { return "执行结果格式不符合 Runtime 协议" }
        if run.stopReason?.contains("worker_disconnect") == true { return "执行进程未能正常返回结果" }
        return "这项工作未能完成"
    }

    private func diagnosticSuggestion(_ run: TaskRun) -> String {
        if run.actions.contains(where: { $0.status == "result_unknown" }) { return "请核验实际副作用，Runtime 不会自动重试。" }
        if run.runPhase == "waiting_approval" { return "检查影响范围后批准或拒绝。" }
        if run.runPhase == "waiting_user" { return "请回到对话中回答员工提出的问题。" }
        return "请重新发起这项工作；若持续失败，可展开并复制技术详情。"
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
