import Charts
import SwiftUI

struct OfficeWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var employeeStore: EmployeeStore
    let openChat: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    private var snapshot: OfficeSnapshot {
        if let scene = OfficeDemoScene.current { return scene.snapshot }
        return .live(
            employees: employeeStore.employees,
            runs: store.runs,
            isLoading: employeeStore.isLoading,
            runtimeMessage: employeeStore.error ?? store.historyError
        )
    }

    var body: some View {
        GeometryReader { proxy in
            let compact = proxy.size.width < 700
            ScrollView {
                VStack(alignment: .leading, spacing: compact ? 28 : 36) {
                    pageHeader(compact: compact)
                    if let message = snapshot.runtimeMessage { runtimeBanner(message) }
                    if snapshot.isLoading { loadingState }
                    else {
                        responsiveSections(width: proxy.size.width, compact: compact)
                        usageSection(compact: compact)
                        deliveriesSection(compact: compact)
                    }
                }
                .frame(maxWidth: 1180, alignment: .leading)
                .padding(.horizontal, compact ? 20 : 32)
                .padding(.top, compact ? 26 : 34)
                .padding(.bottom, 64)
                .frame(maxWidth: .infinity)
            }
        }
        .background(palette.canvas)
        .navigationTitle("办公室")
    }

    private func pageHeader(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: compact ? 22 : 26) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 10) {
                        Text("今天的办公室")
                            .font(.system(size: compact ? 27 : 34, weight: .semibold, design: .rounded))
                            .foregroundStyle(palette.ink)
                        if snapshot.isDemo {
                            Text("演示")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(palette.warning)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(palette.primary.opacity(0.10), in: Capsule())
                        }
                    }
                    Text(todaySummary)
                        .font(.body)
                        .foregroundStyle(palette.muted)
                        .lineSpacing(3)
                }
                Spacer(minLength: 12)
                if !compact {
                    Text(Self.dayFormatter.string(from: Date()))
                        .font(.callout)
                        .foregroundStyle(palette.mutedSoft)
                        .padding(.top, 7)
                }
            }
            officePulse(compact: compact)
        }
    }

    private func officePulse(compact: Bool) -> some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: compact ? 2 : 3)
        return LazyVGrid(columns: columns, spacing: 0) {
            pulseItem(value: "\(snapshot.currentWork.count)", label: "进行中的工作", color: snapshot.currentWork.isEmpty ? palette.mutedSoft : palette.accentTeal)
            pulseItem(value: "\(attentionCount)", label: "需要你处理", color: attentionCount == 0 ? palette.mutedSoft : palette.warning)
            pulseItem(value: "\(snapshot.deliveries.count)", label: "最近交付", color: palette.primaryActive)
        }
        .padding(.vertical, 16)
        .background(palette.surfaceSoft.opacity(0.72), in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.lg).stroke(palette.hairlineSoft) }
    }

    private func pulseItem(value: String, label: String, color: Color) -> some View {
        HStack(spacing: 11) {
            Circle().fill(color).frame(width: 7, height: 7)
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 19, weight: .semibold, design: .rounded)).foregroundStyle(palette.ink)
                Text(label).font(.caption).foregroundStyle(palette.muted)
            }
            Spacer(minLength: 4)
        }
        .padding(.horizontal, 18)
    }

    private var attentionCount: Int {
        snapshot.currentWork.filter { item in
            switch item.state { case .approval, .resultUnknown, .failed: true; case .pending, .running: false }
        }.count
    }

    private var todaySummary: String {
        if snapshot.employees.isEmpty { return "还没有 AI 员工。先在通讯录创建员工，再把工作交给他们。" }
        let active = snapshot.currentWork.count
        let names = snapshot.currentWork.prefix(2).map(\.employeeName).joined(separator: "、")
        if active == 0 { return "\(snapshot.employees.count) 位 AI 员工已就绪，今天还没有进行中的工作。" }
        return "\(names) 正在推进 \(active) 项工作，最近有 \(snapshot.deliveries.count) 份交付可查看。"
    }

    @ViewBuilder
    private func responsiveSections(width: CGFloat, compact: Bool) -> some View {
        if width >= 900 {
            HStack(alignment: .top, spacing: 36) {
                currentWorkSection(compact: compact).frame(maxWidth: .infinity)
                employeesSection(compact: compact).frame(width: 282)
            }
        } else {
            VStack(alignment: .leading, spacing: 36) {
                currentWorkSection(compact: compact)
                employeesSection(compact: compact)
            }
        }
    }

    private func currentWorkSection(compact: Bool) -> some View {
        section(title: "正在推进", subtitle: snapshot.currentWork.isEmpty ? "办公室目前很安静" : "进度、等待确认和异常会在这里汇总") {
            if snapshot.currentWork.isEmpty { emptyCurrentWork }
            else {
                VStack(spacing: 0) {
                    ForEach(Array(snapshot.currentWork.enumerated()), id: \.element.id) { index, item in
                        workRow(item, compact: compact)
                        if index < snapshot.currentWork.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
                .padding(.horizontal, compact ? 16 : 22)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
                .shadow(color: palette.shadow, radius: 12, y: 5)
            }
        }
    }

    private func workRow(_ item: OfficeSnapshot.WorkItem, compact: Bool) -> some View {
        Button {
            guard !snapshot.isDemo else { return }
            store.selection = item.id
            openChat()
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label(workStateTitle(item.state), systemImage: workStateIcon(item.state))
                        .font(.callout.weight(.semibold)).foregroundStyle(workStateColor(item.state))
                    Spacer()
                    HStack(spacing: 7) {
                        employeeMark(item.employeeName, size: 24)
                        Text(item.employeeName).font(.callout.weight(.medium)).foregroundStyle(palette.body)
                    }
                }
                Text(item.goal)
                    .font(.system(size: compact ? 17 : 19, weight: .medium))
                    .foregroundStyle(palette.ink).lineLimit(compact ? 3 : 2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 10) {
                    if let progress = item.progress {
                        ProgressView(value: progress).tint(workStateColor(item.state)).frame(maxWidth: compact ? 76 : 128)
                        Text("\(Int(progress * 100))%")
                            .font(.caption2.monospacedDigit()).foregroundStyle(palette.mutedSoft)
                    }
                    Text(item.detail).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(palette.mutedSoft)
                }
            }
            .padding(.vertical, compact ? 16 : 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(snapshot.isDemo ? "演示模式不会打开真实工作" : "打开工作")
    }

    private var emptyCurrentWork: some View {
        HStack(alignment: .top, spacing: 15) {
            Image(systemName: "checkmark.seal")
                .font(.system(size: 21)).foregroundStyle(palette.success)
                .frame(width: 38, height: 38)
                .background(palette.success.opacity(0.09), in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 5) {
                Text("所有工作都已告一段落").font(.headline).foregroundStyle(palette.ink)
                Text("创建新工作后，这里会显示执行进度、待确认事项和异常。")
                    .font(.callout).foregroundStyle(palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
    }

    private func employeesSection(compact: Bool) -> some View {
        section(title: "团队状态", subtitle: "\(snapshot.employees.count) 位员工已启用") {
            if snapshot.employees.isEmpty {
                Text("通讯录中还没有可工作的 AI 员工。")
                    .font(.callout).foregroundStyle(palette.muted).padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(snapshot.employees.enumerated()), id: \.element.id) { index, employee in
                        HStack(spacing: 11) {
                            employeeMark(employee.name)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(employee.name).font(.headline).foregroundStyle(palette.ink)
                                Text(employee.role).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                            }
                            Spacer()
                            HStack(spacing: 5) {
                                Circle().fill(employee.status == "工作中" ? palette.accentTeal : palette.success).frame(width: 6, height: 6)
                                Text(employee.status).font(.caption).foregroundStyle(employee.status == "工作中" ? palette.accentTeal : palette.muted)
                            }
                        }.padding(.vertical, 12)
                        if index < snapshot.employees.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
            }
        }
    }

    private func deliveriesSection(compact: Bool) -> some View {
        section(title: "最近交付", subtitle: "由 AI 员工完成并可继续回看的成果") {
            if snapshot.deliveries.isEmpty {
                Text("完成工作并生成交付物后，会出现在这里。")
                    .font(.callout).foregroundStyle(palette.muted).padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(snapshot.deliveries.enumerated()), id: \.element.id) { index, item in
                        Button {
                            guard !snapshot.isDemo else { return }
                            store.selection = item.id; openChat()
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: fileIcon(item.artifactName))
                                    .font(.callout).foregroundStyle(palette.primaryActive)
                                    .frame(width: 34, height: 34)
                                    .background(palette.primary.opacity(0.09), in: RoundedRectangle(cornerRadius: 9))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title).font(.callout.weight(.medium)).foregroundStyle(palette.ink).lineLimit(compact ? 2 : 1)
                                    Text("\(item.employeeName) · \(item.artifactName)").font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                                }
                                Spacer()
                                if !compact { Text(TaskPresentation.date(item.createdAt)).font(.caption).foregroundStyle(palette.mutedSoft) }
                                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(palette.mutedSoft)
                            }.padding(.vertical, 11).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if index < snapshot.deliveries.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
            }
        }
    }

    private func usageSection(compact: Bool) -> some View {
        section(title: "用量概览", subtitle: "最近 7 天的模型调用与 Token 消耗") {
            if let usage = snapshot.usage {
                VStack(alignment: .leading, spacing: 20) {
                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: compact ? 2 : 4),
                        alignment: .leading,
                        spacing: 18
                    ) {
                        usageMetric("总 Token", value: abbreviated(usage.totalTokens), note: "输入 + 输出")
                        usageMetric("输入", value: abbreviated(usage.inputTokens), note: "上下文与提示词")
                        usageMetric("输出", value: abbreviated(usage.outputTokens), note: "模型生成内容")
                        usageMetric("预估成本", value: currency(usage.estimatedCost), note: "\(usage.modelCalls) 次模型调用")
                    }

                    Divider().overlay(palette.hairlineSoft)

                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Token 趋势")
                                .font(.callout.weight(.semibold))
                                .foregroundStyle(palette.body)
                            Spacer()
                            HStack(spacing: 14) {
                                chartLegend("输入", color: palette.accentTeal)
                                chartLegend("输出", color: palette.primaryActive)
                            }
                        }
                        usageChart(usage.points)
                            .frame(height: compact ? 150 : 176)
                    }
                }
                .padding(compact ? 16 : 20)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
            } else {
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: "chart.xyaxis.line")
                        .font(.title3).foregroundStyle(palette.mutedSoft)
                        .frame(width: 38, height: 38)
                        .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: 11))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("用量数据尚未接入").font(.headline).foregroundStyle(palette.ink)
                        Text("Runtime 已记录 Token，但任务历史接口还没有提供聚合用量与模型价格快照。")
                            .font(.callout).foregroundStyle(palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(20)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
            }
        }
    }

    private func usageMetric(_ label: String, value: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(palette.muted)
            Text(value)
                .font(.system(size: 22, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(palette.ink)
            Text(note).font(.caption2).foregroundStyle(palette.mutedSoft).lineLimit(1)
        }
    }

    private func usageChart(_ points: [OfficeSnapshot.UsagePoint]) -> some View {
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
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        Text(label).font(.caption2).foregroundStyle(palette.mutedSoft)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                AxisGridLine().foregroundStyle(palette.hairlineSoft)
                AxisValueLabel {
                    if let amount = value.as(Int.self) {
                        Text(abbreviated(amount)).font(.caption2.monospacedDigit()).foregroundStyle(palette.mutedSoft)
                    }
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

    private func currency(_ value: Double) -> String {
        String(format: "$%.2f", value)
    }

    private func section<Content: View>(title: String, subtitle: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.title3.weight(.semibold)).foregroundStyle(palette.ink)
                Text(subtitle).font(.caption).foregroundStyle(palette.muted)
            }
            content()
        }
    }

    private func runtimeBanner(_ message: String) -> some View {
        Label(message, systemImage: "bolt.horizontal.circle")
            .font(.callout).foregroundStyle(palette.error).padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(palette.error.opacity(0.08), in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg))
    }

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 14) {
            RoundedRectangle(cornerRadius: 8).frame(height: 24).frame(maxWidth: 180)
            RoundedRectangle(cornerRadius: 16).frame(height: 170)
        }.foregroundStyle(palette.surfaceSoft).redacted(reason: .placeholder)
    }

    private func employeeMark(_ name: String) -> some View {
        employeeMark(name, size: 34)
    }

    private func employeeMark(_ name: String, size: CGFloat) -> some View {
        Text(String(name.prefix(1)).uppercased()).font(.callout.weight(.semibold)).foregroundStyle(palette.primaryActive)
            .frame(width: size, height: size).background(palette.primary.opacity(0.11), in: RoundedRectangle(cornerRadius: size * 0.29))
    }

    private func fileIcon(_ filename: String) -> String {
        let ext = URL(fileURLWithPath: filename).pathExtension.lowercased()
        switch ext {
        case "csv", "xlsx": return "tablecells"
        case "pdf": return "doc.richtext"
        default: return "doc.text"
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M 月 d 日  EEEE"
        return formatter
    }()

    private func workStateTitle(_ state: OfficeSnapshot.WorkItem.State) -> String {
        switch state { case .pending: "等待开始"; case .running: "进行中"; case .approval: "等待确认"; case .resultUnknown: "需要核验"; case .failed: "执行失败" }
    }
    private func workStateIcon(_ state: OfficeSnapshot.WorkItem.State) -> String {
        switch state { case .pending: "clock"; case .running: "waveform.path.ecg"; case .approval: "hand.raised"; case .resultUnknown: "questionmark.diamond"; case .failed: "exclamationmark.triangle" }
    }
    private func workStateColor(_ state: OfficeSnapshot.WorkItem.State) -> Color {
        switch state { case .pending: palette.muted; case .running: palette.accentTeal; case .approval: palette.warning; case .resultUnknown, .failed: palette.error }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

struct AlexMark: View {
    let size: CGFloat
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.30, style: .continuous)
            .fill(AppTheme.palette(for: colorScheme).primary.opacity(0.13))
            .frame(width: size, height: size)
            .overlay { Text("A").font(.system(size: size * 0.38, weight: .semibold)).foregroundStyle(AppTheme.palette(for: colorScheme).primaryActive) }
    }
}
