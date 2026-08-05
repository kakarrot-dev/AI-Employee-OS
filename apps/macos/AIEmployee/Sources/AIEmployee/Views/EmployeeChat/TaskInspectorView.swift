import SwiftUI

struct TaskInspectorView: View {
    let run: TaskRun?

    @State private var planExpanded = false
    @State private var diagnosticsExpanded = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                inspectorHeader
                inspectorDivider

                if let run {
                    currentWork(run)
                    inspectorDivider
                    plan(run)

                    if let path = run.response?.artifactPath ?? run.artifactPath {
                        inspectorDivider
                        deliverable(run, path: path)
                    }

                    inspectorDivider
                    diagnostics(run)
                } else {
                    Text("Alex 当前没有正在处理的工作。")
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
            Text("Alex").font(.headline)
            Text("AI 产品经理 · 产品部")
                .font(.caption)
                .foregroundStyle(palette.muted)
        }
        .padding(AppTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
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
        }
        .padding(AppTheme.Spacing.md)
    }

    private func plan(_ run: TaskRun) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Button {
                planExpanded.toggle()
            } label: {
                HStack {
                    inspectorTitle("执行计划")
                    Spacer()
                    Text("\(completedCount(run)) / \(run.actions.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.muted)
                    Image(systemName: planExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            if run.actions.isEmpty {
                Text("等待 Runtime 返回执行计划")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            } else {
                StepDotProgress(nodes: run.actions)
                Text(currentStep(run))
                    .font(.caption)
                    .foregroundStyle(palette.muted)

                if planExpanded {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        ForEach(run.actions) { node in
                            HStack(alignment: .top, spacing: AppTheme.Spacing.xs) {
                                Image(systemName: stepSymbol(node.status))
                                    .font(.caption)
                                    .foregroundStyle(stepColor(node.status))
                                    .frame(width: 14)
                                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                    Text(TaskPresentation.actionTitle(node.stepID)).font(.caption.weight(.medium))
                                    Text(TaskPresentation.actionStatus(node.status)).font(.caption2).foregroundStyle(palette.muted)
                                }
                            }
                        }
                    }
                    .padding(.top, AppTheme.Spacing.xs)
                }
            }
        }
        .padding(AppTheme.Spacing.md)
    }

    private func deliverable(_ run: TaskRun, path: String) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            inspectorTitle("交付物")
            Label("PRD", systemImage: "doc.text.fill")
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

    private func currentStep(_ run: TaskRun) -> String {
        if let node = run.actions.first(where: { $0.status == "running" }) {
            return TaskPresentation.actionTitle(node.stepID)
        }
        if run.status == .succeeded { return "全部步骤已完成" }
        return "等待下一步"
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

private struct StepDotProgress: View {
    let nodes: [GraphNodeEvidence]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                Circle()
                    .fill(dotFill(node.status))
                    .overlay { Circle().stroke(dotStroke(node.status), lineWidth: 1.5) }
                    .frame(width: 9, height: 9)
                    .help(TaskPresentation.actionTitle(node.stepID))
                if index < nodes.count - 1 {
                    Rectangle()
                        .fill(node.status == "succeeded" ? palette.success.opacity(0.55) : palette.hairline)
                        .frame(height: 1.5)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func dotFill(_ status: String) -> Color {
        switch status {
        case "succeeded": palette.success
        case "running": palette.accentTeal
        case "failed", "result_unknown": palette.error
        case "blocked": palette.warning
        default: palette.surfaceSoft
        }
    }

    private func dotStroke(_ status: String) -> Color {
        status == "pending" ? palette.mutedSoft : dotFill(status)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
