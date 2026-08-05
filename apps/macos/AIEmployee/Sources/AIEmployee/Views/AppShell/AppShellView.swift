import SwiftUI

struct AppShellView<Workspace: View>: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    let openSettings: () -> Void
    let newWork: () -> Void
    @ViewBuilder let workspace: () -> Workspace

    @SceneStorage("contextSidebarVisible") private var contextSidebarVisible = true
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HSplitView {
            ModuleRailView(selection: $selection, openSettings: openSettings)
                .frame(width: 60)

            if supportsContextSidebar, contextSidebarVisible {
                ContextSidebarView(
                    selection: $selection,
                    store: store,
                    conversationStore: conversationStore,
                    employeeStore: employeeStore,
                    newWork: newWork
                )
                .frame(minWidth: 248, idealWidth: 280, maxWidth: 320)
            }

            workspace()
                .frame(minWidth: 590, maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(palette.canvas)
        .toolbar {
            if supportsContextSidebar {
                ToolbarItem(placement: .navigation) {
                    Button {
                        contextSidebarVisible.toggle()
                    } label: {
                        Label(contextSidebarVisible ? "隐藏边栏" : "显示边栏", systemImage: "sidebar.left")
                    }
                    .buttonStyle(.plain)
                    .tint(palette.primary)
                    .help(contextSidebarVisible ? "隐藏上下文边栏" : "显示上下文边栏")
                }
            }
        }
    }

    private var supportsContextSidebar: Bool {
        selection == .contacts || selection == .work
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
