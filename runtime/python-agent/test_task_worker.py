import json
import os
import subprocess
import sys
import unittest


class TaskWorkerTests(unittest.TestCase):
    def test_prompt_contains_exact_decision_contract(self):
        from app.task_worker import _messages

        request = {
            "agent": {"effective_prompt": "help"},
            "capability_set": [{"id": "search", "instructions": "search", "output_schema": {"type": "object"}}],
            "tool_surface": [{"id": "agent-reach-tool", "actions": [{"name": "search_web", "input_schema": {"type": "object", "properties": {"num_results": {"type": "integer"}}}}]}],
            "task": {"input": {"text": "查询最新版本"}},
            "observations": [],
        }
        messages = _messages(request)
        system = messages[0]["content"]
        self.assertIn("Do not return schema_version", system)
        self.assertIn('"type": "tool_call"', system)
        self.assertIn('"rationale_summary": "string"', system)
        self.assertIn('"num_results": {"type": "integer"}', system)
        self.assertIn("write readable Markdown that matches the information", system)
        self.assertIn("tables only for real comparisons", system)
        self.assertGreater(system.rfind("Do not return schema_version"), system.find("search"))
        self.assertEqual(json.loads(messages[1]["content"]), {
            "task_input": {"text": "查询最新版本"},
            "runtime_observations": [],
        })

    def test_followup_turn_contains_original_task_and_tool_observation(self):
        from app.task_worker import _messages

        request = {
            "agent": {"effective_prompt": "help"},
            "capability_set": [{"id": "search", "instructions": "search", "output_schema": {"type": "object"}}],
            "tool_surface": [{"id": "agent-reach-tool", "actions": []}],
            "task": {"input": {"text": "查询郑州新闻"}},
            "observations": [{"status": "succeeded", "output": {"content": "news evidence"}}],
        }
        messages = _messages(request)
        payload = json.loads(messages[1]["content"])
        self.assertEqual(payload["task_input"]["text"], "查询郑州新闻")
        self.assertEqual(payload["runtime_observations"][0]["output"]["content"], "news evidence")
        self.assertIn("do not repeat a completed Tool call", messages[0]["content"])
        self.assertIn("continue with the next unmet requirement", messages[0]["content"])
        self.assertIn("Respect each Tool surface max_calls limit", messages[0]["content"])

    def test_fake_complete_protocol(self):
        request = {
            "schema_version": "1.0.0",
            "task": {"id": "task", "input": {"text": "hello"}},
            "run": {"id": "run", "max_model_turns": 1, "max_tool_calls": 0},
            "agent": {"id": "agent", "effective_prompt": "help"},
            "capability_set": [{"id": "summary", "instructions": "summarize", "output_schema": {"type": "object"}}],
            "tool_surface": [],
            "context": {"sections": [], "sha256": "x", "size_bytes": 0},
            "observations": [],
        }
        env = dict(os.environ)
        env["AI_EMPLOYEE_FAKE_DECISION"] = json.dumps({
            "schema_version": "1.0.0", "type": "complete", "output": {"summary": "ok"},
            "deliverable_candidates": [], "evidence_refs": [],
        })
        result = subprocess.run(
            [sys.executable, "-m", "app.task_worker"], input=json.dumps(request), text=True,
            capture_output=True, env=env, check=False,
            cwd=os.path.dirname(__file__),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["type"], "complete")

    def test_fake_wrong_model_version_is_replaced_by_worker_protocol_version(self):
        request = {
            "schema_version": "1.0.0",
            "task": {"id": "task", "input": {"text": "search"}},
            "run": {"id": "run", "max_model_turns": 1, "max_tool_calls": 1},
            "agent": {"id": "agent", "effective_prompt": "help"},
            "capability_set": [{"id": "search", "instructions": "search", "output_schema": {"type": "object"}}],
            "tool_surface": [{"id": "agent-reach-tool", "actions": ["search_web"]}],
            "context": {"sections": [], "sha256": "x", "size_bytes": 0},
            "observations": [],
        }
        env = dict(os.environ)
        env["AI_EMPLOYEE_FAKE_DECISION"] = json.dumps({
            "schema_version": "2.0.0", "type": "tool_call", "skill_id": "search", "tool_id": "agent-reach-tool",
            "action": "search_web", "arguments": {"query": "news"}, "rationale_summary": "search",
        })
        result = subprocess.run(
            [sys.executable, "-m", "app.task_worker"], input=json.dumps(request), text=True,
            capture_output=True, env=env, check=False, cwd=os.path.dirname(__file__),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["schema_version"], "1.0.0")

    def test_followup_accepts_output_only_model_response_as_completion(self):
        request = {
            "schema_version": "1.0.0",
            "task": {"id": "task", "input": {"text": "查询新闻"}},
            "run": {"id": "run", "max_model_turns": 2, "max_tool_calls": 1},
            "agent": {"id": "agent", "effective_prompt": "help"},
            "capability_set": [{"id": "search", "instructions": "search", "output_schema": {"type": "object"}}],
            "tool_surface": [{"id": "agent-reach-tool", "actions": ["search_web"]}],
            "context": {"sections": [], "sha256": "x", "size_bytes": 0},
            "observations": [{"status": "succeeded", "output": {"content": "evidence"}}],
        }
        env = dict(os.environ)
        env["AI_EMPLOYEE_FAKE_DECISION"] = json.dumps({
            "answer": "搜索结果", "sources": ["https://example.com"],
        })
        result = subprocess.run(
            [sys.executable, "-m", "app.task_worker"], input=json.dumps(request), text=True,
            capture_output=True, env=env, check=False, cwd=os.path.dirname(__file__),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        decision = json.loads(result.stdout)
        self.assertEqual(decision["type"], "complete")
        self.assertEqual(decision["output"]["answer"], "搜索结果")


if __name__ == "__main__":
    unittest.main()
