import SwiftUI
import UniformTypeIdentifiers

struct EmployeeEditorView: View {
    @State var employee: Employee
    @ObservedObject var store: EmployeeStore
    @ObservedObject var capabilityStore: CapabilityStore
    let isDemo: Bool
    let close: () -> Void
    @State private var section: EmployeeEditorSection = .profile
    @State private var soulPrompt = ""
    @State private var isSaving = false
    @State private var promptMode: EmployeePromptMode = .edit
    @State private var isChoosingAvatar = false
    @State private var avatarError: String?
    @State private var selectedSkillIDs: Set<String> = []
    @State private var capabilityPicker: CapabilityPickerKind?
    @State private var isCapabilityPickerBackgroundDisabled = false
    @State private var saveError: String?
    @State private var attemptedSave = false
    @State private var touchedFields: Set<EmployeeDraftField> = []
    @FocusState private var focusedField: EmployeeDraftField?
    @Environment(\.colorScheme) private var colorScheme

    private var isNew: Bool { store.employees.allSatisfy { $0.id != employee.id } }
    private var validationErrors: [EmployeeDraftField: String] {
        EmployeeDraftValidation.errors(employee: employee, soulPrompt: soulPrompt)
    }

    private var skillCatalog: [EmployeeCapabilityItem] {
        if isDemo {
            return ContactsDemoData.current?.capabilities[employee.id]?.skillCatalog
                ?? ContactsDemoData.current?.capabilities.values.first?.skillCatalog
                ?? []
        }
        return capabilityStore.capabilityProfile(for: employee.id).skillCatalog
    }

    private var selectedSkills: [EmployeeCapabilityItem] {
        skillCatalog.filter { selectedSkillIDs.contains($0.id) }
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                header
                Divider().overlay(palette.hairlineSoft)
                if proxy.size.width >= 700 {
                    HStack(spacing: 0) {
                        editorNavigation.frame(width: 180)
                        Divider().overlay(palette.hairlineSoft)
                        editorContent(width: proxy.size.width - 181)
                    }
                } else {
                    Menu {
                        ForEach(EmployeeEditorSection.allCases) { item in
                            Button { section = item } label: {
                                Label(item.title, systemImage: section == item ? "checkmark" : item.icon)
                            }
                        }
                    } label: {
                        CreamMenuLabel(title: section.title, icon: section.icon)
                    }
                    .menuStyle(.borderlessButton).padding(14)
                    Divider().overlay(palette.hairlineSoft)
                    editorContent(width: proxy.size.width)
                }
                Divider().overlay(palette.hairlineSoft)
                footer
            }
        }
        .disabled(isCapabilityPickerBackgroundDisabled)
        .accessibilityHidden(capabilityPicker != nil)
        .frame(minWidth: 520, idealWidth: 860, minHeight: 420, idealHeight: 680)
        .background(palette.canvas)
        .onAppear {
            soulPrompt = employee.soul.joined(separator: "\n\n")
            seedCapabilitySelection()
        }
        .onChange(of: focusedField) { oldValue, _ in
            if let oldValue { touchedFields.insert(oldValue) }
        }
        .task(id: employee.id) {
            guard !isDemo else { return }
            await capabilityStore.reloadBoundSkills(for: employee.id)
            seedCapabilitySelection()
        }
        .fileImporter(isPresented: $isChoosingAvatar, allowedContentTypes: [.png, .jpeg, .heic, .webP], allowsMultipleSelection: false) { result in
            do {
                guard let source = try result.get().first else { return }
                employee.avatarPath = try EmployeeAvatarStorage.importImage(from: source)
                avatarError = nil
            } catch { avatarError = error.localizedDescription }
        }
        .alert("无法使用这张图片", isPresented: Binding(get: { avatarError != nil }, set: { if !$0 { avatarError = nil } })) {
            Button("好") { avatarError = nil }
        } message: { Text(avatarError ?? "") }
        .alert("无法保存", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })) {
            Button("好") { saveError = nil }
        } message: { Text(saveError ?? "") }
        .overlay {
            if let kind = capabilityPicker {
                CreamModalOverlay(close: { capabilityPicker = nil }, preferredWidth: 680, preferredHeight: 620) {
                    CapabilityPickerSheet(
                        kind: kind,
                        employeeName: employee.name.isEmpty ? "新员工" : employee.name,
                        items: skillCatalog,
                        initiallySelected: selectedSkillIDs,
                        isDemo: isDemo,
                        close: { capabilityPicker = nil },
                        apply: { ids in
                            selectedSkillIDs = ids
                            capabilityPicker = nil
                        }
                    )
                }
            }
        }
        .onChange(of: capabilityPicker) { _, picker in
            if picker != nil {
                DispatchQueue.main.async {
                    if capabilityPicker != nil {
                        isCapabilityPickerBackgroundDisabled = true
                    }
                }
            } else {
                isCapabilityPickerBackgroundDisabled = false
            }
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            CreamAvatar(path: nil, name: employee.name.isEmpty ? "A" : employee.name, size: 42)
            VStack(alignment: .leading, spacing: 2) {
                Text(isNew ? "新建 AI 员工" : "编辑 \(employee.name) 资料").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Text("身份、灵魂与能力配置保存后生效").font(.caption).foregroundStyle(palette.muted)
            }
            Spacer()
        }.padding(.horizontal, 20).frame(height: 72)
    }

    private var editorNavigation: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(EmployeeEditorSection.allCases) { item in
                CreamInteractiveRow(
                    isSelected: section == item,
                    accessibilityLabel: item.title,
                    action: { section = item }
                ) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        CreamSymbol(systemName: item.icon)
                        Text(item.title)
                    }
                    .font(.callout.weight(section == item ? .semibold : .regular))
                    .foregroundStyle(section == item ? palette.ink : palette.body)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).frame(height: 38)
                }
            }
            Spacer()
        }.padding(12).background(palette.surfaceSoft)
    }

    private func editorContent(width: CGFloat) -> some View {
        ScrollView {
            Group {
                switch section {
                case .profile: profileForm
                case .identity: promptEditor(title: "身份提示词", detail: "定义员工是谁、负责什么，以及必须遵守的工作边界。", field: .identity, text: $employee.basePrompt)
                case .soul: promptEditor(title: "灵魂提示词", detail: "定义员工如何思考、判断、沟通和行动。", field: .soul, text: $soulPrompt)
                case .capabilities: capabilitiesForm
                }
            }
            .frame(maxWidth: 820, alignment: .leading).padding(width < 620 ? 18 : 28).frame(maxWidth: .infinity)
        }
    }

    private var profileForm: some View {
        VStack(alignment: .leading, spacing: 26) {
            formHeading("基础信息", "用于 Profile、搜索和运行时身份识别。")
            HStack(spacing: 16) {
                CreamAvatar(path: employee.avatarPath, name: employee.name.isEmpty ? "A" : employee.name, size: 72)
                VStack(alignment: .leading, spacing: 6) {
                    Button(employee.avatarPath == nil ? "上传头像" : "更换头像") { isChoosingAvatar = true }
                        .buttonStyle(CreamSecondaryButtonStyle())
                    if employee.avatarPath != nil {
                        Button("移除头像", role: .destructive) { employee.avatarPath = nil }
                            .buttonStyle(CreamInlineButtonStyle(tone: .destructive))
                    }
                    Text("支持 PNG、JPEG、HEIC 和 WebP").font(.caption).foregroundStyle(palette.muted)
                }
            }
            formGroup {
                profileField("员工 ID", field: .id, text: $employee.id, prompt: "ai-product-manager").disabled(!isNew)
                formDivider
                profileField("姓名", field: .name, text: $employee.name, prompt: "Alex")
                formDivider
                profileField("岗位", field: .role, text: $employee.role, prompt: "AI 产品经理")
                formDivider
                profileField("部门", field: .department, text: $employee.department, prompt: "产品部")
            }
        }
    }

    private var capabilitiesForm: some View {
        VStack(alignment: .leading, spacing: 26) {
            formHeading("能力配置", isDemo
                        ? "演示模式下可选择技能与工具，仅影响本页展示。"
                        : "从已安装 Package 中为该员工绑定 Skill；Tool 全局安装，并由 Skill 声明调用依赖。")
            if !isDemo {
                Text(capabilityStore.tasksEnabled ? "Runtime 已接通" : "尚未接通 Runtime 时，可先选择，保存时再写入绑定。")
                    .font(.caption)
                    .foregroundStyle(capabilityStore.tasksEnabled ? palette.success : palette.warning)
            }
            capabilityEditorSection(
                title: "技能",
                empty: "尚未选择技能",
                items: selectedSkills,
                add: { capabilityPicker = .skill },
                remove: { selectedSkillIDs.remove($0.id) }
            )
        }
    }

    private func capabilityEditorSection(
        title: String,
        empty: String,
        items: [EmployeeCapabilityItem],
        add: @escaping () -> Void,
        remove: @escaping (EmployeeCapabilityItem) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.headline).foregroundStyle(palette.ink)
                Spacer()
                Button(action: add) { Label("选择\(title)", systemImage: "plus") }.buttonStyle(CreamSecondaryButtonStyle())
            }
            if items.isEmpty {
                HStack(spacing: 12) {
                    CreamSymbol(systemName: title == "技能" ? "sparkles" : "wrench.and.screwdriver")
                        .foregroundStyle(palette.primaryActive)
                    Text(empty).font(.callout).foregroundStyle(palette.body)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        HStack(spacing: 12) {
                            CreamSymbol(systemName: item.kind == .skill ? "sparkles" : "wrench.and.screwdriver")
                                .foregroundStyle(palette.primaryActive)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 7) {
                                    Text(item.name).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                                    Text("v\(item.version)").font(.caption.monospaced()).foregroundStyle(palette.muted)
                                }
                                Text(item.detail).font(.caption).foregroundStyle(palette.muted).lineLimit(2)
                            }
                            Spacer()
                            CreamIconButton(
                                systemName: "trash",
                                accessibilityLabel: "移除\(item.name)",
                                help: "移除\(item.name)",
                                tone: .destructive,
                                action: { remove(item) }
                            )
                        }
                        .padding(.vertical, 12)
                        if index < items.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
                .padding(.horizontal, 14)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
            }
        }
    }

    private func promptEditor(title: String, detail: String, field: EmployeeDraftField, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                formHeading(title, detail)
                Spacer()
                CreamSegmentedControl(options: EmployeePromptMode.allCases, selection: $promptMode, title: \.title)
                    .frame(width: 132)
            }
            if promptMode == .preview {
                MarkdownDocumentView(source: text.wrappedValue)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                markdownSource(text: text)
                    .focused($focusedField, equals: field)
            }
            if shouldShowError(for: field), let error = validationErrors[field] {
                UXInlineFeedback(message: error)
            }
            HStack {
                Text("支持标题、列表、引用、强调与代码块").font(.caption).foregroundStyle(palette.muted)
                Spacer()
                Text("\(text.wrappedValue.count) / 8000").font(.caption.monospacedDigit()).foregroundStyle(text.wrappedValue.count > 7600 ? palette.warning : palette.muted)
            }
        }
    }

    private func markdownSource(text: Binding<String>) -> some View {
        TextEditor(text: text)
            .font(.system(.body, design: .monospaced)).lineSpacing(3).scrollContentBackground(.hidden).padding(12)
            .frame(minHeight: 360, alignment: .topLeading)
            .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
    }

    private var footer: some View {
        HStack {
            if attemptedSave, !validationErrors.isEmpty {
                UXInlineFeedback(message: "请修正标记的字段后再保存")
            } else {
                Text("保存前会检查基础信息、身份提示词和灵魂提示词")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
            }
            Spacer()
            Button("取消", action: close).buttonStyle(CreamSecondaryButtonStyle())
            Button(action: save) {
                UXAsyncActionLabel(idleTitle: "保存资料", pendingTitle: "正在保存", isPending: isSaving)
            }
            .buttonStyle(CreamPrimaryButtonStyle(isLoading: isSaving))
            .disabled(isSaving)
        }.padding(.horizontal, 20).frame(height: 60).background(palette.surfaceCard)
    }

    private func formHeading(_ title: String, _ detail: String) -> some View { VStack(alignment: .leading, spacing: 4) { Text(title).font(.title2.weight(.semibold)).foregroundStyle(palette.ink); Text(detail).font(.callout).foregroundStyle(palette.muted) } }
    private func formGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View { VStack(spacing: 0) { content() }.padding(.horizontal, 14).background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl)).overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) } }
    private func profileField(_ label: String, field: EmployeeDraftField, text: Binding<String>, prompt: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 18) {
                Text(label).font(.callout).foregroundStyle(palette.muted).frame(width: 86, alignment: .leading)
                TextField(prompt, text: text)
                    .textFieldStyle(.plain)
                    .foregroundStyle(palette.body)
                    .focused($focusedField, equals: field)
            }
            if shouldShowError(for: field), let error = validationErrors[field] {
                UXInlineFeedback(message: error).padding(.leading, 104)
            }
        }
        .padding(.vertical, 5)
        .frame(minHeight: 46)
    }
    private var formDivider: some View { Divider().overlay(palette.hairlineSoft).padding(.leading, 104) }

    private func seedCapabilitySelection() {
        if isDemo {
            if let profile = ContactsDemoData.current?.capabilities[employee.id] {
                selectedSkillIDs = Set(profile.selectedSkills.map(\.id))
            }
            return
        }
        let profile = capabilityStore.capabilityProfile(for: employee.id)
        selectedSkillIDs = Set(profile.selectedSkills.map(\.id))
    }

    private func save() {
        attemptedSave = true
        guard validationErrors.isEmpty else {
            let order: [EmployeeDraftField] = [.id, .name, .role, .department, .identity, .soul]
            if let first = order.first(where: { validationErrors[$0] != nil }) {
                section = switch first {
                case .id, .name, .role, .department: .profile
                case .identity: .identity
                case .soul: .soul
                }
                focusedField = first
            }
            return
        }
        employee.id = employee.id.lowercased().replacingOccurrences(of: " ", with: "-")
        employee.soul = markdownSections(soulPrompt)
        // Legacy columns are derived by Runtime from Identity/Soul; keep local mirrors empty.
        employee.mission = ""
        employee.responsibilities = []
        employee.boundaries = []
        if isDemo { close(); return }
        isSaving = true
        Task {
            let saved = await store.save(employee)
            if saved {
                await capabilityStore.syncSkills(for: employee.id, selectedIDs: selectedSkillIDs)
                if let error = capabilityStore.actionError {
                    saveError = error
                    isSaving = false
                    return
                }
                close()
            } else {
                saveError = store.error ?? "保存员工资料失败"
            }
            isSaving = false
        }
    }
    private func shouldShowError(for field: EmployeeDraftField) -> Bool { attemptedSave || touchedFields.contains(field) }
    private func markdownSections(_ value: String) -> [String] { value.components(separatedBy: "\n\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum EmployeePromptMode: String, CaseIterable, Identifiable {
    case edit
    case preview

    var id: String { rawValue }
    var title: String { self == .edit ? "编辑" : "预览" }
}

private enum EmployeeEditorSection: String, CaseIterable, Identifiable {
    case profile, identity, soul, capabilities
    var id: String { rawValue }
    var title: String {
        switch self {
        case .profile: "基础信息"
        case .identity: "身份提示词"
        case .soul: "灵魂提示词"
        case .capabilities: "能力"
        }
    }
    var icon: String {
        switch self {
        case .profile: "person.text.rectangle"
        case .identity: "person.crop.rectangle"
        case .soul: "heart.text.square"
        case .capabilities: "slider.horizontal.3"
        }
    }
}
