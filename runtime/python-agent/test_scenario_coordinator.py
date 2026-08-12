import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from app.scenario_coordinator import _messages, _validate_request
from app.provider import ProviderResponse


def request() -> dict:
    return {
        "schema_version": "1.0.0",
        "objective": "形成发布方案",
        "constraints": ["串行执行"],
        "overall_acceptance_criteria": [{"criterion_id": "final-evaluation", "description": "引用全部证据", "evidence_type": "evaluation", "required": True}],
        "employee_catalog": [{
            "agent_id": "alex",
            "display_name": "Alex",
            "ready_capabilities": ["local-file-operations"],
        }],
    }


class ScenarioCoordinatorTests(unittest.TestCase):
    def test_packaged_modules_import_with_macos_python_3_9(self):
        python = Path("/Library/Developer/CommandLineTools/usr/bin/python3")
        if not python.exists():
            self.skipTest("macOS CommandLineTools Python is unavailable")
        env = dict(os.environ)
        env["PYTHONPATH"] = str(Path(__file__).parent)
        result = subprocess.run(
            [str(python), "-c", "import app.context, app.gateway, app.provider"],
            text=True, capture_output=True, env=env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_prompt_keeps_proposal_boundary(self):
        _validate_request(request())
        prompt = _messages(request())[0]["content"]
        self.assertIn("only a proposal", prompt)
        self.assertIn("Never claim it was saved", prompt)

    def test_rejects_unknown_request_fields(self):
        payload = request()
        payload["conversation_history"] = []
        with self.assertRaisesRegex(ValueError, "scenario_coordinator_request_invalid"):
            _validate_request(payload)

    def test_fake_provider_emits_proposal(self):
        proposal = {"schema_version": "1.0.0", "proposal_id": "p"}
        env = dict(os.environ)
        env["AI_EMPLOYEE_FAKE_SCENARIO_PROPOSAL"] = json.dumps(proposal)
        result = subprocess.run(
            [sys.executable, "-m", "app.scenario_coordinator"],
            input=json.dumps(request()), text=True, capture_output=True, env=env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), proposal)

    @patch("app.scenario_coordinator.DeepSeekProvider")
    @patch("app.scenario_coordinator.ProviderConfig")
    def test_live_provider_uses_scenario_timeout(self, config_type, provider_type):
        config = config_type.from_environment.return_value
        config.provider = "deepseek"
        config.deepseek_model = "deepseek-v4-flash"
        config.scenario_request_timeout_seconds = 180.0
        provider_type.return_value.complete_json.return_value = ProviderResponse(
            json.dumps({"schema_version": "1.0.0", "proposal_id": "p"}),
            "deepseek",
        )
        with patch("sys.stdin.read", return_value=json.dumps(request())), patch("builtins.print"):
            from app.scenario_coordinator import main

            self.assertEqual(main(), 0)
        provider_type.assert_called_once_with("deepseek-v4-flash", 180.0)


if __name__ == "__main__":
    unittest.main()
