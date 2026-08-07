#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


destination = source("apps/macos/AIEmployee/Sources/AIEmployee/Models/AppDestination.swift")
content = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift")
view = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/ScenarioLibraryWorkspaceView.swift")
service = source("apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift")
store = source("apps/macos/AIEmployee/Sources/AIEmployee/Stores/ScenarioStore.swift")
chat = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift")

assert "[.office, .contacts, .work, .scenes, .knowledge, .skills, .tools]" in destination
assert 'case .scenes: "场景库（暂定）"' in destination
assert "ScenarioLibraryWorkspaceView" in content
assert 'source = "ai_proposal"' in view and 'editorSource = "manual"' in view
assert "ScenarioEditorSheet" not in view and "ScenarioEditorPage" in view
assert 'case sop = "业务 SOP"' in view and 'case nodes = "节点配置"' in view and 'case review = "校验与启动"' in view
assert "TextEditor(text: binding.objective)" in view and "MarkdownDocumentView(source: binding.objective.wrappedValue)" in view
assert "让 AI 根据 SOP 组织节点" in view
assert "nodes: []" in view and "edges: []" in view
assert "尚未配置节点" in view and "从一个执行节点开始人工配置" in view
assert "AI 正在根据 SOP 组织节点…" in view and "if store.isProposing" in view
assert "selectedTab = .nodes\n        Task" in view
assert "private func makeNode(" in view and "private func hasRunnableNodes(" in view
assert 'draft.nodes.removeAll { $0.role == "finalization" }' in view
assert 'Image(systemName: "plus")' in view and '.help("新建场景")' in view
assert 'Button("编写业务 SOP")' not in view
assert view.count('Button("新建场景")') == 1
assert 'Text(store.scenarios.isEmpty ? "暂无场景"' in view
assert "创建第一个场景" in view and "从 Markdown SOP 开始" in view
assert "让 AI 组织，或从三个串行节点开始手动配置" not in view
assert "CreamTabBar(items: ScenarioEditorTab.allCases" in view
assert "CreamMenuLabel(title: employeeName" in view
assert "CreamSegmentedControl(" in view and "ScenarioFailurePolicy.allCases" in view
assert "nodeFormRow(\"节点目标\")" in view and "nodeFormRow(\"依赖节点\")" in view and "nodeFormRow(\"运行预算\"" in view
assert "nodeFormRow(\"所需能力\")" not in view and "nodeFormRow(\"验收标准\")" not in view
assert "private func capabilities(" not in view and "private func acceptance(" not in view
assert "按执行顺序配置节点目标、执行员工、依赖关系和运行策略。" in view
assert "按执行顺序分配员工、能力、验收标准和单节点预算。" not in view
assert "toggleDependency(" in view and "dependencyTitle(" in view
assert "ForEach(Array(binding.nodes.enumerated())" in view and "if binding.nodes.wrappedValue.isEmpty" in view
assert view.count("CreamPrimaryButtonStyle()") >= 5
assert view.count("CreamSecondaryButtonStyle()") >= 5
assert ".pickerStyle(.segmented)" not in view.split("private func nodesPage", 1)[0]
assert ".pickerStyle(.segmented)" not in view
assert 'Label("返回场景库", systemImage: "chevron.left")' in view
assert "CreamModalOverlay(" in view and "ScenarioDiscardConfirmation" in view
assert "private func discardDraft()" in view and "放弃未保存的场景修改" in view
assert ".onHover { isExitHovered = $0 }" in view
assert 'Button("退出配置", action: close)' not in view
assert ".confirmationDialog(" not in view
assert "@Binding var draft: ScenarioProposal" in view
assert "store.draft!" not in view and "draftBinding" not in view
assert "get: { store.draft ?? draft }" in view
assert "scenario-save" in service and '"--confirmed"' in service
assert "business-flow-start" in service and "businessFlowPlan" in store
assert "@Published private(set) var isProposing = false" in store
assert "func propose(objective: String, key: String) async -> Bool" in store
assert "isProposing = true" in store and "defer { isProposing = false }" in store
assert "flow.workOrders" in view
assert "TaskStore" not in view
assert "conversationRuns" in chat and "conversationID" in chat
assert "DEEPSEEK_API_KEY" in service
assert "restorePendingRun" in store and "runPhase" in source("apps/macos/AIEmployee/Sources/AIEmployee/Models/Scenario.swift")
assert "resolvePendingRun" in chat and "cancelFlow" in chat and "continueFlow" in chat
assert "禁止自动重试" in chat and "resolveUnknown" in chat
assert "effective_prompt" not in view.lower()
assert "reasoning" not in view.lower()

print("business flow UI checks: ok")
