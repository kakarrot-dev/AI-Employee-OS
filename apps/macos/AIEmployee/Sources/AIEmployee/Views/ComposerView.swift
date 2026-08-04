import SwiftUI

struct ComposerView: View {
    @ObservedObject var store: TaskStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("交给 Alex").font(.title2.weight(.semibold))
            Text("描述产品问题、已有证据和期望产物。未知信息会保留为待确认项。")
                .foregroundStyle(.secondary)
            TextEditor(text: $store.draft).font(.body).frame(minHeight: 150)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator))
            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("继续") { store.requestRun() }.keyboardShortcut(.defaultAction)
                    .disabled(store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }.padding(24).frame(width: 520)
    }
}
