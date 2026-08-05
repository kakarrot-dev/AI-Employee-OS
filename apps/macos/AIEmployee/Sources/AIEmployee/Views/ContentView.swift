import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore
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
            AppSidebarView(selection: destination, store: store)
                .navigationSplitViewColumnWidth(min: 212, ideal: 228, max: 244)
        } detail: {
            workspace
        }
        .tint(AppTheme.palette(for: colorScheme).primary)
        .sheet(isPresented: $store.isCommandPalettePresented) {
            CommandPaletteView(
                navigate: { destination.wrappedValue = $0 },
                newWork: { destination.wrappedValue = .work }
            )
        }
    }

    @ViewBuilder
    private var workspace: some View {
        switch destination.wrappedValue {
        case .office:
            OfficeWorkspaceView(store: store, openChat: { destination.wrappedValue = .work })
        case .contacts:
            ContactsWorkspaceView(openChat: { destination.wrappedValue = .work })
        case .work:
            EmployeeChatWorkspaceView(store: store)
        case .capabilities:
            CapabilityLibraryWorkspaceView()
        }
    }
}
