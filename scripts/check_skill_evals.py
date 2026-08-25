#!/usr/bin/env python3
from pathlib import Path
import json
import os
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime/python-agent"))

from app.eval_runner import load_cases

BINARY = ROOT / "target/debug/ai-employee-runtime"


def run(database: Path, *arguments: str, env: dict[str, str] | None = None) -> dict:
    result = subprocess.run(
        [str(BINARY), *arguments, "--database", str(database)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env={**os.environ, **(env or {})},
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr.strip())
    return json.loads(result.stdout)


def main() -> None:
    suites = sorted((ROOT / "packages/skills").glob("*/evals/cases.json"))
    if not suites:
        raise SystemExit("no Skill eval suites found")
    if not BINARY.is_file():
        raise SystemExit("ai-employee-runtime must be built before Skill evals")
    total = 0
    with tempfile.TemporaryDirectory(prefix="ai-employee-skill-evals-") as directory:
        root = Path(directory)
        database = root / "runtime.db"
        output = root / "output"
        output.mkdir()
        run(database, "employees-list", "--repository-root", str(ROOT))
        employees = {
            "local-file-operations": "document-writer",
            "web-search": "data-researcher",
        }
        for path in suites:
            skill_id = path.parent.parent.name
            cases = load_cases(path)
            for case in cases:
                probe = case.expected_tool or case.probe_tool
                assert probe is not None
                tool_id, action = probe.split(".", 1)
                decision = {
                    "schema_version": "1.0.0",
                    "type": "tool_call",
                    "skill_id": skill_id,
                    "tool_id": tool_id,
                    "action": action,
                    "arguments": case.tool_arguments,
                    "rationale_summary": f"eval:{case.id}",
                }
                requested = run(
                    database,
                    "run-skill",
                    "--repository-root",
                    str(ROOT),
                    "--agent-id",
                    employees[skill_id],
                    "--skill-id",
                    skill_id,
                    "--input-json",
                    json.dumps(case.input, ensure_ascii=False),
                    env={"AI_EMPLOYEE_FAKE_DECISION": json.dumps(decision, ensure_ascii=False)},
                )
                assert requested["phase"] == "waiting_approval"
                with sqlite3.connect(database) as connection:
                    stored = connection.execute(
                        "SELECT input_json FROM actions WHERE id=?",
                        (requested["action_id"],),
                    ).fetchone()[0]
                stored_input = json.loads(stored)
                assert stored_input["skill_id"] == skill_id
                assert stored_input["action"] == action
                assert "payload_ref" in stored_input, "sensitive Tool arguments must not be stored inline"
                if case.expected_error:
                    completed = run(
                        database,
                        "continue-run",
                        "--repository-root",
                        str(ROOT),
                        "--run-id",
                        requested["run_id"],
                        "--authorized-root",
                        str(output),
                        "--approve",
                    )
                    assert completed["status"] == "failed"
                    assert completed["reason"] == case.expected_error
                total += 1
            print(f"{skill_id}: {len(cases)} executable eval cases passed")
    print(f"skill eval runtime: {len(suites)} suites, {total} cases passed")


if __name__ == "__main__":
    main()
