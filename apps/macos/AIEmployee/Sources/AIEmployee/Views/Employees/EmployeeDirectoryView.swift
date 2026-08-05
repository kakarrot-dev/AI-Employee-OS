import SwiftUI

struct EmployeeDirectoryView: View {
    @ObservedObject var store: EmployeeStore
    let openChat: (Employee) -> Void
    @State private var query = ""
    @State private var confirmingRemoval: Employee?
    @Environment(\.colorScheme) private var colorScheme

    private var filtered: [Employee] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return store.employees }
        return store.employees.filter { [$0.name, $0.role, $0.department].contains { $0.localizedCaseInsensitiveContains(needle) } }
    }

    var body: some View {
        HSplitView {
            VStack(spacing: 0) {
                HStack {
                    TextField("搜索员工", text: $query).textFieldStyle(.roundedBorder)
                    Button(action: store.create) { Image(systemName: "plus") }.help("新建员工")
                }
                .padding(AppTheme.Spacing.md)
                Divider()
                if store.isLoading {
                    ProgressView("正在读取员工…").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filtered.isEmpty {
                    ContentUnavailableView("没有员工", systemImage: "person.2", description: Text("新建一名员工，配置其身份、灵魂与提示词。"))
                } else {
                    List(filtered, selection: $store.selection) { employee in
                        EmployeeDirectoryRow(employee: employee).tag(employee.id)
                            .contextMenu {
                                Button("编辑") { store.edit(employee) }
                                Divider()
                                Button(employee.status == "active" ? "停用或删除" : "删除", role: .destructive) { confirmingRemoval = employee }
                            }
                    }
                    .listStyle(.sidebar)
                }
            }
            .frame(minWidth: 260, idealWidth: 300, maxWidth: 360)
            .background(palette.surfaceSoft)

            if let employee = store.selected {
                EmployeeDetailView(employee: employee, store: store, openChat: { openChat(employee) })
                    .frame(minWidth: 520)
            } else {
                ContentUnavailableView("选择一名员工", systemImage: "person.text.rectangle")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("员工")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button("新建员工", systemImage: "person.badge.plus", action: store.create) }
        }
        .alert("无法完成操作", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) { Button("好") { store.error = nil } } message: { Text(store.error ?? "") }
        .confirmationDialog("停用或删除 \(confirmingRemoval?.name ?? "员工")？", isPresented: Binding(get: { confirmingRemoval != nil }, set: { if !$0 { confirmingRemoval = nil } })) {
            Button("继续", role: .destructive) { if let employee = confirmingRemoval { Task { await store.remove(employee) } }; confirmingRemoval = nil }
            Button("取消", role: .cancel) { confirmingRemoval = nil }
        } message: { Text("没有历史记录时会删除；存在对话或任务记录时只会停用，以保留证据。") }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmployeeDirectoryRow: View {
    let employee: Employee
    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Circle().fill(employee.status == "active" ? Color(hex: 0x4B6F3D) : Color.secondary.opacity(0.35)).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(employee.name).font(.body.weight(.medium))
                Text("\(employee.role) · \(employee.department)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }.padding(.vertical, 4)
    }
}

private struct EmployeeDetailView: View {
    let employee: Employee
    @ObservedObject var store: EmployeeStore
    let openChat: () -> Void
    @State private var prompt: EffectivePromptResponse?
    @State private var showsPrompt = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
                    Circle().fill(palette.primary.opacity(0.14)).frame(width: 56, height: 56).overlay { Text(employee.name.prefix(1)).font(.title2.weight(.semibold)).foregroundStyle(palette.primaryActive) }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(employee.name).font(.largeTitle.weight(.semibold)).foregroundStyle(palette.ink)
                        Text("\(employee.role) · \(employee.department)").foregroundStyle(palette.muted)
                    }
                    Spacer()
                    Button("编辑") { store.edit(employee) }
                    Button("开始对话", action: openChat).buttonStyle(.borderedProminent)
                }
                Divider()
                detailSection("使命") { Text(employee.mission).font(.title3).foregroundStyle(palette.body).textSelection(.enabled) }
                HStack(alignment: .top, spacing: AppTheme.Spacing.xxl) {
                    detailSection("职责") { bulletList(employee.responsibilities) }
                    detailSection("工作边界") { bulletList(employee.boundaries) }
                }
                detailSection("Soul") { bulletList(employee.soul) }
                detailSection("Persona") {
                    LabeledContent("沟通", value: employee.persona.communication.style)
                    LabeledContent("语气", value: employee.persona.communication.tone)
                    LabeledContent("思考", value: employee.persona.thinking.approach)
                    LabeledContent("输出", value: employee.persona.habit.outputFormat)
                }
                detailSection("能力基线") {
                    HStack { Label("Skills 0", systemImage: "sparkles"); Label("Tools 0", systemImage: "wrench.and.screwdriver") }.foregroundStyle(palette.muted)
                    Text("当前员工只使用 Identity、Soul、Persona 与基础 Prompt，适合作为能力增强实验的基线。").font(.caption).foregroundStyle(palette.muted)
                }
                DisclosureGroup("Effective Prompt · v\(employee.configVersion)", isExpanded: $showsPrompt) {
                    Group {
                        if let prompt { Text(prompt.prompt).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
                        else { ProgressView().controlSize(.small) }
                    }.padding(.top, AppTheme.Spacing.sm)
                }
                .onChange(of: showsPrompt) { _, expanded in if expanded && prompt == nil { Task { prompt = try? await store.effectivePrompt(for: employee.id) } } }
            }
            .frame(maxWidth: 820, alignment: .leading)
            .padding(AppTheme.Spacing.xl)
        }.background(palette.canvas)
    }

    private func detailSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View { VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) { Text(title).font(.headline).foregroundStyle(palette.ink); content() }.frame(maxWidth: .infinity, alignment: .leading) }
    private func bulletList(_ values: [String]) -> some View { VStack(alignment: .leading, spacing: 7) { ForEach(values, id: \.self) { Text("•  \($0)").foregroundStyle(palette.body) }; if values.isEmpty { Text("未配置").foregroundStyle(palette.muted) } } }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
