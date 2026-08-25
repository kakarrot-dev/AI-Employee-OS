#!/usr/bin/env python3
import json
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "target/debug/ai-employee-runtime"


def run(*args: str, env: dict[str, str] | None = None) -> dict:
    result = subprocess.run(
        [str(BINARY), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env={**os.environ, **(env or {})},
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr.strip())
    return json.loads(result.stdout)


def run_failure(*args: str, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        [str(BINARY), *args], cwd=ROOT, text=True, capture_output=True,
        env={**os.environ, **(env or {})}, check=False,
    )
    assert result.returncode != 0
    return result.stderr.strip()


with tempfile.TemporaryDirectory(prefix="ai-employee-generic-") as directory:
    root = Path(directory)
    database = root / "runtime.db"
    output = root / "output"
    output.mkdir()
    fake_mcporter = root / "mcporter"
    fake_mcporter.write_text("#!/bin/sh\nprintf '%s\\n' '{\"results\":[{\"title\":\"AI Employee\",\"url\":\"https://example.com/ai-employee\"}]}'\n")
    fake_mcporter.chmod(0o700)
    common = ("--repository-root", str(ROOT), "--database", str(database))
    run("employees-list", *common)

    worker = {
        "schema_version": "1.0",
        "id": "runtime-test-worker",
        "name": "Runtime Test Worker",
        "role": "通用执行员工",
        "department": "测试",
        "soul": ["忠实执行契约"],
        "persona": {
            "communication": {"style": "concise"},
            "thinking": {"approach": "evidence_first"},
            "decision": {"priorities": ["accuracy"]},
            "habit": {"output_format": "markdown"},
        },
        "base_prompt": "按绑定 Skill 工作，不假设业务身份。",
        "status": "active",
        "config_version": 1,
    }
    run(
        "employee-save",
        "--database",
        str(database),
        "--payload",
        json.dumps(worker, ensure_ascii=False),
    )
    run(
        "bind-skill",
        "--database",
        str(database),
        "--agent-id",
        "runtime-test-worker",
        "--skill-id",
        "local-file-operations",
        "--skill-version",
        "1.0.0",
    )
    run(
        "bind-skill",
        "--database",
        str(database),
        "--agent-id",
        "runtime-test-worker",
        "--skill-id",
        "web-search",
        "--skill-version",
        "1.0.0",
    )

    requested = run(
        "run-skill",
        *common,
        "--agent-id",
        "runtime-test-worker",
        "--skill-id",
        "local-file-operations",
        "--input-json",
        '{"text":"创建 note.txt，内容是 hello"}',
        env={
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"local-file-operations","tool_id":"file-tool","action":"create_file","arguments":{"path":"note.txt","content":"hello"},"rationale_summary":"create file"}'
        },
    )
    assert requested["phase"] == "waiting_approval"

    protocol_error = run_failure(
        "run-skill",
        *common,
        "--agent-id",
        "runtime-test-worker",
        "--skill-id",
        "local-file-operations",
        "--input-json",
        '{"text":"invalid protocol retry"}',
        env={"AI_EMPLOYEE_FAKE_DECISION": "not-json"},
    )
    assert "decision_schema_invalid" in protocol_error
    with sqlite3.connect(database) as connection:
        retry_run = connection.execute(
            "SELECT id,model_turns_used,stop_reason FROM agent_runs ORDER BY rowid DESC LIMIT 1"
        ).fetchone()
        assert retry_run[1] == 2
        assert "decision_schema_invalid" in retry_run[2]
        assert connection.execute(
            "SELECT count(*) FROM run_observations WHERE run_id=? AND kind='system'",
            (retry_run[0],),
        ).fetchone()[0] == 1
    completed = run(
        "continue-run",
        *common,
        "--run-id",
        requested["run_id"],
        "--authorized-root",
        str(output),
        "--approve",
        env={
            "AI_EMPLOYEE_FAKE_DECISION": '{"type":"complete","summary":"已创建文件","path":"note.txt"}'
        },
    )
    assert completed["status"] == "succeeded"
    assert (output / "note.txt").read_text() == "hello"

    search = run(
        "chat-send",
        *common,
        "--conversation-id",
        "conversation_search_gate",
        "--employee-id",
        "runtime-test-worker",
        "--input",
        "查找 Rust 官方文档",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_FAKE_INTENT": '{"intent":"task","confidence":0.99,"skill_id":"web-search"}',
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"web-search","tool_id":"agent-reach-tool","action":"search_web","arguments":{"query":"Rust 官方文档","num_results":1},"rationale_summary":"search"}',
        },
    )
    assert search["run_phase"] == "waiting_approval"
    with sqlite3.connect(database) as connection:
        toolset = json.loads(connection.execute(
            "SELECT snapshot_json FROM run_snapshots WHERE run_id=? AND snapshot_type='toolset'",
            (search["run_id"],),
        ).fetchone()[0])
        capability_set = json.loads(connection.execute(
            "SELECT snapshot_json FROM run_snapshots WHERE run_id=? AND snapshot_type='capability_set'",
            (search["run_id"],),
        ).fetchone()[0])
    assert {item["id"] for item in capability_set["skills"]} == {
        "local-file-operations", "web-search"
    }
    assert {item["skill_id"] for item in toolset["tools"]} == {
        "local-file-operations", "web-search"
    }
    search_tool = next(item for item in toolset["tools"] if item["skill_id"] == "web-search")
    search_action = search_tool["actions"][0]
    assert search_action["name"] == "search_web"
    assert search_tool["max_calls"] == 1
    assert "num_results" in search_action["input_schema"]["properties"]
    assert "max_results" not in search_action["input_schema"]["properties"]
    rejected = run(
        "continue-run",
        *common,
        "--run-id",
        search["run_id"],
        "--authorized-root",
        str(output),
        "--reject",
    )
    assert rejected["status"] == "failed"

    cross_skill = run(
        "chat-send",
        *common,
        "--conversation-id",
        "conversation_cross_skill",
        "--employee-id",
        "runtime-test-worker",
        "--input",
        "先搜索资料，再生成本地 Markdown 文档",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_FAKE_INTENT": '{"intent":"task","confidence":0.99}',
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"web-search","tool_id":"agent-reach-tool","action":"search_web","arguments":{"query":"AI employee","num_results":1},"rationale_summary":"search evidence"}',
        },
    )
    assert cross_skill["run_phase"] == "waiting_approval"
    switched = run(
        "continue-run",
        *common,
        "--run-id",
        cross_skill["run_id"],
        "--authorized-root",
        str(output),
        "--approve",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_MCPORTER_PATH": str(fake_mcporter),
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"local-file-operations","tool_id":"file-tool","action":"create_file","arguments":{"path":"cross-skill.md","content":"# AI Employee Research\\n\\nSource: https://example.com/ai-employee"},"rationale_summary":"write researched document"}',
        },
    )
    assert switched["phase"] == "waiting_approval"
    completed_cross_skill = run(
        "continue-run",
        *common,
        "--run-id",
        cross_skill["run_id"],
        "--authorized-root",
        str(output),
        "--approve",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_FAKE_DECISION": '{"type":"complete","summary":"research document created","path":"cross-skill.md"}',
        },
    )
    assert completed_cross_skill["status"] == "succeeded"
    assert "AI Employee Research" in (output / "cross-skill.md").read_text()
    with sqlite3.connect(database) as connection:
        used_skills = {
            json.loads(row[0])["skill_id"] for row in connection.execute(
                "SELECT input_json FROM actions WHERE task_id=?", (cross_skill["task_id"],)
            )
        }
        artifact = connection.execute(
            "SELECT uri,verification_status FROM artifacts WHERE task_id=?",
            (cross_skill["task_id"],),
        ).fetchone()
    assert used_skills == {"local-file-operations", "web-search"}
    assert artifact == (str(output / "cross-skill.md"), "verified")

    repeated_search = run(
        "chat-send",
        *common,
        "--conversation-id",
        "conversation_repeated_search",
        "--employee-id",
        "runtime-test-worker",
        "--input",
        "先搜索资料，再生成本地 Markdown 文档",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_FAKE_INTENT": '{"intent":"task","confidence":0.99}',
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"web-search","tool_id":"agent-reach-tool","action":"search_web","arguments":{"query":"AI employee","num_results":1},"rationale_summary":"first search"}',
        },
    )
    repeated_error = run_failure(
        "continue-run",
        *common,
        "--run-id",
        repeated_search["run_id"],
        "--authorized-root",
        str(output),
        "--approve",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_MCPORTER_PATH": str(fake_mcporter),
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"web-search","tool_id":"agent-reach-tool","action":"search_web","arguments":{"query":"AI employee again","num_results":1},"rationale_summary":"repeat search"}',
        },
    )
    assert "skill_tool_budget_exceeded" in repeated_error
    with sqlite3.connect(database) as connection:
        repeated_actions = connection.execute(
            "SELECT count(*) FROM actions WHERE task_id=?", (repeated_search["task_id"],)
        ).fetchone()[0]
        repeated_stop_reason = connection.execute(
            "SELECT stop_reason FROM agent_runs WHERE id=?", (repeated_search["run_id"],)
        ).fetchone()[0]
    assert repeated_actions == 1
    assert repeated_stop_reason == "skill_tool_budget_exceeded"

    mismatched = run(
        "chat-send",
        *common,
        "--conversation-id",
        "conversation_capability_mismatch",
        "--employee-id",
        "runtime-test-worker",
        "--input",
        "创建一个文件",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_FAKE_INTENT": '{"intent":"task","confidence":0.99}',
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","skill_id":"web-search","tool_id":"file-tool","action":"create_file","arguments":{"path":"forbidden.txt","content":"no"},"rationale_summary":"invalid cross-skill claim"}',
        },
    )
    assert mismatched["routed_to"] == "task"
    assert not (output / "forbidden.txt").exists()
    with sqlite3.connect(database) as connection:
        mismatch_task = connection.execute(
            "SELECT id,status FROM tasks ORDER BY rowid DESC LIMIT 1"
        ).fetchone()
        assert mismatch_task[1] == "failed"
        assert connection.execute(
            "SELECT count(*) FROM actions WHERE task_id=?", (mismatch_task[0],)
        ).fetchone()[0] == 0

print("generic runtime checks: ok")
