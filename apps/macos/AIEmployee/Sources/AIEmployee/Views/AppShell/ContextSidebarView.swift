import SwiftUI

struct ContextSidebarView: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    @ObservedObject var employeeStore: EmployeeStore
    let newWork: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    private var supportsTasks: Bool {
        conversationStore.employeeID == "ai-product-manager"
    }

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
            if selection == .work, supportsTasks {
                Button(action: newWork) { Image(systemName: "square.and.pencil") }
                    .buttonStyle(.plain)
                    .help("新建工作")
            } else if selection == .contacts {
                Button(action: employeeStore.create) { Image(systemName: "person.badge.plus") }
                    .buttonStyle(.plain)
                    .help("新建员工")
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
            WorkContextList(store: store, conversationStore: conversationStore, showsTasks: supportsTasks)
        case .office, .capabilities:
            EmptyView()
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct WorkContextList: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var conversationStore: ConversationStore
    let showsTasks: Bool
    @State private var confirmingDelete = false

    var body: some View {
        List(selection: $store.selection) {
            Section("与 \(conversationStore.employeeName) 的对话") {
                Label("连续会话", systemImage: "bubble.left.and.bubble.right")
                    .badge(conversationStore.messages.count)
                    .contextMenu {
                        Button("清除聊天记录", role: .destructive) { confirmingDelete = true }
                    }
            }
            if showsTasks {
                Section("任务") {
                    if store.runs.isEmpty {
                        Text("还没有任务").foregroundStyle(.secondary)
                    } else {
                        ForEach(store.runs) { run in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(run.input).lineLimit(1)
                                Text(run.status.title).font(.caption).foregroundStyle(.secondary)
                            }
                            .tag(run.id)
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .confirmationDialog("清除与 \(conversationStore.employeeName) 的聊天记录？", isPresented: $confirmingDelete) {
            Button("清除聊天记录", role: .destructive) {
                Task { await conversationStore.deleteHistory() }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("此操作会删除当前连续会话中的消息，不会删除任务、审批记录或交付物。")
        }
    }
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
