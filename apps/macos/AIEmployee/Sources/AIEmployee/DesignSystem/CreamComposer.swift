import AppKit
import SwiftUI

enum CreamComposerSize {
    case compact
    case regular
    case expanded

    fileprivate var minimumInputHeight: CGFloat {
        switch self {
        case .compact: 34
        case .regular: 38
        case .expanded: 46
        }
    }

    fileprivate var maximumLines: Int {
        switch self {
        case .compact: 8
        case .regular, .expanded: 6
        }
    }
}

enum CreamComposerActionState {
    case submit
    case loading
    case stop
}

struct CreamComposer<LeadingActions: View, StatusContent: View>: View {
    let placeholder: String
    @Binding var text: String
    let accessibilityLabel: String
    var size: CreamComposerSize = .regular
    var maxWidth: CGFloat?
    var isInputEnabled = true
    var actionState: CreamComposerActionState = .submit
    var isActionEnabled: Bool
    let actionHelp: String
    let onAction: () -> Void
    @ViewBuilder let leadingActions: () -> LeadingActions
    @ViewBuilder let status: () -> StatusContent

    @State private var isFocused = false
    @Environment(\.colorScheme) private var colorScheme

    init(
        _ placeholder: String,
        text: Binding<String>,
        accessibilityLabel: String,
        size: CreamComposerSize = .regular,
        maxWidth: CGFloat? = nil,
        isInputEnabled: Bool = true,
        actionState: CreamComposerActionState = .submit,
        isActionEnabled: Bool,
        actionHelp: String,
        onAction: @escaping () -> Void,
        @ViewBuilder leadingActions: @escaping () -> LeadingActions,
        @ViewBuilder status: @escaping () -> StatusContent
    ) {
        self.placeholder = placeholder
        _text = text
        self.accessibilityLabel = accessibilityLabel
        self.size = size
        self.maxWidth = maxWidth
        self.isInputEnabled = isInputEnabled
        self.actionState = actionState
        self.isActionEnabled = isActionEnabled
        self.actionHelp = actionHelp
        self.onAction = onAction
        self.leadingActions = leadingActions
        self.status = status
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .font(AppTheme.Typography.composer)
                        .foregroundStyle(palette.mutedSoft)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }

                CreamComposerTextView(
                    text: $text,
                    accessibilityLabel: accessibilityLabel,
                    colorScheme: colorScheme,
                    isEnabled: isInputEnabled,
                    minimumHeight: size.minimumInputHeight,
                    maximumLines: size.maximumLines,
                    onFocusChange: { isFocused = $0 },
                    onSubmit: submitFromKeyboard
                )
                .frame(minHeight: size.minimumInputHeight, alignment: .topLeading)
            }
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.top, AppTheme.Spacing.md)
            .padding(.bottom, AppTheme.Spacing.xs)

            HStack(spacing: AppTheme.Spacing.xs) {
                leadingActions()
                Spacer(minLength: AppTheme.Spacing.xs)
                status()
                actionButton
            }
            .padding(.leading, AppTheme.Spacing.sm)
            .padding(.trailing, AppTheme.Spacing.xxs)
            .padding(.bottom, AppTheme.Spacing.xxs)
        }
        .creamFloatingComposer(focused: isFocused)
        .frame(maxWidth: maxWidth ?? .infinity)
        .frame(maxWidth: .infinity)
    }

    private var actionButton: some View {
        Button {
            guard actionState != .loading else { return }
            onAction()
        } label: {
            ZStack {
                Circle()
                    .fill(actionLooksActive ? palette.ink : palette.hairlineSoft)
                    .frame(width: AppTheme.Control.buttonHeight, height: AppTheme.Control.buttonHeight)

                if actionState == .loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(palette.surfaceCard)
                } else {
                    Image(systemName: actionState == .stop ? "stop.fill" : "arrow.up")
                        .font(.callout.weight(.bold))
                        .foregroundStyle(actionLooksActive ? palette.surfaceCard : palette.mutedSoft)
                }
            }
            .frame(width: AppTheme.Control.hitTarget, height: AppTheme.Control.hitTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(CreamComposerActionButtonStyle(visuallyEnabled: actionLooksActive))
        .disabled(!isActionEnabled || actionState == .loading)
        .help(actionHelp)
        .accessibilityLabel(actionHelp)
    }

    private var actionLooksActive: Bool {
        actionState == .loading || isActionEnabled
    }

    private func submitFromKeyboard() {
        guard actionState == .submit, isActionEnabled else { return }
        onAction()
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamComposerActionButtonStyle: ButtonStyle {
    let visuallyEnabled: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(visuallyEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
    }
}

private struct CreamFloatingComposerSurface: ViewModifier {
    let focused: Bool

    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .background(
                .regularMaterial,
                in: RoundedRectangle(cornerRadius: AppTheme.Elevation.composerRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Elevation.composerRadius, style: .continuous)
                    .stroke(focused ? palette.primary.opacity(0.20) : palette.hairlineSoft.opacity(0.72), lineWidth: 1)
            }
            .shadow(color: focused ? palette.primary.opacity(0.10) : .clear, radius: 8)
            .shadow(
                color: palette.shadow,
                radius: AppTheme.Elevation.composerRadius,
                y: AppTheme.Elevation.composerY
            )
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private extension View {
    func creamFloatingComposer(focused: Bool) -> some View {
        modifier(CreamFloatingComposerSurface(focused: focused))
    }
}
