import SwiftUI

struct SettingsSidebarView: View {
    @Binding var selection: SettingsSection
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("设置")
                .font(.title3.weight(.semibold))
                .foregroundStyle(palette.ink)
                .padding(.horizontal, 16)
                .frame(height: 54)

            Divider().overlay(palette.hairlineSoft)

            VStack(spacing: 4) {
                ForEach(SettingsSection.allCases) { section in
                    CreamInteractiveRow(
                        isSelected: selection == section,
                        accessibilityLabel: section.title,
                        action: { selection = section }
                    ) {
                        HStack(spacing: 10) {
                            CreamSymbol(systemName: section.systemImage)
                            Text(section.title)
                            Spacer(minLength: 0)
                        }
                        .font(.callout)
                        .foregroundStyle(selection == section ? palette.ink : palette.body)
                        .padding(.horizontal, 10)
                        .frame(height: 36)
                        .contentShape(Rectangle())
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)

            Spacer(minLength: 0)
        }
        .background(palette.surfaceSoft)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
