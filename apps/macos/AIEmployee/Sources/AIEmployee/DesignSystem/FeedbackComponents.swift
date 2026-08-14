import SwiftUI

enum UXFeedbackTone: Equatable {
    case neutral
    case success
    case warning
    case error
}

struct UXFeedbackStateView: View {
    let title: String
    let message: String
    let systemImage: String
    var tone: UXFeedbackTone = .neutral
    var actionTitle: String?
    var action: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label(title, systemImage: systemImage)
                .font(AppTheme.Typography.workspaceTitle)
                .foregroundStyle(toneColor)
            Text(message)
                .font(AppTheme.Typography.interfaceBody())
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(CreamSecondaryButtonStyle())
            }
        }
        .frame(maxWidth: 460, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private var toneColor: Color {
        switch tone {
        case .neutral: palette.ink
        case .success: palette.success
        case .warning: palette.warning
        case .error: palette.error
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct UXInlineFeedback: View {
    let message: String
    var tone: UXFeedbackTone = .error

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Label(message, systemImage: systemImage)
            .font(AppTheme.Typography.metadata())
            .foregroundStyle(toneColor)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(message)
    }

    private var systemImage: String {
        switch tone {
        case .neutral: "info.circle"
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.circle.fill"
        }
    }

    private var toneColor: Color {
        switch tone {
        case .neutral: palette.muted
        case .success: palette.success
        case .warning: palette.warning
        case .error: palette.error
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct UXAsyncActionLabel: View {
    let idleTitle: String
    let pendingTitle: String
    let isPending: Bool

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            if isPending { ProgressView().controlSize(.small) }
            Text(isPending ? pendingTitle : idleTitle)
        }
        .frame(minWidth: 88)
        .accessibilityLabel(isPending ? pendingTitle : idleTitle)
    }
}

struct UXToastNotice: Equatable, Identifiable {
    let id = UUID()
    let message: String
    var tone: UXFeedbackTone = .success
}

struct UXToastOverlay: View {
    @Binding var notice: UXToastNotice?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let notice {
                HStack(spacing: AppTheme.Spacing.xs) {
                    CreamSymbol(systemName: icon(for: notice.tone))
                        .foregroundStyle(color(for: notice.tone))
                    Text(notice.message)
                        .font(AppTheme.Typography.interfaceBody(weight: .medium))
                        .foregroundStyle(palette.body)
                    CreamIconButton(
                        systemName: "xmark",
                        accessibilityLabel: "关闭提示",
                        help: "关闭提示",
                        action: { self.notice = nil }
                    )
                }
                .padding(.leading, AppTheme.Spacing.md)
                .padding(.trailing, AppTheme.Spacing.xs)
                .frame(minHeight: 44)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
                .shadow(color: palette.shadow, radius: 12, y: 4)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .task(id: notice.id) {
                    try? await Task.sleep(for: .seconds(3))
                    guard !Task.isCancelled, self.notice?.id == notice.id else { return }
                    self.notice = nil
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(reduceMotion ? nil : AppTheme.Motion.panelPresentation, value: notice)
    }

    private func icon(for tone: UXFeedbackTone) -> String {
        switch tone {
        case .neutral: "info.circle.fill"
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.circle.fill"
        }
    }

    private func color(for tone: UXFeedbackTone) -> Color {
        switch tone {
        case .neutral: palette.accentTeal
        case .success: palette.success
        case .warning: palette.warning
        case .error: palette.error
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
