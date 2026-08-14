import SwiftUI

struct EmployeeDirectoryView: View {
    @ObservedObject var store: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    let openChat: (Employee) -> Void
    let editDemoEmployee: (Employee) -> Void
    @State private var query = ""
    @State private var compactShowsProfile = false
    @State private var confirmingDeletion: Employee?
    @Environment(\.colorScheme) private var colorScheme

    private var demo: ContactsDemoData? { ContactsDemoData.current }
    private var employees: [Employee] { demo?.employees ?? store.employees }
    private var selectedEmployee: Employee? {
        employees.first { $0.id == store.selection } ?? employees.first
    }

    private var liveCapabilityProfile: EmployeeCapabilityProfile {
        guard let id = selectedEmployee?.id else { return .empty }
        return capabilityStore.capabilityProfile(for: id)
    }

    var body: some View {
        AdaptiveBrowser(profile: .contacts, compactShowsDetail: $compactShowsProfile) {
            directory
        } detail: { showsBack in
            workspace(compact: showsBack)
        }
        .background(palette.canvas)
        .moduleNavigationTitle(.contacts)
        .alert("无法完成操作", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("好") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .confirmationDialog("永久删除 \(confirmingDeletion?.name ?? "员工")？", isPresented: Binding(get: { confirmingDeletion != nil }, set: { if !$0 { confirmingDeletion = nil } })) {
            Button("永久删除", role: .destructive) {
                if let employee = confirmingDeletion { Task { await store.delete(employee) } }
                confirmingDeletion = nil
            }
            Button("取消", role: .cancel) { confirmingDeletion = nil }
        } message: {
            Text("员工资料、能力配置和私人对话将被物理删除；工作库中的历史工作、参与者进度和交付结果会继续保留。此操作无法撤销。")
        }
        .onAppear {
            if let demo, !demo.employees.contains(where: { $0.id == store.selection }) {
                store.selection = demo.employees.first?.id
            }
        }
    }

    private var directory: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: AppTheme.Spacing.xs) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        Text("AI 员工")
                            .font(AppTheme.Typography.sectionTitle)
                            .foregroundStyle(palette.ink)
                        Text("\(employees.count)")
                            .font(AppTheme.Typography.metadata().monospacedDigit())
                            .foregroundStyle(palette.muted)
                            .accessibilityLabel("共 \(employees.count) 名员工")
                    }
                    Spacer(minLength: AppTheme.Spacing.sm)
                    HStack(spacing: AppTheme.Spacing.xs) {
                        if demo != nil {
                            CreamStatusBadge(title: "演示数据", systemImage: "sparkles", tone: .warning)
                        }
                        CreamIconButton(
                            systemName: "person.badge.plus",
                            accessibilityLabel: "新建员工",
                            help: "新建员工",
                            tone: .primary,
                            action: { if demo == nil { store.create() } else { editDemoEmployee(.draft()) } }
                        )
                    }
                }
                .frame(minHeight: AppTheme.Control.hitTarget)
                CreamSearchField("搜索姓名、岗位或部门", text: $query, accessibilityLabel: "搜索员工")
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if store.isLoading && demo == nil {
                ProgressView("正在读取员工…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredEmployees.isEmpty {
                directoryEmptyState
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(departments, id: \.self) { department in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(department).font(.caption.weight(.semibold)).foregroundStyle(palette.muted).padding(.horizontal, 16)
                                ForEach(filteredEmployees.filter { $0.department == department }) { employee in
                                    employeeRow(employee)
                                }
                            }
                        }
                    }.padding(.vertical, 14)
                }
            }
        }
        .background(palette.surfaceSoft)
    }

    private var directoryEmptyState: some View {
        VStack(spacing: 10) {
            CreamSymbol(systemName: query.isEmpty ? "person.2" : "magnifyingglass", scale: .feature)
                .foregroundStyle(palette.mutedSoft)
            Text(query.isEmpty ? "还没有 AI 员工" : "没有匹配的员工")
                .font(.callout.weight(.semibold))
                .foregroundStyle(palette.ink)
            Text(query.isEmpty ? "点右上角新建，或从右侧开始创建。" : "尝试其他姓名、岗位或部门。")
                .font(.caption)
                .foregroundStyle(palette.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .padding(.bottom, 24)
    }

    private func employeeRow(_ employee: Employee) -> some View {
        CreamInteractiveRow(
            isSelected: store.selection == employee.id,
            accessibilityLabel: "\(employee.name)，\(employee.role)，\(employee.status == "active" ? "可用" : "已停用")",
            action: {
                store.selection = employee.id
                compactShowsProfile = true
            }
        ) {
            HStack(spacing: 11) {
                CreamAvatar(path: employee.avatarPath, name: employee.name, size: 36)
                VStack(alignment: .leading, spacing: 3) {
                    Text(employee.name)
                        .font(AppTheme.Typography.sidebarTitle())
                        .foregroundStyle(palette.ink)
                        .lineLimit(1)
                    HStack(spacing: AppTheme.Spacing.xxs) {
                        Text(employee.role)
                            .font(AppTheme.Typography.metadata())
                            .foregroundStyle(palette.muted)
                            .lineLimit(1)
                        Spacer(minLength: AppTheme.Spacing.xxs)
                        CreamStatusLabel(
                            title: employee.status == "active" ? "可用" : "已停用",
                            systemImage: employee.status == "active" ? "checkmark.circle.fill" : "pause.circle.fill",
                            tone: employee.status == "active" ? .success : .neutral
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .frame(height: 56)
            .contentShape(Rectangle())
        }
        .padding(.horizontal, 8)
        .contextMenu {
            if demo == nil {
                Button("编辑资料") { store.edit(employee) }
                Button("私人聊聊") { openChat(employee) }
                Divider()
                Button(employee.status == "active" ? "禁用" : "启用") {
                    Task { await store.setStatus(employee, status: employee.status == "active" ? "disabled" : "active") }
                }
                Divider()
                Button("删除", role: .destructive) { requestDeletion(employee) }
            } else {
                Text("演示数据不可修改")
            }
        }
    }

    @ViewBuilder
    private func workspace(compact: Bool) -> some View {
        if let employee = selectedEmployee {
            EmployeeProfileView(
                employee: employee,
                store: store,
                capabilityStore: capabilityStore,
                capabilityProfile: demo?.capabilities[employee.id] ?? liveCapabilityProfile,
                tasksEnabled: demo != nil ? true : capabilityStore.tasksEnabled,
                isDemo: demo != nil,
                compact: compact,
                back: { compactShowsProfile = false },
                edit: {
                    if demo == nil { store.edit(employee) } else { editDemoEmployee(employee) }
                },
                openChat: { if demo == nil { openChat(employee) } },
                setStatus: {
                    guard demo == nil else { return }
                    Task { await store.setStatus(employee, status: employee.status == "active" ? "disabled" : "active") }
                },
                deleteEmployee: {
                    guard demo == nil else { return }
                    requestDeletion(employee)
                }
            )
        } else {
            VStack(spacing: 14) {
                CreamSymbol(systemName: "person.text.rectangle", scale: .emptyState)
                    .foregroundStyle(palette.primaryActive)
                Text("AI 员工 Profile")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(palette.ink)
                Text("选择一名员工，查看 Identity、Soul、能力与权限。")
                    .font(.callout)
                    .foregroundStyle(palette.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 360)
                Button("新建 AI 员工") {
                    if demo == nil { store.create() } else { editDemoEmployee(.draft()) }
                }
                .buttonStyle(CreamPrimaryButtonStyle())
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.canvas)
        }
    }

    private var filteredEmployees: [Employee] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return employees }
        return employees.filter { [$0.name, $0.role, $0.department].contains { $0.localizedCaseInsensitiveContains(needle) } }
    }
    private var departments: [String] { Array(Set(filteredEmployees.map(\.department))).sorted() }

    private func requestDeletion(_ employee: Employee) {
        Task {
            guard let check = await store.deleteCheck(employee) else { return }
            if check.deletable {
                confirmingDeletion = employee
            } else {
                let count = check.activeWorkCount
                store.error = "\(employee.name) 正在参与 \(count) 项工作，请先完成或取消相关任务后再删除。"
            }
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct EmployeeDirectorySidebar: View {
    @ObservedObject var store: EmployeeStore
    @State private var query = ""
    @Environment(\.colorScheme) private var colorScheme

    private var employees: [Employee] {
        let source = ContactsDemoData.current?.employees ?? store.employees
        guard !query.isEmpty else { return source }
        return source.filter {
            $0.name.localizedCaseInsensitiveContains(query)
                || $0.role.localizedCaseInsensitiveContains(query)
                || $0.department.localizedCaseInsensitiveContains(query)
        }
    }

    private var departments: [String] {
        Array(Set(employees.map(\.department))).sorted()
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                CreamSectionHeader("AI 员工", count: employees.count)
                CreamSearchField("搜索姓名、岗位或部门", text: $query, accessibilityLabel: "搜索员工")
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if store.isLoading && employees.isEmpty {
                ProgressView("正在读取员工…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = store.error, employees.isEmpty {
                UXFeedbackStateView(
                    title: "无法读取员工",
                    message: "已有员工资料没有被修改。\(error)",
                    systemImage: "exclamationmark.triangle.fill",
                    tone: .error,
                    actionTitle: "重试",
                    action: { Task { await store.reload() } }
                )
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if employees.isEmpty {
                UXFeedbackStateView(
                    title: query.isEmpty ? "还没有 AI 员工" : "没有匹配的员工",
                    message: query.isEmpty ? "创建员工后，会在这里管理他的 Profile。" : "尝试其他姓名、岗位或部门。",
                    systemImage: query.isEmpty ? "person.2" : "magnifyingglass",
                    actionTitle: query.isEmpty ? "新建 AI 员工" : "清除搜索",
                    action: query.isEmpty ? store.create : { query = "" }
                )
                .padding(AppTheme.Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(departments, id: \.self) { department in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(department)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(palette.muted)
                                    .padding(.horizontal, 16)
                                ForEach(employees.filter { $0.department == department }) { employee in
                                    CreamInteractiveRow(
                                        isSelected: store.selection == employee.id,
                                        accessibilityLabel: "\(employee.name)，\(employee.role)，\(employee.status == "active" ? "可用" : "已停用")",
                                        action: { store.selection = employee.id }
                                    ) {
                                        EmployeeContextRow(employee: employee)
                                            .padding(.horizontal, 11)
                                            .padding(.vertical, 7)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .contentShape(Rectangle())
                                    }
                                    .padding(.horizontal, 8)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 14)
                }
            }
        }
        .background(palette.surfaceSoft)
        .task {
            if store.employees.isEmpty, ContactsDemoData.current == nil {
                await store.reload()
            }
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum EmployeeProfileTab: String, CaseIterable, Identifiable {
    case identity, soul, capabilities
    var id: String { rawValue }
    var title: String {
        switch self { case .identity: "身份"; case .soul: "灵魂"; case .capabilities: "能力与权限" }
    }
}

private struct EmployeeProfileView: View {
    let employee: Employee
    @ObservedObject var store: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    let capabilityProfile: EmployeeCapabilityProfile
    let tasksEnabled: Bool
    let isDemo: Bool
    let compact: Bool
    let back: () -> Void
    let edit: () -> Void
    let openChat: () -> Void
    let setStatus: () -> Void
    let deleteEmployee: () -> Void
    @State private var tab: EmployeeProfileTab = .identity
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            if compact {
                HStack {
                    Button(action: back) { Label("员工", systemImage: "chevron.left") }
                        .buttonStyle(CreamSecondaryButtonStyle())
                    Spacer()
                }.padding(.horizontal, 20).frame(height: 44)
                Divider().overlay(palette.hairlineSoft)
            }
            ScrollView {
                CreamTabbedPageContainer {
                    VStack(alignment: .leading, spacing: 28) {
                        CreamTabbedDetailHeader(
                            title: employee.name,
                            subtitle: "\(employee.role) · \(employee.department)",
                            statusTitle: employee.status == "active" ? "启用" : "停用",
                            statusSystemImage: employee.status == "active" ? "checkmark.circle.fill" : "pause.circle.fill",
                            statusTone: employee.status == "active" ? .success : .neutral,
                            tabs: EmployeeProfileTab.allCases,
                            selection: $tab,
                            tabTitle: \.title
                        ) {
                            CreamAvatar(path: employee.avatarPath, name: employee.name, size: compact ? 52 : 64)
                        } actions: {
                            profileActions
                        }

                        switch tab {
                        case .identity: promptPage(title: "身份提示词", detail: "定义这名 AI 员工是谁、负责什么，以及必须遵守的工作边界。", markdown: employee.basePrompt)
                        case .soul: promptPage(title: "灵魂提示词", detail: "定义思考、判断、沟通与行动方式。", markdown: employee.soul.joined(separator: "\n\n"))
                        case .capabilities: capabilityPage
                        }
                    }
                }
                .padding(.vertical, compact ? 24 : 36)
            }
        }
        .background(palette.canvas)
        .task(id: employee.id) {
            guard !isDemo else { return }
            await capabilityStore.reloadBoundSkills(for: employee.id)
        }
    }

    @ViewBuilder private var profileActions: some View {
        if !compact {
            HStack(spacing: AppTheme.Spacing.xxs) {
                CreamIconButton(
                    systemName: "pencil",
                    accessibilityLabel: "编辑资料",
                    help: "编辑\(employee.name)的资料",
                    action: edit
                )
                CreamIconButton(
                    systemName: "bubble.left",
                    accessibilityLabel: "私人聊聊",
                    help: "与\(employee.name)私人聊聊",
                    action: openChat
                )
                .disabled(isDemo)
                if !isDemo {
                    CreamIconMenu(
                        systemName: "ellipsis",
                        accessibilityLabel: "更多员工操作",
                        help: "更多员工操作"
                    ) {
                        Button(employee.status == "active" ? "禁用" : "启用", action: setStatus)
                        Divider()
                        Button("删除", role: .destructive, action: deleteEmployee)
                    }
                }
            }
        } else {
            CreamIconMenu(
                systemName: "ellipsis",
                accessibilityLabel: "员工操作",
                help: "员工操作"
            ) {
                Button("编辑资料", action: edit)
                Button("私人聊聊", action: openChat).disabled(isDemo)
                if !isDemo {
                    Divider()
                    Button(employee.status == "active" ? "禁用" : "启用", action: setStatus)
                    Divider()
                    Button("删除", role: .destructive, action: deleteEmployee)
                }
            }
        }
    }

    private func promptPage(title: String, detail: String, markdown: String) -> some View {
        CreamTabContentSection(title, subtitle: detail) {
            MarkdownDocumentView(source: markdown, maxWidth: .infinity, showsSurface: false)
        }
    }

    private var capabilityPage: some View {
        VStack(alignment: .leading, spacing: 30) {
            HStack(spacing: 8) {
                if !isDemo {
                    CreamStatusBadge(
                        title: tasksEnabled ? "Runtime 已接通" : "尚未接通 Runtime",
                        systemImage: tasksEnabled ? "checkmark.circle.fill" : "exclamationmark.triangle.fill",
                        tone: tasksEnabled ? .success : .warning
                    )
                }
                Text("在「编辑资料」中选择 Skill/Tool；此页只读展示。")
                    .font(AppTheme.Typography.metadata())
                    .foregroundStyle(palette.muted)
            }
            capabilitySection(
                title: "技能",
                description: capabilityProfile.selectedSkills.isEmpty
                    ? "尚未绑定技能。打开编辑资料进行选择。"
                    : "已绑定到该员工的 Skill Package。",
                items: capabilityProfile.selectedSkills
            )
            capabilitySection(
                title: "工具",
                description: capabilityProfile.selectedTools.isEmpty
                    ? "当前没有全局安装的 Tool Package。"
                    : "全局已安装的 Tool Package；员工通过已绑定 Skill 的声明获得调用能力。",
                items: capabilityProfile.selectedTools
            )
            permissionSection
        }
    }

    private func capabilitySection(title: String, description: String, items: [EmployeeCapabilityItem]) -> some View {
        profileSection(title) {
            VStack(alignment: .leading, spacing: 14) {
                Text(description).font(AppTheme.Typography.interfaceBody()).foregroundStyle(palette.muted)
                if items.isEmpty {
                    HStack(spacing: 12) {
                        CreamSymbol(systemName: title == "技能" ? "sparkles" : "wrench.and.screwdriver")
                            .foregroundStyle(palette.primaryActive)
                        Text("当前未配置\(title)").font(AppTheme.Typography.interfaceBody()).foregroundStyle(palette.body)
                    }.padding(.vertical, 10)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            HStack(spacing: 12) {
                                CreamSymbol(systemName: item.kind == .skill ? "sparkles" : "wrench.and.screwdriver")
                                    .foregroundStyle(palette.primaryActive)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 7) {
                                        Text(item.name).font(AppTheme.Typography.interfaceBody(weight: .semibold)).foregroundStyle(palette.ink)
                                        Text("v\(item.version)").font(AppTheme.Typography.metadata().monospaced()).foregroundStyle(palette.muted)
                                    }
                                    Text(item.detail).font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted).lineLimit(2)
                                    Text(item.metadata).font(AppTheme.Typography.compactMetadata()).foregroundStyle(palette.mutedSoft)
                                }
                                Spacer()
                            }
                            .padding(.vertical, 12)
                            if index < items.count - 1 { Divider().overlay(palette.hairlineSoft) }
                        }
                    }
                }
            }
        }
    }

    private var permissionSection: some View {
        profileSection("权限") {
            if capabilityProfile.permissions.isEmpty {
                Label(isDemo ? "尚无可配置权限" : "客户端暂不展示 Runtime 权限明细", systemImage: "lock.shield")
                    .foregroundStyle(palette.body)
                    .padding(.vertical, 10)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(capabilityProfile.permissions.enumerated()), id: \.element.id) { index, permission in
                        HStack(alignment: .top, spacing: 12) {
                            CreamSymbol(systemName: "lock.shield")
                                .foregroundStyle(palette.primaryActive)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(permission.name).font(AppTheme.Typography.interfaceBody(weight: .semibold)).foregroundStyle(palette.ink)
                                Text("\(permission.resource) · 来源：\(permission.source)").font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted)
                                if let confirmation = permission.confirmation { Text("执行确认：\(confirmation)").font(AppTheme.Typography.compactMetadata()).foregroundStyle(palette.mutedSoft) }
                            }
                            Spacer()
                            Text(permission.effect).font(AppTheme.Typography.metadata(weight: .semibold)).foregroundStyle(permission.effect == "允许" ? palette.success : palette.error)
                        }.padding(.vertical, 12)
                        if index < capabilityProfile.permissions.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
            }
        }
    }

    private func profileSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(AppTheme.Typography.workspaceTitle).foregroundStyle(palette.ink)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

enum CapabilityPickerKind: String, Identifiable {
    case skill
    var id: String { rawValue }
    var title: String { "添加技能" }
    var emptyTitle: String { "技能库中还没有可用技能" }
    var icon: String { "sparkles" }
}

struct CapabilityPickerSheet: View {
    let kind: CapabilityPickerKind
    let employeeName: String
    let items: [EmployeeCapabilityItem]
    let isDemo: Bool
    let close: () -> Void
    let apply: (Set<String>) -> Void
    @State private var selectedIDs: Set<String>
    @State private var query = ""
    @Environment(\.colorScheme) private var colorScheme

    init(kind: CapabilityPickerKind, employeeName: String, items: [EmployeeCapabilityItem], initiallySelected: Set<String>, isDemo: Bool, close: @escaping () -> Void, apply: @escaping (Set<String>) -> Void) {
        self.kind = kind
        self.employeeName = employeeName
        self.items = items
        self.isDemo = isDemo
        self.close = close
        self.apply = apply
        _selectedIDs = State(initialValue: initiallySelected)
    }

    private var filteredItems: [EmployeeCapabilityItem] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return needle.isEmpty ? items : items.filter { $0.name.localizedCaseInsensitiveContains(needle) || $0.detail.localizedCaseInsensitiveContains(needle) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack { VStack(alignment: .leading, spacing: 3) { Text(kind.title).font(.title2.weight(.semibold)); Text("为 \(employeeName) 选择，保存后显示在 Profile 中").font(.caption).foregroundStyle(palette.muted) }; Spacer() }.padding(20)
            Divider().overlay(palette.hairlineSoft)
            CreamSearchField("搜索技能库", text: $query, accessibilityLabel: "搜索技能库")
                .padding(16)
            if filteredItems.isEmpty {
                ContentUnavailableView(kind.emptyTitle, systemImage: kind.icon, description: Text("安装并启用后，目录内容会出现在这里。"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredItems) { item in
                            CreamInteractiveRow(
                                isSelected: selectedIDs.contains(item.id),
                                accessibilityLabel: "\(item.name)，\(selectedIDs.contains(item.id) ? "已选择" : "未选择")",
                                action: {
                                    guard item.isAvailable else { return }
                                    if selectedIDs.contains(item.id) { selectedIDs.remove(item.id) } else { selectedIDs.insert(item.id) }
                                }
                            ) {
                                HStack(alignment: .top, spacing: 12) {
                                    CreamSymbol(systemName: selectedIDs.contains(item.id) ? "checkmark.square.fill" : "square")
                                        .foregroundStyle(item.isAvailable ? palette.primaryActive : palette.mutedSoft)
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack { Text(item.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink); Text("v\(item.version)").font(.caption.monospaced()).foregroundStyle(palette.muted); Spacer(); if !item.isAvailable { Text("不可用").font(.caption).foregroundStyle(palette.error) } }
                                        Text(item.detail).font(.caption).foregroundStyle(palette.muted).lineLimit(2)
                                        Text(item.metadata).font(.caption2).foregroundStyle(palette.mutedSoft)
                                    }
                                }.padding(.horizontal, 18).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .disabled(!item.isAvailable)
                            Divider().overlay(palette.hairlineSoft).padding(.leading, 46)
                        }
                    }
                }
            }
            Divider().overlay(palette.hairlineSoft)
            HStack {
                if isDemo { Text("演示模式仅更新本页展示").font(.caption).foregroundStyle(palette.warning) }
                Spacer()
                Button("取消", action: close).buttonStyle(CreamSecondaryButtonStyle())
                Button("添加 \(selectedIDs.count) 项") { apply(selectedIDs) }
                    .buttonStyle(CreamPrimaryButtonStyle())
                    .disabled(items.isEmpty)
            }.padding(16)
        }
        .frame(minWidth: 520, idealWidth: 680, minHeight: 420, idealHeight: 620)
        .background(palette.canvas)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct MarkdownDocumentView: View {
    let source: String
    var maxWidth: CGFloat = 760
    var showsSurface = true
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        document
            .textSelection(.enabled)
    }

    @ViewBuilder private var document: some View {
        if showsSurface {
            CreamContentSurface(maxWidth: maxWidth) {
                documentBody
            }
        } else {
            documentBody
                .frame(maxWidth: maxWidth, alignment: .leading)
        }
    }

    private var documentBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MarkdownBlock.parse(source).enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
    }
    @ViewBuilder private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text): Text(text).font(level == 1 ? .title2.weight(.semibold) : level == 2 ? .title3.weight(.semibold) : .headline).foregroundStyle(palette.ink).padding(.top, level == 1 ? 4 : 8)
        case .paragraph(let text): Text(inline(text)).foregroundStyle(palette.body).lineSpacing(3)
        case .bullet(let text): HStack(alignment: .firstTextBaseline, spacing: AppTheme.Spacing.xs) { Circle().fill(palette.primaryActive).frame(width: 5, height: 5); Text(inline(text)).foregroundStyle(palette.body) }
        case .numbered(let text): Text(inline(text)).foregroundStyle(palette.body)
        case .quote(let text): Text(inline(text)).foregroundStyle(palette.muted).padding(.leading, 12).overlay(alignment: .leading) { Rectangle().fill(palette.primary.opacity(0.4)).frame(width: 2) }
        case .code(let text): Text(text).font(.system(.caption, design: .monospaced)).foregroundStyle(palette.body).padding(12).frame(maxWidth: .infinity, alignment: .leading).background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: 8))
        case .table(let headers, let rows): Text(([headers] + rows).map { $0.joined(separator: "  ·  ") }.joined(separator: "\n")).font(.callout.monospaced()).foregroundStyle(palette.body)
        case .divider: Divider().overlay(palette.hairline)
        case .spacing: Color.clear.frame(height: 4)
        }
    }
    private func inline(_ text: String) -> AttributedString { (try? AttributedString(markdown: text)) ?? AttributedString(text) }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
