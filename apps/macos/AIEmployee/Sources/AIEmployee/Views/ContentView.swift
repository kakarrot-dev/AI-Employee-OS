import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    @SceneStorage("workComposerPresented") private var workComposerPresented = false
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
                        navigate: { destination.wrappedValue = $0 },
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
                        isDemo: false,
                        close: { employeeStore.isPresentingEditor = false }
                    )
                }
            }
        }
        .onChange(of: employeeStore.selection) { _, _ in
            if let employee = employeeStore.selected { conversationStore.select(employee: employee) }
        }
    }

    @ViewBuilder
    private var workspace: some View {
        switch destination.wrappedValue {
        case .office:
            OfficeWorkspaceView(store: store, employeeStore: employeeStore, openChat: { destination.wrappedValue = .work })
        case .contacts:
            EmployeeDirectoryView(store: employeeStore) { employee in openConversation(employee) }
        case .work:
            EmployeeChatWorkspaceView(
                store: store,
                conversationStore: conversationStore,
                employee: employeeStore.selected,
                isCreatingWork: $workComposerPresented
            )
        case .skills:
            CapabilityLibraryWorkspaceView(scope: .skills)
        case .tools:
            CapabilityLibraryWorkspaceView(scope: .tools)
        case .settings:
            SettingsView()
        }
    }

    private func openConversation(_ employee: Employee) {
        employeeStore.selection = employee.id
        conversationStore.select(employee: employee)
        destination.wrappedValue = .work
    }

    private func beginWork() {
        if let alex = employeeStore.employees.first(where: { $0.id == "ai-product-manager" }) {
            employeeStore.selection = alex.id
            conversationStore.select(employee: alex)
        }
        destination.wrappedValue = .work
        workComposerPresented = true
    }
}
