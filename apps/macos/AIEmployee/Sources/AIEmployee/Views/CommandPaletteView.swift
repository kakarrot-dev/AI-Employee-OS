import SwiftUI

struct CommandPaletteView: View {
    let navigate: (AppDestination) -> Void
    let newWork: () -> Void
    let openSettings: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var commands: [PaletteCommand] {
        let all = [
            PaletteCommand(title: "交给 Alex 新工作", subtitle: "进入员工聊天并开始工作", image: "plus", action: newTask),
            destination("打开办公室", "查看 Alex 的当前状态", "building.2", .office),
            destination("打开通讯录", "按部门查找员工", "person.2", .contacts),
            destination("打开工作库", "查看所有员工的工作历史", "clock.arrow.circlepath", .work),
            destination("打开技能库", "查看已安装的 Skills", "sparkles", .skills),
            destination("打开工具库", "查看 Tools、权限与连接状态", "wrench.and.screwdriver", .tools),
            PaletteCommand(title: "打开设置", subtitle: "配置模型、隐私与应用选项", image: "gearshape", action: settings)
        ]
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return all }
        return all.filter { command in
            command.title.localizedCaseInsensitiveContains(needle) || command.subtitle.localizedCaseInsensitiveContains(needle)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("搜索或委派工作", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($searchFocused)
                Text("⌘K").font(.caption.monospaced()).foregroundStyle(.tertiary)
            }
            .padding(AppTheme.Spacing.md)

            Divider()

            if commands.isEmpty {
                ContentUnavailableView("没有匹配的命令", systemImage: "magnifyingglass")
                    .frame(maxWidth: .infinity, minHeight: 220)
            } else {
                ScrollView {
                    LazyVStack(spacing: AppTheme.Spacing.xxs) {
                        ForEach(commands) { command in
                            Button(action: command.action) {
                                HStack(spacing: AppTheme.Spacing.sm) {
                                    Image(systemName: command.image).frame(width: 22)
                                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                        Text(command.title).foregroundStyle(.primary)
                                        Text(command.subtitle).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                                .contentShape(Rectangle())
                                .padding(.horizontal, AppTheme.Spacing.md)
                                .padding(.vertical, AppTheme.Spacing.sm)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(AppTheme.Spacing.xs)
                }
            }
        }
        .frame(width: 640, height: 420)
        .background(.ultraThinMaterial)
        .task { searchFocused = true }
    }

    private func destination(_ title: String, _ subtitle: String, _ image: String, _ destination: AppDestination) -> PaletteCommand {
        PaletteCommand(title: title, subtitle: subtitle, image: image) {
            navigate(destination)
            dismiss()
        }
    }

    private func newTask() {
        newWork()
        dismiss()
    }

    private func settings() {
        dismiss()
        openSettings()
    }
}

private struct PaletteCommand: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let image: String
    let action: () -> Void
}
