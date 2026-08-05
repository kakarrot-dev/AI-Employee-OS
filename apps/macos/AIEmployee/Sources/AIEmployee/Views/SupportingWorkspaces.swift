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
    @State private var filter = CapabilityFilter.all
    @Environment(\.colorScheme) private var colorScheme

    private var capabilities: [CapabilityRecord] {
        // Runtime 尚未提供全局能力目录接口。保持空数据，避免把任务执行记录
        // 或当前员工配置误称为系统中已安装的完整 Skill / Tool 清单。
        []
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: AppTheme.Spacing.md) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("能力库").font(.largeTitle.weight(.semibold)).foregroundStyle(palette.ink)
                    Text("管理所有 AI 员工可使用的 Skill 与 Tool").foregroundStyle(palette.muted)
                }
                Spacer()
                Picker("能力类型", selection: $filter) {
                    ForEach(CapabilityFilter.allCases) { option in Text(option.title).tag(option) }
                }
                .labelsHidden()
                .pickerStyle(.segmented)
                .frame(width: 240)
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)

            Divider().overlay(palette.hairlineSoft)

            if capabilities.isEmpty {
                ContentUnavailableView {
                    Label(filter.emptyTitle, systemImage: filter.systemImage)
                } description: {
                    Text(filter.emptyDetail)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(capabilities) { capability in
                    HStack(spacing: AppTheme.Spacing.md) {
                        Image(systemName: capability.kind.systemImage)
                            .frame(width: 28, height: 28)
                            .foregroundStyle(palette.primaryActive)
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                            Text(capability.name).font(.body.weight(.medium))
                            Text(capability.detail).font(.caption).foregroundStyle(palette.muted)
                        }
                        Spacer()
                        Text(capability.version).font(.caption.monospaced()).foregroundStyle(palette.muted)
                        Text(capability.kind.title).font(.caption.weight(.medium)).foregroundStyle(palette.primaryActive)
                    }
                    .padding(.vertical, AppTheme.Spacing.xs)
                }
                .listStyle(.inset)
            }
        }
        .background(palette.canvas)
        .navigationTitle("能力库")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum CapabilityFilter: String, CaseIterable, Identifiable {
    case all, skills, tools
    var id: String { rawValue }
    var title: String { switch self { case .all: "全部"; case .skills: "Skills"; case .tools: "Tools" } }
    var systemImage: String { switch self { case .all: "square.grid.2x2"; case .skills: "sparkles"; case .tools: "wrench.and.screwdriver" } }
    var emptyTitle: String { switch self { case .all: "还没有可用能力"; case .skills: "还没有 Skill"; case .tools: "还没有 Tool" } }
    var emptyDetail: String { switch self { case .all: "安装 Skill 或 Tool 后，它们会统一出现在这里。"; case .skills: "安装 Skill 后会显示版本、状态和适用范围。"; case .tools: "连接 Tool 后会显示权限、状态和可用范围。" } }
}

private enum CapabilityKind {
    case skill, tool
    var title: String { self == .skill ? "Skill" : "Tool" }
    var systemImage: String { self == .skill ? "sparkles" : "wrench.and.screwdriver" }
}

private struct CapabilityRecord: Identifiable {
    let id: String
    let name: String
    let kind: CapabilityKind
    let version: String
    let detail: String
}
