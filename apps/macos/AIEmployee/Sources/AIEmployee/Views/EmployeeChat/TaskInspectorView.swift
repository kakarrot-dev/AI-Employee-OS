import SwiftUI

struct TaskInspectorView: View {
    let run: TaskRun?
    let employee: Employee?
    @ObservedObject var store: TaskStore

    @State private var diagnosticsExpanded = false
    @Environment(\.colorScheme) private var colorScheme

    private var employeeName: String { employee?.name ?? run.map { displayName(for: $0.agentID) } ?? "员工" }
    private var employeeRole: String { employee?.role ?? "AI 员工" }
    private var employeeDepartment: String { employee?.department ?? "" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                inspectorHeader
                inspectorDivider

                if let run {
                    currentWork(run)
                    inspectorDivider
                    plan(run)

                    if run.deliverableStatus == "verified", let path = run.verifiedArtifactPath ?? run.response?.artifactPath ?? run.artifactPath {
                        inspectorDivider
                        deliverable(run, path: path)
                    }

                    inspectorDivider
                    diagnostics(run)
                } else {
                    Text("\(employeeName) 当前没有正在处理的工作。")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                        .padding(AppTheme.Spacing.md)
                }
            }
        }
        .background(palette.surfaceSoft)
    }

    private var inspectorHeader: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            Text(employeeName).font(.headline)
            Text(employeeDepartment.isEmpty ? employeeRole : "\(employeeRole) · \(employeeDepartment)")
                .font(.caption)
                .foregroundStyle(palette.muted)
            if let agentID = run?.agentID ?? employee?.id {
                Text(agentID)
                    .font(.caption2.monospaced())
                    .foregroundStyle(palette.mutedSoft)
            }
        }
        .padding(AppTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func displayName(for agentID: String) -> String {
        agentID == "ai-product-manager" ? "Alex" : agentID
    }

    private func currentWork(_ run: TaskRun) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            inspectorTitle("当前工作")
            Text(run.input)
                .font(.callout.weight(.medium))
                .foregroundStyle(palette.ink)
                .lineLimit(4)
            Label(run.status.title, systemImage: run.status.systemImage)
                .font(.caption)
                .foregroundStyle(statusColor(run.status))
            if let phase = run.runPhase {
                Text(TaskPresentation.runPhase(phase, waitingReason: run.waitingReason))
                    .font(.caption)
                    .foregroundStyle(phase == "waiting_approval" || phase == "waiting_user" ? palette.warning : palette.muted)
            }
            if run.runPhase == "waiting_approval" {
                HStack {
                    Button("拒绝") { store.resolveApproval(for: run, approve: false) }
                    Button("批准并继续") { store.resolveApproval(for: run, approve: true) }
                        .buttonStyle(.borderedProminent)
                }
            }
            if let unknown = run.actions.first(where: { $0.status == "result_unknown" }) {
                Text("工具结果无法自动确认，请人工核验后收敛；不会自动重试。")
                    .font(.caption).foregroundStyle(palette.warning)
                HStack {
                    Button("核验为失败") { store.resolveUnknown(unknown.actionID, for: run, succeeded: false) }
                    Button("核验为成功") { store.resolveUnknown(unknown.actionID, for: run, succeeded: true) }
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }

    private func plan(_ run: TaskRun) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack {
                inspectorTitle("执行计划")
                Spacer()
                Text("\(completedCount(run)) / \(run.actions.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(palette.muted)
            }

            if run.actions.isEmpty {
                Text("等待 Runtime 返回执行计划")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(run.actions.enumerated()), id: \.element.id) { index, node in
                        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                            VStack(spacing: 0) {
                                Image(systemName: stepSymbol(node.status))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(stepColor(node.status))
                                    .frame(width: 16, height: 18)
                                if index < run.actions.count - 1 {
                                    Rectangle()
                                        .fill(node.status == "succeeded" ? palette.success.opacity(0.46) : palette.hairline)
                                        .frame(width: 1, height: 30)
                                }
                            }
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                Text(TaskPresentation.actionTitle(node.stepID))
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(palette.body)
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
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }

    private func deliverable(_ run: TaskRun, path: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            inspectorTitle("交付物")
            Label(run.deliverableTitle ?? "已验证交付物", systemImage: "doc.text.fill")
                .font(.callout.weight(.medium))
                .foregroundStyle(palette.ink)
            if let evaluation = run.response?.evaluation ?? run.evaluation {
                Text(evaluation.deliveryAllowed ? "质量检查通过" : "未达到交付门槛")
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
        DisclosureGroup("运行诊断", isExpanded: $diagnosticsExpanded) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                LabeledContent("Task ID", value: run.id)
                if let runID = run.runID { LabeledContent("Run ID", value: runID) }
                if let phase = run.runPhase { LabeledContent("Run Phase", value: phase) }
                if let reason = run.stopReason { LabeledContent("Stop Reason", value: reason) }
                LabeledContent("Events", value: "\(run.events.count)")
                if let response = run.response {
                    LabeledContent("Skill", value: "\(response.graph.skillID)@\(response.graph.skillVersion)")
                }
            }
            .font(.caption)
            .foregroundStyle(palette.muted)
            .textSelection(.enabled)
            .padding(.top, AppTheme.Spacing.sm)
        }
        .font(.callout.weight(.medium))
        .padding(AppTheme.Spacing.md)
    }

    private var inspectorDivider: some View {
        Divider().overlay(palette.hairlineSoft)
    }

    private func inspectorTitle(_ text: String) -> some View {
        Text(text).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
    }

    private func completedCount(_ run: TaskRun) -> Int {
        run.actions.filter { $0.status == "succeeded" }.count
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

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
