import AppKit
import SwiftUI

@main
struct AIEmployeeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = TaskStore(service: RuntimeService.live())

    var body: some Scene {
        WindowGroup("AI Employee OS", id: "main") {
            ContentView(store: store)
                .frame(minWidth: 880, minHeight: 580)
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("新建任务") { store.beginComposing() }
                    .keyboardShortcut("n")
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
