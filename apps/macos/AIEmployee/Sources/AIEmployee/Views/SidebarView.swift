import SwiftUI

struct SidebarView: View {
    @ObservedObject var store: TaskStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        List(selection: $store.selection) {
            Section("Alex · AI 产品经理") {
                ForEach(store.runs) { run in
                    HStack(spacing: 10) {
                        Image(systemName: icon(run.status)).foregroundStyle(color(run.status)).frame(width: 16)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(run.input).lineLimit(1)
                            Text(run.status.title).font(.caption).foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                        }
                    }.tag(run.id)
                }
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(AppTheme.palette(for: colorScheme).surfaceSoft)
        .navigationTitle("任务")
    }

    private func icon(_ status: TaskRunStatus) -> String {
        switch status { case .running: "progress.indicator"; case .succeeded: "checkmark.circle.fill"; case .failed: "exclamationmark.triangle.fill"; case .cancelled: "xmark.circle"; case .pending: "clock" }
    }
    private func color(_ status: TaskRunStatus) -> Color {
        let palette = AppTheme.palette(for: colorScheme)
        return switch status { case .succeeded: palette.success; case .failed: palette.error; case .running: palette.accentTeal; default: palette.muted }
    }
}
