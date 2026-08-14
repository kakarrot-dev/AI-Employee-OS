import AppKit
import SwiftUI

struct CreamAvatar: View {
    let path: String?
    let name: String
    var size: CGFloat = 32
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let path, let image = NSImage(contentsOfFile: path) {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    Circle().fill(palette.primary.opacity(0.14))
                    Text(String(name.prefix(1)))
                        .font(.system(size: size * 0.42, weight: .semibold))
                        .foregroundStyle(palette.primary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityLabel(name)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamProgressBar: View {
    let value: Double
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(palette.surfaceSoft)
                Capsule()
                    .fill(palette.primary)
                    .frame(width: proxy.size.width * min(max(value, 0), 1))
            }
        }
        .frame(height: 4)
        .accessibilityElement()
        .accessibilityLabel("进度")
        .accessibilityValue("\(Int(min(max(value, 0), 1) * 100))%")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamSidebarRowSurface: ViewModifier {
    let isSelected: Bool
    let isHovered: Bool
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content.background(
            isSelected ? palette.selectionFill
                : isHovered ? palette.hoverFill
                : Color.clear,
            in: RoundedRectangle(cornerRadius: AppTheme.Radius.selection, style: .continuous)
        )
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

extension View {
    func creamSidebarRowSurface(isSelected: Bool, isHovered: Bool) -> some View {
        modifier(CreamSidebarRowSurface(isSelected: isSelected, isHovered: isHovered))
    }
}

struct CreamSidebarButtonStyle: ButtonStyle {
    let isSelected: Bool
    let isHovered: Bool
    var isFocused = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                isSelected ? palette.selectionFill
                    : isHovered ? palette.hoverFill
                    : Color.clear,
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.selection, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Radius.selection, style: .continuous)
                    .stroke(isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamPrimaryButtonStyle: ButtonStyle {
    var isLoading = false

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isFocused) private var isFocused

    func makeBody(configuration: Configuration) -> some View {
        ZStack {
            configuration.label
                .opacity(isLoading ? 0 : 1)
            if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .tint(palette.onPrimary)
                    .accessibilityHidden(true)
            }
        }
            .font(AppTheme.Typography.interfaceBody(weight: .semibold))
            .foregroundStyle(palette.onPrimary)
            .padding(.horizontal, 13)
            .frame(height: AppTheme.Control.buttonHeight)
            .background(
                palette.primaryActive.opacity(configuration.isPressed ? 0.82 : 1),
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
                    .stroke(isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .allowsHitTesting(!isLoading)
            .accessibilityValue(isLoading ? "正在处理" : "")
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
            .modifier(CreamButtonHoverFeedback(kind: .primary))
            .focusEffectDisabled()
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamSecondaryButtonStyle: ButtonStyle {
    var isLoading = false

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isFocused) private var isFocused

    func makeBody(configuration: Configuration) -> some View {
        ZStack {
            configuration.label
                .opacity(isLoading ? 0 : 1)
            if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .tint(palette.primaryActive)
                    .accessibilityHidden(true)
            }
        }
            .font(AppTheme.Typography.interfaceBody(weight: .medium))
            .foregroundStyle(palette.body.opacity(configuration.isPressed ? 0.72 : 1))
            .padding(.horizontal, 11)
            .frame(height: AppTheme.Control.buttonHeight)
            .background(
                configuration.isPressed ? palette.surfaceSoft : Color.clear,
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
                    .stroke(isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .allowsHitTesting(!isLoading)
            .accessibilityValue(isLoading ? "正在处理" : "")
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
            .modifier(CreamButtonHoverFeedback(kind: .secondary))
            .focusEffectDisabled()
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamInlineButtonStyle: ButtonStyle {
    var tone: CreamIconButtonTone = .neutral

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isFocused) private var isFocused

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.metadata(weight: .medium))
            .foregroundStyle(foreground.opacity(configuration.isPressed ? 0.72 : 1))
            .padding(.horizontal, AppTheme.Spacing.xxs)
            .frame(minHeight: AppTheme.Control.compactHeight)
            .background(
                configuration.isPressed ? palette.surfaceSoft : Color.clear,
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                    .stroke(isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
            .modifier(CreamButtonHoverFeedback(kind: .secondary))
            .focusEffectDisabled()
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

/// Interaction-only style for a button embedded inside an already styled compound control.
struct CreamEmbeddedButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.72 : isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
            .modifier(CreamButtonHoverFeedback(kind: .primary))
            .focusEffectDisabled()
    }
}

struct CreamMenuLabel: View {
    let title: String
    var icon: String? = nil
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        HStack(spacing: 8) {
            if let icon {
                CreamSymbol(systemName: icon)
                    .foregroundStyle(palette.muted)
            }
            Text(title).foregroundStyle(palette.body).lineLimit(1)
            Spacer(minLength: 12)
            CreamSymbol(systemName: "chevron.up.chevron.down", scale: .compact)
                .foregroundStyle(palette.mutedSoft)
        }
        .font(AppTheme.Typography.interfaceBody())
        .padding(.horizontal, 11)
        .frame(height: AppTheme.Control.fieldHeight)
        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.selection, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.selection).stroke(palette.hairlineSoft) }
        .contentShape(Rectangle())
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamSegmentedControl<Option: Hashable & Identifiable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var focusedOptionID: Option.ID?
    @State private var hoveredOptionID: Option.ID?

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options) { option in
                Button {
                    selection = option
                } label: {
                    Text(title(option))
                        .font(AppTheme.Typography.metadata(weight: .semibold))
                        .foregroundStyle(selection == option ? palette.primaryActive : hoveredOptionID == option.id ? palette.body : palette.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(
                    CreamSelectionButtonStyle(
                        isSelected: selection == option,
                        isFocused: focusedOptionID == option.id,
                        showsSelectedFill: true,
                        showsFocusStroke: true,
                        showsHoverFill: true,
                        isHovered: hoveredOptionID == option.id
                    )
                )
                .focusable()
                .focused($focusedOptionID, equals: option.id)
                .focusEffectDisabled()
                .onHover { hovered in
                    hoveredOptionID = hovered ? option.id : nil
                }
                .accessibilityAddTraits(selection == option ? .isSelected : [])
            }
        }
        .padding(3)
        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.selection, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.Radius.selection, style: .continuous).stroke(palette.hairlineSoft)
        }
        .onMoveCommand(perform: moveFocus)
    }

    private func moveFocus(_ direction: MoveCommandDirection) {
        guard !options.isEmpty else { return }
        let current = focusedOptionID.flatMap { id in options.firstIndex(where: { $0.id == id }) }
            ?? options.firstIndex(of: selection)
            ?? 0
        let next: Int
        switch direction {
        case .left, .up: next = max(current - 1, 0)
        case .right, .down: next = min(current + 1, options.count - 1)
        default: return
        }
        selection = options[next]
        focusedOptionID = options[next].id
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamTabBar<Item: Identifiable & Equatable>: View {
    let items: [Item]
    @Binding var selection: Item
    let title: (Item) -> String
    @Namespace private var tabIndicator
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var focusedItemID: Item.ID?
    @State private var hoveredItemID: Item.ID?

    var body: some View {
        HStack(spacing: 24) {
            ForEach(items) { item in
                Button {
                    withAnimation(reduceMotion ? nil : AppTheme.Motion.selectionMorph) { selection = item }
                } label: {
                    VStack(spacing: 8) {
                        Text(title(item))
                            .font(AppTheme.Typography.interfaceBody(weight: selection == item ? .semibold : .medium))
                            .foregroundStyle(selection == item ? palette.primaryActive : hoveredItemID == item.id ? palette.body : palette.muted)
                            .lineLimit(1)
                        ZStack {
                            Rectangle().fill(Color.clear).frame(height: 2)
                            if selection == item {
                                RoundedRectangle(cornerRadius: 1).fill(palette.primaryActive).frame(height: 2).matchedGeometryEffect(id: "indicator", in: tabIndicator)
                            }
                        }
                    }
                }
                .buttonStyle(
                    CreamSelectionButtonStyle(
                        isSelected: selection == item,
                        isFocused: focusedItemID == item.id,
                        showsSelectedFill: false,
                        showsFocusStroke: false,
                        showsHoverFill: false,
                        isHovered: hoveredItemID == item.id
                    )
                )
                .focusable()
                .focused($focusedItemID, equals: item.id)
                .focusEffectDisabled()
                .overlay {
                    if focusedItemID == item.id {
                        RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                            .stroke(palette.focusStroke, lineWidth: 1.5)
                            .padding(.horizontal, -8)
                            .padding(.vertical, -4)
                    }
                }
                .onHover { hovered in
                    withAnimation(reduceMotion ? nil : AppTheme.Motion.hoverReveal) {
                        hoveredItemID = hovered ? item.id : nil
                    }
                }
                .accessibilityAddTraits(selection == item ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(palette.hairlineSoft.opacity(0.68)).frame(height: 1)
        }
        .onMoveCommand(perform: moveFocus)
    }

    private func moveFocus(_ direction: MoveCommandDirection) {
        guard !items.isEmpty else { return }
        let current = focusedItemID.flatMap { id in items.firstIndex(where: { $0.id == id }) }
            ?? items.firstIndex(of: selection)
            ?? 0
        let next: Int
        switch direction {
        case .left, .up: next = max(current - 1, 0)
        case .right, .down: next = min(current + 1, items.count - 1)
        default: return
        }
        selection = items[next]
        focusedItemID = items[next].id
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamSelectionButtonStyle: ButtonStyle {
    let isSelected: Bool
    let isFocused: Bool
    let showsSelectedFill: Bool
    let showsFocusStroke: Bool
    let showsHoverFill: Bool
    let isHovered: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                showsSelectedFill && isSelected ? palette.selectionFill
                    : showsHoverFill && isHovered ? palette.hoverFill
                    : Color.clear,
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                    .stroke(showsFocusStroke && isFocused ? palette.focusStroke : .clear, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? AppTheme.Interaction.pressedScale : 1)
            .opacity(isEnabled ? 1 : AppTheme.Interaction.disabledOpacity)
            .animation(reduceMotion ? nil : AppTheme.Motion.pressFeedback, value: configuration.isPressed)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CreamButtonHoverFeedback: ViewModifier {
    enum Kind { case primary, secondary }

    let kind: Kind
    @State private var isHovered = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .background(
                kind == .secondary && isHovered && isEnabled ? palette.hoverFill : Color.clear,
                in: RoundedRectangle(cornerRadius: AppTheme.Radius.control, style: .continuous)
            )
            .opacity(kind == .primary && isHovered && isEnabled ? 0.92 : 1)
            .onHover { hovered in
                withAnimation(reduceMotion ? nil : AppTheme.Motion.hoverReveal) {
                    isHovered = hovered
                }
            }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

/// 顶栏居中标题：图标 + 文案，与侧栏模块图标一致。
struct ModuleToolbarTitle: View {
    let title: String
    let systemImage: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            CreamSymbol(systemName: systemImage)
            Text(title)
        }
            .font(AppTheme.Typography.workspaceTitle)
            .foregroundStyle(palette.ink)
            .accessibilityElement(children: .combine)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

extension View {
    func moduleNavigationTitle(_ title: String, systemImage: String) -> some View {
        navigationTitle("")
            .toolbar {
                if #available(macOS 26.0, *) {
                    ToolbarItem(placement: .principal) {
                        ModuleToolbarTitle(title: title, systemImage: systemImage)
                    }
                    .sharedBackgroundVisibility(.hidden)
                } else {
                    ToolbarItem(placement: .principal) {
                        ModuleToolbarTitle(title: title, systemImage: systemImage)
                    }
                }
            }
    }

    func moduleNavigationTitle(_ destination: AppDestination) -> some View {
        moduleNavigationTitle(destination.title, systemImage: destination.systemImage)
    }
}

struct CreamModalOverlay<Content: View>: View {
    let close: () -> Void
    var preferredWidth: CGFloat = 640
    var preferredHeight: CGFloat = 480
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var modalFocusScope

    var body: some View {
        GeometryReader { proxy in
            let width = min(preferredWidth, max(0, proxy.size.width - 48))
            let height = min(preferredHeight, max(0, proxy.size.height - 48))
            ZStack {
                Color.black.opacity(colorScheme == .dark ? 0.24 : 0.10)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture(perform: close)

                content()
                    .frame(width: width, height: height)
                    .background(ModalFocusRestorationBridge(close: close))
                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.modal, style: .continuous))
                    .shadow(color: .black.opacity(colorScheme == .dark ? 0.34 : 0.16), radius: 24, y: 10)
                    .transition(reduceMotion ? .opacity : .scale(scale: 0.98).combined(with: .opacity))
                    .focusScope(modalFocusScope)
                    .focusSection()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .zIndex(100)
        .onExitCommand(perform: close)
    }

}

struct ModalFocusRestorationBridge: NSViewRepresentable {
    let close: () -> Void

    func makeNSView(context: Context) -> ModalFocusRestorationView {
        let view = ModalFocusRestorationView()
        view.close = close
        return view
    }

    func updateNSView(_ nsView: ModalFocusRestorationView, context: Context) {
        nsView.close = close
    }

    static func dismantleNSView(_ nsView: ModalFocusRestorationView, coordinator: ()) {
        nsView.restorePreviousResponder()
    }
}

final class ModalFocusRestorationView: NSView {
    var close: () -> Void = {}
    private weak var previousResponder: NSResponder?
    private weak var installedWindow: NSWindow?
    private var capturedResponder = false
    private var eventMonitor: Any?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard !capturedResponder, let window else { return }
        capturedResponder = true
        installedWindow = window
        previousResponder = restorableResponder(from: window.firstResponder)
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self, weak window] event in
            guard let self, event.window === window, event.keyCode == 53 else { return event }
            close()
            return nil
        }
    }

    func restorePreviousResponder() {
        removeEventMonitor()
        guard let installedWindow else { return }
        let previousResponder = previousResponder
        restore(previousResponder, in: installedWindow, remainingAttempts: 3)
    }

    private func restore(_ responder: NSResponder?, in window: NSWindow, remainingAttempts: Int) {
        DispatchQueue.main.async { [weak window] in
            guard let window else { return }
            if let responder, window.makeFirstResponder(responder) {
                return
            }
            if remainingAttempts > 0 {
                self.restore(responder, in: window, remainingAttempts: remainingAttempts - 1)
                return
            }
            _ = window.makeFirstResponder(window.contentView)
        }
    }

    private func restorableResponder(from responder: NSResponder?) -> NSResponder? {
        guard let fieldEditor = responder as? NSTextView, fieldEditor.isFieldEditor else {
            return responder
        }
        return fieldEditor.delegate as? NSResponder ?? responder
    }

    private func removeEventMonitor() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    deinit {
        removeEventMonitor()
    }
}

struct WindowTitlebarScrim: NSViewRepresentable {
    let isPresented: Bool
    let opacity: CGFloat
    let close: () -> Void

    func makeNSView(context: Context) -> TitlebarScrimAnchorView {
        let view = TitlebarScrimAnchorView()
        view.configure(isPresented: isPresented, opacity: opacity, close: close)
        return view
    }

    func updateNSView(_ nsView: TitlebarScrimAnchorView, context: Context) {
        nsView.configure(isPresented: isPresented, opacity: opacity, close: close)
    }

    static func dismantleNSView(_ nsView: TitlebarScrimAnchorView, coordinator: ()) {
        nsView.removeScrim()
    }
}

final class TitlebarScrimAnchorView: NSView {
    private var isPresented = false
    private var opacity: CGFloat = 0.10
    private var close: () -> Void = {}
    private weak var installedWindow: NSWindow?
    private var scrim: TitlebarScrimView?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        updateScrim()
    }

    func configure(isPresented: Bool, opacity: CGFloat, close: @escaping () -> Void) {
        self.isPresented = isPresented
        self.opacity = opacity
        self.close = close
        updateScrim()
    }

    func removeScrim() {
        scrim?.removeFromSuperview()
        scrim = nil
        installedWindow = nil
    }

    private func updateScrim() {
        guard isPresented, let window, let themeFrame = window.contentView?.superview else {
            removeScrim()
            return
        }

        if installedWindow !== window { removeScrim() }
        let overlay = scrim ?? TitlebarScrimView()
        overlay.close = close
        overlay.wantsLayer = true
        overlay.layer?.backgroundColor = NSColor.black.withAlphaComponent(opacity).cgColor

        let titlebarHeight = max(0, window.frame.height - window.contentLayoutRect.height)
        overlay.frame = NSRect(
            x: themeFrame.bounds.minX,
            y: themeFrame.bounds.maxY - titlebarHeight,
            width: themeFrame.bounds.width,
            height: titlebarHeight
        )
        overlay.autoresizingMask = [.width, .minYMargin]

        if overlay.superview == nil {
            themeFrame.addSubview(overlay, positioned: .above, relativeTo: nil)
        }
        scrim = overlay
        installedWindow = window
    }
}

final class TitlebarScrimView: NSView {
    var close: () -> Void = {}
    override func mouseDown(with event: NSEvent) { close() }
}
