import SwiftUI

struct CompanyWorkspaceView: View {
    @ObservedObject var store: TaskStore
    let openTasks: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    private var activeRun: TaskRun? { store.runs.first { $0.status == .running || $0.status == .pending } }
    private var latestArtifact: TaskRun? { store.runs.first { ($0.response?.artifactPath ?? $0.artifactPath) != nil } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                officeHeader
                currentWork
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    Text("委派工作")
                        .font(.headline)
                        .foregroundStyle(palette.ink)
                    taskComposer
                }
                latestDelivery
                recentWork
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, AppTheme.Spacing.lg)
            .frame(maxWidth: 860, alignment: .leading)
        }
        .background(palette.canvas)
        .navigationTitle("公司")
    }

    private var officeHeader: some View {
        HStack(alignment: .center, spacing: AppTheme.Spacing.md) {
            ZStack {
                Circle().fill(palette.primary.opacity(0.14)).frame(width: 44, height: 44)
                Text("A").font(.title3.weight(.semibold)).foregroundStyle(palette.primary)
            }
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text("Alex").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Text("AI 产品经理 · 本地运行").font(.callout).foregroundStyle(palette.muted)
            }
            Spacer()
            Label(
                activeRun == nil ? "可以接受新任务" : "正在工作",
                systemImage: activeRun == nil ? "checkmark.circle.fill" : "clock.arrow.circlepath"
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(activeRun == nil ? palette.success : palette.accentTeal)
        }
    }

    private var taskComposer: some View {
        InlineTaskComposer(store: store)
    }

    @ViewBuilder
    private var currentWork: some View {
        if let run = activeRun {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                HStack {
                    Text("当前工作").font(.headline)
                    Spacer()
                    Button("查看任务") {
                        store.selection = run.id
                        openTasks()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(palette.primary)
                }
                Text(run.input)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(palette.ink)
                    .textSelection(.enabled)
                HStack(spacing: AppTheme.Spacing.xs) {
                    ProgressView().controlSize(.small).tint(palette.accentTeal)
                    Text(run.isCancellationRequested ? "正在等待 Runtime 确认取消" : "Alex 正在执行")
                }
                .font(.callout)
                .foregroundStyle(palette.muted)
                if !run.actions.isEmpty { ActionTimelineView(nodes: run.actions) }
            }
            .padding(AppTheme.Spacing.lg)
            .background(palette.surfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text("今天想让 Alex 推进什么？")
                    .font(.title.weight(.semibold))
                    .foregroundStyle(palette.ink)
                Text("给出目标、证据和期望产物。Alex 会先确认写入范围，再开始执行。")
                    .foregroundStyle(palette.muted)
            }
        }
    }

    @ViewBuilder
    private var latestDelivery: some View {
        if let run = latestArtifact {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text("最新交付").font(.headline)
                HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
                    Image(systemName: "doc.text.fill").font(.title2).foregroundStyle(palette.primary)
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(run.input).font(.body.weight(.medium)).lineLimit(2)
                        Text("PRD 已保存到本地").font(.callout).foregroundStyle(palette.muted)
                    }
                    Spacer()
                    Button("查看成果") {
                        store.selection = run.id
                        openTasks()
                    }
                }
            }
            .padding(.vertical, AppTheme.Spacing.sm)
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
