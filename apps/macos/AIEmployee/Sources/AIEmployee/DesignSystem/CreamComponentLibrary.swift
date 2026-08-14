import SwiftUI

enum CreamIconButtonTone {
    case neutral
    case primary
    case destructive
}

enum CreamSymbolScale {
    case compact
    case standard
    case feature
    case emptyState

    fileprivate var pointSize: CGFloat {
        switch self {
        case .compact: 9
        case .standard: AppTheme.Typography.navigationSize
        case .feature: 20
        case .emptyState: 28
        }
    }

    fileprivate var frameSize: CGFloat {
        switch self {
        case .compact: 12
        case .standard: 18
        case .feature: 24
        case .emptyState: 32
        }
    }
}

/// Shared SF Symbol grammar. Feature views choose only semantic scale and color.
struct CreamSymbol: View {
    let systemName: String
    var scale: CreamSymbolScale = .standard

    var body: some View {
        Image(systemName: systemName)
            .symbolRenderingMode(.monochrome)
            .font(.system(size: scale.pointSize, weight: .medium))
            .frame(width: scale.frameSize, height: scale.frameSize, alignment: .center)
            .accessibilityHidden(true)
    }
}

enum CreamFeatureIconSize: Equatable {
    case compact
    case regular

    fileprivate var surfaceSize: CGFloat { self == .compact ? 32 : 46 }
    fileprivate var cornerRadius: CGFloat { self == .compact ? AppTheme.Radius.selection : 13 }
    fileprivate var symbolScale: CreamSymbolScale { self == .compact ? .standard : .feature }
}

/// Shared icon surface for list objects and detail headers.
struct CreamFeatureIcon: View {
    let systemName: String
    var size: CreamFeatureIconSize = .regular

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        CreamSymbol(systemName: systemName, scale: size.symbolScale)
            .foregroundStyle(palette.primaryActive)
            .frame(width: size.surfaceSize, height: size.surfaceSize)
            .background(
                palette.primary.opacity(0.10),
                in: RoundedRectangle(cornerRadius: size.cornerRadius, style: .continuous)
            )
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamActionIcon: View {
    let systemName: String

    var body: some View {
        CreamSymbol(systemName: systemName)
            .frame(width: AppTheme.Control.hitTarget, height: AppTheme.Control.hitTarget)
            .contentShape(Rectangle())
    }
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
            CreamSymbol(systemName: "magnifyingglass")
                .foregroundStyle(palette.mutedSoft)

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
                    CreamSymbol(systemName: "xmark.circle.fill")
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
            CreamActionIcon(systemName: systemName)
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
        .focusEffectDisabled()
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

struct CreamIconMenu<Content: View>: View {
    let systemName: String
    let accessibilityLabel: String
    let help: String
    var tone: CreamIconButtonTone = .neutral
    @ViewBuilder let content: () -> Content

    @State private var isHovered = false
    @FocusState private var isFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Menu(content: content) {
            CreamActionIcon(systemName: systemName)
                .foregroundStyle(foreground)
                .background(
                    isHovered ? palette.hoverFill : Color.clear,
                    in: RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
                        .stroke(isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
                }
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .tint(foreground)
        .fixedSize()
        .focusable()
        .focused($isFocused)
        .focusEffectDisabled()
        .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
        .onHover { hovered in
            withAnimation(reduceMotion ? nil : AppTheme.Motion.hoverReveal) {
                isHovered = hovered
            }
        }
        .help(help)
        .accessibilityLabel(accessibilityLabel)
    }

    private var foreground: Color {
        switch tone {
        case .neutral: palette.body
        case .primary: palette.primaryActive
        case .destructive: palette.error
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

/// Shared selection row contract for navigation, browsers and dense lists.
struct CreamInteractiveRow<Label: View>: View {
    let isSelected: Bool
    let accessibilityLabel: String
    let action: () -> Void
    @ViewBuilder let label: () -> Label

    @State private var isHovered = false
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        isSelected: Bool,
        accessibilityLabel: String,
        action: @escaping () -> Void,
        @ViewBuilder label: @escaping () -> Label
    ) {
        self.isSelected = isSelected
        self.accessibilityLabel = accessibilityLabel
        self.action = action
        self.label = label
    }

    var body: some View {
        Button(action: action) {
            label()
                .contentShape(Rectangle())
        }
        .buttonStyle(
            CreamSidebarButtonStyle(
                isSelected: isSelected,
                isHovered: isHovered,
                isFocused: isFocused
            )
        )
        .focusable()
        .focused($isFocused)
        .focusEffectDisabled()
        .onHover { hovered in
            withAnimation(reduceMotion ? nil : AppTheme.Motion.hoverReveal) {
                isHovered = hovered
            }
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
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

enum CreamPaneSurfaceRole: Equatable {
    case globalNavigation
    case collection
    case tabWorkspace
}

private struct CreamPaneSurfaceModifier: ViewModifier {
    let role: CreamPaneSurfaceRole
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background { backgroundLayer }
            .clipShape(shape)
            .overlay {
                shape.stroke(palette.hairlineSoft.opacity(strokeOpacity), lineWidth: 0.75)
            }
            .shadow(color: palette.shadow, radius: shadowRadius, x: 0, y: shadowY)
            .padding(insets)
            .background(palette.canvas)
    }

    @ViewBuilder private var backgroundLayer: some View {
        switch role {
        case .globalNavigation:
            Rectangle().fill(.ultraThinMaterial)
        case .collection:
            Rectangle().fill(palette.surfaceSoft)
        case .tabWorkspace:
            Rectangle().fill(palette.surfaceCard)
        }
    }

    private var radius: CGFloat {
        switch role {
        case .globalNavigation, .tabWorkspace: AppTheme.Radius.xl
        case .collection: AppTheme.Radius.lg
        }
    }

    private var insets: EdgeInsets {
        switch role {
        case .globalNavigation:
            EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 6)
        case .collection:
            EdgeInsets(top: 8, leading: 6, bottom: 8, trailing: 6)
        case .tabWorkspace:
            EdgeInsets()
        }
    }

    private var strokeOpacity: Double { role == .tabWorkspace ? 0.72 : 0.52 }
    private var shadowRadius: CGFloat { role == .tabWorkspace ? 12 : role == .globalNavigation ? 10 : 7 }
    private var shadowY: CGFloat { role == .tabWorkspace ? 2 : 1 }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

extension View {
    func creamPaneSurface(_ role: CreamPaneSurfaceRole) -> some View {
        modifier(CreamPaneSurfaceModifier(role: role))
    }
}

/// Centers page-level tab headers and bodies on the same readable content track.
struct CreamTabbedPageContainer<Content: View>: View {
    var maxWidth: CGFloat = AppLayoutProfile.tabbedDetailContentMaxWidth
    var horizontalInset: CGFloat?
    var showsWorkspaceSurface = false
    @ViewBuilder let content: () -> Content

    @Environment(\.resolvedAppLayout) private var layout

    var body: some View {
        trackedContent
            .frame(maxWidth: maxWidth, alignment: .leading)
            .padding(.horizontal, horizontalInset ?? layout.horizontalInset)
            .frame(maxWidth: .infinity, alignment: .top)
    }

    @ViewBuilder private var trackedContent: some View {
        if showsWorkspaceSurface {
            content().creamPaneSurface(.tabWorkspace)
        } else {
            content()
        }
    }
}

/// A restrained reading surface used inside page-level tabs.
struct CreamContentSurface<Content: View>: View {
    var maxWidth: CGFloat = .infinity
    var contentInset: CGFloat = 20
    @ViewBuilder let content: () -> Content

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        content()
            .padding(contentInset)
            .frame(maxWidth: maxWidth, alignment: .leading)
            .background(palette.surfaceCard, in: shape)
            .overlay { shape.stroke(palette.hairlineSoft, lineWidth: 1) }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

/// Matches the Contacts tab rhythm: semantic heading first, reading surface second.
struct CreamTabContentSection<Content: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder let content: () -> Content

    init(
        _ title: String,
        subtitle: String? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            CreamSectionHeader(title, subtitle: subtitle)
            CreamContentSurface {
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
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
                CreamSymbol(systemName: systemImage, scale: .compact)
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

/// Compact inline status for dense rows. Page headers use CreamStatusBadge instead.
struct CreamStatusLabel: View {
    let title: String
    var systemImage: String?
    var tone: UXFeedbackTone = .neutral

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xxs) {
            if let systemImage {
                CreamSymbol(systemName: systemImage, scale: .compact)
            }
            Text(title)
                .lineLimit(1)
        }
        .font(AppTheme.Typography.compactMetadata(weight: .semibold))
        .foregroundStyle(toneColor)
        .fixedSize(horizontal: true, vertical: false)
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

/// Shared object-detail header: object, status and actions stay in one row; tabs share its content width.
struct CreamTabbedDetailHeader<Item: Identifiable & Equatable, Leading: View, Actions: View>: View {
    let title: String
    var metadata: String?
    let subtitle: String
    var statusTitle: String?
    var statusSystemImage: String?
    var statusTone: UXFeedbackTone
    let tabs: [Item]
    @Binding var selection: Item
    let tabTitle: (Item) -> String
    @ViewBuilder let leading: () -> Leading
    @ViewBuilder let actions: () -> Actions

    @Environment(\.colorScheme) private var colorScheme

    init(
        title: String,
        metadata: String? = nil,
        subtitle: String,
        statusTitle: String? = nil,
        statusSystemImage: String? = nil,
        statusTone: UXFeedbackTone = .neutral,
        tabs: [Item],
        selection: Binding<Item>,
        tabTitle: @escaping (Item) -> String,
        @ViewBuilder leading: @escaping () -> Leading,
        @ViewBuilder actions: @escaping () -> Actions
    ) {
        self.title = title
        self.metadata = metadata
        self.subtitle = subtitle
        self.statusTitle = statusTitle
        self.statusSystemImage = statusSystemImage
        self.statusTone = statusTone
        self.tabs = tabs
        _selection = selection
        self.tabTitle = tabTitle
        self.leading = leading
        self.actions = actions
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                leading()
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        Text(title)
                            .font(AppTheme.Typography.pageTitle)
                            .foregroundStyle(palette.ink)
                            .lineLimit(1)
                        if let metadata {
                            Text(metadata)
                                .font(.system(size: AppTheme.Typography.metadataSize, design: .monospaced))
                                .foregroundStyle(palette.muted)
                                .lineLimit(1)
                        }
                        if let statusTitle {
                            CreamStatusBadge(
                                title: statusTitle,
                                systemImage: statusSystemImage,
                                tone: statusTone
                            )
                        }
                    }
                    Text(subtitle)
                        .font(AppTheme.Typography.supporting())
                        .foregroundStyle(palette.muted)
                        .lineLimit(2)
                }
                .layoutPriority(1)
                Spacer(minLength: AppTheme.Spacing.xs)
                actions()
                    .fixedSize(horizontal: true, vertical: false)
            }
            CreamTabBar(items: tabs, selection: $selection, title: tabTitle)
                .frame(maxWidth: .infinity)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
