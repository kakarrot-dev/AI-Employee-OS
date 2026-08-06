import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    @SceneStorage("workComposerPresented") private var workComposerPresented = false
    @State private var demoEditorEmployee: Employee?
    @Environment(\.colorScheme) private var colorScheme

    private var destination: Binding<AppDestination> {
        Binding(
            get: { AppDestination(rawValue: destinationRaw) ?? .office },
            set: { destinationRaw = $0.rawValue }
        )
    }

    var body: some View {
        ZStack {
            AppShellView(
                selection: destination,
                store: store,
                conversationStore: conversationStore,
                employeeStore: employeeStore,
                newWork: { beginWork() }
            ) {
                workspace
            }
            .tint(AppTheme.palette(for: colorScheme).primary)

            if store.isCommandPalettePresented {
                CreamModalOverlay(close: { store.isCommandPalettePresented = false }, preferredWidth: 640, preferredHeight: 420) {
                    CommandPaletteView(
                        employees: ContactsDemoData.current?.employees ?? employeeStore.employees,
                        recentRuns: store.runs,
                        navigate: { destination.wrappedValue = $0 },
                        openEmployee: { openConversation($0) },
                        openRun: { openRun($0) },
                        newWork: { beginWork() },
                        openSettings: { destination.wrappedValue = .settings },
                        close: { store.isCommandPalettePresented = false }
                    )
                }
            }

            if employeeStore.isPresentingEditor, let employee = employeeStore.editingEmployee {
                CreamModalOverlay(close: { employeeStore.isPresentingEditor = false }, preferredWidth: 820, preferredHeight: 660) {
                    EmployeeEditorView(
                        employee: employee,
                        store: employeeStore,
                        capabilityStore: capabilityStore,
                        isDemo: false,
                        close: { employeeStore.isPresentingEditor = false }
                    )
                }
            }

            if let employee = demoEditorEmployee {
                CreamModalOverlay(close: { demoEditorEmployee = nil }, preferredWidth: 820, preferredHeight: 660) {
                    EmployeeEditorView(
                        employee: employee,
                        store: employeeStore,
                        capabilityStore: capabilityStore,
                        isDemo: true,
                        close: { demoEditorEmployee = nil }
                    )
                }
            }

            WindowTitlebarScrim(
                isPresented: isModalPresented,
                opacity: colorScheme == .dark ? 0.24 : 0.10,
                close: closeActiveModal
            )
            .frame(width: 0, height: 0)

            UXToastOverlay(notice: $employeeStore.notice)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, AppTheme.Spacing.md)
                .padding(.trailing, AppTheme.Spacing.md)
                .allowsHitTesting(employeeStore.notice != nil)
                .zIndex(120)
        }
        .onChange(of: employeeStore.selection) { _, _ in
            if let employee = employeeStore.selected { conversationStore.select(employee: employee) }
        }
        .onAppear {
#if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1) {
                let scene = arguments[index + 1]
                if scene.hasPrefix("skills") { destinationRaw = AppDestination.skills.rawValue }
                if scene.hasPrefix("tools") { destinationRaw = AppDestination.tools.rawValue }
                if scene.hasPrefix("work") { destinationRaw = AppDestination.work.rawValue }
            }
#endif
            Task {
                await employeeStore.reload()
                await capabilityStore.reload()
            }
        }
    }

    @ViewBuilder
    private var workspace: some View {
        switch destination.wrappedValue {
        case .office:
            OfficeWorkspaceView(store: store, employeeStore: employeeStore, openChat: { destination.wrappedValue = .work })
        case .contacts:
            EmployeeDirectoryView(
                store: employeeStore,
                capabilityStore: capabilityStore,
                openChat: { employee in openConversation(employee) },
                editDemoEmployee: { demoEditorEmployee = $0 }
            )
        case .work:
            EmployeeChatWorkspaceView(
                store: store,
                conversationStore: conversationStore,
                employeeStore: employeeStore,
                capabilityStore: capabilityStore,
                employee: selectedEmployee,
                isCreatingWork: $workComposerPresented
            )
        case .skills:
            CapabilityLibraryWorkspaceView(scope: .skills, capabilityStore: capabilityStore)
        case .tools:
            CapabilityLibraryWorkspaceView(scope: .tools, capabilityStore: capabilityStore)
        case .settings:
            SettingsView()
        }
    }

    private func openConversation(_ employee: Employee) {
        employeeStore.selection = employee.id
        conversationStore.select(employee: employee)
        destination.wrappedValue = .work
    }

    private func openRun(_ run: TaskRun) {
        store.selection = run.id
        if let employee = (ContactsDemoData.current?.employees ?? employeeStore.employees).first(where: { $0.id == run.agentID }) {
            employeeStore.selection = employee.id
            conversationStore.select(employee: employee)
        }
        destination.wrappedValue = .work
    }

    private var selectedEmployee: Employee? {
        if let demo = ContactsDemoData.current,
           let employee = demo.employees.first(where: { $0.id == employeeStore.selection }) {
            return employee
        }
        return employeeStore.selected
    }

    private func beginWork() {
        if let alex = employeeStore.employees.first(where: { $0.id == "ai-product-manager" }) {
            employeeStore.selection = alex.id
            conversationStore.select(employee: alex)
        }
        destination.wrappedValue = .work
        workComposerPresented = capabilityStore.tasksEnabled
    }

    private var isModalPresented: Bool {
        store.isCommandPalettePresented || employeeStore.isPresentingEditor || demoEditorEmployee != nil
    }

    private func closeActiveModal() {
        if demoEditorEmployee != nil {
            demoEditorEmployee = nil
        } else if employeeStore.isPresentingEditor {
            employeeStore.isPresentingEditor = false
        } else if store.isCommandPalettePresented {
            store.isCommandPalettePresented = false
        }
    }
}
