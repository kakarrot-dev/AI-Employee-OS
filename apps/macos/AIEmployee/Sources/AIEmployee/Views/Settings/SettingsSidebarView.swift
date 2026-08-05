import SwiftUI

struct SettingsSidebarView: View {
    @Binding var selection: SettingsSection
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("设置")
                .font(.title2.weight(.semibold))
                .foregroundStyle(palette.ink)
                .padding(.horizontal, 18)
                .frame(height: 58)

            VStack(spacing: 4) {
                ForEach(SettingsSection.allCases) { section in
                    Button {
                        selection = section
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: section.systemImage).frame(width: 18)
                            Text(section.title)
                            Spacer()
                        }
                        .foregroundStyle(selection == section ? palette.ink : palette.body)
                        .padding(.horizontal, 10)
                        .frame(height: 36)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(selection == section ? palette.primary.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .accessibilityAddTraits(selection == section ? .isSelected : [])
                }
            }
            .padding(.horizontal, 10)

            Spacer()
        }
        .background(palette.surfaceSoft)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
