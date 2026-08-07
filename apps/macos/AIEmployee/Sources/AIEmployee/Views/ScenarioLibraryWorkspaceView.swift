import SwiftUI

struct ScenarioLibraryWorkspaceView: View {
    @ObservedObject var store: ScenarioStore
    let employees: [Employee]
    @State private var query = ""
    @State private var editorSource = "manual"
    @State private var editorTab: ScenarioEditorTab = .sop
    @State private var showsDiscardConfirmation = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 0) {
            catalog
                .frame(minWidth: 270, idealWidth: 300, maxWidth: 340)
            Divider().overlay(palette.hairlineSoft)
            detail
        }
        .background(palette.canvas)
        .moduleNavigationTitle("场景库（暂定）", systemImage: "point.3.connected.trianglepath.dotted")
        .task { await store.reload() }
        .overlay {
            if showsDiscardConfirmation {
                CreamModalOverlay(
                    close: { showsDiscardConfirmation = false },
                    preferredWidth: 440,
                    preferredHeight: 250
                ) {
                    ScenarioDiscardConfirmation(
                        cancel: { showsDiscardConfirmation = false },
                        discard: discardDraft
                    )
                }
            }
        }
    }

    private var catalog: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("场景库（暂定）")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(palette.ink)
                    Text("\(store.scenarios.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(palette.muted)
                    Spacer()
                    Button(action: beginManual) {
                        Image(systemName: "plus")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(palette.body)
                    .help("新建场景")
                    .accessibilityLabel("新建场景")
                    .disabled(employees.filter { $0.status == "active" }.isEmpty)
                }
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.mutedSoft)
                    TextField("搜索场景", text: $query).textFieldStyle(.plain)
                }
                .padding(.horizontal, 10).frame(height: 34)
                .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
                .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.md).stroke(palette.hairlineSoft) }
            }
            .padding(16)
            Divider().overlay(palette.hairlineSoft)
            if store.isLoading && store.scenarios.isEmpty {
                ProgressView("正在读取场景…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filtered.isEmpty {
                VStack(spacing: 5) {
                    Text(store.scenarios.isEmpty ? "暂无场景" : "没有匹配的场景")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(palette.muted)
                    Text(store.scenarios.isEmpty ? "使用右上角 + 新建" : "尝试其他关键词")
                        .font(.caption)
                        .foregroundStyle(palette.mutedSoft)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .padding(.top, 28)
            } else {
                List(filtered, selection: $store.selectedID) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title).font(.callout.weight(.semibold))
                        Text("v\(item.currentVersion) · \(item.status)")
                            .font(.caption).foregroundStyle(palette.muted)
                    }
                    .tag(item.id)
                }
                .listStyle(.sidebar)
            }
        }
        .background(palette.surfaceSoft)
    }

    private var detail: some View {
        Group {
            if let draft = store.draft {
                ScenarioEditorPage(
                    store: store,
                    draft: Binding(
                        get: { store.draft ?? draft },
                        set: { value in
                            guard store.draft != nil else { return }
                            store.draft = value
                        }
                    ),
                    employees: employees,
                    source: $editorSource,
                    selectedTab: $editorTab,
                    close: { showsDiscardConfirmation = true }
                )
            } else {
                scenarioOverview
            }
        }
    }

    private var scenarioOverview: some View {
        Group {
            if let flow = store.activeFlow {
                VStack(alignment: .leading, spacing: 22) {
                    overviewHeader
                    FlowTimelineView(flow: flow)
                    Spacer()
                }
                .padding(28)
            } else if let selected = store.scenarios.first(where: { $0.id == store.selectedID }) {
                VStack(alignment: .leading, spacing: 22) {
                    overviewHeader
                    VStack(alignment: .leading, spacing: 8) {
                        Text(selected.title).font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                        Text("当前版本 v\(selected.currentVersion) · \(selected.status)").foregroundStyle(palette.muted)
                        Text("场景定义保存在这里；启动后的运行实例会进入工作库。")
                            .font(.callout).foregroundStyle(palette.muted)
                        Button("启动当前版本") { Task { await store.startSelected() } }
                            .buttonStyle(CreamPrimaryButtonStyle())
                            .disabled(store.isLoading)
                    }
                    Spacer()
                }
                .padding(28)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "point.3.connected.trianglepath.dotted")
                        .font(.system(size: 34, weight: .light))
                        .foregroundStyle(palette.primaryActive)
                    Text("创建第一个场景")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(palette.ink)
                    Text("从 Markdown SOP 开始，写清业务输入、执行步骤、约束与验收，再由 AI 提议或手工配置员工节点。")
                        .font(.callout)
                        .foregroundStyle(palette.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 460)
                    Button("新建场景") { beginManual() }
                        .buttonStyle(CreamPrimaryButtonStyle())
                        .disabled(employees.filter { $0.status == "active" }.isEmpty)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(32)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.callout).foregroundStyle(palette.error)
                    .padding(20)
            }
        }
    }

    private var overviewHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("组织一条可验证的员工协作流程")
                .font(.title.weight(.semibold)).foregroundStyle(palette.ink)
            Text("AI 只负责生成草案；员工分配、预算、验收和启动均由你确认。")
                .foregroundStyle(palette.muted)
        }
    }

    private var filtered: [ScenarioSummary] {
        guard !query.isEmpty else { return store.scenarios }
        return store.scenarios.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }

    private func beginManual() {
        guard let employee = employees.first(where: { $0.status == "active" }) else { return }
        store.selectedID = nil
        store.draft = ScenarioProposal(
            proposalID: "proposal_\(UUID().uuidString.lowercased().prefix(10))",
            title: "未命名场景",
            objective: "# 业务 SOP\n\n## 背景与目标\n\n说明为什么要执行这项业务，以及最终要达成什么结果。\n\n## 输入\n\n- 列出启动流程前必须具备的资料或条件。\n\n## 执行步骤\n\n1. 描述第一阶段工作。\n2. 描述后续处理与交接。\n3. 汇总并验证最终交付。\n\n## 约束\n\n- 仅使用已授权的数据与工具。\n- 不满足条件时停止并请求用户确认。\n\n## 验收标准\n\n- 最终交付物可追溯到全部上游证据。",
            overallAcceptanceCriteria: ["最终交付物引用全部上游 verified Deliverable"],
            coordinatorAgentID: employee.id,
            nodes: [],
            edges: []
        )
        editorSource = "manual"
        editorTab = .sop
    }

    private func discardDraft() {
        showsDiscardConfirmation = false
        store.draft = nil
        editorTab = .sop
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum ScenarioEditorTab: String, CaseIterable, Identifiable {
    case sop = "业务 SOP"
    case nodes = "节点配置"
    case review = "校验与启动"
    var id: String { rawValue }
}

private enum ScenarioFailurePolicy: String, CaseIterable, Identifiable {
    case stop
    case askUser = "ask_user"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .stop: "停止流程"
        case .askUser: "询问用户"
        }
    }
}

private struct ScenarioEditorPage: View {
    @ObservedObject var store: ScenarioStore
    @Binding var draft: ScenarioProposal
    let employees: [Employee]
    @Binding var source: String
    @Binding var selectedTab: ScenarioEditorTab
    let close: () -> Void
    @State private var showsSOPPreview = false
    @State private var isExitHovered = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("配置场景")
                        .font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                    Text("先定义业务 SOP，再配置员工节点，最后校验并启动。")
                        .font(.callout).foregroundStyle(palette.muted)
                }
                Spacer()
                Button {
                    close()
                } label: {
                    Label("返回场景库", systemImage: "chevron.left")
                }
                .buttonStyle(CreamSecondaryButtonStyle())
                .foregroundStyle(isExitHovered ? palette.warning : palette.body)
                .background(
                    isExitHovered ? palette.warning.opacity(0.10) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
                .onHover { isExitHovered = $0 }
                .help("返回场景库，未保存修改需要确认")
            }
            .padding(.horizontal, 24).padding(.vertical, 16)
            Divider().overlay(palette.hairlineSoft)
            CreamTabBar(items: ScenarioEditorTab.allCases, selection: $selectedTab, title: \.rawValue)
                .frame(maxWidth: 620)
                .padding(.horizontal, 24)
                .padding(.top, 14)
            switch selectedTab {
            case .sop:
                sopPage($draft)
            case .nodes:
                nodesPage($draft)
            case .review:
                reviewPage($draft)
            }
        }
        .background(palette.canvas)
    }

    private func sopPage(_ binding: Binding<ScenarioProposal>) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                TextField("场景名称", text: binding.title)
                    .font(.title3.weight(.semibold)).textFieldStyle(.plain)
                Spacer()
                Toggle("预览", isOn: $showsSOPPreview).toggleStyle(.switch)
                Button("让 AI 根据 SOP 组织节点") { proposeFromSOP() }
                    .buttonStyle(CreamSecondaryButtonStyle())
                    .disabled(binding.objective.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isLoading)
            }
            .padding(.horizontal, 24).padding(.vertical, 14)
            Divider().overlay(palette.hairlineSoft)
            if showsSOPPreview {
                ScrollView {
                    MarkdownDocumentView(source: binding.objective.wrappedValue)
                        .frame(maxWidth: 760, alignment: .leading).padding(28)
                }
            } else {
                TextEditor(text: binding.objective)
                    .font(.system(.body, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .padding(22)
                    .accessibilityLabel("业务 SOP Markdown")
            }
            HStack {
                Text("Markdown SOP 是场景的业务事实源，将作为 AI 组织节点和 Runtime 执行目标。")
                    .font(.caption).foregroundStyle(palette.muted)
                Spacer()
                Button("下一步：配置节点") { selectedTab = .nodes }.buttonStyle(CreamPrimaryButtonStyle())
            }
            .padding(.horizontal, 24).padding(.vertical, 12)
            .background(palette.surfaceSoft)
        }
    }

    private func nodesPage(_ binding: Binding<ScenarioProposal>) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("节点配置").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                        Text("按执行顺序配置节点目标、执行员工、依赖关系和运行策略。")
                            .font(.callout).foregroundStyle(palette.muted)
                    }
                    Spacer()
                    if !binding.nodes.wrappedValue.isEmpty {
                        Button("让 AI 根据 SOP 重新组织") { proposeFromSOP() }
                            .buttonStyle(CreamSecondaryButtonStyle())
                            .disabled(store.isLoading)
                    }
                }

                if store.isProposing {
                    proposalLoadingView
                } else if binding.nodes.wrappedValue.isEmpty {
                    VStack(spacing: 14) {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                            .font(.system(size: 30, weight: .light))
                            .foregroundStyle(palette.primaryActive)
                        Text("尚未配置节点")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(palette.ink)
                        Text("可以让 AI 根据当前 SOP 生成节点草案，也可以从一个执行节点开始人工配置。")
                            .font(.callout)
                            .foregroundStyle(palette.muted)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: 440)
                        HStack(spacing: 8) {
                            Button("让 AI 根据 SOP 组织节点") { proposeFromSOP() }
                                .buttonStyle(CreamPrimaryButtonStyle())
                            Button("新增执行节点") { addNode() }
                                .buttonStyle(CreamSecondaryButtonStyle())
                        }
                        if let error = store.errorMessage {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.callout)
                                .foregroundStyle(palette.error)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 520)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 280)
                    .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
                    .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(binding.nodes.enumerated()), id: \.element.wrappedValue.nodeID) { index, $node in
                            nodeEditor($node, proposal: binding)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 18)
                            if index < binding.nodes.count - 1 {
                                Divider().overlay(palette.hairlineSoft).padding(.leading, 120)
                            }
                        }
                    }
                    .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
                    .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }

                    Button {
                        addNode()
                    } label: {
                        Label("新增执行节点", systemImage: "plus")
                    }
                    .buttonStyle(CreamSecondaryButtonStyle())
                    .disabled(binding.nodes.count >= 12)
                }
            }
            .padding(28).frame(maxWidth: 820, alignment: .leading).frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button("返回 SOP") { selectedTab = .sop }.buttonStyle(CreamSecondaryButtonStyle())
                Spacer()
                Button("下一步：校验与启动") { selectedTab = .review }
                    .buttonStyle(CreamPrimaryButtonStyle())
                    .disabled(!hasRunnableNodes(binding.wrappedValue))
            }
            .padding(.horizontal, 24).padding(.vertical, 12).background(palette.surfaceSoft)
        }
    }

    private var proposalLoadingView: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.regular)
            Text("AI 正在根据 SOP 组织节点…")
                .font(.title3.weight(.semibold))
                .foregroundStyle(palette.ink)
            Text("生成完成后会在这里展示节点草案。")
                .font(.callout)
                .foregroundStyle(palette.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 280)
        .background(palette.surfaceCard, in: RoundedRectangle(cornerRadius: AppTheme.Radius.xl))
        .overlay { RoundedRectangle(cornerRadius: AppTheme.Radius.xl).stroke(palette.hairlineSoft) }
    }

    private func nodeEditor(
        _ node: Binding<ScenarioNode>,
        proposal: Binding<ScenarioProposal>
    ) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(node.wrappedValue.nodeID)
                    .font(.caption.monospaced()).foregroundStyle(palette.muted)
                Text(node.wrappedValue.role == "finalization" ? "最终汇总" : "执行节点")
                    .font(.caption.weight(.semibold)).foregroundStyle(palette.primaryActive)
                    .padding(.horizontal, 8).frame(height: 24)
                    .background(palette.primary.opacity(0.10), in: Capsule())
                Spacer()
                if node.wrappedValue.role != "finalization" {
                    Button {
                        removeNode(node.wrappedValue.nodeID)
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(palette.error)
                            .frame(width: 26, height: 26)
                            .background(palette.error.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
                    }
                    .buttonStyle(.plain).help("删除节点")
                    .accessibilityLabel("删除执行节点")
                }
            }
            .frame(minHeight: 36)

            nodeDivider
            nodeFormRow("节点目标") {
                TextField("描述该节点需要完成的工作", text: node.goal, axis: .vertical)
                    .textFieldStyle(.plain).foregroundStyle(palette.body)
            }
            nodeDivider
            nodeFormRow("执行员工") {
                Menu {
                    ForEach(activeEmployees) { employee in
                        Button(employee.name) { node.wrappedValue.suggestedAgentID = employee.id }
                    }
                } label: {
                    CreamMenuLabel(title: employeeName(for: node.wrappedValue.suggestedAgentID), icon: "person")
                }
                .menuStyle(.borderlessButton)
            }
            nodeDivider
            nodeFormRow("依赖节点") {
                Menu {
                    Button {
                        proposal.wrappedValue.edges.removeAll { $0.successorNodeID == node.wrappedValue.nodeID }
                    } label: {
                        Label("无依赖", systemImage: dependencies(for: node.wrappedValue.nodeID, in: proposal.wrappedValue).isEmpty ? "checkmark" : "circle")
                    }
                    Divider()
                    ForEach(proposal.wrappedValue.nodes.filter { $0.nodeID != node.wrappedValue.nodeID }) { candidate in
                        Button {
                            toggleDependency(candidate.nodeID, for: node.wrappedValue.nodeID, in: proposal)
                        } label: {
                            Label(
                                candidate.goal.isEmpty ? candidate.nodeID : candidate.goal,
                                systemImage: dependencies(for: node.wrappedValue.nodeID, in: proposal.wrappedValue).contains(candidate.nodeID) ? "checkmark" : "circle"
                            )
                        }
                    }
                } label: {
                    CreamMenuLabel(
                        title: dependencyTitle(for: node.wrappedValue.nodeID, in: proposal.wrappedValue),
                        icon: "arrow.triangle.branch"
                    )
                }
                .menuStyle(.borderlessButton)
            }
            nodeDivider
            nodeFormRow("失败处理") {
                CreamSegmentedControl(
                    options: ScenarioFailurePolicy.allCases,
                    selection: failurePolicy(node),
                    title: \.title
                )
                .frame(maxWidth: 320)
            }
            nodeDivider
            nodeFormRow("运行预算", alignment: .top) {
                Grid(alignment: .leading, horizontalSpacing: 22, verticalSpacing: 12) {
                    GridRow {
                        budgetField("输入 Token", value: node.budget.maxInputTokens)
                        budgetField("输出 Token", value: node.budget.maxOutputTokens)
                    }
                    GridRow {
                        budgetField("Tool 轮次", value: node.budget.maxToolRounds)
                        budgetField("最长毫秒", value: node.budget.maxElapsedMS)
                    }
                }
            }
        }
    }

    private func nodeFormRow<Content: View>(
        _ title: String,
        alignment: VerticalAlignment = .center,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(alignment: alignment, spacing: 18) {
            Text(title).font(.callout).foregroundStyle(palette.muted)
                .frame(width: 86, alignment: .leading)
            content().frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 7).frame(minHeight: 48)
    }

    private func budgetField(_ title: String, value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption).foregroundStyle(palette.muted)
            TextField(title, value: value, format: .number)
                .textFieldStyle(.plain).foregroundStyle(palette.body)
                .padding(.horizontal, 10).frame(height: 32)
                .background(palette.surfaceSoft, in: RoundedRectangle(cornerRadius: 8))
                .overlay { RoundedRectangle(cornerRadius: 8).stroke(palette.hairlineSoft) }
        }
        .frame(minWidth: 150)
    }

    private var nodeDivider: some View {
        Divider().overlay(palette.hairlineSoft).padding(.leading, 104)
    }

    private var activeEmployees: [Employee] { employees.filter { $0.status == "active" } }

    private func employeeName(for id: String) -> String {
        activeEmployees.first(where: { $0.id == id })?.name ?? "选择员工"
    }

    private func failurePolicy(_ node: Binding<ScenarioNode>) -> Binding<ScenarioFailurePolicy> {
        Binding(
            get: { ScenarioFailurePolicy(rawValue: node.wrappedValue.failurePolicy) ?? .stop },
            set: { node.wrappedValue.failurePolicy = $0.rawValue }
        )
    }

    private func dependencies(for nodeID: String, in proposal: ScenarioProposal) -> [String] {
        proposal.edges
            .filter { $0.successorNodeID == nodeID && $0.required }
            .map(\.predecessorNodeID)
    }

    private func dependencyTitle(for nodeID: String, in proposal: ScenarioProposal) -> String {
        let dependencyIDs = dependencies(for: nodeID, in: proposal)
        guard !dependencyIDs.isEmpty else { return "无依赖" }
        let labels = dependencyIDs.compactMap { id in
            proposal.nodes.first(where: { $0.nodeID == id }).map { $0.goal.isEmpty ? $0.nodeID : $0.goal }
        }
        return labels.count == 1 ? labels[0] : "已选择 \(labels.count) 个节点"
    }

    private func toggleDependency(
        _ predecessorID: String,
        for successorID: String,
        in proposal: Binding<ScenarioProposal>
    ) {
        if let index = proposal.wrappedValue.edges.firstIndex(where: {
            $0.predecessorNodeID == predecessorID && $0.successorNodeID == successorID
        }) {
            proposal.wrappedValue.edges.remove(at: index)
        } else {
            proposal.wrappedValue.edges.append(
                ScenarioEdge(predecessorNodeID: predecessorID, successorNodeID: successorID, required: true)
            )
        }
    }

    private func reviewPage(_ binding: Binding<ScenarioProposal>) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("准备保存").font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Label("SOP 已填写 \(binding.objective.wrappedValue.count) 个字符", systemImage: "doc.text")
                Label("已配置 \(binding.nodes.wrappedValue.count) 个节点", systemImage: "point.3.connected.trianglepath.dotted")
                Label("保存时由 Rust 校验员工、Capability、预算、DAG 与 Finalization", systemImage: "checkmark.shield")
                if source == "ai_proposal" {
                    Text("当前节点由 AI 根据 SOP 提议，保存前仍以本页配置为准。")
                        .font(.callout).foregroundStyle(palette.muted)
                }
                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(palette.error)
                }
                HStack {
                    Button("返回修改节点") { selectedTab = .nodes }.buttonStyle(CreamSecondaryButtonStyle())
                    Spacer()
                    if store.isLoading { ProgressView().controlSize(.small) }
                    Button("确认并保存场景") {
                        Task { if await store.save(source: source) { close() } }
                    }
                    .buttonStyle(CreamPrimaryButtonStyle())
                    .disabled(store.isLoading || binding.title.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || binding.objective.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !hasRunnableNodes(binding.wrappedValue))
                }
            }
            .padding(28).frame(maxWidth: 760, alignment: .leading)
        }
    }

    private func proposeFromSOP() {
        guard let key = KeychainService.load(), let draft = store.draft else {
            store.errorMessage = "请先在设置中配置 DeepSeek API Key。"
            return
        }
        let title = draft.title
        let sop = draft.objective
        selectedTab = .nodes
        Task {
            if await store.propose(objective: sop, key: key) {
                store.draft?.title = title
                store.draft?.objective = sop
                source = "ai_proposal"
            }
        }
    }

    private func addNode() {
        guard var draft = store.draft,
              let employee = activeEmployees.first,
              draft.nodes.count < 12 else { return }
        let executor = makeNode(role: "executor", goal: "配置该节点目标", employeeID: employee.id)
        if let finalIndex = draft.nodes.firstIndex(where: { $0.role == "finalization" }) {
            draft.nodes.insert(executor, at: finalIndex)
        } else {
            draft.nodes.append(executor)
            draft.nodes.append(
                makeNode(role: "finalization", goal: "汇总并验证最终交付", employeeID: employee.id)
            )
        }
        store.draft = draft
    }

    private func removeNode(_ id: String) {
        guard var draft = store.draft else { return }
        draft.nodes.removeAll { $0.nodeID == id && $0.role != "finalization" }
        draft.edges.removeAll { $0.predecessorNodeID == id || $0.successorNodeID == id }
        if !draft.nodes.contains(where: { $0.role == "executor" }) {
            draft.nodes.removeAll { $0.role == "finalization" }
            draft.edges.removeAll()
        }
        store.draft = draft
    }

    private func makeNode(role: String, goal: String, employeeID: String) -> ScenarioNode {
        ScenarioNode(
            nodeID: role == "finalization"
                ? "finalize-\(UUID().uuidString.lowercased().prefix(8))"
                : "step-\(UUID().uuidString.lowercased().prefix(8))",
            role: role,
            goal: goal,
            suggestedAgentID: employeeID,
            requiredCapabilities: ["local-file-operations"],
            inputRefs: [],
            acceptanceCriteria: [
                AcceptanceCriterion(
                    criterionID: "\(role)-evaluation",
                    description: "产生通过 Runtime Evaluation 的 Deliverable",
                    evidenceType: "evaluation",
                    required: true
                )
            ],
            budget: ScenarioBudget(),
            failurePolicy: "stop"
        )
    }

    private func hasRunnableNodes(_ proposal: ScenarioProposal) -> Bool {
        proposal.nodes.contains(where: { $0.role == "executor" })
            && proposal.nodes.filter { $0.role == "finalization" }.count == 1
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ScenarioDiscardConfirmation: View {
    let cancel: () -> Void
    let discard: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Label("放弃未保存的场景修改？", systemImage: "exclamationmark.triangle")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(palette.ink)
                Text("当前 SOP、节点配置和预算尚未保存。返回后这些修改将丢失。")
                    .font(.callout)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(24)
            Spacer(minLength: 12)
            Divider().overlay(palette.hairlineSoft)
            HStack(spacing: 8) {
                Spacer()
                Button("继续配置", action: cancel)
                    .buttonStyle(CreamSecondaryButtonStyle())
                Button("放弃修改并返回", action: discard)
                    .buttonStyle(CreamPrimaryButtonStyle())
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(palette.surfaceSoft)
        }
        .background(palette.canvas)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct FlowTimelineView: View {
    let flow: BusinessFlowProjection
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(flow.title).font(.title2.weight(.semibold)).foregroundStyle(palette.ink)
                Spacer()
                Text(flow.status).font(.caption.weight(.semibold)).foregroundStyle(palette.primaryActive)
            }
            ForEach(Array(flow.workOrders.enumerated()), id: \.element.id) { index, work in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Circle().fill(work.status == "succeeded" ? palette.success : palette.primaryActive).frame(width: 9, height: 9)
                        if index < flow.workOrders.count - 1 { Rectangle().fill(palette.hairline).frame(width: 1, height: 38) }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(work.goal).font(.callout.weight(.semibold)).foregroundStyle(palette.ink)
                        Text("\(work.assigneeAgentID) · \(work.status)").font(.caption).foregroundStyle(palette.muted)
                    }
                }
            }
        }
        .frame(maxWidth: 720, alignment: .leading)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
