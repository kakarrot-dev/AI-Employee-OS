import AppKit
import SwiftUI

@main
struct AIEmployeeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = TaskStore(service: RuntimeService.live())
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    var body: some Scene {
        WindowGroup("AI Employee OS", id: "main") {
            ContentView(store: store)
                .frame(minWidth: 960, minHeight: 640)
                .fontDesign(.default)
                .preferredColorScheme(.light)
        }
        .defaultSize(width: 1280, height: 820)
        .commands {
            CommandGroup(after: .newItem) {
                Button("新建工作") { destinationRaw = AppDestination.work.rawValue }
                    .keyboardShortcut("n")
            }
            CommandMenu("AI Employee") {
                Button("打开命令面板") { store.presentCommandPalette() }
                    .keyboardShortcut("k")
                Divider()
                Button("交给 Alex 新工作") { destinationRaw = AppDestination.work.rawValue }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .disabled(store.isSubmitting)
            }
        }

        MenuBarExtra("AI Employee", systemImage: menuBarSystemImage) {
            MenuBarStatusView(store: store)
        }

        Settings {
            SettingsView()
                .preferredColorScheme(.light)
        }
    }

    private var menuBarSystemImage: String {
        store.runs.contains(where: { $0.status == .running }) ? "person.crop.circle.badge.clock" : "person.crop.circle"
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
