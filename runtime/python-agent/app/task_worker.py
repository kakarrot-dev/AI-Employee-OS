import json
import os
import sys

from .decision import parse_decision
from .provider import DeepSeekProvider, DeterministicFakeProvider
from .provider_config import ProviderConfig


def _messages(request: dict) -> list[dict[str, str]]:
    system = "\n\n".join([
        "You are a bounded task decision worker. Return exactly one JSON object and no markdown.",
        "Allowed decision types are ask_user, tool_call, complete. Never invent call_id, action_id, idempotency_key, permission_context, approval_id, deadline, trace_id, or attempt.",
        request["agent"]["effective_prompt"],
        request["skill"]["instructions"],
        f"Allowed tools: {json.dumps(request['tool_surface'], ensure_ascii=False)}",
        f"Required output schema: {json.dumps(request['skill']['output_schema'], ensure_ascii=False)}",
    ])
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(request["task"]["input"], ensure_ascii=False)},
    ]


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        if request.get("schema_version") != "1.0.0":
            raise ValueError("unsupported AgentRunRequest")
        if set(request) != {"schema_version", "task", "run", "agent", "skill", "tool_surface", "context", "observations"}:
            raise ValueError("invalid AgentRunRequest fields")
        scripted = os.getenv("AI_EMPLOYEE_FAKE_DECISION")
        if scripted is not None:
            provider = DeterministicFakeProvider([scripted])
        else:
            config = ProviderConfig()
            config.validate()
            provider = DeepSeekProvider(config.deepseek_model, config.request_timeout_seconds)
        response = provider.complete(_messages(request))
        decision = parse_decision(response.content)
        print(json.dumps(decision, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
