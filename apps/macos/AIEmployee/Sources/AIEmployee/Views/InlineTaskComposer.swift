import SwiftUI

struct InlineTaskComposer: View {
    @ObservedObject var store: TaskStore
    @FocusState private var isFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: "sparkles")
                    .foregroundStyle(palette.primary)
                Text("交给 Alex 一项工作")
                    .font(.headline)
                Spacer()
                Text("⌘↩ 提交")
                    .font(.caption)
                    .foregroundStyle(palette.mutedSoft)
            }

            TextEditor(text: $store.draft)
                .font(.body)
                .scrollContentBackground(.hidden)
                .focused($isFocused)
                .frame(minHeight: 84, maxHeight: 150)
                .padding(AppTheme.Spacing.sm)
                .background(palette.surfaceCard)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                        .stroke(isFocused ? palette.primary : palette.hairlineSoft, lineWidth: isFocused ? 1.5 : 1)
                }
                .onKeyPress(.return, phases: .down) { press in
                    guard press.modifiers.contains(.command) else { return .ignored }
                    submit()
                    return .handled
                }

            HStack {
                Text("描述目标、已有证据和期望产物，未知信息会保留为待确认项。")
                    .font(.callout)
                    .foregroundStyle(palette.muted)
                Spacer()
                Button("继续") { submit() }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSubmit)
            }
        }
    }

    private var canSubmit: Bool {
        !store.isSubmitting && !store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        guard canSubmit else { return }
        store.prepareInlineTask()
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
