import SwiftUI

struct CreamPrimaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(palette.onPrimary)
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(palette.primaryActive.opacity(configuration.isPressed ? 0.82 : 1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: AppTheme.Motion.fast), value: configuration.isPressed)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CreamSecondaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .foregroundStyle(palette.body.opacity(configuration.isPressed ? 0.72 : 1))
            .padding(.horizontal, 11)
            .frame(height: 32)
            .background(configuration.isPressed ? palette.surfaceSoft : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
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

struct CreamTabBar<Item: Identifiable & Equatable>: View {
    let items: [Item]
    @Binding var selection: Item
    let title: (Item) -> String
    @Namespace private var tabIndicator
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 24) {
            ForEach(items) { item in
                Button {
                    withAnimation(.easeInOut(duration: AppTheme.Motion.standard)) { selection = item }
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

struct CreamModalOverlay<Content: View>: View {
    let close: () -> Void
    var preferredWidth: CGFloat = 640
    var preferredHeight: CGFloat = 480
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var colorScheme

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
                    .transition(.scale(scale: 0.98).combined(with: .opacity))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .zIndex(100)
    }
}
