import SwiftUI

struct OfficeWorkspaceView: View {
    @ObservedObject var store: TaskStore
    @ObservedObject var employeeStore: EmployeeStore
    let openChat: () -> Void

    @State private var isComposing = false
    @State private var selectedEmployeeID = ""
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
            let compact = proxy.size.width < 600
            ScrollView {
                VStack(alignment: .leading, spacing: compact ? 28 : 40) {
                    pageHeader(compact: compact)
                    if let message = snapshot.runtimeMessage { runtimeBanner(message) }
                    if isComposing { composer(compact: compact) }
                    if snapshot.isLoading { loadingState }
                    else {
                        responsiveSections(width: proxy.size.width, compact: compact)
                        deliveriesSection(compact: compact)
                    }
                }
                .frame(maxWidth: 1120, alignment: .leading)
                .padding(.horizontal, compact ? 20 : 28)
                .padding(.top, compact ? 28 : 40)
                .padding(.bottom, 64)
                .frame(maxWidth: .infinity)
            }
        }
        .background(palette.canvas)
        .navigationTitle("办公室")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { withAnimation(.easeInOut(duration: AppTheme.Motion.standard)) { isComposing.toggle() } } label: {
                    Label("新建工作", systemImage: "plus")
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
        .onAppear { selectedEmployeeID = selectedEmployeeID.isEmpty ? (snapshot.employees.first?.id ?? "") : selectedEmployeeID }
    }

    private func pageHeader(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text("今天的办公室")
                    .font(.system(size: compact ? 26 : 32, weight: .semibold, design: .rounded))
                    .foregroundStyle(palette.ink)
                if snapshot.isDemo {
                    Label("演示数据", systemImage: "theatermasks")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(palette.warning)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(palette.primary.opacity(0.10), in: Capsule())
                }
            }
            Text(todaySummary)
                .font(.body)
                .foregroundStyle(palette.muted)
                .lineSpacing(3)
        }
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
        if width >= 860 {
            HStack(alignment: .top, spacing: 28) {
                currentWorkSection(compact: compact).frame(maxWidth: .infinity)
                employeesSection(compact: compact).frame(width: 300)
            }
        } else {
            VStack(alignment: .leading, spacing: 36) {
                currentWorkSection(compact: compact)
                employeesSection(compact: compact)
            }
        }
    }

    private func currentWorkSection(compact: Bool) -> some View {
        section(title: "当前工作", subtitle: snapshot.currentWork.isEmpty ? "没有需要持续关注的工作" : "实时状态来自任务与操作记录") {
            if snapshot.currentWork.isEmpty { emptyCurrentWork }
            else {
                VStack(spacing: 0) {
                    ForEach(Array(snapshot.currentWork.enumerated()), id: \.element.id) { index, item in
                        workRow(item, compact: compact)
                        if index < snapshot.currentWork.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
                .padding(.horizontal, compact ? 16 : 20)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
                .shadow(color: palette.shadow, radius: 16, y: 7)
            }
        }
    }

    private func workRow(_ item: OfficeSnapshot.WorkItem, compact: Bool) -> some View {
        Button {
            guard !snapshot.isDemo else { return }
            store.selection = item.id
            openChat()
        } label: {
            VStack(alignment: .leading, spacing: 13) {
                HStack {
                    Label(workStateTitle(item.state), systemImage: workStateIcon(item.state))
                        .font(.callout.weight(.semibold)).foregroundStyle(workStateColor(item.state))
                    Spacer()
                    Text(item.employeeName).font(.callout.weight(.medium)).foregroundStyle(palette.body)
                }
                Text(item.goal)
                    .font(.system(size: compact ? 17 : 19, weight: .medium))
                    .foregroundStyle(palette.ink).lineLimit(compact ? 3 : 2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 10) {
                    if let progress = item.progress {
                        ProgressView(value: progress).tint(workStateColor(item.state)).frame(maxWidth: compact ? 88 : 150)
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
        HStack(spacing: 14) {
            Image(systemName: "checkmark.circle").font(.title2).foregroundStyle(palette.success)
            VStack(alignment: .leading, spacing: 3) {
                Text("当前没有进行中的工作").font(.headline).foregroundStyle(palette.ink)
                Text("新建工作后，执行进度、审批和异常会集中显示在这里。")
                    .font(.callout).foregroundStyle(palette.muted)
            }
        }.padding(.vertical, 8)
    }

    private func employeesSection(compact: Bool) -> some View {
        section(title: "AI 员工", subtitle: "\(snapshot.employees.count) 位可用") {
            if snapshot.employees.isEmpty {
                Text("通讯录中还没有可工作的 AI 员工。")
                    .font(.callout).foregroundStyle(palette.muted).padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(snapshot.employees.enumerated()), id: \.element.id) { index, employee in
                        HStack(spacing: 12) {
                            employeeMark(employee.name)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(employee.name).font(.headline).foregroundStyle(palette.ink)
                                Text(employee.role).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                            }
                            Spacer()
                            Text(employee.status).font(.caption).foregroundStyle(employee.status == "工作中" ? palette.accentTeal : palette.muted)
                        }.padding(.vertical, 12)
                        if index < snapshot.employees.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
            }
        }
    }

    private func deliveriesSection(compact: Bool) -> some View {
        section(title: "最近交付", subtitle: "已产生并可回看的工作成果") {
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
                                Image(systemName: "doc.text").foregroundStyle(palette.primaryActive).frame(width: 20)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title).font(.callout.weight(.medium)).foregroundStyle(palette.ink).lineLimit(compact ? 2 : 1)
                                    Text("\(item.employeeName) · \(item.artifactName)").font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                                }
                                Spacer()
                                if !compact { Text(TaskPresentation.date(item.createdAt)).font(.caption).foregroundStyle(palette.mutedSoft) }
                                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(palette.mutedSoft)
                            }.padding(.vertical, 13).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if index < snapshot.deliveries.count - 1 { Divider().overlay(palette.hairlineSoft) }
                    }
                }
            }
        }
    }

    private func composer(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("新建工作").font(.headline).foregroundStyle(palette.ink)
                Spacer()
                Button { withAnimation { isComposing = false } } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
            }
            if compact {
                VStack(alignment: .leading, spacing: 12) { employeePicker; goalField }
            } else {
                HStack(alignment: .top, spacing: 14) { employeePicker.frame(width: 190); goalField }
            }
            HStack {
                if snapshot.isDemo { Text("演示模式不会提交真实任务").font(.caption).foregroundStyle(palette.warning) }
                Spacer()
                Button("取消") { isComposing = false }.buttonStyle(.plain)
                Button("继续") { submitWork() }
                    .buttonStyle(.borderedProminent)
                    .disabled(snapshot.isDemo || selectedEmployeeID.isEmpty || store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(compact ? 16 : 20)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairline) }
    }

    private var employeePicker: some View {
        Picker("交给", selection: $selectedEmployeeID) {
            ForEach(snapshot.employees) { Text("\($0.name) · \($0.role)").tag($0.id) }
        }.labelsHidden()
    }

    private var goalField: some View {
        TextField("描述目标、背景和希望得到的交付物…", text: $store.draft, axis: .vertical)
            .textFieldStyle(.plain).lineLimit(2...6).padding(10)
            .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: AppTheme.Radius.lg))
    }

    private func submitWork() {
        guard !snapshot.isDemo else { return }
        if employeeStore.employees.contains(where: { $0.id == selectedEmployeeID }) { employeeStore.selection = selectedEmployeeID }
        store.requestRun()
        isComposing = false
        openChat()
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
        Text(String(name.prefix(1)).uppercased()).font(.callout.weight(.semibold)).foregroundStyle(palette.primaryActive)
            .frame(width: 34, height: 34).background(palette.primary.opacity(0.11), in: RoundedRectangle(cornerRadius: 10))
    }

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
