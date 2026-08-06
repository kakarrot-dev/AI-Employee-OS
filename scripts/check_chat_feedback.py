from pathlib import Path

store = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Stores/ConversationStore.swift"
).read_text()
workspace = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift"
).read_text()
inspector = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/TaskInspectorView.swift"
).read_text()
task_store = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Stores/TaskStore.swift"
).read_text()

sending_index = store.index("isSending = true; error = nil")
optimistic_index = store.index("let optimistic = ChatMessage")
request_index = store.index("service.chatSend")

assert sending_index < optimistic_index < request_index, (
    "chat must publish pending state and the local user message before waiting for Runtime"
)
assert "if conversationStore.isSending" in workspace, (
    "the conversation timeline must render pending assistant feedback"
)
assert "PendingAssistantResponseView" in workspace, (
    "pending assistant feedback must be a visible timeline element"
)
assert "proxy.scrollTo(Self.bottomAnchorID, anchor: .bottom)" in workspace, (
    "new messages and pending feedback must scroll into the visible viewport"
)
assert ".onChange(of: scrollSignal)" in workspace, (
    "the timeline must react when optimistic or persisted messages change"
)
assert "ChatMarkdownBody(source: displayedContent)" in workspace and ".accessibilityElement(children: .ignore)" in workspace, (
    "assistant Markdown blocks must not duplicate the full response in accessibility"
)
assert '"--stream-events"' in Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift"
).read_text(), "chat requests must use the real Runtime streaming protocol"
assert "streamingContent += delta" in store, "stream deltas must update the visible assistant response"
assert "展开完整消息" in workspace and "isLong" in workspace, (
    "long user and assistant messages must expose an explicit fold control"
)
assert "case .table(let headers, let rows)" in workspace and "MarkdownTableView" in workspace, (
    "Markdown tables must render as a native grid"
)
assert 'Label("复制", systemImage: "doc.on.doc")' not in workspace, (
    "assistant reply copy action must not render a text label"
)
assert '.help("复制完整回复")' in workspace and '.accessibilityLabel("复制 \\(employeeName) 的回复")' in workspace, (
    "the icon-only assistant copy action must remain discoverable and accessible"
)
assert "private struct AgentTimelineBlock<Content: View>" in workspace, (
    "all agent-authored timeline entries must use one fixed composition component"
)
assert "metadata: TaskPresentation.time(message.createdAt)" in workspace, (
    "assistant identity and time must remain visible in the shared timeline block"
)
assert workspace.count("AgentTimelineBlock(") >= 3, (
    "assistant replies, streaming replies, and work events must share the same timeline block"
)
assert '.frame(width: 40, height: 2)' in workspace, (
    "Markdown dividers must remain visually distinct from full-width turn separators"
)
assert "message.id == conversationStore.latestUserMessageID" in workspace, (
    "only the latest user message may enter edit mode"
)
assert "TextEditor(text: $editingText)" in workspace and 'Label("重新发送", systemImage: "arrow.up")' in workspace, (
    "user edits must happen inside the original message bubble"
)
assert 'activeRun.runPhase == "waiting_approval"' in workspace and "LiveActionApprovalBar" in workspace, (
    "a live approval request must replace the generic working status bar"
)
assert "approvalRunsInFlight" in task_store and "guard !approvalRunsInFlight.contains(runID)" in task_store, (
    "approval resolution must reject concurrent submissions for the same Runtime run"
)
assert "isResolvingApproval(for: run)" in workspace and "isResolvingApproval(for: run)" in inspector, (
    "all approval surfaces must share the same in-flight disabled state"
)
assert 'Button("拒绝", role: .destructive) { store.resolveApproval(for: run, approve: false) }' in workspace, (
    "live approval must expose a real reject action"
)
assert 'store.resolveApproval(for: run, approve: true)' in workspace, (
    "live approval must expose a real one-time approval action"
)
assert 'run.status == .running ? "\\(employeeName) 正在处理"' in inspector, (
    "the work inspector status must use the selected employee name instead of a default seed name"
)
for section in ["当前工作", "工作计划", "运行诊断"]:
    assert section in inspector, f"the dynamic work inspector must render {section}"
assert "run.updatedAt" in inspector and "run.skillID" in inspector and "activeAction(run)" in inspector, (
    "the inspector must derive status from persisted Runtime facts"
)
assert "ChatMarkdownBody(source: message)" in workspace and "run.deliverableMessage" in workspace, (
    "file delivery must render the agent response and artifact card in one timeline block"
)
assert 'DisclosureGroup("技术详情"' in inspector, (
    "raw Runtime identifiers and errors must stay behind technical disclosure"
)
assert "message.content == \"执行已暂停，等待你批准所需权限。\"" in workspace, (
    "the task timeline must suppress the redundant persisted approval reply"
)
assert "$0.hasPersistentDeliverable || !hasFinalReply(for: $0)" in workspace, (
    "verified deliveries must remain in the timeline after later assistant replies"
)
assert 'Label("打开文件", systemImage: "arrow.up.right")' in workspace and "primaryAction:" not in workspace, (
    "delivery cards must expose file opening as an immediately clickable split-button action"
)
assert 'Button("打开文件夹", systemImage: "folder")' in workspace and "openContainingFolder" in workspace, (
    "the delivery dropdown must expose its containing folder"
)
assert 'Image(systemName: "chevron.down")' in workspace and '.menuIndicator(.hidden)' in workspace, (
    "the split button must show a dedicated dropdown trigger without requiring a long press"
)
assert "Text(displayTitle)" in workspace and "Text(formatLabel)" in workspace, (
    "delivery cards must present a document title and file format"
)
assert "正在读取交付物" not in workspace and "tryAttributedMarkdown" not in workspace, (
    "delivery cards must not embed document previews or indefinite loading state"
)
assert 'Button("在 Finder 中显示")' not in workspace and "质量检查通过" not in workspace, (
    "delivery cards must stay focused on file identity and the primary open action"
)
assert 'Text("整理结果并回复")' in inspector and "planStepCount(run)" in inspector, (
    "the visible plan must include final response synthesis after Tool actions"
)
assert "private var conversationRuns" in workspace and "return conversationRuns.first" in workspace, (
    "the inspector must follow the current employee conversation instead of stale global task selection"
)
assert "let selected = store.runs.first(where:" not in workspace, (
    "the chat inspector must not reuse an unrelated historical task selection"
)

print("chat feedback checks: ok")
