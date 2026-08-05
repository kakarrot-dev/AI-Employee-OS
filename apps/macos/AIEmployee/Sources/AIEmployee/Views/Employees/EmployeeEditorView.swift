import SwiftUI

struct EmployeeEditorView: View {
    @State var employee: Employee
    @ObservedObject var store: EmployeeStore
    @Environment(\.dismiss) private var dismiss
    @State private var responsibilities = ""
    @State private var boundaries = ""
    @State private var soul = ""
    @State private var isSaving = false

    private var isNew: Bool { store.employees.allSatisfy { $0.id != employee.id } }
    private var canSave: Bool { (3...64).contains(employee.id.count) && !employee.name.isEmpty && !employee.role.isEmpty && !employee.department.isEmpty && !employee.mission.isEmpty && !employee.basePrompt.isEmpty && !isSaving }

    var body: some View {
        VStack(spacing: 0) {
            HStack { Text(isNew ? "新建员工" : "编辑 \(employee.name)").font(.title2.weight(.semibold)); Spacer(); Button("取消") { dismiss() }; Button("保存") { save() }.buttonStyle(.borderedProminent).disabled(!canSave) }.padding(AppTheme.Spacing.lg)
            Divider()
            Form {
                Section("Identity") {
                    TextField("员工 ID", text: $employee.id).disabled(!isNew).help("小写字母、数字和连字符，保存后不可修改")
                    TextField("姓名", text: $employee.name)
                    TextField("岗位", text: $employee.role)
                    TextField("部门", text: $employee.department)
                    TextField("使命", text: $employee.mission, axis: .vertical).lineLimit(2...4)
                    Picker("状态", selection: $employee.status) { Text("启用").tag("active"); Text("停用").tag("disabled") }
                    TextField("职责，每行一项", text: $responsibilities, axis: .vertical).lineLimit(3...7)
                    TextField("工作边界，每行一项", text: $boundaries, axis: .vertical).lineLimit(3...7)
                }
                Section("Soul") { TextField("核心原则，每行一项", text: $soul, axis: .vertical).lineLimit(4...8) }
                Section("Persona") {
                    TextField("沟通风格", text: $employee.persona.communication.style)
                    TextField("语气", text: $employee.persona.communication.tone)
                    TextField("思考方式", text: $employee.persona.thinking.approach)
                    TextField("证据原则", text: $employee.persona.thinking.evidence)
                }
                Section("基础 Prompt") {
                    TextEditor(text: $employee.basePrompt).font(.system(.body, design: .monospaced)).frame(minHeight: 120)
                    Text("Runtime 会将这里的指令与 Identity、Soul、Persona 和安全边界编译成 Effective Prompt。").font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped)
        }
        .frame(width: 720, height: 760)
        .onAppear { responsibilities = employee.responsibilities.joined(separator: "\n"); boundaries = employee.boundaries.joined(separator: "\n"); soul = employee.soul.joined(separator: "\n") }
    }

    private func save() {
        employee.id = employee.id.lowercased().replacingOccurrences(of: " ", with: "-")
        employee.responsibilities = lines(responsibilities); employee.boundaries = lines(boundaries); employee.soul = lines(soul)
        isSaving = true
        Task { _ = await store.save(employee); isSaving = false }
    }
    private func lines(_ value: String) -> [String] { value.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
}
