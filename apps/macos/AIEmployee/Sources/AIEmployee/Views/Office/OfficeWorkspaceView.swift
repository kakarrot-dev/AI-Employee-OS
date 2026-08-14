import Charts
import SwiftUI

struct OfficeWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var employeeStore: EmployeeStore
    let openWork: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var contentVisible = false
    @State private var dataAnimationProgress = 0.0

    private var snapshot: OfficeSnapshot {
        if let scene = OfficeDemoScene.current { return scene.snapshot }
        return .live(
            employees: employeeStore.employees,
            runs: store.runs,
            isLoading: employeeStore.isLoading,
            runtimeMessage: employeeStore.error ?? store.historyError,
            usage: store.usage
        )
    }

    var body: some View {
        AdaptivePage(profile: .office) { layout in
            let compact = layout.isCompact
            VStack(alignment: .leading, spacing: compact ? 28 : 36) {
                pageHeader(compact: compact)
                    .opacity(contentVisible ? 1 : 0)
                    .offset(y: contentVisible || reduceMotion ? 0 : 8)
                unifiedTaskEntry(compact: compact)
                if let message = snapshot.runtimeMessage { runtimeBanner(message) }
                if snapshot.isLoading { loadingState }
                else {
                    usageSection(compact: compact)
                        .opacity(contentVisible ? 1 : 0)
                        .offset(y: contentVisible || reduceMotion ? 0 : 10)
                }
            }
            .padding(.bottom, compact ? 24 : 36)
            .animation(reduceMotion ? nil : AppTheme.Motion.stateCrossfade, value: snapshotRevision)
        }
        .background(palette.canvas)
        .moduleNavigationTitle(.office)
        .onAppear {
            guard !contentVisible else { return }
            if reduceMotion {
                contentVisible = true
                dataAnimationProgress = 1
            } else {
                withAnimation(AppTheme.Motion.panelPresentation) {
                    contentVisible = true
                }
                replayDataAnimation()
            }
        }
        .onChange(of: snapshotRevision) {
            replayDataAnimation()
        }
        .onDisappear {
            contentVisible = false
            dataAnimationProgress = 0
        }
    }

    private func unifiedTaskEntry(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("交代一项工作")
                    .font(AppTheme.Typography.sectionTitle)
                    .foregroundStyle(palette.ink)
                Text("直接描述目标。系统会先提出单员工或多员工方案，确认后才执行。")
                    .font(AppTheme.Typography.metadata())
                    .foregroundStyle(palette.muted)
            }

            CreamComposer(
                "例如：调研同类产品，并整理成一份产品决策文档",
                text: $store.draft,
                accessibilityLabel: "描述工作目标",
                size: .expanded,
                isInputEnabled: !store.isSubmitting,
                actionState: store.isSubmitting ? .loading : .submit,
                isActionEnabled: canSubmitWork,
                actionHelp: store.isSubmitting ? "正在生成任务方案" : "提出任务方案",
                onAction: submitWork,
                leadingActions: { EmptyView() },
                status: { EmptyView() }
            )
        }
        .padding(compact ? 16 : 20)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
    }

    private var canSubmitWork: Bool {
        !store.isSubmitting && !store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submitWork() {
        guard canSubmitWork else { return }
        store.proposeWork()
        openWork()
    }

    private func pageHeader(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: compact ? 22 : 26) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 10) {
                        Text("办公室")
                            .font(AppTheme.Typography.pageTitle)
                            .foregroundStyle(palette.ink)
                        if snapshot.isDemo {
                            Text("演示")
                                .font(AppTheme.Typography.compactMetadata(weight: .semibold))
                                .foregroundStyle(palette.warning)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(palette.primary.opacity(0.10), in: Capsule())
                        }
                    }
                    Text("查看最近 7 天的模型调用、Token 消耗与预估成本。")
                        .font(AppTheme.Typography.interfaceBody())
                        .foregroundStyle(palette.muted)
                        .lineSpacing(3)
                }
                Spacer(minLength: 12)
                if !compact {
                    Text(Self.dayFormatter.string(from: Date()))
                        .font(AppTheme.Typography.metadata().monospacedDigit())
                        .foregroundStyle(palette.mutedSoft)
                        .padding(.top, 7)
                }
            }
        }
    }

    private func usageSection(compact: Bool) -> some View {
        let usage = snapshot.usage ?? .emptyPlaceholder
        let hasData = snapshot.usage != nil
        return section(title: "用量概览", subtitle: hasData ? "最近 7 天的模型调用与 Token 消耗" : "最近 7 天 · 暂无模型调用") {
            VStack(alignment: .leading, spacing: 20) {
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: compact ? 2 : 4),
                    alignment: .leading,
                    spacing: 18
                ) {
                    usageMetric("总 Token", value: Double(usage.totalTokens), note: "输入 + 输出") { abbreviated(Int($0.rounded())) }
                    usageMetric("输入", value: Double(usage.inputTokens), note: "上下文与提示词") { abbreviated(Int($0.rounded())) }
                    usageMetric("输出", value: Double(usage.outputTokens), note: "模型生成内容") { abbreviated(Int($0.rounded())) }
                    usageMetric("预估成本", value: usage.estimatedCostCNY, note: pricingNote(for: usage)) { currencyCNY($0) }
                }

                Divider().overlay(palette.hairlineSoft)

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Token 趋势")
                            .font(AppTheme.Typography.supporting(weight: .semibold))
                            .foregroundStyle(palette.body)
                        Spacer()
                        if hasData {
                            HStack(spacing: 14) {
                                chartLegend("输入", color: palette.accentTeal)
                                chartLegend("输出", color: palette.primaryActive)
                            }
                        } else {
                            Text("尚无调用记录").font(AppTheme.Typography.compactMetadata()).foregroundStyle(palette.mutedSoft)
                        }
                    }
                    Group {
                        if hasData {
                            usageLineChart(usage.points)
                        } else {
                            usageEmptyChart(usage.points)
                        }
                    }
                    .frame(height: compact ? 150 : 176)
                }
            }
            .padding(compact ? 16 : 20)
            .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
        }
    }

    private func usageMetric(
        _ label: String,
        value: Double,
        note: String,
        formatter: @escaping (Double) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(AppTheme.Typography.metadata()).foregroundStyle(palette.muted)
            CountingMetricText(value: value * dataAnimationProgress, formatter: formatter)
                .font(AppTheme.Typography.metric)
                .foregroundStyle(palette.ink)
            Text(note).font(AppTheme.Typography.compactMetadata()).foregroundStyle(palette.mutedSoft).lineLimit(1)
        }
    }

    private func usageLineChart(_ points: [OfficeSnapshot.UsagePoint]) -> some View {
        Chart(points) { point in
            LineMark(
                x: .value("日期", point.label),
                y: .value("输入 Token", point.inputTokens),
                series: .value("类型", "输入")
            )
            .foregroundStyle(palette.accentTeal)
            .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            .interpolationMethod(.catmullRom)

            LineMark(
                x: .value("日期", point.label),
                y: .value("输出 Token", point.outputTokens),
                series: .value("类型", "输出")
            )
            .foregroundStyle(palette.primaryActive)
            .lineStyle(StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
            .interpolationMethod(.catmullRom)
        }
        .chartLegend(.hidden)
        .chartXAxis { usageXAxis }
        .chartYAxis { usageYAxis }
        .chartPlotStyle { plotArea in
            plotArea.mask(alignment: .leading) {
                GeometryReader { proxy in
                    Rectangle()
                        .frame(width: proxy.size.width * dataAnimationProgress)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func usageEmptyChart(_ points: [OfficeSnapshot.UsagePoint]) -> some View {
        Chart(points) { point in
            BarMark(
                x: .value("日期", point.label),
                y: .value("Token", point.totalTokens)
            )
            .foregroundStyle(palette.hairlineSoft)
        }
        .chartYScale(domain: 0...100)
        .chartXAxis { usageXAxis }
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 50, 100]) { value in
                AxisGridLine().foregroundStyle(palette.hairlineSoft)
                AxisValueLabel {
                    if let amount = value.as(Int.self) {
                        Text(abbreviated(amount)).font(.caption2.monospacedDigit()).foregroundStyle(palette.mutedSoft)
                    }
                }
            }
        }
    }

    private var usageXAxis: some AxisContent {
        AxisMarks { value in
            AxisValueLabel {
                if let label = value.as(String.self) {
                    Text(label).font(.caption2).foregroundStyle(palette.mutedSoft)
                }
            }
        }
    }

    private var usageYAxis: some AxisContent {
        AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
            AxisGridLine().foregroundStyle(palette.hairlineSoft)
            AxisValueLabel {
                if let amount = value.as(Int.self) {
                    Text(abbreviated(amount)).font(.caption2.monospacedDigit()).foregroundStyle(palette.mutedSoft)
                }
            }
        }
    }

    private func chartLegend(_ title: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Capsule().fill(color).frame(width: 12, height: 3)
            Text(title).font(.caption2).foregroundStyle(palette.muted)
        }
    }

    private func abbreviated(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fK", Double(value) / 1_000) }
        return "\(value)"
    }

    private func currencyCNY(_ value: Double) -> String {
        if value > 0, value < 0.01 { return "<¥0.01" }
        return String(format: "¥%.2f", value)
    }

    private func pricingNote(for usage: OfficeSnapshot.UsageSummary) -> String {
        guard let model = usage.pricingModel, let version = usage.pricingVersion else { return "暂无定价口径" }
        let modelName = model
            .replacingOccurrences(of: "deepseek", with: "DeepSeek")
            .replacingOccurrences(of: "-", with: " ")
        let versionName = version.split(separator: "-").last.map(String.init) ?? version
        return "\(modelName) · 价格口径 \(versionName)"
    }

    private func replayDataAnimation() {
        guard !reduceMotion else {
            dataAnimationProgress = 1
            return
        }
        dataAnimationProgress = 0
        DispatchQueue.main.async {
            withAnimation(AppTheme.Motion.metricReveal) {
                dataAnimationProgress = 1
            }
        }
    }

    private func section<Content: View>(title: String, subtitle: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            CreamSectionHeader(title, subtitle: subtitle)
            content()
        }
    }

    private func runtimeBanner(_ message: String) -> some View {
        Label(message, systemImage: "bolt.horizontal.circle")
            .font(AppTheme.Typography.interfaceBody()).foregroundStyle(palette.error).padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(palette.error.opacity(0.08), in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg))
    }

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 14) {
            RoundedRectangle(cornerRadius: 8).frame(height: 24).frame(maxWidth: 180)
            RoundedRectangle(cornerRadius: 16).frame(height: 170)
        }.foregroundStyle(palette.surfaceSoft).redacted(reason: .placeholder)
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M 月 d 日  EEEE"
        return formatter
    }()

    private var snapshotRevision: String {
        let usage = snapshot.usage.map { "\($0.inputTokens):\($0.outputTokens):\($0.modelCalls)" } ?? "empty"
        return "\(usage)#\(snapshot.isLoading)#\(snapshot.runtimeMessage ?? "")"
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CountingMetricText: View, Animatable {
    var value: Double
    let formatter: (Double) -> String

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text(formatter(value))
    }
}
