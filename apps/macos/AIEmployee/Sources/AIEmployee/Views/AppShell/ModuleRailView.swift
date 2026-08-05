import SwiftUI

struct ModuleRailView: View {
    @Binding var selection: AppDestination
    let openSettings: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            employeeMark
                .padding(.top, 8)
                .padding(.bottom, 16)

            VStack(spacing: 8) {
                ForEach(AppDestination.allCases) { destination in
                    railButton(destination)
                }
            }

            Spacer(minLength: 16)

            Button(action: openSettings) {
                Image(systemName: "gearshape")
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(palette.muted)
            .help("设置（⌘,）")
            .padding(.bottom, 10)
        }
        .frame(maxHeight: .infinity)
        .background(.regularMaterial)
        .overlay(alignment: .trailing) { Rectangle().fill(palette.hairlineSoft).frame(width: 1) }
    }

    private var employeeMark: some View {
        Circle()
            .fill(palette.primary.opacity(0.16))
            .frame(width: 32, height: 32)
            .overlay {
                Text("A")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(palette.primaryActive)
            }
            .accessibilityLabel("AI Employee OS")
    }

    private func railButton(_ destination: AppDestination) -> some View {
        Button {
            selection = destination
        } label: {
            Image(systemName: destination.systemImage)
                .font(.system(size: 15, weight: selection == destination ? .semibold : .regular))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(selection == destination ? palette.ink : palette.muted)
        .background(selection == destination ? palette.primary.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .help(destination.title)
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(selection == destination ? .isSelected : [])
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
