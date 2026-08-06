from pathlib import Path

store = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Stores/ConversationStore.swift"
).read_text()
workspace = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift"
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

print("chat feedback checks: ok")
