import SwiftUI

struct AppShellView<Workspace: View>: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @ObservedObject var layoutCoordinator: AppLayoutCoordinator
    @Binding var prefersGlobalNavigation: Bool
    let newWork: () -> Void
    @ViewBuilder let workspace: () -> Workspace

    @Environment(\.colorScheme) private var colorScheme
    @State private var compactColumnVisibility = NavigationSplitViewVisibility.detailOnly
    @State private var previousShellClass: AppShellClass?

    var body: some View {
        GeometryReader { proxy in
            let isCompact = proxy.size.width < AppLayoutResolver.compactShellWidth
            let globalNavigationVisible = isCompact
                ? compactColumnVisibility != .detailOnly
                : AppLayoutResolver.defaultGlobalNavigationVisible(
                    windowSize: proxy.size,
                    prefersGlobalNavigation: prefersGlobalNavigation
                )
            let context = layoutCoordinator.projectedContext(
                windowSize: proxy.size,
                globalNavigationVisible: globalNavigationVisible
            )
            let columnVisibility = Binding<NavigationSplitViewVisibility>(
                get: {
                    isCompact
                        ? compactColumnVisibility
                        : (prefersGlobalNavigation ? .all : .detailOnly)
                },
                set: { visibility in
                    if isCompact {
                        compactColumnVisibility = visibility
                    } else {
                        prefersGlobalNavigation = visibility != .detailOnly
                    }
                }
            )

            NavigationSplitView(columnVisibility: columnVisibility) {
                MainSidebarView(selection: $selection)
                    .navigationSplitViewColumnWidth(min: 200, ideal: 232, max: 260)
            } detail: {
                workspace()
                    .frame(minWidth: 480, maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationSplitViewStyle(.balanced)
            .environmentObject(layoutCoordinator)
            .environment(\.appLayoutContext, context)
            .onAppear {
                if isCompact { compactColumnVisibility = .detailOnly }
                previousShellClass = context.shellClass
                layoutCoordinator.update(
                    windowSize: proxy.size,
                    globalNavigationVisible: globalNavigationVisible
                )
            }
            .onChange(of: proxy.size) { _, size in
                let nextShellClass: AppShellClass = size.width < AppLayoutResolver.compactShellWidth ? .compact : .regular
                if previousShellClass != nextShellClass, nextShellClass == .compact {
                    compactColumnVisibility = .detailOnly
                }
                previousShellClass = nextShellClass
                layoutCoordinator.update(
                    windowSize: size,
                    globalNavigationVisible: size.width < AppLayoutResolver.compactShellWidth
                        ? compactColumnVisibility != .detailOnly
                        : prefersGlobalNavigation
                )
            }
            .onChange(of: compactColumnVisibility) { _, visibility in
                guard isCompact else { return }
                layoutCoordinator.update(
                    windowSize: proxy.size,
                    globalNavigationVisible: visibility != .detailOnly
                )
            }
            .onChange(of: prefersGlobalNavigation) { _, preferred in
                guard !isCompact else { return }
                layoutCoordinator.update(
                    windowSize: proxy.size,
                    globalNavigationVisible: preferred
                )
            }
        }
        .background(palette.canvas)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
