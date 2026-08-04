import AppKit
import SwiftUI

struct MenuBarStatusView: View {
    @ObservedObject var store: TaskStore
    @Environment(\.openWindow) private var openWindow

    private var runningCount: Int { store.runs.filter { $0.status == .running }.count }

    var body: some View {
        Label(statusTitle, systemImage: runningCount > 0 ? "progress.indicator" : "checkmark.circle")
        Divider()
        Button("打开 AI Employee") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Button("交给 Alex 新任务") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
            store.beginComposing()
        }
        .disabled(store.isSubmitting)
        Divider()
        Button("退出 AI Employee") { NSApp.terminate(nil) }
    }

    private var statusTitle: String {
        runningCount > 0 ? "Alex 正在处理 \(runningCount) 个任务" : "Alex 可以接受新任务"
    }
}
