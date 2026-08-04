import SwiftUI

struct InlineTaskComposer: View {
    @ObservedObject var store: TaskStore
    @FocusState private var isFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: "sparkles")
                    .foregroundStyle(palette.primary)
                Text("交给 Alex")
                    .font(.callout.weight(.semibold))
                Spacer()
                Label("本地处理", systemImage: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(palette.mutedSoft)
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.top, AppTheme.Spacing.md)

            ZStack(alignment: .topLeading) {
                if store.draft.isEmpty {
                    Text("描述目标、已有证据和期望产物…")
                        .font(.body)
                        .foregroundStyle(palette.mutedSoft)
                        .padding(.horizontal, AppTheme.Spacing.md + 1)
                        .padding(.vertical, AppTheme.Spacing.md + 1)
                }
                TextEditor(text: $store.draft)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .focused($isFocused)
                    .frame(minHeight: 82, maxHeight: 140)
                    .padding(AppTheme.Spacing.sm)
                    .background(.clear)
                    .onKeyPress(.return, phases: .down) { press in
                        guard press.modifiers.contains(.command) else { return .ignored }
                        submit()
                        return .handled
                    }
            }

            HStack(spacing: AppTheme.Spacing.xs) {
                Text("未知信息会保留为待确认项")
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                Spacer()
                Text("⌘↩")
                    .font(.caption.monospaced())
                    .foregroundStyle(palette.mutedSoft)
                Button(action: submit) {
                    Label("继续", systemImage: "arrow.up")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit)
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.bottom, AppTheme.Spacing.md)
        }
        .background(palette.surfaceCard)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                .stroke(isFocused ? palette.primary.opacity(0.8) : palette.hairlineSoft, lineWidth: isFocused ? 1.5 : 1)
        }
        .shadow(
            color: .black.opacity(AppTheme.Elevation.composerOpacity),
            radius: AppTheme.Elevation.composerRadius,
            y: AppTheme.Elevation.composerY
        )
        .animation(.easeOut(duration: AppTheme.Motion.fast), value: isFocused)
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
