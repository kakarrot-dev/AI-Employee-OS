import SwiftUI

enum CreamIconButtonTone {
    case neutral
    case primary
    case destructive
}

struct CreamSearchField: View {
    let placeholder: String
    @Binding var text: String
    let accessibilityLabel: String
    var onSubmit: (() -> Void)?

    @FocusState private var isFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    init(
        _ placeholder: String,
        text: Binding<String>,
        accessibilityLabel: String,
        onSubmit: (() -> Void)? = nil
    ) {
        self.placeholder = placeholder
        _text = text
        self.accessibilityLabel = accessibilityLabel
        self.onSubmit = onSubmit
    }

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(palette.mutedSoft)
                .accessibilityHidden(true)

            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .font(AppTheme.Typography.interfaceBody())
                .foregroundStyle(palette.body)
                .focused($isFocused)
                .onSubmit { onSubmit?() }
                .accessibilityLabel(accessibilityLabel)

            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .frame(width: AppTheme.Control.compactHeight, height: AppTheme.Control.compactHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(palette.mutedSoft)
                .help("清除\(accessibilityLabel)")
                .accessibilityLabel("清除\(accessibilityLabel)")
            }
        }
        .padding(.leading, 11)
        .padding(.trailing, text.isEmpty ? 11 : 3)
        .frame(height: AppTheme.Control.fieldHeight)
        .background(
            palette.surfaceCard,
            in: RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
                .stroke(isFocused ? palette.focusStroke : palette.hairlineSoft, lineWidth: isFocused ? 1.5 : 1)
        }
        .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamIconButton: View {
    let systemName: String
    let accessibilityLabel: String
    let help: String
    var tone: CreamIconButtonTone = .neutral
    var isSelected = false
    let action: () -> Void

    @State private var isHovered = false
    @FocusState private var isFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(AppTheme.Typography.supporting(weight: .semibold))
                .frame(width: AppTheme.Control.hitTarget, height: AppTheme.Control.hitTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(
            CreamIconButtonStyle(
                foreground: foreground,
                background: background,
                isFocused: isFocused
            )
        )
        .focusable()
        .focused($isFocused)
        .onHover { hovered in
            withAnimation(reduceMotion ? nil : AppTheme.Motion.hoverReveal) {
                isHovered = hovered
            }
        }
        .help(help)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var foreground: Color {
        switch tone {
        case .neutral: palette.body
        case .primary: palette.primaryActive
        case .destructive: palette.error
        }
    }

    private var background: Color {
        if isSelected { return palette.selectionFill }
        if isHovered {
            return tone == .destructive ? palette.dangerFill : palette.hoverFill
        }
        return .clear
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamIconButtonStyle: ButtonStyle {
    let foreground: Color
    let background: Color
    let isFocused: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground.opacity(configuration.isPressed ? 0.72 : 1))
            .background(background, in: RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
                    .stroke(isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamSectionHeader<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var count: Int?
    @ViewBuilder let trailing: () -> Trailing

    @Environment(\.colorScheme) private var colorScheme

    init(
        _ title: String,
        subtitle: String? = nil,
        count: Int? = nil,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.title = title
        self.subtitle = subtitle
        self.count = count
        self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: subtitle == nil ? .firstTextBaseline : .top, spacing: AppTheme.Spacing.sm) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(title)
                    .font(AppTheme.Typography.sectionTitle)
                    .foregroundStyle(palette.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(AppTheme.Typography.metadata())
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: AppTheme.Spacing.sm)
            if let count {
                Text("\(count)")
                    .font(AppTheme.Typography.metadata().monospacedDigit())
                    .foregroundStyle(palette.muted)
                    .accessibilityLabel("共 \(count) 项")
            }
            trailing()
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

extension CreamSectionHeader where Trailing == EmptyView {
    init(_ title: String, subtitle: String? = nil, count: Int? = nil) {
        self.init(title, subtitle: subtitle, count: count) { EmptyView() }
    }
}

struct CreamStatusBadge: View {
    let title: String
    var systemImage: String?
    var tone: UXFeedbackTone = .neutral

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xxs) {
            if let systemImage {
                Image(systemName: systemImage)
                    .accessibilityHidden(true)
            }
            Text(title)
        }
        .font(AppTheme.Typography.metadata(weight: .semibold))
        .foregroundStyle(toneColor)
        .padding(.horizontal, 9)
        .frame(height: AppTheme.Control.compactHeight)
        .background(toneColor.opacity(0.10), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }

    private var toneColor: Color {
        switch tone {
        case .neutral: palette.accentTeal
        case .success: palette.success
        case .warning: palette.warning
        case .error: palette.error
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
