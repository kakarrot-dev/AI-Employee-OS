"""Classify whether a user turn is casual chat or a formal work/task request."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from .provider import DeepSeekProvider, ProviderFailure
from .provider_config import ProviderConfig

TASK_PATTERNS = (
    r"生成.{0,8}prd",
    r"写\s*(一份|个)?\s*prd",
    r"产出\s*(prd|文档|交付)",
    r"交办",
    r"正式工作",
    r"创建\s*(markdown|文档|prd)",
    r"写\s*(需求|产品需求|文档|说明)",
    r"整理成\s*(prd|文档)",
    r"输出\s*(prd|文档|交付物)",
    r"write\s+(a\s+)?prd",
    r"create\s+(a\s+)?(markdown|document|prd)",
    r"generate\s+(a\s+)?prd",
)

CHAT_PATTERNS = (
    r"^(你好|您好|hi|hello|hey)[\s!！。.?？]*$",
    r"你是谁",
    r"介绍一下你自己",
    r"天气",
    r"聊聊",
    r"闲聊",
)

INTENT_PROMPT = """你是意图分类器。根据用户最新一条消息，判断应走闲聊还是工作。

只输出 JSON，不要其它文字：
{"intent":"chat"|"task","confidence":0.0到1.0}

规则：
- chat：问候、解释概念、讨论想法、澄清问题，不需要写文件或跑 Skill。
- task：明确要求生成 PRD/文档/交付物、执行工作、调用工具完成产出。
不确定时选 chat，confidence 取 0.4-0.6。
"""


@dataclass(frozen=True)
class IntentDecision:
    intent: str
    confidence: float
    source: str

    @property
    def is_task(self) -> bool:
        return self.intent == "task" and self.confidence >= 0.55


def classify_intent(user_text: str, *, use_llm: bool = True) -> IntentDecision:
    text = (user_text or "").strip()
    if not text:
        return IntentDecision("chat", 1.0, "empty")

    lowered = text.lower()
    for pattern in CHAT_PATTERNS:
        if re.search(pattern, lowered, flags=re.IGNORECASE):
            return IntentDecision("chat", 0.92, "heuristic_chat")
    for pattern in TASK_PATTERNS:
        if re.search(pattern, lowered, flags=re.IGNORECASE):
            return IntentDecision("task", 0.9, "heuristic_task")

    if not use_llm:
        return IntentDecision("chat", 0.5, "default")

    try:
        config = ProviderConfig()
        config.validate()
        messages = [
            {"role": "system", "content": INTENT_PROMPT},
            {"role": "user", "content": text},
        ]
        response = DeepSeekProvider(config.deepseek_model, config.request_timeout_seconds).complete(
            messages
        )
        return _parse_llm_intent(response.content)
    except (ProviderFailure, ValueError, KeyError, json.JSONDecodeError):
        return IntentDecision("chat", 0.45, "fallback_chat")


def _parse_llm_intent(content: str) -> IntentDecision:
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    data = json.loads(raw)
    intent = data.get("intent")
    confidence = float(data.get("confidence", 0.5))
    if intent not in {"chat", "task"}:
        raise ValueError("invalid intent")
    confidence = max(0.0, min(1.0, confidence))
    return IntentDecision(intent, confidence, "llm")
