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


with tempfile.TemporaryDirectory(prefix="ai-employee-generic-") as directory:
    root = Path(directory)
    database = root / "runtime.db"
    output = root / "output"
    output.mkdir()
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
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","tool_id":"file-tool","action":"create_file","arguments":{"path":"note.txt","content":"hello"},"rationale_summary":"create file"}'
        },
    )
    assert requested["phase"] == "waiting_approval"
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
        "ai-product-manager",
        "--input",
        "查找 Rust 官方文档",
        env={
            "DEEPSEEK_API_KEY": "test",
            "AI_EMPLOYEE_FAKE_INTENT": '{"intent":"task","confidence":0.99,"skill_id":"web-search"}',
            "AI_EMPLOYEE_FAKE_DECISION": '{"schema_version":"1.0.0","type":"tool_call","tool_id":"agent-reach-tool","action":"search_web","arguments":{"query":"Rust 官方文档","num_results":1},"rationale_summary":"search"}',
        },
    )
    assert search["run_phase"] == "waiting_approval"
    with sqlite3.connect(database) as connection:
        toolset = json.loads(connection.execute(
            "SELECT snapshot_json FROM run_snapshots WHERE run_id=? AND snapshot_type='toolset'",
            (search["run_id"],),
        ).fetchone()[0])
    search_action = toolset["tools"][0]["actions"][0]
    assert search_action["name"] == "search_web"
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

print("generic runtime checks: ok")
