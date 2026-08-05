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
        .sheet(isPresented: $store.isCommandPalettePresented) {
            CommandPaletteView(
                navigate: { destination.wrappedValue = $0 },
                newWork: { beginWork() },
                openSettings: { destination.wrappedValue = .settings }
            )
        }
        .sheet(isPresented: $employeeStore.isPresentingEditor) {
            if let employee = employeeStore.editingEmployee { EmployeeEditorView(employee: employee, store: employeeStore) }
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
