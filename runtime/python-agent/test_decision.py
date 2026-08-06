import unittest

from app.decision import MODEL_FIELDS, REQUIRED_FIELDS, SCHEMA_VERSION, decision_contract_examples, parse_decision, parse_model_decision


class DecisionTests(unittest.TestCase):
    def test_prompt_examples_are_generated_from_parser_contract(self):
        examples = decision_contract_examples()
        self.assertEqual(set(examples), set(REQUIRED_FIELDS))
        for decision_type, value in examples.items():
            self.assertEqual(set(value), MODEL_FIELDS[decision_type])
            self.assertNotIn("schema_version", value)
            self.assertEqual(parse_model_decision(__import__("json").dumps(value))["type"], decision_type)

    def test_worker_owns_schema_version_even_if_model_returns_wrong_version(self):
        value = parse_model_decision('{"schema_version":"2.0.0","type":"tool_call","skill_id":"web-search","tool_id":"agent-reach-tool","action":"search_web","arguments":{"query":"news"},"rationale_summary":"search"}')
        self.assertEqual(value["schema_version"], SCHEMA_VERSION)

    def test_worker_unwraps_known_tool_call_envelope(self):
        value = parse_model_decision(
            '{"tool_call":{"skill_id":"web-search","tool_id":"agent-reach-tool","action":"search_web",'
            '"arguments":{"query":"news"},"rationale_summary":"search"}}'
        )
        self.assertEqual(value["type"], "tool_call")
        self.assertEqual(value["arguments"], {"query": "news"})

    def test_worker_does_not_unwrap_unknown_envelope(self):
        with self.assertRaisesRegex(ValueError, "type=None"):
            parse_model_decision('{"execute":{"action":"search_web"}}')

    def test_worker_wraps_direct_skill_output_in_complete_envelope(self):
        value = parse_model_decision('{"type":"complete","answer":"最新新闻","sources":["https://example.com"]}')
        self.assertEqual(value["schema_version"], SCHEMA_VERSION)
        self.assertEqual(value["output"], {"answer": "最新新闻", "sources": ["https://example.com"]})
        self.assertEqual(value["deliverable_candidates"], [])
        self.assertEqual(value["evidence_refs"], [])

    def test_worker_accepts_output_only_after_runtime_observation(self):
        value = parse_model_decision(
            '{"answer":"最新新闻","sources":["https://example.com"]}',
            allow_observation_completion=True,
        )
        self.assertEqual(value["type"], "complete")
        self.assertEqual(value["output"]["answer"], "最新新闻")

    def test_worker_rejects_output_only_without_runtime_observation(self):
        with self.assertRaisesRegex(ValueError, "type=None"):
            parse_model_decision('{"answer":"未调用工具的猜测"}')

    def test_accepts_complete(self):
        value = parse_decision('{"schema_version":"1.0.0","type":"complete","output":{"summary":"ok"},"deliverable_candidates":[],"evidence_refs":[]}')
        self.assertEqual(value["type"], "complete")

    def test_rejects_security_field(self):
        with self.assertRaisesRegex(ValueError, "decision_forbidden_field"):
            parse_decision('{"schema_version":"1.0.0","type":"tool_call","skill_id":"s","tool_id":"x","action":"y","arguments":{},"rationale_summary":"z","call_id":"owned-by-model"}')

    def test_rust_boundary_shape_still_rejects_unsupported_version(self):
        with self.assertRaisesRegex(ValueError, "unsupported schema_version"):
            parse_decision('{"schema_version":"2.0.0","type":"complete","output":{},"deliverable_candidates":[],"evidence_refs":[]}')


if __name__ == "__main__":
    unittest.main()
