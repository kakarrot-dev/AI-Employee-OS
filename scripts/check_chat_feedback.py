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
assert 'Text("\\(employeeName) · \\(TaskPresentation.time(message.createdAt))")' in workspace, (
    "assistant identity and time must remain visible above every reply"
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
assert 'Button("拒绝", role: .destructive) { store.resolveApproval(for: run, approve: false) }' in workspace, (
    "live approval must expose a real reject action"
)
assert 'Button("允许一次") { store.resolveApproval(for: run, approve: true) }' in workspace, (
    "live approval must expose a real one-time approval action"
)
assert "employeeName" not in inspector and "employeeDepartment" not in inspector, (
    "the work inspector must not repeat static employee profile fields"
)
for section in ["当前工作", "工作计划", "运行诊断"]:
    assert section in inspector, f"the dynamic work inspector must render {section}"
assert "run.updatedAt" in inspector and "run.skillID" in inspector and "activeAction(run)" in inspector, (
    "the inspector must derive status from persisted Runtime facts"
)
assert 'DisclosureGroup("技术详情"' in inspector, (
    "raw Runtime identifiers and errors must stay behind technical disclosure"
)
assert "message.content == \"执行已暂停，等待你批准所需权限。\"" in workspace, (
    "the task timeline must suppress the redundant persisted approval reply"
)
assert "store.runs.filter { !hasFinalReply(for: $0) }" in workspace, (
    "a successful conversational run must yield to its final assistant reply"
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
