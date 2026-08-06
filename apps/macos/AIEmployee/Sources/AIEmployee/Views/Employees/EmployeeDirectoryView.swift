import SwiftUI
import AppKit

struct EmployeeDirectoryView: View {
    @ObservedObject var store: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    let openChat: (Employee) -> Void
    let editDemoEmployee: (Employee) -> Void
    @State private var query = ""
    @State private var compactShowsProfile = false
    @State private var confirmingRemoval: Employee?
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
        GeometryReader { proxy in
            if proxy.size.width >= 760 {
                HStack(spacing: 0) {
                    directory
                        .frame(width: min(280, max(232, proxy.size.width * 0.28)))
                    Divider().overlay(palette.hairlineSoft)
                    workspace(compact: false)
                }
            } else if compactShowsProfile, store.selected != nil {
                workspace(compact: true)
            } else {
                directory
            }
        }
        .background(palette.canvas)
        .moduleNavigationTitle(.contacts)
        .alert("无法完成操作", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("好") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .confirmationDialog("停用或删除 \(confirmingRemoval?.name ?? "员工")？", isPresented: Binding(get: { confirmingRemoval != nil }, set: { if !$0 { confirmingRemoval = nil } })) {
            Button("继续", role: .destructive) {
                if let employee = confirmingRemoval { Task { await store.remove(employee) } }
                confirmingRemoval = nil
            }
            Button("取消", role: .cancel) { confirmingRemoval = nil }
        } message: {
            Text("没有历史记录时会删除；存在对话或任务记录时只会停用，以保留证据。")
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
                HStack(spacing: 8) {
                    Text("AI 员工").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                    Text("\(employees.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.muted)
                    Spacer()
                    if demo != nil {
                        Text("演示数据").font(.caption2.weight(.medium)).foregroundStyle(palette.warning)
                            .padding(.horizontal, 7).padding(.vertical, 3).background(palette.primary.opacity(0.10), in: Capsule())
                    }
                    Button {
                        if demo == nil { store.create() } else { editDemoEmployee(.draft()) }
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(palette.body)
                    .help("新建员工")
                }
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.mutedSoft)
                    TextField("搜索姓名、岗位或部门", text: $query).textFieldStyle(.plain)
                }
                .padding(.horizontal, 11).frame(height: 34)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 9).stroke(palette.hairlineSoft) }
            }
            .padding(16)

            Divider().overlay(palette.hairlineSoft)

            if store.isLoading && demo == nil {
                ProgressView("正在读取员工…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredEmployees.isEmpty {
                ContentUnavailableView(query.isEmpty ? "还没有 AI 员工" : "没有匹配的员工", systemImage: "person.2", description: Text(query.isEmpty ? "创建员工后，会在这里管理他的 Profile。" : "尝试其他姓名、岗位或部门。"))
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

    private func employeeRow(_ employee: Employee) -> some View {
        Button {
            store.selection = employee.id
            compactShowsProfile = true
        } label: {
            HStack(spacing: 11) {
                EmployeeAvatar(name: employee.name, avatarPath: employee.avatarPath, size: 36)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(employee.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                        if employee.status != "active" { Text("已停用").font(.caption2).foregroundStyle(palette.muted) }
                    }
                    Text(employee.role).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                }
                Spacer(minLength: 4)
                Circle().fill(employee.status == "active" ? palette.success : palette.mutedSoft).frame(width: 7, height: 7)
            }
            .padding(.horizontal, 12).frame(height: 56)
            .background(store.selection == employee.id ? palette.primary.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).padding(.horizontal, 8)
        .contextMenu {
            if demo == nil {
                Button("编辑资料") { store.edit(employee) }
                Button("开始对话") { openChat(employee) }
                Divider()
                Button(employee.status == "active" ? "停用或删除" : "删除", role: .destructive) { confirmingRemoval = employee }
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
                openChat: { if demo == nil { openChat(employee) } }
            )
        } else {
            ContentUnavailableView {
                Label("AI 员工 Profile", systemImage: "person.text.rectangle")
            } description: {
                Text("选择一名员工，查看 Identity、Soul、能力与权限。")
            } actions: {
                Button("新建 AI 员工", action: store.create).buttonStyle(.borderedProminent)
            }
        }
    }

    private var filteredEmployees: [Employee] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return employees }
        return employees.filter { [$0.name, $0.role, $0.department].contains { $0.localizedCaseInsensitiveContains(needle) } }
    }
    private var departments: [String] { Array(Set(filteredEmployees.map(\.department))).sorted() }
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
                HStack {
                    Text("AI 员工")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(palette.ink)
                    Spacer()
                    Text("\(employees.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.muted)
                }
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.mutedSoft)
                    TextField("搜索姓名、岗位或部门", text: $query).textFieldStyle(.plain)
                }
                .padding(.horizontal, 11)
                .frame(height: 34)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 9).stroke(palette.hairlineSoft) }
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
                                    Button { store.selection = employee.id } label: {
                                        EmployeeContextRow(employee: employee)
                                            .padding(.horizontal, 11)
                                            .padding(.vertical, 7)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .contentShape(Rectangle())
                                            .background(
                                                store.selection == employee.id
                                                    ? palette.primary.opacity(0.12)
                                                    : Color.clear,
                                                in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                                            )
                                    }
                                    .buttonStyle(.plain)
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
    @State private var tab: EmployeeProfileTab = .identity
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            if compact {
                HStack {
                    Button(action: back) { Label("员工", systemImage: "chevron.left") }.buttonStyle(.plain)
                    Spacer()
                }.padding(.horizontal, 20).frame(height: 44)
                Divider().overlay(palette.hairlineSoft)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    profileHeader
                    CreamTabBar(items: EmployeeProfileTab.allCases, selection: $tab, title: \.title)
                        .frame(maxWidth: 600)

                    switch tab {
                    case .identity: promptPage(title: "身份提示词", detail: "定义这名 AI 员工是谁、负责什么，以及必须遵守的工作边界。", markdown: employee.basePrompt)
                    case .soul: promptPage(title: "灵魂提示词", detail: "定义思考、判断、沟通与行动方式。", markdown: employee.soul.joined(separator: "\n\n"))
                    case .capabilities: capabilityPage
                    }
                }
                .frame(maxWidth: 900, alignment: .leading)
                .padding(.horizontal, compact ? 20 : 36).padding(.vertical, compact ? 24 : 36)
                .frame(maxWidth: .infinity)
            }
        }
        .background(palette.canvas)
        .task(id: employee.id) {
            guard !isDemo else { return }
            await capabilityStore.reloadBoundSkills(for: employee.id)
        }
    }

    private var profileHeader: some View {
        HStack(alignment: .top, spacing: 16) {
            EmployeeAvatar(name: employee.name, avatarPath: employee.avatarPath, size: compact ? 52 : 64)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 9) {
                    Text(employee.name).font(.system(size: compact ? 25 : 30, weight: .semibold, design: .rounded)).foregroundStyle(palette.ink)
                    Text(employee.status == "active" ? "启用" : "停用")
                        .font(.caption.weight(.medium)).foregroundStyle(employee.status == "active" ? palette.success : palette.muted)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(palette.surfaceSoft, in: Capsule())
                }
                Text("\(employee.role) · \(employee.department)").font(.callout).foregroundStyle(palette.muted)
            }
            Spacer(minLength: 8)
            if !compact {
                Button("编辑资料", action: edit).buttonStyle(CreamSecondaryButtonStyle())
                Button("开始对话", action: openChat).buttonStyle(CreamPrimaryButtonStyle()).disabled(isDemo)
            }
            else { Menu { Button("编辑资料", action: edit); Button("开始对话", action: openChat).disabled(isDemo) } label: { Image(systemName: "ellipsis.circle") } }
        }
    }

    private func promptPage(title: String, detail: String, markdown: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) { Text(title).font(.title2.weight(.semibold)).foregroundStyle(palette.ink); Text(detail).font(.callout).foregroundStyle(palette.muted) }
            MarkdownDocumentView(source: markdown)
        }
    }

    private var capabilityPage: some View {
        VStack(alignment: .leading, spacing: 30) {
            HStack(spacing: 8) {
                if !isDemo {
                    Text(tasksEnabled ? "Runtime 已接通" : "尚未接通 Runtime")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(tasksEnabled ? palette.success : palette.warning)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background((tasksEnabled ? palette.success : palette.warning).opacity(0.12), in: Capsule())
                }
                Text("在「编辑资料」中选择 Skill/Tool；此页只读展示。")
                    .font(.caption)
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
                    ? "尚未选择工具。打开编辑资料进行选择。"
                    : "该员工可请求调用的 Tool Package。",
                items: capabilityProfile.selectedTools
            )
            permissionSection
        }
    }

    private func capabilitySection(title: String, description: String, items: [EmployeeCapabilityItem]) -> some View {
        profileSection(title) {
            VStack(alignment: .leading, spacing: 14) {
                Text(description).font(.callout).foregroundStyle(palette.muted)
                if items.isEmpty {
                    HStack(spacing: 12) {
                        Image(systemName: title == "技能" ? "sparkles" : "wrench.and.screwdriver").foregroundStyle(palette.primaryActive)
                        Text("当前未配置\(title)").font(.callout).foregroundStyle(palette.body)
                    }.padding(.vertical, 10)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            HStack(spacing: 12) {
                                Image(systemName: item.kind == .skill ? "sparkles" : "wrench.and.screwdriver")
                                    .foregroundStyle(palette.primaryActive).frame(width: 22)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 7) {
                                        Text(item.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                                        Text("v\(item.version)").font(.caption.monospaced()).foregroundStyle(palette.muted)
                                    }
                                    Text(item.detail).font(.caption).foregroundStyle(palette.muted).lineLimit(2)
                                    Text(item.metadata).font(.caption2).foregroundStyle(palette.mutedSoft)
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
                Label(isDemo ? "尚无可配置权限" : "当前无额外权限；普通对话不请求本地系统能力", systemImage: "lock.shield")
                    .foregroundStyle(palette.body)
                    .padding(.vertical, 10)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(capabilityProfile.permissions.enumerated()), id: \.element.id) { index, permission in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "lock.shield").foregroundStyle(palette.primaryActive).frame(width: 22)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(permission.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                                Text("\(permission.resource) · 来源：\(permission.source)").font(.caption).foregroundStyle(palette.muted)
                                if let confirmation = permission.confirmation { Text("执行确认：\(confirmation)").font(.caption2).foregroundStyle(palette.mutedSoft) }
                            }
                            Spacer()
                            Text(permission.effect).font(.caption.weight(.semibold)).foregroundStyle(permission.effect == "允许" ? palette.success : palette.error)
                        }.padding(.vertical, 12)
                        if index < capabilityProfile.permissions.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
            }
        }
    }

    private func profileSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View { VStack(alignment: .leading, spacing: 12) { Text(title).font(.headline).foregroundStyle(palette.ink); content() }.frame(maxWidth: .infinity, alignment: .leading) }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct EmployeeAvatar: View {
    let name: String
    var avatarPath: String? = nil
    let size: CGFloat
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        Group {
            if let avatarPath, let image = NSImage(contentsOfFile: avatarPath) {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                Text(String(name.prefix(1)).uppercased()).font(.system(size: size * 0.34, weight: .semibold)).foregroundStyle(palette.primaryActive)
            }
        }
        .frame(width: size, height: size)
        .background(palette.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: size * 0.28).stroke(palette.primary.opacity(0.12)) }
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

enum CapabilityPickerKind: String, Identifiable {
    case skill, tool
    var id: String { rawValue }
    var title: String { self == .skill ? "添加技能" : "添加工具" }
    var emptyTitle: String { self == .skill ? "技能库中还没有可用技能" : "工具库中还没有可用工具" }
    var icon: String { self == .skill ? "sparkles" : "wrench.and.screwdriver" }
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
            HStack { Image(systemName: "magnifyingglass"); TextField(kind == .skill ? "搜索技能库" : "搜索工具库", text: $query).textFieldStyle(.plain) }.foregroundStyle(palette.muted).padding(.horizontal, 12).frame(height: 36).background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: 9)).padding(16)
            if filteredItems.isEmpty {
                ContentUnavailableView(kind.emptyTitle, systemImage: kind.icon, description: Text("安装并启用后，目录内容会出现在这里。"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredItems) { item in
                            Button {
                                guard item.isAvailable else { return }
                                if selectedIDs.contains(item.id) { selectedIDs.remove(item.id) } else { selectedIDs.insert(item.id) }
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: selectedIDs.contains(item.id) ? "checkmark.square.fill" : "square")
                                        .foregroundStyle(item.isAvailable ? palette.primaryActive : palette.mutedSoft).font(.system(size: 16))
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack { Text(item.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink); Text("v\(item.version)").font(.caption.monospaced()).foregroundStyle(palette.muted); Spacer(); if !item.isAvailable { Text("不可用").font(.caption).foregroundStyle(palette.error) } }
                                        Text(item.detail).font(.caption).foregroundStyle(palette.muted).lineLimit(2)
                                        Text(item.metadata).font(.caption2).foregroundStyle(palette.mutedSoft)
                                    }
                                }.padding(.horizontal, 18).padding(.vertical, 12).contentShape(Rectangle())
                            }.buttonStyle(.plain).disabled(!item.isAvailable)
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
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(MarkdownBlock.parse(source).enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .frame(maxWidth: 720, alignment: .leading).padding(20)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
        .textSelection(.enabled)
    }
    @ViewBuilder private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text): Text(text).font(level == 1 ? .title2.weight(.semibold) : level == 2 ? .title3.weight(.semibold) : .headline).foregroundStyle(palette.ink).padding(.top, level == 1 ? 4 : 8)
        case .paragraph(let text): Text(inline(text)).foregroundStyle(palette.body).lineSpacing(3)
        case .bullet(let text): Label { Text(inline(text)).foregroundStyle(palette.body) } icon: { Image(systemName: "circle.fill").font(.system(size: 5)).foregroundStyle(palette.primaryActive) }
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
