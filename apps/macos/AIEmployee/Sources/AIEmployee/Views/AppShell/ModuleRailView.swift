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

            Divider()
                .overlay(palette.hairlineSoft.opacity(0.64))
                .padding(.horizontal, AppTheme.Spacing.sm)

            navigationButton(.archive)
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.top, AppTheme.Spacing.sm)

            navigationButton(.settings)
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.bottom, AppTheme.Spacing.sm)
                .help("设置（⌘,）")
        }
        .creamPaneSurface(.globalNavigation)
    }

    private var brandHeader: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            ApplicationLogo(size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text("AI Employee OS")
                    .font(AppTheme.Typography.sidebarTitle())
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.88)
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

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        CreamInteractiveRow(
            isSelected: isSelected,
            accessibilityLabel: destination.title,
            action: select
        ) {
            HStack(spacing: 11) {
                CreamSymbol(systemName: destination.systemImage)
                    .foregroundStyle(isSelected ? palette.primaryActive : palette.muted)
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
