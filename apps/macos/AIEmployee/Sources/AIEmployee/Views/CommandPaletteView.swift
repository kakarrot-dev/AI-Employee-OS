import SwiftUI

struct CommandPaletteView: View {
    @ObservedObject var store: TaskStore
    let navigate: (AppDestination) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var commands: [PaletteCommand] {
        let all = [
            PaletteCommand(title: "交给 Alex 新任务", subtitle: "创建一项需要审批的本地任务", image: "plus", action: newTask),
            destination("打开公司工作台", "查看 Alex 和最近工作", "building.2", .company),
            destination("打开任务", "查看执行状态、交付和诊断", "checklist", .tasks),
            destination("打开成果", "浏览已经生成的 PRD", "shippingbox", .artifacts),
            destination("打开知识", "查看本地资料的使用边界", "books.vertical", .knowledge),
            destination("查看 Alex", "查看职责、能力和运行边界", "person.crop.circle", .alex)
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
        dismiss()
        store.beginComposing()
    }
}

private struct PaletteCommand: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let image: String
    let action: () -> Void
}
