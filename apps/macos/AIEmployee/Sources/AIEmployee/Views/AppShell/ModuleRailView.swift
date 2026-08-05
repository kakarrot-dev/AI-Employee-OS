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

            navigationButton(.settings)
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.vertical, AppTheme.Spacing.sm)
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
        let selected = selection == destination
        return Button {
            selection = destination
        } label: {
            HStack(spacing: 11) {
                Image(systemName: destination.systemImage)
                    .font(.system(size: 14, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? palette.primaryActive : palette.muted)
                    .frame(width: 18, alignment: .center)
                Text(destination.title)
                    .font(.callout.weight(selected ? .semibold : .regular))
                    .foregroundStyle(selected ? palette.ink : palette.body)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, AppTheme.Spacing.sm)
            .frame(maxWidth: .infinity, minHeight: 36, maxHeight: 36, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            selected ? palette.primary.opacity(0.12) : .clear,
            in: RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
        )
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
