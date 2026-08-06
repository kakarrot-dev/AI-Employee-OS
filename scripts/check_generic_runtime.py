#!/usr/bin/env python3
import json, os, sqlite3, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "target/debug/ai-employee-runtime"

def run(*args: str, env: dict[str, str] | None = None) -> dict:
    result = subprocess.run([str(BINARY), *args], cwd=ROOT, text=True, capture_output=True,
                            env={**os.environ, **(env or {})}, check=False)
    if result.returncode != 0:
        raise AssertionError(result.stderr.strip())
    return json.loads(result.stdout)

with tempfile.TemporaryDirectory(prefix="ai-employee-generic-") as directory:
    root = Path(directory); database = root / "runtime.db"; output = root / "output"; output.mkdir()
    common = ("--repository-root", str(ROOT), "--database", str(database))
    run("employees-list", *common)
    worker = {"schema_version":"1.0","id":"runtime-test-worker","name":"Runtime Test Worker","role":"通用执行员工","department":"测试","soul":["忠实执行契约"],"persona":{"communication":{"style":"concise"},"thinking":{"approach":"evidence_first"},"decision":{"priorities":["accuracy"]},"habit":{"output_format":"markdown"}},"base_prompt":"按绑定 Skill 工作，不假设业务身份。","status":"active","config_version":1}
    run("employee-save", "--database", str(database), "--payload", json.dumps(worker, ensure_ascii=False))
    run("bind-skill", "--database", str(database), "--agent-id", "runtime-test-worker", "--skill-id", "structured-summary", "--skill-version", "1.0.0")
    non_alex = run("run-skill", *common, "--agent-id", "runtime-test-worker", "--skill-id", "structured-summary", "--input-json", '{"text":"generic employee"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"summary":"generic employee"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert non_alex["status"] == "succeeded"
    run("bind-skill", "--database", str(database), "--agent-id", "ai-product-manager", "--skill-id", "structured-summary", "--skill-version", "1.0.0")
    summary = run("run-skill", *common, "--agent-id", "ai-product-manager", "--skill-id", "structured-summary", "--input-json", '{"text":"deadline Friday"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"summary":"deadline Friday"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert summary["status"] == "succeeded"
    run("bind-skill", "--database", str(database), "--agent-id", "ai-product-manager", "--skill-id", "review-pipeline", "--skill-version", "1.0.0")
    workflow = run("run-skill", *common, "--agent-id", "ai-product-manager", "--skill-id", "review-pipeline", "--input-json", '{"text":"release Friday"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"summary":"release Friday"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert workflow["status"] == "succeeded" and workflow["phase"] == "terminal"
    run("bind-skill", "--database", str(database), "--agent-id", "ai-product-manager", "--skill-id", "review-and-save", "--skill-version", "1.0.0")
    workflow_tool = run("run-skill", *common, "--agent-id", "ai-product-manager", "--skill-id", "review-and-save", "--input-json", '{"path":"workflow.md","content":"workflow output"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"path":"workflow.md"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert workflow_tool["phase"] == "waiting_approval"
    workflow_done = run("continue-run", *common, "--run-id", workflow_tool["run_id"], "--authorized-root", str(output), "--approve", env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"path":"workflow.md"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert workflow_done["status"] == "succeeded" and (output / "workflow.md").read_text() == "workflow output"
    duplicate = subprocess.run([str(BINARY), "continue-run", *common, "--run-id", workflow_tool["run_id"], "--authorized-root", str(output), "--approve"], cwd=ROOT, text=True, capture_output=True, check=False)
    assert duplicate.returncode != 0 and "run_not_waiting_approval" in duplicate.stderr
    with sqlite3.connect(database) as connection:
        workflow_actions = connection.execute("SELECT status FROM actions WHERE task_id=? ORDER BY id", (workflow_done["task_id"],)).fetchall()
        assert workflow_actions == [("succeeded",), ("succeeded",)]
        assert connection.execute("SELECT count(*) FROM tool_executions te JOIN actions a ON a.id=te.action_id WHERE a.task_id=?", (workflow_done["task_id"],)).fetchone()[0] == 1
    waiting = run("chat-send", *common, "--conversation-id", "conversation_ai-product-manager_continue", "--employee-id", "ai-product-manager", "--input", "正式工作：请总结这段材料", env={"DEEPSEEK_API_KEY": "test", "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"ask_user","question":"请提供材料","required_input_schema":{"type":"object"}}'})
    assert waiting["run_phase"] == "waiting_user"
    continued = run("chat-send", *common, "--conversation-id", "conversation_ai-product-manager_continue", "--employee-id", "ai-product-manager", "--input", "材料是周五发布", env={"DEEPSEEK_API_KEY": "test", "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"summary":"周五发布"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert continued["run_id"] == waiting["run_id"] and continued["run_phase"] == "terminal"
    run("bind-skill", "--database", str(database), "--agent-id", "ai-product-manager", "--skill-id", "write-note", "--skill-version", "1.0.0")
    cancellable = run("run-skill", *common, "--agent-id", "ai-product-manager", "--skill-id", "write-note", "--input-json", '{"path":"cancelled.md","content":"must not exist"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","tool_id":"document-tool","action":"create_markdown","arguments":{"path":"cancelled.md","content":"must not exist"},"rationale_summary":"write"}'})
    cancelled = run("cancel-task", "--database", str(database), "--task-id", cancellable["task_id"])
    assert cancelled["status"] == "cancelled" and not (output / "cancelled.md").exists()
    run("bind-skill", "--database", str(database), "--agent-id", "ai-product-manager", "--skill-id", "write-note", "--skill-version", "1.0.0")
    requested = run("run-skill", *common, "--agent-id", "ai-product-manager", "--skill-id", "write-note", "--input-json", '{"path":"note.md","content":"hello"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","tool_id":"document-tool","action":"create_markdown","arguments":{"path":"note.md","content":"hello"},"rationale_summary":"write note"}'})
    assert requested["phase"] == "waiting_approval"
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT count(*) FROM tool_executions te JOIN actions a ON a.id=te.action_id WHERE a.task_id=?", (requested["task_id"],)).fetchone()[0] == 0
    completed = run("continue-run", *common, "--run-id", requested["run_id"], "--authorized-root", str(output), "--approve", env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"path":"note.md"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert completed["status"] == "succeeded" and (output / "note.md").read_text() == "hello"
    with sqlite3.connect(database) as connection:
        state = connection.execute("SELECT t.status,a.status,te.status,d.status FROM tasks t JOIN actions a ON a.task_id=t.id JOIN tool_executions te ON te.action_id=a.id JOIN deliverables d ON d.task_id=t.id WHERE t.id=?", (completed["task_id"],)).fetchone()
        assert state == ("succeeded", "succeeded", "succeeded", "verified")
        assert connection.execute("SELECT count(*) FROM artifacts WHERE task_id=? AND verification_status='verified'", (completed["task_id"],)).fetchone()[0] == 1
    (output / "source.txt").write_text("source evidence", encoding="utf-8")
    run("bind-skill", "--database", str(database), "--agent-id", "ai-product-manager", "--skill-id", "inspect-and-summarize", "--skill-version", "1.0.0")
    multi = run("run-skill", *common, "--agent-id", "ai-product-manager", "--skill-id", "inspect-and-summarize", "--input-json", '{"path":"source.txt"}', env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","tool_id":"file-tool","action":"read_file","arguments":{"path":"source.txt"},"rationale_summary":"first read"}'})
    multi_second = run("continue-run", *common, "--run-id", multi["run_id"], "--authorized-root", str(output), "--approve", env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","tool_id":"file-tool","action":"read_file","arguments":{"path":"source.txt"},"rationale_summary":"second read"}'})
    assert multi_second["phase"] == "waiting_approval"
    multi_done = run("continue-run", *common, "--run-id", multi["run_id"], "--authorized-root", str(output), "--approve", env={"AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"complete","output":{"summary":"source evidence"},"deliverable_candidates":[],"evidence_refs":[]}'})
    assert multi_done["status"] == "succeeded"
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT count(*) FROM tool_executions te JOIN actions a ON a.id=te.action_id WHERE a.task_id=?", (multi_done["task_id"],)).fetchone()[0] == 2
print("generic runtime checks: ok")
