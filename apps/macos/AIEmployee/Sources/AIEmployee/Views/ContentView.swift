import SwiftUI

struct ContentView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    @StateObject private var knowledgeStore = KnowledgeLibraryStore()
    @StateObject private var archiveStore = ArchiveStore()
    @StateObject private var layoutCoordinator = AppLayoutCoordinator()
    @AppStorage("appDestination") private var destinationRaw = AppDestination.office.rawValue
    @SceneStorage("globalSidebarPreferred") private var globalSidebarPreferred = true
    @State private var demoEditorEmployee: Employee?
    @State private var isModalBackgroundDisabled = false
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
                layoutCoordinator: layoutCoordinator,
                prefersGlobalNavigation: $globalSidebarPreferred,
                newWork: { beginWork() }
            ) {
                workspace
            }
            .tint(AppTheme.palette(for: colorScheme).primary)
            .disabled(isModalBackgroundDisabled)
            .accessibilityHidden(isModalPresented)

            if store.isCommandPalettePresented {
                CreamModalOverlay(close: { store.isCommandPalettePresented = false }, preferredWidth: 640, preferredHeight: 420) {
                    CommandPaletteView(
                        employees: ContactsDemoData.current?.employees ?? employeeStore.employees,
                        recentThreads: store.taskThreads,
                        navigate: { destination.wrappedValue = $0 },
                        openEmployee: { openConversation($0) },
                        openThread: { openThread($0) },
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
        .onChange(of: isModalPresented) { _, isPresented in
            if isPresented {
                DispatchQueue.main.async {
                    if isModalPresented {
                        isModalBackgroundDisabled = true
                    }
                }
            } else {
                isModalBackgroundDisabled = false
            }
        }
        .onAppear {
#if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if let index = arguments.firstIndex(of: "--ui-demo"), arguments.indices.contains(index + 1) {
                let scene = arguments[index + 1]
                if scene.hasPrefix("skills") { destinationRaw = AppDestination.skills.rawValue }
                if scene.hasPrefix("knowledge") { destinationRaw = AppDestination.knowledge.rawValue }
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
            OfficeWorkspaceView(store: store, employeeStore: employeeStore, openWork: {
                destination.wrappedValue = .work
            })
        case .contacts:
            EmployeeDirectoryView(
                store: employeeStore,
                capabilityStore: capabilityStore,
                openChat: { employee in openConversation(employee) },
                editDemoEmployee: { demoEditorEmployee = $0 }
            )
        case .work:
            TaskThreadWorkspaceView(store: store, employeeStore: employeeStore)
        case .archive:
            ArchiveWorkspaceView(
                store: archiveStore,
                taskStore: store,
                openWork: { destination.wrappedValue = .work }
            )
        case .employeeChat:
            EmployeeChatWorkspaceView(
                store: store,
                conversationStore: conversationStore,
                employeeStore: employeeStore,
                capabilityStore: capabilityStore,
                employee: selectedEmployee,
                openArchive: { destination.wrappedValue = .archive }
            )
        case .skills:
            CapabilityLibraryWorkspaceView(scope: .skills, capabilityStore: capabilityStore)
        case .knowledge:
            KnowledgeLibraryWorkspaceView(store: knowledgeStore)
        case .tools:
            CapabilityLibraryWorkspaceView(scope: .tools, capabilityStore: capabilityStore)
        case .settings:
            SettingsView()
        }
    }

    private func openConversation(_ employee: Employee) {
        employeeStore.selection = employee.id
        conversationStore.select(employee: employee)
        destination.wrappedValue = .employeeChat
    }

    private func openThread(_ thread: TaskThreadProjection) {
        store.selectThread(thread)
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
        destination.wrappedValue = .office
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
