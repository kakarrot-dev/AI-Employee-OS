import SwiftUI

struct ActionTimelineView: View {
    let nodes: [GraphNodeEvidence]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                    VStack(spacing: 0) {
                        statusIcon(node.status)
                        if index < nodes.count - 1 {
                            Rectangle()
                                .fill(palette.hairline)
                                .frame(width: 1)
                                .frame(minHeight: 30)
                        }
                    }

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(TaskPresentation.actionTitle(node.stepID))
                            .font(.body.weight(.medium))
                            .foregroundStyle(palette.ink)
                        HStack(spacing: AppTheme.Spacing.xs) {
                            Text(TaskPresentation.actionStatus(node.status))
                            if !node.outputAs.isEmpty {
                                Text("·")
                                Text(node.outputAs)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                    }
                    .padding(.bottom, index < nodes.count - 1 ? AppTheme.Spacing.sm : 0)

                    Spacer(minLength: 0)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("执行进度")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }

    @ViewBuilder
    private func statusIcon(_ status: String) -> some View {
        if status == "running" {
            ProgressView()
                .controlSize(.small)
                .tint(palette.accentTeal)
                .frame(width: 22, height: 22)
        } else {
            Image(systemName: icon(status))
                .foregroundStyle(color(status))
                .frame(width: 22, height: 22)
        }
    }

    private func icon(_ status: String) -> String {
        switch status {
        case "succeeded": "checkmark.circle.fill"
        case "failed": "exclamationmark.triangle.fill"
        case "blocked": "lock.circle.fill"
        case "result_unknown": "questionmark.circle.fill"
        case "running": "progress.indicator"
        case "cancelled": "xmark.circle"
        default: "circle"
        }
    }

    private func color(_ status: String) -> Color {
        switch status {
        case "succeeded": palette.success
        case "failed", "result_unknown": palette.error
        case "blocked": palette.warning
        case "running": palette.accentTeal
        default: palette.muted
        }
    }
}
