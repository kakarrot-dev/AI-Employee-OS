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

            ScrollView {
                LazyVStack(spacing: AppTheme.Spacing.xxs) {
                    ForEach(AppDestination.primary) { destination in
                        navigationButton(destination)
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.top, AppTheme.Spacing.sm)
            }

            Divider().overlay(palette.hairlineSoft)

            navigationButton(.settings)
            .padding(AppTheme.Spacing.sm)
            .help("设置（⌘,）")
        }
        .background(.ultraThinMaterial)
        .overlay(alignment: .trailing) {
            Rectangle().fill(palette.hairlineSoft).frame(width: 1)
        }
    }

    private var brandHeader: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            AlexMark(size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text("AI Employee OS")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(palette.ink)
                Text("本地 AI 员工工作台")
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AppTheme.Spacing.md)
        .frame(height: 64)
        .accessibilityElement(children: .combine)
    }

    private func navigationButton(_ destination: AppDestination) -> some View {
        Button {
            selection = destination
        } label: {
            HStack(spacing: 11) {
                Image(systemName: destination.systemImage)
                    .font(.system(size: 14, weight: selection == destination ? .semibold : .regular))
                    .foregroundStyle(selection == destination ? palette.primaryActive : palette.muted)
                    .frame(width: 18)
                Text(destination.title)
                    .font(.callout.weight(selection == destination ? .semibold : .regular))
                    .foregroundStyle(selection == destination ? palette.ink : palette.body)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, AppTheme.Spacing.sm)
            .frame(height: 38)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            selection == destination ? palette.primary.opacity(0.12) : .clear,
            in: RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
        )
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(selection == destination ? .isSelected : [])
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
