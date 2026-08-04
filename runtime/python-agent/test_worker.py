from pathlib import Path
import tempfile
import unittest

from app.worker import _prd_content, _validate_request, observe, plan
from app.eval_runner import evaluate_prd_artifact


def valid_request(root: Path) -> dict:
    return {
        "schema_version": "1.0",
        "task_id": "task-1",
        "task_input": "设计企业 AI 知识库",
        "artifact_path": str(root / "prd.md"),
        "call_id": "call-1",
        "idempotency_key": "task-1:action-1:1",
        "trace_id": "trace-1",
    }


class WorkerTests(unittest.TestCase):
    def test_request_fails_closed_on_unknown_fields_and_versions(self):
        with tempfile.TemporaryDirectory() as temporary:
            request = valid_request(Path(temporary))
            request["unknown"] = True
            with self.assertRaisesRegex(ValueError, "fields"):
                _validate_request(request)
            request = valid_request(Path(temporary))
            request["schema_version"] = "2.0"
            with self.assertRaisesRegex(ValueError, "schema_version"):
                _validate_request(request)

    def test_deterministic_prd_passes_the_frozen_rubric(self):
        result = evaluate_prd_artifact(_prd_content("设计企业 AI 知识库"))
        self.assertEqual(result.score, 1.0)
        self.assertEqual(result.failed_items, ())

    def test_worker_plans_one_tool_call_and_requires_matching_success_observation(self):
        with tempfile.TemporaryDirectory() as temporary:
            request = valid_request(Path(temporary))
            decision = plan(request)
            self.assertEqual(decision["type"], "tool_call")
            self.assertEqual(decision["action"], "create_markdown")
            with self.assertRaisesRegex(RuntimeError, "did not succeed"):
                observe(request, {"schema_version": "1.0", "call_id": "call-1", "status": "failed"})
            final = observe(
                request,
                {"schema_version": "1.0", "call_id": "call-1", "status": "succeeded"},
            )
            self.assertEqual(final["type"], "final")


if __name__ == "__main__":
    unittest.main()
