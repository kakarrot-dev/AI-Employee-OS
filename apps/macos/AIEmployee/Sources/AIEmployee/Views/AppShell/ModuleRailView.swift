import SwiftUI

struct MainSidebarView: View {
    @Binding var selection: AppDestination
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            brandHeader

            Rectangle()
                .fill(palette.hairlineSoft)
                .frame(height: 1)
                .padding(.horizontal, AppTheme.Spacing.sm)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 2) {
                    ForEach(AppDestination.primary) { destination in
                        navigationButton(destination)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.vertical, AppTheme.Spacing.sm)
            }

            Divider().overlay(palette.hairlineSoft)

            navigationButton(.archive)
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.top, AppTheme.Spacing.sm)

            navigationButton(.settings)
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.bottom, AppTheme.Spacing.sm)
                .help("设置（⌘,）")
        }
        .background(.ultraThinMaterial)
        .overlay(alignment: .trailing) {
            Rectangle().fill(palette.hairlineSoft).frame(width: 1)
        }
    }

    private var brandHeader: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            ApplicationLogo(size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text("AI Employee OS")
                    .font(AppTheme.Typography.sidebarTitle())
                    .foregroundStyle(palette.ink)
                Text("本地 AI 员工工作台")
                    .font(AppTheme.Typography.metadata())
                    .foregroundStyle(palette.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .frame(height: 64)
        .accessibilityElement(children: .combine)
    }

    private func navigationButton(_ destination: AppDestination) -> some View {
        MainSidebarNavigationButton(
            destination: destination,
            isSelected: selection == destination,
            select: { selection = destination }
        )
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct MainSidebarNavigationButton: View {
    let destination: AppDestination
    let isSelected: Bool
    let select: () -> Void

    @State private var isHovered = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: select) {
            HStack(spacing: 11) {
                Image(systemName: destination.systemImage)
                    .font(.system(size: AppTheme.Typography.navigationSize, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? palette.primaryActive : palette.muted)
                    .frame(width: 18, alignment: .center)
                Text(destination.title)
                    .font(AppTheme.Typography.navigation(weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? palette.ink : palette.body)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, AppTheme.Spacing.sm)
            .frame(maxWidth: .infinity, minHeight: 40, maxHeight: 40, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(CreamSidebarButtonStyle(isSelected: isSelected, isHovered: isHovered))
        .onHover { hovered in
            withAnimation(reduceMotion ? nil : AppTheme.Motion.hoverReveal) {
                isHovered = hovered
            }
        }
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ApplicationLogo: View {
    let size: CGFloat

    var body: some View {
        Image(nsImage: NSApplication.shared.applicationIconImage)
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
