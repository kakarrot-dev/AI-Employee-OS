import SwiftUI
import UniformTypeIdentifiers

struct EmployeeEditorView: View {
    @State var employee: Employee
    @ObservedObject var store: EmployeeStore
    let isDemo: Bool
    let close: () -> Void
    @State private var section: EmployeeEditorSection = .profile
    @State private var soulPrompt = ""
    @State private var isSaving = false
    @State private var previewMode = false
    @State private var isChoosingAvatar = false
    @State private var avatarError: String?
    @Environment(\.colorScheme) private var colorScheme

    private var isNew: Bool { store.employees.allSatisfy { $0.id != employee.id } }
    private var canSave: Bool {
        (3...64).contains(employee.id.count) && !employee.name.isEmpty && !employee.role.isEmpty && !employee.department.isEmpty && !employee.basePrompt.isEmpty && !soulPrompt.isEmpty && !isSaving
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
        .frame(minWidth: 520, idealWidth: 860, minHeight: 420, idealHeight: 680)
        .background(palette.canvas)
        .onAppear {
            soulPrompt = employee.soul.joined(separator: "\n\n")
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
    }

    private var header: some View {
        HStack(spacing: 14) {
            EmployeeAvatar(name: employee.name.isEmpty ? "A" : employee.name, size: 42)
            VStack(alignment: .leading, spacing: 2) {
                Text(isNew ? "新建 AI 员工" : "编辑 \(employee.name) 资料").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Text("身份提示词、灵魂提示词与能力配置共同决定员工的工作方式").font(.caption).foregroundStyle(palette.muted)
            }
            Spacer()
        }.padding(.horizontal, 20).frame(height: 72)
    }

    private var editorNavigation: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(EmployeeEditorSection.allCases) { item in
                Button {
                    section = item
                } label: {
                    Label(item.title, systemImage: item.icon)
                        .font(.callout.weight(section == item ? .semibold : .regular))
                        .foregroundStyle(section == item ? palette.ink : palette.body)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).frame(height: 38)
                        .background(section == item ? palette.primary.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: 8))
                }.buttonStyle(.plain)
            }
            Spacer()
        }.padding(12).background(palette.surfaceSoft)
    }

    private func editorContent(width: CGFloat) -> some View {
        ScrollView {
            Group {
                switch section {
                case .profile: profileForm
                case .identity: promptEditor(title: "身份提示词", detail: "定义员工是谁、负责什么，以及必须遵守的工作边界。", text: $employee.basePrompt)
                case .soul: promptEditor(title: "灵魂提示词", detail: "定义员工如何思考、判断、沟通和行动。", text: $soulPrompt)
                }
            }
            .frame(maxWidth: 820, alignment: .leading).padding(width < 620 ? 18 : 28).frame(maxWidth: .infinity)
        }
    }

    private var profileForm: some View {
        VStack(alignment: .leading, spacing: 26) {
            formHeading("基础信息", "用于 Profile、搜索和运行时身份识别。")
            HStack(spacing: 16) {
                EmployeeAvatar(name: employee.name.isEmpty ? "A" : employee.name, avatarPath: employee.avatarPath, size: 72)
                VStack(alignment: .leading, spacing: 6) {
                    Button(employee.avatarPath == nil ? "上传头像" : "更换头像") { isChoosingAvatar = true }
                        .buttonStyle(CreamSecondaryButtonStyle())
                    if employee.avatarPath != nil {
                        Button("移除头像", role: .destructive) { employee.avatarPath = nil }.buttonStyle(.plain).font(.caption)
                    }
                    Text("支持 PNG、JPEG、HEIC 和 WebP").font(.caption).foregroundStyle(palette.muted)
                }
            }
            formGroup {
                profileField("员工 ID", text: $employee.id, prompt: "ai-product-manager").disabled(!isNew)
                formDivider
                profileField("姓名", text: $employee.name, prompt: "Alex")
                formDivider
                profileField("岗位", text: $employee.role, prompt: "AI 产品经理")
                formDivider
                profileField("部门", text: $employee.department, prompt: "产品部")
                formDivider
                HStack(spacing: 18) {
                    Text("状态").font(.callout).foregroundStyle(palette.muted).frame(width: 86, alignment: .leading)
                    Menu {
                        Button { employee.status = "active" } label: { Label("启用", systemImage: employee.status == "active" ? "checkmark" : "circle") }
                        Button { employee.status = "disabled" } label: { Label("停用", systemImage: employee.status == "disabled" ? "checkmark" : "circle") }
                    } label: {
                        CreamMenuLabel(title: employee.status == "active" ? "启用" : "停用")
                    }.menuStyle(.borderlessButton)
                }.frame(minHeight: 46)
            }
        }
    }

    private func promptEditor(title: String, detail: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                formHeading(title, detail)
                Spacer()
                HStack(spacing: 4) {
                    Button("编辑") { previewMode = false }
                        .buttonStyle(CreamPromptModeButtonStyle(isSelected: !previewMode))
                    Button("预览") { previewMode = true }
                        .buttonStyle(CreamPromptModeButtonStyle(isSelected: previewMode))
                }
            }
            if previewMode {
                MarkdownDocumentView(source: text.wrappedValue)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                markdownSource(text: text)
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
            if !canSave { Text("请完整填写基础信息、身份提示词和灵魂提示词").font(.caption).foregroundStyle(palette.muted) }
            Spacer()
            Button("取消", action: close).buttonStyle(CreamSecondaryButtonStyle())
            Button(isSaving ? "正在保存…" : "保存资料") { save() }.buttonStyle(CreamPrimaryButtonStyle()).disabled(!canSave)
        }.padding(.horizontal, 20).frame(height: 60).background(palette.surfaceCard)
    }

    private func formHeading(_ title: String, _ detail: String) -> some View { VStack(alignment: .leading, spacing: 4) { Text(title).font(.title2.weight(.semibold)).foregroundStyle(palette.ink); Text(detail).font(.callout).foregroundStyle(palette.muted) } }
    private func formGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View { VStack(spacing: 0) { content() }.padding(.horizontal, 14).background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl)).overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) } }
    private func profileField(_ label: String, text: Binding<String>, prompt: String) -> some View { HStack(spacing: 18) { Text(label).font(.callout).foregroundStyle(palette.muted).frame(width: 86, alignment: .leading); TextField(prompt, text: text).textFieldStyle(.plain).foregroundStyle(palette.body) }.frame(minHeight: 46) }
    private var formDivider: some View { Divider().overlay(palette.hairlineSoft).padding(.leading, 104) }
    private func save() {
        employee.id = employee.id.lowercased().replacingOccurrences(of: " ", with: "-")
        // Runtime v1.0 still requires these legacy columns. They are kept internal
        // until the employee contract migrates to Identity/Soul as the only prompts.
        employee.mission = employee.basePrompt
        employee.responsibilities = []
        employee.boundaries = []
        employee.soul = markdownSections(soulPrompt)
        if isDemo { close(); return }
        isSaving = true
        Task { _ = await store.save(employee); isSaving = false }
    }
    private func markdownSections(_ value: String) -> [String] { value.components(separatedBy: "\n\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamPromptModeButtonStyle: ButtonStyle {
    let isSelected: Bool
    @Environment(\.colorScheme) private var colorScheme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.caption.weight(.semibold))
            .foregroundStyle(isSelected ? palette.primaryActive : palette.muted)
            .padding(.horizontal, 10).frame(height: 28)
            .background(isSelected ? palette.primary.opacity(0.11) : Color.clear, in: RoundedRectangle(cornerRadius: 7))
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum EmployeeEditorSection: String, CaseIterable, Identifiable {
    case profile, identity, soul
    var id: String { rawValue }
    var title: String { switch self { case .profile: "基础信息"; case .identity: "身份提示词"; case .soul: "灵魂提示词" } }
    var icon: String { switch self { case .profile: "person.text.rectangle"; case .identity: "person.crop.rectangle"; case .soul: "heart.text.square" } }
}
