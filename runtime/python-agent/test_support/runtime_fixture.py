from contextlib import closing
import json
from pathlib import Path
import sqlite3


def seed_document_runtime(
    root: Path,
    database: Path,
    task_id: str,
    action_id: str,
    approval_id: str | None,
) -> None:
    repository = Path(__file__).parents[3]
    with closing(sqlite3.connect(database)) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        for migration in range(1, 5):
            path = next((repository / "storage/migrations").glob(f"{migration:03d}_*.sql"))
            connection.executescript(path.read_text(encoding="utf-8"))
        now = "2026-08-04T00:00:00Z"
        manifest = {
            "schema_version": "1.0.0",
            "tool": {
                "id": "document-tool",
                "version": "1.0.0",
                "runtime": "rust-native-v1",
                "actions": [{
                    "name": "create_markdown",
                    "input_schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["path", "content"],
                        "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                    },
                    "output_schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["path"],
                        "properties": {"path": {"type": "string"}},
                    },
                    "required_permissions": ["document.write"],
                    "risk_level": 2,
                    "side_effect": "reversible",
                    "timeout_ms": 10000,
                }],
            },
        }
        connection.execute(
            "INSERT INTO agents VALUES (?,?,?,?,?,?,?)",
            ("ai-product-manager", "Alex", "AI Product Manager", "package", "active", now, now),
        )
        connection.execute(
            "INSERT INTO tools VALUES (?,?,?,?,?,?,?,?)",
            ("document-tool", "Document Tool", "native", "1.0.0", json.dumps(manifest), "active", now, now),
        )
        connection.execute(
            "INSERT INTO tasks VALUES (?,?,?,?,?,?)",
            (task_id, "ai-product-manager", "eval", "running", now, now),
        )
        connection.execute(
            "INSERT INTO actions VALUES (?,?,?,?,?,?,?,?)",
            (action_id, task_id, "document-tool", "{}", None, "running", now, now),
        )
        connection.execute(
            "INSERT INTO permissions VALUES (?,?,?,?,?,?,?,?)",
            (f"grant-{task_id}", "agent", "ai-product-manager", str(root), "document.write", "allow", now, now),
        )
        if approval_id is not None:
            connection.execute(
                "INSERT INTO approvals VALUES (?,?,?,?,?,?,?,?)",
                (approval_id, task_id, "ai-product-manager", "create_markdown", 2, "approved", now, now),
            )
        connection.commit()


def execution_count(database: Path) -> int:
    with closing(sqlite3.connect(database)) as connection:
        return connection.execute("SELECT count(*) FROM tool_executions").fetchone()[0]
