import AppKit
import SwiftUI

@main
struct AIEmployeeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = TaskStore(service: RuntimeService.live())
    @StateObject private var conversationStore = ConversationStore(service: RuntimeService.live())
    @StateObject private var employeeStore = EmployeeStore(service: RuntimeService.live())
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    @AppStorage("appAppearance") private var appearanceRaw = AppAppearance.system.rawValue
    var body: some Scene {
        Window("AI Employee OS", id: "main") {
            ContentView(store: store, conversationStore: conversationStore, employeeStore: employeeStore)
                .frame(minWidth: 720, minHeight: 520)
                .fontDesign(.default)
                .preferredColorScheme(appearance.colorScheme)
        }
        .defaultSize(width: 1280, height: 820)
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("设置…") { destinationRaw = AppDestination.settings.rawValue }
                    .keyboardShortcut(",")
            }
            CommandGroup(after: .newItem) {
                Button("打开工作") { destinationRaw = AppDestination.work.rawValue }
                    .keyboardShortcut("n")
            }
            CommandMenu("AI Employee") {
                Button("打开命令面板") { store.presentCommandPalette() }
                    .keyboardShortcut("k")
                Divider()
                Button("打开 Alex 工作区") { destinationRaw = AppDestination.work.rawValue }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .disabled(store.isSubmitting)
            }
        }

        MenuBarExtra("AI Employee", systemImage: menuBarSystemImage) {
            MenuBarStatusView(store: store)
        }

    }

    private var menuBarSystemImage: String {
        store.runs.contains(where: { $0.status == .running }) ? "person.crop.circle.badge.clock" : "person.crop.circle"
    }

    private var appearance: AppAppearance {
        AppAppearance(rawValue: appearanceRaw) ?? .system
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
