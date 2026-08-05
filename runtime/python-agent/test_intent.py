import unittest

from app.intent import classify_intent


class IntentClassificationTests(unittest.TestCase):
    def test_greeting_is_chat(self):
        decision = classify_intent("你好", use_llm=False)
        self.assertEqual(decision.intent, "chat")
        self.assertFalse(decision.is_task)

    def test_prd_request_is_task(self):
        decision = classify_intent("请生成一份 PRD，覆盖验收标准", use_llm=False)
        self.assertEqual(decision.intent, "task")
        self.assertTrue(decision.is_task)

    def test_ambiguous_defaults_to_chat_without_llm(self):
        decision = classify_intent("这个需求怎么拆比较好？", use_llm=False)
        self.assertEqual(decision.intent, "chat")


if __name__ == "__main__":
    unittest.main()
