import json
import os
import subprocess
import sys
import unittest


class TaskWorkerTests(unittest.TestCase):
    def test_fake_complete_protocol(self):
        request = {
            "schema_version": "1.0.0",
            "task": {"id": "task", "input": {"text": "hello"}},
            "run": {"id": "run", "max_model_turns": 1, "max_tool_calls": 0},
            "agent": {"id": "agent", "effective_prompt": "help"},
            "skill": {"id": "summary", "instructions": "summarize", "output_schema": {"type": "object"}},
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


if __name__ == "__main__":
    unittest.main()
