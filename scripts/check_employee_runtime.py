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


def run_failed(database: Path, *arguments: str) -> str:
    result = subprocess.run(
        [BINARY, *arguments, "--database", database],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode != 0
    return result.stderr


with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "runtime.db"
    listed = run(database, "employees-list", "--repository-root", str(ROOT))
    employees_by_id = {item["id"]: item for item in listed["employees"]}
    assert set(employees_by_id) == {"data-researcher", "document-writer"}

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

    specialist_expectations = {
        "data-researcher": ("web-search", "只使用网络搜索能力", "来源可追溯"),
        "document-writer": ("local-file-operations", "只使用本地文件操作能力", "忠实高于扩写"),
    }
    for employee_id, (expected_skill, identity_fragment, soul_fragment) in specialist_expectations.items():
        specialist_skills = {
            item["id"]
            for item in run(
                database,
                "skills-list",
                "--repository-root",
                str(ROOT),
                "--agent-id",
                employee_id,
            )["skills"]
        }
        assert specialist_skills == {expected_skill}
        specialist = employees_by_id[employee_id]
        assert identity_fragment in specialist["base_prompt"]
        assert any(soul_fragment in item for item in specialist["soul"])

    generalist = {
        "schema_version": "1.0",
        "id": "generalist",
        "name": "通用员工",
        "role": "通用执行者",
        "department": "测试",
        "soul": ["忠实执行"],
        "persona": {
            "communication": {"style": "concise"},
            "thinking": {"approach": "evidence_first"},
            "decision": {"priorities": ["accuracy"]},
            "habit": {"output_format": "markdown"},
        },
        "base_prompt": "按已绑定 Skill 工作。",
        "status": "active",
        "config_version": 1,
    }
    run(database, "employee-save", "--payload", json.dumps(generalist, ensure_ascii=False))
    for skill_id in ("local-file-operations", "web-search"):
        run(
            database,
            "bind-skill",
            "--agent-id",
            "generalist",
            "--skill-id",
            skill_id,
            "--skill-version",
            "1.0.0",
        )
    unbound = run(
        database,
        "unbind-skill",
        "--agent-id",
        "generalist",
        "--skill-id",
        "web-search",
    )
    assert unbound["unbound"] is True
    generalist_skills_after = {
        item["id"]
        for item in run(
            database,
            "skills-list",
            "--agent-id",
            "generalist",
        )["skills"]
    }
    assert "web-search" not in generalist_skills_after
    rebound = run(
        database,
        "bind-skill",
        "--agent-id",
        "generalist",
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

    disabled = run(
        database,
        "employee-set-status",
        "--employee-id",
        "content-operator",
        "--status",
        "disabled",
    )
    assert disabled["status"] == "disabled"
    assert next(
        item for item in run(database, "employees-list")["employees"] if item["id"] == "content-operator"
    )["status"] == "disabled"
    enabled = run(
        database,
        "employee-set-status",
        "--employee-id",
        "content-operator",
        "--status",
        "active",
    )
    assert enabled["status"] == "active"

    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO conversations VALUES ('conversation_luna','content-operator','测试','active','t','t')"
        )
        connection.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('luna-finished','content-operator','历史工作','succeeded','t1','t2')"
        )
        connection.execute(
            "INSERT INTO audit_logs VALUES ('audit-luna','content-operator','luna-finished',NULL,'task.complete','luna-finished','succeeded','t2')"
        )
        connection.execute(
            "INSERT INTO scenario_definitions VALUES ('scenario-luna','历史场景','', 'active',1,'t1','t1')"
        )
        connection.execute(
            "INSERT INTO scenario_versions VALUES ('scenario-luna:v1','scenario-luna',1,'manual',?, ?,NULL,'t1','t1')",
            ('{"owner":"content-operator"}', "b" * 64),
        )
        connection.execute(
            """INSERT INTO scenario_nodes(
                 id,scenario_version_id,node_key,role,goal,assignee_agent_id,
                 required_capabilities_json,input_refs_json,acceptance_json,budget_json,
                 failure_policy,position
               ) VALUES (
                 'scenario-luna:v1:write','scenario-luna:v1','write','executor','撰写内容',
                 'content-operator','[]','[]','[]','{}','stop',0
               )"""
        )
        connection.execute(
            "INSERT INTO task_threads(id,title,status,current_revision,created_at,updated_at) VALUES ('thread-luna','历史工作','succeeded',1,'t1','t2')"
        )
        connection.execute(
            "INSERT INTO task_proposals(id,thread_id,revision,status,proposal_json,proposal_sha256,expires_at,confirmed_at,created_at,updated_at) VALUES ('proposal-luna','thread-luna',1,'materialized','{}',?,'9','t1','t1','t2')",
            ("a" * 64,),
        )
        connection.execute(
            "INSERT INTO task_thread_task_bindings(thread_id,task_id,proposal_id,binding_role,created_at) VALUES ('thread-luna','luna-finished','proposal-luna','single','t1')"
        )
        connection.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('luna-running','content-operator','进行中工作','running','t2','t2')"
        )
        connection.commit()
    blocked = run(database, "employee-delete-check", "--employee-id", "content-operator")
    assert blocked["deletable"] is False
    assert blocked["active_work_count"] == 1
    assert "employee_delete_blocked_active_work" in run_failed(
        database, "employee-delete", "--employee-id", "content-operator"
    )
    assert any(item["id"] == "content-operator" for item in run(database, "employees-list")["employees"])
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE tasks SET status='cancelled' WHERE id='luna-running'")
        connection.commit()
    deletable = run(database, "employee-delete-check", "--employee-id", "content-operator")
    assert deletable["deletable"] is True
    disposition = run(database, "employee-delete", "--employee-id", "content-operator")
    assert disposition["disposition"] == "deleted"
    assert all(item["id"] != "content-operator" for item in run(database, "employees-list")["employees"])
    historical_thread = run(database, "task-thread-get", "--thread-id", "thread-luna")
    assert historical_thread["status"] == "succeeded"
    assert historical_thread["room"]["participants"] == [
        {
            "agent_id": "content-operator",
            "avatar_path": None,
            "name": "Luna",
            "role": "AI 内容运营",
            "status": "succeeded",
        }
    ]
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT count(*) FROM agents WHERE id='content-operator'").fetchone() == (0,)
        assert connection.execute(
            "SELECT count(*) FROM agents WHERE id='system:historical-employee' AND status='disabled'"
        ).fetchone() == (1,)
        assert connection.execute(
            "SELECT historical_agent_id,display_name,role FROM task_participant_snapshots WHERE task_id='luna-finished'"
        ).fetchone() == ("content-operator", "Luna", "AI 内容运营")
        assert connection.execute("SELECT agent_id FROM tasks WHERE id='luna-finished'").fetchone() == (
            "system:historical-employee",
        )
        assert connection.execute(
            "SELECT assignee_agent_id,historical_agent_id FROM scenario_nodes WHERE id='scenario-luna:v1:write'"
        ).fetchone() == ("system:historical-employee", "content-operator")
        assert connection.execute(
            "SELECT status FROM scenario_definitions WHERE id='scenario-luna'"
        ).fetchone() == ("disabled",)
        assert connection.execute(
            "SELECT definition_json,sha256 FROM scenario_versions WHERE id='scenario-luna:v1'"
        ).fetchone() == ('{"owner":"content-operator"}', "b" * 64)
        assert connection.execute(
            "SELECT agent_id FROM audit_logs WHERE id='audit-luna'"
        ).fetchone() == (None,)
        assert connection.execute("SELECT count(*) FROM conversations WHERE agent_id='content-operator'").fetchone() == (0,)

    deleted = run(database, "employee-delete", "--employee-id", "data-researcher")
    assert deleted["disposition"] == "deleted"
    after_delete = run(database, "employees-list", "--repository-root", str(ROOT))
    assert all(item["id"] != "data-researcher" for item in after_delete["employees"])
    with sqlite3.connect(database) as connection:
        flag = connection.execute(
            "SELECT value FROM runtime_flags WHERE key='builtin_agent_dismissed:data-researcher'"
        ).fetchone()
        assert flag == ("1",)

with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "runtime-disabled.db"
    listed = run(database, "employees-list", "--repository-root", str(ROOT))
    assert any(item["id"] == "document-writer" for item in listed["employees"])
    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE agents SET status='disabled' WHERE id='document-writer'"
        )
        connection.commit()
    listed_after = run(database, "employees-list", "--repository-root", str(ROOT))
    writer = next(item for item in listed_after["employees"] if item["id"] == "document-writer")
    assert writer["status"] == "disabled"

print("employee runtime checks: ok")
