#!/usr/bin/env python3
"""Real DeepSeek Responses API Phase 0 probe.

This validates the product's preferred protocol without logging credentials,
prompts, response text, or reasoning text.
"""

from __future__ import annotations

import argparse
import http.client
import json
import sys
import time
from datetime import UTC, datetime
from typing import Any, Callable

import real_deepseek_probe as shared


PATH = "/responses"
INVALID_MODEL = "__ai_employee_os_invalid_model__"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the low-budget real DeepSeek Responses API Phase 0 probe."
    )
    parser.add_argument("--model", required=True, help="Exact model ID to probe.")
    parser.add_argument("--acknowledge-paid-request", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument("--keychain-service")
    return parser.parse_args()


def request(api_key: str, payload: dict[str, Any], timeout: int) -> shared.HttpResult:
    return shared.request_json(
        api_key=api_key, payload=payload, timeout=timeout, path=PATH
    )


def parse_response(result: shared.HttpResult) -> dict[str, Any]:
    return shared.parse_json_response(result)


def response_id(value: dict[str, Any]) -> str | None:
    identifier = value.get("id")
    return identifier if isinstance(identifier, str) else None


def response_text(value: dict[str, Any]) -> str:
    fragments: list[str] = []
    output = value.get("output")
    if not isinstance(output, list):
        raise shared.ProbeFailure("response output must be a list")
    for item in output:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict) or part.get("type") != "output_text":
                continue
            text = part.get("text")
            if isinstance(text, str):
                fragments.append(text)
    combined = "".join(fragments)
    if not combined:
        raise shared.ProbeFailure("response has no visible output text")
    return combined


def normalized_usage(value: dict[str, Any]) -> dict[str, int]:
    usage = value.get("usage")
    if not isinstance(usage, dict):
        raise shared.ProbeFailure("response has no usage object")
    normalized: dict[str, int] = {}
    for name in ("input_tokens", "output_tokens", "total_tokens"):
        amount = usage.get(name)
        if not isinstance(amount, int) or amount < 0:
            raise shared.ProbeFailure(f"invalid usage field: {name}")
        normalized[name] = amount
    return normalized


def base_payload(model: str, input_text: str, max_output_tokens: int) -> dict[str, Any]:
    return {
        "model": model,
        "input": input_text,
        "reasoning": {"effort": "none"},
        "max_output_tokens": max_output_tokens,
    }


def probe_non_stream(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    result = request(
        api_key,
        base_payload(model, "Reply with the word ready.", 64),
        timeout,
    )
    value = parse_response(result)
    text = response_text(value)
    if value.get("status") != "completed":
        raise shared.ProbeFailure("non-stream response did not complete")
    return {
        "status": "passed",
        "response_id": response_id(value),
        "output_bytes": len(text.encode()),
        "usage": normalized_usage(value),
    }


def probe_structured(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    payload = base_payload(model, "Return the required object.", 64)
    payload["instructions"] = "Return only the requested structured result."
    payload["text"] = {
        "format": {
            "type": "json_schema",
            "name": "phase0_probe_result",
            "schema": {
                "type": "object",
                "properties": {"ok": {"type": "boolean", "const": True}},
                "required": ["ok"],
                "additionalProperties": False,
            },
        }
    }
    value = parse_response(request(api_key, payload, timeout))
    try:
        structured = json.loads(response_text(value))
    except json.JSONDecodeError as error:
        raise shared.ProbeFailure("structured output is invalid JSON") from error
    if structured != {"ok": True}:
        raise shared.ProbeFailure("structured output failed exact local validation")
    return {
        "status": "passed",
        "response_id": response_id(value),
        "local_schema_validation": "passed",
        "usage": normalized_usage(value),
    }


def proposal_tool() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "submit_proposal",
        "description": "Submit one side-effect-free proposal.",
        "parameters": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
            "additionalProperties": False,
        },
    }


def function_calls(value: dict[str, Any]) -> list[dict[str, Any]]:
    output = value.get("output")
    if not isinstance(output, list):
        raise shared.ProbeFailure("response output must be a list")
    return [
        item
        for item in output
        if isinstance(item, dict) and item.get("type") == "function_call"
    ]


def probe_tool(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    payload = base_payload(
        model,
        "Call submit_proposal exactly once with summary set to ready.",
        128,
    )
    payload["tools"] = [proposal_tool()]
    payload["tool_choice"] = "required"
    value = parse_response(request(api_key, payload, timeout))
    calls = function_calls(value)
    if len(calls) != 1 or calls[0].get("name") != "submit_proposal":
        raise shared.ProbeFailure("response must contain one allowed function call")
    try:
        arguments = json.loads(calls[0]["arguments"])
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise shared.ProbeFailure("function arguments are invalid JSON") from error
    if set(arguments) != {"summary"} or not isinstance(arguments["summary"], str):
        raise shared.ProbeFailure("function arguments failed local schema validation")
    return {
        "status": "passed",
        "response_id": response_id(value),
        "proposal_count": 1,
        "local_schema_validation": "passed",
        "usage": normalized_usage(value),
    }


def probe_tool_none(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    payload = base_payload(model, "Reply with the word ready.", 64)
    payload["tools"] = [proposal_tool()]
    payload["tool_choice"] = "none"
    value = parse_response(request(api_key, payload, timeout))
    if function_calls(value):
        raise shared.ProbeFailure("response called a tool while tool_choice was none")
    response_text(value)
    return {
        "status": "passed",
        "response_id": response_id(value),
        "usage": normalized_usage(value),
    }


def stream_request(
    *,
    api_key: str,
    payload: dict[str, Any],
    timeout: int,
    cancel_after_activity: bool,
) -> dict[str, Any]:
    connection = http.client.HTTPSConnection(shared.HOST, timeout=timeout)
    started_at = time.monotonic()
    first_activity_at: float | None = None
    output_bytes = 0
    final_response: dict[str, Any] | None = None
    try:
        connection.request(
            "POST",
            PATH,
            body=shared.json_bytes(payload | {"stream": True}),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "AI-Employee-OS-Phase0-Responses-Probe/1",
            },
        )
        response = connection.getresponse()
        if response.status != 200:
            raise shared.ProbeFailure(
                f"unexpected streaming HTTP status: {response.status}"
            )
        while line := response.readline(256 * 1024):
            stripped = line.strip()
            if not stripped.startswith(b"data:"):
                continue
            raw_event = stripped.removeprefix(b"data:").strip()
            try:
                event = json.loads(raw_event)
            except json.JSONDecodeError as error:
                raise shared.ProbeFailure("stream returned invalid JSON event") from error
            if not isinstance(event, dict):
                raise shared.ProbeFailure("stream event root must be an object")
            event_type = event.get("type")
            if event_type in (
                "response.output_text.delta",
                "response.reasoning_text.delta",
                "response.function_call_arguments.delta",
            ) and event.get("delta"):
                first_activity_at = first_activity_at or time.monotonic()
                if event_type == "response.output_text.delta":
                    output_bytes += len(str(event["delta"]).encode())
                if cancel_after_activity:
                    break
            if event_type in (
                "response.completed",
                "response.incomplete",
                "response.failed",
            ):
                response_value = event.get("response")
                if isinstance(response_value, dict):
                    final_response = response_value
                break
    finally:
        connection.close()
    if first_activity_at is None:
        raise shared.ProbeFailure("stream produced no visible or reasoning activity")
    if cancel_after_activity:
        return {
            "status": "passed",
            "cancel_after_first_stream_activity": True,
            "connection_closed_ms": round((time.monotonic() - started_at) * 1000),
            "reasoning_content_logged": False,
            "boundary": "client_connection_closed; provider-side billing stop is not observable",
        }
    if final_response is None or final_response.get("status") != "completed":
        raise shared.ProbeFailure("stream did not end with response.completed")
    if output_bytes == 0:
        raise shared.ProbeFailure("stream produced no visible output delta")
    return {
        "status": "passed",
        "response_id": response_id(final_response),
        "first_delta_ms": round((first_activity_at - started_at) * 1000),
        "output_bytes": output_bytes,
        "normal_completion": True,
        "usage": normalized_usage(final_response),
        "reasoning_content_logged": False,
    }


def probe_stream(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    return stream_request(
        api_key=api_key,
        payload=base_payload(model, "Reply with the word ready.", 64),
        timeout=timeout,
        cancel_after_activity=False,
    )


def probe_cancel(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    payload = base_payload(
        model, "Write a numbered list with one hundred short items.", 256
    )
    payload["reasoning"] = {"effort": "high"}
    return stream_request(
        api_key=api_key,
        payload=payload,
        timeout=timeout,
        cancel_after_activity=True,
    )


def probe_errors(api_key: str, timeout: int) -> dict[str, Any]:
    payload = base_payload(INVALID_MODEL, "ready", 1)
    invalid_model = request(api_key, payload, timeout)
    invalid_auth = request("invalid-phase0-probe-credential", payload, timeout)
    if invalid_model.status < 400 or invalid_auth.status not in (401, 403):
        raise shared.ProbeFailure("provider error probes did not fail as expected")
    return {
        "status": "passed",
        "invalid_model": shared.error_shape(invalid_model),
        "invalid_auth": shared.error_shape(invalid_auth),
        "rate_limit_and_balance": "not_forced_to_avoid_account_or_service_harm",
    }


def checked(stage: str, operation: Callable[[], Any]) -> Any:
    try:
        return operation()
    except shared.ProbeFailure as error:
        raise shared.ProbeFailure(f"{stage}: {error}") from error


def main() -> int:
    args = parse_args()
    try:
        shared.require_safe_args(args)
        api_key = shared.read_api_key(args)
        results = {
            "schema_version": "ai-employee-os.phase0.deepseek-responses-probe/v1",
            "probed_at": datetime.now(UTC).isoformat(),
            "provider": "deepseek",
            "model": args.model,
            "endpoint": f"https://{shared.HOST}{PATH}",
            "credential_logged": False,
            "response_text_logged": False,
            "reasoning_content_logged": False,
            "non_stream": checked(
                "non_stream",
                lambda: probe_non_stream(api_key, args.model, args.timeout_seconds),
            ),
            "stream": checked(
                "stream",
                lambda: probe_stream(api_key, args.model, args.timeout_seconds),
            ),
            "structured": checked(
                "structured",
                lambda: probe_structured(api_key, args.model, args.timeout_seconds),
            ),
            "tool_proposal": checked(
                "tool_proposal",
                lambda: probe_tool(api_key, args.model, args.timeout_seconds),
            ),
            "tool_forbidden": checked(
                "tool_forbidden",
                lambda: probe_tool_none(api_key, args.model, args.timeout_seconds),
            ),
            "cancellation": checked(
                "cancellation",
                lambda: probe_cancel(api_key, args.model, args.timeout_seconds),
            ),
            "errors": checked(
                "errors", lambda: probe_errors(api_key, args.timeout_seconds)
            ),
        }
        print(json.dumps(results, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except shared.ProbeFailure as error:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "reason": str(error),
                    "credential_logged": False,
                    "response_text_logged": False,
                    "reasoning_content_logged": False,
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1
    except Exception as error:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "reason": "unexpected probe failure; sensitive details suppressed",
                    "credential_logged": False,
                    "response_text_logged": False,
                    "reasoning_content_logged": False,
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
