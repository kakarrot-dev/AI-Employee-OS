import SwiftUI

struct SidebarView: View {
    @ObservedObject var store: TaskStore

    var body: some View {
        List(selection: $store.selection) {
            Section("Alex · AI 产品经理") {
                ForEach(store.runs) { run in
                    HStack(spacing: 10) {
                        Image(systemName: icon(run.status)).foregroundStyle(color(run.status)).frame(width: 16)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(run.input).lineLimit(1)
                            Text(run.status.rawValue).font(.caption).foregroundStyle(.secondary)
                        }
                    }.tag(run.id)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("任务")
    }

    private func icon(_ status: TaskRunStatus) -> String {
        switch status { case .running: "progress.indicator"; case .succeeded: "checkmark.circle.fill"; case .failed: "exclamationmark.triangle.fill"; case .cancelled: "xmark.circle"; case .pending: "clock" }
    }
    private func color(_ status: TaskRunStatus) -> Color {
        switch status { case .succeeded: .green; case .failed: .red; case .running: .blue; default: .secondary }
    }
}
