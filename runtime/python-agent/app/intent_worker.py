import json
import sys

from .intent import classify_intent


def main() -> int:
    try:
        request = json.loads(sys.stdin.read() or "{}")
        text = request.get("text", "")
        if not isinstance(text, str):
            raise ValueError("text must be string")
        use_llm = bool(request.get("use_llm", True))
        decision = classify_intent(text, use_llm=use_llm)
        print(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "intent": decision.intent,
                    "confidence": decision.confidence,
                    "source": decision.source,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception:
        print(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "intent": "chat",
                    "confidence": 0.4,
                    "source": "error_fallback",
                },
                ensure_ascii=False,
            )
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
