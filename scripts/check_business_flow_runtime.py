#!/usr/bin/env python3
import json
import os
import runpy
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "target/debug/ai-employee-runtime"
sys.path.insert(0, str(ROOT / "runtime/python-agent"))
from app.decision import parse_decision

runpy.run_path(str(Path(__file__).with_name("check_scenario_runtime.py")), run_name="__main__")


def run(*args: str, env: dict[str, str] | None = None) -> dict:
    result = subprocess.run(
        [str(BINARY), *args], cwd=ROOT, text=True, capture_output=True,
        env={**os.environ, **(env or {})}, check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr.strip())
    return json.loads(result.stdout)


def reject(*args: str, expected: str, env: dict[str, str] | None = None) -> None:
    result = subprocess.run(
        [str(BINARY), *args], cwd=ROOT, text=True, capture_output=True,
        env={**os.environ, **(env or {})}, check=False,
    )
    assert result.returncode != 0, result.stdout
    assert expected in result.stderr, result.stderr


def employee(identifier: str, name: str, role: str) -> dict:
    return {
        "schema_version": "1.0", "id": identifier, "name": name, "role": role,
        "department": "测试", "soul": ["只使用已授权证据"],
        "persona": {
            "communication": {"style": "concise"},
            "thinking": {"approach": "evidence_first"},
            "decision": {"priorities": ["accuracy"]},
            "habit": {"output_format": "markdown"},
        },
        "base_prompt": "按绑定 Capability 工作，不读取其他员工私人上下文。",
        "status": "active", "config_version": 1,
    }


with tempfile.TemporaryDirectory(prefix="ai-employee-business-flow-") as directory:
    temp = Path(directory)
    database = temp / "runtime.db"
    output = temp / "output"
    output.mkdir()
    fake_mcporter = temp / "mcporter"
    fake_mcporter.write_text("#!/bin/sh\nprintf '%s\\n' '{\"results\":[{\"title\":\"Research evidence\",\"url\":\"https://example.com/evidence\"}]}'\n")
    fake_mcporter.chmod(0o700)
    common = ("--repository-root", str(ROOT), "--database", str(database))
    run("employees-list", *common)
    for payload in (
        employee("researcher-001", "研究员工", "研究员"),
        employee("writer-002", "写作员工", "文档工程师"),
    ):
        run("employee-save", "--database", str(database), "--payload", json.dumps(payload, ensure_ascii=False))
    for agent_id, skill_id in (
        ("researcher-001", "web-search"),
        ("writer-002", "local-file-operations"),
    ):
        run("bind-skill", "--database", str(database), "--agent-id", agent_id, "--skill-id", skill_id, "--skill-version", "1.0.0")

    def node(identifier: str, role: str, agent_id: str, skill_id: str, goal: str) -> dict:
        return {
            "node_id": identifier, "role": role, "goal": goal,
            "suggested_agent_id": agent_id, "required_capabilities": [skill_id],
            "input_refs": [], "acceptance_criteria": [{"criterion_id": f"{identifier}-evaluation", "description": "产生通过 Runtime Evaluation 的 Deliverable", "evidence_type": "evaluation", "required": True}],
            "budget": {"max_input_tokens": 4000, "max_output_tokens": 2000, "max_tool_rounds": 4, "max_elapsed_ms": 120000},
            "failure_policy": "stop",
        }

    proposal = {
        "schema_version": "1.0.0", "proposal_id": "proposal-multi-employee",
        "title": "双员工发布方案", "objective": "搜索证据并生成 Markdown 发布方案",
        "overall_acceptance_criteria": [{"criterion_id": "final-evaluation", "description": "最终输出通过 Runtime Evaluation", "evidence_type": "evaluation", "required": True}],
        "coordinator_agent_id": "researcher-001",
        "nodes": [
            node("research", "executor", "researcher-001", "web-search", "搜索发布证据"),
            node("write", "executor", "writer-002", "local-file-operations", "生成发布方案文件"),
            node("finalize", "finalization", "researcher-001", "web-search", "验证最终交付"),
        ],
        "edges": [
            {"predecessor_node_id": "research", "successor_node_id": "write", "required": True},
            {"predecessor_node_id": "write", "successor_node_id": "finalize", "required": True},
        ],
        "assumptions": [], "risks": [], "questions_for_user": [],
    }
    proposal_json = json.dumps(proposal, ensure_ascii=False)

    # Fixed isolation/security evals: Scenario input cannot smuggle private context,
    # omit budget, expand Runtime authority, or add unknown fields.
    for mutation, expected in (
        ({"nodes": [{**proposal["nodes"][0], "input_refs": ["conversation:private-message"]}, *proposal["nodes"][1:]]}, "shared_context_forbidden"),
        ({"nodes": [{key: value for key, value in proposal["nodes"][0].items() if key != "budget"}, *proposal["nodes"][1:]]}, "missing field `budget`"),
        ({"permission_context": {"grant_ids": ["forged-root"]}}, "unknown field"),
    ):
        invalid = {**proposal, **mutation}
        reject("scenario-validate", "--database", str(database), "--input-json", json.dumps(invalid), expected=expected)

    # Worker cannot choose Runtime identity, authority, or budget fields.
    for field in ("child_task_id", "assignee", "permission_context", "budget"):
        forged_decision = {
            "schema_version": "1.0.0", "type": "complete", "output": {"summary": "forged"},
            "deliverable_candidates": [], "evidence_refs": [], field: "forged",
        }
        try:
            parse_decision(json.dumps(forged_decision))
        except ValueError as error:
            assert "decision_" in str(error)
        else:
            raise AssertionError(f"worker field was accepted: {field}")
    saved = run("scenario-save", "--database", str(database), "--scenario-id", "multi-employee", "--source", "manual", "--input-json", proposal_json, "--confirmed")
    plan = run("business-flow-plan", "--database", str(database), "--scenario-id", "multi-employee")
    flow = run("business-flow-start", "--database", str(database), "--flow-id", "flow-multi", "--scenario-id", "multi-employee", "--plan-hash", plan["plan_hash"])
    assert saved["sha256"] == plan["plan_hash"]
    assert [item["assignee_agent_id"] for item in flow["work_orders"]] == ["researcher-001", "writer-002", "researcher-001"]
    threads = run("task-thread-list", "--database", str(database))
    assert len(threads) == 1, "direct Business Flow must be visible in Work Library"
    assert threads[0]["root_task_id"] == flow["root_task_id"]
    assert {item["agent_id"] for item in threads[0]["room"]["participants"]} == {"researcher-001", "writer-002"}
    researcher_delete_check = run("employee-delete-check", "--database", str(database), "--employee-id", "researcher-001")
    assert researcher_delete_check["active_work_count"] == 1, "one visible Business Flow must count as one active work item"

    research = run(
        "business-flow-continue", *common, "--flow-id", "flow-multi",
        env={"AI_EMPLOYEE_FAKE_DECISION": json.dumps({
            "schema_version": "1.0.0", "type": "tool_call", "skill_id": "web-search",
            "tool_id": "agent-reach-tool", "action": "search_web",
            "arguments": {"query": "AI employee release", "num_results": 1},
            "rationale_summary": "collect evidence",
        })},
    )
    assert research["run"]["phase"] == "waiting_approval"
    waiting_projection = run("business-flow-status", "--database", str(database), "--flow-id", "flow-multi")
    assert waiting_projection["work_orders"][0]["status"] == "waiting_approval"
    assert waiting_projection["work_orders"][0]["run_id"] == research["run"]["run_id"]
    assert waiting_projection["work_orders"][0]["run_phase"] == "waiting_approval"
    assert waiting_projection["work_orders"][0]["action_id"]
    research_done = run(
        "continue-run", *common, "--run-id", research["run"]["run_id"],
        "--authorized-root", str(output), "--approve",
        env={
            "AI_EMPLOYEE_MCPORTER_PATH": str(fake_mcporter),
            "AI_EMPLOYEE_FAKE_DECISION": json.dumps({
                "schema_version": "1.0.0", "type": "complete",
                "output": {
                    "answer": "研究完成",
                    "sources": [{"title": "Research evidence", "url": "https://example.com/evidence"}],
                },
                "deliverable_candidates": [], "evidence_refs": ["https://example.com/evidence"],
            }),
        },
    )
    assert research_done["status"] == "succeeded"
    assert run("business-flow-status", "--database", str(database), "--flow-id", "flow-multi")["work_orders"][1]["status"] == "ready"
    with sqlite3.connect(database) as connection:
        before_recovery = tuple(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("agent_runs", "tool_executions", "handoffs"))
    assert run("recover-runtime", "--database", str(database))["result_unknown"] == 0
    with sqlite3.connect(database) as connection:
        after_recovery = tuple(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("agent_runs", "tool_executions", "handoffs"))
    assert before_recovery == after_recovery

    # Disabling a pending assignee must converge to waiting_user without claiming
    # the Child Task or appending a fake work_order.started event.
    with sqlite3.connect(database) as connection:
        runs_before_disable = connection.execute("SELECT count(*) FROM agent_runs").fetchone()[0]
        starts_before_disable = connection.execute(
            """SELECT count(*) FROM runtime_events
               WHERE task_id='flow-multi:root' AND event_type='work_order.started'
                 AND json_extract(payload_json,'$.work_order_id')='flow-multi:work:write'"""
        ).fetchone()[0]
    run("employee-set-status", "--database", str(database), "--employee-id", "writer-002", "--status", "disabled")
    disabled_projection = run("business-flow-continue", *common, "--flow-id", "flow-multi")
    assert disabled_projection["work_orders"][1]["status"] == "waiting_user"
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT status FROM tasks WHERE id='flow-multi:task:write'").fetchone() == ("pending",)
        assert connection.execute("SELECT count(*) FROM agent_runs").fetchone()[0] == runs_before_disable
        assert connection.execute(
            """SELECT count(*) FROM runtime_events
               WHERE task_id='flow-multi:root' AND event_type='work_order.started'
                 AND json_extract(payload_json,'$.work_order_id')='flow-multi:work:write'"""
        ).fetchone()[0] == starts_before_disable
        assert connection.execute(
            """SELECT count(*) FROM runtime_events
               WHERE task_id='flow-multi:root' AND event_type='business_flow.waiting_user'
                 AND json_extract(payload_json,'$.work_order_id')='flow-multi:work:write'
                 AND json_extract(payload_json,'$.reason')='assignee_unavailable'"""
        ).fetchone() == (1,)
    run("employee-set-status", "--database", str(database), "--employee-id", "writer-002", "--status", "active")
    assert run("business-flow-status", "--database", str(database), "--flow-id", "flow-multi")["work_orders"][1]["status"] == "ready"

    writing = run(
        "business-flow-continue", *common, "--flow-id", "flow-multi",
        env={"AI_EMPLOYEE_FAKE_DECISION": json.dumps({
            "schema_version": "1.0.0", "type": "tool_call", "skill_id": "local-file-operations",
            "tool_id": "file-tool", "action": "create_file",
            "arguments": {"path": "release.md", "content": "# 发布方案\\n\\n来源：https://example.com/evidence"},
            "rationale_summary": "write verified plan",
        })},
    )
    assert writing["run"]["phase"] == "waiting_approval"
    writing_done = run(
        "continue-run", *common, "--run-id", writing["run"]["run_id"],
        "--authorized-root", str(output), "--approve",
        env={"AI_EMPLOYEE_FAKE_DECISION": json.dumps({
            "schema_version": "1.0.0", "type": "complete",
            "output": {"summary": "文件已生成", "path": "release.md"},
            "deliverable_candidates": [], "evidence_refs": [],
        })},
    )
    assert writing_done["status"] == "succeeded"
    assert "example.com/evidence" in (output / "release.md").read_text()

    final_waiting = run(
        "business-flow-continue", *common, "--flow-id", "flow-multi",
        env={"AI_EMPLOYEE_FAKE_DECISION": json.dumps({
            "schema_version": "1.0.0", "type": "tool_call", "skill_id": "web-search",
            "tool_id": "agent-reach-tool", "action": "search_web",
            "arguments": {"query": "verify final release", "num_results": 1},
            "rationale_summary": "verify final delivery",
        })},
    )
    assert final_waiting["run"]["phase"] == "waiting_approval"
    final_run = run(
        "continue-run", *common, "--run-id", final_waiting["run"]["run_id"],
        "--authorized-root", str(output), "--approve",
        env={
            "AI_EMPLOYEE_MCPORTER_PATH": str(fake_mcporter),
            "AI_EMPLOYEE_FAKE_DECISION": json.dumps({
                "schema_version": "1.0.0", "type": "complete",
                "output": {
                    "answer": "最终交付已验证",
                    "sources": [{"title": "Research evidence", "url": "https://example.com/evidence"}],
                },
                "deliverable_candidates": [], "evidence_refs": ["https://example.com/evidence"],
            }),
        },
    )
    assert final_run["status"] == "succeeded"
    final = run("business-flow-status", "--database", str(database), "--flow-id", "flow-multi")
    assert final["status"] == "succeeded" and final["root_deliverable_id"]

    with sqlite3.connect(database) as connection:
        terminal_counts = tuple(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("agent_runs", "actions", "tool_executions", "deliverables", "artifacts", "handoffs"))
        writer_input = json.loads(connection.execute("SELECT input FROM tasks WHERE id='flow-multi:task:write'").fetchone()[0])
        assert writer_input["input_refs"] and all(ref.startswith("deliverable:") for ref in writer_input["input_refs"])
        assert "conversation" not in json.dumps(writer_input).lower()
        assert "memory" not in json.dumps(writer_input).lower()
        artifact = connection.execute("SELECT uri,verification_status FROM artifacts WHERE task_id='flow-multi:task:write'").fetchone()
        assert artifact == (str(output / "release.md"), "verified")
        assert connection.execute("SELECT count(*) FROM handoffs WHERE business_flow_id='flow-multi' AND acceptance='accepted'").fetchone()[0] == 2
        audit_text = " ".join(row[0] or "" for row in connection.execute("SELECT resource FROM audit_logs"))
        assert "private-message" not in audit_text and "forged-root" not in audit_text

    # Continuing an already terminal Flow is a projection-only operation.
    terminal_again = run("business-flow-continue", *common, "--flow-id", "flow-multi")
    assert terminal_again["status"] == "succeeded"
    with sqlite3.connect(database) as connection:
        assert terminal_counts == tuple(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("agent_runs", "actions", "tool_executions", "deliverables", "artifacts", "handoffs"))

print("business flow runtime checks: ok")
