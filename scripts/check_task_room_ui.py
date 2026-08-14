#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


view = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Work/TaskThreadWorkspaceView.swift")
controls = source("apps/macos/AIEmployee/Sources/AIEmployee/DesignSystem/CreamControls.swift")
model = source("apps/macos/AIEmployee/Sources/AIEmployee/Models/TaskThread.swift")
runtime = source("runtime/rust-core/src/main.rs")
archive = source("apps/macos/AIEmployee/Sources/AIEmployee/Views/Archive/ArchiveWorkspaceView.swift")

assert 'item.role == "user"' in view and 'item.role == "agent"' in view
assert 'item.kind == "approval"' in view and 'case "handoff"' in view
assert 'Button("批准")' in view and 'Button("拒绝")' in view
assert 'Text("任务进度")' in view
assert "CreamAvatar(" in view and "CreamProgressBar(" in view
assert "struct CreamAvatar" in controls and "struct CreamProgressBar" in controls
assert "creamFloatingComposer" in controls and ".creamFloatingComposer" in view
assert "ThreadScope" not in view and "CreamTabBar" not in view
assert "TaskThreadSidebarRow(" in view and ".creamSidebarRowSurface" in view
assert "UserMessageBlock(text:" in view and "AgentTimelineBlock(" in view
assert "proposal.threadID == thread.id" in view and 'Button("确认执行"' in view
assert 'Text(candidateAssignments.isEmpty ? "参与员工" : "拟参与员工")' in view
assert 'Button("重新生成方案", action: store.regenerateProposal)' in view
assert 'Text("正在匹配员工…")' in view
assert 'Text("方案匹配")' in view
assert 'proposal.candidateAssignments(employees: employeeStore.employees)' in view
assert 'thread.room.participants.isEmpty ? "尚未匹配员工"' in view
assert 'private func inspectorCandidateAssignments(for thread: TaskThreadProjection)' in view
assert 'case .review(let proposal) where proposal.threadID == thread.id:' in view
assert 'ForEach(candidateAssignments)' in view
assert 'Text("待确认")' in view
assert 'private var proposalStateAllowsRoomInput: Bool' in view
assert 'case .recoverable, .failed, .restoring, .generating:' in view
assert 'case .idle, .review:' in view
assert '.disabled(!canSendMessage(thread))' in view
assert 'guard canSubmit(thread) else { return }' in view
assert 'guard let thread = store.activeThread, canSubmit(thread) else { return }' in view
assert 'Button("归档"' in view
assert 'Button("删除"' in archive and "taskThreadRetention" in source("apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift")
assert '.frame(maxWidth: .infinity, maxHeight: .infinity)' in view
assert 'ForEach(store.taskThreads)' in view and 'ForEach(store.archivedTaskThreads)' not in view
assert '"还没有工作"' in view and '"没有已归档工作"' not in view
assert '.creamSidebarRowSurface' in archive and '.transition(.opacity.combined(with: .move(edge: .top)))' in archive
assert 'inspectorSection("Workspace")' not in view
assert 'NSWorkspace.shared.activateFileViewerSelecting' in view
assert "ConversationStore" not in view
assert "struct TaskRoomTimelineItem" in model and "let agentID: String?" in model
assert 'Some("task-thread-timeline")' in runtime
assert '"agent",\n                "agent_update"' in runtime and '"system",\n                "handoff"' in runtime
assert "task_room_timeline_projection" in runtime

print("task room UI checks: ok")
