import AppKit
import SwiftUI

struct MenuBarStatusView: View {
    @ObservedObject var store: TaskStore
    @Environment(\.openWindow) private var openWindow
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue

    private var runningCount: Int { store.runs.filter { $0.status == .running }.count }

    var body: some View {
        Label(statusTitle, systemImage: runningCount > 0 ? "progress.indicator" : "checkmark.circle")
        Divider()
        Button("打开 AI Employee") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Button("打开 Alex 工作区") {
            destinationRaw = AppDestination.work.rawValue
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        .disabled(store.isSubmitting)
        Divider()
        Button("退出 AI Employee") { NSApp.terminate(nil) }
    }

    private var statusTitle: String {
        runningCount > 0 ? "Alex 正在处理工作" : "Alex 可以接受新工作"
    }
}
