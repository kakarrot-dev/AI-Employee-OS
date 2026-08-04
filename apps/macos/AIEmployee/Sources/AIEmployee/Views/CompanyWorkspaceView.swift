import SwiftUI

struct CompanyWorkspaceView: View {
    @ObservedObject var store: TaskStore
    let openTasks: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    private var runningCount: Int { store.runs.filter { $0.status == .running }.count }
    private var completedCount: Int { store.runs.filter { $0.status == .succeeded }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("AI Company").font(.largeTitle.weight(.semibold))
                    Text("你的本地 AI 员工正在做什么，以及最近交付了什么。")
                        .foregroundStyle(palette.muted)
                }

                taskComposer
                employeeSection
                workSummary
                recentWork
            }
            .padding(AppTheme.Spacing.xl)
            .frame(maxWidth: 880, alignment: .leading)
        }
        .background(palette.canvas)
        .navigationTitle("公司")
    }

    private var employeeSection: some View {
        CreamSection(title: "Alex") {
            HStack(alignment: .center, spacing: AppTheme.Spacing.md) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 42))
                    .foregroundStyle(palette.primary)
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("Alex").font(.title3.weight(.semibold))
                    Text("AI 产品经理").foregroundStyle(palette.muted)
                    Label(runningCount > 0 ? "正在处理 \(runningCount) 个任务" : "可以接受新任务", systemImage: runningCount > 0 ? "progress.indicator" : "checkmark.circle")
                        .font(.callout)
                        .foregroundStyle(runningCount > 0 ? palette.accentTeal : palette.success)
                }
                Spacer()
            }
        }
    }

    private var taskComposer: some View {
        InlineTaskComposer(store: store)
    }

    private var workSummary: some View {
        HStack(spacing: AppTheme.Spacing.xl) {
            metric("执行中", value: runningCount, color: palette.accentTeal)
            metric("已完成", value: completedCount, color: palette.success)
            metric("全部任务", value: store.runs.count, color: palette.primary)
        }
    }

    private var recentWork: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack {
                Text("最近工作").font(.headline)
                Spacer()
                if !store.runs.isEmpty { Button("查看全部", action: openTasks).buttonStyle(.plain).foregroundStyle(palette.primary) }
            }
            if store.runs.isEmpty {
                Text("还没有任务。给 Alex 一个产品问题，系统会先说明写入范围并请求批准。")
                    .foregroundStyle(palette.muted)
                    .padding(.vertical, AppTheme.Spacing.md)
            } else {
                ForEach(store.runs.prefix(3)) { run in
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Image(systemName: run.status.systemImage).foregroundStyle(statusColor(run.status))
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                            Text(run.input).lineLimit(1)
                            Text(run.status.title).font(.caption).foregroundStyle(palette.muted)
                        }
                        Spacer()
                        Text(TaskPresentation.date(run.createdAt)).font(.caption).foregroundStyle(palette.mutedSoft)
                    }
                    .padding(.vertical, AppTheme.Spacing.xs)
                    Divider().overlay(palette.hairlineSoft)
                }
            }
        }
    }

    private func metric(_ title: String, value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            Text(value.formatted()).font(.title.weight(.semibold)).foregroundStyle(color).monospacedDigit()
            Text(title).font(.callout).foregroundStyle(palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }

    private func statusColor(_ status: TaskRunStatus) -> Color {
        switch status {
        case .succeeded: palette.success
        case .failed: palette.error
        case .running: palette.accentTeal
        case .pending, .cancelled: palette.muted
        }
    }
}
