import unittest

from app.context import ContextItem, ContextSection, PromptRef, WorkerRequest, build_decision_context


class ContextTests(unittest.TestCase):
    def test_sections_are_typed_unique_and_bounded(self):
        request = WorkerRequest("1.0", "task_1", "alex", "prd", "trace_1", (
            ContextSection("memory", ("a", "b"), 1),
            ContextSection("knowledge", ("source",), 2, "untrusted_data"),
        ))
        request.validate()
        self.assertEqual(request.context[0].bounded(), ("a",))

    def test_unknown_or_duplicate_sections_fail_closed(self):
        with self.assertRaises(ValueError):
            WorkerRequest("1.0", "t", "a", "x", "tr", (
                ContextSection("memory", (), 1), ContextSection("memory", (), 1)
            )).validate()

    def test_builds_versioned_bounded_context_with_provenance(self):
        request = WorkerRequest("1.0", "task_1", "alex", "生成 PRD", "trace_1", (
            ContextSection("knowledge", (
                ContextItem("source_1:0", "权限隔离", "seed://interviews"),
                ContextItem("source_2:0", "这条内容超过剩余预算", "seed://other"),
            ), 2, "untrusted_data"),
        ))
        context = build_decision_context(
            request,
            PromptRef("prd-generation", "1.0.0", "system prompt"),
            1_000,
        )
        self.assertLess(context["budget"]["used_chars"], context["budget"]["max_chars"])
        self.assertEqual(context["sections"][0]["items"][0]["source_uri"], "seed://interviews")
        self.assertEqual(len(context["prompt"]["sha256"]), 64)

    def test_knowledge_cannot_be_marked_trusted(self):
        with self.assertRaises(ValueError):
            WorkerRequest("1.0", "t", "a", "x", "tr", (
                ContextSection("knowledge", ("x",), 1, "trusted"),
            )).validate()

    def test_over_budget_item_is_rejected_not_dropped(self):
        request = WorkerRequest("1.0", "task", "alex", "prd", "trace", (
            ContextSection("memory", (ContextItem("m1", "x" * 200),), 1, "untrusted_data"),
        ))
        with self.assertRaisesRegex(ValueError, "exceeds"):
            build_decision_context(request, PromptRef("prd", "1.0.0", "prompt"), 100)


if __name__ == "__main__":
    unittest.main()
