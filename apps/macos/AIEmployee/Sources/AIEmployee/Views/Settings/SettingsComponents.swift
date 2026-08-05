import SwiftUI

struct SettingsPageHeader: View {
    let title: String
    let detail: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(palette.ink)
            Text(detail)
                .font(.callout)
                .foregroundStyle(palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            content()
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous)
                .stroke(palette.hairlineSoft)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct SettingsInfoRow: View {
    let label: String
    let value: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 18) {
            Text(label)
                .font(.callout)
                .foregroundStyle(palette.muted)
                .frame(width: 96, alignment: .leading)
            Text(value)
                .font(.callout)
                .foregroundStyle(palette.body)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 46)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct SettingsFootnote: View {
    let text: String
    var tone: Tone = .muted
    @Environment(\.colorScheme) private var colorScheme

    enum Tone {
        case muted, success, warning, error
    }

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var color: Color {
        switch tone {
        case .muted: palette.muted
        case .success: palette.success
        case .warning: palette.warning
        case .error: palette.error
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct SettingsRowDivider: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Divider()
            .overlay(palette.hairlineSoft)
            .padding(.leading, 114)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
