import unittest
from unittest.mock import patch

from app.intent import classify_intent
from app.provider import ProviderResponse


SKILLS = [
    {
        "id": "web-search",
        "name": "网络搜索",
        "description": "搜索公开网页",
    },
    {
        "id": "local-file-operations",
        "name": "本地文件操作",
        "description": "读取、创建或编辑本地文件",
    },
]


class IntentClassificationTests(unittest.TestCase):
    def test_empty_input_is_chat_without_model(self):
        decision = classify_intent("", available_skills=SKILLS)
        self.assertEqual(decision.intent, "chat")
        self.assertIsNone(decision.skill_id)

    def test_disabled_model_fails_safe_to_chat(self):
        decision = classify_intent("帮我搜索资料", available_skills=SKILLS, use_llm=False)
        self.assertEqual(decision.intent, "chat")
        self.assertEqual(decision.source, "model_disabled")

    @patch("app.intent.DeepSeekProvider.complete")
    @patch("app.intent.ProviderConfig.validate")
    def test_model_selects_ready_skill(self, validate, complete):
        complete.return_value = ProviderResponse(
            '{"intent":"task","confidence":0.96,"skill_id":"web-search"}', "fake", 1, 1
        )
        decision = classify_intent("查一下 Rust", available_skills=SKILLS)
        self.assertEqual(decision.intent, "task")
        self.assertEqual(decision.skill_id, "web-search")

    @patch("app.intent.DeepSeekProvider.complete")
    @patch("app.intent.ProviderConfig.validate")
    def test_model_cannot_select_unavailable_skill(self, validate, complete):
        complete.return_value = ProviderResponse(
            '{"intent":"task","confidence":0.99,"skill_id":"shell"}', "fake", 1, 1
        )
        decision = classify_intent("执行命令", available_skills=SKILLS)
        self.assertEqual(decision.intent, "chat")
        self.assertEqual(decision.source, "fallback_chat")


if __name__ == "__main__":
    unittest.main()
