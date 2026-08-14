import unittest
import json
import os
import subprocess
import sys

from app.provider import DeterministicFakeProvider
from app.task_proposal_worker import generate_valid_proposal, messages, validate_proposal, validate_request


def request():
    return {"schema_version": "1.0.0", "objective": "调研并写报告", "thread_context": [], "employee_catalog": [{"agent_id": "researcher", "display_name": "研究员", "ready_capabilities": ["web-search"]}], "preferred_agent_id": None}


class TaskProposalWorkerTests(unittest.TestCase):
    def test_request_is_exact_and_catalog_is_bounded(self):
        validate_request(request())
        invalid = request() | {"permission_grant": "all"}
        with self.assertRaisesRegex(ValueError, "task_proposal_request_invalid"):
            validate_request(invalid)

    def test_prompt_prefers_single_agent_and_denies_authority(self):
        prompt = messages(request())[0]["content"]
        self.assertIn("Prefer one agent", prompt)
        self.assertIn("Never emit task/run/action", prompt)

    def test_prompt_routes_web_research_to_a_file_finalizer_with_a_default_relative_path(self):
        prompt = messages(request())[0]["content"]
        self.assertIn("public-web evidence and a saved local document", prompt)
        self.assertIn("exactly one finalizer", prompt)
        self.assertIn("safe relative Markdown filename", prompt)
        self.assertIn("client supplies the authorized output root", prompt)

    def test_provider_failure_is_a_stable_error_code(self):
        environment = dict(os.environ)
        environment.pop("DEEPSEEK_API_KEY", None)
        environment.pop("POE_API_KEY", None)
        environment.pop("AI_EMPLOYEE_FAKE_TASK_PROPOSAL", None)
        result = subprocess.run(
            [sys.executable, "-m", "app.task_proposal_worker"],
            input=json.dumps(request()), text=True, capture_output=True,
            cwd=os.path.dirname(__file__), env=environment, check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stderr)["error_code"], "authentication")

    def test_invalid_acceptance_string_is_repaired_once(self):
        valid = {
            "schema_version": "1.0.0", "intent": "single_agent_task", "title": "调研", "objective": "调研并写报告",
            "missing_inputs": [], "deliverable": {"type": "document", "description": "报告", "target_path": None},
            "assignments": [{"node_id": "research", "role": "owner", "employee_selector": {"preferred_id": "researcher", "capabilities": ["web-search"]}, "goal": "完成调研", "depends_on": [], "acceptance_criteria": [{"criterion_id": "research", "description": "完成调研", "evidence_type": "evaluation", "required": True}]}],
            "acceptance_criteria": [{"criterion_id": "sources", "description": "包含来源", "evidence_type": "structured_output", "required": True}],
            "requested_resources": [], "budget_hint": {"input_tokens": 1000, "output_tokens": 1000, "tool_rounds": 2, "wall_clock_ms": 60000},
        }
        invalid = valid | {"acceptance_criteria": ["包含来源"]}
        provider = DeterministicFakeProvider([json.dumps(invalid), json.dumps(valid)])
        self.assertEqual(generate_valid_proposal(provider, request()), valid)
        self.assertEqual(len(provider.responses), 0)

    def test_acceptance_criterion_must_be_object(self):
        with self.assertRaisesRegex(ValueError, "must_be_object"):
            validate_proposal({"schema_version": "1.0.0", "intent": "single_agent_task", "title": "x", "objective": "x", "missing_inputs": [], "deliverable": {"type": "x", "description": "x", "target_path": None}, "assignments": [], "acceptance_criteria": ["x"], "requested_resources": [], "budget_hint": {"input_tokens": 1, "output_tokens": 1, "tool_rounds": 0, "wall_clock_ms": 1}})


if __name__ == "__main__":
    unittest.main()
