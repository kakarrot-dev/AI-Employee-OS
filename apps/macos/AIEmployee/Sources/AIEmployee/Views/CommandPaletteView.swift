import SwiftUI

struct CommandPaletteView: View {
    let employees: [Employee]
    let recentRuns: [TaskRun]
    let navigate: (AppDestination) -> Void
    let openEmployee: (Employee) -> Void
    let openRun: (TaskRun) -> Void
    let newWork: () -> Void
    let openSettings: () -> Void
    let close: () -> Void

    @State private var query = ""
    @State private var selectedIndex = 0
    @FocusState private var searchFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    private var commands: [PaletteCommand] {
        var all = [
            PaletteCommand(id: "action-new-work", section: .actions, title: "新建工作", subtitle: "在办公室描述目标，由系统匹配员工", image: "plus", searchTerms: "新建 委派 工作", action: newTask)
        ]
        all.append(contentsOf: employees.prefix(6).map { employee in
            PaletteCommand(
                id: "employee-\(employee.id)",
                section: .employees,
                title: "和 \(employee.name) 对话",
                subtitle: "\(employee.role) · \(employee.department)",
                image: "person.crop.circle",
                searchTerms: "\(employee.name) \(employee.role) \(employee.department)",
                action: { openEmployeeCommand(employee) }
            )
        })
        all.append(contentsOf: recentRuns.prefix(5).map { run in
            PaletteCommand(
                id: "run-\(run.id)",
                section: .recentWork,
                title: run.input,
                subtitle: "\(run.status.title) · 最近工作",
                image: run.status.systemImage,
                searchTerms: "\(run.input) \(run.status.title)",
                action: { openRunCommand(run) }
            )
        })
        all.append(contentsOf: [
            destination("打开办公室", "查看模型调用与 Token 用量", "building.2", .office),
            destination("打开通讯录", "按部门查找员工", "person.2", .contacts),
            destination("打开工作库", "查看所有员工的工作历史", "clock.arrow.circlepath", .work),
            destination("打开技能库", "查看已安装的 Skills", "sparkles", .skills),
            destination("打开知识库", "浏览本地 Markdown 知识文档", "books.vertical", .knowledge),
            destination("打开工具库", "查看 Tools、权限与连接状态", "wrench.and.screwdriver", .tools),
            PaletteCommand(id: "settings", section: .navigation, title: "打开设置", subtitle: "配置模型、隐私与应用选项", image: "gearshape", searchTerms: "设置 模型 API Key 外观", action: settings)
        ])

        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return all }
        return all.filter { command in
            command.title.localizedCaseInsensitiveContains(needle)
                || command.subtitle.localizedCaseInsensitiveContains(needle)
                || command.searchTerms.localizedCaseInsensitiveContains(needle)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "magnifyingglass").foregroundStyle(palette.muted)
                TextField("搜索员工、工作或命令", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($searchFocused)
                    .onSubmit(performSelected)
                Text("⌘K").font(.caption.monospaced()).foregroundStyle(palette.mutedSoft)
            }
            .padding(AppTheme.Spacing.md)

            Divider().overlay(palette.hairlineSoft)

            if commands.isEmpty {
                UXFeedbackStateView(
                    title: "没有匹配的命令",
                    message: "尝试员工姓名、岗位、工作目标或页面名称。",
                    systemImage: "magnifyingglass",
                    actionTitle: "清除搜索",
                    action: { query = "" }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(AppTheme.Spacing.xl)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            ForEach(PaletteSection.allCases) { section in
                                let sectionCommands = indexedCommands.filter { $0.command.section == section }
                                if !sectionCommands.isEmpty {
                                    Text(section.title)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(palette.muted)
                                        .padding(.horizontal, AppTheme.Spacing.xs)
                                    ForEach(sectionCommands, id: \.command.id) { entry in
                                        commandRow(entry.command, index: entry.index)
                                            .id(entry.command.id)
                                    }
                                }
                            }
                        }
                        .padding(AppTheme.Spacing.xs)
                    }
                    .onChange(of: selectedIndex) { _, _ in
                        guard commands.indices.contains(selectedIndex) else { return }
                        proxy.scrollTo(commands[selectedIndex].id, anchor: .center)
                    }
                }
            }
        }
        .frame(width: 640, height: 420)
        .background(.ultraThinMaterial)
        .task { searchFocused = true }
        .onChange(of: query) { _, _ in selectedIndex = 0 }
        .onExitCommand(perform: close)
        .onMoveCommand { direction in
            switch direction {
            case .down: selectedIndex = min(selectedIndex + 1, max(commands.count - 1, 0))
            case .up: selectedIndex = max(selectedIndex - 1, 0)
            default: break
            }
        }
    }

    private var indexedCommands: [(index: Int, command: PaletteCommand)] {
        Array(commands.enumerated()).map { (index: $0.offset, command: $0.element) }
    }

    private func commandRow(_ command: PaletteCommand, index: Int) -> some View {
        Button {
            selectedIndex = index
            command.action()
        } label: {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: command.image)
                    .foregroundStyle(selectedIndex == index ? palette.primaryActive : palette.muted)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text(command.title).foregroundStyle(palette.ink).lineLimit(1)
                    Text(command.subtitle).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                }
                Spacer()
                if selectedIndex == index {
                    Image(systemName: "return").font(.caption).foregroundStyle(palette.mutedSoft)
                }
            }
            .contentShape(Rectangle())
            .padding(.horizontal, AppTheme.Spacing.md)
            .frame(minHeight: 50)
            .background(selectedIndex == index ? palette.primary.opacity(0.11) : Color.clear, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
        }
        .buttonStyle(.plain)
        .onHover { if $0 { selectedIndex = index } }
        .accessibilityAddTraits(selectedIndex == index ? .isSelected : [])
    }

    private func performSelected() {
        guard commands.indices.contains(selectedIndex) else { return }
        commands[selectedIndex].action()
    }

    private func destination(_ title: String, _ subtitle: String, _ image: String, _ destination: AppDestination) -> PaletteCommand {
        PaletteCommand(id: "destination-\(destination.rawValue)", section: .navigation, title: title, subtitle: subtitle, image: image, searchTerms: destination.title) {
            navigate(destination)
            close()
        }
    }

    private func openEmployeeCommand(_ employee: Employee) {
        openEmployee(employee)
        close()
    }

    private func openRunCommand(_ run: TaskRun) {
        openRun(run)
        close()
    }

    private func newTask() { newWork(); close() }
    private func settings() { close(); openSettings() }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum PaletteSection: String, CaseIterable, Identifiable {
    case actions, employees, recentWork, navigation
    var id: String { rawValue }
    var title: String {
        switch self {
        case .actions: "操作"
        case .employees: "AI 员工"
        case .recentWork: "最近工作"
        case .navigation: "导航"
        }
    }
}

private struct PaletteCommand: Identifiable {
    let id: String
    let section: PaletteSection
    let title: String
    let subtitle: String
    let image: String
    let searchTerms: String
    let action: () -> Void
}
