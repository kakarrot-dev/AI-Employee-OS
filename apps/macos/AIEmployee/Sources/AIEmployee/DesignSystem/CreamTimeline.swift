import AppKit
import SwiftUI

enum CreamTimelineDensity {
    case compact
    case regular

    var itemSpacing: CGFloat {
        switch self {
        case .compact: 20
        case .regular: 16
        }
    }

    var readingMeasure: CGFloat {
        switch self {
        case .compact: 660
        case .regular: 700
        }
    }

    var userMessageMeasure: CGFloat {
        switch self {
        case .compact: 480
        case .regular: 520
        }
    }
}

private struct CreamTimelineDensityKey: EnvironmentKey {
    static let defaultValue: CreamTimelineDensity = .regular
}

private extension EnvironmentValues {
    var creamTimelineDensity: CreamTimelineDensity {
        get { self[CreamTimelineDensityKey.self] }
        set { self[CreamTimelineDensityKey.self] = newValue }
    }
}

struct CreamTimelineLayout<Content: View>: View {
    var density: CreamTimelineDensity = .regular
    var horizontalInset: CGFloat = AppTheme.Spacing.lg
    var topInset: CGFloat = AppTheme.Spacing.lg
    var bottomInset: CGFloat = AppTheme.Spacing.lg
    @ViewBuilder let content: () -> Content

    var body: some View {
        LazyVStack(alignment: .leading, spacing: density.itemSpacing) {
            content()
        }
        .padding(.horizontal, horizontalInset)
        .padding(.top, topInset)
        .padding(.bottom, bottomInset)
        .frame(maxWidth: min(AppTheme.Typography.readingMeasure, density.readingMeasure), alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .center)
        .environment(\.creamTimelineDensity, density)
    }
}

struct CreamTimelineAgentRow<Content: View>: View {
    let employeeName: String
    let employeeAvatarPath: String?
    let metadata: String
    var statusSystemImage: String? = nil
    var statusColor: Color = .secondary
    var copyText: String? = nil
    @ViewBuilder let content: () -> Content
    @State private var hovering = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            CreamAvatar(path: employeeAvatarPath, name: employeeName, size: 28)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                HStack(spacing: AppTheme.Spacing.xs) {
                    Text(employeeName)
                        .font(AppTheme.Typography.messageAuthor)
                        .foregroundStyle(palette.ink)
                    if let statusSystemImage {
                        Image(systemName: statusSystemImage)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(statusColor)
                    }
                    Text("· \(metadata)")
                        .font(AppTheme.Typography.metadata(weight: .medium).monospacedDigit())
                        .foregroundStyle(palette.muted)
                    Spacer(minLength: AppTheme.Spacing.sm)
                    if let copyText {
                        CreamTimelineActionButton(
                            label: "复制 \(employeeName) 的回复",
                            systemImage: "doc.on.doc",
                            action: { copyTimelineText(copyText) }
                        )
                        .opacity(hovering ? 1 : 0)
                    }
                }
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .animation(reduceMotion ? nil : AppTheme.Motion.hoverReveal, value: hovering)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamTimelineMarkdownBody: View {
    let source: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        SelectableMarkdownTextView(source: source, colorScheme: colorScheme)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CreamTimelineUserMessage<Accessories: View>: View {
    let text: String
    let metadata: String
    var maxWidth: CGFloat?
    var revise: ((String) -> Bool)?
    @ViewBuilder let accessories: () -> Accessories

    @State private var hovering = false
    @State private var expanded = false
    @State private var isEditing = false
    @State private var editingText = ""
    @FocusState private var editorFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.creamTimelineDensity) private var density

    var body: some View {
        VStack(alignment: .trailing, spacing: 5) {
            if isEditing {
                editor
            } else {
                bubble
                if isLong { foldButton }
                CreamTimelineMessageActions(
                    metadata: metadata,
                    text: text,
                    edit: revise == nil ? nil : beginEditing,
                    actionsVisible: hovering
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .animation(reduceMotion ? nil : AppTheme.Motion.hoverReveal, value: hovering)
    }

    private var bubble: some View {
        CreamTimelineContentSizedBubble(maxWidth: maxWidth ?? density.userMessageMeasure) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                accessories()
                Text(displayedText)
                    .font(AppTheme.Typography.messageBody)
                    .foregroundStyle(palette.body)
                    .lineSpacing(AppTheme.Typography.readingLineSpacing)
                    .textSelection(.enabled)
                    .creamSelectableTextCursor()
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(
                palette.surfaceSoft,
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
            )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("你：\(text)")
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            TextEditor(text: $editingText)
                .font(AppTheme.Typography.messageBody)
                .foregroundStyle(palette.body)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 52, maxHeight: 140)
                .focused($editorFocused)
            HStack(spacing: AppTheme.Spacing.sm) {
                Text("修改后将重新生成这一轮回复")
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                Spacer(minLength: AppTheme.Spacing.md)
                Button("取消") { isEditing = false }
                    .buttonStyle(.plain)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(palette.muted)
                Button {
                    if revise?(editingText) == true { isEditing = false }
                } label: {
                    Label("重新发送", systemImage: "arrow.up")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(palette.onPrimary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(palette.primaryActive, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(editingText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .padding(.vertical, AppTheme.Spacing.sm)
        .frame(minWidth: 380, idealWidth: 520, maxWidth: 600, alignment: .leading)
        .background(
            palette.surfaceSoft,
            in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
                .stroke(palette.primary.opacity(0.32), lineWidth: 1)
        }
        .onExitCommand { isEditing = false }
    }

    private var foldButton: some View {
        Button {
            withAnimation(reduceMotion ? nil : AppTheme.Motion.panelPresentation) {
                expanded.toggle()
            }
        } label: {
            Label(expanded ? "收起" : "展开完整消息", systemImage: expanded ? "chevron.up" : "chevron.down")
                .font(.caption.weight(.medium))
        }
        .buttonStyle(.plain)
        .foregroundStyle(palette.primaryActive)
        .help(expanded ? "折叠长消息" : "查看完整消息")
    }

    private var isLong: Bool {
        text.count > 900 || text.split(separator: "\n", omittingEmptySubsequences: false).count > 14
    }

    private var displayedText: String {
        guard isLong, !expanded else { return text }
        return String(text.prefix(520)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private func beginEditing() {
        editingText = text
        isEditing = true
        Task { @MainActor in
            await Task.yield()
            editorFocused = true
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

extension CreamTimelineUserMessage where Accessories == EmptyView {
    init(
        text: String,
        metadata: String,
        maxWidth: CGFloat? = nil,
        revise: ((String) -> Bool)? = nil
    ) {
        self.text = text
        self.metadata = metadata
        self.maxWidth = maxWidth
        self.revise = revise
        accessories = { EmptyView() }
    }
}

private struct CreamTimelineContentSizedBubble<Content: View>: View {
    let maxWidth: CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        CreamTimelineContentSizedLayout(maxWidth: maxWidth) { content() }
    }
}

private struct CreamTimelineContentSizedLayout: Layout {
    let maxWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let subview = subviews.first else { return .zero }
        let availableWidth = min(proposal.width ?? maxWidth, maxWidth)
        let ideal = subview.sizeThatFits(.unspecified)
        let width = min(ideal.width, availableWidth)
        let fitted = subview.sizeThatFits(.init(width: width, height: nil))
        return .init(width: width, height: fitted.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: .init(width: bounds.width, height: bounds.height))
    }
}

private struct CreamTimelineMessageActions: View {
    let metadata: String
    let text: String
    let edit: (() -> Void)?
    let actionsVisible: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 4) {
            Text(metadata)
                .font(AppTheme.Typography.metadata().monospacedDigit())
                .foregroundStyle(palette.mutedSoft)
                .padding(.trailing, 4)

            HStack(spacing: 4) {
                CreamTimelineActionButton(
                    label: "复制消息",
                    systemImage: "doc.on.doc",
                    action: { copyTimelineText(text) }
                )
                if let edit {
                    CreamTimelineActionButton(label: "编辑消息", systemImage: "pencil", action: edit)
                }
            }
            .opacity(actionsVisible ? 1 : 0)
        }
        .frame(height: 24)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamTimelineActionButton: View {
    let label: String
    let systemImage: String
    let action: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(AppTheme.Typography.compactMetadata(weight: .semibold))
                .foregroundStyle(palette.muted)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(label)
        .accessibilityLabel(label)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private func copyTimelineText(_ text: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
}

private extension View {
    func creamSelectableTextCursor() -> some View {
        onContinuousHover { phase in
            switch phase {
            case .active: NSCursor.iBeam.set()
            case .ended: NSCursor.arrow.set()
            }
        }
    }
}
