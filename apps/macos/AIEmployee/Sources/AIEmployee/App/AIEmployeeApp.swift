import AppKit
import SwiftUI

@main
struct AIEmployeeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = TaskStore(service: RuntimeService.live())
    @AppStorage("themeMode") private var themeModeRaw = ThemeMode.system.rawValue

    var body: some Scene {
        WindowGroup("AI Employee OS", id: "main") {
            ContentView(store: store)
                .frame(minWidth: 880, minHeight: 580)
                .fontDesign(.default)
                .preferredColorScheme(preferredColorScheme)
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("新建任务") { store.beginComposing() }
                    .keyboardShortcut("n")
            }
            CommandMenu("AI Employee") {
                Button("打开命令面板") { store.presentCommandPalette() }
                    .keyboardShortcut("k")
                Divider()
                Button("交给 Alex 新任务") { store.beginComposing() }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .disabled(store.isSubmitting)
            }
        }

        MenuBarExtra("AI Employee", systemImage: menuBarSystemImage) {
            MenuBarStatusView(store: store)
        }

        Settings {
            SettingsView()
                .preferredColorScheme(preferredColorScheme)
        }
    }

    private var preferredColorScheme: ColorScheme? {
        switch ThemeMode(rawValue: themeModeRaw) ?? .system {
        case .system: nil
        case .light: .light
        case .dark: .dark
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
