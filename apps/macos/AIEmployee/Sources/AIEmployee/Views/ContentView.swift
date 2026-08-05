import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @SceneStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    @Environment(\.colorScheme) private var colorScheme

    private var destination: Binding<AppDestination> {
        Binding(
            get: { AppDestination(rawValue: destinationRaw) ?? .office },
            set: { destinationRaw = $0.rawValue }
        )
    }

    var body: some View {
        NavigationSplitView {
            AppSidebarView(selection: destination, store: store, conversationStore: conversationStore)
                .navigationSplitViewColumnWidth(min: 212, ideal: 228, max: 244)
        } detail: {
            workspace
        }
        .tint(AppTheme.palette(for: colorScheme).primary)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    destination.wrappedValue = .settings
                } label: {
                    Label("设置", systemImage: "gearshape")
                }
                .help("设置（⌘,）")
            }
        }
        .sheet(isPresented: $store.isCommandPalettePresented) {
            CommandPaletteView(
                navigate: { destination.wrappedValue = $0 },
                newWork: { destination.wrappedValue = .work }
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
            OfficeWorkspaceView(store: store, openChat: { destination.wrappedValue = .work })
        case .contacts:
            EmployeeDirectoryView(store: employeeStore) { employee in
                employeeStore.selection = employee.id
                conversationStore.select(employee: employee)
                destination.wrappedValue = .work
            }
        case .work:
            ConversationWorkspaceView(store: conversationStore, employee: employeeStore.selected)
        case .capabilities:
            CapabilityLibraryWorkspaceView(employee: employeeStore.selected)
        case .settings:
            SettingsView()
        }
    }
}
