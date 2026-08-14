from pathlib import Path


ROOT = Path("apps/macos/AIEmployee/Sources/AIEmployee")


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text()


command_palette = read("Views/CommandPaletteView.swift")
content = read("Views/ContentView.swift")
contacts = read("Views/Employees/EmployeeDirectoryView.swift")
chat = read("Views/EmployeeChat/EmployeeChatWorkspaceView.swift")
timeline = read("DesignSystem/CreamTimeline.swift")
knowledge = read("Views/KnowledgeLibraryWorkspaceView.swift")
settings = read("Views/SettingsView.swift")
presentation = read("Support/TaskPresentation.swift")
capability_store = read("Stores/CapabilityStore.swift")
work = read("Views/Work/TaskThreadWorkspaceView.swift")
inspector = read("Views/EmployeeChat/TaskInspectorView.swift")
business_flow_runtime = Path("runtime/rust-core/src/business_flow_service.rs").read_text()

assert "recentThreads: [TaskThreadProjection]" in command_palette
assert "recentRuns" not in command_palette and "title: run.input" not in command_palette
assert "title: thread.title" in command_palette and "store.taskThreads" in content
assert 'title: "交代工作"' in command_palette

assert r"索引：\(selected.indexStatus)" not in knowledge
assert 'case "ready", "indexed": "已索引"' in knowledge
assert 'default: "状态待确认"' in knowledge

for internal_copy in (
    ".env",
    "Runtime 与连接",
    "Local-first",
    "SwiftUI for macOS",
    "独立 Worker",
):
    assert internal_copy not in settings, f"settings exposes internal copy: {internal_copy}"

assert 'Button(employee.status == "active" ? "停用" : "启用")' in contacts
assert 'Button(employee.status == "active" ? "禁用" : "启用")' not in contacts
assert "私人聊聊" not in contacts and "物理删除" not in contacts

agent_row_start = timeline.index("struct CreamTimelineAgentRow")
agent_row_end = timeline.index("struct CreamTimelineMarkdownBody")
agent_row = timeline[agent_row_start:agent_row_end]
assert ".frame(maxWidth: .infinity, alignment: .leading)" in agent_row
layout_start = timeline.index("struct CreamTimelineLayout")
layout_end = timeline.index("struct CreamTimelineAgentRow")
layout = timeline[layout_start:layout_end]
assert layout.index(".frame(maxWidth: .infinity, alignment: .leading)") < layout.index(".padding(.horizontal, horizontalInset)")
assert '.containerRelativeFrame(.horizontal, alignment: .center)' in layout

assert "所有 Tool 调用仍由 Runtime" not in chat
assert "等待 Runtime 更新进度" not in chat
assert "Skill、Tool、权限和副作用仍由 Runtime" not in chat

assert 'return "\\(seconds) 秒"' in presentation
assert 'return "\\(seconds / 60) 分 \\(seconds % 60) 秒"' in presentation
assert 'default: "正在处理"' in presentation
assert 'default: "工作状态已更新"' in presentation

assert 'category: "\\(Self.categoryTitle(item.category)) · 已安装"' in capability_store
assert 'value: Self.readinessTitle(item.status)' in capability_store
assert 'metadata: toolTypeTitle(item.type)' in capability_store

assert 'with: "上游交付物已通过系统核验"' in work
assert '"上游交付物已通过 Runtime 证据校验"' not in business_flow_runtime
assert '"上游交付物已通过系统核验"' in business_flow_runtime
assert "Runtime 不会自动重试" not in inspector

print("product language checks passed")
