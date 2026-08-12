from pathlib import Path

store = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Stores/ConversationStore.swift"
).read_text()
workspace = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift"
).read_text()
selectable_markdown = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/SelectableMarkdownTextView.swift"
).read_text()
inspector = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/TaskInspectorView.swift"
).read_text()
task_store = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Stores/TaskStore.swift"
).read_text()
command_palette = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/CommandPaletteView.swift"
).read_text()
settings = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/SettingsView.swift"
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
assert "BusinessFlowHistoryBar" not in workspace and "scenarioStore" not in workspace, (
    "employee private chat must not duplicate Task Room execution status"
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
assert 'employee?.name ?? "Alex"' not in workspace and 'employee?.role ?? "AI 产品经理"' not in workspace, (
    "missing employee data must not be disguised as the default seed employee"
)
assert "交给 Alex 新工作" not in command_palette and "在办公室描述目标，由系统匹配员工" in command_palette, (
    "the command palette must route generic work through the unified Office entry"
)
assert "查看员工与工作状态" not in command_palette and "查看模型调用与 Token 用量" in command_palette, (
    "the Office command description must match its usage-only responsibility"
)
assert "SecureField" not in settings and "API Key 仅从项目根目录 .env 读取" in settings, (
    "model credentials must not be exposed in the client"
)
assert "streamingContent += delta" in store, "stream deltas must update the visible assistant response"
assert "func stopSending()" in store and "sendTask?.cancel()" in store, (
    "chat stop must cancel the owned request instead of only hiding pending UI"
)
assert '"chat-abort"' in Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift"
).read_text(), "chat stop must converge the persisted model call"
assert 'Image(systemName: conversationStore.isSending && !isCreatingWork ? "stop.fill" : "arrow.up")' in workspace, (
    "the stable composer action slot must switch from send to stop while replying"
)
assert "TimelineView(.periodic(from: .now, by: 1))" in workspace and "TaskPresentation.elapsed(run.createdAt" in workspace, (
    "a real running task must expose live elapsed time instead of a static progress claim"
)
runtime_main = Path("runtime/rust-core/src/main.rs").read_text()
assert "This response is conversation-only" in runtime_main and "Never claim that work is currently running" in runtime_main, (
    "conversation-only model output must not impersonate an active Runtime job"
)
assert "已停止本轮回复。你可以修改上一条消息后重新发送。" in runtime_main, (
    "a user-stopped chat request must persist a visible terminal explanation"
)
assert ".onKeyPress(keys: [.return])" in workspace and "keyPress.modifiers.contains(.shift)" in workspace, (
    "the composer must reserve Shift+Enter for an inline newline"
)
assert "#selector(NSText.insertNewline(_:))" in workspace, (
    "Shift+Enter must insert at the active text selection instead of appending to the draft"
)
assert "展开完整消息" in workspace and "isLong" in workspace, (
    "long user and assistant messages must expose an explicit fold control"
)
assert "case .table(let headers, let rows)" in selectable_markdown and 'joined(separator: "    ")' in selectable_markdown, (
    "Markdown tables must remain readable and continuously selectable"
)
assert "SelectableMarkdownTextView(source: source" in workspace, (
    "assistant Markdown must use one native text surface so selection can cross block boundaries"
)
assert "textView.isSelectable = true" in selectable_markdown and "textView.isEditable = false" in selectable_markdown, (
    "the native message text surface must remain read-only and selectable"
)
assert "One NSTextView owns the complete message" in selectable_markdown, (
    "the continuous-selection boundary must remain explicit"
)
assert "private final class MarkdownLayoutManager" in selectable_markdown and "NSBezierPath(roundedRect:" in selectable_markdown, (
    "code blocks must use a rounded block surface without fragmenting native text selection"
)
assert "markdownBlockBorder" not in selectable_markdown, (
    "Markdown block hierarchy must use surface contrast rather than full borders"
)
assert "private enum MarkdownTypography" in selectable_markdown and "bodyLineSpacing" in selectable_markdown, (
    "Markdown reading hierarchy must use one shared typography scale"
)
assert "attributes[.backgroundColor]" not in selectable_markdown, (
    "code block styling must not regress to a hard per-glyph background"
)
assert workspace.count(".selectableTextCursor()") >= 2 and "NSCursor.iBeam.set()" in workspace, (
    "single-block user messages must expose the native text-selection cursor"
)
assert 'Label("复制", systemImage: "doc.on.doc")' not in workspace, (
    "assistant reply copy action must not render a text label"
)
assert '.help("复制完整回复")' in workspace and '.accessibilityLabel("复制 \\(employeeName) 的回复")' in workspace, (
    "the icon-only assistant copy action must remain discoverable and accessible"
)
assert "struct AgentTimelineBlock<Content: View>" in workspace, (
    "all agent-authored timeline entries must use one fixed composition component"
)
task_room = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift"
).read_text()
assert "AgentTimelineBlock(" in task_room and "UserMessageBlock(text:" in task_room, (
    "Task Room must reuse the canonical chat timeline components"
)
assert "metadata: TaskPresentation.time(message.createdAt)" in workspace, (
    "assistant identity and time must remain visible in the shared timeline block"
)
assert workspace.count("AgentTimelineBlock(") >= 3, (
    "assistant replies, streaming replies, and work events must share the same timeline block"
)
assert '"────────"' in selectable_markdown and "colors.divider" in selectable_markdown, (
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
assert "private var conversationRuns" in workspace and "private var selectedRun" in workspace, (
    "the inspector must derive its run from the current employee conversation"
)
assert "return !conversationRuns.contains { run in" in workspace, (
    "assistant-message deduplication must not inspect another employee's runs"
)
assert "entries.append(contentsOf: conversationRuns.filter" in workspace, (
    "the chat timeline must not render runs from another employee conversation"
)
assert "entries.append(contentsOf: store.runs.filter" not in workspace, (
    "the chat timeline must never append the global task history"
)
assert "@Environment(\\.appWindowWidth)" in workspace and "conversationListMinimumWindowWidth" in workspace, (
    "compact windows must not swap the global sidebar for the conversation sidebar after toggling"
)
assert "private var selectedRun: TaskRun? {\n        activeRun\n    }" in workspace, (
    "the current-work inspector must not present a terminal historical run as active work"
)
assert "let selected = store.runs.first(where:" not in workspace, (
    "the chat inspector must not reuse an unrelated historical task selection"
)
context_sidebar = Path(
    "apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/ContextSidebarView.swift"
).read_text()
assert "employeeRuns.first?.status == .failed" not in context_sidebar, (
    "the conversation status dot must not remain failed because of a terminal historical run"
)

print("chat feedback checks: ok")
