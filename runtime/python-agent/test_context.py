import unittest

from app.context import ContextSection, WorkerRequest


class ContextTests(unittest.TestCase):
    def test_sections_are_typed_unique_and_bounded(self):
        request = WorkerRequest("1.0", "task_1", "alex", "prd", "trace_1", (
            ContextSection("memory", ("a", "b"), 1),
            ContextSection("knowledge", ("source",), 2),
        ))
        request.validate()
        self.assertEqual(request.context[0].bounded(), ("a",))

    def test_unknown_or_duplicate_sections_fail_closed(self):
        with self.assertRaises(ValueError):
            WorkerRequest("1.0", "t", "a", "x", "tr", (
                ContextSection("memory", (), 1), ContextSection("memory", (), 1)
            )).validate()


if __name__ == "__main__":
    unittest.main()
