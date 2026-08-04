import SwiftUI

struct TaskDetailView: View {
    let run: TaskRun
    let cancel: () -> Void

    @State private var diagnosticExpanded = false
    @State private var artifactError: String?
    @Environment(\.colorScheme) private var colorScheme

    private var nodes: [GraphNodeEvidence] { run.response?.graph.nodes ?? run.actions }
    private var artifactPath: String? { run.response?.artifactPath ?? run.artifactPath }
    private var evaluation: RuntimeResponse.Evaluation? { run.response?.evaluation ?? run.evaluation }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                statusSummary
                if !nodes.isEmpty { executionSection }
                exceptionalState
                if run.status == .succeeded || artifactPath != nil || evaluation != nil {
                    deliverySection
                }
                if let artifactPath { MarkdownPreviewView(path: artifactPath) }
                if let error = run.error { failureSection(error) }
                diagnostics
            }
            .padding(28)
            .frame(maxWidth: 820, alignment: .leading)
        }
        .background(AppTheme.palette(for: colorScheme).canvas)
        .navigationTitle("任务详情")
        .alert("无法访问产物", isPresented: Binding(
            get: { artifactError != nil },
            set: { if !$0 { artifactError = nil } }
        )) {
            Button("知道了", role: .cancel) { artifactError = nil }
        } message: {
            Text(artifactError ?? "未知错误")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(run.input)
                .font(.title2.weight(.semibold))
                .foregroundStyle(AppTheme.palette(for: colorScheme).ink)
                .textSelection(.enabled)
            HStack(spacing: 8) {
                Label("Alex", systemImage: "person.crop.circle")
                Text("·")
                Text(TaskPresentation.date(run.createdAt))
            }
            .font(.callout)
            .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
        }
    }

    private var statusSummary: some View {
        HStack(spacing: 12) {
            Image(systemName: run.status.systemImage)
                .font(.title3)
                .foregroundStyle(statusColor(run.status))
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(run.status.title).font(.headline)
                Text(statusDescription).font(.callout).foregroundStyle(AppTheme.palette(for: colorScheme).muted)
            }
            Spacer()
            if run.status == .running {
                Button(run.isCancellationRequested ? "正在取消…" : "取消任务", role: .destructive, action: cancel)
                    .disabled(run.isCancellationRequested)
            }
        }
        .padding(.vertical, 4)
    }

    private var executionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("执行进度").font(.headline)
            ActionTimelineView(nodes: nodes)
        }
    }

    @ViewBuilder
    private var exceptionalState: some View {
        if nodes.contains(where: { $0.status == "result_unknown" }) {
            Label("执行结果未知，需要人工核验实际副作用。系统不会自动重试。", systemImage: "person.crop.circle.badge.questionmark")
                .foregroundStyle(AppTheme.palette(for: colorScheme).error)
                .textSelection(.enabled)
        } else if nodes.contains(where: { $0.status == "blocked" }) {
            Label("任务正在等待授权或权限处理。", systemImage: "lock.circle")
                .foregroundStyle(AppTheme.palette(for: colorScheme).warning)
        }
    }

    private var deliverySection: some View {
        CreamSection(title: "交付结果") {
            HStack(alignment: .firstTextBaseline) {
                Spacer()
                if let evaluation {
                    Label(
                        evaluation.deliveryAllowed ? "质量检查通过" : "未达到交付门槛",
                        systemImage: evaluation.deliveryAllowed ? "checkmark.seal.fill" : "exclamationmark.triangle.fill"
                    )
                    .font(.callout.weight(.medium))
                    .foregroundStyle(evaluation.deliveryAllowed ? AppTheme.palette(for: colorScheme).success : AppTheme.palette(for: colorScheme).warning)
                }
            }
            if let evaluation {
                LabeledContent("PRD 质量分", value: evaluation.score.formatted(.number.precision(.fractionLength(2))))
            }
            if let response = run.response {
                LabeledContent("执行 Skill", value: "\(response.graph.skillID)@\(response.graph.skillVersion)")
            }
            if let artifactPath {
                Text(artifactPath)
                    .font(.caption.monospaced())
                    .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                    .textSelection(.enabled)
                    .lineLimit(2)
                HStack(spacing: 10) {
                    Button("打开文档") { performArtifactAction { try ArtifactService.open(artifactPath) } }
                        .buttonStyle(.borderedProminent)
                    Button("在 Finder 中显示") { performArtifactAction { try ArtifactService.reveal(artifactPath) } }
                }
            }
        }
    }

    private func failureSection(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("任务未能完成", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(AppTheme.palette(for: colorScheme).error)
            Text(error).textSelection(.enabled)
            Text("可先重新打开 App 恢复持久化状态。若仍失败，请保留任务 ID 并查看运行诊断。")
                .font(.callout)
                .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
        }
    }

    private var diagnostics: some View {
        DisclosureGroup("运行诊断", isExpanded: $diagnosticExpanded) {
            VStack(alignment: .leading, spacing: 12) {
                LabeledContent("Task ID", value: run.id)
                if run.events.isEmpty {
                    Text("暂无持久化事件。")
                        .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                } else {
                    ForEach(run.events) { event in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("#\(event.sequence)")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.tertiary)
                                .frame(width: 34, alignment: .trailing)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(TaskPresentation.eventTitle(event.type))
                                Text(event.type)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                            }
                            Spacer()
                            Text(TaskPresentation.date(event.occurredAt))
                                .font(.caption)
                                .foregroundStyle(AppTheme.palette(for: colorScheme).muted)
                        }
                    }
                }
            }
            .padding(.top, 10)
            .textSelection(.enabled)
        }
    }

    private var statusDescription: String {
        switch run.status {
        case .pending: "任务已经保存，等待 Runtime 开始处理。"
        case .running: run.isCancellationRequested ? "取消请求已提交，等待 Runtime 确认。" : "执行状态来自本地 Runtime。"
        case .succeeded: "PRD 已通过质量检查并保存到本地。"
        case .failed: "任务已停止，详情和恢复建议见下方。"
        case .cancelled: "Runtime 已确认取消，任务不会继续执行。"
        }
    }

    private func performArtifactAction(_ action: () throws -> Void) {
        do { try action() }
        catch { artifactError = error.localizedDescription }
    }

    private func statusColor(_ status: TaskRunStatus) -> Color {
        switch status {
        case .succeeded: AppTheme.palette(for: colorScheme).success
        case .failed: AppTheme.palette(for: colorScheme).error
        case .running: AppTheme.palette(for: colorScheme).accentTeal
        case .pending, .cancelled: AppTheme.palette(for: colorScheme).muted
        }
    }
}
