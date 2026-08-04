from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from app.gateway import GatewayContext, SubprocessToolGateway, ToolRoute
from app.loop import BoundedPlannerLoop, LoopLimits
from app.provider import DeterministicFakeProvider, ProviderResponse, ProviderRouter


ROOT = Path(__file__).parents[2]
GATEWAY_BINARY = ROOT / "target/debug/tool-gateway"


class ObservingProvider:
    name = "observing-fake"

    def __init__(self, tool_call: dict):
        self.tool_call = tool_call
        self.observation = None

    def complete(self, messages):
        if self.observation is None and len(messages) == 1:
            return ProviderResponse(json.dumps(self.tool_call), self.name)
        self.observation = json.loads(messages[-1]["content"])
        return ProviderResponse(
            json.dumps({"type": "final", "content": f"tool status: {self.observation['status']}"}),
            self.name,
        )


class CrossProcessGatewayTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.database = self.root / "runtime.sqlite3"
        self.source = self.root / "evidence.txt"
        self.source.write_text("real Rust evidence", encoding="utf-8")
        self._seed_database()

    def tearDown(self):
        self.temporary.cleanup()

    def test_python_planner_reads_through_the_real_rust_tool_executor(self):
        provider = ObservingProvider(
            {
                "type": "tool_call",
                "call_id": "call-read",
                "action": "read_file",
                "arguments": {"path": str(self.source)},
                "idempotency_key": "task-1:action-read:1",
            }
        )
        gateway = self._gateway(
            {
                "read_file": ToolRoute(
                    "action-read", "file-tool", "1.0.0", ("grant-read",)
                )
            }
        )
        result = BoundedPlannerLoop(
            ProviderRouter(provider, DeterministicFakeProvider()),
            LoopLimits(max_steps=2, max_tool_calls=1),
        ).run_with_tools("read evidence", gateway)

        self.assertEqual(result.output, "tool status: succeeded")
        self.assertEqual(provider.observation["output"], {"content": "real Rust evidence"})
        self.assertEqual(provider.observation["trace_id"], "trace-1")
        with closing(sqlite3.connect(self.database)) as connection:
            execution = connection.execute(
                "SELECT status FROM tool_executions WHERE call_id='call-read'"
            ).fetchone()[0]
            audit = connection.execute(
                "SELECT result FROM audit_logs WHERE task_id='task-1'"
            ).fetchone()[0]
        self.assertEqual((execution, audit), ("succeeded", "succeeded"))

    def test_blocked_result_is_returned_to_the_planner_without_becoming_success(self):
        provider = ObservingProvider(
            {
                "type": "tool_call",
                "call_id": "call-write",
                "action": "create_markdown",
                "arguments": {"path": str(self.root / "prd.md"), "content": "# PRD"},
                "idempotency_key": "task-1:action-write:1",
            }
        )
        gateway = self._gateway(
            {
                "create_markdown": ToolRoute(
                    "action-write", "document-tool", "1.0.0", ("grant-write",)
                )
            }
        )
        result = BoundedPlannerLoop(
            ProviderRouter(provider, DeterministicFakeProvider()),
            LoopLimits(max_steps=2, max_tool_calls=1),
        ).run_with_tools("write PRD", gateway)

        self.assertEqual(result.output, "tool status: blocked")
        self.assertEqual(provider.observation["status"], "blocked")
        self.assertEqual(provider.observation["error"]["code"], "APPROVAL_REQUIRED")
        self.assertFalse((self.root / "prd.md").exists())

    def _gateway(self, routes):
        self.assertTrue(GATEWAY_BINARY.exists(), "scripts/check.sh must build tool-gateway first")
        return SubprocessToolGateway(
            GATEWAY_BINARY,
            self.database,
            GatewayContext(
                task_id="task-1",
                agent_id="ai-product-manager",
                deadline="2099-01-01T00:00:00Z",
                trace_id="trace-1",
                routes=routes,
            ),
        )

    def _seed_database(self):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            for migration in range(1, 5):
                path = next((ROOT / "storage/migrations").glob(f"{migration:03d}_*.sql"))
                connection.executescript(path.read_text(encoding="utf-8"))
            now = "2026-08-04T00:00:00Z"
            connection.execute(
                "INSERT INTO agents VALUES (?,?,?,?,?,?,?)",
                ("ai-product-manager", "Alex", "AI Product Manager", "package", "active", now, now),
            )
            for tool_id, action, permission, risk, side_effect in (
                ("file-tool", "read_file", "filesystem.read", 0, "none"),
                ("document-tool", "create_markdown", "document.write", 2, "reversible"),
            ):
                output = {"content": {"type": "string"}} if tool_id == "file-tool" else {"path": {"type": "string"}}
                required_output = ["content"] if tool_id == "file-tool" else ["path"]
                properties = {"path": {"type": "string"}}
                required_input = ["path"]
                if tool_id == "document-tool":
                    properties["content"] = {"type": "string"}
                    required_input.append("content")
                manifest = {
                    "schema_version": "1.0.0",
                    "tool": {
                        "id": tool_id,
                        "version": "1.0.0",
                        "runtime": "rust-native-v1",
                        "actions": [{
                            "name": action,
                            "input_schema": {"type": "object", "additionalProperties": False, "required": required_input, "properties": properties},
                            "output_schema": {"type": "object", "additionalProperties": False, "required": required_output, "properties": output},
                            "required_permissions": [permission],
                            "risk_level": risk,
                            "side_effect": side_effect,
                            "timeout_ms": 10000,
                        }],
                    },
                }
                connection.execute(
                    "INSERT INTO tools VALUES (?,?,?,?,?,?,?,?)",
                    (tool_id, tool_id, "native", "1.0.0", json.dumps(manifest), "active", now, now),
                )
            connection.execute(
                "INSERT INTO tasks VALUES (?,?,?,?,?,?)",
                ("task-1", "ai-product-manager", "test", "running", now, now),
            )
            connection.execute(
                "INSERT INTO actions VALUES (?,?,?,?,?,?,?,?)",
                ("action-read", "task-1", "file-tool", "{}", None, "running", now, now),
            )
            connection.execute(
                "INSERT INTO actions VALUES (?,?,?,?,?,?,?,?)",
                ("action-write", "task-1", "document-tool", "{}", None, "running", now, now),
            )
            connection.execute(
                "INSERT INTO permissions VALUES (?,?,?,?,?,?,?,?)",
                ("grant-read", "agent", "ai-product-manager", str(self.root), "filesystem.read", "allow", now, now),
            )
            connection.execute(
                "INSERT INTO permissions VALUES (?,?,?,?,?,?,?,?)",
                ("grant-write", "agent", "ai-product-manager", str(self.root), "document.write", "allow", now, now),
            )
            connection.commit()


if __name__ == "__main__":
    unittest.main()
