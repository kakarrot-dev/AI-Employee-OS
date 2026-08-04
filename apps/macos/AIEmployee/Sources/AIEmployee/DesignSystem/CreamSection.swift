import SwiftUI

struct CreamSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let palette = AppTheme.palette(for: colorScheme)
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(palette.ink)
            content
        }
        .padding(.vertical, AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Divider().overlay(palette.hairlineSoft) }
    }
}
