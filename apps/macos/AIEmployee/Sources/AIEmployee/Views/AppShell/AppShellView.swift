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
        GeometryReader { proxy in
            NavigationSplitView {
                MainSidebarView(selection: $selection)
                    .navigationSplitViewColumnWidth(min: 200, ideal: 232, max: 260)
            } detail: {
                workspace()
                    .environment(\.appWindowWidth, proxy.size.width)
                    .frame(minWidth: 480, maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationSplitViewStyle(.balanced)
        }
        .background(palette.canvas)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct AppWindowWidthKey: EnvironmentKey {
    static let defaultValue: CGFloat = 1280
}

extension EnvironmentValues {
    var appWindowWidth: CGFloat {
        get { self[AppWindowWidthKey.self] }
        set { self[AppWindowWidthKey.self] = newValue }
    }
}
