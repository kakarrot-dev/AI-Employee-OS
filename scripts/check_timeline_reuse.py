#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


timeline = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/CreamTimeline.swift")
chat = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift")
task_room = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift")
contract = source("docs/design-system/AI Employee macOS UI Token & Component Contract v1.0.md")
preview = source("docs/design-system/AI Employee macOS Component Library Preview.html")

shared_components = (
    "CreamTimelineLayout",
    "CreamTimelineUserMessage",
    "CreamTimelineAgentRow",
    "CreamTimelineMarkdownBody",
)
for component in shared_components:
    assert f"struct {component}" in timeline, f"missing shared timeline component: {component}"
    assert f"{component}(" in chat, f"employee chat must use {component}"
    assert f"{component}(" in task_room, f"Task Thread must use {component}"
    assert component in contract, f"timeline contract must name {component}"
    assert component in preview, f"component preview must map {component}"

assert "enum CreamTimelineDensity" in timeline, "shared timeline must define compact / regular density"
assert "density: .compact" in chat, "employee chat must use compact timeline density"
assert "density: .regular" in task_room, "Task Thread must use regular timeline density"
assert "copyText: message.content" in chat, "employee replies must use the shared copy action"
assert "copyText: item.content" in task_room, "Task Thread replies must use the shared copy action"

for marker in (
    'id="cream-timeline-template"',
    "function renderCreamTimeline(host, source)",
    'data-timeline-source="gallery"',
    'data-timeline-source="work"',
    'data-timeline-density="compact"',
    'data-timeline-density="regular"',
    "cream-timeline-user-message",
    "cream-timeline-agent-row",
    "cream-timeline-markdown",
    "cream-timeline-runtime-event",
    "cream-timeline-streaming",
):
    assert marker in preview, f"shared timeline preview contract missing: {marker}"

for legacy_preview_marker in (
    "client-timeline",
    "client-message user",
    "client-chat-user-turn",
    "client-chat-assistant-turn",
    "client-chat-markdown",
):
    assert legacy_preview_marker not in preview, (
        f"component preview still contains a second timeline implementation: {legacy_preview_marker}"
    )

for forbidden in (
    "struct AgentTimelineBlock",
    "struct UserMessageBlock",
    "struct ChatMarkdownBody",
    "struct ContentSizedBubble",
    "struct MessageHoverActions",
    'Image(systemName: "doc.on.doc")',
    "LazyVStack(alignment: .leading, spacing: AppTheme.Typography.timelineSpacing)",
):
    assert forbidden not in chat + task_room, f"feature timeline duplicates shared implementation: {forbidden}"

assert chat.count("CreamTimelineLayout(") == 1 and task_room.count("CreamTimelineLayout(") == 1, (
    "each timeline feature must have exactly one shared layout root"
)
assert chat.count("CreamTimelineUserMessage(") >= 2, (
    "private-chat messages and embedded task inputs must use the shared user message"
)
assert chat.count("CreamTimelineAgentRow(") >= 3, (
    "persisted, streaming, and task replies must use the shared agent row"
)
assert r"@Environment(\.accessibilityReduceMotion)" in timeline, (
    "shared hover and fold interactions must honor Reduce Motion"
)
for marker in (
    ".onHover { hovering = $0 }",
    'label: "复制消息"',
    'CreamTimelineActionButton(label: "编辑消息"',
    'Label("重新发送", systemImage: "arrow.up")',
    'expanded ? "收起" : "展开完整消息"',
    ".accessibilityElement(children: .ignore)",
    '.accessibilityLabel("你：\\(text)")',
    "SelectableMarkdownTextView(source: source",
):
    assert marker in timeline, f"shared timeline interaction contract missing: {marker}"

assert "private func runtimeCard" in task_room, (
    "Task Thread must retain domain-specific Runtime event content outside ordinary message components"
)

print("timeline reuse checks: ok")
