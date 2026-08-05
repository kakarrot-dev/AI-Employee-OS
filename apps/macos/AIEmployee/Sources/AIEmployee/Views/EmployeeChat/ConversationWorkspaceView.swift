import SwiftUI

struct ConversationWorkspaceView: View {
    @ObservedObject var store: ConversationStore
    let employee: Employee?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if store.messages.isEmpty {
                        ContentUnavailableView("和 \(employee?.name ?? "员工") 开始对话", systemImage: "bubble.left.and.bubble.right", description: Text("当前没有绑定 Skill 或 Tool，这是用于能力对比的聊天基线。"))
                    }
                    ForEach(store.messages) { message in
                        VStack(alignment: .leading, spacing: 6) {
                            if message.role == "user" { Text("你").font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                            Text(message.content).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(14)
                        .background(message.role == "user" ? AppTheme.palette(for: .light).surfaceSoft : .clear, in: RoundedRectangle(cornerRadius: 12))
                    }
                    if store.isSending { HStack { ProgressView().controlSize(.small); Text("\(employee?.name ?? "员工") 正在回复…").foregroundStyle(.secondary) } }
                }
                .padding(24).frame(maxWidth: 820).frame(maxWidth: .infinity)
            }
            if let error = store.error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal, 24).frame(maxWidth: 820, alignment: .leading) }
            HStack(alignment: .bottom) {
                TextField("给 \(employee?.name ?? "员工") 发消息…", text: $store.draft, axis: .vertical).lineLimit(1...8).textFieldStyle(.plain).onSubmit(store.send)
                Button(action: store.send) { Image(systemName: "arrow.up.circle.fill").font(.title2) }.buttonStyle(.plain).disabled(store.isSending || store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(14).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18)).padding(20).frame(maxWidth: 820)
        }
        .navigationTitle(employee?.name ?? "对话")
    }
}
