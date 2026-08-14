#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


composer = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/CreamComposer.swift")
composer_input = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/CreamComposerTextView.swift")
office = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Office/OfficeWorkspaceView.swift")
chat = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatComposer.swift")
chat_workspace = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift")
task_room = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift")
content = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift")

feature_sources = (office, chat, task_room)
assert sum(text.count("CreamComposer(") for text in feature_sources) == 3, (
    "office, employee chat, and Task Thread must each use one CreamComposer"
)
assert "size: .expanded" in office, "office must use the expanded Composer size"
assert "size: .compact" in chat, "employee chat must use the compact Composer size"
assert "size: .regular" in task_room, "Task Thread must use the regular Composer size"

assert all(".creamFloatingComposer(" not in text for text in feature_sources), (
    "feature views must not bypass CreamComposer with the visual surface modifier"
)
assert all("Enter 发送" not in text and "Enter 提交" not in text for text in feature_sources), (
    "Composer footers must not repeat keyboard instructions"
)
assert "EmployeeChatComposer(" in chat_workspace, (
    "employee chat workspace must compose the dedicated feature wrapper"
)
assert "交给员工工作" not in chat + chat_workspace and "isCreatingWork" not in chat + chat_workspace, (
    "employee chat must not restore the removed work-mode Composer branch"
)
assert "workComposerPresented" not in content, (
    "ContentView must not retain state for the removed employee-chat work Composer"
)
assert "添加附件" not in chat and ".fileImporter(" not in chat, (
    "employee chat must not expose an attachment affordance before attachments reach Runtime"
)

for marker in (
    "enum CreamComposerSize",
    "case compact",
    "case regular",
    "case expanded",
    "enum CreamComposerActionState",
    "case loading",
    "case stop",
    "@State private var isFocused",
    "CreamComposerTextView(",
    ".help(actionHelp)",
    ".accessibilityLabel(actionHelp)",
    "AppTheme.Control.hitTarget",
):
    assert marker in composer, f"CreamComposer contract missing: {marker}"

for marker in (
    "NSViewRepresentable",
    "ComposerNativeTextView",
    "hasMarkedText()",
    "contains(.shift)",
    "insertNewline(nil)",
    "onSubmit()",
    "textView.isEditable = isEnabled",
    "textView.setAccessibilityLabel(accessibilityLabel)",
):
    assert marker in composer_input, f"CreamComposer text input contract missing: {marker}"

print("composer reuse checks: ok")
