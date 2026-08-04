import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore
    @SceneStorage("appDestination") private var destinationRaw = AppDestination.company.rawValue
    @Environment(\.colorScheme) private var colorScheme

    private var destination: Binding<AppDestination> {
        Binding(
            get: { AppDestination(rawValue: destinationRaw) ?? .company },
            set: { destinationRaw = $0.rawValue }
        )
    }

    var body: some View {
        NavigationSplitView {
            AppSidebarView(selection: destination)
                .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 260)
        } detail: {
            workspace
        }
        .tint(AppTheme.palette(for: colorScheme).primary)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: store.beginComposing) { Label("新建任务", systemImage: "plus") }
                    .disabled(store.isSubmitting)
            }
        }
        .sheet(isPresented: $store.isComposing) { ComposerView(store: store) }
        .sheet(isPresented: $store.isCommandPalettePresented) {
            CommandPaletteView(
                store: store,
                navigate: { destination.wrappedValue = $0 }
            )
        }
        .alert("允许 Alex 创建 PRD 文件？", isPresented: $store.awaitingApproval) {
            Button("取消", role: .cancel, action: store.cancelApproval)
            Button("允许一次", action: store.approveAndRun)
        } message: {
            Text("授权仅用于本次任务的项目 outputs 目录。Agent 不会直接获得系统权限。")
        }
    }

    @ViewBuilder
    private var workspace: some View {
        switch destination.wrappedValue {
        case .company:
            CompanyWorkspaceView(store: store, openTasks: { destination.wrappedValue = .tasks })
        case .alex:
            AlexWorkspaceView(createTask: store.beginComposing)
        case .tasks:
            TasksWorkspaceView(store: store)
        case .artifacts:
            ArtifactsWorkspaceView(store: store)
        case .knowledge:
            KnowledgeWorkspaceView()
        }
    }
}
