import AppKit
import SwiftUI

struct CreamPrimaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(palette.onPrimary)
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(palette.primaryActive.opacity(configuration.isPressed ? 0.82 : 1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: AppTheme.Motion.fast), value: configuration.isPressed)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamSecondaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .foregroundStyle(palette.body.opacity(configuration.isPressed ? 0.72 : 1))
            .padding(.horizontal, 11)
            .frame(height: 32)
            .background(configuration.isPressed ? palette.surfaceSoft : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: AppTheme.Motion.fast), value: configuration.isPressed)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamMenuLabel: View {
    let title: String
    var icon: String? = nil
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        HStack(spacing: 8) {
            if let icon { Image(systemName: icon).foregroundStyle(palette.muted) }
            Text(title).foregroundStyle(palette.body).lineLimit(1)
            Spacer(minLength: 12)
            Image(systemName: "chevron.up.chevron.down").font(.system(size: 9, weight: .semibold)).foregroundStyle(palette.mutedSoft)
        }
        .font(.callout).padding(.horizontal, 11).frame(height: 34)
        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 9).stroke(palette.hairlineSoft) }
        .contentShape(Rectangle())
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamSegmentedControl<Option: Hashable & Identifiable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options) { option in
                Button {
                    selection = option
                } label: {
                    Text(title(option))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(selection == option ? palette.primaryActive : palette.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 28)
                        .background(
                            selection == option ? palette.primary.opacity(0.11) : Color.clear,
                            in: RoundedRectangle(cornerRadius: 7, style: .continuous)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(palette.hairlineSoft)
        }
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

    var body: some View {
        HStack(spacing: 24) {
            ForEach(items) { item in
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: AppTheme.Motion.standard)) { selection = item }
                } label: {
                    VStack(spacing: 8) {
                        Text(title(item))
                            .font(.callout.weight(selection == item ? .semibold : .medium))
                            .foregroundStyle(selection == item ? palette.primaryActive : palette.muted)
                            .lineLimit(1)
                        ZStack {
                            Rectangle().fill(Color.clear).frame(height: 2)
                            if selection == item {
                                RoundedRectangle(cornerRadius: 1).fill(palette.primaryActive).frame(height: 2).matchedGeometryEffect(id: "indicator", in: tabIndicator)
                            }
                        }
                    }
                }.buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(palette.hairlineSoft).frame(height: 1) }
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

/// 顶栏居中标题：图标 + 文案，与侧栏模块图标一致。
struct ModuleToolbarTitle: View {
    let title: String
    let systemImage: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Label(title, systemImage: systemImage)
            .labelStyle(.titleAndIcon)
            .font(.headline)
            .foregroundStyle(palette.ink)
            .imageScale(.medium)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

extension View {
    func moduleNavigationTitle(_ title: String, systemImage: String) -> some View {
        navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .principal) {
                    ModuleToolbarTitle(title: title, systemImage: systemImage)
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
                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
                    .shadow(color: .black.opacity(colorScheme == .dark ? 0.34 : 0.16), radius: 24, y: 10)
                    .transition(reduceMotion ? .opacity : .scale(scale: 0.98).combined(with: .opacity))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .zIndex(100)
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
