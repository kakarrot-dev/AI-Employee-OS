import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "target/debug/ai-employee-runtime"


def run(database: Path, *arguments: str) -> dict:
    result = subprocess.run([BINARY, *arguments, "--database", database], cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "runtime.db"
    listed = run(database, "employees-list", "--repository-root", str(ROOT))
    assert [item["id"] for item in listed["employees"]] == ["ai-product-manager"]

    luna = {
        "schema_version": "1.0", "id": "content-operator", "name": "Luna", "role": "AI 内容运营",
        "department": "运营部", "mission": "把内容素材整理成可发布草稿。",
        "responsibilities": ["内容整理"], "boundaries": ["不虚构来源"], "soul": ["准确优先"],
        "persona": {"communication": {"style": "concise", "tone": "professional", "response": "conclusion_first"},
                    "thinking": {"approach": "evidence_first", "evidence": "cite_sources"},
                    "decision": {"priorities": ["accuracy"]},
                    "habit": {"output_format": "markdown", "include_acceptance_criteria": True}},
        "base_prompt": "简洁、准确地协助用户整理内容。", "status": "active", "config_version": 1,
    }
    saved = run(database, "employee-save", "--payload", json.dumps(luna, ensure_ascii=False))
    assert saved["saved"] is True
    listed = run(database, "employees-list")
    assert {item["id"] for item in listed["employees"]} == {"ai-product-manager", "content-operator"}
    prompt = run(database, "effective-prompt", "--employee-id", "content-operator")
    assert "Luna" in prompt["prompt"] and "准确优先" in prompt["prompt"]

    with sqlite3.connect(database) as connection:
        connection.execute("INSERT INTO conversations VALUES ('conversation_luna','content-operator','测试','active','t','t')")
    disposition = run(database, "employee-delete", "--employee-id", "content-operator")
    assert disposition["disposition"] == "disabled"
    assert next(item for item in run(database, "employees-list")["employees"] if item["id"] == "content-operator")["status"] == "disabled"

print("employee runtime checks: ok")
