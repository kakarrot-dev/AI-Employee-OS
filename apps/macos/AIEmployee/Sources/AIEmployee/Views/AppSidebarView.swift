import SwiftUI

struct AppSidebarView: View {
    @Binding var selection: AppDestination
    @ObservedObject var store: TaskStore
    @Environment(\.colorScheme) private var colorScheme

    private var activeRun: TaskRun? {
        store.runs.first { $0.status == .running || $0.status == .pending }
    }

    private var presence: EmployeePresence {
        EmployeePresence.resolve(activeRun: activeRun, latestRun: store.runs.first)
    }

    var body: some View {
        VStack(spacing: 0) {
            companyHeader

            ScrollView {
                LazyVStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    navigationSection
                    employeeSection
                    recentSection
                }
                .padding(.horizontal, AppTheme.Spacing.xs)
                .padding(.bottom, AppTheme.Spacing.md)
            }
        }
        .background(palette.surfaceSoft)
        .navigationTitle("")
    }

    private var companyHeader: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            ZStack {
                RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                    .fill(palette.primary)
                Image(systemName: "building.2.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.onPrimary)
            }
            .frame(width: 26, height: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text("公司")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(palette.ink)
                Text("AI Employee OS")
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
            }

            Spacer(minLength: 0)

            Button { store.presentCommandPalette() } label: {
                Image(systemName: "magnifyingglass")
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .foregroundStyle(palette.muted)
            .help("搜索与命令")
        }
        .padding(.horizontal, AppTheme.Spacing.sm)
        .frame(height: 54)
    }

    private var navigationSection: some View {
        VStack(spacing: 2) {
            ForEach(AppDestination.allCases) { destination in
                sidebarButton(
                    title: destination.title,
                    systemImage: destination.systemImage,
                    selected: selection == destination && (destination != .work || store.selection == nil)
                ) {
                    if destination == .work { store.selection = nil }
                    selection = destination
                }
            }
        }
    }

    private var employeeSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            sectionLabel("产品部")

            Button {
                store.selection = nil
                selection = .work
            } label: {
                HStack(spacing: AppTheme.Spacing.xs) {
                    ZStack(alignment: .bottomTrailing) {
                        Circle()
                            .fill(palette.primary.opacity(0.14))
                            .frame(width: 28, height: 28)
                            .overlay {
                                Text("A")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(palette.primaryActive)
                            }
                        Circle()
                            .fill(presenceColor)
                            .frame(width: 7, height: 7)
                            .overlay { Circle().stroke(palette.surfaceSoft, lineWidth: 1.5) }
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        Text("Alex")
                            .font(.callout.weight(.medium))
                            .foregroundStyle(palette.ink)
                        Text(activeRun?.input ?? "AI 产品经理")
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, AppTheme.Spacing.xs)
                .frame(height: 42)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            HStack {
                sectionLabel("最近工作")
                Spacer()
                if !store.runs.isEmpty {
                    Text("\(store.runs.count)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(palette.mutedSoft)
                }
            }

            if store.runs.isEmpty {
                Text("还没有工作记录")
                    .font(.caption)
                    .foregroundStyle(palette.mutedSoft)
                    .padding(.horizontal, AppTheme.Spacing.xs)
                    .padding(.vertical, 6)
            } else {
                ForEach(store.runs.prefix(8)) { run in
                    Button {
                        store.selection = run.id
                        selection = .work
                    } label: {
                        HStack(spacing: 7) {
                            Circle()
                                .fill(statusColor(run.status))
                                .frame(width: 5, height: 5)
                            Text(run.input)
                                .font(.caption)
                                .foregroundStyle(palette.body)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, AppTheme.Spacing.xs)
                        .frame(height: 28)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(store.selection == run.id && selection == .work ? palette.primary.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: AppTheme.Radius.sm))
                    .help(run.input)
                }
            }
        }
    }

    private func sidebarButton(title: String, systemImage: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: systemImage)
                    .frame(width: 16)
                Text(title)
                    .font(.callout.weight(selected ? .medium : .regular))
                Spacer(minLength: 0)
            }
            .foregroundStyle(selected ? palette.ink : palette.body)
            .padding(.horizontal, AppTheme.Spacing.xs)
            .frame(height: 30)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(selected ? palette.primary.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.caption2.weight(.medium))
            .foregroundStyle(palette.mutedSoft)
            .padding(.horizontal, AppTheme.Spacing.xs)
    }

    private var presenceColor: Color {
        switch presence {
        case .available: palette.success
        case .working: palette.accentTeal
        case .attention: palette.warning
        case .failed: palette.error
        case .disabled: palette.muted
        }
    }

    private func statusColor(_ status: TaskRunStatus) -> Color {
        switch status {
        case .pending, .running: palette.accentTeal
        case .succeeded: palette.success
        case .failed: palette.error
        case .cancelled: palette.muted
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
