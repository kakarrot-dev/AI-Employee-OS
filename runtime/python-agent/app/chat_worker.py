import json
import sys

from .provider import ProviderFailure, configured_provider
from .provider_config import ProviderConfig


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        if set(request) not in ({"schema_version", "system_prompt", "messages"}, {"schema_version", "system_prompt", "messages", "stream"}) or request["schema_version"] != "1.0":
            raise ValueError("unsupported chat request")
        system_prompt = request["system_prompt"]
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValueError("system_prompt must not be empty")
        messages = request["messages"]
        if not isinstance(messages, list) or not messages:
            raise ValueError("messages must not be empty")
        if len(messages) > 100:
            raise ValueError("conversation exceeds 100 messages")
        normalized = [{"role": "system", "content": system_prompt}]
        for message in messages:
            if set(message) != {"role", "content"} or message["role"] not in {"user", "assistant"}:
                raise ValueError("invalid message")
            if not isinstance(message["content"], str) or not message["content"].strip():
                raise ValueError("message content must not be empty")
            normalized.append(message)
        config = ProviderConfig.from_environment()
        config.validate()
        provider = configured_provider(config)
        if request.get("stream") is True:
            def publish(delta: str) -> None:
                print(json.dumps({"type": "delta", "delta": delta}, ensure_ascii=False), flush=True)
            response = provider.stream_complete(normalized, publish)
        else:
            response = provider.complete(normalized)
        print(json.dumps({
            "schema_version": "1.0",
            "content": response.content,
            "provider": response.provider,
            "model": config.model,
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
        }, ensure_ascii=False))
        return 0
    except ProviderFailure as error:
        print(json.dumps({"schema_version": "1.0", "error_code": error.kind.value}, ensure_ascii=False))
        return 2
    except Exception:
        print(json.dumps({"schema_version": "1.0", "error_code": "invalid_response"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
