import json
import os
import subprocess
import sys
import unittest

from app.acceptance_evaluator import validate_result


class AcceptanceEvaluatorTests(unittest.TestCase):
    def request(self) -> dict:
        return {
            "schema_version": "1.0.0",
            "task": {"id": "task", "goal": "形成有来源的调研结论"},
            "output": {"answer": "结论", "sources": []},
            "criteria": [{
                "evaluation_key": "criterion-0",
                "criterion_id": "sources",
                "description": "至少包含一个可追溯来源",
                "evidence_type": "structured_output",
                "required": True,
                "evidence": [{"ref": "output:hash", "content": {"answer": "结论", "sources": []}}],
            }],
        }

    def test_rejects_unbound_evidence_reference(self):
        result = {"schema_version": "1.0.0", "criteria": [{
            "evaluation_key": "criterion-0", "passed": True, "reason": "ok", "evidence_refs": ["invented"]
        }]}
        with self.assertRaisesRegex(ValueError, "acceptance_evaluation_evidence_invalid"):
            validate_result(self.request(), result)

    def test_fake_runner_preserves_criterion_identity(self):
        result = subprocess.run(
            [sys.executable, "-m", "app.acceptance_evaluator"],
            input=json.dumps(self.request()), text=True, capture_output=True,
            env={**os.environ, "AI_EMPLOYEE_FAKE_ACCEPTANCE_EVALUATION": "pass"},
            check=True,
        )
        report = json.loads(result.stdout)["criteria"][0]
        self.assertEqual(report["evaluation_key"], "criterion-0")
        self.assertEqual(report["evidence_refs"], ["output:hash"])


if __name__ == "__main__":
    unittest.main()
