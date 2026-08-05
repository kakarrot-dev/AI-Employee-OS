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
    let employee: Employee?
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text(employee?.name ?? "当前员工").font(.largeTitle.weight(.semibold))
                Text("能力基线").font(.title3).foregroundStyle(.secondary)
            }
            Divider()
            LabeledContent("Skills", value: "0 个")
            LabeledContent("Tools", value: "0 个")
            Text("当前阶段刻意保持无 Skill、无 Tool，用于测量员工的基础对话能力。后续安装能力时，这里将显示版本、状态、权限和对比结果。").foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: 720, maxHeight: .infinity, alignment: .topLeading)
        .padding(AppTheme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .navigationTitle("能力")
    }
}
