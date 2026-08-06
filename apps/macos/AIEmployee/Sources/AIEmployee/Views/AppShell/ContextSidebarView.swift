import SwiftUI

struct ContextSidebarView: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    let newWork: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(palette.hairlineSoft)
            content
        }
        .background(palette.surfaceSoft)
        .overlay(alignment: .trailing) { Rectangle().fill(palette.hairlineSoft).frame(width: 1) }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text(selection.title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(palette.ink)
            Spacer()
            if selection == .contacts {
                Button(action: employeeStore.create) { Image(systemName: "person.badge.plus") }
                    .buttonStyle(.plain)
                    .frame(width: 40, height: 40)
                    .help("新建员工")
                    .accessibilityLabel("新建员工")
            }
        }
        .foregroundStyle(palette.body)
        .padding(.horizontal, 16)
        .frame(height: 54)
    }

    @ViewBuilder
    private var content: some View {
        switch selection {
        case .contacts:
            EmployeeDirectorySidebar(store: employeeStore)
        case .work:
            WorkConversationList(store: store, conversationStore: conversationStore, employeeStore: employeeStore)
        case .office, .skills, .tools, .settings:
            EmptyView()
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct WorkConversationList: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    @State private var query = ""
    @Environment(\.colorScheme) private var colorScheme

    private var employees: [Employee] {
        let source = ContactsDemoData.current?.employees ?? employeeStore.employees
        guard !query.isEmpty else { return source }
        return source.filter {
            $0.name.localizedCaseInsensitiveContains(query)
                || $0.role.localizedCaseInsensitiveContains(query)
                || $0.department.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("员工会话")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(palette.ink)
                    Spacer()
                    Text("\(employees.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.muted)
                }
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.mutedSoft)
                    TextField("搜索员工或会话", text: $query).textFieldStyle(.plain)
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain)
                            .frame(width: 40, height: 40)
                            .foregroundStyle(palette.mutedSoft)
                            .help("清除搜索")
                            .accessibilityLabel("清除搜索")
                    }
                }
                .padding(.horizontal, 11)
                .frame(height: 34)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 9).stroke(palette.hairlineSoft) }
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if employeeStore.isLoading && employees.isEmpty {
                ProgressView("正在加载会话…")
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = employeeStore.error, employees.isEmpty {
                UXFeedbackStateView(
                    title: "无法读取员工",
                    message: "会话没有被删除。\(error)",
                    systemImage: "exclamationmark.triangle.fill",
                    tone: .error,
                    actionTitle: "重试",
                    action: { Task { await employeeStore.reload() } }
                )
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if employees.isEmpty {
                UXFeedbackStateView(
                    title: query.isEmpty ? "还没有 AI 员工" : "没有匹配结果",
                    message: query.isEmpty ? "先在通讯录创建员工，再回到这里继续对话。" : "尝试其他姓名、岗位或部门。",
                    systemImage: query.isEmpty ? "person.2" : "magnifyingglass",
                    actionTitle: query.isEmpty ? nil : "清除搜索",
                    action: query.isEmpty ? nil : { query = "" }
                )
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        Text("持续会话")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(palette.muted)
                            .padding(.horizontal, 16)
                            .padding(.top, 14)
                            .padding(.bottom, 6)
                        ForEach(employees) { employee in
                            Button {
                                employeeStore.selection = employee.id
                                conversationStore.select(employee: employee)
                            } label: {
                                WorkConversationRow(
                                    employee: employee,
                                    preview: preview(for: employee),
                                    state: state(for: employee),
                                    relativeTime: relativeTime(for: employee)
                                )
                                .padding(.horizontal, 11)
                                .padding(.vertical, 7)
                                .contentShape(Rectangle())
                                .background(
                                    employeeStore.selection == employee.id
                                        ? palette.primary.opacity(0.12)
                                        : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                                )
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 1)
                        }
                    }
                    .padding(.bottom, 14)
                }
            }
        }
        .background(palette.surfaceSoft)
        .onChange(of: employeeStore.selection) { _, id in
            guard let id, let employee = employees.first(where: { $0.id == id }) else { return }
            conversationStore.select(employee: employee)
        }
        .task(id: employees.map(\.id).joined(separator: ",")) {
            await conversationStore.preloadSummaries(for: employees)
        }
        .task {
            if employeeStore.employees.isEmpty, ContactsDemoData.current == nil {
                await employeeStore.reload()
            }
        }
    }

    private func preview(for employee: Employee) -> String {
        if let preview = WorkLibraryDemoData.current?.previews[employee.id] { return preview }
        if employee.id == "ai-product-manager",
           let active = runs(for: employee).first(where: { $0.status == .running || $0.status == .pending }) {
            return active.input
        }
        if let preview = conversationStore.latestPreviewByEmployee[employee.id] { return preview }
        if employee.id == conversationStore.employeeID {
            return conversationStore.messages.last?.content ?? "还没有消息"
        }
        return employee.role
    }

    private func state(for employee: Employee) -> WorkConversationRow.State {
        if employee.status != "active" { return .disabled }
        let employeeRuns = runs(for: employee)
        if employeeRuns.contains(where: {
            ($0.status == .running || $0.status == .pending)
                && ($0.runPhase == "waiting_approval" || $0.runPhase == "waiting_user"
                    || $0.actions.contains(where: { ["blocked", "result_unknown"].contains($0.status) }))
        }) {
            return .waiting
        }
        if employeeRuns.contains(where: { $0.status == .running || $0.status == .pending }) {
            return .working
        }
        if employeeRuns.first?.status == .failed { return .failed }
        return .idle
    }

    private func runs(for employee: Employee) -> [TaskRun] {
        let conversationID = "conversation_\(employee.id)_primary"
        return store.runs.filter {
            $0.agentID == employee.id && $0.conversationID == conversationID
        }
    }

    private func relativeTime(for employee: Employee) -> String? {
        let value = WorkLibraryDemoData.current?.lastActivity[employee.id]
            ?? conversationStore.lastActivityByEmployee[employee.id]
        return WorkRelativeTime.label(value)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct WorkConversationRow: View {
    enum State { case idle, working, waiting, failed, disabled }
    let employee: Employee
    let preview: String
    let state: State
    let relativeTime: String?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle().fill(palette.primary.opacity(0.15)).frame(width: 34, height: 34)
                .overlay { Text(employee.name.prefix(1)).font(.caption.weight(.semibold)).foregroundStyle(palette.primaryActive) }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(employee.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink).lineLimit(1)
                    Circle().fill(stateColor).frame(width: 6, height: 6)
                    Spacer(minLength: 0)
                    if let relativeTime { Text(relativeTime).font(.caption2.monospacedDigit()).foregroundStyle(palette.mutedSoft) }
                }
                Text(preview).font(.caption).foregroundStyle(palette.muted).lineLimit(2)
            }
        }.padding(.vertical, 4)
    }

    private var stateColor: Color {
        switch state {
        case .idle: palette.success
        case .working: palette.accentTeal
        case .waiting: palette.warning
        case .failed: palette.error
        case .disabled: palette.mutedSoft
        }
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct EmployeeContextRow: View {
    let employee: Employee
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(palette.primary.opacity(0.16))
                .frame(width: 34, height: 34)
                .overlay { Text(employee.name.prefix(1)).font(.caption.weight(.semibold)).foregroundStyle(palette.primaryActive) }
            VStack(alignment: .leading, spacing: 2) {
                Text(employee.name).font(.callout.weight(.medium)).lineLimit(1)
                HStack(spacing: 5) {
                    Circle().fill(employee.status == "active" ? palette.success : palette.muted).frame(width: 5, height: 5)
                    Text("\(employee.role) · \(employee.status == "active" ? "可用" : "已停用")")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 3)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
