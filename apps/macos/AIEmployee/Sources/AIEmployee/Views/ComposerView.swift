import SwiftUI

struct ComposerView: View {
    @ObservedObject var store: TaskStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("交给 Alex").font(.title2.weight(.semibold))
            Text("描述产品问题、已有证据和期望产物。未知信息会保留为待确认项。")
                .foregroundStyle(.secondary)
            TextEditor(text: $store.draft)
                .font(.body)
                .scrollContentBackground(.hidden)
                .padding(AppTheme.Spacing.xs)
                .frame(minHeight: 150)
                .background(AppTheme.palette(for: colorScheme).surfaceCard)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous).stroke(AppTheme.palette(for: colorScheme).hairline))
            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("继续") { store.requestRun() }.keyboardShortcut(.defaultAction)
                    .disabled(store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(AppTheme.Spacing.lg)
        .frame(width: 520)
        .background(AppTheme.palette(for: colorScheme).canvas)
    }
}
