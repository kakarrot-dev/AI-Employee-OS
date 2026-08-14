import AppKit
import SwiftUI

@main
struct AIEmployeeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = TaskStore(service: RuntimeService.live())
    @StateObject private var conversationStore = ConversationStore(service: RuntimeService.live())
    @StateObject private var employeeStore = EmployeeStore(service: RuntimeService.live())
    @StateObject private var capabilityStore = CapabilityStore(service: RuntimeService.live())
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    @AppStorage("appAppearance") private var appearanceRaw = AppAppearance.system.rawValue
    /// 系统主题变更时递增，迫使跟随系统模式重新解析 ColorScheme。
    @State private var systemAppearanceEpoch = 0
    var body: some Scene {
        Window("AI Employee OS", id: "main") {
            ContentView(
                store: store,
                conversationStore: conversationStore,
                employeeStore: employeeStore,
                capabilityStore: capabilityStore
            )
                .frame(minWidth: 720, minHeight: 520)
                .fontDesign(.default)
                .preferredColorScheme(resolvedColorScheme)
                .onReceive(DistributedNotificationCenter.default.publisher(for: SystemColorScheme.didChangeNotification)) { _ in
                    systemAppearanceEpoch &+= 1
                }
        }
        .defaultSize(width: 1280, height: 820)
        .windowToolbarStyle(.unifiedCompact(showsTitle: true))
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
                Button("打开员工工作区") { destinationRaw = AppDestination.work.rawValue }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                    .disabled(store.isSubmitting)
            }
        }

        MenuBarExtra {
            MenuBarStatusView(store: store)
        } label: {
            Image(nsImage: MenuBarIcon.image(isRunning: hasRunningWork))
                .accessibilityLabel(hasRunningWork ? "AI Employee 正在工作" : "AI Employee")
        }

    }

    private var hasRunningWork: Bool {
        store.runs.contains(where: { $0.status == .running })
    }

    private var appearance: AppAppearance {
        AppAppearance(rawValue: appearanceRaw) ?? .system
    }

    private var resolvedColorScheme: ColorScheme {
        let _ = systemAppearanceEpoch
        return appearance.resolvedColorScheme(system: SystemColorScheme.current)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}
