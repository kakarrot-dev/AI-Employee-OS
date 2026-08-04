import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore

    var body: some View {
        NavigationSplitView {
            SidebarView(store: store)
                .navigationSplitViewColumnWidth(min: 220, ideal: 260)
        } detail: {
            if let selected = store.runs.first(where: { $0.id == store.selection }) {
                TaskDetailView(run: selected)
            } else {
                ContentUnavailableView("Alex 等待任务", systemImage: "person.crop.circle.badge.clock", description: Text("新建任务后，系统会先请求写入审批。"))
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: store.beginComposing) { Label("新建任务", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $store.isComposing) { ComposerView(store: store) }
        .alert("允许 Alex 创建 PRD 文件？", isPresented: $store.awaitingApproval) {
            Button("取消", role: .cancel, action: store.cancelApproval)
            Button("允许一次", action: store.approveAndRun)
        } message: {
            Text("授权仅用于本次任务的项目 outputs 目录。Agent 不会直接获得系统权限。")
        }
    }
}
