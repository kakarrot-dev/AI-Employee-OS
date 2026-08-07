import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TARGET_DIR = Path(os.environ.get("CARGO_TARGET_DIR", ROOT / "target"))
BINARY = TARGET_DIR / "debug" / "ai-employee-runtime"


def run(database: Path, *arguments: str) -> dict:
    result = subprocess.run(
        [BINARY, *arguments, "--database", database],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "runtime.db"
    listed = run(database, "employees-list", "--repository-root", str(ROOT))
    assert [item["id"] for item in listed["employees"]] == ["ai-product-manager"]
    alex = listed["employees"][0]
    assert "把模糊需求转化为可执行的产品方案" in alex["base_prompt"]
    assert alex["soul"]
    assert "mission" not in alex
    assert "responsibilities" not in alex
    assert "boundaries" not in alex

    alex_prompt = run(database, "effective-prompt", "--employee-id", "ai-product-manager")
    assert "把模糊需求转化为可执行的产品方案" in alex_prompt["prompt"]
    assert "用户价值优先" in alex_prompt["prompt"]
    assert "使命：" not in alex_prompt["prompt"]
    assert "<instructions>" not in alex_prompt["prompt"]

    caps = run(database, "capabilities", "--repository-root", str(ROOT))
    assert caps["skills_installed"] == 2
    assert caps["tools_installed"] == 2
    assert caps["tasks_enabled"] is True
    assert caps["can_create_packages"] is False
    skill_ids = {item["id"] for item in run(database, "skills-list", "--repository-root", str(ROOT))["skills"]}
    tools = run(database, "tools-list", "--repository-root", str(ROOT))["tools"]
    by_id = {item["id"]: item for item in tools}
    tool_ids = set(by_id)
    assert skill_ids == {"local-file-operations", "web-search"}
    assert tool_ids == {"file-tool", "agent-reach-tool"}
    file_tool = by_id["file-tool"]
    assert "本地文件" in file_tool.get("documentation", "")
    assert {action["name"] for action in file_tool["actions"]} == {"read_file", "create_file", "edit_file"}
    assert next(action for action in file_tool["actions"] if action["name"] == "create_file")["risk_level"] == 2
    reach = by_id["agent-reach-tool"]
    assert "Agent Reach" in reach.get("documentation", "")
    assert reach["actions"][0]["name"] == "search_web"
    assert reach["actions"][0]["required_permissions"] == ["network.search"]
    assert "data_sources" in reach

    alex_skills = {
        item["id"]
        for item in run(
            database,
            "skills-list",
            "--repository-root",
            str(ROOT),
            "--agent-id",
            "ai-product-manager",
        )["skills"]
    }
    assert alex_skills == {"local-file-operations", "web-search"}
    unbound = run(
        database,
        "unbind-skill",
        "--agent-id",
        "ai-product-manager",
        "--skill-id",
        "web-search",
    )
    assert unbound["unbound"] is True
    alex_skills_after = {
        item["id"]
        for item in run(
            database,
            "skills-list",
            "--agent-id",
            "ai-product-manager",
        )["skills"]
    }
    assert "web-search" not in alex_skills_after
    rebound = run(
        database,
        "bind-skill",
        "--agent-id",
        "ai-product-manager",
        "--skill-id",
        "web-search",
        "--skill-version",
        "1.0.0",
    )
    assert rebound["bound"] is True

    imported = run(
        database,
        "knowledge-import",
        "--id",
        "src-prd",
        "--uri",
        "file://sample-prd.md",
        "--source-type",
        "seed_document",
        "--title",
        "示例 PRD",
        "--content",
        "本地关键词检索基线：验收标准必须可执行。",
    )
    assert imported["imported"] is True
    assert imported["embedding_ref"] is None
    sources = run(database, "knowledge-list")["sources"]
    assert sources[0]["id"] == "src-prd"
    assert sources[0]["index_status"] == "indexed"
    assert "验收标准" in sources[0]["content"]
    hits = run(database, "knowledge-search", "--query", "验收标准", "--limit", "3")
    assert hits["query_mode"] == "keyword"
    assert hits["hits"]
    assert "验收标准" in hits["hits"][0]["content"]
    empty = run(database, "knowledge-search", "--query", "   ", "--limit", "3")
    assert empty["hits"] == []

    long_identity = "身份正文：" + ("需求分析与边界说明。" * 60)
    assert len(long_identity) > 500
    luna = {
        "schema_version": "1.0",
        "id": "content-operator",
        "name": "Luna",
        "role": "AI 内容运营",
        "department": "运营部",
        "soul": ["准确优先", "不虚构来源"],
        "persona": {
            "communication": {"style": "concise", "tone": "professional", "response": "conclusion_first"},
            "thinking": {"approach": "user_value_first", "evidence": "cite_sources"},
            "decision": {"priorities": ["accuracy"]},
            "habit": {"output_format": "markdown", "include_acceptance_criteria": True},
        },
        "base_prompt": long_identity,
        "status": "active",
        "config_version": 1,
    }
    saved = run(database, "employee-save", "--payload", json.dumps(luna, ensure_ascii=False))
    assert saved["saved"] is True
    listed = run(database, "employees-list")
    luna_row = next(item for item in listed["employees"] if item["id"] == "content-operator")
    assert luna_row["base_prompt"] == long_identity
    assert luna_row["soul"] == ["准确优先", "不虚构来源"]
    assert "mission" not in luna_row
    assert "responsibilities" not in luna_row
    assert "boundaries" not in luna_row
    assert luna_row["config_version"] == 1

    prompt = run(database, "effective-prompt", "--employee-id", "content-operator")
    assert prompt["config_version"] == 1
    assert "Luna" in prompt["prompt"]
    assert "准确优先" in prompt["prompt"]
    assert long_identity in prompt["prompt"]
    assert "旧使命" not in prompt["prompt"]

    updated = dict(luna)
    updated["base_prompt"] = "更新后的身份提示词：只讨论内容口径。"
    updated["soul"] = ["更新后的灵魂"]
    run(database, "employee-save", "--payload", json.dumps(updated, ensure_ascii=False))
    prompt_after = run(database, "effective-prompt", "--employee-id", "content-operator")
    assert prompt_after["config_version"] == 2
    assert "更新后的身份提示词：只讨论内容口径。" in prompt_after["prompt"]
    assert "更新后的灵魂" in prompt_after["prompt"]
    assert long_identity not in prompt_after["prompt"]

    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO conversations VALUES ('conversation_luna','content-operator','测试','active','t','t')"
        )
    disposition = run(database, "employee-delete", "--employee-id", "content-operator")
    assert disposition["disposition"] == "disabled"
    assert (
        next(item for item in run(database, "employees-list")["employees"] if item["id"] == "content-operator")[
            "status"
        ]
        == "disabled"
    )

    deleted = run(database, "employee-delete", "--employee-id", "ai-product-manager")
    assert deleted["disposition"] == "deleted"
    after_delete = run(database, "employees-list", "--repository-root", str(ROOT))
    assert all(item["id"] != "ai-product-manager" for item in after_delete["employees"])
    with sqlite3.connect(database) as connection:
        flag = connection.execute(
            "SELECT value FROM runtime_flags WHERE key='default_agent_dismissed'"
        ).fetchone()
        assert flag == ("1",)

with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "runtime-disabled.db"
    listed = run(database, "employees-list", "--repository-root", str(ROOT))
    assert any(item["id"] == "ai-product-manager" for item in listed["employees"])
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE agents SET status='disabled' WHERE id='ai-product-manager'"
        )
        connection.commit()
    listed_after = run(database, "employees-list", "--repository-root", str(ROOT))
    alex = next(item for item in listed_after["employees"] if item["id"] == "ai-product-manager")
    assert alex["status"] == "disabled"

print("employee runtime checks: ok")
