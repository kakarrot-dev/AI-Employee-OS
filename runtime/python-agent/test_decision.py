import unittest

from app.decision import parse_decision


class DecisionTests(unittest.TestCase):
    def test_accepts_complete(self):
        value = parse_decision('{"schema_version":"1.0.0","type":"complete","output":{"summary":"ok"},"deliverable_candidates":[],"evidence_refs":[]}')
        self.assertEqual(value["type"], "complete")

    def test_rejects_security_field(self):
        with self.assertRaisesRegex(ValueError, "decision_forbidden_field"):
            parse_decision('{"schema_version":"1.0.0","type":"tool_call","tool_id":"x","action":"y","arguments":{},"rationale_summary":"z","call_id":"owned-by-model"}')


if __name__ == "__main__":
    unittest.main()
