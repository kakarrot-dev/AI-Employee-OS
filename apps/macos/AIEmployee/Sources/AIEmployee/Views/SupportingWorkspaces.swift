import SwiftUI

struct ContactsWorkspaceView: View {
    let openChat: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        List {
            Section("产品部") {
                Button(action: openChat) {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Image(systemName: "person.crop.circle")
                            .foregroundStyle(palette.primary)
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                            Text("Alex").font(.body.weight(.medium))
                            Text("AI 产品经理").font(.caption).foregroundStyle(palette.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .navigationTitle("通讯录")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct CapabilityLibraryWorkspaceView: View {
    var body: some View {
        ContentUnavailableView(
            "能力库尚未开放",
            systemImage: "square.grid.2x2",
            description: Text("员工当前使用的 Skills 与 Tools 仍由 Runtime 的版本化 Package 提供。")
        )
        .navigationTitle("能力库")
    }
}
