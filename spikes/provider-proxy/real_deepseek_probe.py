#!/usr/bin/env python3
"""Explicit, low-budget DeepSeek capability probe for the Phase 0 gate.

The API key is read from a TTY with getpass. It is never accepted through an
argument or environment variable, and response text is never printed.
"""

from __future__ import annotations

import argparse
import getpass
import http.client
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


HOST = "api.deepseek.com"
PATH = "/chat/completions"
INVALID_MODEL = "__ai_employee_os_invalid_model__"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class ProbeFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class HttpResult:
    status: int
    headers: dict[str, str]
    body: bytes

    @property
    def request_id(self) -> str | None:
        for name in ("x-request-id", "request-id", "cf-ray"):
            if value := self.headers.get(name):
                return value
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the low-budget real DeepSeek Phase 0 capability probe."
    )
    parser.add_argument("--model", required=True, help="Exact model ID to probe.")
    parser.add_argument(
        "--acknowledge-paid-request",
        action="store_true",
        help="Required acknowledgement that this probe can consume account balance.",
    )
    parser.add_argument(
        "--timeout-seconds", type=int, default=30, help="Per-request timeout."
    )
    parser.add_argument(
        "--keychain-service",
        help="Read the API key from this macOS generic-password service instead of a TTY.",
    )
    return parser.parse_args()


def require_safe_args(args: argparse.Namespace) -> None:
    if not args.acknowledge_paid_request:
        raise ProbeFailure(
            "paid request not acknowledged; rerun with --acknowledge-paid-request"
        )
    if args.keychain_service is None and not sys.stdin.isatty():
        raise ProbeFailure("API key input requires an interactive TTY")
    if not args.model.strip() or args.model == INVALID_MODEL:
        raise ProbeFailure("an exact valid model ID is required")
    if not 5 <= args.timeout_seconds <= 120:
        raise ProbeFailure("timeout must be between 5 and 120 seconds")


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def read_api_key(args: argparse.Namespace) -> str:
    if args.keychain_service is None:
        api_key = getpass.getpass("DeepSeek API key (input hidden): ").strip()
    else:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-s",
                args.keychain_service,
                "-w",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ProbeFailure("Keychain credential could not be read")
        api_key = result.stdout.rstrip("\n")
    if not api_key:
        raise ProbeFailure("API key is empty")
    return api_key


def request_json(
    *, api_key: str, payload: dict[str, Any], timeout: int, path: str = PATH
) -> HttpResult:
    connection = http.client.HTTPSConnection(HOST, timeout=timeout)
    try:
        connection.request(
            "POST",
            path,
            body=json_bytes(payload),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "AI-Employee-OS-Phase0-Probe/1",
            },
        )
        response = connection.getresponse()
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise ProbeFailure("provider response exceeded safety limit")
        return HttpResult(
            status=response.status,
            headers={name.lower(): value for name, value in response.getheaders()},
            body=body,
        )
    finally:
        connection.close()


def parse_json_response(result: HttpResult, expected_status: int = 200) -> dict[str, Any]:
    if result.status != expected_status:
        raise ProbeFailure(f"unexpected provider HTTP status: {result.status}")
    try:
        value = json.loads(result.body)
    except json.JSONDecodeError as error:
        raise ProbeFailure("provider returned invalid JSON") from error
    if not isinstance(value, dict):
        raise ProbeFailure("provider response root must be an object")
    return value


def response_text(value: dict[str, Any]) -> str:
    try:
        text = value["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise ProbeFailure("provider response has no assistant content") from error
    if not isinstance(text, str) or not text:
        raise ProbeFailure("provider assistant content is empty")
    return text


def normalized_usage(value: dict[str, Any]) -> dict[str, int]:
    usage = value.get("usage")
    if not isinstance(usage, dict):
        raise ProbeFailure("provider response has no usage object")
    normalized: dict[str, int] = {}
    for source, target in (
        ("prompt_tokens", "input_tokens"),
        ("completion_tokens", "output_tokens"),
        ("total_tokens", "total_tokens"),
    ):
        amount = usage.get(source)
        if not isinstance(amount, int) or amount < 0:
            raise ProbeFailure(f"invalid usage field: {source}")
        normalized[target] = amount
    return normalized


def probe_non_stream(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    result = request_json(
        api_key=api_key,
        timeout=timeout,
        payload={
            "model": model,
            "messages": [{"role": "user", "content": "Reply with the word ready."}],
            "max_tokens": 64,
            "temperature": 0,
            "stream": False,
        },
    )
    value = parse_json_response(result)
    text = response_text(value)
    return {
        "status": "passed",
        "request_id": result.request_id,
        "output_bytes": len(text.encode()),
        "usage": normalized_usage(value),
    }


def probe_structured(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    result = request_json(
        api_key=api_key,
        timeout=timeout,
        payload={
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "Return valid JSON only. The object must contain ok=true and no other fields.",
                },
                {"role": "user", "content": "Return the required object."},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": 64,
            "temperature": 0,
            "stream": False,
        },
    )
    value = parse_json_response(result)
    text = response_text(value)
    try:
        structured = json.loads(text)
    except json.JSONDecodeError as error:
        raise ProbeFailure("structured output is not valid JSON") from error
    if structured != {"ok": True}:
        raise ProbeFailure("structured output failed the local exact-schema check")
    return {
        "status": "passed",
        "request_id": result.request_id,
        "local_schema_validation": "passed",
        "usage": normalized_usage(value),
    }


def proposal_tool() -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": "submit_proposal",
            "description": "Submit one side-effect-free proposal.",
            "parameters": {
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
                "additionalProperties": False,
            },
        },
    }


def probe_tool(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    result = request_json(
        api_key=api_key,
        timeout=timeout,
        payload={
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": "You must call submit_proposal exactly once with summary set to ready. Do not answer in text.",
                }
            ],
            "tools": [proposal_tool()],
            "tool_choice": "auto",
            "max_tokens": 128,
            "temperature": 0,
            "stream": False,
        },
    )
    value = parse_json_response(result)
    try:
        calls = value["choices"][0]["message"]["tool_calls"]
    except (KeyError, IndexError, TypeError) as error:
        raise ProbeFailure("provider response has no tool proposal") from error
    if not isinstance(calls, list) or len(calls) != 1:
        raise ProbeFailure("provider must return exactly one tool proposal")
    function = calls[0].get("function", {})
    if function.get("name") != "submit_proposal":
        raise ProbeFailure("provider proposed an unknown tool")
    try:
        arguments = json.loads(function["arguments"])
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ProbeFailure("tool arguments are invalid JSON") from error
    if set(arguments) != {"summary"} or not isinstance(arguments["summary"], str):
        raise ProbeFailure("tool arguments failed local schema validation")
    return {
        "status": "passed",
        "request_id": result.request_id,
        "proposal_count": 1,
        "local_schema_validation": "passed",
        "usage": normalized_usage(value),
    }


def probe_tool_none(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    result = request_json(
        api_key=api_key,
        timeout=timeout,
        payload={
            "model": model,
            "messages": [{"role": "user", "content": "Reply with the word ready."}],
            "tools": [proposal_tool()],
            "tool_choice": "none",
            "max_tokens": 64,
            "temperature": 0,
            "stream": False,
        },
    )
    value = parse_json_response(result)
    choices = value.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ProbeFailure("provider response has no assistant choice")
    message = choices[0].get("message", {})
    if message.get("tool_calls"):
        raise ProbeFailure("provider called a tool while tool_choice was none")
    response_text(value)
    return {
        "status": "passed",
        "request_id": result.request_id,
        "usage": normalized_usage(value),
    }


def probe_stream(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    connection = http.client.HTTPSConnection(HOST, timeout=timeout)
    started_at = time.monotonic()
    first_delta_at: float | None = None
    output_bytes = 0
    usage: dict[str, int] | None = None
    completed = False
    request_id: str | None = None
    try:
        connection.request(
            "POST",
            PATH,
            body=json_bytes(
                {
                    "model": model,
                    "messages": [
                        {"role": "user", "content": "Reply with the word ready."}
                    ],
                    "max_tokens": 64,
                    "temperature": 0,
                    "stream": True,
                    "stream_options": {"include_usage": True},
                }
            ),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "AI-Employee-OS-Phase0-Probe/1",
            },
        )
        response = connection.getresponse()
        if response.status != 200:
            raise ProbeFailure(f"unexpected streaming HTTP status: {response.status}")
        headers = {name.lower(): value for name, value in response.getheaders()}
        request_id = next(
            (headers[name] for name in ("x-request-id", "request-id", "cf-ray") if name in headers),
            None,
        )
        while line := response.readline(256 * 1024):
            stripped = line.strip()
            if not stripped or stripped.startswith(b":"):
                continue
            if not stripped.startswith(b"data:"):
                continue
            payload = stripped.removeprefix(b"data:").strip()
            if payload == b"[DONE]":
                completed = True
                break
            try:
                event = json.loads(payload)
            except json.JSONDecodeError as error:
                raise ProbeFailure("stream returned invalid JSON event") from error
            if not isinstance(event, dict):
                raise ProbeFailure("stream event root must be an object")
            choices = event.get("choices") or []
            if choices:
                delta = choices[0].get("delta", {}).get("content")
                if isinstance(delta, str) and delta:
                    first_delta_at = first_delta_at or time.monotonic()
                    output_bytes += len(delta.encode())
            if isinstance(event.get("usage"), dict):
                usage = normalized_usage(event)
    finally:
        connection.close()
    if not completed or first_delta_at is None or output_bytes == 0 or usage is None:
        raise ProbeFailure("stream did not produce delta, usage, and normal completion")
    return {
        "status": "passed",
        "request_id": request_id,
        "first_delta_ms": round((first_delta_at - started_at) * 1000),
        "output_bytes": output_bytes,
        "normal_completion": True,
        "usage": usage,
    }


def probe_cancel(api_key: str, model: str, timeout: int) -> dict[str, Any]:
    connection = http.client.HTTPSConnection(HOST, timeout=timeout)
    started_at = time.monotonic()
    stream_activity_observed = False
    request_id: str | None = None
    try:
        connection.request(
            "POST",
            PATH,
            body=json_bytes(
                {
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": "Write a numbered list with one hundred short items.",
                        }
                    ],
                    "max_tokens": 256,
                    "stream": True,
                }
            ),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "AI-Employee-OS-Phase0-Probe/1",
            },
        )
        response = connection.getresponse()
        if response.status != 200:
            raise ProbeFailure(f"unexpected cancellation HTTP status: {response.status}")
        headers = {name.lower(): value for name, value in response.getheaders()}
        request_id = next(
            (headers[name] for name in ("x-request-id", "request-id", "cf-ray") if name in headers),
            None,
        )
        while line := response.readline(256 * 1024):
            stripped = line.strip()
            if not stripped.startswith(b"data:"):
                continue
            payload = stripped.removeprefix(b"data:").strip()
            if payload == b"[DONE]":
                break
            try:
                event = json.loads(payload)
            except json.JSONDecodeError:
                continue
            choices = event.get("choices") or []
            if choices:
                delta = choices[0].get("delta", {})
                if isinstance(delta, dict) and (
                    delta.get("content") or delta.get("reasoning_content")
                ):
                    stream_activity_observed = True
                    break
    finally:
        connection.close()
    if not stream_activity_observed:
        raise ProbeFailure("cancellation probe saw no streamed activity")
    return {
        "status": "passed",
        "request_id": request_id,
        "cancel_after_first_stream_activity": True,
        "reasoning_content_logged": False,
        "connection_closed_ms": round((time.monotonic() - started_at) * 1000),
        "boundary": "client_connection_closed; provider-side billing stop is not observable",
    }


def error_shape(result: HttpResult) -> dict[str, Any]:
    error_code: str | None = None
    error_type: str | None = None
    try:
        value = json.loads(result.body)
        error = value.get("error") if isinstance(value, dict) else None
        if isinstance(error, dict):
            if isinstance(error.get("code"), str):
                error_code = error["code"]
            if isinstance(error.get("type"), str):
                error_type = error["type"]
    except json.JSONDecodeError:
        pass
    return {
        "http_status": result.status,
        "error_code": error_code,
        "error_type": error_type,
        "request_id": result.request_id,
        "raw_error_body_logged": False,
    }


def probe_errors(api_key: str, timeout: int) -> dict[str, Any]:
    invalid_model = request_json(
        api_key=api_key,
        timeout=timeout,
        payload={
            "model": INVALID_MODEL,
            "messages": [{"role": "user", "content": "ready"}],
            "max_tokens": 1,
        },
    )
    invalid_auth = request_json(
        api_key="invalid-phase0-probe-credential",
        timeout=timeout,
        payload={
            "model": INVALID_MODEL,
            "messages": [{"role": "user", "content": "ready"}],
            "max_tokens": 1,
        },
    )
    if invalid_model.status < 400 or invalid_auth.status not in (401, 403):
        raise ProbeFailure("provider error probes did not fail as expected")
    return {
        "status": "passed",
        "invalid_model": error_shape(invalid_model),
        "invalid_auth": error_shape(invalid_auth),
        "rate_limit_and_balance": "not_forced_to_avoid_account_or_service_harm",
    }


def main() -> int:
    args = parse_args()
    try:
        require_safe_args(args)
        api_key = read_api_key(args)
        def checked(stage: str, operation: Any) -> Any:
            try:
                return operation()
            except ProbeFailure as error:
                raise ProbeFailure(f"{stage}: {error}") from error

        results = {
            "schema_version": "ai-employee-os.phase0.deepseek-probe/v1",
            "probed_at": datetime.now(UTC).isoformat(),
            "provider": "deepseek",
            "model": args.model,
            "endpoint": f"https://{HOST}{PATH}",
            "credential_logged": False,
            "response_text_logged": False,
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
    except ProbeFailure as error:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "reason": str(error),
                    "credential_logged": False,
                    "response_text_logged": False,
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1
    except Exception as error:  # Keep unexpected provider/library details out of logs.
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "reason": "unexpected probe failure; sensitive details suppressed",
                    "credential_logged": False,
                    "response_text_logged": False,
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
