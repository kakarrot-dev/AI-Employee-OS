import SwiftUI

struct TasksWorkspaceView: View {
    @ObservedObject var store: TaskStore

    var body: some View {
        HSplitView {
            SidebarView(store: store)
                .frame(minWidth: 230, idealWidth: 280, maxWidth: 340)
            Group {
                if let selected = store.runs.first(where: { $0.id == store.selection }) {
                    TaskDetailView(run: selected, cancel: { store.cancel(selected.id) })
                } else {
                    ContentUnavailableView("选择一个任务", systemImage: "checklist", description: Text("任务的执行状态、交付结果和诊断信息会显示在这里。"))
                }
            }
            .frame(minWidth: 500, maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("任务")
    }
}
