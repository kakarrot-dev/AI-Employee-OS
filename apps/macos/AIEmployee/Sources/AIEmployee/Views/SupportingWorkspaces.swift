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

enum CapabilityLibraryScope {
    case skills, tools

    var title: String { self == .skills ? "技能库" : "工具库" }
    var subtitle: String { self == .skills ? "管理 AI 员工可使用的 Skills" : "管理 Tools、连接状态与权限范围" }
    var filter: CapabilityFilter { self == .skills ? .skills : .tools }
}

struct CapabilityLibraryWorkspaceView: View {
    let scope: CapabilityLibraryScope
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
                    Text(scope.title).font(.largeTitle.weight(.semibold)).foregroundStyle(palette.ink)
                    Text(scope.subtitle).foregroundStyle(palette.muted)
                }
                Spacer()
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)

            Divider().overlay(palette.hairlineSoft)

            if capabilities.isEmpty {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                    Image(systemName: scope.filter.systemImage)
                        .font(.system(size: 26, weight: .light))
                        .foregroundStyle(palette.primaryActive)
                        .frame(width: 52, height: 52)
                        .background(palette.primary.opacity(0.10), in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text(scope.filter.emptyTitle)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(palette.ink)
                        Text(scope.filter.emptyDetail)
                            .foregroundStyle(palette.muted)
                            .frame(maxWidth: 460, alignment: .leading)
                    }

                    Divider().overlay(palette.hairlineSoft)

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Label("安装后显示版本与可用状态", systemImage: "checkmark.circle")
                        Label("权限范围由 Runtime 统一校验", systemImage: "lock.shield")
                        Label("不会用任务记录冒充能力目录", systemImage: "checkmark.seal")
                    }
                    .font(.callout)
                    .foregroundStyle(palette.body)
                }
                .padding(AppTheme.Spacing.xl)
                .frame(maxWidth: 620, alignment: .leading)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous)
                        .stroke(palette.hairlineSoft, lineWidth: 1)
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
        .navigationTitle(scope.title)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

enum CapabilityFilter: String, CaseIterable, Identifiable {
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
