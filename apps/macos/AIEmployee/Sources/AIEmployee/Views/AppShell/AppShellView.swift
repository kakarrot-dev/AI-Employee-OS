import SwiftUI

struct AppShellView<Workspace: View>: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    let newWork: () -> Void
    @ViewBuilder let workspace: () -> Workspace

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NavigationSplitView {
            MainSidebarView(selection: $selection)
                .navigationSplitViewColumnWidth(min: 200, ideal: 232, max: 260)
        } detail: {
            workspace()
                .frame(minWidth: 480, maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationSplitViewStyle(.balanced)
        .background(palette.canvas)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
