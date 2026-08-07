#!/usr/bin/env python3
import json
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "target/debug/ai-employee-runtime"
PROPOSAL = ROOT / "contracts/examples/scenario-proposal.valid.json"


def run(*args: str, env: dict[str, str] | None = None) -> object:
    result = subprocess.run(
        [str(BINARY), *args], cwd=ROOT, text=True, capture_output=True, env=env
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr.strip())
    return json.loads(result.stdout)


def fail(*args: str) -> str:
    result = subprocess.run([str(BINARY), *args], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode != 0
    return result.stderr


with tempfile.TemporaryDirectory(prefix="ai-employee-scenario-") as directory:
    database = Path(directory) / "runtime.db"
    common = ("--database", str(database))
    run("employees-list", *common, "--repository-root", str(ROOT))
    proposal = PROPOSAL.read_text(encoding="utf-8")
    coordinator_env = dict(os.environ)
    coordinator_env["AI_EMPLOYEE_FAKE_SCENARIO_PROPOSAL"] = proposal
    proposed = run(
        "scenario-propose", *common,
        "--repository-root", str(ROOT),
        "--input-json", json.dumps({
            "objective": "形成经过验证的产品发布方案",
            "constraints": ["串行执行"],
            "overall_acceptance_criteria": [{"criterion_id": "final-evaluation", "description": "最终交付物通过 Runtime Evaluation", "evidence_type": "evaluation", "required": True}],
        }, ensure_ascii=False),
        env=coordinator_env,
    )
    assert proposed["persisted"] is False
    assert proposed["execution_order"] == ["research", "draft", "finalize"]
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT count(*) FROM scenario_versions").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM tasks").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM actions").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM tool_executions").fetchone()[0] == 0

    validation = run("scenario-validate", *common, "--input-json", proposal)
    assert validation["valid"] is True
    assert validation["execution_order"] == ["research", "draft", "finalize"]
    assert fail("scenario-save", *common, "--scenario-id", "launch", "--source", "manual", "--input-json", proposal).endswith("scenario_confirmation_required\n")

    first = run("scenario-save", *common, "--scenario-id", "launch", "--source", "manual", "--input-json", proposal, "--confirmed")
    second = run("scenario-save", *common, "--scenario-id", "launch", "--source", "manual", "--input-json", proposal, "--confirmed")
    assert first["version_id"] == second["version_id"]
    assert len(run("scenario-list", *common)) == 1
    assert run("scenario-get", *common, "--scenario-id", "launch")["sha256"] == validation["proposal_hash"]
    plan = run("business-flow-plan", *common, "--scenario-id", "launch")
    assert plan["plan_hash"] == validation["proposal_hash"]
    assert [item["node_id"] for item in plan["work_orders"]] == ["research", "draft", "finalize"]
    assert plan["work_orders"][1]["dependency_ids"] == ["research"]
    assert "plan_hash_stale" in fail("business-flow-start", *common, "--flow-id", "flow-stale", "--scenario-id", "launch", "--plan-hash", "0" * 64)
    started = run("business-flow-start", *common, "--flow-id", "flow-1", "--scenario-id", "launch", "--plan-hash", plan["plan_hash"])
    repeated = run("business-flow-start", *common, "--flow-id", "flow-1", "--scenario-id", "launch", "--plan-hash", plan["plan_hash"])
    assert started["root_task_id"] == repeated["root_task_id"]
    assert [item["status"] for item in started["work_orders"]] == ["ready", "waiting_dependency", "waiting_dependency"]
    assert run("business-flow-status", *common, "--flow-id", "flow-1")["scenario_sha256"] == validation["proposal_hash"]
    decision_env = dict(os.environ)
    decision_env["AI_EMPLOYEE_FAKE_DECISION"] = json.dumps({
        "schema_version": "1.0.0",
        "type": "complete",
        "output": {"summary": "verified"},
        "deliverable_candidates": [],
        "evidence_refs": [],
    })
    first_step = run(
        "business-flow-continue", *common, "--flow-id", "flow-1",
        "--repository-root", str(ROOT), env=decision_env,
    )
    assert [item["status"] for item in first_step["work_orders"]] == ["succeeded", "ready", "waiting_dependency"]
    with sqlite3.connect(database) as connection:
        counts_before_recovery = (
            connection.execute("SELECT count(*) FROM agent_runs").fetchone()[0],
            connection.execute("SELECT count(*) FROM handoffs").fetchone()[0],
            connection.execute("SELECT count(*) FROM tool_executions").fetchone()[0],
        )
    recovery = run("recover-runtime", *common)
    assert recovery == {"schema_version": "1.0", "safe_failures": 0, "result_unknown": 0}
    with sqlite3.connect(database) as connection:
        counts_after_recovery = (
            connection.execute("SELECT count(*) FROM agent_runs").fetchone()[0],
            connection.execute("SELECT count(*) FROM handoffs").fetchone()[0],
            connection.execute("SELECT count(*) FROM tool_executions").fetchone()[0],
        )
    assert counts_before_recovery == counts_after_recovery
    second_step = run(
        "business-flow-continue", *common, "--flow-id", "flow-1",
        "--repository-root", str(ROOT), env=decision_env,
    )
    assert [item["status"] for item in second_step["work_orders"]] == ["succeeded", "succeeded", "ready"]
    completed = run(
        "business-flow-continue", *common, "--flow-id", "flow-1",
        "--repository-root", str(ROOT), env=decision_env,
    )
    assert completed["status"] == "succeeded"
    assert completed["root_deliverable_id"]
    assert [item["status"] for item in completed["work_orders"]] == ["succeeded", "succeeded", "succeeded"]
    assert len({item["child_task_id"] for item in completed["work_orders"]}) == 3
    listed_flows = run("business-flow-list", *common)
    assert [item["business_flow_id"] for item in listed_flows] == ["flow-1"]

    cancellable = run("business-flow-start", *common, "--flow-id", "flow-cancel", "--scenario-id", "launch", "--plan-hash", plan["plan_hash"])
    cancelled = run("cancel-task", *common, "--task-id", cancellable["root_task_id"])
    assert cancelled["status"] == "cancelled"
    assert run("business-flow-status", *common, "--flow-id", "flow-cancel")["status"] == "cancelled"
    assert run("scenario-disable", *common, "--scenario-id", "launch")["status"] == "disabled"

    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT count(*) FROM scenario_versions").fetchone()[0] == 1
        assert connection.execute("SELECT count(*) FROM tasks").fetchone()[0] == 8
        assert connection.execute("SELECT count(*) FROM agent_runs").fetchone()[0] == 3
        assert connection.execute("SELECT count(*) FROM business_flow_outputs").fetchone()[0] == 1
        root_events = [row[0] for row in connection.execute(
            "SELECT event_type FROM runtime_events WHERE task_id=? ORDER BY sequence",
            (started["root_task_id"],),
        )]
        assert "business_flow.created" in root_events
        assert "work_order.started" in root_events
        assert "handoff.accepted" in root_events
        assert "business_flow.completed" in root_events
        assert root_events[-1] == "task_succeeded"
        assert connection.execute("SELECT count(*) FROM actions").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM tool_executions").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM business_flows").fetchone()[0] == 2
        assert connection.execute("SELECT count(*) FROM tasks WHERE status='cancelled'").fetchone()[0] == 4

print("scenario runtime checks: ok")
